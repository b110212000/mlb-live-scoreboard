// 推播通知與行事曆的文字，依裝置語言：zh 繁體中文（預設，舊裝置沒有語言設定時用它）、en English、ja 日本語。
// 前端在「設定 → 語言」切換時會把語言存進 DeviceRegistry，再帶給每場的 GameMonitor。
export const LANGS = ["zh", "en", "ja"];
export const normalizeLang = value => LANGS.includes(value) ? value : "zh";

// 與前端 src/teams.js 相同的隊名（中文 / 英文暱稱 / 日文）。
const TEAMS = {
  108: ["天使", "Angels", "エンゼルス"], 109: ["響尾蛇", "Diamondbacks", "ダイヤモンドバックス"],
  110: ["金鶯", "Orioles", "オリオールズ"], 111: ["紅襪", "Red Sox", "レッドソックス"],
  112: ["小熊", "Cubs", "カブス"], 113: ["紅人", "Reds", "レッズ"], 114: ["守護者", "Guardians", "ガーディアンズ"],
  115: ["洛磯", "Rockies", "ロッキーズ"], 116: ["老虎", "Tigers", "タイガース"], 117: ["太空人", "Astros", "アストロズ"],
  118: ["皇家", "Royals", "ロイヤルズ"], 119: ["道奇", "Dodgers", "ドジャース"], 120: ["國民", "Nationals", "ナショナルズ"],
  121: ["大都會", "Mets", "メッツ"], 133: ["運動家", "Athletics", "アスレチックス"], 134: ["海盜", "Pirates", "パイレーツ"],
  135: ["教士", "Padres", "パドレス"], 136: ["水手", "Mariners", "マリナーズ"], 137: ["巨人", "Giants", "ジャイアンツ"],
  138: ["紅雀", "Cardinals", "カージナルス"], 139: ["光芒", "Rays", "レイズ"], 140: ["遊騎兵", "Rangers", "レンジャーズ"],
  141: ["藍鳥", "Blue Jays", "ブルージェイズ"], 142: ["雙城", "Twins", "ツインズ"], 143: ["費城人", "Phillies", "フィリーズ"],
  144: ["勇士", "Braves", "ブレーブス"], 145: ["白襪", "White Sox", "ホワイトソックス"], 146: ["馬林魚", "Marlins", "マーリンズ"],
  147: ["洋基", "Yankees", "ヤンキース"], 158: ["釀酒人", "Brewers", "ブルワーズ"]
};

// 球隊簡稱；不在 30 隊內時用 MLB 原名。
export function teamShortName(id, lang, fallback = "") {
  const names = TEAMS[Number(id)];
  return names ? names[LANGS.indexOf(normalizeLang(lang))] : fallback;
}

const TEXT = {
  zh: {
    away: "客隊", home: "主隊", tbd: "待定",
    top: n => `${n} 局上`, bottom: n => `${n} 局下`, inning: n => `${n} 局`,
    subscribedTitle: label => `${label}｜訂閱成功`, subscribedBody: summary => `將通知：${summary}。`,
    pregameTitle: "MLB 即將開賽", pregameBody: label => `${label} 將在 5 分鐘內開賽。`,
    startTitle: "MLB 比賽開始", startBody: label => `${label} 已經開賽。`,
    scored: team => `${team} 得分`, scoreUpdate: "MLB 比分更新",
    score: (away, as, hs, home) => `${away} ${as}：${hs} ${home}`,
    finalTitle: "MLB 比賽結束", finalBody: score => `終場：${score}`,
    prefs: { pregame5: "開賽前 5 分鐘", start: "比賽開始", homeScore: "主隊得分", awayScore: "客隊得分", final: "比賽結束" },
    separator: "、", noPrefs: "目前沒有開啟任何提醒項目",
    testTitle: "MLB 戰況通知測試", testBody: "第一則測試通知成功。30 秒後還會再收到一則背景通知。",
    delayedTitle: "MLB 戰況背景通知測試", delayedBody: "30 秒背景通知成功。關閉網站後也能由 Cloudflare Web Push 喚醒通知。",
    regular: "例行賽", spring: "春訓", worldSeries: "世界大賽",
    series: (league, type) => ({ AL: "美聯", NL: "國聯" }[league] || "") + ({ F: "外卡系列賽", D: "分區賽", L: "冠軍賽" }[type] || "季後賽"),
    liveScore: link => `即時比分：${link}`, titleSeparator: "｜"
  },
  en: {
    away: "Away", home: "Home", tbd: "TBD",
    top: n => `Top ${n}`, bottom: n => `Bot ${n}`, inning: n => `Inning ${n}`,
    subscribedTitle: label => `${label} | Subscribed`, subscribedBody: summary => `You'll be notified about: ${summary}.`,
    pregameTitle: "MLB game starting soon", pregameBody: label => `${label} starts within 5 minutes.`,
    startTitle: "MLB game started", startBody: label => `${label} has started.`,
    scored: team => `${team} scored`, scoreUpdate: "MLB score update",
    score: (away, as, hs, home) => `${away} ${as}-${hs} ${home}`,
    finalTitle: "MLB final", finalBody: score => `Final: ${score}`,
    prefs: { pregame5: "5 minutes before first pitch", start: "first pitch", homeScore: "home team scores", awayScore: "away team scores", final: "final score" },
    separator: ", ", noPrefs: "no alerts are turned on",
    testTitle: "MLB Scoreboard test notification", testBody: "The first test notification arrived. Another background notification follows in 30 seconds.",
    delayedTitle: "MLB Scoreboard background test", delayedBody: "The 30-second background notification arrived. Cloudflare Web Push can wake notifications even when the site is closed.",
    regular: "Regular Season", spring: "Spring Training", worldSeries: "World Series",
    series: (league, type) => [league, { F: "Wild Card Series", D: "Division Series", L: "Championship Series" }[type] || "Postseason"].filter(Boolean).join(" "),
    liveScore: link => `Live score: ${link}`, titleSeparator: " | "
  },
  ja: {
    away: "ビジター", home: "ホーム", tbd: "未定",
    top: n => `${n}回表`, bottom: n => `${n}回裏`, inning: n => `${n}回`,
    subscribedTitle: label => `${label}｜通知を登録しました`, subscribedBody: summary => `通知する内容：${summary}。`,
    pregameTitle: "まもなく試合開始", pregameBody: label => `${label}：5 分以内に試合開始です。`,
    startTitle: "試合開始", startBody: label => `${label}：試合が始まりました。`,
    scored: team => `${team}が得点`, scoreUpdate: "スコア更新",
    score: (away, as, hs, home) => `${away} ${as}－${hs} ${home}`,
    finalTitle: "試合終了", finalBody: score => `試合終了：${score}`,
    prefs: { pregame5: "試合開始 5 分前", start: "試合開始", homeScore: "ホームチームの得点", awayScore: "ビジターチームの得点", final: "試合終了" },
    separator: "、", noPrefs: "オンになっている通知はありません",
    testTitle: "MLB スコア 通知テスト", testBody: "1 件目のテスト通知が届きました。30 秒後にもう 1 件バックグラウンド通知が届きます。",
    delayedTitle: "MLB スコア バックグラウンド通知テスト", delayedBody: "30 秒後のバックグラウンド通知が届きました。サイトを閉じていても Cloudflare Web Push で通知できます。",
    regular: "レギュラーシーズン", spring: "スプリングトレーニング", worldSeries: "ワールドシリーズ",
    // ア・リーグ地区シリーズ / ア・リーグ優勝決定シリーズ / ア・リーグ ワイルドカードシリーズ（前端字典相同寫法）。
    series: (league, type) => {
      const name = { AL: "ア・リーグ", NL: "ナ・リーグ" }[league];
      if (type === "D") return (name || "") + "地区シリーズ";
      if (type === "L") return name ? name + "優勝決定シリーズ" : "リーグ優勝決定シリーズ";
      return [name, type === "F" ? "ワイルドカードシリーズ" : "ポストシーズン"].filter(Boolean).join(" ");
    },
    liveScore: link => `ライブスコア：${link}`, titleSeparator: "｜"
  }
};

export const text = lang => TEXT[normalizeLang(lang)];

// 通知裡的隊名：中文沿用 MLB 原名（舊版行為），英文用 MLB 原名，日文用日文隊名。
export function snapshotTeams(snapshot, lang) {
  const t = text(lang);
  const away = snapshot.awayName || t.away;
  const home = snapshot.homeName || t.home;
  if (normalizeLang(lang) !== "ja") return { away, home };
  return {
    away: teamShortName(snapshot.awayTeamId, "ja", away),
    home: teamShortName(snapshot.homeTeamId, "ja", home)
  };
}

export function matchupLabel(snapshot, lang) {
  const { away, home } = snapshotTeams(snapshot, lang);
  return `${away} vs ${home}`;
}

export function inningText(snapshot, lang) {
  const n = Number(snapshot.currentInning);
  if (!Number.isFinite(n) || n <= 0) return "";
  const t = text(lang);
  const state = String(snapshot.inningState || "").toLowerCase();
  if (snapshot.isTopInning === true || state.includes("top")) return t.top(n);
  if (snapshot.isTopInning === false || state.includes("bottom")) return t.bottom(n);
  return t.inning(n);
}

export function scoreLine(snapshot, lang) {
  const { away, home } = snapshotTeams(snapshot, lang);
  return text(lang).score(away, snapshot.awayScore, snapshot.homeScore, home);
}
