import {useSyncExternalStore} from 'react';
const defaultPrefs={pregame5:true,start:true,homeScore:true,awayScore:true,final:true};
const initial={view:'live',games:[],selectedGamePk:null,score:null,highlights:[],highlightGamePk:null,error:'',emptyDate:null,
  subs:{status:'idle',error:'',notice:'',support:'default',defaults:defaultPrefs,teams:[],games:[],busy:{}}};
let snapshot=initial;
const listeners=new Set();
export const store={
  getSnapshot:()=>snapshot,
  subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener)},
  update(patch){snapshot={...snapshot,...patch};listeners.forEach(fn=>fn())},
};
export function useScoreboard(){return useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot)}
let engine=null;
export const actions={
  connect(value){engine=value},
  navigate(view){engine?.navigate(view)},
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
