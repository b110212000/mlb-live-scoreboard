import {useEffect,useState} from 'react';
import {useScoreboard} from '../store.js';

// 操作結果浮在畫面上方：成功 2 秒、錯誤 4 秒後消失，不推擠頁面版面。
const SUCCESS_MS=2000,ERROR_MS=4000;

export function Toast(){
  const {subs,toast:notice}=useScoreboard();
  const active=notice?.id>(subs.noticeAt||0)?notice:{id:subs.noticeAt,text:subs.error||subs.notice,type:subs.error?'error':'success'};
  const [toast,setToast]=useState(null);
  useEffect(()=>{
    if(!active.id||!active.text)return;
    const next=active;
    setToast(next);
    const timer=setTimeout(()=>setToast(current=>current?.id===next.id?null:current),next.type==='error'?ERROR_MS:SUCCESS_MS);
    return ()=>clearTimeout(timer);
  },[active.id]);
  return <div id="toast" className="toast-region" aria-live="polite">
    {toast&&<div key={toast.id} className={'toast '+toast.type} role={toast.type==='error'?'alert':'status'} style={{'--toast-ms':(toast.type==='error'?ERROR_MS:SUCCESS_MS)+'ms'}}>{toast.text}</div>}
  </div>;
}
