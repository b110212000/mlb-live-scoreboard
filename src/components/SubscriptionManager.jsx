import {useEffect,useRef,useState} from 'react';
import {useScoreboard,actions} from '../store.js';
import {MLB_TEAMS,teamById} from '../teams.js';

const PREF_ITEMS=[['pregame5','比賽開始前 5 分鐘'],['start','比賽開始'],['homeScore','主隊得分'],['awayScore','客隊得分'],['final','比賽結束']];
const SUPPORT_NOTICE={
  unsupported:'這個瀏覽器不支援 Web Push 通知，無法訂閱比賽。',
  'needs-install':'iPhone / iPad 需先用 Safari「加入主畫面」，再從主畫面開啟 MLB 戰況，才能訂閱通知。',
  denied:'通知權限已被封鎖，請到系統設定允許 MLB 戰況的通知。'
};
const logo=id=>id?`https://www.mlbstatic.com/team-logos/${id}.svg`:undefined;
const teamName=id=>teamById(id)?.name||'球隊';
const gameTitle=game=>game.awayName&&game.homeName?`${game.awayName} @ ${game.homeName}`:`比賽 #${game.gamePk}`;

function PrefToggles({prefs,disabled,label,onChange}){
  return <div className="subs-prefs" role="group" aria-label={label}>
    {PREF_ITEMS.map(([key,text])=><label key={key} className="subs-pref">
      <span>{text}</span>
      <input type="checkbox" role="switch" data-pref={key} checked={Boolean(prefs?.[key])} disabled={disabled} onChange={e=>onChange({...prefs,[key]:e.target.checked})}/>
    </label>)}
  </div>;
}

function ConfirmDialog({request,onClose}){
  const ref=useRef(null);
  useEffect(()=>{
    const dialog=ref.current;
    if(request&&!dialog.open)dialog.showModal();
    if(!request&&dialog.open)dialog.close();
  },[request]);
  return <dialog ref={ref} id="subsConfirm" className="subs-dialog" aria-labelledby="subsConfirmTitle" onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    {request&&<div className="subs-dialog-body">
      <h3 id="subsConfirmTitle">{request.title}</h3>
      <p>{request.message}</p>
      <div className="subs-dialog-actions">
        <button type="button" className="subs-btn" data-confirm="cancel" autoFocus onClick={onClose}>保留</button>
        <button type="button" className="subs-btn danger" data-confirm="ok" onClick={()=>{const run=request.onConfirm;onClose();run()}}>{request.confirmLabel}</button>
      </div>
    </div>}
  </dialog>;
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
  const [teamPick,setTeamPick]=useState('');
  const blocked=Boolean(SUPPORT_NOTICE[subs.support]);
  const busy=key=>Boolean(subs.busy?.[key]);
  const followed=new Set(subs.teams);
  const options=league=>MLB_TEAMS.filter(team=>team.league===league&&!followed.has(team.id)).map(team=><option key={team.id} value={team.id}>{team.name}（{team.abbr}）</option>);

  const askCancel=game=>setConfirm({
    title:'取消訂閱這場比賽？',
    message:`${gameTitle(game)}（${game.timeText||'時間未定'}）取消後就不會再收到這場比賽的通知。`+(game.source==='team'?'這場是追蹤球隊自動加入的，取消後也不會再自動加回。':''),
    confirmLabel:'取消訂閱',
    onConfirm:()=>actions.subs.unsubscribeGame(game.gamePk)
  });
  const askUnfollow=id=>setConfirm({
    title:`取消追蹤${teamName(id)}？`,
    message:`因追蹤${teamName(id)}而自動加入的比賽會一併取消；手動訂閱的比賽會保留。`,
    confirmLabel:'取消追蹤',
    onConfirm:()=>actions.subs.unfollowTeam(id)
  });
  const follow=()=>{
    if(!teamPick)return;
    actions.subs.followTeam(Number(teamPick));
    setTeamPick('');
  };

  return <section className="card subs-shell" aria-label="訂閱管理">
    <p className="subs-intro">管理這台裝置的比賽通知：追蹤球隊、目前訂閱的比賽與提醒項目。</p>
    {blocked&&<div className="subs-banner">{SUPPORT_NOTICE[subs.support]}</div>}
    <div className="subs-feedback" role="status" aria-live="polite">
      {subs.error?<span className="error">{subs.error}</span>:subs.notice?<span className="success">{subs.notice}</span>:null}
    </div>

    <section className="subs-section" aria-labelledby="subsTeamsTitle">
      <div className="subs-section-head"><h3 id="subsTeamsTitle">追蹤球隊</h3><span>自動訂閱該隊接下來的季後賽</span></div>
      {subs.teams.length?<ul className="subs-team-list">
        {subs.teams.map(id=><li key={id} className="subs-team" data-team-id={id}>
          <span className="subs-logo small" aria-hidden="true"><img src={logo(id)} alt=""/></span>
          <span>{teamName(id)}</span>
          <button type="button" className="subs-team-remove" aria-label={`取消追蹤${teamName(id)}`} disabled={busy('team:'+id)} onClick={()=>askUnfollow(id)}>✕</button>
        </li>)}
      </ul>:<p className="subs-empty">還沒有追蹤球隊。</p>}
      <div className="subs-team-add">
        <select id="subsTeamSelect" aria-label="選擇要追蹤的球隊" value={teamPick} disabled={blocked} onChange={e=>setTeamPick(e.target.value)}>
          <option value="">選擇球隊…</option>
          <optgroup label="美國聯盟">{options('AL')}</optgroup>
          <optgroup label="國家聯盟">{options('NL')}</optgroup>
        </select>
        <button type="button" id="subsFollowBtn" className="subs-btn primary" disabled={!teamPick||blocked||busy('team:'+teamPick)} onClick={follow}>追蹤</button>
      </div>
    </section>

    <section className="subs-section" aria-labelledby="subsGamesTitle">
      <div className="subs-section-head"><h3 id="subsGamesTitle">已訂閱的比賽</h3><span>{subs.games.length?`共 ${subs.games.length} 場 · 點比賽可開啟`:''}</span></div>
      {subs.games.length?<ul className="subs-game-list">
        {subs.games.map(game=><GameRow key={game.gamePk} game={game} busy={busy('game:'+game.gamePk)} expanded={openPrefs===game.gamePk}
          onToggle={()=>setOpenPrefs(openPrefs===game.gamePk?null:game.gamePk)} onCancel={()=>askCancel(game)}/>)}
      </ul>:<p className="subs-empty">{subs.status==='loading'||subs.status==='idle'?'載入中…':'目前沒有訂閱任何比賽。在即時比賽頁按比分中央的鈴鐺，或追蹤球隊即可自動訂閱。'}</p>}
    </section>

    <section className="subs-section" aria-labelledby="subsPrefsTitle">
      <div className="subs-section-head"><h3 id="subsPrefsTitle">提醒項目</h3><span>套用到所有比賽；個別比賽可在上方清單另外調整</span></div>
      <PrefToggles prefs={subs.defaults} disabled={busy('defaults')} label="預設提醒項目" onChange={prefs=>actions.subs.setDefaultPrefs(prefs)}/>
    </section>

    <ConfirmDialog request={confirm} onClose={()=>setConfirm(null)}/>
  </section>;
}
