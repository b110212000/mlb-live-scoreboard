const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const strip=src=>src.replace(/^import[\s\S]*?;$/gm,'').replace(/^export \{[^}]*\} from "[^"]+";$/gm,'').replace(/^export (default )?/gm,(m,d)=>d?'globalThis.workerEntry = ':'');
// 模擬 MLB 各層級名單與批次成績。
const lists={
  1:[{id:1,fullName:'Hao-Yu Lee',birthCountry:'Taiwan',primaryPosition:{abbreviation:'2B',type:'Infielder'}},{id:9,fullName:'Someone Else',birthCountry:'USA'}],
  11:[{id:1,fullName:'Hao-Yu Lee',birthCountry:'Taiwan',primaryPosition:{abbreviation:'2B',type:'Infielder'}},{id:2,fullName:'Wei-En Lin',birthCountry:'Taiwan',primaryPosition:{abbreviation:'P',type:'Pitcher'}}],
  12:[],13:[],14:[{id:3,fullName:'Ching-Hsien Ko',birthCountry:'Taiwan',primaryPosition:{abbreviation:'OF',type:'Outfielder'}}],16:[]
};
const stat=(sportId,team,group,s)=>({group:{displayName:group},splits:[{sport:{id:sportId},team:{id:team,name:'Team '+team},stat:s}]});
const people={
  1:[{id:1,currentTeam:{id:116,name:'Detroit Tigers'},stats:[stat(1,116,'hitting',{gamesPlayed:114,avg:'.263',homeRuns:12,rbi:50,ops:'.750',extra:'x'})]}],
  11:[{id:1,currentTeam:{id:116,name:'Detroit Tigers'},stats:[stat(11,512,'hitting',{gamesPlayed:14,avg:'.232',homeRuns:3})]},
      {id:2,currentTeam:{id:400,name:'Las Vegas Aviators',parentOrgId:133,parentOrgName:'Athletics'},stats:[stat(11,400,'pitching',{gamesPlayed:20,era:'3.10',strikeOuts:80,wins:5,losses:3,inningsPitched:'90.0'})]}],
  14:[{id:3,currentTeam:{id:6482,name:'Rancho Cucamonga Quakes',parentOrgId:119},stats:[stat(14,6482,'hitting',{gamesPlayed:60,avg:'.280'})]}]
};
const calls=[];
const ctx={console,Response,Request,URL,Headers,JSON,Number,String,Object,Array,Math,Map,Set,Promise,
  fetch:async url=>{const u=new URL(url);calls.push(u);
    const m=u.pathname.match(/\/v1\/sports\/(\d+)\/players$/);
    if(m)return Response.json({people:lists[m[1]]||[]});
    if(u.pathname.endsWith('/v1/people')){const sid=Number(u.searchParams.get('hydrate').match(/sportId=(\d+)/)[1]);return Response.json({people:people[sid]||[]})}
    return new Response('',{status:404})}};
vm.createContext(ctx);vm.runInContext(strip(fs.readFileSync('worker/src/taiwan.js','utf8')),ctx);

(async()=>{
  const data=await ctx.buildTaiwanPlayers(2026);
  assert.deepEqual([...data.players.map(p=>p.fullName)],['Hao-Yu Lee','Wei-En Lin','Ching-Hsien Ko'],'sorted by highest level, Taiwan-born only');
  const lee=data.players[0];
  assert.deepEqual([...lee.levels.map(l=>l.label)],['MLB','3A']);
  assert.equal(lee.levels[0].hitting.gamesPlayed,114);assert.equal(lee.levels[0].hitting.extra,undefined,'only whitelisted stat fields');
  assert.equal(lee.levels[1].hitting.avg,'.232');assert.equal(lee.levels[1].team.name,'Team 512');
  assert.equal(lee.currentTeam.name,'Detroit Tigers');
  const lin=data.players[1];assert(lin.pitcher);assert.equal(lin.levels[0].pitching.era,'3.10');assert.equal(lin.currentTeam.parentOrgId,133);
  // 小聯盟成績的查詢要帶 sportId；名單只取需要的欄位。
  assert(calls.some(u=>u.pathname.endsWith('/v1/people')&&u.searchParams.get('hydrate').includes('sportId=11')));
  assert(calls.filter(u=>/\/players$/.test(u.pathname)).every(u=>u.searchParams.get('fields').includes('birthCountry')));
  // 不在任何層級出現的層級不查成績。
  assert(!calls.some(u=>u.pathname.endsWith('/v1/people')&&/sportId=12\)/.test(u.searchParams.get('hydrate'))));

  // 快取：第二次直接回傳快取，不再呼叫 MLB。
  const store=new Map();const cache={match:async k=>store.get(k.url)?.clone(),put:async(k,v)=>store.set(k.url,v)};
  let before=calls.length;await (await ctx.taiwanPlayersResponse(2026,cache)).json();const after=calls.length;assert(after>before);
  const again=await (await ctx.taiwanPlayersResponse(2026,cache)).json();assert.equal(calls.length,after,'second request should hit cache');assert.equal(again.players.length,3);

  // Worker 路由：CORS 與 season 驗證。
  const w={...ctx,Boolean,TextEncoder,caches:{default:cache},getGameHighlights:async()=>({}),gameCalendarResponse:async()=>null};vm.createContext(w);
  vm.runInContext(strip(fs.readFileSync('worker/src/taiwan.js','utf8')),w);
  vm.runInContext(strip(fs.readFileSync('worker/src/index.js','utf8')),w);
  const env={FRONTEND_ORIGIN:'https://b110212000.github.io'};
  let res=await w.workerEntry.fetch(new Request('https://worker.test/api/taiwan-players?season=2026'),env);
  assert.equal(res.status,200);assert.equal(res.headers.get('access-control-allow-origin'),'https://b110212000.github.io');assert.equal((await res.json()).players.length,3);
  res=await w.workerEntry.fetch(new Request('https://worker.test/api/taiwan-players?season=1800'),env);assert.equal(res.status,400);
  console.log('PASS taiwan players: birthCountry filter across levels, merged levels sorted by highest level, per-level stats with sportId, whitelisted fields, parent org, 3h cache, route + CORS + season validation');
})().catch(e=>{console.error(e);process.exit(1)});
