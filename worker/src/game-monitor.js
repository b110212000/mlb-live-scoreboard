import { DurableObject } from "cloudflare:workers";
import {
  fetchGameSnapshot,
  isFinalGame,
  isLiveGame
} from "./mlb.js";

const LIVE_INTERVAL_MS = 5_000;
const IDLE_INTERVAL_MS = 30_000;
const ERROR_RETRY_MS = 30_000;
const PREGAME_NOTICE_MS = 5 * 60_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function publicSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    gamePk: snapshot.gamePk ?? null,
    gameDate: snapshot.gameDate || "",
    abstractState: snapshot.abstractState || "",
    detailedState: snapshot.detailedState || "",
    awayName: snapshot.awayName || "客隊",
    homeName: snapshot.homeName || "主隊",
    awayScore: Number(snapshot.awayScore ?? 0),
    homeScore: Number(snapshot.homeScore ?? 0),
    currentInning: snapshot.currentInning ?? null,
    inningState: snapshot.inningState || ""
  };
}

function subscriptionEndpoint(item) {
  return item?.subscription?.endpoint || item?.endpoint || "";
}

function normalizeSubscriber(item) {
  if (!item) return null;

  // 舊版曾直接把 PushSubscription 存在 subscribers 陣列，這裡保留相容。
  const subscription = item.subscription?.endpoint ? item.subscription : item;
  if (!subscription?.endpoint) return null;

  return {
    deviceId: item.deviceId || null,
    endpoint: subscription.endpoint,
    subscription,
    sent: {
      // 舊訂閱不補發成功通知，新訂閱明確以 false 建立。
      subscription: item.sent?.subscription !== false,
      pregame5: Boolean(item.sent?.pregame5),
      start: Boolean(item.sent?.start),
      final: Boolean(item.sent?.final)
    },
    lastScore: item.lastScore || null,
    createdAt: item.createdAt || new Date().toISOString()
  };
}

function teamLabel(snapshot) {
  return `${snapshot.awayName || "客隊"} vs ${snapshot.homeName || "主隊"}`;
}

function inningLabel(snapshot) {
  const n = Number(snapshot.currentInning);
  if (!Number.isFinite(n) || n <= 0) return "";
  const state = String(snapshot.inningState || "").toLowerCase();
  const half = snapshot.isTopInning === true || state.includes("top")
    ? "上"
    : snapshot.isTopInning === false || state.includes("bottom")
      ? "下"
      : "";
  return `${n} 局${half}`;
}

export class GameMonitor extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.operation = Promise.resolve();
  }

  async exclusive(action) {
    const operation = this.operation.then(action);
    this.operation = operation.catch(() => {});
    return operation;
  }

  async fetch(request) {
    return this.exclusive(() => this.handleRequest(request));
  }

  async handleRequest(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/monitor/start") {
      return this.startMonitor(request);
    }

    if (request.method === "POST" && url.pathname === "/monitor/check") {
      return this.manualCheck();
    }

    if (request.method === "DELETE" && url.pathname === "/monitor") {
      return this.stopMonitor();
    }

    if (request.method === "POST" && url.pathname === "/watch") {
      return this.watch(request);
    }

    if (request.method === "DELETE" && url.pathname === "/watch") {
      return this.unwatch(request);
    }

    if (request.method === "GET" && url.pathname === "/watch/status") {
      return this.watchStatus(request);
    }

    if (request.method === "GET" && url.pathname === "/status") {
      return this.status();
    }

    return json({ error: "NOT_FOUND" }, 404);
  }

  async getSubscribers() {
    const raw = await this.ctx.storage.get("subscribers") || [];
    return raw.map(normalizeSubscriber).filter(Boolean);
  }

  async putSubscribers(subscribers) {
    await this.ctx.storage.put("subscribers", subscribers);
  }

  async startMonitor(request) {
    const body = await request.json().catch(() => ({}));
    const gamePk = Number(body.gamePk);

    if (!Number.isInteger(gamePk) || gamePk <= 0) {
      return json({ error: "INVALID_GAME_PK" }, 400);
    }

    await this.ctx.storage.put({
      gamePk,
      monitorEnabled: true
    });

    const result = await this.checkGame({ scheduleNext: true });

    return json({
      ok: true,
      monitoring: true,
      ...result
    });
  }

  async manualCheck() {
    const gamePk = await this.ctx.storage.get("gamePk");
    if (!gamePk) {
      return json({ error: "MONITOR_NOT_INITIALIZED" }, 409);
    }

    const result = await this.checkGame({ scheduleNext: false });
    return json({ ok: true, ...result });
  }

  async stopMonitor() {
    await this.ctx.storage.put("monitorEnabled", false);

    const subscribers = await this.getSubscribers();
    if (subscribers.length === 0) {
      await this.ctx.storage.deleteAlarm();
    }

    return json({
      ok: true,
      monitoring: subscribers.length > 0,
      subscribers: subscribers.length
    });
  }

  async watch(request) {
    const body = await request.json().catch(() => ({}));
    const gamePk = Number(body.gamePk);
    const deviceId = String(body.deviceId || "").trim();
    const subscription = body.subscription;

    if (!Number.isInteger(gamePk) || gamePk <= 0) {
      return json({ error: "INVALID_GAME_PK" }, 400);
    }

    if (!deviceId) {
      return json({ error: "DEVICE_ID_REQUIRED" }, 400);
    }

    if (!subscription?.endpoint) {
      return json({ error: "PUSH_SUBSCRIPTION_REQUIRED" }, 400);
    }

    const snapshot = await fetchGameSnapshot(gamePk);
    if (isFinalGame(snapshot)) {
      return json({ error: "GAME_FINAL", final: true }, 409);
    }

    await this.ctx.storage.put("gamePk", gamePk);

    let subscribers = await this.getSubscribers();
    const hadSubscribers = subscribers.length > 0;
    const existing = subscribers.find(item =>
      item.deviceId === deviceId || item.endpoint === subscription.endpoint
    );

    const live = isLiveGame(snapshot);
    const gameTime = Date.parse(snapshot.gameDate || "");
    const now = Date.now();

    const subscriber = {
      deviceId,
      endpoint: subscription.endpoint,
      subscription,
      sent: existing?.sent || {
        subscription: false,
        pregame5: live || (Number.isFinite(gameTime) && now >= gameTime),
        start: live,
        final: false
      },
      lastScore: existing?.lastScore || { awayScore: snapshot.awayScore, homeScore: snapshot.homeScore },
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    subscribers = subscribers.filter(item =>
      item.deviceId !== deviceId && item.endpoint !== subscription.endpoint
    );
    subscribers.push(subscriber);
    await this.putSubscribers(subscribers);

    const previous = await this.ctx.storage.get("lastSnapshot");
    if (!previous || !hadSubscribers) {
      // 第一位訂閱者以「現在」作為比分基準，避免補送訂閱前已發生的得分。
      await this.ctx.storage.put("lastSnapshot", snapshot);
    }

    // 立即檢查一次：若使用者剛好在開賽前 5 分鐘內訂閱，可立刻收到提醒。
    const result = await this.checkGame({ scheduleNext: true });

    return json({
      ok: true,
      gamePk,
      subscribed: true,
      subscribers: (await this.getSubscribers()).length,
      monitoring: true,
      snapshot: result.snapshot
    });
  }

  async unwatch(request) {
    const body = await request.json().catch(() => ({}));
    const deviceId = String(body.deviceId || "").trim();
    const endpoint = String(body.endpoint || "").trim();

    if (!deviceId && !endpoint) {
      return json({ error: "DEVICE_OR_ENDPOINT_REQUIRED" }, 400);
    }

    const subscribers = await this.getSubscribers();
    const next = subscribers.filter(item => {
      if (deviceId && item.deviceId === deviceId) return false;
      if (endpoint && item.endpoint === endpoint) return false;
      return true;
    });
    await this.putSubscribers(next);

    const monitorEnabled = await this.ctx.storage.get("monitorEnabled") === true;
    if (next.length === 0 && !monitorEnabled) {
      await this.ctx.storage.deleteAlarm();
    }

    return json({
      ok: true,
      subscribed: false,
      subscribers: next.length,
      monitoring: monitorEnabled || next.length > 0
    });
  }

  async watchStatus(request) {
    const url = new URL(request.url);
    const deviceId = String(url.searchParams.get("deviceId") || "").trim();
    const subscribers = await this.getSubscribers();
    const lastSnapshot = await this.ctx.storage.get("lastSnapshot");

    return json({
      ok: true,
      gamePk: await this.ctx.storage.get("gamePk") || null,
      subscribed: deviceId
        ? subscribers.some(item => item.deviceId === deviceId)
        : false,
      final: isFinalGame(lastSnapshot),
      subscribers: subscribers.length
    });
  }

  async status() {
    const [
      gamePk,
      monitorEnabled,
      lastSnapshot,
      lastCheckedAt,
      lastError,
      currentAlarm
    ] = await Promise.all([
      this.ctx.storage.get("gamePk"),
      this.ctx.storage.get("monitorEnabled"),
      this.ctx.storage.get("lastSnapshot"),
      this.ctx.storage.get("lastCheckedAt"),
      this.ctx.storage.get("lastError"),
      this.ctx.storage.getAlarm()
    ]);

    const subscribers = await this.getSubscribers();

    return json({
      gamePk: gamePk ?? null,
      monitoring: monitorEnabled === true || subscribers.length > 0,
      monitorEnabled: monitorEnabled === true,
      subscribers: subscribers.length,
      lastCheckedAt: lastCheckedAt ?? null,
      lastError: lastError ?? null,
      nextAlarmAt: currentAlarm ?? null,
      lastSnapshot: publicSnapshot(lastSnapshot)
    });
  }

  async push(subscribers, payload) {
    if (!subscribers.length) return { results: [] };

    const id = this.env.PUSH_SERVICE.idFromName("global");
    const stub = this.env.PUSH_SERVICE.get(id);
    const request = new Request("https://push.internal/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subscriptions: subscribers.map(item => item.subscription),
        payload
      })
    });

    const response = await stub.fetch(request);
    if (!response.ok) {
      throw new Error(`PUSH_SERVICE_HTTP_${response.status}`);
    }
    return response.json();
  }

  async sendMarkedEvent(subscribers, flag, payload) {
    const targets = subscribers.filter(item => !item.sent?.[flag]);
    if (!targets.length) return subscribers;

    const result = await this.push(targets, payload);
    const byEndpoint = new Map(
      (result.results || []).map(item => [item.endpoint, item])
    );

    const next = [];
    for (const subscriber of subscribers) {
      const delivery = byEndpoint.get(subscriber.endpoint);
      if (delivery?.expired) continue;

      if (delivery?.ok) {
        subscriber.sent = { ...(subscriber.sent || {}), [flag]: true };
      }
      next.push(subscriber);
    }
    return next;
  }

  async sendScoreEvent(subscribers, snapshot, previous) {
    const targets = subscribers.filter(item => {
      const baseline = item.lastScore || previous || snapshot;
      return Number(baseline.awayScore) !== Number(snapshot.awayScore) ||
        Number(baseline.homeScore) !== Number(snapshot.homeScore);
    });
    if (!targets.length) return subscribers;

    const inning = inningLabel(snapshot);
    const result = await this.push(targets, {
      title: "MLB 比分更新",
      body: `${snapshot.awayName} ${snapshot.awayScore}：${snapshot.homeScore} ${snapshot.homeName}${inning ? " · " + inning : ""}`,
      tag: `game-score-${snapshot.gamePk}-${snapshot.awayScore}-${snapshot.homeScore}-${Date.now()}`,
      url: `./?view=live&gamePk=${snapshot.gamePk}`,
      gamePk: snapshot.gamePk,
      stage: "score"
    });

    const byEndpoint = new Map(
      (result.results || []).map(item => [item.endpoint, item])
    );
    return subscribers.filter(item => {
      const delivery = byEndpoint.get(item.endpoint);
      if (delivery?.expired) return false;
      if (delivery?.ok) item.lastScore = { awayScore: snapshot.awayScore, homeScore: snapshot.homeScore };
      else if (!item.lastScore) item.lastScore = previous || snapshot;
      return true;
    });
  }

  async processNotifications(previous, snapshot, subscribers) {
    let next = subscribers;
    const now = Date.now();
    const live = isLiveGame(snapshot);
    const final = isFinalGame(snapshot);
    const gameTime = Date.parse(snapshot.gameDate || "");

    next = await this.sendMarkedEvent(next, "subscription", {
      title: `${teamLabel(snapshot)}｜訂閱成功`,
      body: "已開啟這場比賽通知：開賽前提醒、比賽開始、比分更新及比賽結束。",
      tag: `game-subscribed-${snapshot.gamePk}`,
      url: `./?view=live&gamePk=${snapshot.gamePk}`,
      gamePk: snapshot.gamePk,
      stage: "subscription"
    });
    await this.putSubscribers(next);

    if (
      !live &&
      !final &&
      Number.isFinite(gameTime) &&
      now >= gameTime - PREGAME_NOTICE_MS &&
      now < gameTime
    ) {
      next = await this.sendMarkedEvent(next, "pregame5", {
        title: "MLB 即將開賽",
        body: `${teamLabel(snapshot)} 將在 5 分鐘內開賽。`,
        tag: `game-pregame-${snapshot.gamePk}`,
        url: `./?view=live&gamePk=${snapshot.gamePk}`,
        gamePk: snapshot.gamePk,
        stage: "pregame5"
      });
    }

    if (live) {
      next = await this.sendMarkedEvent(next, "start", {
        title: "MLB 比賽開始",
        body: `${teamLabel(snapshot)} 已經開賽。`,
        tag: `game-start-${snapshot.gamePk}`,
        url: `./?view=live&gamePk=${snapshot.gamePk}`,
        gamePk: snapshot.gamePk,
        stage: "start"
      });
    }

    // 每個裝置保留已送達的比分；失敗後下次仍會重試。
    next = await this.sendScoreEvent(next, snapshot, previous);
    await this.putSubscribers(next);

    if (final) {
      const ready = next.filter(item => {
        const score = item.lastScore || previous || snapshot;
        return Number(score.awayScore) === Number(snapshot.awayScore) &&
          Number(score.homeScore) === Number(snapshot.homeScore);
      });
      const delivered = await this.sendMarkedEvent(ready, "final", {
        title: "MLB 比賽結束",
        body: `終場：${snapshot.awayName} ${snapshot.awayScore}：${snapshot.homeScore} ${snapshot.homeName}`,
        tag: `game-final-${snapshot.gamePk}`,
        url: `./?view=live&gamePk=${snapshot.gamePk}`,
        gamePk: snapshot.gamePk,
        stage: "final"
      });
      const pendingScore = next.filter(item => !ready.includes(item));
      next = [...pendingScore, ...delivered];
    }

    return next;
  }

  nextAlarmAt(snapshot) {
    const now = Date.now();
    if (isFinalGame(snapshot)) return null;
    if (isLiveGame(snapshot)) return now + LIVE_INTERVAL_MS;

    const gameTime = Date.parse(snapshot.gameDate || "");
    if (Number.isFinite(gameTime)) {
      const pregameAt = gameTime - PREGAME_NOTICE_MS;
      if (now < pregameAt) {
        return pregameAt;
      }
    }

    return now + IDLE_INTERVAL_MS;
  }

  async checkGame({ scheduleNext = true } = {}) {
    const gamePk = await this.ctx.storage.get("gamePk");
    if (!gamePk) {
      throw new Error("MONITOR_NOT_INITIALIZED");
    }

    try {
      const previous = await this.ctx.storage.get("lastSnapshot");
      const snapshot = await fetchGameSnapshot(gamePk);
      let subscribers = await this.getSubscribers();

      if (previous && subscribers.length > 0) {
        subscribers = await this.processNotifications(previous, snapshot, subscribers);
      } else if (subscribers.length > 0) {
        // 首次監控仍允許「開賽前 5 分鐘」提醒，但不補送過去的開賽或比分事件。
        const baseline = {
          ...snapshot,
          abstractState: isLiveGame(snapshot) ? snapshot.abstractState : "",
          detailedState: isLiveGame(snapshot) ? snapshot.detailedState : "",
          awayScore: snapshot.awayScore,
          homeScore: snapshot.homeScore
        };
        subscribers = await this.processNotifications(baseline, snapshot, subscribers);
      }

      await this.putSubscribers(subscribers);
      await this.ctx.storage.put({
        lastSnapshot: snapshot,
        lastCheckedAt: new Date().toISOString(),
        lastError: null
      });

      const final = isFinalGame(snapshot);
      const live = isLiveGame(snapshot);

      if (final) {
        await this.ctx.storage.put("monitorEnabled", false);
        subscribers = subscribers.filter(item => !item.sent?.final);
        await this.putSubscribers(subscribers);
        const pendingFinal = subscribers.some(item => !item.sent?.final);
        if (pendingFinal) {
          // 推送暫時失敗時保留未完成狀態，稍後重試；成功者不會重複收到。
          await this.ctx.storage.setAlarm(Date.now() + ERROR_RETRY_MS);
        } else {
          // 全部終場通知完成（或訂閱已失效）後清除本場訂閱。
          await this.putSubscribers([]);
          await this.ctx.storage.deleteAlarm();
        }
      } else if (scheduleNext) {
        const monitorEnabled = await this.ctx.storage.get("monitorEnabled") === true;
        if (monitorEnabled || subscribers.length > 0) {
          const scheduledAt = this.nextAlarmAt(snapshot);
          const pendingConfirmation = subscribers.some(item => item.sent?.subscription === false);
          const nextAt = pendingConfirmation
            ? Math.min(scheduledAt ?? Infinity, Date.now() + ERROR_RETRY_MS)
            : scheduledAt;
          if (nextAt != null) await this.ctx.storage.setAlarm(nextAt);
        } else {
          await this.ctx.storage.deleteAlarm();
        }
      }

      return {
        gamePk,
        live,
        final,
        snapshot: publicSnapshot(snapshot)
      };
    } catch (error) {
      const message = error?.message || String(error);
      await this.ctx.storage.put({
        lastCheckedAt: new Date().toISOString(),
        lastError: message
      });

      if (scheduleNext) {
        const monitorEnabled = await this.ctx.storage.get("monitorEnabled") === true;
        const subscribers = await this.getSubscribers();
        if (monitorEnabled || subscribers.length > 0) {
          await this.ctx.storage.setAlarm(Date.now() + ERROR_RETRY_MS);
        }
      }

      throw error;
    }
  }

  async alarm() {
    return this.exclusive(() => this.handleAlarm());
  }

  async handleAlarm() {
    const gamePk = await this.ctx.storage.get("gamePk");
    const monitorEnabled = await this.ctx.storage.get("monitorEnabled") === true;
    const subscribers = await this.getSubscribers();

    if (!gamePk || (!monitorEnabled && subscribers.length === 0)) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    try {
      await this.checkGame({ scheduleNext: true });
    } catch (error) {
      console.error("Game monitor check failed", {
        gamePk,
        message: error?.message || String(error)
      });
    }
  }
}


