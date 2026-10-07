import { DurableObject } from "cloudflare:workers";
import {
  fetchGameSnapshot,
  isFinalGame,
  isLiveGame,
  scoringSummary
} from "./mlb.js";
import { sendScorePush } from "./push.js";

const LIVE_INTERVAL_MS = 5_000;
const PREVIEW_INTERVAL_MS = 30_000;

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

    if (next.length === 0) {
      await this.ctx.storage.deleteAlarm();
    }

    return json({
      ok: true,
      subscribers: next.length,
      monitoring: next.length > 0
    });
  }

  async status() {
    const [
      gamePk,
      subscribers,
      lastSnapshot,
      lastScoringCount,
      lastCheckedAt,
      currentAlarm
    ] = await Promise.all([
      this.ctx.storage.get("gamePk"),
      this.ctx.storage.get("subscribers"),
      this.ctx.storage.get("lastSnapshot"),
      this.ctx.storage.get("lastScoringCount"),
      this.ctx.storage.get("lastCheckedAt"),
      this.ctx.storage.getAlarm()
    ]);

    return json({
      gamePk: gamePk ?? null,
      subscribers: Array.isArray(subscribers) ? subscribers.length : 0,
      lastScoringCount: lastScoringCount ?? 0,
      lastCheckedAt: lastCheckedAt ?? null,
      nextAlarmAt: currentAlarm ?? null,
      lastSnapshot: lastSnapshot ?? null
    });
  }

  async alarm() {
    const gamePk = await this.ctx.storage.get("gamePk");
    const subscribers = await this.ctx.storage.get("subscribers") || [];

    if (!gamePk || subscribers.length === 0) {
      return;
    }

    try {
      const snapshot = await fetchGameSnapshot(gamePk);
      const previousCount = Number(
        await this.ctx.storage.get("lastScoringCount") ?? snapshot.scoringCount
      );

      await this.ctx.storage.put({
        lastSnapshot: {
          abstractState: snapshot.abstractState,
          detailedState: snapshot.detailedState,
          awayScore: snapshot.awayScore,
          homeScore: snapshot.homeScore
        },
        lastScoringCount: snapshot.scoringCount,
        lastCheckedAt: new Date().toISOString()
      });

      if (snapshot.scoringCount > previousCount) {
        await sendScorePush({
          gamePk,
          subscribers,
          scoring: scoringSummary(snapshot)
        });
      }

      if (isFinalGame(snapshot)) {
        return;
      }

      const delay = isLiveGame(snapshot)
        ? LIVE_INTERVAL_MS
        : PREVIEW_INTERVAL_MS;

      await this.ctx.storage.setAlarm(Date.now() + delay);
    } catch (error) {
      console.error("Game monitor check failed", {
        gamePk,
        message: error?.message || String(error)
      });

      await this.ctx.storage.setAlarm(Date.now() + 30_000);
    }
  }
}
