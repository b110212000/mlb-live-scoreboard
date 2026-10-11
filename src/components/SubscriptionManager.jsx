import {useState} from 'react';
import {useScoreboard,actions} from '../store.js';
import {logo,teamName,SubsStatus,ConfirmDialog} from './SubscriptionShared.jsx';

const PREF_ITEMS=[['pregame5','比賽開始前 5 分鐘'],['start','比賽開始'],['homeScore','主隊得分'],['awayScore','客隊得分'],['final','比賽結束']];
const gameTitle=game=>game.awayName&&game.homeName?`${game.awayName} @ ${game.homeName}`:`比賽 #${game.gamePk}`;

function PrefToggles({prefs,disabled,label,onChange}){
  return <div className="subs-prefs" role="group" aria-label={label}>
    {PREF_ITEMS.map(([key,text])=><label key={key} className="subs-pref">
      <span>{text}</span>
      <input type="checkbox" role="switch" data-pref={key} checked={Boolean(prefs?.[key])} disabled={disabled} onChange={e=>onChange({...prefs,[key]:e.target.checked})}/>
    </label>)}
  </div>;
}

function GameRow({game,busy,expanded,onToggle,onCancel}){
  const title=gameTitle(game);
  const meta=[game.timeText,game.series].filter(Boolean);
  const score=game.live&&game.awayScore!=null?` ${game.awayScore}：${game.homeScore}`:'';
  return <li className="subs-game" data-game-pk={game.gamePk}>
    <div className="subs-game-row">
      <button type="button" className="subs-game-main" aria-label={`開啟 ${title}`} onClick={()=>actions.subs.openGame(game.gamePk)}>
        <span className="subs-game-logos" aria-hidden="true">{[game.awayId,game.homeId].map((id,i)=><span key={i} className="subs-logo">{id?<img src={logo(id)} alt=""/>:'?'}</span>)}</span>
        <span className="subs-game-text">
          <b>{title}</b>
          <small>{meta.map((part,i)=><span key={i} className="subs-meta-part">{i?' · ':''}{part}</span>)}</small>
          <span className="subs-tags">
            {game.statusText&&<span className={'subs-tag status'+(game.live?' live':'')}>{game.statusText+score}</span>}
            <span className="subs-tag">{game.source==='team'?'追蹤 '+game.teamIds.map(teamName).join('、'):'手動訂閱'}</span>
            {game.custom&&<span className="subs-tag custom">自訂提醒</span>}
          </span>
        </span>
      </button>
      <div className="subs-game-actions">
        <button type="button" className="subs-icon-btn" aria-expanded={expanded} aria-label={`調整 ${title} 的提醒項目`} title="提醒項目" onClick={onToggle}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>
        </button>
        <button type="button" className="subs-btn danger subs-cancel" disabled={busy} onClick={onCancel}>取消</button>
      </div>
    </div>
    {expanded&&<div className="subs-game-prefs">
      <PrefToggles prefs={game.prefs} disabled={busy} label={`${title} 的提醒項目`} onChange={prefs=>actions.subs.setGamePrefs(game.gamePk,prefs)}/>
      <div className="subs-game-prefs-foot">
        <span>{game.custom?'這場使用自訂提醒項目':'這場使用預設提醒項目；調整後只影響這場'}</span>
        {game.custom&&<button type="button" className="subs-link" disabled={busy} onClick={()=>actions.subs.setGamePrefs(game.gamePk,null)}>改回預設</button>}
      </div>
    </div>}
  </li>;
}

export function SubscriptionManager(){
  const {subs}=useScoreboard();
  const [openPrefs,setOpenPrefs]=useState(null);
  const [confirm,setConfirm]=useState(null);
  const busy=key=>Boolean(subs.busy?.[key]);

  const askCancel=game=>setConfirm({
    title:'取消訂閱這場比賽？',
    message:`${gameTitle(game)}（${game.timeText||'時間未定'}）取消後就不會再收到這場比賽的通知。`+(game.source==='team'?'這場是追蹤球隊自動加入的，取消後也不會再自動加回。':''),
    confirmLabel:'取消訂閱',
    onConfirm:()=>actions.subs.unsubscribeGame(game.gamePk)
  });

  return <section className="card subs-shell" aria-label="訂閱管理">
    <p className="subs-intro">這台裝置訂閱的比賽與提醒項目。想自動訂閱喜歡球隊的比賽，請到<button type="button" className="subs-link" onClick={()=>actions.navigate('teams')}>追蹤球隊</button>。</p>
    <SubsStatus subs={subs}/>

    <section className="subs-section" aria-labelledby="subsGamesTitle">
      <div className="subs-section-head"><h3 id="subsGamesTitle">已訂閱的比賽</h3><span>{subs.games.length?`共 ${subs.games.length} 場 · 點比賽可開啟`:''}</span></div>
      {subs.games.length?<ul className="subs-game-list">
        {subs.games.map(game=><GameRow key={game.gamePk} game={game} busy={busy('game:'+game.gamePk)} expanded={openPrefs===game.gamePk}
          onToggle={()=>setOpenPrefs(openPrefs===game.gamePk?null:game.gamePk)} onCancel={()=>askCancel(game)}/>)}
      </ul>:<p className="subs-empty">{subs.status==='loading'||subs.status==='idle'?'載入中…':'目前沒有訂閱任何比賽。在即時比賽頁按比分中央的鈴鐺，或到「追蹤球隊」自動訂閱。'}</p>}
    </section>

    <section className="subs-section" aria-labelledby="subsPrefsTitle">
      <div className="subs-section-head"><h3 id="subsPrefsTitle">提醒項目</h3><span>套用到所有比賽；個別比賽可在上方清單另外調整</span></div>
      <PrefToggles prefs={subs.defaults} disabled={busy('defaults')} label="預設提醒項目" onChange={prefs=>actions.subs.setDefaultPrefs(prefs)}/>
    </section>

    <p className="subs-footnote">收不到通知？到<button type="button" className="subs-link" onClick={()=>actions.navigate('notificationTest')}>訂閱測試</button>確認這台裝置能收到推播。</p>

    <ConfirmDialog id="subsConfirm" request={confirm} onClose={()=>setConfirm(null)}/>
  </section>;
}
