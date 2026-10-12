import { DurableObject } from "cloudflare:workers";
import {
  fetchGameSnapshot,
  isCalledOffGame,
  isFinalGame,
  isLiveGame
} from "./mlb.js";
import { normalizePrefs, prefsSummary } from "./prefs.js";
import { inningText, matchupLabel, normalizeLang, scoreLine, snapshotTeams, text } from "./messages.js";

const LIVE_INTERVAL_MS = 5_000;
const IDLE_INTERVAL_MS = 30_000;
const ERROR_RETRY_MS = 30_000;
const PREGAME_NOTICE_MS = 5 * 60_000;
// 只有比賽狀態改變才寫入快照；lastCheckedAt 最多每 5 分鐘寫一次（診斷用）。
const CHECK_PERSIST_MS = 5 * 60_000;

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

// 影響通知判斷的欄位；這些都沒變時不必重寫快照。
function snapshotKey(snapshot) {
  if (!snapshot) return "";
  return JSON.stringify([
    snapshot.abstractState, snapshot.detailedState, snapshot.codedState, snapshot.gameDate,
    snapshot.awayScore, snapshot.homeScore, snapshot.currentInning, snapshot.inningState,
    snapshot.isTopInning, snapshot.scoringCount, snapshot.awayTeamId, snapshot.homeTeamId
  ]);
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
    // 舊訂閱沒有 prefs，normalizePrefs 會補成全部開啟。
    prefs: normalizePrefs(item.prefs),
    // 舊訂閱沒有語言，視為繁體中文。
    lang: normalizeLang(item.lang),
    createdAt: item.createdAt || new Date().toISOString()
  };
}

function wantsPref(item, key) {
  return item?.prefs?.[key] !== false;
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
    this.persistedSubscribers = JSON.stringify(raw);
    return raw.map(normalizeSubscriber).filter(Boolean);
  }

  // 內容沒變就不寫入：每 5 秒的檢查大多沒有變化，可大幅減少 Durable Object 寫入量。
  async putSubscribers(subscribers) {
    const key = JSON.stringify(subscribers);
    if (key === this.persistedSubscribers) return;
    await this.ctx.storage.put("subscribers", subscribers);
    this.persistedSubscribers = key;
  }

  async saveCheck(snapshot, previous) {
    const now = Date.now();
    const patch = {};
    const changed = snapshotKey(snapshot) !== snapshotKey(previous);
    if (changed) patch.lastSnapshot = snapshot;
    if (changed || !this.lastCheckedSavedAt || now - this.lastCheckedSavedAt >= CHECK_PERSIST_MS) {
      patch.lastCheckedAt = new Date(now).toISOString();
    }
    if (await this.ctx.storage.get("lastError")) patch.lastError = null;
    if (Object.keys(patch).length) {
      await this.ctx.storage.put(patch);
      if (patch.lastCheckedAt) this.lastCheckedSavedAt = now;
    }
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
    if (isCalledOffGame(snapshot)) {
      return json({ error: "GAME_CALLED_OFF", calledOff: true }, 409);
    }
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
    const pregamePassed = live || (Number.isFinite(gameTime) && now >= gameTime);

    // 沒帶 prefs（舊版前端）時沿用既有設定；新訂閱預設全部開啟。語言同理（沒帶就沿用，新訂閱為繁體中文）。
    const prefs = normalizePrefs(body.prefs, existing?.prefs);
    const lang = body.lang ? normalizeLang(body.lang) : existing?.lang || "zh";
    const sent = existing?.sent ? { ...existing.sent } : {
      // confirm: false（追蹤球隊自動加入的場次）不發「訂閱成功」通知。
      subscription: body.confirm === false,
      pregame5: pregamePassed,
      start: live,
      final: false
    };
    // 事件已經發生後才打開的項目，不補發過去的通知。
    if (existing && !wantsPref(existing, "pregame5") && prefs.pregame5 && pregamePassed) sent.pregame5 = true;
    if (existing && !wantsPref(existing, "start") && prefs.start && live) sent.start = true;

    const subscriber = {
      deviceId,
      endpoint: subscription.endpoint,
      subscription,
      sent,
      lastScore: existing?.lastScore || { awayScore: snapshot.awayScore, homeScore: snapshot.homeScore },
      prefs,
      lang,
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
      prefs,
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
    const mine = deviceId ? subscribers.find(item => item.deviceId === deviceId) : null;

    return json({
      ok: true,
      gamePk: await this.ctx.storage.get("gamePk") || null,
      subscribed: Boolean(mine),
      prefs: mine ? mine.prefs : null,
      final: isFinalGame(lastSnapshot),
      calledOff: isCalledOffGame(lastSnapshot),
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

  // payload 可以是物件，或依訂閱者產生內容的函式（相同內容會合併成一批送出）。
  async sendMarkedEvent(subscribers, flag, payload, wants = () => true) {
    const targets = subscribers.filter(item => !item.sent?.[flag] && wants(item));
    if (!targets.length) return subscribers;

    const groups = new Map();
    for (const item of targets) {
      const itemPayload = typeof payload === "function" ? payload(item) : payload;
      const key = JSON.stringify(itemPayload);
      if (!groups.has(key)) groups.set(key, { payload: itemPayload, targets: [] });
      groups.get(key).targets.push(item);
    }

    const byEndpoint = new Map();
    for (const group of groups.values()) {
      const result = await this.push(group.targets, group.payload);
      for (const delivery of result.results || []) byEndpoint.set(delivery.endpoint, delivery);
    }

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
    const current = { awayScore: snapshot.awayScore, homeScore: snapshot.homeScore };
    const groups = new Map();

    for (const item of subscribers) {
      const baseline = item.lastScore || previous || snapshot;
      const away = Number(baseline.awayScore) !== Number(snapshot.awayScore);
      const home = Number(baseline.homeScore) !== Number(snapshot.homeScore);
      if (!away && !home) continue;

      if ((away && wantsPref(item, "awayScore")) || (home && wantsPref(item, "homeScore"))) {
        const side = away && home ? "both" : away ? "away" : "home";
        // 同一邊得分、同一種語言的裝置合併成一批送出。
        const key = `${side}|${item.lang}`;
        if (!groups.has(key)) groups.set(key, { side, lang: item.lang, targets: [] });
        groups.get(key).targets.push(item);
      } else {
        // 沒開啟提醒的那隊得分：不通知，但更新比分基準，之後的得分與終場判斷才正確。
        item.lastScore = { ...current };
      }
    }
    if (!groups.size) return subscribers;

    const byEndpoint = new Map();
    for (const { side, lang, targets } of groups.values()) {
      const t = text(lang);
      const names = snapshotTeams(snapshot, lang);
      const inning = inningText(snapshot, lang);
      const result = await this.push(targets, {
        title: side === "away" ? t.scored(names.away)
          : side === "home" ? t.scored(names.home)
            : t.scoreUpdate,
        body: `${scoreLine(snapshot, lang)}${inning ? " · " + inning : ""}`,
        tag: `game-score-${snapshot.gamePk}-${snapshot.awayScore}-${snapshot.homeScore}-${Date.now()}`,
        url: `./?view=live&gamePk=${snapshot.gamePk}`,
        gamePk: snapshot.gamePk,
        stage: "score",
        side
      });
      for (const delivery of result.results || []) byEndpoint.set(delivery.endpoint, delivery);
    }

    return subscribers.filter(item => {
      const delivery = byEndpoint.get(item.endpoint);
      if (delivery?.expired) return false;
      if (delivery?.ok) item.lastScore = { ...current };
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

    next = await this.sendMarkedEvent(next, "subscription", item => ({
      title: text(item.lang).subscribedTitle(matchupLabel(snapshot, item.lang)),
      body: text(item.lang).subscribedBody(prefsSummary(item.prefs, item.lang)),
      tag: `game-subscribed-${snapshot.gamePk}`,
      url: `./?view=live&gamePk=${snapshot.gamePk}`,
      gamePk: snapshot.gamePk,
      stage: "subscription"
    }));
    await this.putSubscribers(next);

    if (
      !live &&
      !final &&
      Number.isFinite(gameTime) &&
      now >= gameTime - PREGAME_NOTICE_MS &&
      now < gameTime
    ) {
      next = await this.sendMarkedEvent(next, "pregame5", item => ({
        title: text(item.lang).pregameTitle,
        body: text(item.lang).pregameBody(matchupLabel(snapshot, item.lang)),
        tag: `game-pregame-${snapshot.gamePk}`,
        url: `./?view=live&gamePk=${snapshot.gamePk}`,
        gamePk: snapshot.gamePk,
        stage: "pregame5"
      }), item => wantsPref(item, "pregame5"));
    }

    if (live) {
      next = await this.sendMarkedEvent(next, "start", item => ({
        title: text(item.lang).startTitle,
        body: text(item.lang).startBody(matchupLabel(snapshot, item.lang)),
        tag: `game-start-${snapshot.gamePk}`,
        url: `./?view=live&gamePk=${snapshot.gamePk}`,
        gamePk: snapshot.gamePk,
        stage: "start"
      }), item => wantsPref(item, "start"));
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
      // 關閉「比賽結束」的裝置直接視為完成，讓本場訂閱可以清除。
      for (const item of ready) {
        if (!wantsPref(item, "final")) item.sent = { ...(item.sent || {}), final: true };
      }
      const delivered = await this.sendMarkedEvent(ready, "final", item => ({
        title: text(item.lang).finalTitle,
        body: text(item.lang).finalBody(scoreLine(snapshot, item.lang)),
        tag: `game-final-${snapshot.gamePk}`,
        url: `./?view=live&gamePk=${snapshot.gamePk}`,
        gamePk: snapshot.gamePk,
        stage: "final"
      }), item => wantsPref(item, "final"));
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

      if (isCalledOffGame(snapshot)) {
        // 延賽、取消或被移出賽程的場次不會再有比分：不發終場通知，直接結束本場監控，
        // 避免 Alarm 每 30 秒輪詢一場永遠不會開打的比賽。
        await this.ctx.storage.put({
          lastSnapshot: snapshot,
          lastCheckedAt: new Date().toISOString(),
          lastError: null,
          monitorEnabled: false
        });
        await this.putSubscribers([]);
        await this.ctx.storage.deleteAlarm();
        return {
          gamePk,
          live: false,
          final: false,
          calledOff: true,
          snapshot: publicSnapshot(snapshot)
        };
      }

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
      await this.saveCheck(snapshot, previous);

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


