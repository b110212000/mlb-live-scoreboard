// 單場比賽的行事曆檔（iCalendar / .ics）。iPhone 開啟 text/calendar 網址會直接出現「加入行事曆」。
const MLB_API = "https://statsapi.mlb.com/api";
const GAME_DURATION_MS = 3.5 * 60 * 60_000;
const REMINDER = "-PT15M";

import { normalizeLang, teamShortName, text } from "./messages.js";

// 隊名與 src/teams.js 相同（中文 / 英文暱稱 / 日文）。
function teamName(team, lang) {
  return teamShortName(team?.id, lang, team?.teamName || team?.name || text(lang).tbd);
}

function seriesName(game, lang) {
  const t = text(lang);
  const type = game?.gameType;
  if (type === "R") return t.regular;
  if (type === "S") return t.spring;
  if (type === "W") return t.worldSeries;
  const desc = String(game?.seriesDescription || "");
  const league = /^(AL|American)/i.test(desc) ? "AL" : /^(NL|National)/i.test(desc) ? "NL" : "";
  return t.series(league, type);
}

function icsDate(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545：每行最多 75 個位元組，續行以一個空白開頭；不切斷 UTF-8 字元。
function foldLine(line) {
  const encoder = new TextEncoder();
  const parts = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length ? 74 : 75;
    if (bytes + size > limit) {
      parts.push(current);
      current = char;
      bytes = size;
    } else {
      current += char;
      bytes += size;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildGameCalendar(game, { appUrl = "", now = Date.now(), lang = "zh" } = {}) {
  lang = normalizeLang(lang);
  const gamePk = Number(game.gamePk);
  const away = game.teams?.away?.team || {};
  const home = game.teams?.home?.team || {};
  // 例行賽的 seriesGameNumber 是 3～4 連戰中的第幾場，不放進標題。
  const number = game.gameType === "R" ? 0 : Number(game.seriesGameNumber);
  const title = `${seriesName(game, lang)}${number > 0 ? ` G${number}` : ""}${text(lang).titleSeparator}${teamName(away, lang)} @ ${teamName(home, lang)}`;
  const link = appUrl ? `${appUrl}${appUrl.includes("?") ? "&" : "?"}view=live&gamePk=${gamePk}` : "";
  const description = [
    `${away.name || teamName(away, lang)} @ ${home.name || teamName(home, lang)}`,
    game.seriesDescription ? `${game.seriesDescription}${number > 0 ? ` Game ${number}` : ""}` : "",
    link ? text(lang).liveScore(link) : ""
  ].filter(Boolean).join("\n");

  const start = Date.parse(game.gameDate || "");
  // 開賽時間未定（startTimeTBD）時改為全天行程，不設提醒。
  const tbd = game.status?.startTimeTBD === true || !Number.isFinite(start);
  const day = String(game.officialDate || game.gameDate || "").slice(0, 10).replace(/-/g, "");
  const nextDay = day
    ? icsDate(Date.parse(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00Z`) + 86_400_000).slice(0, 8)
    : "";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MLB Live Scoreboard//mlb-score-notify//ZH-TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:mlb-game-${gamePk}@mlb-score-notify`,
    `DTSTAMP:${icsDate(now)}`,
    ...(tbd
      ? [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${nextDay}`]
      : [`DTSTART:${icsDate(start)}`, `DTEND:${icsDate(start + GAME_DURATION_MS)}`]),
    `SUMMARY:${icsText(title)}`,
    ...(game.venue?.name ? [`LOCATION:${icsText(game.venue.name)}`] : []),
    `DESCRIPTION:${icsText(description)}`,
    ...(link ? [`URL:${link}`] : []),
    ...(tbd ? [] : [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsText(title)}`,
      `TRIGGER:${REMINDER}`,
      "END:VALARM"
    ]),
    "END:VEVENT",
    "END:VCALENDAR"
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export async function gameCalendarResponse(gamePk, env, lang = "zh") {
  const url = `${MLB_API}/v1/schedule?sportId=1&gamePks=${encodeURIComponent(gamePk)}&hydrate=team,venue`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`MLB schedule HTTP ${response.status}`);
  const data = await response.json();
  const game = (data?.dates || []).flatMap(date => date?.games || []).find(item => Number(item.gamePk) === Number(gamePk));
  if (!game) return null;
  const body = buildGameCalendar(game, { appUrl: env.APP_URL || "", lang });
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `inline; filename="mlb-${gamePk}.ics"`,
      "cache-control": "public, max-age=300"
    }
  });
}
