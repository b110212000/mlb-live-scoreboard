import { DurableObject } from "cloudflare:workers";
import {
  fetchGameSnapshot,
  isFinalGame,
  isLiveGame,
  scoringSummary
} from "./mlb.js";
import { sendScorePush } from "./push.js";

const LIVE_INTERVAL_MS = 5_000;
const IDLE_INTERVAL_MS = 30_000;
const ERROR_RETRY_MS = 30_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export class GameMonitor extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
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

    if (request.method === "GET" && url.pathname === "/status") {
      return this.status();
    }

    return json({ error: "NOT_FOUND" }, 404);
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

    return json({
      ok: true,
      ...result
    });
  }

  async stopMonitor() {
    await this.ctx.storage.put("monitorEnabled", false);

    const subscribers = await this.ctx.storage.get("subscribers") || [];
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
    const subscription = body.subscription;

    if (!Number.isInteger(gamePk) || gamePk <= 0) {
      return json({ error: "INVALID_GAME_PK" }, 400);
    }

    await this.ctx.storage.put("gamePk", gamePk);

    if (subscription?.endpoint) {
      const subscribers = await this.ctx.storage.get("subscribers") || [];
      const next = subscribers.filter(item => item?.endpoint !== subscription.endpoint);
      next.push(subscription);
      await this.ctx.storage.put("subscribers", next);
    }

    const currentAlarm = await this.ctx.storage.getAlarm();
    if (currentAlarm == null) {
      await this.ctx.storage.setAlarm(Date.now() + 1_000);
    }

    const subscribers = await this.ctx.storage.get("subscribers") || [];
    return json({
      ok: true,
      gamePk,
      subscribers: subscribers.length,
      monitoring: true
    });
  }

  async unwatch(request) {
    const body = await request.json().catch(() => ({}));
    const endpoint = body?.endpoint;

    if (!endpoint) {
      return json({ error: "ENDPOINT_REQUIRED" }, 400);
    }

    const subscribers = await this.ctx.storage.get("subscribers") || [];
    const next = subscribers.filter(item => item?.endpoint !== endpoint);
    await this.ctx.storage.put("subscribers", next);

    const monitorEnabled = await this.ctx.storage.get("monitorEnabled") === true;
    if (next.length === 0 && !monitorEnabled) {
      await this.ctx.storage.deleteAlarm();
    }

    return json({
      ok: true,
      subscribers: next.length,
      monitoring: monitorEnabled || next.length > 0
    });
  }

  async status() {
    const [
      gamePk,
      monitorEnabled,
      subscribers,
      lastSnapshot,
      lastScoringCount,
      lastScoringIndex,
      lastScoringSummary,
      lastCheckedAt,
      lastError,
      currentAlarm
    ] = await Promise.all([
      this.ctx.storage.get("gamePk"),
      this.ctx.storage.get("monitorEnabled"),
      this.ctx.storage.get("subscribers"),
      this.ctx.storage.get("lastSnapshot"),
      this.ctx.storage.get("lastScoringCount"),
      this.ctx.storage.get("lastScoringIndex"),
      this.ctx.storage.get("lastScoringSummary"),
      this.ctx.storage.get("lastCheckedAt"),
      this.ctx.storage.get("lastError"),
      this.ctx.storage.getAlarm()
    ]);

    const subscriberCount = Array.isArray(subscribers) ? subscribers.length : 0;

    return json({
      gamePk: gamePk ?? null,
      monitoring: monitorEnabled === true || subscriberCount > 0,
      monitorEnabled: monitorEnabled === true,
      subscribers: subscriberCount,
      lastScoringCount: lastScoringCount ?? 0,
      lastScoringIndex: lastScoringIndex ?? null,
      lastScoringSummary: lastScoringSummary ?? null,
      lastCheckedAt: lastCheckedAt ?? null,
      lastError: lastError ?? null,
      nextAlarmAt: currentAlarm ?? null,
      lastSnapshot: lastSnapshot ?? null
    });
  }

  async checkGame({ scheduleNext = true } = {}) {
    const gamePk = await this.ctx.storage.get("gamePk");
    if (!gamePk) {
      throw new Error("MONITOR_NOT_INITIALIZED");
    }

    try {
      const snapshot = await fetchGameSnapshot(gamePk);
      const storedCount = await this.ctx.storage.get("lastScoringCount");
      const previousCount = storedCount == null
        ? snapshot.scoringCount
        : Number(storedCount);

      const scoring = scoringSummary(snapshot);

      await this.ctx.storage.put({
        lastSnapshot: {
          abstractState: snapshot.abstractState,
          detailedState: snapshot.detailedState,
          awayScore: snapshot.awayScore,
          homeScore: snapshot.homeScore,
          currentInning: snapshot.currentInning,
          inningState: snapshot.inningState
        },
        lastScoringCount: snapshot.scoringCount,
        lastScoringIndex: snapshot.latestScoringIndex,
        lastScoringSummary: scoring,
        lastCheckedAt: new Date().toISOString(),
        lastError: null
      });

      const subscribers = await this.ctx.storage.get("subscribers") || [];
      if (storedCount != null && snapshot.scoringCount > previousCount && subscribers.length > 0) {
        await sendScorePush({
          gamePk,
          subscribers,
          scoring
        });
      }

      const final = isFinalGame(snapshot);
      const live = isLiveGame(snapshot);

      if (final) {
        await this.ctx.storage.put("monitorEnabled", false);
        await this.ctx.storage.deleteAlarm();
      } else if (scheduleNext) {
        const monitorEnabled = await this.ctx.storage.get("monitorEnabled") === true;
        if (monitorEnabled || subscribers.length > 0) {
          await this.ctx.storage.setAlarm(
            Date.now() + (live ? LIVE_INTERVAL_MS : IDLE_INTERVAL_MS)
          );
        }
      }

      return {
        gamePk,
        live,
        final,
        newScoringPlay: storedCount != null && snapshot.scoringCount > previousCount,
        snapshot: {
          abstractState: snapshot.abstractState,
          detailedState: snapshot.detailedState,
          awayScore: snapshot.awayScore,
          homeScore: snapshot.homeScore,
          currentInning: snapshot.currentInning,
          inningState: snapshot.inningState,
          scoringCount: snapshot.scoringCount,
          latestScoringIndex: snapshot.latestScoringIndex
        }
      };
    } catch (error) {
      const message = error?.message || String(error);
      await this.ctx.storage.put({
        lastCheckedAt: new Date().toISOString(),
        lastError: message
      });

      if (scheduleNext) {
        const monitorEnabled = await this.ctx.storage.get("monitorEnabled") === true;
        const subscribers = await this.ctx.storage.get("subscribers") || [];
        if (monitorEnabled || subscribers.length > 0) {
          await this.ctx.storage.setAlarm(Date.now() + ERROR_RETRY_MS);
        }
      }

      throw error;
    }
  }

  async alarm() {
    const gamePk = await this.ctx.storage.get("gamePk");
    const monitorEnabled = await this.ctx.storage.get("monitorEnabled") === true;
    const subscribers = await this.ctx.storage.get("subscribers") || [];

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
