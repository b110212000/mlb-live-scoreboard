import {useSyncExternalStore} from 'react';
import {applyLang,setLangPref,lang} from './i18n.js';
// 語言要在第一次畫面之前決定（React 與 engine 都用同一個 t()）。
applyLang();
const defaultPrefs={pregame5:true,start:true,homeScore:true,awayScore:true,final:true};
function cachedTeams(){try{const v=JSON.parse(localStorage.getItem('mlb-followed-teams')||'[]');return Array.isArray(v)?v.map(Number).filter(Boolean):[]}catch(_){return []}}
function urlPlayerId(){try{return Number(new URLSearchParams(location.search).get('playerId'))||null}catch(_){return null}}
const initial={view:'live',lang:lang(),playerId:urlPlayerId(),playerFrom:null,playerFromScroll:0,games:[],selectedGamePk:null,score:null,highlights:[],highlightGamePk:null,error:'',emptyDate:null,
  subs:{status:'idle',error:'',notice:'',noticeAt:0,support:'default',defaults:defaultPrefs,teams:cachedTeams(),games:[],busy:{}}};
let snapshot=initial;
const listeners=new Set();
export const store={
  getSnapshot:()=>snapshot,
  subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener)},
  update(patch){snapshot={...snapshot,...patch};listeners.forEach(fn=>fn())},
};
export function useScoreboard(){return useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot)}
let engine=null;
// 球員頁的網址參數（view=player&playerId=…）只在球員頁有效，離開時移除，重新整理才不會又回到球員頁。
function clearPlayerUrl(){
  try{
    const url=new URL(location.href);
    if(url.searchParams.get('view')!=='player'&&!url.searchParams.has('playerId'))return;
    url.searchParams.delete('view');url.searchParams.delete('playerId');
    history.replaceState(null,'',url.toString());
  }catch(_){}
}
// 回到進入球員頁之前的頁面與捲動位置。
function leavePlayer(){
  const {playerFrom,playerFromScroll}=snapshot;
  engine?.navigate(playerFrom&&playerFrom!=='player'?playerFrom:'hof');
  requestAnimationFrame(()=>window.scrollTo(0,playerFromScroll||0));
}
// 手機返回鍵 / 瀏覽器上一頁：球員頁有自己的歷程紀錄，返回時回到名人堂或旅外列表，而不是離開網站。
if(typeof window!=='undefined')window.addEventListener('popstate',event=>{
  const id=Number(event.state?.mlbPlayer)||null;
  if(id){store.update({playerId:id});engine?.navigate('player');requestAnimationFrame(()=>window.scrollTo(0,0));return;}
  if(snapshot.view==='player')leavePlayer();
});
export const actions={
  connect(value){engine=value},
  // 切換語言：React 畫面跟著 store 重畫，engine 畫的內容（比賽細節、季後賽、名單…）由 relocalize 重畫。
  setLang(pref){
    setLangPref(pref);
    store.update({lang:lang()});
    // 等 React 重畫完（固定元件的文字更新後）再讓 engine 重畫自己的內容，engine 設定的屬性才不會被蓋掉。
    requestAnimationFrame(()=>engine?.relocalize?.());
  },
  navigate(view){
    if(snapshot.view==='player'&&view!=='player')clearPlayerUrl();
    engine?.navigate(view);
  },
  // 開啟球員資料頁，記住從哪一頁、捲到哪裡進來，返回時回到原位。
  openPlayer(playerId){
    const id=Number(playerId);
    if(!id)return;
    const fromPlayer=snapshot.view==='player';
    store.update({playerId:id,playerFrom:fromPlayer?snapshot.playerFrom:snapshot.view,playerFromScroll:fromPlayer?snapshot.playerFromScroll:window.scrollY});
    try{
      const url=new URL(location.href);
      url.searchParams.set('view','player');url.searchParams.set('playerId',String(id));
      url.searchParams.delete('gamePk');url.searchParams.delete('gameDate');
      history.pushState({mlbPlayer:id},'',url.toString());
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
