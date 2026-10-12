import {lang} from './i18n.js';

// 30 隊：中文隊名（name）、英文全名（en）與暱稱（nick）、日文暱稱（ja），聯盟（AL / NL）與分區（E 東區 / C 中區 / W 西區）依 MLB Stats API 2026 球季。
// 畫面上的球隊簡稱用 teamLabel()：中文「道奇」、英文 Dodgers、日文 ドジャース（engine 的 teamZhName 也是用它）。
export const MLB_TEAMS=[
  {id:110,abbr:'BAL',name:'金鶯',en:'Baltimore Orioles',nick:'Orioles',ja:'オリオールズ',league:'AL',division:'E'},
  {id:111,abbr:'BOS',name:'紅襪',en:'Boston Red Sox',nick:'Red Sox',ja:'レッドソックス',league:'AL',division:'E'},
  {id:147,abbr:'NYY',name:'洋基',en:'New York Yankees',nick:'Yankees',ja:'ヤンキース',league:'AL',division:'E'},
  {id:139,abbr:'TB',name:'光芒',en:'Tampa Bay Rays',nick:'Rays',ja:'レイズ',league:'AL',division:'E'},
  {id:141,abbr:'TOR',name:'藍鳥',en:'Toronto Blue Jays',nick:'Blue Jays',ja:'ブルージェイズ',league:'AL',division:'E'},
  {id:145,abbr:'CWS',name:'白襪',en:'Chicago White Sox',nick:'White Sox',ja:'ホワイトソックス',league:'AL',division:'C'},
  {id:114,abbr:'CLE',name:'守護者',en:'Cleveland Guardians',nick:'Guardians',ja:'ガーディアンズ',league:'AL',division:'C'},
  {id:116,abbr:'DET',name:'老虎',en:'Detroit Tigers',nick:'Tigers',ja:'タイガース',league:'AL',division:'C'},
  {id:118,abbr:'KC',name:'皇家',en:'Kansas City Royals',nick:'Royals',ja:'ロイヤルズ',league:'AL',division:'C'},
  {id:142,abbr:'MIN',name:'雙城',en:'Minnesota Twins',nick:'Twins',ja:'ツインズ',league:'AL',division:'C'},
  {id:133,abbr:'ATH',name:'運動家',en:'Athletics',nick:'Athletics',ja:'アスレチックス',league:'AL',division:'W'},
  {id:117,abbr:'HOU',name:'太空人',en:'Houston Astros',nick:'Astros',ja:'アストロズ',league:'AL',division:'W'},
  {id:108,abbr:'LAA',name:'天使',en:'Los Angeles Angels',nick:'Angels',ja:'エンゼルス',league:'AL',division:'W'},
  {id:136,abbr:'SEA',name:'水手',en:'Seattle Mariners',nick:'Mariners',ja:'マリナーズ',league:'AL',division:'W'},
  {id:140,abbr:'TEX',name:'遊騎兵',en:'Texas Rangers',nick:'Rangers',ja:'レンジャーズ',league:'AL',division:'W'},
  {id:144,abbr:'ATL',name:'勇士',en:'Atlanta Braves',nick:'Braves',ja:'ブレーブス',league:'NL',division:'E'},
  {id:146,abbr:'MIA',name:'馬林魚',en:'Miami Marlins',nick:'Marlins',ja:'マーリンズ',league:'NL',division:'E'},
  {id:121,abbr:'NYM',name:'大都會',en:'New York Mets',nick:'Mets',ja:'メッツ',league:'NL',division:'E'},
  {id:143,abbr:'PHI',name:'費城人',en:'Philadelphia Phillies',nick:'Phillies',ja:'フィリーズ',league:'NL',division:'E'},
  {id:120,abbr:'WSH',name:'國民',en:'Washington Nationals',nick:'Nationals',ja:'ナショナルズ',league:'NL',division:'E'},
  {id:112,abbr:'CHC',name:'小熊',en:'Chicago Cubs',nick:'Cubs',ja:'カブス',league:'NL',division:'C'},
  {id:113,abbr:'CIN',name:'紅人',en:'Cincinnati Reds',nick:'Reds',ja:'レッズ',league:'NL',division:'C'},
  {id:158,abbr:'MIL',name:'釀酒人',en:'Milwaukee Brewers',nick:'Brewers',ja:'ブルワーズ',league:'NL',division:'C'},
  {id:134,abbr:'PIT',name:'海盜',en:'Pittsburgh Pirates',nick:'Pirates',ja:'パイレーツ',league:'NL',division:'C'},
  {id:138,abbr:'STL',name:'紅雀',en:'St. Louis Cardinals',nick:'Cardinals',ja:'カージナルス',league:'NL',division:'C'},
  {id:109,abbr:'AZ',name:'響尾蛇',en:'Arizona Diamondbacks',nick:'Diamondbacks',ja:'ダイヤモンドバックス',jaShort:'Dバックス',league:'NL',division:'W'},
  {id:115,abbr:'COL',name:'洛磯',en:'Colorado Rockies',nick:'Rockies',ja:'ロッキーズ',league:'NL',division:'W'},
  {id:119,abbr:'LAD',name:'道奇',en:'Los Angeles Dodgers',nick:'Dodgers',ja:'ドジャース',league:'NL',division:'W'},
  {id:135,abbr:'SD',name:'教士',en:'San Diego Padres',nick:'Padres',ja:'パドレス',league:'NL',division:'W'},
  {id:137,abbr:'SF',name:'巨人',en:'San Francisco Giants',nick:'Giants',ja:'ジャイアンツ',league:'NL',division:'W'},
];
export const teamById=id=>MLB_TEAMS.find(team=>team.id===Number(id));

// 目前語言的球隊簡稱（30 隊以外的球隊回傳 ''）。可傳球隊物件或 id。
// short：版面窄的地方（戰績表、追蹤球隊卡片）改用日文慣用的短名（Dバックス）。
export function teamLabel(team,{short=false}={}){
  const mlb=teamById(typeof team==='object'?team?.id:team);
  if(!mlb)return '';
  const current=lang();
  return current==='en'?mlb.nick:current==='ja'?(short&&mlb.jaShort)||mlb.ja:mlb.name;
}
