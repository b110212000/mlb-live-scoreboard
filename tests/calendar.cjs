const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const strip=src=>src.replace(/^import[\s\S]*?;$/gm,'').replace(/^export \{[^}]*\} from "[^"]+";$/gm,'').replace(/^export (default )?/gm,(m,d)=>d?'globalThis.workerEntry = ':'');
const game={gamePk:849809,gameType:'L',seriesDescription:'NL Championship Series',seriesGameNumber:1,gameDate:'2026-10-12T00:08:00Z',officialDate:'2026-10-11',
  status:{startTimeTBD:false},venue:{name:'American Family Field'},teams:{away:{team:{id:119,name:'Los Angeles Dodgers'}},home:{team:{id:158,name:'Milwaukee Brewers'}}}};
let fetched=[];
const ctx={console,Response,Request,URL,Headers,TextEncoder,Date,JSON,Number,String,Object,Array,Math,
  fetch:async url=>{fetched.push(String(url));const pk=Number(new URL(url).searchParams.get('gamePks'));return Response.json({dates:pk===game.gamePk?[{games:[game]}]:[]})}};
vm.createContext(ctx);vm.runInContext(strip(fs.readFileSync('worker/src/messages.js','utf8')),ctx);vm.runInContext(strip(fs.readFileSync('worker/src/calendar.js','utf8')),ctx);
const now=Date.parse('2026-10-11T03:00:00Z');
const ics=ctx.buildGameCalendar(game,{appUrl:'https://b110212000.github.io/mlb-live-scoreboard/',now});
const lines=ics.split('\r\n');
assert(ics.endsWith('\r\n')&&!/[^\r]\n/.test(ics),'lines must end with CRLF');
assert.equal(lines[0],'BEGIN:VCALENDAR');assert(lines.includes('END:VCALENDAR'));
const unfolded=ics.replace(/\r\n /g,'');
assert(unfolded.includes('UID:mlb-game-849809@mlb-score-notify'));
assert(unfolded.includes('DTSTART:20261012T000800Z'),'start must be UTC');
assert(unfolded.includes('DTEND:20261012T033800Z'),'3.5 hour duration');
assert(unfolded.includes('DTSTAMP:20261011T030000Z'));
assert(unfolded.includes('SUMMARY:國聯冠軍賽 G1｜道奇 @ 釀酒人'));
assert(unfolded.includes('LOCATION:American Family Field'));
assert(unfolded.includes('URL:https://b110212000.github.io/mlb-live-scoreboard/?view=live&gamePk=849809'));
assert(unfolded.includes('DESCRIPTION:Los Angeles Dodgers @ Milwaukee Brewers\\nNL Championship Series Game 1\\n即時比分：'),'newlines escaped in DESCRIPTION');
assert(unfolded.includes('TRIGGER:-PT15M'),'15 minute reminder');
const encoder=new TextEncoder();
for(const line of lines)assert(encoder.encode(line).length<=75,'line longer than 75 octets: '+line);
// 特殊字元跳脫。
const escaped=ctx.buildGameCalendar({...game,venue:{name:'Field, A; B\\C'}},{now});
assert(escaped.replace(/\r\n /g,'').includes('LOCATION:Field\\, A\\; B\\\\C'));
// 開賽時間未定：全天行程，不設提醒。
const tbd=ctx.buildGameCalendar({...game,status:{startTimeTBD:true}},{now}).replace(/\r\n /g,'');
assert(tbd.includes('DTSTART;VALUE=DATE:20261011')&&tbd.includes('DTEND;VALUE=DATE:20261012'));assert(!tbd.includes('VALARM'));
// 例行賽標題不放連戰場次編號。
assert(ctx.buildGameCalendar({...game,gameType:'R',seriesDescription:'Regular Season',seriesGameNumber:2},{now}).replace(/\r\n /g,'').includes('SUMMARY:例行賽｜道奇 @ 釀酒人'));
// 世界大賽與沒有分區資訊的場次名稱。
assert(ctx.buildGameCalendar({...game,gameType:'W',seriesGameNumber:7},{now}).replace(/\r\n /g,'').includes('SUMMARY:世界大賽 G7｜'));

(async()=>{
  // Worker 路由：/api/calendar/:gamePk.ics 回傳 text/calendar；找不到比賽回 404。
  const w={console,Response,Request,URL,Headers,TextEncoder,Date,JSON,Number,String,Object,Array,Math,Boolean,caches:{default:{}},getGameHighlights:async()=>({}),fetch:ctx.fetch};
  vm.createContext(w);
  vm.runInContext(strip(fs.readFileSync('worker/src/messages.js','utf8')),w);
  vm.runInContext(strip(fs.readFileSync('worker/src/calendar.js','utf8')),w);
  vm.runInContext(strip(fs.readFileSync('worker/src/index.js','utf8')),w);
  const env={FRONTEND_ORIGIN:'https://b110212000.github.io',APP_URL:'https://b110212000.github.io/mlb-live-scoreboard/'};
  let res=await w.workerEntry.fetch(new Request('https://worker.test/api/calendar/849809.ics'),env);
  assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'text/calendar; charset=utf-8');
  assert.equal(res.headers.get('content-disposition'),'inline; filename="mlb-849809.ics"');
  assert((await res.text()).includes('SUMMARY:國聯冠軍賽 G1｜道奇 @ 釀酒人'));
  assert(fetched.at(-1).includes('gamePks=849809'));
  // v2.7.0 ?lang=en / ja：標題、隊名與說明依語言；未知語言用中文。
  res=await w.workerEntry.fetch(new Request('https://worker.test/api/calendar/849809.ics?lang=en'),env);
  const unfold=text=>text.replace(/\r\n /g,'');
  let body=unfold(await res.text());
  assert(body.includes('SUMMARY:NL Championship Series G1 | Dodgers @ Brewers'),'english summary');
  assert(body.includes('DESCRIPTION:Los Angeles Dodgers @ Milwaukee Brewers\\nNL Championship Series Game 1\\nLive score: '),'english description');
  res=await w.workerEntry.fetch(new Request('https://worker.test/api/calendar/849809.ics?lang=ja'),env);
  body=unfold(await res.text());
  assert(body.includes('SUMMARY:ナ・リーグ優勝決定シリーズ G1｜ドジャース @ ブルワーズ'),'japanese summary');
  assert(body.includes('ライブスコア：'));
  res=await w.workerEntry.fetch(new Request('https://worker.test/api/calendar/849809.ics?lang=fr'),env);
  assert(unfold(await res.text()).includes('SUMMARY:國聯冠軍賽 G1｜道奇 @ 釀酒人'),'unknown language should fall back to zh');
  assert(unfold(ctx.buildGameCalendar({...game,gameType:'R',seriesGameNumber:2},{now,lang:'en'})).includes('SUMMARY:Regular Season | Dodgers @ Brewers'));
  assert(unfold(ctx.buildGameCalendar({...game,gameType:'W',seriesGameNumber:7},{now,lang:'ja'})).includes('SUMMARY:ワールドシリーズ G7｜'));
  res=await w.workerEntry.fetch(new Request('https://worker.test/api/calendar/1.ics'),env);assert.equal(res.status,404);
  res=await w.workerEntry.fetch(new Request('https://worker.test/api/calendar/849809'),env);assert.equal(res.status,200,'.ics suffix optional');
  console.log('PASS calendar: CRLF, 75-octet folding with CJK, UTC start/end, UID, Chinese summary, escaping, URL back to app, 15 min alarm, TBD all-day, World Series title, route + 404, ?lang=en/ja');
})().catch(e=>{console.error(e);process.exit(1)});
