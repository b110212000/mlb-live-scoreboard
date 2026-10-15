import {useEffect,useRef,useState} from 'react';
import {statInfo} from '../statGlossary.js';
import {useScoreboard} from '../store.js';
import {t} from '../i18n.js';

export function StatLabel({id,children}){
  if(!statInfo(id))return children;
  return <button type="button" className="stat-help-trigger" data-stat-help={id} aria-label={t('查看 {stat} 說明',{stat:children})}>{children}</button>;
}
export function StatHelpDialog(){
  useScoreboard();
  const [id,setId]=useState(null),dialog=useRef(null),opener=useRef(null);
  const info=statInfo(id);
  const close=()=>{
    dialog.current?.close();setId(null);
    const target=opener.current;
    if(target?.isConnected)target.focus({preventScroll:true});
    else [...document.querySelectorAll('[data-stat-help]')].find(el=>el.dataset.statHelp===id&&el.getClientRects().length)?.focus({preventScroll:true});
  };
  useEffect(()=>{
    const open=event=>{
      const target=event.target.closest?.('[data-stat-help]');
      if(!target||!statInfo(target.dataset.statHelp))return;
      event.preventDefault();event.stopPropagation();opener.current=target;setId(target.dataset.statHelp);
    };
    document.addEventListener('click',open,true);
    return ()=>document.removeEventListener('click',open,true);
  },[]);
  useEffect(()=>{if(info&&!dialog.current.open)dialog.current.showModal()},[id]);
  return <dialog ref={dialog} className="stat-help-dialog" aria-labelledby="statHelpTitle" aria-describedby="statHelpText" onCancel={event=>{event.preventDefault();close()}} onClick={event=>{if(event.target!==event.currentTarget)return;const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close()}}>
    {info&&<><h3 id="statHelpTitle">{info.abbr} · {info.title}</h3><p id="statHelpText">{info.description}</p><footer><a href={info.url} target="_blank" rel="noopener noreferrer">{t('MLB 官方說明')}</a><button type="button" autoFocus onClick={close}>{t('關閉說明')}</button></footer></>}
  </dialog>;
}
