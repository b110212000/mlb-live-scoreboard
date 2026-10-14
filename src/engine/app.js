/* MLB Live Scoreboard - app.js
   事件綁定、初始化、更新排程與版本檢查。
   功能邏輯分散於 api.js / live.js / postseason.js / roster.js / ui.js。 */

function currentAppVersion(){
  return (document.querySelector('.app-version')?.textContent||'v0.0.0')
    .trim()
    .replace(/^v/i,'');
}

async function disableLegacyPwaCache(){
  // Push 需要保留 Service Worker。舊 Cache 每個版本只清一次，
  // 避免每次開啟 App 都重複掃描 / 刪除 Cache Storage。
  const version=currentAppVersion();
  try{
    if(localStorage.getItem('mlb-cache-cleaned-version')===version)return false;
    if('caches' in window){
      const keys=await caches.keys();
      await Promise.all(keys.map(key=>caches.delete(key)));
    }
    localStorage.setItem('mlb-cache-cleaned-version',version);
  }catch(_){}
  return false;
}

function checkForAppUpdate(){return callbacks.checkAppUpdate?.()}

// PWA / 安裝事件
on(window,'beforeinstallprompt',e=>{
  e.preventDefault();
  deferredInstallPrompt=e;
  syncInstallPage();
});
on(window,'appinstalled',()=>{
  deferredInstallPrompt=null;
  syncInstallPage();
});
on(els.installAppBtn,'click',installThisApp);
on(els.shareAppBtn,'click',shareThisApp);
on(els.copyAppBtn,'click',copyThisApp);

on(els.recapList,'click',openRecapVideo);
on(els.recapList,'toggle',()=>syncLiveDetailHeight(),true);

on(els.rosterBackBtn,'click',()=>switchView('live'));
on(els.liveDetailTabs,'click',e=>{
  const btn=e.target.closest('[data-live-tab]');
  if(btn)setLiveDetailTab(btn.dataset.liveTab);
});
on(els.currentSeriesGames,'click',e=>{
  const btn=e.target.closest('[data-series-game-pk]');
  if(btn)openSeriesGame(Number(btn.dataset.seriesGamePk));
});

on(els.topControlsToggle,'click',()=>{
  setTopControlsExpanded(els.topControlsToggle.getAttribute('aria-expanded')!=='true');
});

document.querySelectorAll('[data-collapse-section]').forEach(section=>{
  const head=section.querySelector('[data-collapse-head]');
  const body=section.querySelector('[data-collapse-body]');
  const btn=section.querySelector('.collapse-toggle');
  if(!head||!body||!btn)return;
  const setExpanded=expanded=>{
    body.hidden=!expanded;
    btn.setAttribute('aria-expanded',String(expanded));
    const title=head.querySelector('h2')?.textContent?.trim()||t('區塊');
    btn.setAttribute('aria-label',expanded?t('收合{title}',{title}):t('展開{title}',{title}));
  };
  const toggle=()=>setExpanded(btn.getAttribute('aria-expanded')!=='true');
  on(btn,'click',e=>{e.stopPropagation();toggle();});
  on(head,'click',e=>{if(e.target.closest('button'))return;toggle();});
});

// iPhone Web App：在頁面頂端往下拉，放開後重新載入整個頁面。
(() => {
  const THRESHOLD=72, MAX_PULL=116;
  let startY=null,startX=null,distance=0,tracking=false;

  const reset=()=>{
    startY=startX=null;distance=0;tracking=false;
    els.pullRefresh.classList.remove('visible','refreshing');
    els.pullRefresh.style.transform='translate(-50%,-58px)';
    els.pullRefreshText.textContent=t('下拉重新整理');
    els.pullRefresh.querySelector('.pull-refresh-icon').textContent='↓';
  };

  on(document,'touchstart',e=>{
    tracking=false;startY=startX=null;
    if(els.featureMenu.open||window.scrollY>1||e.touches.length!==1||e.target.closest('a, button, summary, input, select, textarea'))return;
    const t=e.touches[0];
    startY=t.clientY;startX=t.clientX;distance=0;tracking=true;
  },{passive:true});

  on(document,'touchmove',e=>{
    if(!tracking||startY==null||e.touches.length!==1)return;
    const touch=e.touches[0],dy=touch.clientY-startY,dx=touch.clientX-startX;
    if(dy<=0){reset();return;}
    if(Math.abs(dx)>Math.abs(dy)*.8){reset();return;}
    if(window.scrollY>1){reset();return;}

    if(dy<10)return; // A small finger movement is still a tap.
    e.preventDefault();
    distance=Math.min(MAX_PULL,dy*.58);
    const y=-58+distance;
    els.pullRefresh.style.transform='translate(-50%,'+y+'px)';
    els.pullRefresh.classList.add('visible');
    const ready=distance>=THRESHOLD;
    els.pullRefreshText.textContent=ready?t('放開重新整理'):t('下拉重新整理');
    els.pullRefresh.querySelector('.pull-refresh-icon').textContent=ready?'↻':'↓';
  },{passive:false});

  const finish=()=>{
    if(!tracking)return;
    const shouldRefresh=distance>=THRESHOLD;
    tracking=false;
    if(!shouldRefresh){reset();return;}

    els.pullRefresh.classList.add('visible','refreshing');
    els.pullRefresh.style.transform='translate(-50%,10px)';
    els.pullRefreshText.textContent=t('重新整理中…');
    els.pullRefresh.querySelector('.pull-refresh-icon').textContent='↻';

    setTimeout(()=>{
      const u=new URL(location.href);
      u.searchParams.set('_pull',Date.now());
      location.replace(u.toString());
    },140);
  };

  on(document,'touchend',finish,{passive:true});
  on(document,'touchcancel',reset,{passive:true});
})();

on(els.refreshBtn,'click',()=>state.notificationGamePending?loadInitialGame():loadSchedule(true));
on(els.dateInput,'change',()=>{clearNotificationRoute();loadSchedule(false);if(state.view==='bracket')loadBracket(true)});
let updateReturn=null;
try{
  const saved=JSON.parse(sessionStorage.getItem('mlb-update-return')||'null');
  sessionStorage.removeItem('mlb-update-return');
  if(saved&&Date.now()-saved.at<120000&&new URL(location.href).searchParams.has('_v'))updateReturn=saved;
}catch(_){}
els.dateInput.value=updateReturn?.date||localDateString();
if(updateReturn?.gamePk)state.selectedGamePk=Number(updateReturn.gamePk);

// 賽事資料是核心功能：先啟動資料載入，再初始化其他非必要 UI。
// 這樣即使某個附加 UI 發生錯誤，也不會讓整個即時比分停在「尚未更新」。
(updateReturn?loadSchedule(true):loadInitialGame()).then(()=>{
  if(!updateReturn)return;
  setLiveDetailTab(updateReturn.tab,{animate:false});
  switchView(updateReturn.view);
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,updateReturn.scroll||0)));
}).catch(err=>{
  console.error('Initial schedule load failed',err);
  showError(t('初始賽事資料載入失敗：{error}',{error:err?.message||String(err)}));
});

try{
  const requestedView=new URL(location.href).searchParams.get('view');
  const initialView=new URL(location.href).searchParams.has('gamePk')?'live':
    (['live','bracket','standings','taiwan','hof','player','teams','roster','install','notifications','notificationTest','settings','language','feedback','updates'].includes(requestedView)?requestedView:'live');
  switchView(initialView);
  // 即時比賽頁要標示追蹤的球隊：先發布本機快取，再向伺服器更新（訂閱相關頁面會自行載入）。
  publishSubs();
  if(!['notifications','teams'].includes(initialView))loadSubscriptions();
  initLiveDetailSwipe();
  setLiveDetailTab('status',{animate:false});
}catch(err){
  console.error('Optional UI initialization failed',err);
  showError(t('部分介面初始化失敗，但賽事資料仍會繼續載入：{error}',{error:err?.message||String(err)}));
}

setInterval(()=>{if(state.view==='live'){
  if(state.notificationGamePending)loadInitialGame();
  else loadSchedule(true);
}},REFRESH_MS);
setInterval(()=>{if(state.view==='bracket')loadBracket(true)},60000);
setInterval(()=>{if(state.view==='roster')loadMatchupRoster(true)},60000);
setInterval(()=>{if(state.view==='live'&&state.liveDetailTab==='series')loadCurrentSeries(true)},60000);

// 前景版本檢查
on(window,'load',async()=>{
  const reloading=await disableLegacyPwaCache();
  if(!reloading)checkForAppUpdate();
});
on(document,'visibilitychange',()=>{
  if(document.hidden)return;
  checkForAppUpdate();
  // 回到 App 時更新訂閱清單（追蹤球隊可能已自動加入新場次）。
  if(state.view==='notifications'||state.view==='teams')loadSubscriptions();
});
on(window,'focus',checkForAppUpdate);
setInterval(()=>{if(!document.hidden)checkForAppUpdate()},60000);


// 保持 Push-only Service Worker 最新；無需重新訂閱或重新詢問權限。
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'})
    .then(registration=>registration.update())
    .catch(error=>console.warn('Push worker update failed',error));
}

// 切換語言後重畫 engine 負責的內容（由 store 的 setLang 在 React 重畫完之後呼叫）。
function relocalizeEngine(){
  renderTabs();
  if(state.currentFeed&&state.currentFeedGamePk===state.selectedGamePk){
    renderGame(state.currentFeed);
    markUpdated(true,state.currentFeed.gameData?.status?.abstractGameState==='Live');
  }else if(!state.selectedGamePk&&!state.loading&&els.dateInput.value)renderNoGame(els.dateInput.value);
  if(state.view==='bracket')loadBracket(true);
  if(state.view==='roster')loadMatchupRoster(true);
  syncInstallPage();
  if(state.view==='notificationTest')syncNotificationPage();
  els.topControlsToggle.setAttribute('aria-label',state.topControlsExpanded?t('收合日期與更新'):t('展開日期與更新'));
  document.querySelectorAll('[data-collapse-section]').forEach(section=>{
    const btn=section.querySelector('.collapse-toggle');
    if(!btn)return;
    const title=section.querySelector('[data-collapse-head] h2')?.textContent?.trim()||t('區塊');
    btn.setAttribute('aria-label',btn.getAttribute('aria-expanded')==='true'?t('收合{title}',{title}):t('展開{title}',{title}));
  });
  // 訂閱清單的時間、狀態、隊名重新產生；推播通知的語言也一起更新到 Worker。
  loadSubscriptions();
}
