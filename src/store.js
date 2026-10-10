import {useSyncExternalStore} from 'react';
const initial={view:'live',games:[],selectedGamePk:null,score:null,highlights:[],highlightGamePk:null,error:'',emptyDate:null};
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
};
