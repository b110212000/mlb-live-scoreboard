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
async function setup({width=390,subscribed=false,empty=false,worker=null,push=false,extraGames=[]}={}){
 const page=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Taipei'}),errors=[];
 // Headless Chromium 沒有推播服務：以假的 PushSubscription 模擬「已允許通知」。
 if(push)await page.addInitScript(()=>{const sub={endpoint:'https://push.example/mock',toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'p',auth:'a'}}},unsubscribe:async()=>true};Object.defineProperty(Notification,'permission',{configurable:true,get:()=>'granted'});PushManager.prototype.getSubscription=async function(){return sub};PushManager.prototype.subscribe=async function(){return sub};});
 page.on('pageerror',e=>errors.push(e.message));
 let current=structuredClone(feed);
 await page.route('**/version.json*',r=>r.fulfill({json:{version}}));
 await page.route('https://www.mlbstatic.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="white"/></svg>'}));
 await page.route('https://img.mlbstatic.com/**',r=>r.abort());
 await page.route('https://statsapi.mlb.com/**',r=>{
  const u=new URL(r.request().url());
  if(u.pathname.includes('/feed/live'))return r.fulfill({json:current});
  if(u.pathname.endsWith('/schedule')&&u.searchParams.has('gamePks')){const pks=u.searchParams.get('gamePks').split(',').map(Number);return r.fulfill({json:{dates:[{date:today,games:[game,...extraGames].filter(g=>pks.includes(g.gamePk))}]}})}
  if(u.pathname.endsWith('/schedule'))return r.fulfill({json:{dates:empty?[]:[{date:today,games:[game]}]}});
  return r.fulfill({json:{teams:[],people:[],roster:[],dates:[]}});
 });
 await page.route('https://mlb-score-notify.b110212000.workers.dev/**',r=>worker?worker(r):r.fulfill({json:{ok:true,subscribed}}));
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
 await page.waitForTimeout(310);
 assert.equal(await page.locator('[data-view=install]').count(),0);
 assert.equal(await page.locator('[data-view=notifications]').count(),0);
 await page.locator('[data-menu-settings]').click();
 assert.equal(await page.locator('#sidebarTitle').innerText(),'設定');
 assert(await page.locator('#featureMenu').evaluate(d=>d.open));
 assert(await page.locator('#liveView').isVisible(),'settings menu must preserve current game');
 assert.equal(await page.locator('[data-view=live]').count(),0);
 assert(await page.locator('[data-view=install]').isVisible());
 assert(await page.locator('[data-view=notifications]').isVisible());
 await page.locator('[data-view=notifications]').click();
 assert(await page.locator('#featureMenu').evaluate(d=>d.open),'must remain open during exit');
 await page.waitForTimeout(310);assert(await page.locator('#notificationView').isVisible());
 assert(!(await page.locator('#featureMenu').evaluate(d=>d.open)));
 await page.locator('#featureMenuButton').click();await page.waitForTimeout(310);
 assert.equal(await page.locator('#sidebarTitle').innerText(),'設定');
 await page.locator('[data-menu-back]').click();assert.equal(await page.locator('#sidebarTitle').innerText(),'MLB 戰況');
 await page.locator('[data-view=live]').click();await page.waitForTimeout(310);
 assert(await page.locator('#liveView').isVisible());assert(await page.locator('#gameWatchBtn').isVisible());
 for(const [view,id] of [['bracket','bracketView'],['install','installView'],['notifications','notificationView'],['live','liveView']]){
   await page.locator('#featureMenuButton').click();await page.waitForTimeout(300);
   if(['install','notifications'].includes(view)&&await page.locator('[data-menu-settings]').count())await page.locator('[data-menu-settings]').click();
   if(['live','bracket'].includes(view)&&await page.locator('[data-menu-back]').count())await page.locator('[data-menu-back]').click();
   await page.locator(`[data-view=${view}]`).click();await page.waitForTimeout(300);assert(await page.locator('#'+id).isVisible());
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

const ALL={pregame5:true,start:true,homeScore:true,awayScore:true,final:true};
const teamGame={...structuredClone(game),gamePk:777001,gameType:'L',seriesDescription:'NL Championship Series',seriesGameNumber:1,gameDate:new Date(Date.now()+86400000).toISOString(),status:{abstractGameState:'Preview',detailedState:'Scheduled',codedGameState:'S'},teams:{away:{team:{id:119,name:'Los Angeles Dodgers'}},home:{team:{id:158,name:'Milwaukee Brewers'}}}};
// 模擬 Worker 的 DeviceRegistry：記錄每次呼叫並回傳完整清單。
function mockWorker(){
 const reg={defaults:{...ALL},teams:[],games:[{gamePk:feed.gamePk,source:'manual',teamIds:[],custom:false,prefs:{...ALL},gameDate:game.gameDate}],subscriptionEndpoint:'https://push.example/mock'};
 const calls=[];const view=(extra={})=>({ok:true,...structuredClone(reg),...extra});
 const handler=route=>{
  const req=route.request(),u=new URL(req.url()),method=req.method(),body=req.postData()?JSON.parse(req.postData()):{};
  const m=u.pathname.match(/^\/api\/devices\/[^/]+(\/.*)$/);
  if(!m){
   if(u.pathname.endsWith('/public-key'))return route.fulfill({json:{publicKey:'BOaVRzuve8y08SdzRk1lYHk4wQVyE-dGO104MN7630zIopOOaUORilBiaZiZkVI8XrXRwQnp6gms8ugieQCek3s'}});
   return route.fulfill({json:{ok:true,subscribed:reg.games.some(g=>u.pathname.includes('/'+g.gamePk+'/'))}});
  }
  const path=m[1];calls.push({method,path,body});
  if(path==='/state')return route.fulfill({json:view()});
  if(path==='/defaults'){reg.defaults={...reg.defaults,...body.prefs};for(const g of reg.games)if(!g.custom)g.prefs={...reg.defaults};return route.fulfill({json:view()})}
  const prefs=path.match(/^\/games\/(\d+)\/prefs$/);
  if(prefs){const g=reg.games.find(x=>x.gamePk===Number(prefs[1]));g.custom=Boolean(body.prefs);g.prefs=body.prefs?{...reg.defaults,...body.prefs}:{...reg.defaults};return route.fulfill({json:view()})}
  const one=path.match(/^\/games\/(\d+)$/);
  if(one&&method==='DELETE'){reg.games=reg.games.filter(g=>g.gamePk!==Number(one[1]));return route.fulfill({json:view()})}
  if(path==='/teams'&&method==='POST'){reg.teams.push({teamId:body.teamId});reg.games.push({gamePk:teamGame.gamePk,source:'team',teamIds:[body.teamId],custom:false,prefs:{...reg.defaults},gameDate:teamGame.gameDate});return route.fulfill({json:view({added:[teamGame.gamePk]})})}
  const team=path.match(/^\/teams\/(\d+)$/);
  if(team&&method==='DELETE'){const id=Number(team[1]);reg.teams=reg.teams.filter(x=>x.teamId!==id);reg.games=reg.games.filter(g=>!(g.source==='team'&&g.teamIds.includes(id)));return route.fulfill({json:view()})}
  return route.fulfill({status:404,json:{error:'NOT_FOUND'}});
 };
 return {handler,calls};
}
async function openSubscriptions(page){
 await page.locator('#featureMenuButton').click();await page.waitForTimeout(300);
 if(await page.locator('[data-menu-settings]').count())await page.locator('[data-menu-settings]').click();
 await page.locator('[data-view=notifications]').click();await page.waitForTimeout(320);
}
test('Subscription management: list, team follow, default and per-game prefs, confirmed cancel',async()=>{
 const mock=mockWorker();
 const {page,errors}=await setup({worker:mock.handler,push:true,extraGames:[teamGame]});
 await page.locator('#gameWatchBtn.subscribed').waitFor();
 await openSubscriptions(page);
 assert.equal(await page.locator('#appTitle').innerText(),'訂閱管理');
 const row=page.locator('.subs-game[data-game-pk="'+feed.gamePk+'"]');await row.waitFor();
 assert.equal(await page.locator('.subs-game').count(),1);
 assert((await row.locator('.subs-game-text b').innerText()).includes(' @ '));assert((await row.innerText()).includes('手動訂閱'));

 // 預設提醒項目：關閉主隊得分，所有未自訂的場次一起套用。
 const defaults=page.locator('[aria-label="預設提醒項目"]');
 await defaults.locator('[data-pref=homeScore]').click();
 await page.locator('.subs-feedback .success').filter({hasText:'預設'}).waitFor();
 assert.equal(mock.calls.filter(c=>c.path==='/defaults').at(-1).body.prefs.homeScore,false);
 assert.equal(await defaults.locator('[data-pref=homeScore]').isChecked(),false);

 // 單場自訂：從預設出發，只關閉比賽結束。
 await row.locator('.subs-icon-btn').click();
 assert.equal(await row.locator('.subs-game-prefs [data-pref=homeScore]').isChecked(),false,'per-game toggles must start from defaults');
 await row.locator('.subs-game-prefs [data-pref=final]').click();
 await row.locator('.subs-tag.custom').waitFor();
 const custom=mock.calls.find(c=>/^\/games\/\d+\/prefs$/.test(c.path));assert.equal(custom.body.prefs.final,false);assert.equal(custom.body.prefs.homeScore,false);

 // 追蹤道奇：送出推播訂閱，自動加入的場次標示來源，選單不再列出已追蹤球隊。
 await page.locator('#subsTeamSelect').selectOption('119');
 await page.locator('#subsFollowBtn').click();
 await page.locator('.subs-team[data-team-id="119"]').waitFor();
 assert.equal(mock.calls.find(c=>c.path==='/teams').body.subscription.endpoint,'https://push.example/mock');
 const auto=page.locator('.subs-game[data-game-pk="'+teamGame.gamePk+'"]');await auto.waitFor();
 assert((await auto.innerText()).includes('追蹤 道奇'));assert((await auto.innerText()).includes('國聯冠軍賽 G1'));
 assert((await page.locator('.subs-feedback').innerText()).includes('已追蹤道奇'));
 assert.equal(await page.locator('#subsTeamSelect option[value="119"]').count(),0);

 // 點比賽開啟即時比賽頁，再回到訂閱管理。
 await row.locator('.subs-game-main').click();
 await page.locator('#awayName').filter({hasText:feed.gameData.teams.away.name}).waitFor();
 assert(await page.locator('#liveView').isVisible());
 await openSubscriptions(page);await row.waitFor();

 // 取消訂閱需要確認：按「保留」不會取消。
 await row.locator('.subs-cancel').click();
 assert(await page.locator('#subsConfirm').evaluate(d=>d.open));
 assert((await page.locator('#subsConfirm').innerText()).includes('取消訂閱這場比賽'));
 await page.locator('#subsConfirm [data-confirm=cancel]').click();
 assert(!(await page.locator('#subsConfirm').evaluate(d=>d.open)));
 assert(!mock.calls.some(c=>c.method==='DELETE'),'kept game was deleted');
 await row.locator('.subs-cancel').click();await page.locator('#subsConfirm [data-confirm=ok]').click();
 await row.waitFor({state:'detached'});
 assert(mock.calls.some(c=>c.method==='DELETE'&&c.path==='/games/'+feed.gamePk));

 // 取消追蹤也需要確認，並移除因追蹤而加入的場次。
 await page.locator('.subs-team[data-team-id="119"] .subs-team-remove').click();
 assert((await page.locator('#subsConfirm').innerText()).includes('取消追蹤道奇'));
 await page.locator('#subsConfirm [data-confirm=ok]').click();
 await page.locator('.subs-team').waitFor({state:'detached'});
 assert.equal(await page.locator('.subs-game').count(),0);
 assert((await page.locator('.subs-empty').allInnerTexts()).some(x=>x.includes('目前沒有訂閱')));
 assert.deepEqual(errors,[]);await page.close();
});
