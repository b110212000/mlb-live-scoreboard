import {useEffect,useState} from 'react';
import {useScoreboard} from './store.js';
export function useVisiblePage(name){
  const {view}=useScoreboard(),[visible,setVisible]=useState(()=>!document.hidden);
  useEffect(()=>{const changed=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',changed);return ()=>document.removeEventListener('visibilitychange',changed)},[]);
  return view===name&&visible;
}
