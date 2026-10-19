import {useEffect,useMemo,useState} from 'react';
import {actions,useScoreboard} from '../store.js';
import {MLB_TEAMS,teamLabel,teamById} from '../teams.js';
import {headshot,positionName,positionTypeName} from '../players.js';
import {loadTeam,loadLeaders,currentSeason,comparePlayers,isPitcher,isTwoWay} from '../activePlayers.js';
import {useSwipeNavigation} from '../useSwipeNavigation.js';
import {logo} from './SubscriptionShared.jsx';
import {t} from '../i18n.js';

function PlayerCard({player,kind,rank}){
  const stats=kind==='hitting'?player.hitting:player.pitching;
  const line=kind==='hitting'
    ?stats?.gamesPlayed?[`OPS ${stats.ops??'-'}`,t('打擊率 {avg}',{avg:stats.avg??'-'}),t('{n} 轟',{n:stats.homeRuns??0}),t('{n} 打點',{n:stats.rbi??0})].join(' · '):t('本季尚無 MLB 成績')
    :stats?.gamesPlayed?[t('防禦率 {era}',{era:Number(stats.inningsPitched)>0?stats.era??'-':'-'}),t('{ip} 局',{ip:stats.inningsPitched??'0.0'}),t('{n} 三振',{n:stats.strikeOuts??0}),t('{w} 勝 {l} 敗',{w:stats.wins??0,l:stats.losses??0})].join(' · '):t('本季尚無 MLB 成績');
  const position=positionName(player.position?.abbreviation)||positionTypeName(player.position?.type)||player.position?.abbreviation;
  return <button type="button" className={'active-player-card'+(rank?' active-ranked':'')} onClick={()=>actions.openPlayer(player.id)}>
    {rank&&<span className="active-rank">{rank}</span>}
    <img src={headshot(player.id,180)} alt="" loading="lazy" onError={e=>{e.currentTarget.style.visibility='hidden'}}/>
    <span className="active-player-copy"><b>{player.name}</b><small>{[rank&&(player.numTeams>1?t('{n} 隊',{n:player.numTeams}):teamLabel(player.team)),position,isTwoWay(player)?t('二刀流'):''].filter(Boolean).join(' · ')}</small><em>{line}</em></span><i aria-hidden="true">›</i>
  </button>;
}
function TeamRoster({team}){
  const {view}=useScoreboard();
  const [state,setState]=useState({data:null,error:''}),[retry,setRetry]=useState(0);
  const year=currentSeason();
  useEffect(()=>{
    if(view!=='activePlayers')return;
    let cancelled=false;setState(old=>({...old,error:''}));
    loadTeam(team.id,year,retry>0).then(data=>!cancelled&&setState({data,error:''})).catch(err=>!cancelled&&setState({data:null,error:err.message}));
    return ()=>{cancelled=true};
  },[view,team.id,year,retry]);
  const {data,error}=state;
  const hitters=useMemo(()=>data?.players.filter(p=>!isPitcher(p)||isTwoWay(p)).sort((a,b)=>comparePlayers('hitting',a,b))||[],[data]);
  const pitchers=useMemo(()=>data?.players.filter(p=>isPitcher(p)||isTwoWay(p)).sort((a,b)=>comparePlayers('pitching',a,b))||[],[data]);
  return <>
    <button type="button" className="subs-link active-back" onClick={actions.closeActiveTeam}>{t('← 所有球隊')}</button>
    <div className="active-team-title"><span className="subs-logo"><img src={logo(team.id)} alt=""/></span><h2>{teamLabel(team)}</h2></div>
    <p className="subs-intro">{t('{season} 年 40 人名單；成績僅計 MLB 例行賽。打者依 OPS 由高至低，投手依 ERA 由低至高；無成績者排在最後。',{season:year})}</p>
    {error&&<div className="subs-banner" role="alert">{t('現役球員資料讀取失敗：{error}',{error})} <button type="button" className="subs-link" onClick={()=>setRetry(n=>n+1)}>{t('重試')}</button></div>}
    {!data&&!error&&<p className="subs-empty" role="status">{t('載入 40 人名單中…')}</p>}
    {data&&!data.players.length&&<p className="subs-empty">{t('目前沒有球員名單')}</p>}
    {data&&data.players.length>0&&<><section className="subs-section"><div className="subs-section-head"><h3>{t('打者')}</h3><span>{t('{n} 人',{n:hitters.length})}</span></div><div className="active-player-list">{hitters.map(p=><PlayerCard key={p.id} player={p} kind="hitting"/>)}</div></section>
    <section className="subs-section"><div className="subs-section-head"><h3>{t('投手')}</h3><span>{t('{n} 人',{n:pitchers.length})}</span></div><div className="active-player-list">{pitchers.map(p=><PlayerCard key={p.id} player={p} kind="pitching"/>)}</div></section></>}
  </>;
}
const tabIds=['pitching','teams','hitting'];
const label=id=>({pitching:t('投手'),teams:t('球隊'),hitting:t('打者')})[id];
function Leaders({kind,league}){
  const {view}=useScoreboard(),year=currentSeason();
  const [state,setState]=useState({key:'',rows:null,error:''}),[retry,setRetry]=useState(0);
  const key=`${kind}:${league}:${year}`;
  useEffect(()=>{
    if(view!=='activePlayers')return;
    let cancelled=false;setState(old=>old.key===key?{...old,error:''}:{key,rows:null,error:''});
    loadLeaders(kind,league,year,retry>0).then(rows=>!cancelled&&setState({key,rows,error:''})).catch(err=>!cancelled&&setState({key,rows:null,error:err.message}));
    return ()=>{cancelled=true};
  },[view,key,retry]);
  const rows=state.key===key?state.rows:null,error=state.key===key?state.error:'';
  const leagues=['AL','NL','MLB'],names={AL:t('美聯'),NL:t('國聯'),MLB:t('通算')};
  return <>
    <div className="active-leagues" role="radiogroup" aria-label={t('選擇聯盟')} onKeyDown={e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();const i=leagues.indexOf(league),next=leagues[e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3];
      actions.pickActiveLeague(next);e.currentTarget.querySelector(`[data-active-league="${next}"]`)?.focus();
    }}>{leagues.map(id=><button key={id} type="button" role="radio" data-active-league={id} aria-checked={league===id} tabIndex={league===id?0:-1} onClick={()=>actions.pickActiveLeague(id)}>{names[id]}</button>)}</div>
    <p className="active-ranking-note">{t('{year} 年 MLB 例行賽・僅列合格球員',{year})}<br/>{kind==='pitching'?t('ERA 由低至高；資格依 MLB 規定局數。'):t('OPS 由高至低；資格依 MLB 規定打席。')}{league==='MLB'&&<> {t('通算為美聯與國聯合併成績。')}</>}</p>
    {error&&<div className="subs-banner" role="alert">{t('現役球員資料讀取失敗：{error}',{error})} <button type="button" className="subs-link" onClick={()=>setRetry(n=>n+1)}>{t('重試')}</button></div>}
    {!rows&&!error&&<p className="subs-empty" role="status">{t('載入排行榜中…')}</p>}
    {rows?.length===0&&<p className="subs-empty">{t('目前沒有符合資格的球員')}</p>}
    {rows&&<div className="active-leader-list">{rows.map((p,i)=><PlayerCard key={p.id} player={p} kind={kind} rank={i+1}/>)}</div>}
  </>;
}
export function ActivePlayers(){
  const {view,activeTab:tab,activeLeague:league,activeTeamId}=useScoreboard();
  const team=teamById(activeTeamId);
  const ref=useSwipeNavigation(direction=>{if(team&&direction==='right')actions.closeActiveTeam()},view==='activePlayers'&&!!team);
  return <section ref={ref} className="card subs-shell active-shell swipe-navigation" aria-label={t('現役球員')}>
    {team?<TeamRoster key={team.id} team={team}/>:<>
      <div className="player-tabs active-tabs" role="tablist" aria-label={t('現役球員分類')} onKeyDown={e=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
        e.preventDefault();const i=tabIds.indexOf(tab),next=tabIds[e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3];
        actions.pickActiveTab(next);e.currentTarget.querySelector(`[data-active-tab="${next}"]`)?.focus();
      }}>{tabIds.map(id=><button key={id} type="button" role="tab" data-active-tab={id} id={`active-${id}-tab`} aria-controls="active-browse-panel" aria-selected={tab===id} tabIndex={tab===id?0:-1} onClick={()=>actions.pickActiveTab(id)}>{label(id)}</button>)}</div>
      <div id="active-browse-panel" role="tabpanel" aria-labelledby={`active-${tab}-tab`}>
        {tab==='teams'?<><p className="subs-intro">{t('選擇球隊查看 40 人名單。名單在開啟隊伍後才讀取；包含傷兵與下放名單內球員。')}</p><div className="active-team-grid">{MLB_TEAMS.map(item=><button type="button" key={item.id} className="active-team-card" onClick={()=>actions.openActiveTeam(item.id)}><span className="subs-logo"><img src={logo(item.id)} alt=""/></span><b>{teamLabel(item)}</b><small>{item.en}</small></button>)}</div></>:<Leaders kind={tab} league={league}/>}
      </div>
    </>}
  </section>;
}
