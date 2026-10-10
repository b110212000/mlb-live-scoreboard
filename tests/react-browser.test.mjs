import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const {version}=JSON.parse(await readFile('package.json','utf8'));
const fixture=JSON.parse(await readFile('tests/fixtures/game.json','utf8'));
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const feed=structuredClone(fixture);
feed.gameData.status={abstractGameState:'Live',detailedState:'In Progress'};
feed.gameData.datetime.dateTime=today+'T02:00:00Z';
const game={gamePk:feed.gamePk,gameDate:today+'T02:00:00Z',gameType:'D',status:feed.gameData.status,seriesDescription:'NL Division Series',teams:{away:{team:feed.gameData.teams.away,score:feed.liveData.linescore.teams.away.runs},home:{team:feed.gameData.teams.home,score:feed.liveData.linescore.teams.home.runs}}};
const server=http.createServer(async(req,res)=>{try{const p=new URL(req.url,'http://local').pathname;const file=p==='/'?'index.html':p.slice(1);res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.json')?'application/json':'text/html');res.end(await readFile(file))}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
test.after(async()=>{await browser.close();await new Promise(r=>server.close(r))});
async function setup({width=390,subscribed=false,empty=false}={}){
 const page=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Taipei'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 let current=structuredClone(feed);
 await page.route('**/version.json*',r=>r.fulfill({json:{version}}));
 await page.route('https://www.mlbstatic.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="white"/></svg>'}));
 await page.route('https://img.mlbstatic.com/**',r=>r.abort());
 await page.route('https://statsapi.mlb.com/**',r=>{
  const u=new URL(r.request().url());
  if(u.pathname.includes('/feed/live'))return r.fulfill({json:current});
  if(u.pathname.endsWith('/schedule'))return r.fulfill({json:{dates:empty?[]:[{date:today,games:[game]}]}});
  return r.fulfill({json:{teams:[],people:[],roster:[],dates:[]}});
 });
 await page.route('https://mlb-score-notify.b110212000.workers.dev/**',r=>r.fulfill({json:{ok:true,subscribed}}));
 await page.goto(origin);
 await page.locator('.app-version').filter({hasText:'v'+version}).waitFor();
 await page.waitForFunction(()=>document.querySelector('#liveDot')&&!document.querySelector('#liveDot').classList.contains('off'));
 return {page,errors,setFeed:x=>current=x};
}
test('React mobile: score, tables, focus timer, navigation, animation, Final',async()=>{
 const {page,errors,setFeed}=await setup({subscribed:true});
 await page.locator('#gameWatchBtn.subscribed').waitFor();
 assert.equal(await page.locator('#awayName').innerText(),feed.gameData.teams.away.name);
 assert.equal(await page.locator('#bigScore span').first().innerText(),String(feed.liveData.linescore.teams.away.runs));
 const ids=await page.locator('[id]').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(ids.length,new Set(ids).size);
 const expected=[...((await readFile('src/engine/api.js','utf8')).matchAll(/\$\('([^']+)'\)/g))].map(m=>m[1]);for(const id of expected)assert(ids.includes(id),'missing host '+id);
 await page.locator('[data-live-tab=stats]').click();await page.locator('#boxScoreBoard table').first().waitFor();
 assert(await page.locator('#teamStatsBoard').innerText());
 await page.locator('[data-live-tab=status]').click();await page.locator('#recentEvents').waitFor();
 assert(await page.locator('#recentEvents').innerText());
 // Refreshing identical data must retain the ticker node and its animation clock.
 await page.locator('#highlightTicker .highlight-ticker-slide').evaluate(el=>el.dataset.identity='same');
 await page.locator('#refreshBtn').click();await page.waitForTimeout(200);
 assert.equal(await page.locator('#highlightTicker .highlight-ticker-slide').getAttribute('data-identity'),'same');
 await page.locator('#highlightsToggle').click();assert(await page.locator('#gameHighlights').isVisible());await page.locator('#highlightsToggle').click();
 await page.locator('#featureMenuButton').click();
 assert(await page.locator('#featureMenu').evaluate(d=>d.open&&d.getAnimations().length>0));
 await page.waitForTimeout(310);await page.locator('[data-view=settings]').click();
 assert(await page.locator('#featureMenu').evaluate(d=>d.open),'must remain open during exit');
 await page.waitForTimeout(310);assert(await page.locator('#settingsView').isVisible());assert.equal(await page.locator('#settingsView p').innerText(),'開發中');
 assert(!(await page.locator('#featureMenu').evaluate(d=>d.open)));
 await page.locator('#featureMenuButton').click();await page.waitForTimeout(310);await page.locator('[data-view=live]').click();await page.waitForTimeout(310);
 assert(await page.locator('#liveView').isVisible());assert(await page.locator('#gameWatchBtn').isVisible());
 for(const [view,id] of [['bracket','bracketView'],['install','installView'],['notifications','notificationView'],['live','liveView']]){
   await page.locator('#featureMenuButton').click();await page.waitForTimeout(300);await page.locator(`[data-view=${view}]`).click();await page.waitForTimeout(300);assert(await page.locator('#'+id).isVisible());
 }
 await page.locator('#heroRosterBtn').click();assert(await page.locator('#rosterView').isVisible());await page.locator('#rosterBackBtn').click();assert(await page.locator('#liveView').isVisible());
 await page.screenshot({path:'/tmp/react-scoreboard.png'});

 const final=structuredClone(feed);final.gameData.status={abstractGameState:'Final',detailedState:'Final'};final.liveData.linescore.teams.home.runs=9;setFeed(final);
 await page.locator('#refreshBtn').click();await page.waitForFunction(()=>document.querySelector('#statePill').textContent==='Final');
 assert.equal(await page.locator('#bigScore span').last().innerText(),'9');assert(!(await page.locator('#gameWatchBtn').isVisible()));
 assert.deepEqual(errors,[]);await page.close();
});
test('No game, desktop layout, reduced motion, notification deep link',async()=>{
 const {page,errors}=await setup({width:1280,empty:true});
 assert(await page.locator('#noGameMessage').isVisible());assert(!(await page.locator('#liveDetailTabs').isVisible()));
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#featureMenuButton').click();await page.waitForTimeout(140);await page.keyboard.press('Escape');await page.waitForTimeout(140);assert(!(await page.locator('#featureMenu').evaluate(d=>d.open)));
 await page.goto(origin+'/?view=live&gamePk='+feed.gamePk);await page.locator('#awayName').filter({hasText:feed.gameData.teams.away.name}).waitFor();
 assert(await page.locator('#liveView').isVisible());assert.deepEqual(errors,[]);await page.close();
});
