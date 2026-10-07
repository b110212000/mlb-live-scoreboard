export { GameMonitor } from "./game-monitor.js";

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
        durableObject: "GameMonitor",
        liveIntervalMs: 5000,
        pushEnabled: false
      }, env);
    }

    if (request.method === "POST" && url.pathname === "/api/watch") {
      const body = await request.clone().json().catch(() => ({}));
      const gamePk = Number(body.gamePk);

      if (!Number.isInteger(gamePk) || gamePk <= 0) {
        return json({ error: "INVALID_GAME_PK" }, env, 400);
      }

      const response = await forwardToGameMonitor(request, env, gamePk, "/watch");
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...corsHeaders(env),
          "content-type": "application/json; charset=utf-8"
        }
      });
    }

    if (request.method === "DELETE" && url.pathname === "/api/watch") {
      const body = await request.clone().json().catch(() => ({}));
      const gamePk = Number(body.gamePk);

      if (!Number.isInteger(gamePk) || gamePk <= 0) {
        return json({ error: "INVALID_GAME_PK" }, env, 400);
      }

      const response = await forwardToGameMonitor(request, env, gamePk, "/watch");
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...corsHeaders(env),
          "content-type": "application/json; charset=utf-8"
        }
      });
    }

    const statusMatch = url.pathname.match(/^\/api\/watch\/(\d+)\/status$/);
    if (request.method === "GET" && statusMatch) {
      const gamePk = Number(statusMatch[1]);
      const response = await forwardToGameMonitor(request, env, gamePk, "/status");
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...corsHeaders(env),
          "content-type": "application/json; charset=utf-8"
        }
      });
    }

    return json({
      error: "NOT_FOUND",
      routes: [
        "GET /health",
        "POST /api/watch",
        "DELETE /api/watch",
        "GET /api/watch/:gamePk/status"
      ]
    }, env, 404);
  }
};
