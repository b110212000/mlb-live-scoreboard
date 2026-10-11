import {useEffect,useRef} from 'react';
import {teamById} from '../teams.js';

// 訂閱管理與追蹤球隊共用：推播支援提示、操作結果、確認視窗。
export const SUPPORT_NOTICE={
  unsupported:'這個瀏覽器不支援 Web Push 通知，無法訂閱比賽。',
  'needs-install':'iPhone / iPad 需先用 Safari「加入主畫面」，再從主畫面開啟 MLB 戰況，才能訂閱通知。',
  denied:'通知權限已被封鎖，請到系統設定允許 MLB 戰況的通知。'
};
export const logo=id=>id?`https://www.mlbstatic.com/team-logos/${id}.svg`:undefined;
export const teamName=id=>teamById(id)?.name||'球隊';

// 推播支援狀態是持續性的，留在頁面上；操作結果改用浮動 toast（見 Toast.jsx），不推擠版面。
export function SubsStatus({subs}){
  return SUPPORT_NOTICE[subs.support]?<div className="subs-banner">{SUPPORT_NOTICE[subs.support]}</div>:null;
}

export function ConfirmDialog({id,request,onClose}){
  const ref=useRef(null);
  useEffect(()=>{
    const dialog=ref.current;
    if(request&&!dialog.open)dialog.showModal();
    if(!request&&dialog.open)dialog.close();
  },[request]);
  return <dialog ref={ref} id={id} className="subs-dialog" aria-labelledby={id+'Title'} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    {request&&<div className="subs-dialog-body">
      <h3 id={id+'Title'}>{request.title}</h3>
      <p>{request.message}</p>
      <div className="subs-dialog-actions">
        <button type="button" className="subs-btn" data-confirm="cancel" autoFocus onClick={onClose}>保留</button>
        <button type="button" className="subs-btn danger" data-confirm="ok" onClick={()=>{const run=request.onConfirm;onClose();run()}}>{request.confirmLabel}</button>
      </div>
    </div>}
  </dialog>;
}
