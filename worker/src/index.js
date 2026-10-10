import { getGameHighlights } from "./highlights.js";
export { GameMonitor } from "./game-monitor.js";
export { PushService } from "./push-service.js";
export { DeviceRegistry } from "./device-registry.js";

function corsHeaders(env) {
  return {
    "access-control-allow-origin": env.FRONTEND_ORIGIN || "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "Origin"
  };
}

function json(data, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(env),
      "content-type": "application/json; charset=utf-8"
    }
  });
}

async function forwardToGameMonitor(request, env, gamePk, path) {
  const id = env.GAME_MONITOR.idFromName(String(gamePk));
  const stub = env.GAME_MONITOR.get(id);

  const target = new URL(request.url);
  target.pathname = path;

  return stub.fetch(new Request(target.toString(), request));
}

async function forwardToPushService(request, env, path) {
  const id = env.PUSH_SERVICE.idFromName("global");
  const stub = env.PUSH_SERVICE.get(id);

  const target = new URL(request.url);
  target.pathname = path;

  return stub.fetch(new Request(target.toString(), request));
}

// deviceId 由前端產生（UUID）；與既有 /api/watch 相同，持有 deviceId 即可管理該裝置的訂閱。
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

async function forwardToDeviceRegistry(request, env, deviceId, path) {
  const id = env.DEVICE_REGISTRY.idFromName(deviceId);
  const stub = env.DEVICE_REGISTRY.get(id);

  const target = new URL(request.url);
  target.pathname = path;
  target.search = "";
  target.searchParams.set("deviceId", deviceId);

  return stub.fetch(new Request(target.toString(), request));
}

function withCors(response, env) {
  return new Response(response.body, {
    status: response.status,
    headers: {
      ...corsHeaders(env),
      "content-type": "application/json; charset=utf-8"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env)
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "mlb-score-notify",
        phase: "subscription-management",
        version: "2.1.0",
        durableObject: "GameMonitor",
        liveIntervalMs: 5000,
        idleIntervalMs: 30000,
        pushEnabled: true,
        pushTestEnabled: true,
        subscriptionManagement: true,
        highlightsEnabled: Boolean(env.YOUTUBE_API_KEY)
      }, env);
    }

    const highlightsMatch = url.pathname.match(/^\/api\/highlights\/(\d+)$/);
    if (request.method === "GET" && highlightsMatch) {
      const gamePk = Number(highlightsMatch[1]);
      if (!Number.isSafeInteger(gamePk) || gamePk <= 0) return json({error: "INVALID_GAME_PK"}, env, 400);
      try {
        return json(await getGameHighlights(gamePk, caches.default, env), env);
      } catch (error) {
        console.warn("Highlights source unavailable", error.message);
        return json({error: "HIGHLIGHTS_UNAVAILABLE"}, env, 502);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/push/public-key") {
      return withCors(
        await forwardToPushService(request, env, "/public-key"),
        env
      );
    }

    if (request.method === "POST" && url.pathname === "/api/push/test") {
      return withCors(
        await forwardToPushService(request, env, "/test"),
        env
      );
    }

    if (request.method === "GET" && url.pathname === "/api/push/status") {
      return withCors(
        await forwardToPushService(request, env, "/status"),
        env
      );
    }

    if (request.method === "POST" && url.pathname === "/api/monitor/start") {
      const body = await request.clone().json().catch(() => ({}));
      const gamePk = Number(body.gamePk);

      if (!Number.isInteger(gamePk) || gamePk <= 0) {
        return json({ error: "INVALID_GAME_PK" }, env, 400);
      }

      return withCors(
        await forwardToGameMonitor(request, env, gamePk, "/monitor/start"),
        env
      );
    }

    const monitorMatch = url.pathname.match(/^\/api\/monitor\/(\d+)$/);
    if (monitorMatch) {
      const gamePk = Number(monitorMatch[1]);

      if (request.method === "GET") {
        return withCors(
          await forwardToGameMonitor(request, env, gamePk, "/status"),
          env
        );
      }

      if (request.method === "DELETE") {
        return withCors(
          await forwardToGameMonitor(request, env, gamePk, "/monitor"),
          env
        );
      }
    }

    const checkMatch = url.pathname.match(/^\/api\/monitor\/(\d+)\/check$/);
    if (request.method === "POST" && checkMatch) {
      const gamePk = Number(checkMatch[1]);
      return withCors(
        await forwardToGameMonitor(request, env, gamePk, "/monitor/check"),
        env
      );
    }

    if (request.method === "POST" && url.pathname === "/api/watch") {
      const body = await request.clone().json().catch(() => ({}));
      const gamePk = Number(body.gamePk);

      if (!Number.isInteger(gamePk) || gamePk <= 0) {
        return json({ error: "INVALID_GAME_PK" }, env, 400);
      }

      return withCors(
        await forwardToGameMonitor(request, env, gamePk, "/watch"),
        env
      );
    }

    if (request.method === "DELETE" && url.pathname === "/api/watch") {
      const body = await request.clone().json().catch(() => ({}));
      const gamePk = Number(body.gamePk);

      if (!Number.isInteger(gamePk) || gamePk <= 0) {
        return json({ error: "INVALID_GAME_PK" }, env, 400);
      }

      return withCors(
        await forwardToGameMonitor(request, env, gamePk, "/watch"),
        env
      );
    }

    // 訂閱管理：/api/devices/:deviceId/{state|defaults|subscription|games|teams|sync}
    const deviceMatch = url.pathname.match(/^\/api\/devices\/([^/]+)(\/.*)$/);
    if (deviceMatch) {
      const deviceId = deviceMatch[1];
      if (!DEVICE_ID_PATTERN.test(deviceId)) {
        return json({ error: "INVALID_DEVICE_ID" }, env, 400);
      }
      return withCors(
        await forwardToDeviceRegistry(request, env, deviceId, deviceMatch[2]),
        env
      );
    }

    const statusMatch = url.pathname.match(/^\/api\/watch\/(\d+)\/status$/);
    if (request.method === "GET" && statusMatch) {
      const gamePk = Number(statusMatch[1]);
      return withCors(
        await forwardToGameMonitor(request, env, gamePk, "/watch/status"),
        env
      );
    }

    return json({
      error: "NOT_FOUND",
      routes: [
        "GET /health",
        "GET /api/push/public-key",
        "POST /api/push/test",
        "GET /api/push/status",
        "POST /api/monitor/start",
        "GET /api/monitor/:gamePk",
        "POST /api/monitor/:gamePk/check",
        "DELETE /api/monitor/:gamePk",
        "POST /api/watch",
        "DELETE /api/watch",
        "GET /api/watch/:gamePk/status",
        "GET /api/devices/:deviceId/state",
        "PUT /api/devices/:deviceId/defaults",
        "PUT /api/devices/:deviceId/subscription",
        "POST /api/devices/:deviceId/games",
        "DELETE /api/devices/:deviceId/games/:gamePk",
        "PUT /api/devices/:deviceId/games/:gamePk/prefs",
        "POST /api/devices/:deviceId/teams",
        "DELETE /api/devices/:deviceId/teams/:teamId",
        "POST /api/devices/:deviceId/sync"
      ]
    }, env, 404);
  }
};



