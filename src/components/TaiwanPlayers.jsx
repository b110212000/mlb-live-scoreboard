import {useEffect,useRef,useState} from 'react';
import {actions} from '../store.js';
import {teamById,teamLabel} from '../teams.js';
import {PUSH_API} from '../config.js';
import {TAIWAN_PLAYER_NAMES} from '../taiwanPlayers.js';
import {logo} from './SubscriptionShared.jsx';
import {headshot,positionName,levelName} from '../players.js';
import {t,lang} from '../i18n.js';

import {TaiwanToday} from './TaiwanToday.jsx';
import {useVisiblePage} from '../useVisiblePage.js';
import {cachedJSON,localDate,gameKind} from '../gameData.js';
import {loadTaiwanSchedule,loadTodayBoxes} from '../taiwanToday.js';
// 層級名稱依 sportId 在前端翻譯（Worker 回傳的 label 是中文）。
const levelLabel=level=>({1:'MLB',11:levelName('AAA'),12:levelName('AA'),13:levelName('A+'),14:levelName('A'),16:t('新人聯盟')})[level.sportId]||level.label;

function teamText(player){
  const team=player.currentTeam;
  if(!team)return '';
  if(teamById(team.id))return teamLabel(team);
  const org=teamLabel(team.parentOrgId);
  return org?t('{org}體系 · {team}',{org,team:team.name}):team.name;
}

function hittingLine(s){
  if(!s?.gamesPlayed)return t('本季尚無出賽');
  return [t('{n} 場',{n:s.gamesPlayed}),t('打擊率 {avg}',{avg:s.avg??'-'}),t('{n} 轟',{n:s.homeRuns??0}),t('{n} 打點',{n:s.rbi??0}),s.ops?`OPS ${s.ops}`:''].filter(Boolean).join(' · ');
}

function pitchingLine(s){
  if(!s?.gamesPlayed)return t('本季尚無出賽');
  const record=s.saves?t('{w} 勝 {l} 敗 {sv} 救援',{w:s.wins??0,l:s.losses??0,sv:s.saves}):t('{w} 勝 {l} 敗',{w:s.wins??0,l:s.losses??0});
  return [t('{ip} 局',{ip:s.inningsPitched??'0.0'}),t('防禦率 {era}',{era:s.era??'-'}),record,t('{n} 三振',{n:s.strikeOuts??0})].join(' · ');
}

function PlayerCard({player,daily}){
  // 中文與日文介面顯示中文（漢字）姓名，英文介面只顯示英文名。
  const zh=lang()==='en'?null:TAIWAN_PLAYER_NAMES[player.id];
  const position=positionName(player.position)||player.position;
  const parent=player.currentTeam&&(teamById(player.currentTeam.id)?.id||player.currentTeam.parentOrgId);
  // 整張卡片可點開球員資料；名字是按鈕，鍵盤也能操作（點擊會冒泡到卡片，只開一次）。
  return <article className="tw-card" data-player-id={player.id} onClick={()=>actions.openPlayer(player.id)}>
    <img className="tw-photo" src={headshot(player.id,180)} alt="" loading="lazy"/>
    <div className="tw-body">
      <div className="tw-name"><button type="button" className="tw-open" aria-label={t('{name} 球員資料',{name:zh||player.fullName})}><b>{zh||player.fullName}</b></button>{zh&&<small>{player.fullName}</small>}<span className="tw-more" aria-hidden="true">›</span></div>
      <div className="tw-team">
        {parent&&<span className="subs-logo small" aria-hidden="true"><img src={logo(parent)} alt=""/></span>}
        <span>{[position,teamText(player)].filter(Boolean).join(' · ')}</span>
      </div>
      <TaiwanToday player={player} daily={daily}/>
      <ul className="tw-stats">{player.levels.map(level=><li key={level.sportId}>
        <span className="tw-level">{levelLabel(level)}</span>
        <span>{player.pitcher?pitchingLine(level.pitching):hittingLine(level.hitting)}</span>
      </li>)}</ul>
    </div>
  </article>;
}

export function TaiwanPlayers(){
  const active=useVisiblePage('taiwan'),lastRetry=useRef(0);
  const [data,setData]=useState(null),[daily,setDaily]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!active)return;
    let cancelled=false,timer;
    const load=async()=>{
      let delay=60000;
      const date=localDate(),force=retry!==lastRetry.current;lastRetry.current=retry;
      setBusy(true);
      try{
        let season=new Date().getFullYear();
        let next=await cachedJSON(`${PUSH_API}/api/taiwan-players?season=${season}`,600000);
        if(!next.players?.length){season-=1;next=await cachedJSON(`${PUSH_API}/api/taiwan-players?season=${season}`,600000)}
        if(!Array.isArray(next.players))throw new Error('players');
        if(cancelled)return;
        setData(next);setError('');
        try{
          const schedule=await loadTaiwanSchedule(next.players,date,force);
          if(cancelled)return;
          const boxes=await loadTodayBoxes(schedule.games,()=>cancelled,force);
          if(cancelled)return;
          setDaily({...schedule,boxes,date,failed:false});
          if(schedule.games.some(game=>gameKind(game)==='live'))delay=30000;
        }catch{if(!cancelled)setDaily({date,failed:true})}
      }catch(err){if(!cancelled)setError(err.message)}
      finally{if(!cancelled)setBusy(false)}
      if(!cancelled)timer=setTimeout(load,delay);
    };
    load();return ()=>{cancelled=true;clearTimeout(timer)};
  },[active,retry]);

  const players=data?.players||[];
  const groups=(data?.levels||[]).map((level,index)=>({
    level,
    players:players.filter(player=>player.topLevel===index)
  })).filter(group=>group.players.length);
  const mlbCount=groups.find(group=>group.level.sportId===1)?.players.length||0;

  return <section className="card subs-shell tw-shell" aria-label={t('台灣旅外球員')}>
    <p className="subs-intro">{data?t('{season} 球季在 MLB 與小聯盟出賽的台灣球員，共 {n} 人（大聯盟 {mlb} 人）。',{season:data.season||'',n:players.length,mlb:mlbCount}):t('MLB 與小聯盟的台灣球員。')}{t('依最高出賽層級分組，成績為各層級本季成績；資料來自 MLB 官方球員名單（出生地為台灣）。')}</p>
    <button type="button" className="subs-btn tw-daily-refresh" disabled={busy} onClick={()=>setRetry(x=>x+1)}>{busy?t('正在更新今日表現…'):t('更新今日表現')}</button>
    {error&&<div className="subs-banner">{t('旅外球員資料讀取失敗：{error}',{error})}</div>}
    {!data&&!error&&<p className="subs-empty">{t('載入旅外球員中…')}</p>}
    {groups.map(group=><section key={group.level.sportId} className="subs-section tw-group" aria-label={levelLabel(group.level)}>
      <div className="subs-section-head"><h3>{group.level.sportId===1?t('大聯盟'):levelLabel(group.level)}</h3><span>{t('{n} 人',{n:group.players.length})}</span></div>
      <div className="tw-list">{group.players.map(player=><PlayerCard key={player.id} player={player} daily={daily?.date===localDate()?daily:null}/>)}</div>
    </section>)}
  </section>;
}
