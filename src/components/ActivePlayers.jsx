import {useEffect,useMemo,useState} from 'react';
import {actions,useScoreboard} from '../store.js';
import {MLB_TEAMS,teamLabel} from '../teams.js';
import {headshot,positionName,positionTypeName} from '../players.js';
import {logo} from './SubscriptionShared.jsx';
import {t} from '../i18n.js';

const API='https://statsapi.mlb.com/api/v1';
const cache=new Map();
const season=()=>new Date().getFullYear();
const json=async url=>{const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);return response.json()};
const mlbStat=(person,group)=>person.stats?.find(stat=>stat.group?.displayName===group)?.splits?.find(split=>split.sport?.id===1)?.stat||null;
const number=value=>{const n=Number(value);return Number.isFinite(n)?n:null};
const isPitcher=player=>player.position?.type==='Pitcher'||player.position?.abbreviation==='P';
const isTwoWay=player=>player.position?.abbreviation==='TWP'||player.position?.type==='Two-Way Player';

// 名單端點只在開啟特定隊伍後請求。再以同一批 personIds 補上「本季、MLB」統計，避免混入小聯盟。
async function loadTeam(teamId){
  const key=`${teamId}:${season()}`;
  if(cache.has(key))return cache.get(key);
  const roster=await json(`${API}/teams/${teamId}/roster?rosterType=40Man`);
  const entries=roster.roster||[];
  const ids=entries.map(entry=>entry.person?.id).filter(Boolean);
  const people=ids.length?await json(`${API}/people?personIds=${ids.join(',')}&hydrate=stats(group=[hitting,pitching],type=season,season=${season()},sportId=1)`):{people:[]};
  const byId=new Map((people.people||[]).map(person=>[person.id,person]));
  const players=entries.map(entry=>{
    const person=byId.get(entry.person?.id)||entry.person;
    return {id:person.id,name:person.fullName||entry.person?.fullName||'',position:person.primaryPosition||entry.position||{},hitting:mlbStat(person,'hitting'),pitching:mlbStat(person,'pitching')};
  });
  const result={players,season:season()};cache.set(key,result);return result;
}

function PlayerCard({player,kind}){
  const stats=kind==='hitting'?player.hitting:player.pitching;
  const line=kind==='hitting'
    ?stats?.gamesPlayed?[`OPS ${stats.ops??'-'}`,t('打擊率 {avg}',{avg:stats.avg??'-'}),t('{n} 轟',{n:stats.homeRuns??0}),t('{n} 打點',{n:stats.rbi??0})].join(' · '):t('本季尚無 MLB 成績')
    :stats?.gamesPlayed?[t('防禦率 {era}',{era:stats.era??'-'}),t('{ip} 局',{ip:stats.inningsPitched??'0.0'}),t('{n} 三振',{n:stats.strikeOuts??0}),t('{w} 勝 {l} 敗',{w:stats.wins??0,l:stats.losses??0})].join(' · '):t('本季尚無 MLB 成績');
  const position=positionName(player.position?.abbreviation)||positionTypeName(player.position?.type)||player.position?.abbreviation;
  return <button type="button" className="active-player-card" onClick={()=>actions.openPlayer(player.id)}>
    <img src={headshot(player.id,180)} alt="" loading="lazy"/><span><b>{player.name}</b><small>{position}{isTwoWay(player)&&` · ${t('二刀流')}`}</small><em>{line}</em></span><i aria-hidden="true">›</i>
  </button>;
}

const compare=(kind,a,b)=>{
  const left=number(kind==='hitting'?a.hitting?.ops:a.pitching?.era),right=number(kind==='hitting'?b.hitting?.ops:b.pitching?.era);
  if(left==null&&right==null)return a.name.localeCompare(b.name);
  if(left==null)return 1;if(right==null)return -1;
  return kind==='hitting'?right-left:left-right;
};

function TeamRoster({team}){
  const {view}=useScoreboard();
  const [data,setData]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(view!=='activePlayers'||!team)return;
    let cancelled=false;setData(null);setError('');
    loadTeam(team.id).then(next=>!cancelled&&setData(next)).catch(err=>!cancelled&&setError(err.message));
    return ()=>{cancelled=true};
  },[view,team?.id,retry]);
  const hitters=useMemo(()=>data?.players.filter(player=>!isPitcher(player)||isTwoWay(player)).sort((a,b)=>compare('hitting',a,b))||[],[data]);
  const pitchers=useMemo(()=>data?.players.filter(player=>isPitcher(player)||isTwoWay(player)).sort((a,b)=>compare('pitching',a,b))||[],[data]);
  return <>
    <button type="button" className="subs-link active-back" onClick={()=>actions.navigate('activePlayers')}>{t('← 所有球隊')}</button>
    <div className="active-team-title"><span className="subs-logo"><img src={logo(team.id)} alt=""/></span><h2>{teamLabel(team)}</h2></div>
    <p className="subs-intro">{t('{season} 年 40 人名單；成績僅計 MLB 例行賽。打者依 OPS 由高至低，投手依 ERA 由低至高；無成績者排在最後。',{season:season()})}</p>
    {error&&<div className="subs-banner">{t('現役球員資料讀取失敗：{error}',{error})} <button type="button" className="subs-link" onClick={()=>setRetry(n=>n+1)}>{t('重試')}</button></div>}
    {!data&&!error&&<p className="subs-empty">{t('載入 40 人名單中…')}</p>}
    {data&&<><section className="subs-section"><div className="subs-section-head"><h3>{t('打者')}</h3><span>{t('{n} 人',{n:hitters.length})}</span></div><div className="active-player-list">{hitters.map(player=><PlayerCard key={player.id} player={player} kind="hitting"/>)}</div></section>
    <section className="subs-section"><div className="subs-section-head"><h3>{t('投手')}</h3><span>{t('{n} 人',{n:pitchers.length})}</span></div><div className="active-player-list">{pitchers.map(player=><PlayerCard key={player.id} player={player} kind="pitching"/>)}</div></section></>}
  </>;
}

export function ActivePlayers(){
  const {view}=useScoreboard();const [team,setTeam]=useState(null);
  return <section className="card subs-shell active-shell" aria-label={t('現役球員')}>
    {!team?<><p className="subs-intro">{t('選擇球隊查看 40 人名單。名單在開啟隊伍後才讀取；包含傷兵與下放名單內球員。')}</p><div className="active-team-grid">{MLB_TEAMS.map(item=><button type="button" key={item.id} className="active-team-card" onClick={()=>setTeam(item)}><span className="subs-logo"><img src={logo(item.id)} alt=""/></span><b>{teamLabel(item)}</b><small>{item.en}</small></button>)}</div></>:<TeamRoster team={team}/>} 
  </section>;
}
