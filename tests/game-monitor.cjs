const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),cp=require('child_process');
const root=process.cwd();
for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.js')).concat(['worker/src/index.js','worker/src/game-monitor.js','worker/src/mlb.js','worker/src/push-service.js','worker/src/prefs.js','worker/src/device-registry.js']))cp.execFileSync('node',['--check',f]);
let snapshot;const sends=[];let failed=new Set();
const ctx={console,Response,Request,URL,Date,DurableObject:class{},fetchGameSnapshot:async()=>structuredClone(snapshot),isFinalGame:s=>/final/i.test(s?.abstractState||''),isLiveGame:s=>/live/i.test(s?.abstractState||''),isCalledOffGame:s=>['D','C','X'].includes(s?.codedState)};
vm.createContext(ctx);vm.runInContext('function on(t,n,f,o){t.addEventListener(n,f,o)}; var ManagedResizeObserver=typeof ResizeObserver!=="undefined"?ResizeObserver:null;',ctx);vm.runInContext(fs.readFileSync('worker/src/prefs.js','utf8').replace(/^export /gm,''),ctx);let src=fs.readFileSync('worker/src/game-monitor.js','utf8').replace(/^import[\s\S]*?;$/gm,'').replace('export class GameMonitor','globalThis.GameMonitor = class GameMonitor');vm.runInContext(src,ctx);
function monitor(){const data=new Map();let alarm=null;const storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const [key,val]of Object.entries(k))data.set(key,structuredClone(val));else data.set(k,structuredClone(v));},setAlarm:async a=>alarm=a,deleteAlarm:async()=>alarm=null,getAlarm:async()=>alarm};return {m:new ctx.GameMonitor({storage},{PUSH_SERVICE:{idFromName:n=>{assert.equal(n,'global');return n},get:()=>({fetch:async r=>{assert.equal(new URL(r.url).pathname,'/send');const b=await r.json();sends.push(b);return Response.json({results:b.subscriptions.map(s=>({endpoint:s.endpoint,ok:!failed.has(s.endpoint),expired:s.endpoint.includes('expired')}))});}})}}),data,storage,get alarm(){return alarm}}}
const base=(state='Preview',a=0,h=0)=>({gamePk:123,abstractState:state,gameDate:new Date(Date.now()+4*60000).toISOString(),awayName:'A',homeName:'H',awayScore:a,homeScore:h});
const watch=(id)=>new Request('https://internal/watch',{method:'POST',body:JSON.stringify({gamePk:123,deviceId:id,subscription:{endpoint:'https://push/'+id,keys:{p256dh:'x',auth:'y'}}})});
(async()=>{
const o=monitor();snapshot=base();await o.m.watch(watch('one'));assert.equal(sends[0].payload.stage,'subscription');assert.equal(sends[0].payload.title,'A vs H｜訂閱成功');assert.equal(sends.at(-1).payload.stage,'pregame5');assert(o.alarm);const n=sends.length;await o.m.checkGame();assert.equal(sends.length,n);await o.m.watch(watch('one'));assert.equal(sends.length,n,'duplicate watch resent confirmation');
snapshot=base('Live');await o.m.checkGame();assert.equal(sends.at(-1).payload.stage,'start');assert(o.alarm-Date.now()<=5000);
snapshot=base('Live',1,0);await o.m.checkGame();assert.equal(sends.at(-1).payload.stage,'score');snapshot=base('Live',1,2);await o.m.checkGame();assert.equal(sends.at(-1).payload.stage,'score');
snapshot=base('Final',1,3);const before=sends.length;await o.m.checkGame();assert.deepEqual(sends.slice(before).map(x=>x.payload.stage),['score','final']);assert.equal(o.data.get('subscribers').length,0);assert.equal(o.alarm,null);
const late=monitor();snapshot=base('Live',4,3);const l=sends.length;await late.m.watch(watch('late'));assert.deepEqual(sends.slice(l).map(x=>x.payload.stage),['subscription'],'late subscriber received old score/start');
snapshot=base('Live',5,3);await late.m.watch(watch('new'));const recent=sends.at(-1);assert.equal(recent.payload.stage,'score');assert.deepEqual(recent.subscriptions.map(s=>s.endpoint),['https://push/late']);
failed.add('https://push/late');snapshot=base('Final',6,3);const r=sends.length;await late.m.checkGame();assert.deepEqual(sends.slice(r).map(x=>x.payload.stage),['score','final']);assert.equal(sends.at(-1).subscriptions.length,1);assert.equal(late.data.get('subscribers').length,1);assert(late.alarm);
failed.clear();const rr=sends.length;await late.m.checkGame();assert.deepEqual(sends.slice(rr).map(x=>x.payload.stage),['score','final']);assert.equal(late.data.get('subscribers').length,0);
const far=monitor();snapshot={...base(),gameDate:new Date(Date.now()+3600000).toISOString()};await far.m.watch(watch('far'));assert.equal(far.alarm,Date.parse(snapshot.gameDate)-300000);let status=await (await far.m.watchStatus(new Request('https://internal/watch/status?deviceId=far'))).json();assert(status.subscribed);await far.m.unwatch(new Request('https://internal/watch',{method:'DELETE',body:JSON.stringify({deviceId:'far'})}));assert.equal(far.alarm,null);status=await(await far.m.watchStatus(new Request('https://internal/watch/status?deviceId=far'))).json();assert.equal(status.subscribed,false);
const confirmation=monitor();snapshot={...base(),gameDate:new Date(Date.now()+3600000).toISOString()};failed.add('https://push/retry');await confirmation.m.watch(watch('retry'));assert.equal(confirmation.data.get('subscribers')[0].sent.subscription,false);assert(confirmation.alarm-Date.now()<=30000);failed.clear();const retryCount=sends.length;await confirmation.m.checkGame();assert.deepEqual(sends.slice(retryCount).map(x=>x.payload.stage),['subscription']);assert.equal(confirmation.data.get('subscribers')[0].sent.subscription,true);await confirmation.m.unwatch(new Request('https://internal/watch',{method:'DELETE',body:JSON.stringify({deviceId:'retry'})}));const resubCount=sends.length;await confirmation.m.watch(watch('retry'));assert.deepEqual(sends.slice(resubCount).map(x=>x.payload.stage),['subscription']);
const legacy=monitor();snapshot=base('Live',2,1);await legacy.storage.put({gamePk:123,lastSnapshot:snapshot,subscribers:[{deviceId:'old',subscription:{endpoint:'https://push/old'},sent:{start:true,pregame5:true,final:false}}]});const oldCount=sends.length;await legacy.m.checkGame();assert.equal(sends.length,oldCount,'legacy subscription received confirmation');

// v2.1.0 提醒項目：每個裝置可關閉個別事件，舊訂閱維持全部開啟。
const watchWith=(id,extra)=>new Request('https://internal/watch',{method:'POST',body:JSON.stringify({gamePk:123,deviceId:id,subscription:{endpoint:'https://push/'+id,keys:{p256dh:'x',auth:'y'}},...extra})});
const quiet=monitor();snapshot=base();let mark=sends.length;
await quiet.m.watch(watchWith('quiet',{confirm:false,prefs:{pregame5:false,start:false,homeScore:false,awayScore:true,final:false}}));
assert.equal(sends.length,mark,'confirm:false / pregame5:false still pushed');
let st=await(await quiet.m.watchStatus(new Request('https://internal/watch/status?deviceId=quiet'))).json();assert.deepEqual(st.prefs,{pregame5:false,start:false,homeScore:false,awayScore:true,final:false});
snapshot=base('Live');await quiet.m.checkGame();assert.equal(sends.length,mark,'start pushed although disabled');
snapshot=base('Live',0,1);await quiet.m.checkGame();assert.equal(sends.length,mark,'home score pushed although disabled');
assert.deepEqual(quiet.data.get('subscribers')[0].lastScore,{awayScore:0,homeScore:1},'disabled side must still move the baseline');
snapshot=base('Live',1,1);await quiet.m.checkGame();assert.equal(sends.length,mark+1);assert.equal(sends.at(-1).payload.title,'A 得分');assert.equal(sends.at(-1).payload.side,'away');
// 事後打開「比賽開始」不補發已經發生的開賽通知。
await quiet.m.watch(watchWith('quiet',{prefs:{pregame5:false,start:true,homeScore:false,awayScore:true,final:false}}));assert.equal(sends.length,mark+1,'re-enabled start fired retroactively');
snapshot=base('Final',1,2);await quiet.m.checkGame();assert.equal(sends.length,mark+1,'home score or final pushed although disabled');
assert.equal(quiet.data.get('subscribers').length,0,'final-off subscriber not cleaned up');assert.equal(quiet.alarm,null);
// 同場不同設定：主隊得分只送給有開啟的裝置，訂閱成功內容反映提醒項目。
const mixed=monitor();snapshot=base('Live',0,0);mark=sends.length;
await mixed.m.watch(watchWith('all'));assert.equal(sends.at(-1).payload.stage,'subscription');assert(sends.at(-1).payload.body.includes('主隊得分'));
await mixed.m.watch(watchWith('awayonly',{prefs:{homeScore:false}}));const conf=sends.at(-1);assert.equal(conf.payload.stage,'subscription');assert(!conf.payload.body.includes('主隊得分'));assert(conf.payload.body.includes('客隊得分'));
snapshot=base('Live',0,2);await mixed.m.checkGame();assert.equal(sends.at(-1).payload.title,'H 得分');assert.deepEqual(sends.at(-1).subscriptions.map(s=>s.endpoint),['https://push/all']);
snapshot=base('Live',3,2);await mixed.m.checkGame();assert.equal(sends.at(-1).payload.title,'A 得分');assert.deepEqual(sends.at(-1).subscriptions.map(s=>s.endpoint).sort(),['https://push/all','https://push/awayonly']);
// 延賽／取消／被移出賽程：不發終場、清除訂閱與 Alarm；之後也不能再訂閱。
const off=monitor();snapshot={...base('Live',1,0)};await off.m.watch(watchWith('rain'));mark=sends.length;
snapshot={...base('Final',1,0),detailedState:'Postponed',codedState:'D'};await off.m.checkGame();assert.equal(sends.length,mark,'called-off game pushed a notification');assert.equal(off.data.get('subscribers').length,0);assert.equal(off.alarm,null);
const removed=monitor();snapshot={...base('Other'),detailedState:'Unknown',codedState:'X'};const rejected=await removed.m.watch(watchWith('gone'));assert.equal(rejected.status,409);assert.equal((await rejected.json()).error,'GAME_CALLED_OFF');
console.log('PASS: per-device prefs (pregame/start/home/away/final), silent baseline, no retroactive start, mixed prefs routing, confirm:false, called-off cleanup; subscription confirmation, retry, duplicate suppression, resubscribe, legacy compatibility;  JS syntax, pregame, start, both scores, score-before-final, cleanup, late baseline, per-device baseline, failed score retry, status, cancel, alarms, DO forwarding');
})().catch(e=>{console.error(e);process.exit(1)});

