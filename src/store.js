import {useSyncExternalStore} from 'react';
import {teamById} from './teams.js';
import {applyLang,setLangPref,lang} from './i18n.js';
// 語言要在第一次畫面之前決定（React 與 engine 都用同一個 t()）。
applyLang();
const defaultPrefs={pregame5:true,start:true,homeScore:true,awayScore:true,final:true};
function cachedTeams(){try{const v=JSON.parse(localStorage.getItem('mlb-followed-teams')||'[]');return Array.isArray(v)?v.map(Number).filter(Boolean):[]}catch(_){return []}}
function urlPlayerId(){try{return Number(new URLSearchParams(location.search).get('playerId'))||null}catch(_){return null}}
function activeUrl(){
  const q=new URLSearchParams(location.search);
  return {activeTab:['pitching','teams','hitting'].includes(q.get('playersTab'))?q.get('playersTab'):'teams',activeLeague:['AL','NL','MLB'].includes(q.get('league'))?q.get('league'):'MLB',activeTeamId:teamById(q.get('teamId'))?.id||null};
}
const initial={...activeUrl(),view:'live',lang:lang(),playerId:urlPlayerId(),playerFrom:new URLSearchParams(location.search).get('playerFrom')==='activePlayers'?'activePlayers':null,playerFromScroll:0,games:[],selectedGamePk:null,score:null,highlights:[],highlightGamePk:null,error:'',emptyDate:null,
  subs:{status:'idle',error:'',notice:'',noticeAt:0,support:'default',defaults:defaultPrefs,teams:cachedTeams(),games:[],busy:{}}};
let snapshot=initial;
const listeners=new Set();
export const store={
  getSnapshot:()=>snapshot,
  subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener)},
  update(patch){snapshot={...snapshot,...patch};listeners.forEach(fn=>fn())},
};
export function useScoreboard(){return useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot)}
let engine=null,returnPoint=null;
// 球員頁的網址參數（view=player&playerId=…）只在球員頁有效，離開時移除，重新整理才不會又回到球員頁。
function clearPlayerUrl(){
  try{
    const url=new URL(location.href);
    if(url.searchParams.get('view')!=='player'&&!url.searchParams.has('playerId'))return;
    url.searchParams.delete('view');url.searchParams.delete('playerId');url.searchParams.delete('playerFrom');
    history.replaceState(null,'',url.toString());
  }catch(_){}
}
// 回到進入球員頁之前的頁面與捲動位置。
function leavePlayer(){
  const {playerFrom,playerFromScroll}=snapshot;
  if(playerFrom==='activePlayers')activeRoute();
  engine?.navigate(playerFrom&&playerFrom!=='player'?playerFrom:'hof');
  requestAnimationFrame(()=>window.scrollTo(0,playerFromScroll||0));
}
// Active-player routes own their team and filter context, including after reload/back/forward.
function activeRoute(patch={},push=false,teamEntry=false){
  store.update(patch);
  const url=new URL(location.href);
  url.searchParams.set('view','activePlayers');
  url.searchParams.set('playersTab',snapshot.activeTab);
  url.searchParams.set('league',snapshot.activeLeague);
  if(snapshot.activeTeamId)url.searchParams.set('teamId',snapshot.activeTeamId);else url.searchParams.delete('teamId');
  for(const key of ['playerId','playerFrom','gamePk','gameDate'])url.searchParams.delete(key);
  const state={mlbActive:true,activeTeamEntry:teamEntry,scroll:window.scrollY};
  history[push?'pushState':'replaceState'](state,'',url.toString());
}
if(typeof window!=='undefined')window.addEventListener('popstate',event=>{
  const q=new URLSearchParams(location.search),id=Number(q.get('playerId'))||null;
  if(q.get('view')==='player'&&id){
    store.update({...activeUrl(),playerId:id,playerFrom:event.state?.playerFrom||q.get('playerFrom')||snapshot.playerFrom});
    engine?.navigate('player');requestAnimationFrame(()=>window.scrollTo(0,0));return;
  }
  if(q.get('view')==='activePlayers'||event.state?.mlbActive){
    store.update(activeUrl());engine?.navigate('activePlayers');
    requestAnimationFrame(()=>window.scrollTo(0,event.state?.scroll||0));return;
  }
  if(snapshot.view==='player')leavePlayer();
});
export const actions={
  notify(text,error=false){store.update({toast:{id:Date.now(),text,type:error?'error':'success'}})},
  connect(value){engine=value},
  // 切換語言：React 畫面跟著 store 重畫，engine 畫的內容（比賽細節、季後賽、名單…）由 relocalize 重畫。
  setLang(pref){
    setLangPref(pref);
    store.update({lang:lang()});
    // 等 React 重畫完（固定元件的文字更新後）再讓 engine 重畫自己的內容，engine 設定的屬性才不會被蓋掉。
    requestAnimationFrame(()=>engine?.relocalize?.());
  },
  updateReturnPoint(){return returnPoint||engine?.captureView?.()||{}},
  navigate(view){
    if(view==='updates'&&snapshot.view!=='updates')returnPoint={...engine?.captureView?.(),playerId:snapshot.playerId,playerFrom:snapshot.playerFrom,...Object.fromEntries(['activeTab','activeLeague','activeTeamId'].map(k=>[k,snapshot[k]]))};
    if(snapshot.view==='player'&&view!=='player')clearPlayerUrl();
    if(view==='activePlayers')activeRoute();
    else if(view!=='player'){
      const url=new URL(location.href);
      for(const key of ['playersTab','league','teamId','playerFrom'])url.searchParams.delete(key);
      if(url.searchParams.get('view')==='activePlayers')url.searchParams.delete('view');
      history.replaceState(null,'',url.toString());
    }
    engine?.navigate(view);
  },
  pickActiveTab(activeTab){
    if(!['pitching','teams','hitting'].includes(activeTab))return;
    activeRoute({activeTab,activeTeamId:null});
  },
  pickActiveLeague(activeLeague){
    if(['AL','NL','MLB'].includes(activeLeague))activeRoute({activeLeague});
  },
  openActiveTeam(teamId){
    if(!teamById(teamId))return;
    activeRoute();
    activeRoute({activeTab:'teams',activeTeamId:Number(teamId)},true,true);
    requestAnimationFrame(()=>window.scrollTo(0,0));
  },
  closeActiveTeam(){
    if(history.state?.activeTeamEntry){history.back();return;}
    activeRoute({activeTeamId:null,activeTab:'teams'});
    requestAnimationFrame(()=>window.scrollTo(0,0));
  },
  // 開啟球員資料頁，記住從哪一頁、捲到哪裡進來，返回時回到原位。
  openPlayer(playerId){
    const id=Number(playerId);
    if(!id)return;
    const fromPlayer=snapshot.view==='player';
    if(snapshot.view==='activePlayers')activeRoute({},false,!!history.state?.activeTeamEntry);
    store.update({playerId:id,playerFrom:fromPlayer?snapshot.playerFrom:snapshot.view,playerFromScroll:fromPlayer?snapshot.playerFromScroll:window.scrollY});
    try{
      const url=new URL(location.href);
      url.searchParams.set('view','player');url.searchParams.set('playerId',String(id));
      url.searchParams.delete('gamePk');url.searchParams.delete('gameDate');
      if(snapshot.playerFrom==='activePlayers')url.searchParams.set('playerFrom','activePlayers');
      history.pushState({mlbPlayer:id,playerFrom:snapshot.playerFrom},'',url.toString());
    }catch(_){}
    engine?.navigate('player');
    requestAnimationFrame(()=>window.scrollTo(0,0));
  },
  closePlayer(){
    // 從列表點進來的：用上一頁（popstate 會處理返回），網址與歷程一起還原。
    if(history.state?.mlbPlayer){history.back();return;}
    clearPlayerUrl();
    leavePlayer();
  },
  selectGame(gamePk){engine?.selectGame(gamePk)},
  subs:{
    refresh:()=>engine?.subscriptions.refresh(),
    setDefaultPrefs:prefs=>engine?.subscriptions.setDefaultPrefs(prefs),
    setGamePrefs:(gamePk,prefs)=>engine?.subscriptions.setGamePrefs(gamePk,prefs),
    unsubscribeGame:gamePk=>engine?.subscriptions.unsubscribeGame(gamePk),
    followTeam:teamId=>engine?.subscriptions.followTeam(teamId),
    unfollowTeam:teamId=>engine?.subscriptions.unfollowTeam(teamId),
    openGame:gamePk=>engine?.subscriptions.openGame(gamePk),
  },
};
