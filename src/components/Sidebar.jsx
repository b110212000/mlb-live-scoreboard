import {useEffect,useRef,useState} from 'react';
import {Icon} from './Icon.jsx';
import {t} from '../i18n.js';
// 標籤用函式，畫面重畫時才翻譯（跟著目前語言）。
const links=[['live',()=>t('即時比賽')],['multi',()=>t('多場同看')],['bracket',()=>t('季後賽戰況')],['standings',()=>t('戰績排行')],['taiwan',()=>t('台灣旅外')],['hof',()=>t('名人堂')],['teams',()=>t('追蹤球隊')],['notifications',()=>t('訂閱管理')]];
const settingsLinks=[['settings',()=>t('外觀')],['language',()=>t('語言 / Language')],['notificationTest',()=>t('訂閱測試')],['install',()=>t('安裝 / 分享 App')],['feedback',()=>t('意見回饋')],['updates',()=>t('版本更新')]];
// 選單項目的圖示（預設與頁面同名）；「外觀」用太陽 / 月亮，與「設定」的齒輪區分。
const ICONS={settings:'theme',language:'language',updates:'install'};
export function Sidebar({open,view,onClose,onNavigate,updateAvailable}){
  const ref=useRef(null);
  const [section,setSection]=useState('main');
  useEffect(()=>{if(open)setSection(['install','notificationTest','settings','language','feedback','updates'].includes(view)?'settings':'main')},[open]);
  useEffect(()=>{if(ref.current?.open)ref.current.querySelector(section==='settings'?'[data-menu-back]':'[data-menu-settings]')?.focus()},[section]);
  useEffect(()=>{
    const dialog=ref.current;
    if(!open&&!dialog.open)return;
    const from=dialog.open?getComputedStyle(dialog).transform:'translateX(-100%)';
    if(open){dialog.hidden=false;if(!dialog.open)dialog.showModal();document.body.classList.add('sidebar-open')}
    dialog.classList.toggle('is-closing',!open);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation=dialog.animate(reduced?[{opacity:open?0:1},{opacity:open?1:0}]:[{transform:from==='none'?'translateX(0)':from},{transform:open?'translateX(0)':'translateX(-100%)'}],{duration:reduced?100:280,easing:'cubic-bezier(.22,.68,0,1)',fill:'both'});
    let cancelled=false;
    animation.finished.then(()=>{if(cancelled)return;if(!open){dialog.close();dialog.hidden=true;document.body.classList.remove('sidebar-open')}animation.cancel()},()=>{});
    return ()=>{cancelled=true;animation.cancel()};
  },[open]);
  useEffect(()=>()=>document.body.classList.remove('sidebar-open'),[]);
  const item=([id,label])=><button key={id} className={'feature-menu-item'+(view===id?' active':'')} type="button" data-view={id} aria-current={view===id?'page':undefined} onClick={()=>{onNavigate(id);onClose()}}><span className="feature-menu-icon"><Icon name={ICONS[id]||id}/></span><span className="feature-menu-copy"><b>{label()}</b>{id==='updates'&&updateAvailable&&<span className="app-update-dot inline" aria-label={t('有新版本')}/>}</span></button>;
  return <dialog ref={ref} id="featureMenu" className="feature-menu" aria-labelledby="sidebarTitle" hidden onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose()}}>
    <div className="sidebar-header"><span id="sidebarTitle">{section==='settings'?t('設定'):t('MLB 戰況')}</span><button id="featureMenuClose" className="sidebar-close" type="button" aria-label={t('關閉側邊欄')} autoFocus onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16m7-12-3 4 3 4"/></svg></button></div>
    <nav className="sidebar-nav" aria-label={section==='settings'?t('設定選單'):t('主要功能')}>
      {section==='settings'&&<button type="button" className="feature-menu-item" data-menu-back onClick={()=>setSection('main')}><span className="feature-menu-icon" aria-hidden="true">←</span><span className="feature-menu-copy"><b>{t('返回主選單')}</b></span></button>}
      {(section==='settings'?settingsLinks:links).map(item)}
    </nav>
    {section==='main'&&<div className="sidebar-bottom"><button type="button" className="feature-menu-item" data-menu-settings aria-label={t('開啟設定選單')} onClick={()=>setSection('settings')}><span className="feature-menu-icon"><Icon name="settings"/>{updateAvailable&&<span className="app-update-dot" aria-label={t('有新版本')}/>}</span><span className="feature-menu-copy"><b>{t('設定')}</b></span></button></div>}
  </dialog>;
}
