const assert=require('assert/strict');
(async()=>{
 const h=await import('../worker/src/highlights.js');
 const game={gamePk:849822,officialDate:'2026-10-07',gameDate:'2026-10-08T02:00:00Z',gameType:'D',seriesGameNumber:4,doubleHeader:'N',status:{abstractGameState:'Final'},teams:{away:{team:{id:119,name:'Los Angeles Dodgers',teamName:'Dodgers'}},home:{team:{id:144,name:'Atlanta Braves',teamName:'Braves'}}}};
 const eng={id:'cv8qfCAzrmM',title:'Dodgers vs. Braves Game 4 Highlights (10/7/26)',description:'Original text\nSubscribe!'};
 const zh={id:'yZmo93vuZAU',title:'【MLB】道奇勇士第4戰 / 愛爾達電視20261008',description:'原始介紹'};
 assert(h.matchesGame(eng,game));assert(h.matchesGame(zh,game,true));
 assert(!h.matchesGame({...eng,title:eng.title.replace('Game 4','Game 3')},game));
 assert(!h.matchesGame({...eng,title:'Dodgers vs. Braves 10/6/26'},game));
 assert(!h.matchesGame({...zh,title:zh.title.replace('勇士','洋基')},game,true));
 assert(!h.matchesGame({...zh,title:'【MLB】道奇勇士轉播預告20261008'},game,true));
 assert(!h.matchesGame({...eng,title:'Dodgers vs. Braves October 7 2026'}, {...game,doubleHeader:'Y',gameNumber:2}));
 const elta='UCabcdefghijklmnopqrstuv';
 function item(v,c){return {id:v.id,status:{privacyStatus:'public'},snippet:{channelId:c,channelTitle:c===elta?'愛爾達體育家族 ELTA Sports':'MLB',liveBroadcastContent:'none',title:v.title,description:v.description,thumbnails:{high:{url:`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,width:480,height:360}}}};}
 assert.equal(h.publicVideo(item(eng,h.MLB_CHANNEL_ID),h.MLB_CHANNEL_ID).description,eng.description);
 assert.equal(h.publicVideo(item(eng,elta),h.MLB_CHANNEL_ID),null);
 let p=item(eng,h.MLB_CHANNEL_ID);p.status.privacyStatus='private';assert.equal(h.publicVideo(p,h.MLB_CHANNEL_ID),null);
 p=item(eng,h.MLB_CHANNEL_ID);p.snippet.thumbnails.high.url='https://evil.test/x';assert.equal(h.publicVideo(p,h.MLB_CHANNEL_ID),null);
 const calls=[];let fail=false;
 global.fetch=async(url,opts={})=>{
  const u=new URL(url);calls.push(u);
  if(u.hostname==='statsapi.mlb.com')return Response.json({dates:[{games:[game]}]});
  assert.equal(u.hostname,'www.googleapis.com','HTML scraping must never be called');assert.equal(opts.headers['X-Goog-Api-Key'],'test-secret');assert(!u.href.includes('test-secret'));
  if(u.pathname.endsWith('/channels'))return Response.json({items:[{id:elta,snippet:{customUrl:'@ELTASPORTSHD'}}]});
  if(u.pathname.endsWith('/search')){
   if(fail&&u.searchParams.get('channelId')===elta)return new Response('',{status:403});
   const c=u.searchParams.get('channelId');return Response.json({items:[{id:{videoId:c===elta?zh.id:eng.id},snippet:{channelId:c}}]});
  }
  if(u.pathname.endsWith('/videos'))return Response.json({items:[u.searchParams.get('id')===zh.id?item(zh,elta):item(eng,h.MLB_CHANNEL_ID)]});
  throw Error('Unexpected request');
 };
 const saved=new Map();const cache={match:async key=>saved.get(key.url)?.clone(),put:async(key,value)=>saved.set(key.url,value.clone())};
 let result=await h.getGameHighlights(849822,cache,{});assert.equal(result.status,'setup-required');assert.equal(calls.length,1);assert.equal(result.sourceLinks.length,2);
 calls.length=0;
 const both=await Promise.all([h.getGameHighlights(849822,cache,{YOUTUBE_API_KEY:'test-secret'}),h.getGameHighlights(849822,cache,{YOUTUBE_API_KEY:'test-secret'})]);result=both[0];
 assert.equal(result.videos.length,2);assert.equal(result.videos[0].title,zh.title);assert.equal(result.videos[1].description,eng.description);assert.equal(result.status,'ready');
 assert.equal(calls.filter(u=>u.pathname.endsWith('/search')).length,2,'duplicate inference/search on concurrent requests');
 calls.length=0;await h.getGameHighlights(849822,cache,{YOUTUBE_API_KEY:'test-secret'});assert.equal(calls.filter(u=>u.hostname==='www.googleapis.com').length,0);
 saved.clear();fail=true;result=await h.getGameHighlights(849822,cache,{YOUTUBE_API_KEY:'test-secret'});assert.equal(result.status,'ready');assert.equal(result.partial,true);assert.equal(result.videos.length,1);
 saved.clear();global.fetch=async url=>new URL(url).hostname==='statsapi.mlb.com'?Response.json({dates:[{games:[game]}]}):new Response('',{status:403});
 result=await h.getGameHighlights(849822,cache,{YOUTUBE_API_KEY:'test-secret'});assert.equal(result.status,'unavailable');assert.equal(result.videos.length,0);
 console.log('PASS official API only, secret handling, original metadata, ELTA date, channel filtering, cache, concurrent requests, fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
