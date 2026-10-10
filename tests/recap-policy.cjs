const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
(async()=>{
 const saved=new Map(),events={},requests=[];let html='',writes=0;
 const list={get innerHTML(){return html},set innerHTML(v){html=v;writes++},insertAdjacentHTML:(pos,v)=>{html+=v},addEventListener:(n,f)=>events[n]=f};
 const ctx={els:{recapList:list,recapSummary:{}},state:{selectedGamePk:123,currentFeedGamePk:123,currentFeed:{gameData:{teams:{away:{id:119},home:{id:144}},status:{abstractGameState:'Final'}}}},PUSH_API:'https://worker.test',
 sessionStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},syncLiveDetailHeight(){},esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),requestAnimationFrame:f=>f(),AbortSignal,console,Date,Map,
 fetch:async u=>{requests.push(u);return {ok:true,json:async()=>({status:'setup-required',videos:[],sourceLinks:[{label:'MLB',url:'https://www.youtube.com/@MLB/search?query=123'}]})}},navigator:{userAgent:'desktop'}};
 vm.createContext(ctx);vm.runInContext('function on(t,n,f,o){t.addEventListener(n,f,o)}; var ManagedResizeObserver=typeof ResizeObserver!=="undefined"?ResizeObserver:null;',ctx);vm.runInContext(fs.readFileSync('src/engine/highlights.js','utf8'),ctx);
 await ctx.loadGameRecap();assert.equal(requests.length,0);assert(!html.includes('<img'));assert(html.includes('同意並查看'));
 const count=writes;await ctx.loadGameRecap();assert.equal(writes,count,'polling must keep consent button DOM stable');
 events.click({target:{closest:()=>({dataset:{recapConsent:'accept'}})}});await new Promise(r=>setImmediate(r));assert.equal(requests.length,1);assert(html.includes('尚未啟用'));assert(html.includes('前往 MLB'));
 ctx.renderGameRecap({status:'ready',fetchedAt:Date.now(),officialDate:'2026-10-07',videos:[{id:'cv8qfCAzrmM',channelId:'UCoLrcjPV5PbUrUyXq5mjc_A',channelTitle:'MLB',title:'Original <title>',description:'完整介紹\nSubscribe! <script>bad</script>',titleZh:'不該使用',thumbnail:'https://i.ytimg.com/vi/cv8qfCAzrmM/hqdefault.jpg'}]});
 assert(html.includes('Original &lt;title>'));assert(html.includes('Subscribe!'));assert(html.includes('&lt;script>'));assert(!html.includes('不該使用'));assert(html.includes('YouTube ·'));assert(html.includes('referrerpolicy="no-referrer"'));
 ctx.renderGameRecap({videos:[{id:'cv8qfCAzrmM',title:'legacy'}]});assert(html.includes('正在更新'));assert(!html.includes('legacy'));
 events.click({target:{closest:()=>({dataset:{recapConsent:'withdraw'}})}});assert(!saved.has('mlb-youtube-consent'));assert(!html.includes('<img'));await ctx.loadGameRecap();assert.equal(requests.length,1);
 const source=fs.readFileSync('worker/src/index.js','utf8');assert(!source.includes('translateHighlights'));assert(!fs.readFileSync('worker/wrangler.jsonc','utf8').includes('"ai"'));
 console.log('PASS consent blocks API/thumbnails, stable consent DOM, original text, escaping, withdrawal, legacy response rejection, AI disconnected');
})().catch(e=>{console.error(e);process.exitCode=1;});
