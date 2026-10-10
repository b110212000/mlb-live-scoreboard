// 單場通知的提醒項目。舊訂閱沒有 prefs 欄位時視為全部開啟，維持原本行為。
export const PREF_KEYS = ["pregame5", "start", "homeScore", "awayScore", "final"];

export const PREF_LABELS = {
  pregame5: "開賽前 5 分鐘",
  start: "比賽開始",
  homeScore: "主隊得分",
  awayScore: "客隊得分",
  final: "比賽結束"
};

export const DEFAULT_PREFS = Object.freeze({
  pregame5: true,
  start: true,
  homeScore: true,
  awayScore: true,
  final: true
});

export function normalizePrefs(value, fallback = DEFAULT_PREFS) {
  const source = value && typeof value === "object" ? value : {};
  const base = fallback && typeof fallback === "object" ? fallback : DEFAULT_PREFS;
  const prefs = {};
  for (const key of PREF_KEYS) {
    prefs[key] = typeof source[key] === "boolean" ? source[key] : base[key] !== false;
  }
  return prefs;
}

export function samePrefs(a, b) {
  return PREF_KEYS.every(key => Boolean(a?.[key]) === Boolean(b?.[key]));
}

export function prefsSummary(prefs) {
  const enabled = PREF_KEYS.filter(key => prefs?.[key]).map(key => PREF_LABELS[key]);
  return enabled.length ? enabled.join("、") : "目前沒有開啟任何提醒項目";
}
