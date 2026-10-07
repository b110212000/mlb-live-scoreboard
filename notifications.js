/* MLB Live Scoreboard - notifications.js
   Web Push 訂閱測試：立即通知 + 30 秒背景通知。 */

const PUSH_API='https://mlb-score-notify.b110212000.workers.dev';
let notificationTestBusy=false;
let notificationCountdownTimer=null;
let gameWatchBusy=false;
const GAME_WATCH_STORAGE='mlb-watched-games-v1';
const GAME_WATCH_DEVICE_ID='mlb-push-device-id';
const gameWatchStatusCheckedAt=new Map();
const gameWatchRevision=new Map();
const gameWatchFinal=new Set();

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
    const deviceId=getGameWatchDeviceId();

    if(currentlyWatched){
      let endpoint='';
      try{
        const registration=await navigator.serviceWorker?.getRegistration?.('./');
        const subscription=await registration?.pushManager?.getSubscription();
        endpoint=subscription?.endpoint||'';
      }catch(_){}

      const response=await fetch(PUSH_API+'/api/watch',{
        method:'DELETE',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({gamePk,deviceId,endpoint})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok){
        throw new Error(result.message||result.error||'取消比賽通知失敗');
      }

      setGameWatchedLocal(gamePk,false);
      gameWatchStatusCheckedAt.set(gamePk,Date.now());
      showError('');
      return;
    }

    const supported=
      'serviceWorker' in navigator&&
      'PushManager' in window&&
      'Notification' in window;

    if(!supported){
      throw new Error('這個瀏覽器不支援 Web Push 通知');
    }

    if(isIOSDevice()&&!isStandaloneApp()){
      throw new Error('iPhone / iPad 需先將網站加入主畫面，才能訂閱比賽通知');
    }

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
    const response=await fetch(PUSH_API+'/api/watch',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        gamePk,
        deviceId,
        subscription:subscription.toJSON()
      })
    });
    const result=await response.json().catch(()=>({}));

    if(response.status===409&&result.error==='GAME_FINAL'){
      setGameWatchedLocal(gamePk,false);
      gameWatchFinal.add(gamePk);
      if(Number(btn.dataset.gamePk)===gamePk)btn.hidden=true;
      return;
    }

    if(!response.ok||!result.ok){
      throw new Error(result.message||result.error||'訂閱比賽通知失敗');
    }

    setGameWatchedLocal(gamePk,true);
    gameWatchStatusCheckedAt.set(gamePk,Date.now());
    showError('');
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
  els.testNotificationBtn.addEventListener('click',testPushSubscription);
}


if(els.gameWatchBtn){
  els.gameWatchBtn.addEventListener('click',toggleGameWatch);
}

