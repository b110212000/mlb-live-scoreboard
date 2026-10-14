import {useEffect} from 'react';
import {t,lang} from '../i18n.js';
import {APP_VERSION} from '../config.js';
import {useScoreboard,actions} from '../store.js';
import {useAppUpdate,checkAppUpdate,applyAppUpdate} from '../updates.js';

export function AppUpdatePage(){
  const {view}=useScoreboard(),update=useAppUpdate();
  useEffect(()=>{if(view==='updates')checkAppUpdate()},[view]);
  const notes=update.notes?.notes?.[lang()]||[];
  const error=update.error==='draft'?t('請先送出或清空回饋草稿，再更新。'):update.error==='deploying'?t('新版還在部署，請稍後再更新。'):update.error?t('無法確認更新，請檢查網路後再試。'):'';
  return <section className="card subs-shell app-update-shell" aria-label={t('版本更新')}>
    <h3>{t('版本更新')}</h3>
    <p>{t('目前版本：v{version}',{version:APP_VERSION})}</p>
    <p className="subs-intro">{t('有新版時會顯示紅點，由你決定何時更新，不會自動重整。')}</p>
    <p className="app-update-status" role="status">{error||(update.checking?t('正在檢查更新…'):update.remote?t('可更新至 v{version}',{version:update.remote}):t('目前已是最新版本。'))}</p>
    {!!notes.length&&<div className="app-update-notes"><h4>{t('更新內容')}</h4><ul>{notes.map((note,i)=><li key={i}>{note}</li>)}</ul></div>}
    <div className="app-update-actions">
      <button type="button" disabled={update.checking||update.applying} onClick={()=>checkAppUpdate(true)}>{t('檢查更新')}</button>
      {update.remote&&<button type="button" className="app-update-primary" disabled={update.applying} onClick={()=>applyAppUpdate(actions.updateReturnPoint())}>{update.applying?t('正在準備更新…'):t('立即更新')}</button>}
      {update.error==='draft'&&<button type="button" onClick={()=>actions.navigate('feedback')}>{t('返回意見回饋')}</button>}
    </div>
  </section>;
}
