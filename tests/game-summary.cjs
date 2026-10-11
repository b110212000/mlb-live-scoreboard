const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const zh={119:'道奇',143:'費城人'};
let writes=0;const host={set innerHTML(v){writes++;this._html=v},get innerHTML(){return this._html||''}};
const ctx={console,Number,String,Array,Object,JSON,Math,
  state:{games:[]},els:{gameSummary:host},
  esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  teamLogo:id=>id?`https://www.mlbstatic.com/team-logos/${id}.svg`:'',
  teamZhName:team=>zh[Number(team?.id)]||team?.name||'',
  zhEventName:s=>({'Home Run':'全壘打','Single':'一壘安打'})[s]||s,
  zhHalfInning:v=>v==='top'?'上':v==='bottom'?'下':'',
  inningLabel:ls=>ls.currentInning?`${ls.currentInning} 局${ls.isTopInning?'上':'下'}`:'--'};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('src/engine/summary.js','utf8'),ctx);

const play=(inning,half,batter,event,rbi,awayScore,homeScore)=>({about:{inning,halfInning:half},matchup:{batter:{fullName:batter}},result:{event,eventType:event==='Home Run'?'home_run':'single',rbi,awayScore,homeScore}});
const feed={gamePk:900,gameData:{game:{pk:900,type:'D'},status:{abstractGameState:'Final',detailedState:'Final',codedGameState:'F'},venue:{name:'Dodger Stadium'},
  teams:{away:{id:119,name:'Los Angeles Dodgers'},home:{id:143,name:'Philadelphia Phillies'}}},
  liveData:{linescore:{teams:{away:{runs:4},home:{runs:3}},innings:new Array(10).fill({})},
    decisions:{winner:{id:1,fullName:'Winner Guy'},loser:{id:2,fullName:'Loser Guy'},save:{id:3,fullName:'Closer Guy'}},
    boxscore:{teams:{
      away:{players:{ID1:{person:{id:1,fullName:'Winner Guy'},stats:{pitching:{note:'(W, 1-0)',inningsPitched:'2.0',hits:1,earnedRuns:0,strikeOuts:3}}},
        ID3:{person:{id:3,fullName:'Closer Guy'},stats:{pitching:{note:'(S, 1)',inningsPitched:'1.0',hits:1,earnedRuns:1,strikeOuts:1}}},
        ID10:{person:{id:10,fullName:'Slugger'},stats:{batting:{atBats:4,hits:2,homeRuns:1,rbi:3,runs:1}}}}},
      home:{players:{ID2:{person:{id:2,fullName:'Loser Guy'},stats:{pitching:{note:'(L, 0-1)',inningsPitched:'1.0',hits:3,earnedRuns:3,strikeOuts:1}}}}}},
      topPerformers:[{type:'hitter',player:{person:{id:10,fullName:'Slugger'}}},{type:'starter',player:{person:{id:2,fullName:'Loser Guy'}}}],
      info:[{label:'T',value:'3:12.'},{label:'Att',value:'52,000.'}]},
    plays:{allPlays:[play(1,'top','A1','Single',1,1,0),play(5,'bottom','H5','Home Run',2,1,2),play(8,'top','Slugger','Home Run',3,4,2),play(9,'bottom','H9','Single',1,4,3)],scoringPlays:[0,1,2,3]}}};
ctx.state.games=[{gamePk:900,seriesStatus:{wins:3,losses:1,isTied:false,isOver:true,winningTeam:{id:119,name:'Los Angeles Dodgers'}}}];

const html=ctx.buildGameSummaryHTML(feed);
for(const text of ['4 : 3','延長 10 局','道奇 3–1 贏得分區賽','勝投','Winner Guy','（1-0）','2.0 局 1 安 0 自責分 3 三振','敗投','Loser Guy','救援','Closer Guy',
  '致勝一擊','Slugger 全壘打，3 分打點','8 局上 · 比分 4 : 2','H5','5 局下 · 兩分砲','8 局上 · 三分砲','本場之星','4 打數 2 安打 · 1 全壘打 · 3 打點 · 1 得分',
  '比賽時間 3:12','觀眾 52,000 人','Dodger Stadium'])assert(html.includes(text),'summary missing: '+text);
assert(/summary-team win[\s\S]*道奇/.test(html),'winner not highlighted');
assert(!html.includes('A1 一壘安打'),'first run is not the go-ahead play here');

// 一路領先：致勝一擊是第一個得分打席。
const wire={...feed,liveData:{...feed.liveData,plays:{allPlays:[play(1,'top','A1','Single',1,1,0),play(3,'top','A3','Single',1,2,0),play(6,'bottom','H6','Single',1,2,1)],scoringPlays:[0,1,2]},linescore:{teams:{away:{runs:2},home:{runs:1}},innings:new Array(9).fill({})}}};
const wireHtml=ctx.buildGameSummaryHTML(wire);
assert(wireHtml.includes('A1 一壘安打，1 分打點'));assert(!wireHtml.includes('延長'));assert(wireHtml.includes('本場沒有全壘打'));

// 系列賽進行中 / 平手。
ctx.state.games=[{gamePk:900,seriesStatus:{wins:2,losses:1,isTied:false,isOver:false,winningTeam:{id:119}}}];
assert(ctx.buildGameSummaryHTML(feed).includes('道奇 系列賽 2–1 領先'));
ctx.state.games=[{gamePk:900,seriesStatus:{wins:1,losses:1,isTied:true}}];
assert(ctx.buildGameSummaryHTML(feed).includes('系列賽 1–1 平手'));

// 進行中、尚未開始、延賽。
const liveFeed={...feed,gameData:{...feed.gameData,status:{abstractGameState:'Live',detailedState:'In Progress',codedGameState:'I'}},liveData:{...feed.liveData,linescore:{...feed.liveData.linescore,currentInning:7,isTopInning:false}}};
assert(ctx.buildGameSummaryHTML(liveFeed).includes('比賽進行中（7 局下）'));
assert(ctx.buildGameSummaryHTML({...feed,gameData:{...feed.gameData,status:{abstractGameState:'Preview',detailedState:'Scheduled',codedGameState:'S'}}}).includes('比賽尚未開始'));
assert(ctx.buildGameSummaryHTML({...feed,gameData:{...feed.gameData,status:{abstractGameState:'Final',detailedState:'Postponed',codedGameState:'D'}}}).includes('已延賽'));

// 內容相同時不重寫 DOM。
ctx.renderGameSummary(feed);const first=writes;ctx.renderGameSummary(feed);assert.equal(writes,first,'unchanged summary rewrote DOM');
ctx.renderGameSummary(liveFeed);assert.equal(writes,first+1);

// HTML 跳脫。
const evil={...feed,liveData:{...feed.liveData,decisions:{winner:{id:1,fullName:'<img onerror=x>'}}}};
assert(!ctx.buildGameSummaryHTML(evil).includes('<img onerror'),'player names must be escaped');
console.log('PASS game summary: final score + extra innings, series won/leading/tied, W/L/S with records and lines, go-ahead (lead change and wire-to-wire), HR labels, top performers, facts, live/preview/postponed, no redundant DOM writes, escaping');
