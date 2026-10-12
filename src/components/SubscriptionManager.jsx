import {Fragment,useState} from 'react';
import {useScoreboard,actions} from '../store.js';
import {logo,teamName,SubsStatus,ConfirmDialog} from './SubscriptionShared.jsx';
import {PUSH_API} from '../config.js';
import {t,tParts,lang} from '../i18n.js';

// 標籤在畫面重畫時才翻譯（跟著目前語言）。
const prefItems=()=>[['pregame5',t('比賽開始前 5 分鐘')],['start',t('比賽開始')],['homeScore',t('主隊得分')],['awayScore',t('客隊得分')],['final',t('比賽結束')]];
const gameTitle=game=>game.awayName&&game.homeName?`${game.awayName} @ ${game.homeName}`:t('比賽 #{pk}',{pk:game.gamePk});

function PrefToggles({prefs,disabled,label,onChange}){
  return <div className="subs-prefs" role="group" aria-label={label}>
    {prefItems().map(([key,text])=><label key={key} className="subs-pref">
      <span>{text}</span>
      <input type="checkbox" role="switch" data-pref={key} checked={Boolean(prefs?.[key])} disabled={disabled} onChange={e=>onChange({...prefs,[key]:e.target.checked})}/>
    </label>)}
  </div>;
}

function CardTeam({id,name,side}){
  return <span className="game-card-team">
    <span className="subs-logo" aria-hidden="true">{id?<img src={logo(id)} alt=""/>:'?'}</span>
    <b>{name||t('待定')}</b>
    <small>{side}</small>
  </span>;
}

// 一場比賽一列，預設收合：對戰、時間、系列賽與狀態；右側箭頭展開成卡片（對戰、來源、查看 / 提醒項目 / 取消訂閱）。
function GameItem({game,busy,open,prefsOpen,onToggle,onTogglePrefs,onCancel}){
  const title=gameTitle(game);
  const scored=game.live&&game.awayScore!=null;
  const cardId='subsGameCard'+game.gamePk;
  return <li className={'subs-game'+(open?' open':'')+(game.live?' live':'')} data-game-pk={game.gamePk}>
    <button type="button" className="game-row" aria-expanded={open} aria-controls={cardId} onClick={onToggle}>
      <span className="game-row-logos" aria-hidden="true">{[game.awayId,game.homeId].map((id,i)=><span key={i} className="subs-logo small">{id?<img src={logo(id)} alt=""/>:'?'}</span>)}</span>
      <span className="game-row-text">
        <b>{title}</b>
        <small>{[game.timeText,game.series].filter(Boolean).map((part,i)=><Fragment key={i}>{i?' · ':''}<span className="game-row-meta">{part}</span></Fragment>)}</small>
      </span>
      {game.statusText&&<span className={'subs-tag status'+(game.live?' live':'')}>{game.statusText}{scored?` ${game.awayScore}:${game.homeScore}`:''}</span>}
      <span className="game-row-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span>
    </button>
    {open&&<div className="game-card" id={cardId}>
      <div className="game-card-teams">
        <CardTeam id={game.awayId} name={game.awayName} side={t('客隊')}/>
        <span className={'game-card-vs'+(scored?' score':'')}>{scored?`${game.awayScore} : ${game.homeScore}`:'@'}</span>
        <CardTeam id={game.homeId} name={game.homeName} side={t('主隊')}/>
      </div>
      <div className="game-card-time">{game.timeText}</div>
      <div className="subs-tags game-card-tags">
        <span className="subs-tag">{game.source==='team'?t('追蹤 {teams}',{teams:game.teamIds.map(teamName).join(lang()==='en'?', ':'、')}):t('手動訂閱')}</span>
        {game.custom&&<span className="subs-tag custom">{t('自訂提醒')}</span>}
      </div>
      <div className="game-card-actions">
        <button type="button" className="subs-btn game-card-open" onClick={()=>actions.subs.openGame(game.gamePk)}>{t('查看比賽')}</button>
        <a className="subs-btn game-card-calendar" href={`${PUSH_API}/api/calendar/${game.gamePk}.ics${lang()==='zh'?'':'?lang='+lang()}`} aria-label={t('將 {title} 加入行事曆',{title})}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17M12 13v5M9.5 15.5h5"/></svg>
          <span>{t('加入行事曆')}</span>
        </a>
        <button type="button" className="subs-icon-btn game-card-prefs-btn" aria-expanded={prefsOpen} aria-label={t('調整 {title} 的提醒項目',{title})} onClick={onTogglePrefs}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>
          <span>{t('提醒項目')}</span>
        </button>
        <button type="button" className="subs-btn danger subs-cancel" disabled={busy} onClick={onCancel}>{t('取消訂閱')}</button>
      </div>
      {prefsOpen&&<div className="subs-game-prefs">
        <PrefToggles prefs={game.prefs} disabled={busy} label={t('{title} 的提醒項目',{title})} onChange={prefs=>actions.subs.setGamePrefs(game.gamePk,prefs)}/>
        <div className="subs-game-prefs-foot">
          <span>{game.custom?t('這場使用自訂提醒項目'):t('這場使用預設提醒項目；調整後只影響這場')}</span>
          {game.custom&&<button type="button" className="subs-link" disabled={busy} onClick={()=>actions.subs.setGamePrefs(game.gamePk,null)}>{t('改回預設')}</button>}
        </div>
      </div>}
    </div>}
  </li>;
}

export function SubscriptionManager(){
  const {subs}=useScoreboard();
  const [openGames,setOpenGames]=useState(()=>new Set());
  const [openPrefs,setOpenPrefs]=useState(null);
  const [confirm,setConfirm]=useState(null);
  const busy=key=>Boolean(subs.busy?.[key]);
  const toggleGame=gamePk=>setOpenGames(current=>{
    const next=new Set(current);
    if(next.has(gamePk))next.delete(gamePk);
    else next.add(gamePk);
    return next;
  });

  const askCancel=game=>setConfirm({
    title:t('取消訂閱這場比賽？'),
    message:t('{game}（{time}）取消後就不會再收到這場比賽的通知。',{game:gameTitle(game),time:game.timeText||t('時間未定')})+(game.source==='team'?t('這場是追蹤球隊自動加入的，取消後也不會再自動加回。'):''),
    confirmLabel:t('取消訂閱'),
    onConfirm:()=>actions.subs.unsubscribeGame(game.gamePk)
  });

  const teamsLink=<button type="button" className="subs-link" onClick={()=>actions.navigate('teams')}>{t('追蹤球隊')}</button>;
  const testLink=<button type="button" className="subs-link" onClick={()=>actions.navigate('notificationTest')}>{t('訂閱測試')}</button>;
  return <section className="card subs-shell" aria-label={t('訂閱管理')}>
    <p className="subs-intro">{tParts('這台裝置訂閱的比賽與提醒項目。想自動訂閱喜歡球隊的比賽，請到{link}。',{link:teamsLink}).map((part,i)=><Fragment key={i}>{part}</Fragment>)}</p>
    <SubsStatus subs={subs}/>

    <section className="subs-section" aria-labelledby="subsPrefsTitle">
      <div className="subs-section-head"><h3 id="subsPrefsTitle">{t('提醒項目')}</h3><span>{t('套用到所有比賽；個別比賽可展開後另外調整')}</span></div>
      <PrefToggles prefs={subs.defaults} disabled={busy('defaults')} label={t('預設提醒項目')} onChange={prefs=>actions.subs.setDefaultPrefs(prefs)}/>
    </section>

    <section className="subs-section" aria-labelledby="subsGamesTitle">
      <div className="subs-section-head"><h3 id="subsGamesTitle">{t('已訂閱的比賽')}</h3><span>{subs.games.length?t('共 {n} 場 · 點一列展開',{n:subs.games.length}):''}</span></div>
      {subs.games.length?<ul className="subs-game-list">
        {subs.games.map(game=><GameItem key={game.gamePk} game={game} busy={busy('game:'+game.gamePk)}
          open={openGames.has(game.gamePk)} onToggle={()=>toggleGame(game.gamePk)}
          prefsOpen={openPrefs===game.gamePk} onTogglePrefs={()=>setOpenPrefs(openPrefs===game.gamePk?null:game.gamePk)}
          onCancel={()=>askCancel(game)}/>)}
      </ul>:<p className="subs-empty">{subs.status==='loading'||subs.status==='idle'?t('載入中…'):t('目前沒有訂閱任何比賽。在即時比賽頁按比分中央的鈴鐺，或到「追蹤球隊」自動訂閱。')}</p>}
    </section>

    <p className="subs-footnote">{tParts('收不到通知？到{link}確認這台裝置能收到推播。',{link:testLink}).map((part,i)=><Fragment key={i}>{part}</Fragment>)}</p>

    <ConfirmDialog id="subsConfirm" request={confirm} onClose={()=>setConfirm(null)}/>
  </section>;
}
