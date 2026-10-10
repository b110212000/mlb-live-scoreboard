/* MLB Live Scoreboard - notifications.js
   單場比賽訂閱（鈴鐺）、訂閱管理（追蹤球隊、提醒項目）與 Web Push 測試。 */

const PUSH_API='https://mlb-score-notify.b110212000.workers.dev';
let notificationTestBusy=false;
let notificationCountdownTimer=null;
let gameWatchBusy=false;
const GAME_WATCH_STORAGE='mlb-watched-games-v1';
const GAME_WATCH_DEVICE_ID='mlb-push-device-id';
const gameWatchStatusCheckedAt=new Map();
const gameWatchRevision=new Map();
const gameWatchFinal=new Set();
const SUBS_PREF_KEYS=['pregame5','start','homeScore','awayScore','final'];
const SUBS_DEFAULT_PREFS={pregame5:true,start:true,homeScore:true,awayScore:true,final:true};
let subsState={status:'idle',error:'',notice:'',support:'default',defaults:{...SUBS_DEFAULT_PREFS},teams:[],games:[],busy:{}};
let subsLoadSeq=0;
let subsImportTried=false;
const subsGameInfo=new Map();

function pushBase64ToUint8Array(value){
  const padding='='.repeat((4-value.length%4)%4);
  const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}

function notificationPermissionText(){
  if(!('Notification' in window))return '此瀏覽器不支援通知';
  if(Notification.permission==='granted')return '✅ 通知權限已允許';
  if(Notification.permission==='denied')return '❌ 通知權限已封鎖';
  return '尚未允許通知';
}

function setNotificationMessage(text,type=''){
  if(!els.notificationTestMessage)return;
  els.notificationTestMessage.textContent=text;
  els.notificationTestMessage.className='notification-test-message'+(type?' '+type:'');
}

function clearNotificationCountdown(){
  if(notificationCountdownTimer){
    clearInterval(notificationCountdownTimer);
    notificationCountdownTimer=null;
  }
}

function startNotificationCountdown(targetTime){
  clearNotificationCountdown();
  const render=()=>{
    const left=Math.max(0,Math.ceil((targetTime-Date.now())/1000));
    if(left<=0){
      clearNotificationCountdown();
      setNotificationMessage('第一則已送出；第二則背景通知正在送達…','success');
      return;
    }
    setNotificationMessage(`第一則已送出。可以關閉網站；第二則約 ${left} 秒後送達。`,'success');
  };
  render();
  notificationCountdownTimer=setInterval(render,1000);
}

async function getPushServiceWorker(){
  const registration=await navigator.serviceWorker.register('./service-worker.js',{
    scope:'./',
    updateViaCache:'none'
  });
  try{await registration.update()}catch(_){}
  return navigator.serviceWorker.ready;
}

async function getOrCreatePushSubscription(registration,publicKey){
  let subscription=await registration.pushManager.getSubscription();
  const previousKey=localStorage.getItem('mlb-vapid-public-key');

  if(subscription&&previousKey&&previousKey!==publicKey){
    try{await subscription.unsubscribe()}catch(_){}
    subscription=null;
  }

  if(!subscription){
    subscription=await registration.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:pushBase64ToUint8Array(publicKey)
    });
  }

  localStorage.setItem('mlb-vapid-public-key',publicKey);
  return subscription;
}

function getGameWatchDeviceId(){
  let id=localStorage.getItem(GAME_WATCH_DEVICE_ID);
  if(id)return id;
  id=crypto.randomUUID?.()||('device-'+Date.now()+'-'+Math.random().toString(36).slice(2));
  localStorage.setItem(GAME_WATCH_DEVICE_ID,id);
  return id;
}

function readWatchedGames(){
  try{
    const list=JSON.parse(localStorage.getItem(GAME_WATCH_STORAGE)||'[]');
    return new Set(Array.isArray(list)?list.map(String):[]);
  }catch(_){
    return new Set();
  }
}

function setGameWatchedLocal(gamePk,watched){
  const set=readWatchedGames();
  const key=String(gamePk);
  if(watched)set.add(key);
  else set.delete(key);
  localStorage.setItem(GAME_WATCH_STORAGE,JSON.stringify([...set]));
}

function isGameFinalStatus(feed){
  const status=feed?.gameData?.status||{};
  return /final|game over|completed/i.test(
    String(status.abstractGameState||'')+' '+String(status.detailedState||'')
  );
}

function renderGameWatchButton(feed){
  const btn=els.gameWatchBtn;
  if(!btn)return;

  const gamePk=Number(feed?.gameData?.game?.pk??state.selectedGamePk);
  const final=isGameFinalStatus(feed)||gameWatchFinal.has(gamePk);

  if(!Number.isInteger(gamePk)||gamePk<=0||final){
    btn.hidden=true;
    if(final&&gamePk)setGameWatchedLocal(gamePk,false);
    return;
  }

  const watched=readWatchedGames().has(String(gamePk));
  btn.hidden=false;
  btn.dataset.gamePk=String(gamePk);
  btn.classList.toggle('subscribed',watched);
  btn.setAttribute('aria-pressed',String(watched));
  btn.setAttribute('aria-label',watched?'取消這場比賽通知':'訂閱這場比賽通知');
  btn.title=watched?'取消這場比賽通知':'訂閱這場比賽通知';
  btn.disabled=gameWatchBusy;
}

async function syncGameWatchStatus(gamePk,{force=false}={}){
  const btn=els.gameWatchBtn;
  const pk=Number(gamePk);
  if(!btn||!Number.isInteger(pk)||pk<=0)return;

  const revision=gameWatchRevision.get(pk)||0;
  const now=Date.now();
  const checked=gameWatchStatusCheckedAt.get(pk)||0;
  if(!force&&now-checked<30000)return;
  gameWatchStatusCheckedAt.set(pk,now);

  try{
    const deviceId=getGameWatchDeviceId();
    const response=await fetch(
      PUSH_API+'/api/watch/'+pk+'/status?deviceId='+encodeURIComponent(deviceId),
      {cache:'no-store'}
    );
    if(!response.ok)return;
    const result=await response.json().catch(()=>({}));
    if(revision!==(gameWatchRevision.get(pk)||0)||gameWatchBusy)return;
    setGameWatchedLocal(pk,Boolean(result.subscribed));
    if(Number(btn.dataset.gamePk)===pk&&Number(state.selectedGamePk)===pk){
      if(result.final){
        gameWatchFinal.add(pk);
        btn.hidden=true;
        setGameWatchedLocal(pk,false);
      }else{
        renderGameWatchButton(state.currentFeedGamePk===pk?state.currentFeed:null);
      }
    }
  }catch(_){
    // 後端狀態同步失敗時維持本機狀態，不影響比分。
  }
}

async function toggleGameWatch(){
  const btn=els.gameWatchBtn;
  if(!btn||btn.hidden||gameWatchBusy)return;

  const gamePk=Number(btn.dataset.gamePk||state.selectedGamePk);
  if(!Number.isInteger(gamePk)||gamePk<=0)return;

  const currentlyWatched=readWatchedGames().has(String(gamePk));
  gameWatchRevision.set(gamePk,(gameWatchRevision.get(gamePk)||0)+1);
  gameWatchBusy=true;
  btn.disabled=true;
  btn.classList.add('loading');

  try{
    // 訂閱與取消都經過裝置的訂閱清單（DeviceRegistry），訂閱管理頁才看得到。
    if(currentlyWatched){
      const data=await registryRequest('/games/'+gamePk,{method:'DELETE'});
      setGameWatchedLocal(gamePk,false);
      gameWatchStatusCheckedAt.set(gamePk,Date.now());
      showError('');
      applyRegistryState(data).catch(()=>{});
      return;
    }

    const subscription=await ensurePushSubscription();
    let data;
    try{
      data=await registryRequest('/games',{method:'POST',body:{gamePk,subscription}});
    }catch(error){
      if(error.code==='GAME_FINAL'||error.code==='GAME_CALLED_OFF'){
        setGameWatchedLocal(gamePk,false);
        gameWatchFinal.add(gamePk);
        if(Number(btn.dataset.gamePk)===gamePk)btn.hidden=true;
        return;
      }
      throw error;
    }

    setGameWatchedLocal(gamePk,true);
    gameWatchStatusCheckedAt.set(gamePk,Date.now());
    showError('');
    applyRegistryState(data).catch(()=>{});
  }catch(error){
    console.error('Game watch toggle failed',error);
    showError(error?.message||'比賽通知設定失敗');
  }finally{
    gameWatchRevision.set(gamePk,(gameWatchRevision.get(gamePk)||0)+1);
    gameWatchBusy=false;
    btn.classList.remove('loading');
    if(state.currentFeedGamePk===gamePk&&Number(state.selectedGamePk)===gamePk){
      renderGameWatchButton(state.currentFeed);
    }else{
      btn.disabled=false;
    }
  }
}

/* ---------- 訂閱管理：DeviceRegistry 用戶端 ---------- */

function subsPrefs(value,fallback=SUBS_DEFAULT_PREFS){
  const source=value&&typeof value==='object'?value:{};
  const prefs={};
  for(const key of SUBS_PREF_KEYS)prefs[key]=typeof source[key]==='boolean'?source[key]:fallback?.[key]!==false;
  return prefs;
}

function pushSupportState(){
  const supported='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  if(!supported)return 'unsupported';
  if(isIOSDevice()&&!isStandaloneApp())return 'needs-install';
  return Notification.permission||'default';
}

function registryErrorText(code){
  return ({
    GAME_FINAL:'這場比賽已經結束',
    GAME_CALLED_OFF:'這場比賽已延賽或取消',
    PUSH_SUBSCRIPTION_REQUIRED:'請先允許通知後再訂閱',
    TOO_MANY_GAMES:'訂閱的比賽太多了，請先取消一些',
    INVALID_TEAM:'找不到這支球隊',
    GAME_NOT_SUBSCRIBED:'這場比賽已不在訂閱清單',
    UNWATCH_FAILED:'取消訂閱失敗，請稍後再試',
    WATCH_FAILED:'訂閱失敗，請稍後再試'
  })[code]||'';
}

async function registryRequest(path,{method='GET',body}={}){
  const url=PUSH_API+'/api/devices/'+encodeURIComponent(getGameWatchDeviceId())+path;
  const options={method,cache:'no-store'};
  if(body!==undefined){
    options.headers={'content-type':'application/json'};
    options.body=JSON.stringify(body);
  }
  const response=await fetch(url,options);
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false){
    const error=new Error(registryErrorText(data.error)||'訂閱服務暫時無法使用，請稍後再試');
    error.code=data.error||'';
    error.data=data;
    throw error;
  }
  return data;
}

async function ensurePushSubscription(){
  const support=pushSupportState();
  if(support==='unsupported')throw new Error('這個瀏覽器不支援 Web Push 通知');
  if(support==='needs-install')throw new Error('iPhone / iPad 需先將網站加入主畫面，才能訂閱比賽通知');

  let permission=Notification.permission;
  if(permission==='default'){
    permission=await Notification.requestPermission();
  }
  if(permission!=='granted'){
    throw new Error(permission==='denied'
      ?'通知權限已被封鎖，請到系統設定允許通知'
      :'沒有取得通知權限');
  }

  const registration=await getPushServiceWorker();
  const keyResponse=await fetch(PUSH_API+'/api/push/public-key',{cache:'no-store'});
  if(!keyResponse.ok)throw new Error('無法取得通知公開金鑰');
  const {publicKey}=await keyResponse.json();
  if(!publicKey)throw new Error('通知公開金鑰不存在');

  const subscription=await getOrCreatePushSubscription(registration,publicKey);
  return subscription.toJSON();
}

// 不跳出權限詢問，只讀取目前已存在的推播訂閱。
async function currentPushSubscriptionJSON(){
  try{
    if(pushSupportState()!=='granted')return null;
    const registration=await navigator.serviceWorker.getRegistration('./');
    const subscription=await registration?.pushManager?.getSubscription();
    return subscription?subscription.toJSON():null;
  }catch(_){
    return null;
  }
}

function publishSubs(patch={}){
  subsState={...subsState,...patch};
  bridge.publish({subs:subsState});
}

function subscribedGameStatus(game){
  const status=game?.status||{};
  const coded=String(status.codedGameState||'').toUpperCase();
  const detailed=String(status.detailedState||'');
  if(coded==='D'||/postponed/i.test(detailed))return {text:'延賽',calledOff:true};
  if(coded==='C'||coded==='X'||/cancel|unknown/i.test(detailed))return {text:'取消',calledOff:true};
  if(/final|game over|completed/i.test((status.abstractGameState||'')+' '+detailed))return {text:'已結束',final:true};
  if(status.abstractGameState==='Live')return {text:'進行中',live:true};
  if(/warmup|pre-game/i.test(detailed))return {text:'即將開賽'};
  if(/delay/i.test(detailed))return {text:'延遲'};
  return {text:'未開賽'};
}

function subscribedSeriesName(game){
  const round=({F:'外卡系列賽',D:'分區賽',L:'冠軍賽',W:'世界大賽'})[game?.gameType]||'季後賽';
  const desc=String(game?.seriesDescription||'');
  const league=game?.gameType==='W'?'':/^(AL|American)/i.test(desc)?'美聯':/^(NL|National)/i.test(desc)?'國聯':'';
  const number=Number(game?.seriesGameNumber);
  return league+round+(number>0?' G'+number:'');
}

function subscribedGameTime(gameDate){
  const date=new Date(gameDate);
  if(!gameDate||Number.isNaN(date.getTime()))return '時間未定';
  const day=new Intl.DateTimeFormat('zh-TW',{month:'numeric',day:'numeric',weekday:'short'}).format(date);
  const time=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
  return day+' '+time;
}

async function hydrateSubscribedGames(gamePks){
  const missing=gamePks.filter(pk=>!subsGameInfo.has(pk)||!subsGameInfo.get(pk).final);
  if(!missing.length)return;
  try{
    const data=await getJSON(API+'/v1/schedule?sportId=1&hydrate=team&gamePks='+missing.join(','));
    for(const day of data?.dates||[]){
      for(const game of day?.games||[]){
        const away=game?.teams?.away||{},home=game?.teams?.home||{};
        const status=subscribedGameStatus(game);
        subsGameInfo.set(Number(game.gamePk),{
          awayId:Number(away.team?.id)||null,
          homeId:Number(home.team?.id)||null,
          awayName:teamZhName(away.team||{}),
          homeName:teamZhName(home.team||{}),
          awayScore:away.score??null,
          homeScore:home.score??null,
          gameDate:game.gameDate||null,
          timeText:subscribedGameTime(game.gameDate),
          statusText:status.text,
          live:Boolean(status.live),
          final:Boolean(status.final),
          calledOff:Boolean(status.calledOff),
          series:subscribedSeriesName(game)
        });
      }
    }
  }catch(_){
    // MLB 資料暫時讀不到時仍顯示清單，只是缺少隊名與狀態。
  }
}

async function applyRegistryState(data,seq=subsLoadSeq){
  const games=Array.isArray(data?.games)?data.games:[];
  const defaults=subsPrefs(data?.defaults);
  await hydrateSubscribedGames(games.map(game=>Number(game.gamePk)).filter(Boolean));
  if(seq!==subsLoadSeq)return;

  const list=games.map(game=>{
    const gamePk=Number(game.gamePk);
    const info=subsGameInfo.get(gamePk)||{};
    return {
      gamePk,
      source:game.source==='team'?'team':'manual',
      teamIds:Array.isArray(game.teamIds)?game.teamIds.map(Number):[],
      custom:Boolean(game.custom),
      prefs:subsPrefs(game.prefs,defaults),
      ...info,
      timeText:info.timeText||subscribedGameTime(game.gameDate)
    };
  }).filter(game=>!game.final&&!game.calledOff);

  // 清單上的場次（包含追蹤球隊自動加入的）讓鈴鐺立即顯示為已訂閱。
  for(const game of list)setGameWatchedLocal(game.gamePk,true);

  publishSubs({
    status:'ready',
    support:pushSupportState(),
    defaults,
    teams:(Array.isArray(data?.teams)?data.teams:[]).map(team=>Number(team.teamId)).filter(Boolean),
    games:list
  });
  if(state.currentFeedGamePk&&state.currentFeed)renderGameWatchButton(state.currentFeed);
}

// v2.1.0 以前直接訂閱、只存在本機清單的場次，搬進裝置的訂閱清單（不重發訂閱成功）。
async function importLegacyWatches(registryGames){
  if(subsImportTried)return false;
  subsImportTried=true;
  const known=new Set(registryGames.map(game=>Number(game.gamePk)));
  const legacy=[...readWatchedGames()].map(Number).filter(pk=>pk>0&&!known.has(pk));
  if(!legacy.length)return false;
  const subscription=await currentPushSubscriptionJSON();
  if(!subscription)return false;
  let imported=false;
  for(const gamePk of legacy){
    try{
      await registryRequest('/games',{method:'POST',body:{gamePk,subscription,import:true}});
      imported=true;
    }catch(error){
      if(error.code==='GAME_FINAL'||error.code==='GAME_CALLED_OFF')setGameWatchedLocal(gamePk,false);
    }
  }
  return imported;
}

async function loadSubscriptions(){
  const seq=++subsLoadSeq;
  publishSubs({status:subsState.status==='ready'?'ready':'loading',support:pushSupportState(),error:''});
  try{
    let data=await registryRequest('/state');
    if(await importLegacyWatches(data.games||[]))data=await registryRequest('/state');
    // 推播訂閱換過（例如重新允許通知）時，讓已訂閱的場次改送到新的 endpoint。
    const current=await currentPushSubscriptionJSON();
    if(current&&data.subscriptionEndpoint&&current.endpoint!==data.subscriptionEndpoint){
      data=await registryRequest('/subscription',{method:'PUT',body:{subscription:current}});
    }
    if(seq!==subsLoadSeq)return;
    await applyRegistryState(data,seq);
  }catch(error){
    if(seq!==subsLoadSeq)return;
    publishSubs({status:'error',error:error?.message||'無法載入訂閱資料'});
  }
}

async function mutateSubscriptions(key,run,successText){
  if(subsState.busy[key])return false;
  const seq=++subsLoadSeq;
  publishSubs({busy:{...subsState.busy,[key]:true},error:'',notice:''});
  try{
    const data=await run();
    await applyRegistryState(data,seq);
    const notice=typeof successText==='function'?successText(data):successText;
    if(notice)publishSubs({notice});
    return true;
  }catch(error){
    console.error('Subscription update failed',error);
    publishSubs({error:error?.message||'操作失敗，請稍後再試'});
    if(Array.isArray(error?.data?.games))await applyRegistryState(error.data,seq).catch(()=>{});
    else loadSubscriptions();
    return false;
  }finally{
    const busy={...subsState.busy};
    delete busy[key];
    publishSubs({busy});
  }
}

function setDefaultPrefs(prefs){
  const defaults=subsPrefs(prefs);
  // 先更新畫面，失敗時會重新載入伺服器狀態。
  publishSubs({defaults,games:subsState.games.map(game=>game.custom?game:{...game,prefs:{...defaults}})});
  return mutateSubscriptions('defaults',()=>registryRequest('/defaults',{method:'PUT',body:{prefs:defaults}}),'已更新預設提醒項目');
}

function setGamePrefs(gamePk,prefs){
  const pk=Number(gamePk);
  return mutateSubscriptions('game:'+pk,
    ()=>registryRequest('/games/'+pk+'/prefs',{method:'PUT',body:{prefs:prefs?subsPrefs(prefs):null}}),
    prefs?'已更新這場比賽的提醒項目':'這場比賽改回使用預設提醒項目');
}

function unsubscribeGame(gamePk){
  const pk=Number(gamePk);
  return mutateSubscriptions('game:'+pk,async()=>{
    const data=await registryRequest('/games/'+pk,{method:'DELETE'});
    setGameWatchedLocal(pk,false);
    gameWatchStatusCheckedAt.set(pk,Date.now());
    return data;
  },'已取消訂閱');
}

function followTeam(teamId){
  const id=Number(teamId);
  const name=teamZhName({id});
  return mutateSubscriptions('team:'+id,async()=>{
    const subscription=await ensurePushSubscription();
    return registryRequest('/teams',{method:'POST',body:{teamId:id,subscription}});
  },data=>{
    const added=Array.isArray(data?.added)?data.added.length:0;
    return added
      ?`已追蹤${name}，自動訂閱 ${added} 場比賽`
      :`已追蹤${name}；目前沒有即將進行的季後賽，有新賽程時會自動訂閱`;
  });
}

function unfollowTeam(teamId){
  const id=Number(teamId);
  return mutateSubscriptions('team:'+id,()=>registryRequest('/teams/'+id,{method:'DELETE'}),`已取消追蹤${teamZhName({id})}`);
}

async function openSubscribedGame(gamePk){
  const pk=Number(gamePk);
  if(!Number.isSafeInteger(pk)||pk<=0)return;
  // 與通知直達相同：依比賽 ID 載入，並換算成裝置當地日期。
  const url=new URL(location.href);
  url.searchParams.set('gamePk',String(pk));
  history.replaceState(null,'',url.toString());
  state.notificationGamePending=true;
  switchView('live');
  await loadInitialGame();
}

async function syncNotificationPage(){
  if(!els.notificationStatus||!els.testNotificationBtn)return;

  const supported=
    'serviceWorker' in navigator&&
    'PushManager' in window&&
    'Notification' in window;

  els.notificationPermission.textContent=notificationPermissionText();

  if(!supported){
    els.notificationStatus.textContent='❌ 此瀏覽器不支援 Web Push';
    els.notificationStatus.classList.add('error');
    els.testNotificationBtn.disabled=true;
    setNotificationMessage('請改用支援 Web Push 的瀏覽器或裝置。','error');
    return;
  }

  if(isIOSDevice()&&!isStandaloneApp()){
    els.notificationStatus.textContent='iPhone / iPad 需先加入主畫面';
    els.notificationStatus.classList.add('warn');
    els.testNotificationBtn.disabled=false;
    setNotificationMessage('請先從 Safari 將 MLB 戰況加入主畫面，再從主畫面開啟後測試。','warn');
    return;
  }

  els.notificationStatus.classList.remove('error','warn');
  els.notificationStatus.textContent='✅ 裝置支援 Web Push';
  els.testNotificationBtn.disabled=notificationTestBusy;

  try{
    const registration=await navigator.serviceWorker.getRegistration('./');
    const subscription=await registration?.pushManager?.getSubscription();
    els.notificationSubscription.textContent=subscription?'✅ 已建立 Push 訂閱':'尚未建立 Push 訂閱';
  }catch(_){
    els.notificationSubscription.textContent='尚未建立 Push 訂閱';
  }
}

async function testPushSubscription(){
  if(notificationTestBusy)return;

  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
    setNotificationMessage('這台裝置不支援 Web Push。','error');
    return;
  }

  if(isIOSDevice()&&!isStandaloneApp()){
    setNotificationMessage('iPhone / iPad 必須先「加入主畫面」，再從主畫面開啟這個 App 測試通知。','warn');
    return;
  }

  notificationTestBusy=true;
  els.testNotificationBtn.disabled=true;
  els.testNotificationBtn.classList.add('loading');
  clearNotificationCountdown();

  try{
    setNotificationMessage('正在確認通知權限…');

    let permission=Notification.permission;
    if(permission==='default'){
      permission=await Notification.requestPermission();
    }

    els.notificationPermission.textContent=notificationPermissionText();

    if(permission!=='granted'){
      throw new Error(permission==='denied'
        ?'通知權限已被封鎖，請到系統設定中允許通知。'
        :'沒有取得通知權限。');
    }

    setNotificationMessage('正在建立背景 Push 訂閱…');
    const registration=await getPushServiceWorker();

    const keyResponse=await fetch(PUSH_API+'/api/push/public-key',{cache:'no-store'});
    if(!keyResponse.ok)throw new Error('無法取得通知公開金鑰');
    const {publicKey}=await keyResponse.json();
    if(!publicKey)throw new Error('通知公開金鑰不存在');

    const subscription=await getOrCreatePushSubscription(registration,publicKey);
    els.notificationSubscription.textContent='✅ 已建立 Push 訂閱';

    setNotificationMessage('正在由 Cloudflare 發送第一則測試通知…');
    const response=await fetch(PUSH_API+'/api/push/test',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({subscription:subscription.toJSON()})
    });
    const result=await response.json().catch(()=>({}));

    if(!response.ok||!result.ok){
      throw new Error(result.message||result.error||'測試通知發送失敗');
    }

    const dueAt=Number(result.delayedScheduledAt)||Date.now()+30000;
    startNotificationCountdown(dueAt);
    els.notificationLastTest.textContent='✅ 測試已啟動';
  }catch(error){
    console.error('Push notification test failed',error);
    setNotificationMessage(error?.message||'測試通知失敗','error');
    els.notificationLastTest.textContent='❌ 測試失敗';
  }finally{
    notificationTestBusy=false;
    els.testNotificationBtn.classList.remove('loading');
    els.testNotificationBtn.disabled=false;
    syncNotificationPage();
  }
}

if(els.testNotificationBtn){
  on(els.testNotificationBtn,'click',testPushSubscription);
}


if(els.gameWatchBtn){
  on(els.gameWatchBtn,'click',toggleGameWatch);
}

