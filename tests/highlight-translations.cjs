const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const {translateHighlights,parseTranslations,cleanVideoDescription}=await import('../worker/src/highlight-translations.js');
 const video={id:'cv8qfCAzrmM',kind:'full',title:'Dodgers vs. Braves Game 4 Highlights',description:"Game 4 highlights.\nDon't forget to subscribe! https://youtube.com/mlb"};
 const original=JSON.stringify(video);const data={videos:[video],officialDate:'2026-10-07'};
 const translated={id:video.id,titleZh:'道奇對勇士｜第 4 戰精華',descriptionZh:'回顧道奇與勇士第 4 戰的精彩表現。'};
 let calls=0;const ai={run:async(model,options)=>{calls++;assert(model.includes('qwen3'));assert(options.messages[0].content.includes('球員姓名保留'));assert(!options.messages[1].content.includes('subscribe'));return {choices:[{message:{content:JSON.stringify({videos:[translated]})}}]}}};
 const stored=new Map();const cache={match:async k=>stored.get(k.url)?.clone(),put:async(k,v)=>stored.set(k.url,v)};
 let result=await translateHighlights(data,ai,cache);assert.equal(result.videos[0].titleZh,translated.titleZh);assert.equal(result.videos[0].translationStatus,'ready');assert.equal(JSON.stringify(video),original);assert.equal(result.videos[0].title,video.title);
 await translateHighlights(data,ai,cache);assert.equal(calls,1,'cache must avoid repeat inference');
 await translateHighlights({videos:[{...video,title:video.title+' UPDATED'}]},ai,cache);assert.equal(calls,2,'changed text must miss cache');
 const failedCache=new Map();const fc={match:async k=>failedCache.get(k.url)?.clone(),put:async(k,v)=>failedCache.set(k.url,v)};
 const badAI={run:async()=>{calls++;throw Error('quota')}};result=await translateHighlights(data,badAI,fc);assert.equal(result.videos[0].translationStatus,'unavailable');assert.equal(result.videos[0].title,video.title);const before=calls;await translateHighlights(data,badAI,fc);assert.equal(calls,before);
 assert.equal((await translateHighlights(data,null)).videos[0].translationStatus,'unavailable');
 assert.equal(cleanVideoDescription('Event\\r\\n\\r\\nFollow us elsewhere: abc'),'Event');
 const parse=v=>parseTranslations({response:{videos:v}},[video]);assert.throws(()=>parse([{...translated,id:'wrong'}]));assert.throws(()=>parse([translated,translated]));assert.equal(parse([{...translated,titleZh:'道奇 99 比 0 勝出'}]).size,0);assert.equal(parse([{...translated,titleZh:'<script>中文</script>'}]).size,0);assert.equal(parse([{...translated,titleZh:'English only'}]).size,0);
 assert.throws(()=>parseTranslations({response:'not json'},[video]));
 // Simultaneous cache misses share an inference; both callers receive the result.
 let release,n=0;const pendingAI={run:()=>{n++;return new Promise(resolve=>release=()=>resolve({response:{videos:[translated]}}))}};
 const one=translateHighlights(data,pendingAI),two=translateHighlights(data,pendingAI);while(!release)await new Promise(r=>setImmediate(r));release();await Promise.all([one,two]);assert.equal(n,1);
 let html='';const ctx={console,Date,Map,Number,String,navigator:{userAgent:'iPhone'},requestAnimationFrame:f=>f(),syncLiveDetailHeight:()=>{},esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),els:{recapList:{set innerHTML(v){html=v}},recapSummary:{}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('highlights.js','utf8'),ctx);
 ctx.renderGameRecap({...data,videos:[{...video,...translated,translationStatus:'ready'}]});assert(html.includes('道奇對勇士'));assert(html.includes('<summary>英文原文'));assert(!html.includes('<details open'));assert(html.includes('youtube://'));assert(html.includes(video.title));
 ctx.renderGameRecap({...data,videos:[{...video,titleZh:'<img onerror="bad">中文',descriptionZh:'中文',translationStatus:'ready'}]});assert(html.includes('&lt;img'));assert(!html.includes('<img onerror='));
 ctx.renderGameRecap(data);assert(html.includes('翻譯暫時無法'));assert.equal(ctx.recapTeamName({id:119,name:'Dodgers'}),'道奇');
 console.log('PASS translation: schema/IDs/numbers, caching and invalidation, deduplication, unavailable fallback, original preservation, Chinese UI, escaped output');
})().catch(e=>{console.error(e);process.exit(1)});
