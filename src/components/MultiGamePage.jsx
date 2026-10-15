import {useEffect,useRef,useState} from 'react';
import {actions} from '../store.js';
import {t} from '../i18n.js';
import {teamLabel} from '../teams.js';
import {TeamLogo} from './LiveCore.jsx';
import {useVisiblePage} from '../useVisiblePage.js';
import {MLB_API,cachedJSON,localDate,validDate,shiftDate,gamesOnDate,gameKind,gameStatusText,gameTime} from '../gameData.js';

const KEY='mlb-multigame',TYPES=new Set(['R','F','D','L','W','P']);
function savedBoard(){
  try{const data=JSON.parse(localStorage.getItem(KEY));if(validDate(data?.date)&&Array.isArray(data.pins))return {date:data.date,pins:[...new Set(data.pins.filter(id=>Number.isSafeInteger(id)&&id>0))].slice(0,4)}}catch{}
  return {date:localDate(),pins:[]};
}
function GameCard({game,id,onRemove}){
  const kind=game?gameKind(game):null,ls=game?.linescore,live=kind==='live';
  return <article className="multi-card" data-multi-game={id}>
    <header><span className={live?'multi-live':''}>{game?gameStatusText(game):t('這場比賽暫無資料')}</span><button type="button" className="multi-remove" onClick={onRemove} aria-label={t('移除場次 {id}',{id})}>×</button></header>
    {game?<button type="button" className="multi-open" onClick={()=>actions.subs.openGame(id)} aria-label={t('查看 {away} 對 {home}',{away:teamLabel(game.teams?.away?.team),home:teamLabel(game.teams?.home?.team)})}>
      {['away','home'].map(side=>{const data=game.teams?.[side],team=data?.team||{};return <div className="multi-team-row" key={side}><TeamLogo key={team.id||side} team={team} label={teamLabel(team)}/><span>{teamLabel(team)||t('球隊')}</span><b>{kind==='preview'?'—':data?.score??ls?.teams?.[side]?.runs??'—'}</b></div>})}
      <div className="multi-detail"><span>{gameTime(game)}{Number(game.gameNumber)>1?t(' · 第 {n} 場',{n:game.gameNumber}):''}</span>
        {live&&Number.isInteger(ls?.outs)?<span>{t('{n} 出局',{n:ls.outs})}</span>:null}
      </div>
      {live&&(ls?.offense?<div className="multi-bases" aria-label={t('壘上狀況')}>{[['first',t('一壘')],['second',t('二壘')],['third',t('三壘')]].map(([base,label])=><span key={base} className={ls.offense[base]?'occupied':''}>{label} · {ls.offense[base]?t('有人'):t('無人')}</span>)}</div>:<p className="multi-unavailable">{t('壘上資訊暫無')}</p>)}
    </button>:<p className="multi-unavailable">{t('可以移除這張卡片，再選擇其他場次。')}</p>}
  </article>;
}
export function MultiGamePage(){
  const active=useVisiblePage('multi'),lastRetry=useRef(0);
  const [board,setBoard]=useState(savedBoard),[result,setResult]=useState(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
  const {date,pins}=board,games=result?.date===date?result.games:[];
  useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(board))}catch{}},[board]);
  useEffect(()=>{
    if(!active)return;
    let cancelled=false,timer;
    const load=async()=>{
      let delay=30000;
      try{
        const url=`${MLB_API}/schedule?sportId=1&startDate=${shiftDate(date,-1)}&endDate=${shiftDate(date,1)}&hydrate=team,linescore,seriesStatus`;
        const force=retry!==lastRetry.current;lastRetry.current=retry;
        const list=gamesOnDate(await cachedJSON(url,force?0:5000),date).filter(g=>TYPES.has(g.gameType));
        if(cancelled)return;
        setResult({date,games:list});setError(false);
        const selected=list.filter(g=>pins.includes(g.gamePk));
        if(selected.some(g=>gameKind(g)==='live'))delay=5000;
        else if(selected.length===pins.length&&selected.length&&selected.every(g=>['final','postponed','cancelled'].includes(gameKind(g))))delay=0;
        else if(!pins.length)delay=60000;
      }catch{if(!cancelled)setError(true)}
      if(!cancelled&&delay)timer=setTimeout(load,delay);
    };
    load();return ()=>{cancelled=true;clearTimeout(timer)};
  },[active,date,pins.join(','),retry]);
  const changeDate=value=>{if(validDate(value)){setBoard({date:value,pins:[]});setError(false)}};
  const toggle=id=>setBoard(current=>({...current,pins:current.pins.includes(id)?current.pins.filter(pk=>pk!==id):current.pins.length<4?[...current.pins,id]:current.pins}));
  return <section className="multi-shell" aria-label={t('多場同看')}>
    <div className="multi-toolbar"><label>{t('比賽日期')}<input type="date" value={date} onChange={event=>changeDate(event.target.value)}/></label><button type="button" onClick={()=>changeDate(localDate())}>{t('今天')}</button><button type="button" onClick={()=>setRetry(x=>x+1)}>{t('重新整理')}</button></div>
    <p className="subs-intro">{t('選擇最多 4 場，同時查看比分、壘包與出局數。點卡片可進入詳細賽況。')}</p>
    {error&&<p className="subs-banner" role="status">{t('更新失敗，畫面保留上次資料，請稍後重試。')}</p>}
    {result?.date!==date&&!error&&<p className="subs-empty">{t('載入賽程中…')}</p>}
    {result?.date===date&&!games.length&&!error&&<p className="subs-empty">{t('這天沒有 MLB 比賽')}</p>}
    {!!games.length&&<fieldset className="multi-picker"><legend>{t('已選 {n} / 4 場',{n:pins.length})}</legend>{games.map(game=><button type="button" key={game.gamePk} data-multi-pick={game.gamePk} aria-pressed={pins.includes(game.gamePk)} disabled={pins.length>=4&&!pins.includes(game.gamePk)} onClick={()=>toggle(game.gamePk)}><span>{pins.includes(game.gamePk)?'✓':'＋'} {teamLabel(game.teams?.away?.team,{short:true})} @ {teamLabel(game.teams?.home?.team,{short:true})}</span><small>{gameTime(game)} · {gameStatusText(game)}</small></button>)}</fieldset>}
    <div className="multi-grid">{pins.map(id=><GameCard key={id} id={id} game={games.find(game=>game.gamePk===id)} onRemove={()=>toggle(id)}/>)}</div>
    {!!games.length&&!pins.length&&<p className="subs-empty">{t('先點選上方場次，建立你的看球畫面。')}</p>}
  </section>;
}
