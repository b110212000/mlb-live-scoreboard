const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
(async()=>{
const feed={gamePk:123,gameData:{game:{pk:123},datetime:{dateTime:'2026-10-07T23:30:00Z'},status:{abstractGameState:'Final'}}};
let loaded,rendered,err='',replaced;const ctx={URL,Number,location:{href:'https://site.test/app/?view=live&gamePk=123'},history:{replaceState:(a,b,u)=>replaced=u},state:{loading:false},els:{dateInput:{}},API:'https://mlb.test/api',getJSON:async()=>feed,gameLocalDateKey:({gameDate})=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(gameDate)),renderGame:f=>rendered=f,markUpdated(){},showError:m=>err=m,loadSchedule:async(...args)=>{loaded=args;return true}};
vm.createContext(ctx);const source=fs.readFileSync('live.js','utf8');vm.runInContext(source.slice(source.indexOf('async function loadInitialGame()')),ctx);await ctx.loadInitialGame();assert.equal(ctx.els.dateInput.value,'2026-10-08');assert.equal(ctx.state.selectedGamePk,123);assert.equal(rendered,feed);assert.deepEqual(loaded,[true,123]);assert(!new URL(replaced).searchParams.has('gamePk'));assert.equal(ctx.state.loading,false);
ctx.location.href='https://site.test/app/?gamePk=bad';await ctx.loadInitialGame();assert(err.includes('無效'));
ctx.location.href='https://site.test/app/?gamePk=123';ctx.getJSON=async()=>{throw Error('offline')};loaded=null;await ctx.loadInitialGame();assert.equal(loaded,null);assert(err.includes('offline'));assert(!ctx.state.loading);assert(ctx.state.notificationGamePending);
const listeners={},scope='https://site.test/app/';let notice,opened,focused,navigated;let clients=[];
const sw={URL,Number,console,self:{registration:{scope,showNotification:async(t,o)=>notice=o},addEventListener:(n,f)=>listeners[n]=f,clients:{matchAll:async()=>clients,openWindow:async u=>opened=u}}};vm.createContext(sw);vm.runInContext(fs.readFileSync('service-worker.js','utf8'),sw);
let promise;listeners.push({data:{json:()=>({gamePk:123,url:'./?view=live',title:'Score'})},waitUntil:p=>promise=p});await promise;assert.equal(new URL(notice.data.url).searchParams.get('gamePk'),'123');
const click=async()=>{listeners.notificationclick({notification:{data:notice.data,close(){}},waitUntil:p=>promise=p});await promise;};
await click();assert.equal(opened,notice.data.url);
opened=null;clients=[{url:'https://site.test/other/',navigate:async()=>{throw Error('must not touch other project')},focus(){}},{url:scope,navigate:async u=>{navigated=u;return {focus:async()=>focused=true}},focus(){}}];await click();assert.equal(navigated,notice.data.url);assert(focused);assert.equal(opened,null);
clients=[{url:scope,navigate:async()=>{throw Error('closed')},focus(){throw Error('must not focus wrong page')}}];await click();assert.equal(opened,notice.data.url);
console.log('PASS notification links: Taiwan cross-date + Final target, invalid ID/network error, URL consumed, payload gamePk fallback, cold open, existing app navigation, other project exclusion, failed navigation fallback');
})().catch(e=>{console.error(e);process.exit(1)});
