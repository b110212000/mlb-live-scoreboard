import {useEffect,useState} from 'react';
import {useScoreboard} from '../store.js';
import {teamById} from '../teams.js';
import {logo} from './SubscriptionShared.jsx';
import {LeagueSwitch,LeaguePager,savedLeague,saveLeague} from './LeagueSwitch.jsx';

const API='https://statsapi.mlb.com/api/v1';
const LEAGUE_KEY='mlb-standings-league';
const REFRESH_MS=10*60_000;
// MLB 分區 id → 聯盟與分區。
const DIVISION_INFO={201:['AL','E'],202:['AL','C'],200:['AL','W'],204:['NL','E'],205:['NL','C'],203:['NL','W']};
const DIVISION_ORDER=[['E','東區'],['C','中區'],['W','西區']];
const CLINCH_LEGEND=[['z','全聯盟最佳戰績'],['y','分區冠軍'],['x','晉級季後賽'],['w','外卡晉級'],['e','已淘汰']];
const WILD_CARD_SPOTS=3;

async function getJSON(url){
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error('HTTP '+response.status);
  return response.json();
}

async function fetchStandings(season){
  const [division,wildCard]=await Promise.all([
    getJSON(`${API}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`),
    getJSON(`${API}/standings?leagueId=103,104&season=${season}&standingsTypes=wildCard`)
  ]);
  return {season,division:division.records||[],wildCard:wildCard.records||[]};
}

const played=records=>records.some(record=>(record.teamRecords||[]).some(team=>Number(team.gamesPlayed)>0));
const leagueOf=record=>Number(record.league?.id)===103?'AL':Number(record.league?.id)===104?'NL':DIVISION_INFO[record.division?.id]?.[0];

function streakZh(code){
  const match=String(code||'').match(/^([WL])(\d+)$/);
  if(!match)return '-';
  return `${match[2]} 連${match[1]==='W'?'勝':'敗'}`;
}

function TeamCell({record,followed,rank}){
  const id=Number(record.team?.id);
  const team=teamById(id);
  return <th scope="row" className="team-col">
    {rank!=null&&<span className="standings-rank">{rank}</span>}
    <span className="subs-logo small" aria-hidden="true"><img src={logo(id)} alt=""/></span>
    <span className="standings-name">
      {followed.has(id)&&<span className="standings-star" aria-label="追蹤的球隊">★</span>}
      {team?.name||record.team?.name}
      {record.clinchIndicator&&<sup className={'clinch clinch-'+record.clinchIndicator} title={CLINCH_LEGEND.find(([k])=>k===record.clinchIndicator)?.[1]}>{record.clinchIndicator}</sup>}
    </span>
  </th>;
}

function StandingsTable({records,followed,gbKey,gbLabel,cutAfter,showRank=true}){
  return <div className="standings-scroll">
    <table className="standings-table">
      <thead><tr><th scope="col" className="team-col">球隊</th><th scope="col">勝</th><th scope="col">敗</th><th scope="col">勝率</th><th scope="col">{gbLabel}</th><th scope="col">近10</th><th scope="col">連續</th></tr></thead>
      <tbody>{records.map((record,i)=>{
        const lastTen=record.records?.splitRecords?.find(split=>split.type==='lastTen');
        const rank=showRank?(gbKey==='wildCardGamesBack'?record.wildCardRank:record.divisionRank):null;
        return <tr key={record.team?.id} data-team-id={record.team?.id} className={(followed.has(Number(record.team?.id))?'followed ':'')+(cutAfter&&i===cutAfter-1?'cutline':'')}>
          <TeamCell record={record} followed={followed} rank={rank}/>
          <td>{record.wins}</td><td>{record.losses}</td><td>{record.winningPercentage}</td>
          <td>{record[gbKey]??'-'}</td><td>{lastTen?`${lastTen.wins}-${lastTen.losses}`:'-'}</td><td>{streakZh(record.streak?.streakCode)}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

export function StandingsPage(){
  const {view,subs}=useScoreboard();
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const [league,setLeague]=useState(()=>savedLeague(LEAGUE_KEY));
  const [mode,setMode]=useState('division');
  const followed=new Set(subs.teams);
  const pick=key=>{setLeague(key);saveLeague(LEAGUE_KEY,key)};

  useEffect(()=>{
    if(view!=='standings')return;
    let cancelled=false;
    const load=async()=>{
      try{
        // 開季前（今年還沒有比賽）顯示上一季的最終戰績。
        let season=new Date().getFullYear();
        let next=await fetchStandings(season);
        if(!played(next.division)){season-=1;next=await fetchStandings(season);}
        if(!cancelled){setData(next);setError('');}
      }catch(err){
        if(!cancelled)setError('戰績資料讀取失敗：'+err.message);
      }
    };
    load();
    const timer=setInterval(load,REFRESH_MS);
    return ()=>{cancelled=true;clearInterval(timer)};
  },[view]);

  const panel=key=>{
    if(!data)return <p className="subs-empty">{error||'載入戰績中…'}</p>;
    const divisions=data.division.filter(record=>leagueOf(record)===key);
    if(mode==='division'){
      return <div className="standings-group">{DIVISION_ORDER.map(([code,label])=>{
        const record=divisions.find(item=>DIVISION_INFO[item.division?.id]?.[1]===code);
        return record?<section key={code} className="standings-section" aria-label={label}>
          <h3>{label}</h3>
          <StandingsTable records={[...record.teamRecords].sort((a,b)=>Number(a.divisionRank)-Number(b.divisionRank))} followed={followed} gbKey="gamesBack" gbLabel="勝差"/>
        </section>:null;
      })}</div>;
    }
    const leaders=divisions.map(record=>record.teamRecords.find(team=>String(team.divisionRank)==='1')).filter(Boolean)
      .sort((a,b)=>Number(b.winningPercentage)-Number(a.winningPercentage));
    const wild=(data.wildCard.find(record=>leagueOf(record)===key)?.teamRecords||[]).slice()
      .sort((a,b)=>Number(a.wildCardRank)-Number(b.wildCardRank));
    return <div className="standings-group">
      <section className="standings-section" aria-label="分區領先">
        <h3>分區領先</h3>
        <StandingsTable records={leaders} followed={followed} gbKey="gamesBack" gbLabel="勝差" showRank={false}/>
      </section>
      <section className="standings-section" aria-label="外卡">
        <h3>外卡<small>前 {WILD_CARD_SPOTS} 名晉級季後賽</small></h3>
        <StandingsTable records={wild} followed={followed} gbKey="wildCardGamesBack" gbLabel="外卡差" cutAfter={WILD_CARD_SPOTS}/>
      </section>
    </div>;
  };

  return <section className="card subs-shell standings-shell" aria-label="戰績排行">
    <p className="subs-intro">{data?`${data.season} 年例行賽戰績`:'例行賽戰績'}，左右滑動可切換聯盟；每 10 分鐘更新。{followed.size?'★ 為追蹤的球隊。':''}</p>
    {error&&data&&<div className="subs-banner">{error}</div>}
    <LeagueSwitch league={league} onPick={pick}/>
    <div className="standings-modes" role="tablist" aria-label="排行方式">
      {[['division','分區'],['wildcard','外卡']].map(([id,label])=><button key={id} type="button" role="tab" aria-selected={mode===id} data-mode={id} onClick={()=>setMode(id)}>{label}</button>)}
    </div>
    <LeaguePager league={league} onPick={pick} renderPanel={panel}/>
    <p className="standings-legend">{CLINCH_LEGEND.map(([key,label])=><span key={key}><sup className={'clinch clinch-'+key}>{key}</sup>{label}</span>)}</p>
  </section>;
}
