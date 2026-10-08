/* MLB Live Scoreboard - ui.js
   頁籤滑動、系列賽切換、功能選單、安裝分享與畫面切換。 */

const LIVE_DETAIL_TABS=['stats','status','series','recap'];
function liveDetailIndex(tab){
  const i=LIVE_DETAIL_TABS.indexOf(tab);
  return i<0?1:i;
}
function activeLiveDetailPanel(){
  return [els.liveDetailStats,els.liveDetailStatus,els.liveDetailSeries,els.liveDetailRecap][liveDetailIndex(state.liveDetailTab)];
}
function syncLiveDetailHeight(immediate=false){
  const panel=activeLiveDetailPanel();
  if(!panel||!els.liveDetailViewport)return;
  const h=Math.max(1,panel.scrollHeight);
  if(immediate){
    const old=els.liveDetailViewport.style.transition;
    els.liveDetailViewport.style.transition='none';
    els.liveDetailViewport.style.height=h+'px';
    void els.liveDetailViewport.offsetHeight;
    els.liveDetailViewport.style.transition=old;
  }else{
    els.liveDetailViewport.style.height=h+'px';
  }
}
function positionLiveDetailTrack(tab,animate=true){
  const index=liveDetailIndex(tab);
  els.liveDetailTrack.classList.toggle('dragging',!animate);
  els.liveDetailTrack.style.transform='translate3d('+(-index*100)+'%,0,0)';
}
function setLiveDetailTab(tab,options={}){
  if(!LIVE_DETAIL_TABS.includes(tab))tab='status';
  const animate=options.animate!==false;
  state.liveDetailTab=tab;
  els.liveDetailTabs.querySelectorAll('[data-live-tab]').forEach(btn=>{
    const active=btn.dataset.liveTab===tab;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-selected',String(active));
  });
  [els.liveDetailStats,els.liveDetailStatus,els.liveDetailSeries,els.liveDetailRecap].forEach((panel,index)=>{
    const active=index===liveDetailIndex(tab);
    panel.classList.toggle('active',active);
    panel.setAttribute('aria-hidden',String(!active));
  });
  positionLiveDetailTrack(tab,animate);
  requestAnimationFrame(()=>syncLiveDetailHeight(!animate));
  if(tab==='series')loadCurrentSeries();
  if(tab==='recap')loadGameRecap();
}

function initLiveDetailSwipe(){
  const viewport=els.liveDetailViewport,track=els.liveDetailTrack;
  let startX=0,startY=0,lastX=0,startTime=0,dragging=false,horizontal=false;
  const blockedTarget=t=>!!t.closest('.boxscore-scroll, .scroll, input, select, textarea');

  viewport.addEventListener('touchstart',e=>{
    if(e.touches.length!==1||blockedTarget(e.target))return;
    const t=e.touches[0];
    startX=lastX=t.clientX;startY=t.clientY;startTime=performance.now();
    dragging=true;horizontal=false;
  },{passive:true});

  viewport.addEventListener('touchmove',e=>{
    if(!dragging||e.touches.length!==1)return;
    const t=e.touches[0],dx=t.clientX-startX,dy=t.clientY-startY;
    lastX=t.clientX;
    if(!horizontal){
      if(Math.abs(dx)<7&&Math.abs(dy)<7)return;
      if(Math.abs(dy)>=Math.abs(dx)){dragging=false;return;}
      horizontal=true;
      track.classList.add('dragging');
    }
    e.preventDefault();
    const width=Math.max(1,viewport.clientWidth);
    const index=liveDetailIndex(state.liveDetailTab);
    let offset=dx;
    if((index===0&&dx>0)||(index===LIVE_DETAIL_TABS.length-1&&dx<0))offset*=0.28;
    track.style.transform='translate3d('+(-index*width+offset)+'px,0,0)';
  },{passive:false});

  const finish=()=>{
    if(!dragging&&!horizontal)return;
    const dx=lastX-startX;
    const dt=Math.max(1,performance.now()-startTime);
    const velocity=dx/dt;
    const width=Math.max(1,viewport.clientWidth);
    let index=liveDetailIndex(state.liveDetailTab);
    if(horizontal&&(Math.abs(dx)>Math.min(90,width*.20)||Math.abs(velocity)>.55)){
      if(dx<0)index=Math.min(LIVE_DETAIL_TABS.length-1,index+1);
      else index=Math.max(0,index-1);
    }
    dragging=false;horizontal=false;
    track.classList.remove('dragging');
    setLiveDetailTab(LIVE_DETAIL_TABS[index],{animate:true});
  };

  viewport.addEventListener('touchend',finish,{passive:true});
  viewport.addEventListener('touchcancel',finish,{passive:true});

  if('ResizeObserver' in window){
    const ro=new ResizeObserver(()=>syncLiveDetailHeight());
    [els.liveDetailStats,els.liveDetailStatus,els.liveDetailSeries,els.liveDetailRecap].forEach(p=>ro.observe(p));
  }else{
    window.addEventListener('resize',()=>syncLiveDetailHeight(true));
  }
  window.addEventListener('resize',()=>{
    positionLiveDetailTrack(state.liveDetailTab,false);
    syncLiveDetailHeight(true);
  });
}
async function openSeriesGame(gamePk){
  if(state.loading){
    setTimeout(()=>openSeriesGame(gamePk),150);
    return;
  }
  const game=state.currentSeriesGames.find(g=>Number(g.gamePk)===Number(gamePk));
  if(!game)return;
  const date=gameLocalDateKey(game);
  if(date)els.dateInput.value=date;
  state.selectedGamePk=Number(gamePk);
  await loadSchedule(true);
  setLiveDetailTab('status');
  requestAnimationFrame(()=>document.querySelector('.hero')?.scrollIntoView({behavior:'smooth',block:'start'}));
}

function setFeatureMenuOpen(open){
  els.featureMenu.hidden=!open;
  els.featureMenuButton.setAttribute('aria-expanded',String(open));
}

function isStandaloneApp(){
  return window.matchMedia?.('(display-mode: standalone)').matches===true||
    window.navigator.standalone===true;
}
function isIOSDevice(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent)||
    (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
}
function syncInstallPage(){
  if(isStandaloneApp()){
    els.installStatus.textContent='✅ 已從主畫面以 App 模式開啟';
    els.installAppBtn.disabled=true;
    els.installAppHint.textContent='這台裝置已安裝';
    return;
  }
  els.installAppBtn.disabled=false;
  if(deferredInstallPrompt){
    els.installStatus.textContent='✅ 此瀏覽器支援直接安裝';
    els.installAppHint.textContent='點一下開啟安裝視窗';
  }else if(isIOSDevice()){
    els.installStatus.textContent='iPhone / iPad：使用 Safari 加入主畫面';
    els.installAppHint.textContent='查看 iPhone 安裝步驟';
  }else{
    els.installStatus.textContent='可分享連結；安裝方式依瀏覽器而定';
    els.installAppHint.textContent='查看安裝方式';
  }
}
async function shareThisApp(){
  const url=new URL('./',location.href).href;
  const data={title:'MLB 戰況 App',text:'MLB 季後賽即時比分、對戰名單與球員數據',url};
  if(navigator.share){
    try{await navigator.share(data);return}catch(err){
      if(err?.name==='AbortError')return;
    }
  }
  try{
    await navigator.clipboard.writeText(url);
    els.copyAppHint.textContent='已複製，可貼給朋友';
    setTimeout(()=>els.copyAppHint.textContent='複製網站連結',1800);
  }catch(_){}
}
async function copyThisApp(){
  const url=new URL('./',location.href).href;
  try{
    await navigator.clipboard.writeText(url);
    els.copyAppHint.textContent='✓ 已複製';
    setTimeout(()=>els.copyAppHint.textContent='複製網站連結',1800);
  }catch(_){
    els.copyAppHint.textContent='請長按網址複製';
  }
}
function flashInstallGuide(){
  els.installGuide.classList.remove('flash');
  void els.installGuide.offsetWidth;
  els.installGuide.classList.add('flash');
  els.installGuide.scrollIntoView({behavior:'smooth',block:'center'});
}
async function installThisApp(){
  if(isStandaloneApp())return;
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    try{await deferredInstallPrompt.userChoice}catch(_){}
    deferredInstallPrompt=null;
    syncInstallPage();
    return;
  }
  flashInstallGuide();
}

function switchView(view){
  state.view=view;
  const bracket=view==='bracket',roster=view==='roster',install=view==='install',notifications=view==='notifications',live=view==='live';
  els.liveView.hidden=!live;
  els.bracketView.hidden=!bracket;
  els.rosterView.hidden=!roster;
  els.installView.hidden=!install;
  els.notificationView.hidden=!notifications;
  els.featureMenu.querySelectorAll('[data-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===view));

  if(bracket){
    els.appTitle.textContent='MLB 季後賽戰況';
    els.appSubtitle.textContent='外卡・分區系列賽・聯盟冠軍賽・世界大賽';
  }else if(roster){
    els.appTitle.textContent='MLB 對戰名單';
    els.appSubtitle.textContent='兩隊 Active roster・本場先發・例行賽打投數據';
  }else if(install){
    els.appTitle.textContent='安裝 / 分享 MLB 戰況';
    els.appSubtitle.textContent='加入主畫面・分享給朋友・App 使用教學';
    syncInstallPage();
  }else if(notifications){
    els.appTitle.textContent='MLB 訂閱通知';
    els.appSubtitle.textContent='Web Push・背景通知・通知能力測試';
    syncNotificationPage();
  }else{
    els.appTitle.textContent='MLB 季後賽即時戰況';
    els.appSubtitle.textContent='即時比分・打者 / 投手・用球數・B/S/O・壘包・球速球種・逐局與得分紀錄';
  }

  els.topControlsToggle.hidden=!live;
  els.liveTitleActions.hidden=!live;
  if(bracket){
    els.topControls.hidden=true;
    loadBracket();
  }else if(roster){
    els.topControls.hidden=true;
    loadMatchupRoster();
  }else if(install||notifications){
    els.topControls.hidden=true;
  }else{
    setTopControlsExpanded(state.topControlsExpanded);
  }
  setFeatureMenuOpen(false);
}

function setTopControlsExpanded(expanded){
  state.topControlsExpanded=expanded;
  els.topControls.hidden=!expanded;
  els.topControlsToggle.setAttribute('aria-expanded',String(expanded));
  els.topControlsToggle.setAttribute('aria-label',expanded?'收合日期與更新':'展開日期與更新');
}

