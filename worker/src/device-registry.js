import { DurableObject } from "cloudflare:workers";
import { normalizePrefs, samePrefs } from "./prefs.js";

const MLB_API = "https://statsapi.mlb.com/api";
// 與前端相同：本站只涵蓋季後賽。
const POSTSEASON_TYPES = ["F", "D", "L", "W", "P"];
const SYNC_INTERVAL_MS = 60 * 60_000;
const LOOKAHEAD_DAYS = 10;
// 已不在賽程中的場次（沒打成的 if-necessary）在預定時間過後多久從清單移除。
const MISSING_GRACE_MS = 6 * 60 * 60_000;
const MAX_GAMES = 40;
const MAX_DISMISSED = 200;
const MLB_TEAM_IDS = new Set([
  108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 133,
  134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 158
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function validSubscription(value) {
  return Boolean(
    value &&
    typeof value.endpoint === "string" &&
    value.endpoint.startsWith("https://") &&
    value.keys &&
    typeof value.keys.p256dh === "string" &&
    typeof value.keys.auth === "string"
  );
}

function utcDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function scheduleGames(data) {
  return (data?.dates || []).flatMap(date => date?.games || []);
}

function scheduleState(game) {
  const status = game?.status || {};
  const coded = String(status.codedGameState || "").toUpperCase();
  const detailed = String(status.detailedState || "");
  if (coded === "D" || coded === "C" || coded === "X" || /postponed|cancel+ed|unknown/i.test(detailed)) {
    return "calledOff";
  }
  if (/final|game over|completed/i.test(`${status.abstractGameState || ""} ${detailed}`)) return "final";
  return "active";
}

// 每個裝置一個 DeviceRegistry：保存預設提醒項目、追蹤球隊與已訂閱場次。
// 實際推播仍由各場 GameMonitor 負責；這裡只負責「訂閱哪些場次、用什麼提醒項目」。
export class DeviceRegistry extends DurableObject {
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

  async alarm() {
    return this.exclusive(async () => {
      const state = await this.load();
      try {
        await this.sync(state);
      } catch (error) {
        console.error("Device registry sync failed", error?.message || String(error));
        state.lastSyncError = error?.message || String(error);
      }
      await this.save(state);
      await this.scheduleSync(state);
    });
  }

  async handleRequest(request) {
    const url = new URL(request.url);
    const deviceId = String(url.searchParams.get("deviceId") || "").trim();
    if (!deviceId) return json({ error: "DEVICE_ID_REQUIRED" }, 400);

    const state = await this.load();
    if (!state.deviceId) state.deviceId = deviceId;
    if (state.deviceId !== deviceId) return json({ error: "DEVICE_MISMATCH" }, 409);

    const method = request.method;
    const path = url.pathname;
    const body = method === "GET" ? {} : await request.json().catch(() => ({}));

    if (method === "GET" && path === "/state") return json(this.view(state));
    if (method === "PUT" && path === "/defaults") return this.setDefaults(state, body);
    if (method === "PUT" && path === "/subscription") return this.setSubscription(state, body);
    if (method === "POST" && path === "/games") return this.addGame(state, body);
    if (method === "POST" && path === "/teams") return this.followTeam(state, body);
    if (method === "POST" && path === "/sync") return this.manualSync(state);

    const gameMatch = path.match(/^\/games\/(\d+)$/);
    if (method === "DELETE" && gameMatch) return this.removeGame(state, Number(gameMatch[1]));

    const prefsMatch = path.match(/^\/games\/(\d+)\/prefs$/);
    if (method === "PUT" && prefsMatch) return this.setGamePrefs(state, Number(prefsMatch[1]), body);

    const teamMatch = path.match(/^\/teams\/(\d+)$/);
    if (method === "DELETE" && teamMatch) return this.unfollowTeam(state, Number(teamMatch[1]));

    return json({ error: "NOT_FOUND" }, 404);
  }

  async load() {
    const values = await this.ctx.storage.get([
      "deviceId", "subscription", "defaults", "teams", "games", "dismissed", "lastSyncAt", "lastSyncError"
    ]);
    const games = values.get("games");
    return {
      deviceId: values.get("deviceId") || null,
      subscription: values.get("subscription") || null,
      defaults: normalizePrefs(values.get("defaults")),
      teams: Array.isArray(values.get("teams")) ? values.get("teams") : [],
      games: games && typeof games === "object" ? games : {},
      dismissed: Array.isArray(values.get("dismissed")) ? values.get("dismissed") : [],
      lastSyncAt: values.get("lastSyncAt") || null,
      lastSyncError: values.get("lastSyncError") || null
    };
  }

  async save(state) {
    await this.ctx.storage.put({
      deviceId: state.deviceId,
      subscription: state.subscription,
      defaults: state.defaults,
      teams: state.teams,
      games: state.games,
      dismissed: state.dismissed,
      lastSyncAt: state.lastSyncAt,
      lastSyncError: state.lastSyncError
    });
  }

  async scheduleSync(state) {
    if (state.teams.length || Object.keys(state.games).length) {
      await this.ctx.storage.setAlarm(Date.now() + SYNC_INTERVAL_MS);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  view(state, extra = {}) {
    const games = Object.values(state.games)
      .sort((a, b) => (Date.parse(a.gameDate || "") || Infinity) - (Date.parse(b.gameDate || "") || Infinity) || a.gamePk - b.gamePk)
      .map(entry => ({
        gamePk: entry.gamePk,
        source: entry.manual ? "manual" : "team",
        teamIds: entry.teamIds || [],
        custom: Boolean(entry.prefs),
        prefs: normalizePrefs(entry.prefs, state.defaults),
        gameDate: entry.gameDate || null
      }));
    return {
      ok: true,
      defaults: state.defaults,
      teams: state.teams.map(team => ({ teamId: team.teamId, createdAt: team.createdAt })),
      games,
      subscriptionEndpoint: state.subscription?.endpoint || null,
      lastSyncAt: state.lastSyncAt,
      ...extra
    };
  }

  monitor(gamePk) {
    return this.env.GAME_MONITOR.get(this.env.GAME_MONITOR.idFromName(String(gamePk)));
  }

  async watchGame(state, gamePk, { confirm = false } = {}) {
    const entry = state.games[gamePk];
    const response = await this.monitor(gamePk).fetch(new Request("https://game-monitor.internal/watch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gamePk,
        deviceId: state.deviceId,
        subscription: state.subscription,
        prefs: normalizePrefs(entry?.prefs, state.defaults),
        confirm
      })
    }));
    const data = await response.json().catch(() => ({}));
    return { status: response.status, ok: response.ok && data.ok === true, data };
  }

  async unwatchGame(state, gamePk) {
    const response = await this.monitor(gamePk).fetch(new Request("https://game-monitor.internal/watch", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: state.deviceId,
        endpoint: state.subscription?.endpoint || ""
      })
    }));
    return response.ok;
  }

  // 已終場或沒打成的場次不必再同步提醒設定，直接從清單移除。
  async propagate(state, gamePks) {
    const failed = [];
    if (!state.subscription) return failed;
    for (const gamePk of gamePks) {
      try {
        const result = await this.watchGame(state, gamePk);
        if (result.status === 409) delete state.games[gamePk];
        else if (!result.ok) failed.push(gamePk);
      } catch (_) {
        failed.push(gamePk);
      }
    }
    return failed;
  }

  // 瀏覽器的推播訂閱換了（例如重新允許通知），已訂閱的場次要改送到新的 endpoint。
  async adoptSubscription(state, subscription, exceptGamePk = null) {
    if (!validSubscription(subscription)) return [];
    const changed = state.subscription?.endpoint !== subscription.endpoint;
    state.subscription = subscription;
    if (!changed) return [];
    const others = Object.keys(state.games).map(Number).filter(pk => pk !== exceptGamePk);
    return this.propagate(state, others);
  }

  async setDefaults(state, body) {
    state.defaults = normalizePrefs(body.prefs, state.defaults);
    const followers = Object.values(state.games).filter(entry => !entry.prefs).map(entry => entry.gamePk);
    const failed = await this.propagate(state, followers);
    await this.save(state);
    return json(this.view(state, { failed }));
  }

  async setSubscription(state, body) {
    if (!validSubscription(body.subscription)) return json({ error: "INVALID_SUBSCRIPTION" }, 400);
    const failed = await this.adoptSubscription(state, body.subscription);
    await this.save(state);
    return json(this.view(state, { failed }));
  }

  async addGame(state, body) {
    const gamePk = Number(body.gamePk);
    if (!Number.isSafeInteger(gamePk) || gamePk <= 0) return json({ error: "INVALID_GAME_PK" }, 400);
    if (!state.games[gamePk] && Object.keys(state.games).length >= MAX_GAMES) {
      return json({ error: "TOO_MANY_GAMES" }, 409);
    }
    const failed = await this.adoptSubscription(state, body.subscription, gamePk);
    if (!state.subscription) return json({ error: "PUSH_SUBSCRIPTION_REQUIRED" }, 400);

    const existed = Boolean(state.games[gamePk]);
    const entry = state.games[gamePk] || {
      gamePk,
      manual: false,
      teamIds: [],
      prefs: null,
      gameDate: null,
      createdAt: new Date().toISOString()
    };
    entry.manual = true;
    state.games[gamePk] = entry;
    state.dismissed = state.dismissed.filter(pk => pk !== gamePk);

    // import：舊版只存在 GameMonitor 的訂閱搬進清單，不重發「訂閱成功」。
    const result = await this.watchGame(state, gamePk, { confirm: body.import !== true });
    if (!result.ok) {
      if (!existed) delete state.games[gamePk];
      await this.save(state);
      const status = result.status === 409 ? 409 : 502;
      return json({ error: result.data?.error || "WATCH_FAILED", ...this.view(state, { failed }), ok: false }, status);
    }

    entry.gameDate = result.data?.snapshot?.gameDate || entry.gameDate;
    await this.save(state);
    await this.scheduleSync(state);
    return json(this.view(state, { failed }));
  }

  async removeGame(state, gamePk) {
    // 不在清單中的場次也照樣通知 GameMonitor（以 deviceId 比對），讓舊版直接訂閱的場次也能取消。
    const ok = await this.unwatchGame(state, gamePk).catch(() => false);
    if (!ok) return json({ error: "UNWATCH_FAILED", ...this.view(state), ok: false }, 502);
    delete state.games[gamePk];
    // 記住使用者取消過的場次，追蹤球隊的自動同步不會再把它加回來。
    state.dismissed = [...state.dismissed.filter(pk => pk !== gamePk), gamePk].slice(-MAX_DISMISSED);
    await this.save(state);
    await this.scheduleSync(state);
    return json(this.view(state));
  }

  async setGamePrefs(state, gamePk, body) {
    const entry = state.games[gamePk];
    if (!entry) return json({ error: "GAME_NOT_SUBSCRIBED" }, 404);
    const prefs = body.prefs ? normalizePrefs(body.prefs, state.defaults) : null;
    // 和預設相同時視為「使用預設」，之後修改預設會一起套用。
    entry.prefs = prefs && !samePrefs(prefs, state.defaults) ? prefs : null;
    const failed = await this.propagate(state, [gamePk]);
    await this.save(state);
    return json(this.view(state, { failed }));
  }

  async followTeam(state, body) {
    const teamId = Number(body.teamId);
    if (!MLB_TEAM_IDS.has(teamId)) return json({ error: "INVALID_TEAM" }, 400);
    const failed = await this.adoptSubscription(state, body.subscription);
    if (!state.subscription) return json({ error: "PUSH_SUBSCRIPTION_REQUIRED" }, 400);

    if (!state.teams.some(team => team.teamId === teamId)) {
      state.teams.push({ teamId, createdAt: new Date().toISOString() });
    }
    let added = [];
    try {
      added = await this.sync(state);
    } catch (error) {
      state.lastSyncError = error?.message || String(error);
    }
    await this.save(state);
    await this.scheduleSync(state);
    return json(this.view(state, { added, failed }));
  }

  async unfollowTeam(state, teamId) {
    state.teams = state.teams.filter(team => team.teamId !== teamId);
    for (const entry of Object.values(state.games)) {
      if (!(entry.teamIds || []).includes(teamId)) continue;
      entry.teamIds = entry.teamIds.filter(id => id !== teamId);
      // 只因為追蹤這隊而自動加入的場次一起取消；手動訂閱或仍被其他追蹤球隊涵蓋的保留。
      if (!entry.manual && entry.teamIds.length === 0) {
        await this.unwatchGame(state, entry.gamePk).catch(() => false);
        delete state.games[entry.gamePk];
      }
    }
    await this.save(state);
    await this.scheduleSync(state);
    return json(this.view(state));
  }

  async manualSync(state) {
    let added = [];
    try {
      added = await this.sync(state);
    } catch (error) {
      state.lastSyncError = error?.message || String(error);
    }
    await this.save(state);
    await this.scheduleSync(state);
    return json(this.view(state, { added }));
  }

  async fetchSchedule(params) {
    const url = new URL(`${MLB_API}/v1/schedule`);
    url.searchParams.set("sportId", "1");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`MLB schedule HTTP ${response.status}`);
    return scheduleGames(await response.json());
  }

  // 1. 清掉已終場／延賽／取消的場次；2. 依追蹤球隊自動訂閱接下來的季後賽。
  async sync(state) {
    const now = Date.now();
    const tracked = Object.keys(state.games).map(Number);

    if (tracked.length) {
      const games = await this.fetchSchedule({ gamePks: tracked.join(",") });
      const byPk = new Map(games.map(game => [Number(game.gamePk), game]));
      for (const gamePk of tracked) {
        const entry = state.games[gamePk];
        const game = byPk.get(gamePk);
        if (!game) {
          // 被移出賽程的場次由 GameMonitor 自行停止；預定時間過後再從清單移除。
          const time = Date.parse(entry.gameDate || "");
          if (Number.isFinite(time) && now - time > MISSING_GRACE_MS) delete state.games[gamePk];
          continue;
        }
        const status = scheduleState(game);
        if (status === "final") {
          delete state.games[gamePk];
        } else if (status === "calledOff") {
          await this.unwatchGame(state, gamePk).catch(() => false);
          delete state.games[gamePk];
        } else {
          entry.gameDate = game.gameDate || entry.gameDate;
        }
      }
    }

    const added = [];
    const teamIds = state.teams.map(team => team.teamId);
    if (teamIds.length && state.subscription) {
      const games = await this.fetchSchedule({
        teamId: teamIds.join(","),
        startDate: utcDate(now - 86_400_000),
        endDate: utcDate(now + LOOKAHEAD_DAYS * 86_400_000),
        gameType: POSTSEASON_TYPES.join(",")
      });
      for (const game of games) {
        const gamePk = Number(game.gamePk);
        if (!POSTSEASON_TYPES.includes(game.gameType) || scheduleState(game) !== "active") continue;
        const matched = teamIds.filter(id =>
          Number(game.teams?.away?.team?.id) === id || Number(game.teams?.home?.team?.id) === id
        );
        if (!matched.length) continue;

        const entry = state.games[gamePk];
        if (entry) {
          entry.teamIds = [...new Set([...(entry.teamIds || []), ...matched])];
          continue;
        }
        if (state.dismissed.includes(gamePk) || Object.keys(state.games).length >= MAX_GAMES) continue;

        state.games[gamePk] = {
          gamePk,
          manual: false,
          teamIds: matched,
          prefs: null,
          gameDate: game.gameDate || null,
          createdAt: new Date().toISOString()
        };
        const result = await this.watchGame(state, gamePk, { confirm: false }).catch(() => ({ ok: false }));
        if (result.ok) added.push(gamePk);
        else delete state.games[gamePk];
      }
    }

    state.lastSyncAt = new Date(now).toISOString();
    state.lastSyncError = null;
    return added;
  }
}
