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

async function fetchRemoteVersion(){
  const u=new URL('./version.json',location.href);
  u.searchParams.set('_check',Date.now());
  const r=await fetch(u.toString(),{cache:'no-store'});
  if(!r.ok)throw new Error('version check failed');
  const data=await r.json();
  return String(data?.version||'').trim().replace(/^v/i,'');
}

async function deployedIndexHasVersion(version){
  // GitHub Pages / CDN 可能短暫先更新 version.json。
  // 只有確認新版 index.html 也已經部署，才真正 reload，避免反覆刷新舊頁。
  const u=new URL('./index.html',location.href);
  u.searchParams.set('_ready',version+'-'+Date.now());
  const r=await fetch(u.toString(),{cache:'no-store'});
  if(!r.ok)return false;
  const html=await r.text();
  return html.includes('<span class="app-version">v'+version+'</span>');
}

let versionCheckInFlight=false;
async function checkForAppUpdate(){
  if(versionCheckInFlight)return;
  versionCheckInFlight=true;
  try{
    const current=currentAppVersion();
    const remote=await fetchRemoteVersion();
    if(!remote||remote===current)return;
    if(!await deployedIndexHasVersion(remote))return;

    const u=new URL(location.href);
    u.searchParams.set('_v',remote);
    location.replace(u.toString());
  }catch(_){
    // 版本檢查失敗不影響即時比分與其他主要功能。
  }finally{
    versionCheckInFlight=false;
  }
}

// PWA / 安裝事件
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  deferredInstallPrompt=e;
  syncInstallPage();
});
window.addEventListener('appinstalled',()=>{
  deferredInstallPrompt=null;
  syncInstallPage();
});
els.installAppBtn.addEventListener('click',installThisApp);
els.shareAppBtn.addEventListener('click',shareThisApp);
els.copyAppBtn.addEventListener('click',copyThisApp);

// 畫面事件、Pull-to-refresh 與初始載入
els.featureMenuButton.addEventListener('click',e=>{
  e.stopPropagation();
  setFeatureMenuOpen(els.featureMenu.hidden);
});
els.featureMenu.addEventListener('click',e=>{
  const btn=e.target.closest('[data-view]');
  if(btn)switchView(btn.dataset.view);
});
document.addEventListener('click',e=>{
  if(!els.featureMenu.contains(e.target)&&!els.featureMenuButton.contains(e.target))setFeatureMenuOpen(false);
});

els.heroRosterBtn.addEventListener('click',()=>switchView('roster'));
els.rosterBackBtn.addEventListener('click',()=>switchView('live'));
els.liveDetailTabs.addEventListener('click',e=>{
  const btn=e.target.closest('[data-live-tab]');
  if(btn)setLiveDetailTab(btn.dataset.liveTab);
});
els.currentSeriesGames.addEventListener('click',e=>{
  const btn=e.target.closest('[data-series-game-pk]');
  if(btn)openSeriesGame(Number(btn.dataset.seriesGamePk));
});

els.topControlsToggle.addEventListener('click',()=>{
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
    const title=head.querySelector('h2')?.textContent?.trim()||'區塊';
    btn.setAttribute('aria-label',(expanded?'收合':'展開')+title);
  };
  const toggle=()=>setExpanded(btn.getAttribute('aria-expanded')!=='true');
  btn.addEventListener('click',e=>{e.stopPropagation();toggle();});
  head.addEventListener('click',e=>{if(e.target.closest('button'))return;toggle();});
});

els.highlightsToggle.addEventListener('click',()=>{
  state.highlightsExpanded=!state.highlightsExpanded;
  syncHighlights();
});
setInterval(advanceHighlights,5000);


// iPhone Web App：在頁面頂端往下拉，放開後重新載入整個頁面。
(() => {
  const THRESHOLD=72, MAX_PULL=116;
  let startY=null,startX=null,distance=0,tracking=false;

  const reset=()=>{
    startY=startX=null;distance=0;tracking=false;
    els.pullRefresh.classList.remove('visible','refreshing');
    els.pullRefresh.style.transform='translate(-50%,-58px)';
    els.pullRefreshText.textContent='下拉重新整理';
    els.pullRefresh.querySelector('.pull-refresh-icon').textContent='↓';
  };

  document.addEventListener('touchstart',e=>{
    if(window.scrollY>1||e.touches.length!==1)return;
    const t=e.touches[0];
    startY=t.clientY;startX=t.clientX;distance=0;tracking=true;
  },{passive:true});

  document.addEventListener('touchmove',e=>{
    if(!tracking||startY==null||e.touches.length!==1)return;
    const t=e.touches[0],dy=t.clientY-startY,dx=t.clientX-startX;
    if(dy<=0){reset();return;}
    if(Math.abs(dx)>Math.abs(dy)*.8){reset();return;}
    if(window.scrollY>1){reset();return;}

    e.preventDefault();
    distance=Math.min(MAX_PULL,dy*.58);
    const y=-58+distance;
    els.pullRefresh.style.transform='translate(-50%,'+y+'px)';
    els.pullRefresh.classList.add('visible');
    const ready=distance>=THRESHOLD;
    els.pullRefreshText.textContent=ready?'放開重新整理':'下拉重新整理';
    els.pullRefresh.querySelector('.pull-refresh-icon').textContent=ready?'↻':'↓';
  },{passive:false});

  const finish=()=>{
    if(!tracking)return;
    const shouldRefresh=distance>=THRESHOLD;
    tracking=false;
    if(!shouldRefresh){reset();return;}

    els.pullRefresh.classList.add('visible','refreshing');
    els.pullRefresh.style.transform='translate(-50%,10px)';
    els.pullRefreshText.textContent='重新整理中…';
    els.pullRefresh.querySelector('.pull-refresh-icon').textContent='↻';

    setTimeout(()=>{
      const u=new URL(location.href);
      u.searchParams.set('_pull',Date.now());
      location.replace(u.toString());
    },140);
  };

  document.addEventListener('touchend',finish,{passive:true});
  document.addEventListener('touchcancel',reset,{passive:true});
})();

els.refreshBtn.addEventListener('click',()=>state.notificationGamePending?loadInitialGame():loadSchedule(true));
els.dateInput.addEventListener('change',()=>{clearNotificationRoute();loadSchedule(false);if(state.view==='bracket')loadBracket(true)});
els.dateInput.value=localDateString();

// 賽事資料是核心功能：先啟動資料載入，再初始化其他非必要 UI。
// 這樣即使某個附加 UI 發生錯誤，也不會讓整個即時比分停在「尚未更新」。
loadInitialGame().catch(err=>{
  console.error('Initial schedule load failed',err);
  showError('初始賽事資料載入失敗：'+(err?.message||String(err)));
});

try{
  const requestedView=new URL(location.href).searchParams.get('view');
  const initialView=new URL(location.href).searchParams.has('gamePk')?'live':
    (['live','bracket','roster','install','notifications'].includes(requestedView)?requestedView:'live');
  switchView(initialView);
  initLiveDetailSwipe();
  setLiveDetailTab('status',{animate:false});
}catch(err){
  console.error('Optional UI initialization failed',err);
  showError('部分介面初始化失敗，但賽事資料仍會繼續載入：'+(err?.message||String(err)));
}

setInterval(()=>{if(state.view==='live'){
  if(state.notificationGamePending)loadInitialGame();
  else loadSchedule(true);
}},REFRESH_MS);
setInterval(()=>{if(state.view==='bracket')loadBracket(true)},60000);
setInterval(()=>{if(state.view==='roster')loadMatchupRoster(true)},60000);
setInterval(()=>{if(state.view==='live'&&state.liveDetailTab==='series')loadCurrentSeries(true)},60000);

// 前景版本檢查
window.addEventListener('load',async()=>{
  const reloading=await disableLegacyPwaCache();
  if(!reloading)checkForAppUpdate();
});
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)checkForAppUpdate();
});
window.addEventListener('focus',checkForAppUpdate);
setInterval(checkForAppUpdate,15000);


// 保持 Push-only Service Worker 最新；無需重新訂閱或重新詢問權限。
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'})
    .then(registration=>registration.update())
    .catch(error=>console.warn('Push worker update failed',error));
}
