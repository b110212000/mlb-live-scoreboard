const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const strip=src=>src.replace(/^import[\s\S]*?;$/gm,'').replace(/^export \{[^}]*\} from "[^"]+";$/gm,'').replace(/^export (default )?/gm,(m,d)=>d?'globalThis.workerEntry = ':'');

// mlb.js：延賽 / 取消 / 移出賽程不能被當成終場。
const mlb={};vm.createContext(mlb);vm.runInContext(strip(fs.readFileSync('worker/src/mlb.js','utf8')),mlb);
assert.equal(mlb.isFinalGame({abstractState:'Final',detailedState:'Final',codedState:'F'}),true);
assert.equal(mlb.isFinalGame({abstractState:'Final',detailedState:'Postponed',codedState:'D'}),false,'postponed treated as final');
assert.equal(mlb.isCalledOffGame({abstractState:'Final',detailedState:'Postponed',codedState:'D'}),true);
assert.equal(mlb.isCalledOffGame({abstractState:'Other',detailedState:'Unknown',codedState:'X'}),true);
assert.equal(mlb.isCalledOffGame({abstractState:'Live',detailedState:'In Progress',codedState:'I'}),false);

const now=Date.now(),iso=ms=>new Date(ms).toISOString();
const schedule=new Map();let teamGames=[];const mlbCalls=[];
const sched=(pk,{type='L',away=119,home=158,state='Preview',detailed='Scheduled',coded='S',at=now+86400000}={})=>({gamePk:pk,gameType:type,gameDate:iso(at),status:{abstractGameState:state,detailedState:detailed,codedGameState:coded},teams:{away:{team:{id:away}},home:{team:{id:home}}}});
const monitorCalls=[];const monitorStatus=new Map();
const ctx={console,Response,Request,URL,Date,JSON,Map,Set,Number,String,Object,Array,Promise,Infinity,DurableObject:class{},
  fetch:async url=>{const u=new URL(url);mlbCalls.push(u);
    if(u.searchParams.has('gamePks')){const pks=u.searchParams.get('gamePks').split(',').map(Number);return Response.json({dates:[{games:pks.map(pk=>schedule.get(pk)).filter(Boolean)}]})}
    if(u.searchParams.has('teamId'))return Response.json({dates:[{games:teamGames}]});
    return new Response('',{status:404})}};
vm.createContext(ctx);
vm.runInContext(strip(fs.readFileSync('worker/src/prefs.js','utf8')),ctx);
vm.runInContext(strip(fs.readFileSync('worker/src/device-registry.js','utf8')).replace('class DeviceRegistry','globalThis.DeviceRegistry = class DeviceRegistry'),ctx);

function registry(){
  const data=new Map();let alarm=null;
  const storage={get:async k=>Array.isArray(k)?new Map(k.filter(x=>data.has(x)).map(x=>[x,structuredClone(data.get(x))])):structuredClone(data.get(k)),
    put:async(k,v)=>{if(typeof k==='object')for(const [key,val] of Object.entries(k))data.set(key,structuredClone(val));else data.set(k,structuredClone(v))},
    setAlarm:async a=>alarm=a,deleteAlarm:async()=>alarm=null,getAlarm:async()=>alarm};
  const env={GAME_MONITOR:{idFromName:n=>n,get:id=>({fetch:async req=>{const body=await req.json().catch(()=>({}));const call={pk:Number(id),method:req.method,path:new URL(req.url).pathname,body};monitorCalls.push(call);
    const status=monitorStatus.get(Number(id))||200;
    if(req.method==='POST')return Response.json(status===200?{ok:true,subscribed:true,snapshot:{gameDate:schedule.get(Number(id))?.gameDate||iso(now+3600000)}}:{error:status===409?'GAME_FINAL':'BOOM'},{status});
    return Response.json({ok:true,subscribed:false})}})}};
  const r=new ctx.DeviceRegistry({storage},env);
  const call=async(method,path,body)=>{const res=await r.fetch(new Request('https://registry.internal'+path+'?deviceId=device-abc-123',{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}));return {status:res.status,data:await res.json()}};
  return {r,call,data,get alarm(){return alarm}};
}
const sub=endpoint=>({endpoint:'https://push.example/'+endpoint,keys:{p256dh:'p',auth:'a'}});
const lastWatch=pk=>monitorCalls.filter(c=>c.pk===pk&&c.method==='POST').at(-1);
const ALL={pregame5:true,start:true,homeScore:true,awayScore:true,final:true};

(async()=>{
  const d=registry();
  let res=await d.call('GET','/state');assert.equal(res.status,200);assert.deepEqual(res.data.defaults,ALL);assert.deepEqual(res.data.games,[]);assert.deepEqual(res.data.teams,[]);

  // 沒有推播訂閱不能新增場次。
  res=await d.call('POST','/games',{gamePk:1});assert.equal(res.status,400);assert.equal(res.data.error,'PUSH_SUBSCRIPTION_REQUIRED');

  // 手動訂閱（鈴鐺）：發訂閱成功、使用預設提醒項目、設定同步 Alarm。
  schedule.set(1,sched(1));
  res=await d.call('POST','/games',{gamePk:1,subscription:sub('one')});assert.equal(res.status,200);
  assert.equal(lastWatch(1).body.confirm,true);assert.deepEqual(lastWatch(1).body.prefs,ALL);assert.equal(lastWatch(1).body.deviceId,'device-abc-123');
  assert.deepEqual(res.data.games.map(g=>[g.gamePk,g.source,g.custom]),[[1,'manual',false]]);assert(d.alarm);

  // 舊版訂閱搬入清單不重發訂閱成功。
  schedule.set(2,sched(2,{at:now+2*86400000}));
  await d.call('POST','/games',{gamePk:2,import:true});assert.equal(lastWatch(2).body.confirm,false);

  // 修改預設：只同步沒有自訂的場次。
  res=await d.call('PUT','/games/2/prefs',{prefs:{final:false}});assert.equal(res.data.games.find(g=>g.gamePk===2).custom,true);assert.equal(lastWatch(2).body.prefs.final,false);
  const before2=monitorCalls.filter(c=>c.pk===2).length;
  res=await d.call('PUT','/defaults',{prefs:{homeScore:false}});assert.equal(res.data.defaults.homeScore,false);
  assert.equal(lastWatch(1).body.prefs.homeScore,false,'default change not propagated');assert.equal(monitorCalls.filter(c=>c.pk===2).length,before2,'custom game followed defaults');
  // 自訂改回與預設相同 → 視為使用預設。
  res=await d.call('PUT','/games/2/prefs',{prefs:{homeScore:false,final:true}});assert.equal(res.data.games.find(g=>g.gamePk===2).custom,false);
  res=await d.call('PUT','/games/2/prefs',{prefs:{start:false}});assert.equal(res.data.games.find(g=>g.gamePk===2).custom,true);
  res=await d.call('PUT','/games/2/prefs',{prefs:null});assert.equal(res.data.games.find(g=>g.gamePk===2).custom,false);assert.equal(lastWatch(2).body.prefs.start,true);
  res=await d.call('PUT','/games/99/prefs',{prefs:{start:false}});assert.equal(res.status,404);

  // 已終場的場次（GameMonitor 回 409）不加入清單。
  schedule.set(3,sched(3));monitorStatus.set(3,409);
  res=await d.call('POST','/games',{gamePk:3});assert.equal(res.status,409);assert.equal(res.data.error,'GAME_FINAL');assert(!res.data.games.some(g=>g.gamePk===3));

  // 追蹤球隊：只自動訂閱進行中/未開打的季後賽，不發訂閱成功。
  teamGames=[sched(10),sched(11,{state:'Final',detailed:'Final',coded:'F'}),sched(12,{type:'R'}),sched(13,{state:'Final',detailed:'Postponed',coded:'D'}),sched(14,{away:147,home:158}),sched(1)];
  for(const g of teamGames)schedule.set(g.gamePk,g);
  res=await d.call('POST','/teams',{teamId:119});assert.equal(res.status,200);assert.deepEqual(res.data.added,[10]);
  assert.equal(lastWatch(10).body.confirm,false);assert.deepEqual(res.data.teams.map(t=>t.teamId),[119]);
  const teamQuery=mlbCalls.filter(u=>u.searchParams.has('teamId')).at(-1);assert.equal(teamQuery.searchParams.get('teamId'),'119');assert.equal(teamQuery.searchParams.get('gameType'),'F,D,L,W,P');
  assert.deepEqual(res.data.games.find(g=>g.gamePk===1).teamIds,[119],'manual game not linked to followed team');
  assert.equal(res.data.games.find(g=>g.gamePk===10).source,'team');
  res=await d.call('POST','/teams',{teamId:999});assert.equal(res.status,400);

  // 使用者取消的球隊場次不會被自動同步加回；重新按鈴鐺則可以。
  res=await d.call('DELETE','/games/10');assert.equal(res.status,200);assert(!res.data.games.some(g=>g.gamePk===10));
  assert.equal(monitorCalls.at(-1).method,'DELETE');assert.equal(monitorCalls.at(-1).body.deviceId,'device-abc-123');
  res=await d.call('POST','/sync');assert.deepEqual(res.data.added,[]);assert(!res.data.games.some(g=>g.gamePk===10));
  res=await d.call('POST','/games',{gamePk:10});assert(res.data.games.some(g=>g.gamePk===10&&g.source==='manual'));

  // 取消追蹤：只移除因追蹤而自動加入的場次。
  teamGames=[sched(15),sched(1)];schedule.set(15,teamGames[0]);
  res=await d.call('POST','/sync');assert.deepEqual(res.data.added,[15]);
  res=await d.call('DELETE','/teams/119');assert.deepEqual(res.data.teams,[]);
  assert(!res.data.games.some(g=>g.gamePk===15),'team-only game kept after unfollow');
  assert(res.data.games.some(g=>g.gamePk===1)&&res.data.games.some(g=>g.gamePk===10),'manual game removed by unfollow');

  // 同步清理：終場移除、延賽取消訂閱、移出賽程且時間已過才移除。
  schedule.set(1,sched(1,{state:'Final',detailed:'Final',coded:'F'}));
  schedule.set(10,sched(10,{state:'Final',detailed:'Postponed',coded:'D'}));
  schedule.delete(2);
  const unwatchBefore=monitorCalls.filter(c=>c.method==='DELETE').length;
  res=await d.call('POST','/sync');
  assert(!res.data.games.some(g=>g.gamePk===1),'final game kept');assert(!res.data.games.some(g=>g.gamePk===10),'postponed game kept');
  assert.equal(monitorCalls.filter(c=>c.method==='DELETE').length,unwatchBefore+1,'postponed game not unwatched');
  assert(res.data.games.some(g=>g.gamePk===2),'missing future game removed too early');
  d.data.get('games')[2].gameDate=iso(now-7*3600000);d.data.set('games',{...d.data.get('games'),2:{...d.data.get('games')[2],gameDate:iso(now-7*3600000)}});
  res=await d.call('POST','/sync');assert.deepEqual(res.data.games,[]);assert.equal(d.alarm,null,'alarm kept with nothing to track');

  // 推播 endpoint 變更：既有場次改送新的 endpoint。
  schedule.set(4,sched(4));schedule.set(5,sched(5));
  await d.call('POST','/games',{gamePk:4});await d.call('POST','/games',{gamePk:5});
  res=await d.call('PUT','/subscription',{subscription:sub('two')});assert.equal(res.data.subscriptionEndpoint,'https://push.example/two');
  assert.equal(lastWatch(4).body.subscription.endpoint,'https://push.example/two');assert.equal(lastWatch(5).body.subscription.endpoint,'https://push.example/two');
  res=await d.call('PUT','/subscription',{subscription:{endpoint:'http://bad'}});assert.equal(res.status,400);

  // Alarm 會同步並重新排程。
  await d.r.alarm();assert(d.alarm>Date.now());

  // 同一個 Durable Object 不接受其他 deviceId。
  const other=await d.r.fetch(new Request('https://registry.internal/state?deviceId=someone-else'));assert.equal(other.status,409);

  // Worker 路由：轉送到以 deviceId 命名的 DeviceRegistry、驗證 deviceId、CORS 允許 PUT。
  const w={console,Response,Request,URL,JSON,Number,String,Boolean,caches:{default:{}},getGameHighlights:async()=>({})};vm.createContext(w);
  vm.runInContext(strip(fs.readFileSync('worker/src/index.js','utf8')),w);
  const forwarded=[];const env={FRONTEND_ORIGIN:'https://site.test',DEVICE_REGISTRY:{idFromName:n=>'id:'+n,get:id=>({fetch:async req=>{forwarded.push({id,url:new URL(req.url),method:req.method});return Response.json({ok:true})}})}};
  let wr=await w.workerEntry.fetch(new Request('https://worker.test/api/devices/device-abc-123/games/77/prefs',{method:'PUT',body:'{}'}),env);
  assert.equal(wr.status,200);assert.equal(forwarded[0].id,'id:device-abc-123');assert.equal(forwarded[0].url.pathname,'/games/77/prefs');assert.equal(forwarded[0].url.searchParams.get('deviceId'),'device-abc-123');assert.equal(forwarded[0].method,'PUT');
  assert.equal(wr.headers.get('access-control-allow-origin'),'https://site.test');
  wr=await w.workerEntry.fetch(new Request('https://worker.test/api/devices/bad%20id/state'),env);assert.equal(wr.status,400);
  wr=await w.workerEntry.fetch(new Request('https://worker.test/api/devices/device-abc-123/state',{method:'OPTIONS'}),env);assert(wr.headers.get('access-control-allow-methods').includes('PUT'));

  console.log('PASS device registry: manual/import add, defaults vs custom prefs, final 409, team follow (postseason only, no confirmation), dismissed games, unfollow cleanup, sync pruning (final/postponed/missing), endpoint migration, alarm, device isolation, router + CORS; mlb called-off detection');
})().catch(e=>{console.error(e);process.exit(1)});
