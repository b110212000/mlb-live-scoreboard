export { GameMonitor } from "./game-monitor.js";
export { PushService } from "./push-service.js";

function corsHeaders(env) {
  return {
    "access-control-allow-origin": env.FRONTEND_ORIGIN || "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
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
        phase: "game-watch-notifications",
        version: "1.1.1",
        durableObject: "GameMonitor",
        liveIntervalMs: 5000,
        idleIntervalMs: 30000,
        pushEnabled: true,
        pushTestEnabled: true
      }, env);
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
        "GET /api/watch/:gamePk/status"
      ]
    }, env, 404);
  }
};

