// 單場比賽的行事曆檔（iCalendar / .ics）。iPhone 開啟 text/calendar 網址會直接出現「加入行事曆」。
const MLB_API = "https://statsapi.mlb.com/api";
const GAME_DURATION_MS = 3.5 * 60 * 60_000;
const REMINDER = "-PT15M";

// 與前端 src/teams.js 相同的中文隊名。
const TEAM_ZH = {
  108: "天使", 109: "響尾蛇", 110: "金鶯", 111: "紅襪", 112: "小熊", 113: "紅人", 114: "守護者", 115: "洛磯",
  116: "老虎", 117: "太空人", 118: "皇家", 119: "道奇", 120: "國民", 121: "大都會", 133: "運動家", 134: "海盜",
  135: "教士", 136: "水手", 137: "巨人", 138: "紅雀", 139: "光芒", 140: "遊騎兵", 141: "藍鳥", 142: "雙城",
  143: "費城人", 144: "勇士", 145: "白襪", 146: "馬林魚", 147: "洋基", 158: "釀酒人"
};

function teamZh(team) {
  return TEAM_ZH[Number(team?.id)] || team?.teamName || team?.name || "待定";
}

function seriesZh(game) {
  const type = game?.gameType;
  if (type === "R") return "例行賽";
  if (type === "S") return "春訓";
  if (type === "W") return "世界大賽";
  const desc = String(game?.seriesDescription || "");
  const league = /^(AL|American)/i.test(desc) ? "美聯" : /^(NL|National)/i.test(desc) ? "國聯" : "";
  const round = { F: "外卡系列賽", D: "分區賽", L: "冠軍賽" }[type] || "季後賽";
  return league + round;
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

export function buildGameCalendar(game, { appUrl = "", now = Date.now() } = {}) {
  const gamePk = Number(game.gamePk);
  const away = game.teams?.away?.team || {};
  const home = game.teams?.home?.team || {};
  // 例行賽的 seriesGameNumber 是 3～4 連戰中的第幾場，不放進標題。
  const number = game.gameType === "R" ? 0 : Number(game.seriesGameNumber);
  const title = `${seriesZh(game)}${number > 0 ? ` G${number}` : ""}｜${teamZh(away)} @ ${teamZh(home)}`;
  const link = appUrl ? `${appUrl}${appUrl.includes("?") ? "&" : "?"}view=live&gamePk=${gamePk}` : "";
  const description = [
    `${away.name || teamZh(away)} @ ${home.name || teamZh(home)}`,
    game.seriesDescription ? `${game.seriesDescription}${number > 0 ? ` Game ${number}` : ""}` : "",
    link ? `即時比分：${link}` : ""
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

export async function gameCalendarResponse(gamePk, env) {
  const url = `${MLB_API}/v1/schedule?sportId=1&gamePks=${encodeURIComponent(gamePk)}&hydrate=team,venue`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`MLB schedule HTTP ${response.status}`);
  const data = await response.json();
  const game = (data?.dates || []).flatMap(date => date?.games || []).find(item => Number(item.gamePk) === Number(gamePk));
  if (!game) return null;
  const body = buildGameCalendar(game, { appUrl: env.APP_URL || "" });
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `inline; filename="mlb-${gamePk}.ics"`,
      "cache-control": "public, max-age=300"
    }
  });
}
