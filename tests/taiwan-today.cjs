const assert=require('node:assert/strict');
(async()=>{
 process.env.TZ='Asia/Taipei';const m=await import('../src/taiwanToday.js');
 const box={teams:{away:{players:{ID10:{stats:{batting:{gamesPlayed:1,atBats:0,hits:0,rbi:0},pitching:{gamesPitched:1,inningsPitched:'0.0',runs:1,strikeOuts:0}}},ID11:{stats:{batting:{gamesPlayed:0,atBats:0},pitching:{}}}}},home:{players:{}}}};
 const p=m.playerToday(box,10);assert(p.played&&p.batting&&p.pitching,'zero stats and two-way participation');
 assert.equal(m.playerToday(box,11).played,false);assert.equal(m.playerToday(box,12).absent,true);
 assert.equal(m.inningsText('6.1'),'6.1');assert.equal(m.inningsText('6.3'),'—');assert.equal(m.inningsText('0.0'),'0.0');assert.equal(m.statNumber(0),0);assert.equal(m.statNumber(undefined),'—');
 const games=[1,2,3,4,5].map(gamePk=>({gamePk,status:{abstractGameState:'Live'}}));games.push(games[0],{gamePk:6,status:{abstractGameState:'Preview'}},{gamePk:7,status:{abstractGameState:'Final',detailedState:'Postponed'}});
 let active=0,max=0,calls=[];
 global.fetch=async url=>{calls.push(url);active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;return {ok:!url.includes('/game/3/'),status:503,json:async()=>box}};
 const results=await m.loadTodayBoxes(games);assert.equal(calls.length,5);assert(max<=3);assert(results[3].failed);assert(results[1].box&&results[5].box);
 const before=calls.length;await m.loadTodayBoxes(games,()=>true);assert.equal(calls.length,before,'cancellation stops new requests');
 global.fetch=async()=>({ok:true,json:async()=>({dates:[{games:[{gamePk:100,gameDate:'2026-05-01T23:30:00Z',teams:{away:{team:{id:116}},home:{team:{id:200}}}},{gamePk:101,gameDate:'2026-05-02T03:30:00Z',teams:{away:{team:{id:116}},home:{team:{id:200}}}}]}]})});
 const schedule=await m.loadTaiwanSchedule([{currentTeam:{id:116}},{currentTeam:{id:116}}],'2026-05-02');assert.equal(schedule.byTeam[116].length,2);assert.equal(schedule.games.length,2);
 console.log('PASS Taiwan today: zero appearances vs zero stats, two-way, innings, doubleheaders, local date, concurrency, per-game failure and cancellation');
})().catch(e=>{console.error(e);process.exitCode=1});
