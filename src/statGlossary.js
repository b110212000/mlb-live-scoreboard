import {t} from './i18n.js';

// Short, prewritten explanations; no network request or AI translation.
export function statInfo(id){
  return {
    "AB":{abbr:"AB",title:t("打數"),description:t("不含保送、觸身球、犧牲觸擊、犧牲飛球等不計打數的打席。"),url:"https://www.mlb.com/glossary/standard-stats/at-bat"},
    "R":{abbr:"R",title:t("得分"),description:t("跑者回到本壘，並被正式記錄的得分。"),url:"https://www.mlb.com/glossary/standard-stats/run"},
    "H":{abbr:"H",title:t("安打"),description:t("打者擊球後，經記錄員判定為安打的次數。"),url:"https://www.mlb.com/glossary/standard-stats/hit"},
    "RBI":{abbr:"RBI",title:t("打點"),description:t("因打者的打擊結果而記入的得分貢獻；不是每次得分都有打點。"),url:"https://www.mlb.com/glossary/standard-stats/runs-batted-in"},
    "BB":{abbr:"BB",title:t("保送"),description:t("打者獲得四壞球保送的次數，包含故意四壞球。"),url:"https://www.mlb.com/glossary/standard-stats/walk"},
    "SO":{abbr:"SO",title:t("被三振"),description:t("打者被三振的次數。"),url:"https://www.mlb.com/glossary/standard-stats/strikeout"},
    "HR":{abbr:"HR",title:t("全壘打"),description:t("打者擊出全壘打的支數。"),url:"https://www.mlb.com/glossary/standard-stats/home-run"},
    "IP":{abbr:"IP",title:t("投球局數"),description:t("6.1 表示 6 又 1/3 局，6.2 表示 6 又 2/3 局，並非小數。"),url:"https://www.mlb.com/glossary/standard-stats/innings-pitched"},
    "H_ALLOWED":{abbr:"H",title:t("被安打"),description:t("投手被打出安打的次數。"),url:"https://www.mlb.com/glossary/standard-stats/hit"},
    "R_ALLOWED":{abbr:"R",title:t("失分"),description:t("記在投手帳上的全部失分，包含自責分與非自責分。"),url:"https://www.mlb.com/glossary/standard-stats/run"},
    "ER":{abbr:"ER",title:t("自責分"),description:t("依記錄規則排除失誤等影響後，歸責於投手的失分。"),url:"https://www.mlb.com/glossary/standard-stats/earned-run"},
    "BB_ALLOWED":{abbr:"BB",title:t("投手保送"),description:t("投手投出保送的次數，包含故意四壞球。"),url:"https://www.mlb.com/glossary/standard-stats/walk"},
    "K":{abbr:"K",title:t("奪三振"),description:t("投手三振打者的次數。"),url:"https://www.mlb.com/glossary/standard-stats/strikeout"},
    "HR_ALLOWED":{abbr:"HR",title:t("被全壘打"),description:t("投手被打出全壘打的支數。"),url:"https://www.mlb.com/glossary/standard-stats/home-run"},
    "P":{abbr:"P",title:t("投球數"),description:t("投手在本場比賽已投出的球數。"),url:"https://www.mlb.com/glossary/standard-stats/number-of-pitches"},
    "AVG":{abbr:"AVG",title:t("打擊率"),description:t("安打 ÷ 打數。"),url:"https://www.mlb.com/glossary/standard-stats/batting-average"},
    "OBP":{abbr:"OBP",title:t("上壘率"),description:t("（安打＋保送＋觸身球）÷（打數＋保送＋觸身球＋犧牲飛球）。"),url:"https://www.mlb.com/glossary/standard-stats/on-base-percentage"},
    "SLG":{abbr:"SLG",title:t("長打率"),description:t("壘打數 ÷ 打數；一至四壘安打分別算 1 至 4 個壘打數。"),url:"https://www.mlb.com/glossary/standard-stats/slugging-percentage"},
    "OPS":{abbr:"OPS",title:t("整體攻擊指數"),description:t("OPS = OBP + SLG（上壘率＋長打率）。"),url:"https://www.mlb.com/glossary/standard-stats/on-base-plus-slugging"},
    "ERA":{abbr:"ERA",title:t("防禦率"),description:t("自責分 × 9 ÷ 投球局數。"),url:"https://www.mlb.com/glossary/standard-stats/earned-run-average"},
    "WHIP":{abbr:"WHIP",title:t("每局被上壘率"),description:t("（被安打＋保送）÷ 投球局數，不含觸身球。"),url:"https://www.mlb.com/glossary/standard-stats/walks-and-hits-per-inning-pitched"},
    "G":{abbr:"G",title:t("出賽"),description:t("實際出賽的場次。"),url:"https://www.mlb.com/glossary/standard-stats/games-played"},
    "SB":{abbr:"SB",title:t("盜壘"),description:t("依記錄規則判定的盜壘成功次數。"),url:"https://www.mlb.com/glossary/standard-stats/stolen-base"},
  }[id]||null;
}
export const STAT_FIELDS={gamesPlayed:'G',atBats:'AB',hits:'H',homeRuns:'HR',rbi:'RBI',stolenBases:'SB',avg:'AVG',obp:'OBP',slg:'SLG',ops:'OPS',inningsPitched:'IP',strikeOuts:'K',era:'ERA',whip:'WHIP'};
