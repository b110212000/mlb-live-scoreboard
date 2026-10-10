// 追蹤球隊選單用的 30 隊（中文隊名與 engine/postseason.js 的 teamZhName 一致）。
export const MLB_TEAMS=[
  {id:110,abbr:'BAL',name:'金鶯',league:'AL'},{id:111,abbr:'BOS',name:'紅襪',league:'AL'},{id:147,abbr:'NYY',name:'洋基',league:'AL'},
  {id:139,abbr:'TB',name:'光芒',league:'AL'},{id:141,abbr:'TOR',name:'藍鳥',league:'AL'},{id:145,abbr:'CWS',name:'白襪',league:'AL'},
  {id:114,abbr:'CLE',name:'守護者',league:'AL'},{id:116,abbr:'DET',name:'老虎',league:'AL'},{id:118,abbr:'KC',name:'皇家',league:'AL'},
  {id:142,abbr:'MIN',name:'雙城',league:'AL'},{id:133,abbr:'ATH',name:'運動家',league:'AL'},{id:117,abbr:'HOU',name:'太空人',league:'AL'},
  {id:108,abbr:'LAA',name:'天使',league:'AL'},{id:136,abbr:'SEA',name:'水手',league:'AL'},{id:140,abbr:'TEX',name:'遊騎兵',league:'AL'},
  {id:144,abbr:'ATL',name:'勇士',league:'NL'},{id:146,abbr:'MIA',name:'馬林魚',league:'NL'},{id:121,abbr:'NYM',name:'大都會',league:'NL'},
  {id:143,abbr:'PHI',name:'費城人',league:'NL'},{id:120,abbr:'WSH',name:'國民',league:'NL'},{id:112,abbr:'CHC',name:'小熊',league:'NL'},
  {id:113,abbr:'CIN',name:'紅人',league:'NL'},{id:158,abbr:'MIL',name:'釀酒人',league:'NL'},{id:134,abbr:'PIT',name:'海盜',league:'NL'},
  {id:138,abbr:'STL',name:'紅雀',league:'NL'},{id:109,abbr:'ARI',name:'響尾蛇',league:'NL'},{id:115,abbr:'COL',name:'洛磯',league:'NL'},
  {id:119,abbr:'LAD',name:'道奇',league:'NL'},{id:135,abbr:'SD',name:'教士',league:'NL'},{id:137,abbr:'SF',name:'巨人',league:'NL'},
];
export const teamById=id=>MLB_TEAMS.find(team=>team.id===Number(id));
