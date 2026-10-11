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
 await page.route(/^https:\/\/(www\.wikidata\.org|[a-z]+\.wikipedia\.org)\//,r=>r.fulfill({json:{query:{search:[],pages:[]},entities:{}}}));
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
 // 第四個分頁「賽後摘要」在系列賽右邊；比賽進行中先顯示提示。
 assert.deepEqual(await page.locator('#liveDetailTabs .live-detail-tab:not([hidden])').allInnerTexts(),['統計','賽況','系列賽','賽後摘要']);
 await page.locator('[data-live-tab=summary]').click();
 await page.locator('#gameSummary .game-summary-empty').filter({hasText:'比賽進行中'}).waitFor();
 await page.locator('[data-live-tab=status]').click();
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
 assert.equal(await page.locator('[data-view=notificationTest]').count(),0);
 // 追蹤球隊與訂閱管理在主選單，不在設定子選單。
 assert.deepEqual(await page.locator('.sidebar-nav [data-view]').evaluateAll(nodes=>nodes.map(n=>n.dataset.view)),['live','bracket','standings','taiwan','hof','teams','notifications']);
 assert.equal(await page.locator('[data-view=teams]').innerText(),'追蹤球隊');
 assert.equal(await page.locator('[data-view=notifications]').innerText(),'訂閱管理');
 await page.locator('[data-menu-settings]').click();
 assert.equal(await page.locator('#sidebarTitle').innerText(),'設定');
 assert(await page.locator('#featureMenu').evaluate(d=>d.open));
 assert(await page.locator('#liveView').isVisible(),'settings menu must preserve current game');
 assert.equal(await page.locator('[data-view=live]').count(),0);
 assert.equal(await page.locator('[data-view=teams]').count(),0);
 assert.equal(await page.locator('[data-view=notifications]').count(),0);
 assert.deepEqual(await page.locator('.sidebar-nav [data-view]').evaluateAll(nodes=>nodes.map(n=>n.dataset.view)),['settings','notificationTest','install']);
 assert.equal(await page.locator('[data-view=notificationTest]').innerText(),'訂閱測試');
 await page.locator('[data-view=notificationTest]').click();
 assert(await page.locator('#featureMenu').evaluate(d=>d.open),'must remain open during exit');
 await page.waitForTimeout(310);assert(await page.locator('#notificationTestView').isVisible());
 // 訂閱管理與訂閱測試是兩個獨立頁面。
 assert.equal(await page.locator('#notificationTestView .subs-shell').count(),0);assert(!(await page.locator('#notificationView').isVisible()));
 assert(!(await page.locator('#featureMenu').evaluate(d=>d.open)));
 await page.locator('#featureMenuButton').click();await page.waitForTimeout(310);
 assert.equal(await page.locator('#sidebarTitle').innerText(),'設定');
 await page.locator('[data-menu-back]').click();assert.equal(await page.locator('#sidebarTitle').innerText(),'MLB 戰況');
 await page.locator('[data-view=live]').click();await page.waitForTimeout(310);
 assert(await page.locator('#liveView').isVisible());assert(await page.locator('#gameWatchBtn').isVisible());
 for(const [view,id] of [['bracket','bracketView'],['standings','standingsView'],['taiwan','taiwanView'],['hof','hofView'],['teams','teamsView'],['install','installView'],['settings','settingsView'],['notifications','notificationView'],['notificationTest','notificationTestView'],['live','liveView']]){
   await page.locator('#featureMenuButton').click();await page.waitForTimeout(300);
   if(['install','notificationTest','settings'].includes(view)&&await page.locator('[data-menu-settings]').count())await page.locator('[data-menu-settings]').click();
   if(['live','bracket','standings','taiwan','hof','teams','notifications'].includes(view)&&await page.locator('[data-menu-back]').count())await page.locator('[data-menu-back]').click();
   await page.locator(`[data-view=${view}]`).click();await page.waitForTimeout(300);assert(await page.locator('#'+id).isVisible());
   if(view==='notificationTest'){assert(await page.locator('#testNotificationBtn').isVisible());assert.equal(await page.locator('#appTitle').innerText(),'訂閱測試');assert.equal(await page.locator('#notificationTestView .subs-shell').count(),0);}
 }
 await page.locator('#heroRosterBtn').click();assert(await page.locator('#rosterView').isVisible());await page.locator('#rosterBackBtn').click();assert(await page.locator('#liveView').isVisible());
 await page.screenshot({path:'/tmp/react-scoreboard.png'});

 const final=structuredClone(feed);final.gameData.status={abstractGameState:'Final',detailedState:'Final'};final.liveData.linescore.teams.home.runs=9;setFeed(final);
 await page.locator('#refreshBtn').click();await page.waitForFunction(()=>document.querySelector('#statePill').textContent==='Final');
 assert.equal(await page.locator('#bigScore span').last().innerText(),'9');assert(!(await page.locator('#gameWatchBtn').isVisible()));
 // 終場後賽後摘要：比分、本場之星與比賽資訊。
 await page.locator('[data-live-tab=summary]').click();
 await page.locator('#gameSummary .summary-final').waitFor();
 const summary=await page.locator('#gameSummary').innerText();
 assert(summary.includes(': 9'),'final score missing');assert(summary.includes('Kyle Schwarber'),'top performer missing');assert(summary.includes('比賽時間'),'game facts missing');
 assert.deepEqual(errors,[]);await page.close();
});
test('No game, desktop layout, reduced motion, notification deep link',async()=>{
 const {page,errors}=await setup({width:1280,empty:true});
 assert(await page.locator('#noGameMessage').isVisible());assert(!(await page.locator('#liveDetailTabs').isVisible()));
 // 沒有比賽的提示：日期用斜線。
 assert.match(await page.locator('#seriesText').innerText(),/^\d{4}\/\d{2}\/\d{2} 沒有 MLB 賽事$/);
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
async function openTeams(page){
 await page.locator('#featureMenuButton').click();await page.waitForTimeout(300);
 if(await page.locator('[data-menu-back]').count())await page.locator('[data-menu-back]').click();
 await page.locator('[data-view=teams]').click();await page.waitForTimeout(320);
}
async function openSubscriptions(page){
 await page.locator('#featureMenuButton').click();await page.waitForTimeout(300);
 if(await page.locator('[data-menu-back]').count())await page.locator('[data-menu-back]').click();
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
 // 提醒項目在已訂閱的比賽上方，比賽多時不會被擠下去。
 assert((await page.locator('#subsPrefsTitle').boundingBox()).y<(await page.locator('#subsGamesTitle').boundingBox()).y,'reminder items should be above the game list');
 // 一場一列、預設收合；點一列（右側箭頭）展開卡片，再點收合。
 const head=row.locator('.game-row');
 assert.equal(await head.getAttribute('aria-expanded'),'false');assert.equal(await row.locator('.game-card').count(),0);
 assert((await head.innerText()).includes(' @ '));assert.equal(await head.locator('.game-row-chevron').count(),1);
 await head.click();assert.equal(await head.getAttribute('aria-expanded'),'true');
 assert((await row.innerText()).includes('手動訂閱'));
 assert.deepEqual(await row.locator('.game-card-team small').allInnerTexts(),['客隊','主隊']);
 assert.equal(await row.locator('.game-card-team img').count(),2);
 assert.equal(await row.locator('.subs-cancel').innerText(),'取消訂閱');
 // 個別加入行事曆：連到 Worker 產生的單場 .ics。
 assert.equal(await row.locator('.game-card-calendar').getAttribute('href'),'https://mlb-score-notify.b110212000.workers.dev/api/calendar/'+feed.gamePk+'.ics');
 assert.equal(await row.locator('.game-card-calendar').innerText(),'加入行事曆');
 const actionBoxes=await row.locator('.game-card-actions button').evaluateAll(list=>list.map(b=>b.getBoundingClientRect().right));
 assert.equal(Math.max(...actionBoxes),actionBoxes.at(-1),'cancel button should be right-most');
 await head.click();assert.equal(await row.locator('.game-card').count(),0,'row did not collapse');
 await head.click();

 // 預設提醒項目：關閉主隊得分，所有未自訂的場次一起套用。
 const defaults=page.locator('[aria-label="預設提醒項目"]');
 await defaults.locator('[data-pref=homeScore]').click();
 // 操作結果以浮動 toast 顯示，不會插進頁面推擠版面；2 秒後消失。
 const toast=page.locator('#toast .toast.success').filter({hasText:'預設'});await toast.waitFor();
 assert.equal(await page.locator('#notificationView .subs-feedback').count(),0,'inline feedback should be gone');
 assert.equal(await page.locator('#toast').evaluate(el=>getComputedStyle(el).position),'fixed');
 await toast.waitFor({state:'detached',timeout:3000});
 assert.equal(mock.calls.filter(c=>c.path==='/defaults').at(-1).body.prefs.homeScore,false);
 assert.equal(await defaults.locator('[data-pref=homeScore]').isChecked(),false);

 // 單場自訂：從預設出發，只關閉比賽結束。
 await row.locator('.subs-icon-btn').click();
 assert.equal(await row.locator('.subs-game-prefs [data-pref=homeScore]').isChecked(),false,'per-game toggles must start from defaults');
 await row.locator('.subs-game-prefs [data-pref=final]').click();
 await row.locator('.subs-tag.custom').waitFor();
 const custom=mock.calls.find(c=>/^\/games\/\d+\/prefs$/.test(c.path));assert.equal(custom.body.prefs.final,false);assert.equal(custom.body.prefs.homeScore,false);

 // 訂閱管理沒有追蹤球隊區塊；追蹤道奇在主選單的追蹤球隊頁。
 assert.equal(await page.locator('#notificationView .team-card').count(),0);
 await openTeams(page);
 assert.equal(await page.locator('#appTitle').innerText(),'追蹤球隊');
 // 左右開關預設美國聯盟；東 / 中 / 西三區各 5 張卡片，卡片有中英文隊名。
 const sw=page.locator('#teamsView .league-switch');
 assert.equal(await sw.locator('[data-league=AL]').getAttribute('aria-checked'),'true');
 assert.deepEqual(await page.locator('#teamsView .league-panel.active .division h3').allInnerTexts(),['東區','中區','西區']);
 assert.deepEqual(await page.locator('#teamsView .league-panel.active .division').evaluateAll(list=>list.map(s=>s.querySelectorAll('.team-card').length)),[5,5,5]);
 // 三區並排成三欄，每區球隊由上往下排，三欄同一列對齊。
 const layout=await page.locator('#teamsView .league-panel.active .division').evaluateAll(list=>list.map(s=>({x:s.getBoundingClientRect().x,y:s.getBoundingClientRect().y,cards:[...s.querySelectorAll('.team-card')].map(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,h:r.height}})})));
 assert(layout[0].x<layout[1].x&&layout[1].x<layout[2].x,'divisions are not side by side');
 assert(layout.every(d=>Math.abs(d.y-layout[0].y)<1),'division columns do not start on the same row');
 for(const d of layout)assert(d.cards.every((c,i)=>Math.abs(c.x-d.cards[0].x)<1&&(i===0||c.y>d.cards[i-1].y)),'teams do not stack vertically');
 for(let i=0;i<5;i++)assert(layout.every(d=>Math.abs(d.cards[i].y-layout[0].cards[i].y)<1&&Math.abs(d.cards[i].h-layout[0].cards[i].h)<1),'row '+i+' not aligned across divisions');
 const yankees=page.locator('#teamsView .team-card[data-team-id="147"]');
 assert((await yankees.innerText()).includes('洋基'));assert((await yankees.innerText()).includes('New York Yankees'));
 assert(await yankees.evaluate(el=>el.closest('.division').querySelector('h3').textContent==='東區'));
 assert.equal(await page.locator('#teamsView .league-panel.active .team-card[data-team-id="119"]').count(),0,'NL team listed under AL');
 // 球隊區向左滑切到國家聯盟；從卡片上開始滑不會誤觸追蹤。
 const athletics=await page.locator('#teamsView .team-card[data-team-id="133"]').boundingBox();
 await page.mouse.move(athletics.x+athletics.width/2,athletics.y+athletics.height/2);await page.mouse.down();
 await page.mouse.move(athletics.x+athletics.width/2-220,athletics.y+athletics.height/2+6,{steps:10});await page.mouse.up();await page.waitForTimeout(400);
 assert.equal(await sw.locator('[data-league=NL]').getAttribute('aria-checked'),'true','swipe left did not switch to NL');
 assert(!mock.calls.some(c=>c.path==='/teams'),'swiping toggled a team');
 assert.equal(await page.locator('#teamsView .league-panel.active').getAttribute('data-league'),'NL');
 assert(await page.locator('#teamsView .league-panel[data-league=AL]').evaluate(el=>el.inert),'hidden league must be inert');
 // 向右滑回美國聯盟。
 const vp=await page.locator('#teamsView .league-viewport').boundingBox();
 await page.mouse.move(vp.x+60,vp.y+150);await page.mouse.down();await page.mouse.move(vp.x+280,vp.y+156,{steps:10});await page.mouse.up();await page.waitForTimeout(400);
 assert.equal(await sw.locator('[data-league=AL]').getAttribute('aria-checked'),'true','swipe right did not switch back to AL');
 // 開關可以直接往右拖選國家聯盟，方向鍵也能切換。
 const sb=await sw.boundingBox();
 await page.mouse.move(sb.x+sb.width*.25,sb.y+sb.height/2);await page.mouse.down();await page.mouse.move(sb.x+sb.width*.75,sb.y+sb.height/2,{steps:8});await page.mouse.up();await page.waitForTimeout(400);
 assert.equal(await sw.locator('[data-league=NL]').getAttribute('aria-checked'),'true','dragging the switch did not select NL');
 await sw.locator('[data-league=NL]').focus();await page.keyboard.press('ArrowLeft');
 assert.equal(await sw.locator('[data-league=AL]').getAttribute('aria-checked'),'true','ArrowLeft did not select AL');
 await page.keyboard.press('ArrowRight');
 assert.equal(await sw.locator('[data-league=NL]').getAttribute('aria-checked'),'true','ArrowRight did not select NL');
 await page.waitForTimeout(400);
 const dodgers=page.locator('#teamsView .team-card[data-team-id="119"]');
 assert((await dodgers.innerText()).includes('道奇'));assert((await dodgers.innerText()).includes('Los Angeles Dodgers'));
 assert(await dodgers.evaluate(el=>el.closest('.division').querySelector('h3').textContent==='西區'));
 assert.equal(await dodgers.getAttribute('aria-pressed'),'false');
 // 點一下追蹤。
 await dodgers.click();
 await page.waitForFunction(()=>document.querySelector('#teamsView .team-card[data-team-id="119"]').getAttribute('aria-pressed')==='true');
 assert.equal(mock.calls.find(c=>c.path==='/teams').body.subscription.endpoint,'https://push.example/mock');
 await page.locator('#toast .toast').filter({hasText:'已追蹤道奇'}).waitFor();
 assert((await dodgers.innerText()).includes('自動訂閱 1 場'));
 assert.equal(await sw.locator('[data-league=NL] .league-count').innerText(),'1');
 await openSubscriptions(page);
 const auto=page.locator('.subs-game[data-game-pk="'+teamGame.gamePk+'"]');await auto.waitFor();
 assert((await auto.innerText()).includes('國聯冠軍賽 G1'));
 await auto.locator('.game-row').click();assert((await auto.innerText()).includes('追蹤 道奇'));

 // 點比賽開啟即時比賽頁，再回到訂閱管理。
 await row.locator('.game-card-open').click();
 await page.locator('#awayName').filter({hasText:feed.gameData.teams.away.name}).waitFor();
 assert(await page.locator('#liveView').isVisible());
 // 即時比賽頁標示追蹤的球隊：場次加星號，比分區道奇（主隊）隊徽加星號。
 await page.locator('#gameTabs .game-tab.followed .game-tab-star').waitFor();
 assert.equal(await page.locator('.hero .logo-fav').count(),1);
 assert(await page.locator('#homeLogo').evaluate(img=>img.parentElement.querySelector('.logo-fav')!==null),'star should mark the followed home team');
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

 // 再點一下取消追蹤（不跳確認），並移除因追蹤而加入的場次；聯盟選擇保留。
 await openTeams(page);
 assert.equal(await sw.locator('[data-league=NL]').getAttribute('aria-checked'),'true','league choice not kept');
 await dodgers.click();
 await page.waitForFunction(()=>document.querySelector('#teamsView .team-card[data-team-id="119"]').getAttribute('aria-pressed')==='false');
 assert(mock.calls.some(c=>c.method==='DELETE'&&c.path==='/teams/119'));
 assert.equal(await sw.locator('.league-count').count(),0);
 await openSubscriptions(page);
 assert.equal(await page.locator('.subs-game').count(),0);
 assert((await page.locator('.subs-empty').allInnerTexts()).some(x=>x.includes('目前沒有訂閱')));
 // 頁尾連結前往獨立的訂閱測試頁。
 await page.locator('.subs-footnote .subs-link').click();
 assert(await page.locator('#notificationTestView').isVisible());assert(!(await page.locator('#notificationView').isVisible()));
 assert.deepEqual(errors,[]);await page.close();
});

// ---------- v2.3.0 例行賽、戰績排行、台灣旅外 ----------
const rec=(id,w,l,rank,extra={})=>({team:{id},wins:w,losses:l,gamesPlayed:w+l,winningPercentage:(w/(w+l)).toFixed(3).slice(1),divisionRank:String(rank),gamesBack:rank===1?'-':String((rank-1)*3),
  wildCardRank:extra.wc,wildCardGamesBack:extra.wcgb??'-',clinchIndicator:extra.clinch,streak:{streakCode:extra.streak||'W3'},records:{splitRecords:[{type:'lastTen',wins:6,losses:4}]}});
const standingsDivision={records:[
  {league:{id:103},division:{id:201},teamRecords:[rec(147,93,68,2,{clinch:'w'}),rec(139,98,64,1,{clinch:'y'}),rec(111,87,75,3,{clinch:'w'})]},
  {league:{id:103},division:{id:202},teamRecords:[rec(114,88,74,1,{clinch:'y'}),rec(145,84,78,2)]},
  {league:{id:103},division:{id:200},teamRecords:[rec(117,90,72,1,{clinch:'y'}),rec(140,80,82,2,{streak:'L2'})]},
  {league:{id:104},division:{id:204},teamRecords:[rec(144,95,67,1,{clinch:'y'})]},
  {league:{id:104},division:{id:205},teamRecords:[rec(158,92,70,1,{clinch:'y'})]},
  {league:{id:104},division:{id:203},teamRecords:[rec(119,98,64,1,{clinch:'z'}),rec(137,80,82,2)]}]};
const standingsWild={records:[
  {league:{id:103},teamRecords:[rec(147,93,68,2,{wc:1,wcgb:'+9.5',clinch:'w'}),rec(111,87,75,3,{wc:2,wcgb:'+3.0',clinch:'w'}),rec(145,84,78,2,{wc:3}),rec(140,80,82,2,{wc:4,wcgb:'4.0',clinch:'e'})]},
  {league:{id:104},teamRecords:[rec(137,80,82,2,{wc:1})]}]};
const twData={season:2026,levels:[{sportId:1,label:'MLB'},{sportId:11,label:'3A'},{sportId:12,label:'2A'},{sportId:13,label:'高階1A'},{sportId:14,label:'1A'},{sportId:16,label:'新人聯盟'}],players:[
  {id:701678,fullName:'Hao-Yu Lee',position:'2B',pitcher:false,topLevel:0,currentTeam:{id:116,name:'Detroit Tigers'},levels:[{sportId:1,label:'MLB',hitting:{gamesPlayed:114,avg:'.264',homeRuns:12,rbi:50,ops:'.750'}},{sportId:11,label:'3A',hitting:{gamesPlayed:14,avg:'.232',homeRuns:3,rbi:12}}]},
  {id:827734,fullName:'Wei-En Lin',position:'P',pitcher:true,topLevel:1,currentTeam:{id:400,name:'Las Vegas Aviators',parentOrgId:133},levels:[{sportId:11,label:'3A',pitching:{gamesPlayed:20,inningsPitched:'90.0',era:'3.10',wins:5,losses:3,strikeOuts:80}}]}]};
async function openMain(page,view){
 await page.locator('#featureMenuButton').click();await page.waitForTimeout(300);
 if(await page.locator('[data-menu-back]').count())await page.locator('[data-menu-back]').click();
 await page.locator(`[data-view=${view}]`).click();await page.waitForTimeout(320);
}
test('Regular season, standings and Taiwan players',async()=>{
 const worker=r=>{const u=new URL(r.request().url());
  if(u.pathname.endsWith('/state'))return r.fulfill({json:{ok:true,teams:[{teamId:119}],games:[],defaults:ALL}});
  if(u.pathname==='/api/taiwan-players')return r.fulfill({json:twData});
  return r.fulfill({json:{ok:true,subscribed:false}});};
 const {page,errors}=await setup({worker});
 const rGames=[0,1,2,3,4].map(i=>({...structuredClone(game),gamePk:900000+i,gameType:'R',seriesDescription:'Regular Season',seriesGameNumber:1,gamesInSeries:3,status:{abstractGameState:'Preview',detailedState:'Scheduled',codedGameState:'S'},gameDate:today+'T0'+(3+i)+':00:00Z'}));
 const rFeed=structuredClone(feed);rFeed.gamePk=900000;rFeed.gameData.game={...rFeed.gameData.game,pk:900000,type:'R',gameType:'R'};rFeed.gameData.status={abstractGameState:'Preview',detailedState:'Scheduled',codedGameState:'S'};
 const h2h=[{...structuredClone(game),gamePk:880001,gameType:'R',gameDate:'2026-05-01T02:00:00Z',seriesGameNumber:1,gamesInSeries:3,status:{abstractGameState:'Final',detailedState:'Final'},teams:{away:{team:feed.gameData.teams.away,score:5},home:{team:feed.gameData.teams.home,score:2}}},
  {...structuredClone(game),gamePk:880002,gameType:'R',gameDate:'2026-05-02T02:00:00Z',seriesGameNumber:2,gamesInSeries:3,status:{abstractGameState:'Final',detailedState:'Final'},teams:{away:{team:feed.gameData.teams.away,score:1},home:{team:feed.gameData.teams.home,score:4}}},
  {...rGames[0]}];
 const twToday={...structuredClone(game),gamePk:770001,gameType:'R',gameDate:today+'T03:30:00Z',status:{abstractGameState:'Live',detailedState:'In Progress'},teams:{away:{team:{id:116,name:'Detroit Tigers'},score:2},home:{team:{id:500,name:'Some Club'},score:1}}};
 await page.route('https://statsapi.mlb.com/**',r=>{const u=new URL(r.request().url());
  if(u.pathname.endsWith('/standings'))return r.fulfill({json:u.searchParams.get('standingsTypes')==='wildCard'?standingsWild:standingsDivision});
  if(u.pathname.endsWith('/schedule')&&u.searchParams.has('opponentId'))return r.fulfill({json:{dates:[{games:h2h}]}});
  if(u.pathname.endsWith('/schedule')&&u.searchParams.get('sportId')==='1,11,12,13,14,16')return r.fulfill({json:{dates:[{games:[twToday]}]}});
  if(u.pathname.endsWith('/schedule')&&!u.searchParams.has('gamePks')&&!u.searchParams.has('teamId'))return r.fulfill({json:{dates:[{date:today,games:[game,...rGames]}]}});
  if(u.pathname.includes('/game/900000/feed/live'))return r.fulfill({json:rFeed});
  return r.fallback();});

 // 例行賽出現在場次列表；比賽多時可展開成格狀。
 await page.locator('#refreshBtn').click();
 const toggle=page.locator('.game-selector-row > .game-tabs-toggle');await toggle.waitFor();
 assert.equal(await toggle.innerText(),'全部 6 場');assert.equal(await page.locator('#gameTabs .game-tab').count(),6);
 await toggle.click();assert.equal(await page.locator('#gameTabs').getAttribute('class'),'grid');assert.equal(await toggle.innerText(),'收合列表');
 // 追蹤道奇：費城人 @ 道奇的場次加星號排在最前面。
 assert(await page.locator('#gameTabs .game-tab').first().evaluate(el=>el.classList.contains('followed')));
 // 例行賽的系列賽分頁改為兩隊本季對戰。
 await page.locator('#gameTabs .game-tab').nth(1).click();
 await page.locator('#seriesText').filter({hasText:'例行賽'}).waitFor();
 await page.locator('[data-live-tab=series]').click();
 await page.locator('#currentSeriesTitle').filter({hasText:'本季對戰'}).waitFor();
 assert((await page.locator('#currentSeriesSummary').innerText()).includes('本季交手 3 場'));
 assert.equal(await page.locator('#currentSeriesGames .series-game-row').count(),3);
 assert((await page.locator('#currentSeriesGames').innerText()).includes('3 連戰第 2 場'));
 assert.equal(await page.locator('#currentSeriesGames .series-game-if').count(),0,'regular season has no if-necessary games');

 // 戰績排行：分區（東 / 中 / 西）依名次排列，追蹤的球隊標星號。
 await openMain(page,'standings');
 assert.equal(await page.locator('#appTitle').innerText(),'戰績排行');
 const al=page.locator('#standingsView .league-panel[data-league=AL]');
 await al.locator('.standings-table').first().waitFor();
 assert.deepEqual(await al.locator('.standings-section h3').allInnerTexts(),['東區','中區','西區']);
 assert.deepEqual(await al.locator('.standings-section').first().locator('tbody tr').evaluateAll(rows=>rows.map(r=>r.dataset.teamId)),['139','147','111']);
 assert((await al.locator('tr[data-team-id="139"]').innerText()).includes('光芒'));
 assert.equal(await al.locator('tr[data-team-id="139"] .clinch').innerText(),'y');
 assert((await al.locator('tr[data-team-id="140"]').innerText()).includes('2 連敗'));
 await page.locator('#standingsView .league-switch [data-league=NL]').click();
 const nl=page.locator('#standingsView .league-panel[data-league=NL]');
 assert(await nl.locator('tr[data-team-id="119"]').evaluate(el=>el.classList.contains('followed')),'followed team row not highlighted');
 assert.equal(await nl.locator('tr[data-team-id="119"] .standings-star').count(),1);
 // 外卡：分區領先 + 外卡排名，前 3 名下方有晉級線。
 await page.locator('#standingsView .league-switch [data-league=AL]').click();
 await page.locator('#standingsView [data-mode=wildcard]').click();
 assert.deepEqual(await al.locator('.standings-section h3').evaluateAll(list=>list.map(h=>h.firstChild.textContent)),['分區領先','外卡']);
 assert.deepEqual(await al.locator('.standings-section').nth(1).locator('tbody tr').evaluateAll(rows=>rows.map(r=>r.dataset.teamId)),['147','111','145','140']);
 assert.equal(await al.locator('.standings-section').nth(1).locator('tr.cutline').getAttribute('data-team-id'),'145');
 assert((await al.locator('.standings-section').nth(1).innerText()).includes('+9.5'));

 // 台灣旅外球員：依最高層級分組，中文名、英文名、母隊、各層級成績與今日比賽。
 await openMain(page,'taiwan');
 assert.equal(await page.locator('#appTitle').innerText(),'台灣旅外球員');
 const lee=page.locator('.tw-card[data-player-id="701678"]');await lee.waitFor();
 assert.deepEqual(await page.locator('#taiwanView .tw-group h3').allInnerTexts(),['大聯盟','3A']);
 const leeText=await lee.innerText();
 for(const text of ['李灝宇','Hao-Yu Lee','二壘手','老虎','打擊率 .264','12 轟','3A','打擊率 .232'])assert(leeText.includes(text),'Lee card missing '+text);
 await lee.locator('.tw-today.live').filter({hasText:'比賽進行中 2 : 1 @ Some Club'}).waitFor();
 const linText=await page.locator('.tw-card[data-player-id="827734"]').innerText();
 for(const text of ['林維恩','投手','運動家體系 · Las Vegas Aviators','90.0 局','防禦率 3.10','5 勝 3 敗','80 三振'])assert(linText.includes(text),'Lin card missing '+text);
 assert((await page.locator('#taiwanView .subs-intro').innerText()).includes('共 2 人（大聯盟 1 人）'));
 assert.deepEqual(errors,[]);await page.close();
});

// ---------- v2.4.0 名人堂、球員資料 ----------
const hofRecipient=(season,id,name,type,abbreviation,team,notes)=>({id:'MLBHOF',season:String(season),...(team?{team:{id:team}}:{}),player:{id,nameFirstLast:name,primaryPosition:{type,abbreviation}},...(notes?{notes}:{})});
const hofData={awards:[
  hofRecipient(2026,116999,'Jeff Kent','Infielder','2B',137,'Contemporary Era Ballot Selection'),
  hofRecipient(2026,136860,'Carlos Beltrán','Outfielder','OF',121),
  hofRecipient(2025,400085,'Ichiro Suzuki','Outfielder','OF',136),
  hofRecipient(2025,115223,'Billy Wagner','Pitcher','RP',117),
  hofRecipient(2017,673180,'Bud Selig','Unknown','X'),
  hofRecipient(1936,121578,'Babe Ruth','Outfielder','RF',147)]};
const career=(group,stat)=>({type:{displayName:'career'},group:{displayName:group},splits:[{stat}]});
const yearRow=(season,sport,team,stat)=>({season:String(season),sport:{abbreviation:sport},...(team?{team}:{}),stat});
const playerFixtures={
  400085:{person:{id:400085,fullName:'Ichiro Suzuki',primaryNumber:'51',birthDate:'1973-10-22',birthCity:'Kasugai',birthCountry:'Japan',height:'5\' 11"',weight:175,active:false,
    mlbDebutDate:'2001-04-02',lastPlayedDate:'2019-03-21',primaryPosition:{type:'Outfielder',abbreviation:'RF'},pitchHand:{code:'R'},batSide:{code:'L'},
    awards:[{id:'ALMVP',name:'AL MVP',season:'2001'},{id:'ALAS',name:'AL All-Star',season:'2001'},{id:'ALAS',name:'AL All-Star',season:'2002'},{id:'ALGG',name:'Rawlings AL Gold Glove',season:'2001'},
      {id:'ASMVP',name:'Ted Williams All-Star MVP',season:'2007'},{id:'MLBHOF',name:'Hall Of Fame',season:'2025'},{id:'RETIREDUNI_136',name:'Uniform number retired',season:'2025'},
      {id:'TLMSAS',name:'TEX Mid-Season All-Star',season:'2000'},{id:'SEAMVP',name:'Mariners MVP',season:'2001'}],
    stats:[career('hitting',{gamesPlayed:2653,hits:3089,homeRuns:117,rbi:780,stolenBases:509,avg:'.311',obp:'.355',ops:'.757'}),career('pitching',{gamesPlayed:1,wins:0,losses:0,era:'9.00'})]},
    years:{hitting:{stats:[{splits:[
      yearRow(2001,'MLB',{id:136,name:'Seattle Mariners'},{gamesPlayed:157,atBats:692,hits:242,homeRuns:8,rbi:69,stolenBases:56,avg:'.350',ops:'.838'}),
      yearRow(2012,'MLB',{id:136,name:'Seattle Mariners'},{gamesPlayed:95,atBats:402,hits:105,homeRuns:4,rbi:28,stolenBases:15,avg:'.261',ops:'.642'}),
      yearRow(2012,'MLB',{id:147,name:'New York Yankees'},{gamesPlayed:67,atBats:227,hits:73,homeRuns:5,rbi:27,stolenBases:14,avg:'.322',ops:'.794'}),
      yearRow(2012,'MLB',null,{gamesPlayed:162,atBats:629,hits:178})]}]}}},
  121578:{person:{id:121578,fullName:'Babe Ruth',primaryNumber:'3',birthDate:'1895-02-06',deathDate:'1948-08-16',birthCity:'Baltimore',birthStateProvince:'MD',birthCountry:'USA',active:false,
    mlbDebutDate:'1914-07-11',lastPlayedDate:'1935-05-30',primaryPosition:{type:'Outfielder',abbreviation:'RF'},pitchHand:{code:'L'},batSide:{code:'L'},
    awards:[{id:'MLBHOF',name:'Hall Of Fame',season:'1936'}],
    stats:[career('hitting',{gamesPlayed:2504,hits:2873,homeRuns:714,rbi:2213,stolenBases:123,avg:'.342',obp:'.474',ops:'1.164'}),career('pitching',{gamesPlayed:163,wins:94,losses:46,era:'2.28',inningsPitched:'1221.1',strikeOuts:488,saves:4,whip:'1.16'})]},
    years:{hitting:{stats:[{splits:[yearRow(1914,'Minors',null,{gamesPlayed:46}),yearRow(1914,'AAA',{id:9001,name:'Providence Grays'},{gamesPlayed:46}),yearRow(1914,'MLB',{id:111,name:'Boston Red Sox'},{gamesPlayed:5,avg:'.200'}),
      yearRow(1927,'MLB',{id:147,name:'New York Yankees'},{gamesPlayed:151,homeRuns:60,avg:'.356'}),yearRow(1935,'MLB',{id:144,name:'Boston Braves'},{gamesPlayed:28,avg:'.181'})]}]},
      pitching:{stats:[{splits:[yearRow(1916,'MLB',{id:111,name:'Boston Red Sox'},{gamesPlayed:44,wins:23,losses:12,era:'1.75'})]}]}}},
  827734:{person:{id:827734,fullName:'Wei-En Lin',primaryNumber:'61',birthDate:'2005-11-25',birthCity:'Taitung',birthCountry:'Taiwan',active:true,
    currentTeam:{id:400,name:'Las Vegas Aviators',parentOrgId:133},primaryPosition:{type:'Pitcher',abbreviation:'P'},pitchHand:{code:'L'},batSide:{code:'L'},
    awards:[{id:'TLMSAS',name:'TEX Mid-Season All-Star',season:'2025'}],stats:[]},
    years:{pitching:{stats:[{splits:[
      yearRow(2025,'Minors',null,{gamesPlayed:20}),
      yearRow(2025,'A+',{id:498,name:'Lansing Lugnuts'},{gamesPlayed:8,gamesStarted:8,wins:2,losses:1,inningsPitched:'35.0',strikeOuts:40,era:'2.60'}),
      yearRow(2025,'AA',{id:499,name:'Midland RockHounds'},{gamesPlayed:12,gamesStarted:12,wins:4,losses:3,inningsPitched:'60.0',strikeOuts:70,era:'3.30'}),
      yearRow(2026,'AAA',{id:400,name:'Las Vegas Aviators'},{gamesPlayed:20,gamesStarted:20,wins:5,losses:3,inningsPitched:'90.0',strikeOuts:80,era:'3.10'}),
      yearRow(2026,'Minors',{id:400,name:'Las Vegas Aviators'},{gamesPlayed:20})]}]}}}
};
const wikiEntity=(sitelinks,birth)=>({sitelinks:Object.fromEntries(Object.entries(sitelinks).map(([site,title])=>[site,{site,title}])),...(birth?{claims:{P569:[{mainsnak:{datavalue:{value:{time:birth}}}}]}}:{})});
const wikiData={
  search:{'haswbstatement:P3541=400085':['Q600'],'Babe Ruth baseball haswbstatement:P31=Q5':['Q1','Q213812']},
  entities:{Q600:wikiEntity({zhwiki:'鈴木一朗',enwiki:'Ichiro Suzuki'}),Q1:wikiEntity({enwiki:'Babe Ruth (band)'},'+1970-01-01T00:00:00Z'),Q213812:wikiEntity({enwiki:'Babe Ruth'},'+1895-02-06T00:00:00Z')},
  extracts:{'zh|鈴木一朗':'鈴木一朗（1973年10月22日—）是日本棒球選手。\n\n他在2001年加入西雅圖水手。',
    'en|Babe Ruth':['George Herman "Babe" Ruth (; February 6, 1895 – August 16, 1948) was an American professional baseball player.',...Array.from({length:4},(_,i)=>`Paragraph ${i+2}: `+'Ruth played for the Red Sox and the Yankees and set many records. '.repeat(6))].join('\n')}
};
test('Hall of Fame, player page and Taiwan player link',async()=>{
 const worker=r=>{const u=new URL(r.request().url());
  if(u.pathname.endsWith('/state'))return r.fulfill({json:{ok:true,teams:[],games:[],defaults:ALL}});
  if(u.pathname==='/api/taiwan-players')return r.fulfill({json:twData});
  return r.fulfill({json:{ok:true,subscribed:false}});};
 const {page,errors}=await setup({worker});
 const calls=[];
 // 維基百科：鈴木一朗以 MLB 編號找到中文條目；Babe Ruth 沒有編號，用姓名 + 生日找到英文條目；其他人查不到。
 await page.route(/^https:\/\/(www\.wikidata\.org|[a-z]+\.wikipedia\.org)\//,r=>{const u=new URL(r.request().url());
  if(u.hostname==='www.wikidata.org'){
   if(u.searchParams.get('list')==='search'){calls.push('wiki:'+u.searchParams.get('srsearch'));return r.fulfill({json:{query:{search:(wikiData.search[u.searchParams.get('srsearch')]||[]).map(title=>({title}))}}});}
   return r.fulfill({json:{entities:Object.fromEntries(u.searchParams.get('ids').split('|').map(id=>[id,wikiData.entities[id]]))}});
  }
  const lang=u.hostname.split('.')[0],key=lang+'|'+u.searchParams.get('titles');
  if(lang==='zh')assert.equal(u.searchParams.get('variant'),'zh-tw');
  return r.fulfill({json:{query:{pages:[key in wikiData.extracts?{title:u.searchParams.get('titles'),extract:wikiData.extracts[key]}:{title:u.searchParams.get('titles'),missing:true}]}}});
 });
 await page.route('https://statsapi.mlb.com/**',r=>{const u=new URL(r.request().url());
  if(u.pathname.endsWith('/awards/MLBHOF/recipients')){calls.push('hof');return r.fulfill({json:hofData});}
  const m=u.pathname.match(/\/people\/(\d+)(\/stats)?$/);
  if(m){
   const fixture=playerFixtures[m[1]];calls.push(m[1]+(m[2]?':'+u.searchParams.get('group'):''));
   if(!fixture)return r.fulfill({status:404,body:''});
   return r.fulfill({json:m[2]?fixture.years[u.searchParams.get('group')]||{stats:[]}:{people:[fixture.person]}});
  }
  return r.fallback();});

 // 名人堂：依入選年份分組（新到舊），同年依姓名排列；守備位置、銘牌球隊、入選說明。
 await openMain(page,'hof');
 assert.equal(await page.locator('#appTitle').innerText(),'名人堂');
 await page.locator('#hofView .hof-card').first().waitFor();
 assert.deepEqual(await page.locator('#hofView .hof-year h3').allInnerTexts(),['2026 年','2025 年','2017 年','1936 年']);
 assert.deepEqual(await page.locator('#hofView .hof-year').first().locator('.hof-name').allInnerTexts(),['Carlos Beltrán','Jeff Kent']);
 const kent=await page.locator('.hof-card[data-player-id="116999"]').innerText();
 for(const text of ['二壘手 · 巨人','當代時代委員會選入'])assert(kent.includes(text),'Kent card missing '+text);
 assert((await page.locator('.hof-card[data-player-id="115223"]').innerText()).includes('救援投手 · 太空人'));
 assert((await page.locator('.hof-card[data-player-id="673180"]').innerText()).includes('非球員'));
 assert((await page.locator('#hofView .subs-intro').innerText()).includes('1936–2026 年的入選者，共 6 人'));
 // 身分篩選（按鈕上是人數）、搜尋（不分大小寫與重音，也可用中文隊名）、年代。
 assert.equal(await page.locator('[data-category=all] small').innerText(),'6');
 assert.equal(await page.locator('[data-category=Unknown] small').innerText(),'1');
 await page.locator('[data-category=Outfielder]').click();
 assert.deepEqual(await page.locator('#hofView .hof-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.playerId)),['136860','400085','121578']);
 await page.locator('[data-category=all]').click();
 await page.locator('.hof-search').fill('BELTRAN');
 assert.deepEqual(await page.locator('#hofView .hof-name').allInnerTexts(),['Carlos Beltrán']);
 await page.locator('.hof-search').fill('水手');
 assert.deepEqual(await page.locator('#hofView .hof-name').allInnerTexts(),['Ichiro Suzuki']);
 assert.equal(await page.locator('[data-category=Outfielder] small').innerText(),'1');
 await page.locator('.hof-search').fill('nobody');
 assert.equal(await page.locator('#hofView .subs-empty').innerText(),'沒有符合條件的名人堂成員。');
 await page.locator('.hof-result .subs-link').click();
 assert.equal(await page.locator('#hofView .hof-card').count(),6);
 await page.locator('.hof-decade').selectOption('1930');
 assert.deepEqual(await page.locator('#hofView .hof-name').allInnerTexts(),['Babe Ruth']);
 await page.locator('.hof-decade').selectOption('all');
 assert.equal(calls.filter(c=>c==='hof').length,1);

 // 點進球員資料：網址帶球員 id、捲到頂端；返回時回到名人堂原本的位置。
 const scrolled=await page.evaluate(()=>{window.scrollTo(0,120);return window.scrollY});
 await page.locator('.hof-card[data-player-id="400085"]').click();
 await page.locator('#playerView .player-head').waitFor();
 assert(await page.locator('#playerView').isVisible());assert(!(await page.locator('#hofView').isVisible()));
 assert.equal(await page.locator('#appTitle').innerText(),'球員資料');
 assert.equal(new URL(page.url()).searchParams.get('playerId'),'400085');
 await page.waitForFunction(()=>window.scrollY===0);
 const head=await page.locator('#playerView .player-head').innerText();
 for(const text of ['Ichiro Suzuki','#51 · 右外野手 · 右投左打','名人堂 2025'])assert(head.includes(text),'head missing '+text);
 const facts=await page.locator('#playerView .player-facts').innerText();
 for(const text of ['1973/10/22','日本 · Kasugai','180 公分 · 79 公斤','2001/04/02','2019/03/21'])assert(facts.includes(text),'facts missing '+text);
 assert(!/\d{4}-\d{2}-\d{2}/.test(facts),'dates must use slashes');
 // 大聯盟生涯（投球只有 1 場，只列打擊）。
 assert.equal(await page.locator('#playerView .player-tiles').count(),1);
 assert.deepEqual(await page.locator('#playerView .player-tile b').allInnerTexts(),['2653','3089','117','780','509','.311','.355','.757']);
 // 主要獎項在逐年成績上方。
 assert.deepEqual(await page.locator('#playerView .subs-section h3').allInnerTexts(),['大聯盟生涯','主要獎項','逐年成績','生平']);
 // 生平（最下方）：中文維基（台灣正體），短文不收合；標示條目連結與 CC BY-SA 授權。
 const wiki=page.locator('#playerView .player-wiki');
 await wiki.locator('.player-wiki-text').waitFor();
 assert.equal(await wiki.locator('.player-wiki-text').getAttribute('lang'),'zh-Hant-TW');
 assert.deepEqual(await wiki.locator('.player-wiki-text p').allInnerTexts(),['鈴木一朗（1973年10月22日—）是日本棒球選手。','他在2001年加入西雅圖水手。']);
 assert.equal(await wiki.locator('.player-wiki-toggle').count(),0);
 assert.equal(await wiki.locator('.player-wiki-credit a').first().getAttribute('href'),'https://zh.wikipedia.org/zh-tw/%E9%88%B4%E6%9C%A8%E4%B8%80%E6%9C%97');
 assert.equal(await wiki.locator('.player-wiki-credit a').nth(1).getAttribute('href'),'https://creativecommons.org/licenses/by-sa/4.0/');
 assert((await wiki.locator('.player-wiki-credit').innerText()).includes('維基百科貢獻者'));
 // 逐年成績：每年一列、舊到新；同年兩隊顯示合計「2 隊」，點一下展開各隊（依先後），再點收合。
 const rows=(table=page.locator('#playerView .player-years').first())=>table.locator('tbody tr').evaluateAll(list=>list.map(row=>[...row.cells].slice(0,4).map((cell,i)=>i===0?(cell.querySelector('.year-num')?.textContent||''):cell.textContent).join('|')));
 assert.deepEqual(await rows(),['2001|MLB|水手|157','2012|MLB|2 隊|162']);
 const year2012=page.locator('#playerView .player-years tbody tr.has-more').filter({hasText:'2012'});
 assert.equal(await year2012.locator('.year-more').innerText(),'+2');
 assert.equal(await year2012.locator('.year-toggle').getAttribute('aria-expanded'),'false');
 await year2012.click();
 assert.deepEqual(await rows(),['2001|MLB|水手|157','2012|MLB|2 隊|162','|MLB|水手|95','|MLB|洋基|67']);
 assert.equal(await year2012.locator('.year-toggle').getAttribute('aria-expanded'),'true');
 assert.equal(await page.locator('#playerView .player-years tr.sub').count(),2);
 // 鍵盤：年份按鈕按 Enter 收合（點擊冒泡到整列，只切換一次）。
 await year2012.locator('.year-toggle').focus();await page.keyboard.press('Enter');
 assert.deepEqual(await rows(),['2001|MLB|水手|157','2012|MLB|2 隊|162']);
 // 只有大聯盟時不標「含小聯盟」。
 assert.equal(await page.locator('#playerView .subs-section-head span').filter({hasText:'含小聯盟'}).count(),0);
 // 主要獎項依 MLB 獎項 id：小聯盟明星賽與球隊 MVP 不列；退休背號。
 assert.deepEqual(await page.locator('#playerView .player-awards b').evaluateAll(list=>list.map(b=>b.firstChild.textContent)),['名人堂','明星賽 MVP','美聯 MVP','美聯明星賽','美聯金手套','水手退休背號']);
 assert((await page.locator('#playerView .player-awards li').filter({hasText:'美聯明星賽'}).innerText()).includes('×2'));
 await page.locator('#playerView .player-back').filter({hasText:'返回名人堂'}).click();
 await page.waitForFunction(()=>!document.querySelector('#hofView').hidden);
 assert.equal(new URL(page.url()).searchParams.get('playerId'),null);
 await page.waitForFunction(y=>window.scrollY===y,scrolled);

 // 打者也投過不少場（Babe Ruth）：打擊與投球都列；瀏覽器上一頁 / 下一頁。
 await page.locator('.hof-card[data-player-id="121578"]').click();
 await page.locator('#playerView .player-head').filter({hasText:'Babe Ruth'}).waitFor();
 assert.deepEqual(await page.locator('#playerView .player-tiles').evaluateAll(list=>list.map(n=>n.getAttribute('aria-label'))),['打擊','投球']);
 assert((await page.locator('#playerView .player-facts').innerText()).includes('1895/02/06 – 1948/08/16'));
 assert.equal(await page.locator('#playerView .player-years').count(),2);
 assert((await page.locator('#playerView .player-years').first().innerText()).includes('勇士'));
 // 有大聯盟的年份以大聯盟為主，同年的小聯盟收合，點一下展開。
 const ruthHitting=page.locator('#playerView .player-years').first();
 assert.deepEqual(await rows(ruthHitting),['1914|MLB|紅襪|5','1927|MLB|洋基|151','1935|MLB|勇士|28']);
 await ruthHitting.locator('tbody tr.has-more').filter({hasText:'1914'}).click();
 assert.deepEqual(await rows(ruthHitting),['1914|MLB|紅襪|5','|3A|Providence Grays|46','1927|MLB|洋基|151','1935|MLB|勇士|28']);
 assert.equal(await page.locator('#playerView .subs-section-head span').filter({hasText:'含小聯盟'}).count(),1);
 // 沒有中文條目：英文維基並註明；姓名搜尋選生日相符的人；長文先收合，可展開 / 收合；清掉發音殘骸。
 const ruthWiki=page.locator('#playerView .player-wiki');
 await ruthWiki.locator('.player-wiki-text[lang=en]').waitFor();
 assert((await ruthWiki.innerText()).includes('中文維基百科沒有這個條目'));
 assert((await ruthWiki.locator('.player-wiki-text p').first().innerText()).startsWith('George Herman "Babe" Ruth (February 6, 1895'));
 assert.equal(await ruthWiki.locator('.player-wiki-credit a').first().getAttribute('href'),'https://en.wikipedia.org/wiki/Babe_Ruth');
 const toggle=ruthWiki.locator('.player-wiki-toggle');
 assert.equal(await toggle.innerText(),'展開全文');assert(await ruthWiki.locator('.player-wiki-text.clamp').count());
 await toggle.click();
 assert.equal(await toggle.innerText(),'收合');assert.equal(await toggle.getAttribute('aria-expanded'),'true');assert.equal(await ruthWiki.locator('.player-wiki-text.clamp').count(),0);
 await toggle.click();assert.equal(await toggle.innerText(),'展開全文');
 await page.goBack();
 await page.waitForFunction(()=>!document.querySelector('#hofView').hidden);
 assert.equal(new URL(page.url()).searchParams.get('playerId'),null);
 await page.goForward();
 await page.locator('#playerView .player-head').filter({hasText:'Babe Ruth'}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('#playerView').hidden);
 await page.goBack();
 await page.waitForFunction(()=>!document.querySelector('#hofView').hidden);
 // 同一位球員只抓一次（快取），維基百科也是。
 assert.equal(calls.filter(c=>c==='121578').length,1);
 assert.equal(calls.filter(c=>c==='wiki:haswbstatement:P3541=121578').length,1);

 // 台灣旅外卡片點進球員資料：中文名、母隊體系、只有小聯盟成績；返回台灣旅外。
 await openMain(page,'taiwan');
 await page.locator('.tw-card[data-player-id="827734"]').click();
 await page.locator('#playerView .player-head').filter({hasText:'林維恩'}).waitFor();
 const lin=await page.locator('#playerView').innerText();
 for(const text of ['林維恩','Wei-En Lin','#61 · 投手 · 左投左打','現役','運動家體系 · Las Vegas Aviators','台灣 · Taitung','尚未在大聯盟出賽，以下為小聯盟成績。','含小聯盟'])assert(lin.includes(text),'Lin page missing '+text);
 // 只有小聯盟的年份：同年多隊顯示小聯盟合計，展開後依 API 順序（層級由低到高）。
 assert.deepEqual(await rows(),['2025|小聯盟|2 隊|20','2026|3A|Las Vegas Aviators|20']);
 await page.locator('#playerView .player-years tbody tr.has-more').filter({hasText:'2025'}).click();
 assert.deepEqual(await rows(),['2025|小聯盟|2 隊|20','|高階1A|Lansing Lugnuts|8','|2A|Midland RockHounds|12','2026|3A|Las Vegas Aviators|20']);
 assert.equal(await page.locator('#playerView .player-awards').count(),0);
 // 維基百科查不到：不顯示生平。
 await page.waitForFunction(()=>!document.querySelector('#playerView .player-wiki'));
 assert(calls.includes('wiki:Wei-En Lin baseball haswbstatement:P31=Q5'));
 assert.equal(await page.locator('#playerView .player-back').innerText(),'← 返回台灣旅外');
 await page.locator('#playerView .player-back').click();
 await page.waitForFunction(()=>!document.querySelector('#taiwanView').hidden);
 assert(await page.locator('.tw-card[data-player-id="827734"]').isVisible());

 // 卡片內的名字按鈕：鍵盤操作也只開一次（點擊冒泡到卡片）。
 await page.evaluate(()=>{window.pushCount=0;const push=history.pushState.bind(history);history.pushState=(...args)=>{window.pushCount++;return push(...args)}});
 await page.locator('.tw-card[data-player-id="827734"] .tw-open').focus();
 await page.keyboard.press('Enter');
 await page.locator('#playerView .player-head').filter({hasText:'林維恩'}).waitFor();
 assert.equal(await page.evaluate(()=>history.state?.mlbPlayer),827734);
 assert.equal(await page.evaluate(()=>window.pushCount),1);
 await page.goBack();
 await page.waitForFunction(()=>!document.querySelector('#taiwanView').hidden);

 // 直接開啟球員網址（分享連結）：返回名人堂，並移除網址參數。
 await page.goto(origin+'/?view=player&playerId=400085');
 await page.locator('#playerView .player-head').filter({hasText:'Ichiro Suzuki'}).waitFor();
 assert.equal(await page.locator('#playerView .player-back').innerText(),'← 返回名人堂');
 await page.locator('#playerView .player-back').click();
 await page.locator('#hofView .hof-card').first().waitFor();
 assert.equal(new URL(page.url()).search,'');
 // 找不到的球員顯示錯誤，不讓頁面壞掉。
 await page.goto(origin+'/?view=player&playerId=1');
 await page.locator('#playerView .subs-banner').filter({hasText:'球員資料讀取失敗'}).waitFor();
 assert.deepEqual(errors,[]);await page.close();
});

// ---------- v2.6.0 外觀：深色 / 淺色 / 跟隨系統 ----------
test('Appearance setting: dark, light and follow system',async()=>{
 const {page,errors}=await setup();
 const theme=()=>page.evaluate(()=>document.documentElement.dataset.theme);
 const panel=()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--panel').trim());
 const option=value=>page.locator(`#settingsView [data-theme-option=${value}]`);
 // 預設深色。
 assert.equal(await theme(),'dark');assert.equal(await panel(),'#0c1b2d');
 await page.locator('#featureMenuButton').click();await page.waitForTimeout(300);
 await page.locator('[data-menu-settings]').click();
 await page.locator('[data-view=settings]').click();await page.waitForTimeout(320);
 assert.equal(await page.locator('#appTitle').innerText(),'外觀');
 assert.deepEqual(await page.locator('#settingsView [data-theme-option] b').allInnerTexts(),['深色','淺色','跟隨系統']);
 assert.equal(await option('dark').getAttribute('aria-checked'),'true');
 // 淺色：整頁換色、網址列顏色、記在這台裝置。
 await option('light').click();
 assert.equal(await theme(),'light');assert.equal(await panel(),'#ffffff');
 assert.equal(await option('light').getAttribute('aria-checked'),'true');assert.equal(await option('dark').getAttribute('aria-checked'),'false');
 assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),'#eef2f7');
 assert.equal(await page.evaluate(()=>localStorage.getItem('mlb-theme')),'light');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#settingsView .card')).color),'rgb(19, 32, 46)');
 // 重新整理後仍是淺色（<head> 先套用，不會先閃深色）。
 await page.reload();
 assert.equal(await theme(),'light');
 await page.locator('.app-version').filter({hasText:'v'+version}).waitFor();
 assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),'#eef2f7');
 // 跟隨系統：系統是深色就深色，切到淺色立刻跟著變。
 await page.emulateMedia({colorScheme:'dark'});
 await page.goto(origin+'/?view=settings');
 await option('system').click();
 assert.equal(await theme(),'dark');assert.equal(await page.evaluate(()=>localStorage.getItem('mlb-theme')),'system');
 await page.emulateMedia({colorScheme:'light'});
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 await page.reload();assert.equal(await theme(),'light');
 // 回到深色。
 await page.goto(origin+'/?view=settings');
 await option('dark').click();
 assert.equal(await theme(),'dark');assert.equal(await panel(),'#0c1b2d');
 assert.equal(await page.evaluate(()=>localStorage.getItem('mlb-theme')),'dark');
 assert.deepEqual(errors,[]);await page.close();
});
