// 台灣旅外球員：依 MLB 官方球員名單的出生地（birthCountry = Taiwan）找出 MLB 與小聯盟各層級的台灣球員，
// 並取得各層級的本季成績。結果快取 3 小時，避免每支手機各自下載數千筆球員名單。
const MLB_API = "https://statsapi.mlb.com/api";
const CACHE_TTL_SECONDS = 3 * 60 * 60;

export const TAIWAN_LEVELS = [
  { sportId: 1, label: "MLB" },
  { sportId: 11, label: "3A" },
  { sportId: 12, label: "2A" },
  { sportId: 13, label: "高階1A" },
  { sportId: 14, label: "1A" },
  { sportId: 16, label: "新人聯盟" }
];

const HITTING_FIELDS = ["gamesPlayed", "atBats", "hits", "homeRuns", "rbi", "stolenBases", "avg", "obp", "ops"];
const PITCHING_FIELDS = ["gamesPlayed", "gamesStarted", "wins", "losses", "saves", "inningsPitched", "strikeOuts", "baseOnBalls", "era", "whip"];

async function getJSON(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`MLB API HTTP ${response.status}`);
  return response.json();
}

function pick(stat, fields) {
  const result = {};
  for (const key of fields) if (stat?.[key] != null) result[key] = stat[key];
  return result;
}

export async function buildTaiwanPlayers(season) {
  const players = new Map();

  // 1. 各層級名單只取需要的欄位，再篩出台灣出生的球員（球員可能在多個層級出賽）。
  const lists = await Promise.all(TAIWAN_LEVELS.map(level => getJSON(
    `${MLB_API}/v1/sports/${level.sportId}/players?season=${season}` +
    "&fields=people,id,fullName,birthCountry,birthCity,primaryPosition,abbreviation,type"
  ).then(data => ({ level, people: data?.people || [] }))));

  for (const { level, people } of lists) {
    for (const person of people) {
      if (person?.birthCountry !== "Taiwan") continue;
      const entry = players.get(person.id) || {
        id: person.id,
        fullName: person.fullName,
        birthCity: person.birthCity || "",
        position: person.primaryPosition?.abbreviation || "",
        pitcher: person.primaryPosition?.type === "Pitcher" || person.primaryPosition?.abbreviation === "P",
        levels: [],
        currentTeam: null
      };
      entry.levels.push({ sportId: level.sportId, label: level.label, team: null, hitting: null, pitching: null });
      players.set(person.id, entry);
    }
  }

  // 2. 每個層級一次批次查詢本季成績（小聯盟成績要指定 sportId）與目前球隊。
  for (const level of TAIWAN_LEVELS) {
    const ids = [...players.values()].filter(p => p.levels.some(l => l.sportId === level.sportId)).map(p => p.id);
    if (!ids.length) continue;
    const data = await getJSON(
      `${MLB_API}/v1/people?personIds=${ids.join(",")}` +
      `&hydrate=currentTeam,stats(group=[hitting,pitching],type=[season],season=${season},sportId=${level.sportId})`
    );
    for (const person of data?.people || []) {
      const entry = players.get(person.id);
      if (!entry) continue;
      if (!entry.currentTeam && person.currentTeam?.id) {
        entry.currentTeam = {
          id: person.currentTeam.id,
          name: person.currentTeam.name || "",
          parentOrgId: person.currentTeam.parentOrgId || null,
          parentOrgName: person.currentTeam.parentOrgName || ""
        };
      }
      const slot = entry.levels.find(l => l.sportId === level.sportId);
      for (const group of person.stats || []) {
        const split = (group.splits || []).find(s => Number(s.sport?.id ?? level.sportId) === level.sportId) || group.splits?.[0];
        if (!split) continue;
        if (split.team?.id) slot.team = { id: split.team.id, name: split.team.name || "" };
        const kind = group.group?.displayName;
        if (kind === "hitting") slot.hitting = pick(split.stat, HITTING_FIELDS);
        if (kind === "pitching") slot.pitching = pick(split.stat, PITCHING_FIELDS);
      }
    }
  }

  // 3. 依最高出賽層級排序，同層級依姓名。
  const rank = sportId => TAIWAN_LEVELS.findIndex(level => level.sportId === sportId);
  const list = [...players.values()]
    .map(p => ({ ...p, topLevel: Math.min(...p.levels.map(l => rank(l.sportId))) }))
    .sort((a, b) => a.topLevel - b.topLevel || a.fullName.localeCompare(b.fullName));
  return { season, updatedAt: new Date().toISOString(), levels: TAIWAN_LEVELS, players: list };
}

export async function taiwanPlayersResponse(season, cache) {
  const key = new Request(`https://cache.internal/taiwan-players/${season}`);
  const cached = cache ? await cache.match(key) : null;
  if (cached) return cached;
  const data = await buildTaiwanPlayers(season);
  const response = new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`
    }
  });
  if (cache) await cache.put(key, response.clone());
  return response;
}
