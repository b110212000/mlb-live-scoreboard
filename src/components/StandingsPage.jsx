import {useEffect,useState} from 'react';
import {useScoreboard} from '../store.js';
import {teamById,teamLabel} from '../teams.js';
import {t} from '../i18n.js';
import {logo} from './SubscriptionShared.jsx';
import {LeagueSwitch,LeaguePager,savedLeague,saveLeague} from './LeagueSwitch.jsx';

const API='https://statsapi.mlb.com/api/v1';
const LEAGUE_KEY='mlb-standings-league';
const REFRESH_MS=10*60_000;
// MLB 分區 id → 聯盟與分區。
const DIVISION_INFO={201:['AL','E'],202:['AL','C'],200:['AL','W'],204:['NL','E'],205:['NL','C'],203:['NL','W']};
// 標籤在畫面重畫時才翻譯（跟著目前語言）。
const divisionOrder=()=>[['E',t('東區')],['C',t('中區')],['W',t('西區')]];
const clinchLegend=()=>[['z',t('全聯盟最佳戰績')],['y',t('分區冠軍')],['x',t('晉級季後賽')],['w',t('外卡晉級')],['e',t('已淘汰')]];
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
  return match[1]==='W'?t('{n} 連勝',{n:match[2]}):t('{n} 連敗',{n:match[2]});
}

function TeamCell({record,followed,rank}){
  const id=Number(record.team?.id);
  const team=teamById(id);
  return <th scope="row" className="team-col">
    {rank!=null&&<span className="standings-rank">{rank}</span>}
    <span className="subs-logo small" aria-hidden="true"><img src={logo(id)} alt=""/></span>
    <span className="standings-name">
      {followed.has(id)&&<span className="standings-star" aria-label={t('追蹤的球隊')}>★</span>}
      {teamLabel(team,{short:true})||record.team?.name}
      {record.clinchIndicator&&<sup className={'clinch clinch-'+record.clinchIndicator} title={clinchLegend().find(([k])=>k===record.clinchIndicator)?.[1]}>{record.clinchIndicator}</sup>}
    </span>
  </th>;
}

function StandingsTable({records,followed,gbKey,gbLabel,cutAfter,showRank=true}){
  return <div className="standings-scroll">
    <table className="standings-table">
      <thead><tr><th scope="col" className="team-col">{t('球隊')}</th><th scope="col">{t('勝')}</th><th scope="col">{t('敗')}</th><th scope="col">{t('勝率')}</th><th scope="col">{gbLabel}</th><th scope="col">{t('近10')}</th><th scope="col">{t('連續')}</th></tr></thead>
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
        if(!cancelled)setError(err.message);
      }
    };
    load();
    const timer=setInterval(load,REFRESH_MS);
    return ()=>{cancelled=true;clearInterval(timer)};
  },[view]);

  const panel=key=>{
    if(!data)return <p className="subs-empty">{error?t('戰績資料讀取失敗：{error}',{error}):t('載入戰績中…')}</p>;
    const divisions=data.division.filter(record=>leagueOf(record)===key);
    if(mode==='division'){
      return <div className="standings-group">{divisionOrder().map(([code,label])=>{
        const record=divisions.find(item=>DIVISION_INFO[item.division?.id]?.[1]===code);
        return record?<section key={code} className="standings-section" aria-label={label}>
          <h3>{label}</h3>
          <StandingsTable records={[...record.teamRecords].sort((a,b)=>Number(a.divisionRank)-Number(b.divisionRank))} followed={followed} gbKey="gamesBack" gbLabel={t('勝差')}/>
        </section>:null;
      })}</div>;
    }
    const leaders=divisions.map(record=>record.teamRecords.find(team=>String(team.divisionRank)==='1')).filter(Boolean)
      .sort((a,b)=>Number(b.winningPercentage)-Number(a.winningPercentage));
    const wild=(data.wildCard.find(record=>leagueOf(record)===key)?.teamRecords||[]).slice()
      .sort((a,b)=>Number(a.wildCardRank)-Number(b.wildCardRank));
    return <div className="standings-group">
      <section className="standings-section" aria-label={t('分區領先')}>
        <h3>{t('分區領先')}</h3>
        <StandingsTable records={leaders} followed={followed} gbKey="gamesBack" gbLabel={t('勝差')} showRank={false}/>
      </section>
      <section className="standings-section" aria-label={t('外卡')}>
        <h3>{t('外卡')}<small>{t('前 {n} 名晉級季後賽',{n:WILD_CARD_SPOTS})}</small></h3>
        <StandingsTable records={wild} followed={followed} gbKey="wildCardGamesBack" gbLabel={t('外卡差')} cutAfter={WILD_CARD_SPOTS}/>
      </section>
    </div>;
  };

  return <section className="card subs-shell standings-shell" aria-label={t('戰績排行')}>
    <p className="subs-intro">{data?t('{season} 年例行賽戰績，左右滑動可切換聯盟；每 10 分鐘更新。',{season:data.season}):t('例行賽戰績，左右滑動可切換聯盟；每 10 分鐘更新。')}{followed.size?t('★ 為追蹤的球隊。'):''}</p>
    {error&&data&&<div className="subs-banner">{t('戰績資料讀取失敗：{error}',{error})}</div>}
    <LeagueSwitch league={league} onPick={pick}/>
    <div className="standings-modes" role="tablist" aria-label={t('排行方式')}>
      {[['division',t('分區')],['wildcard',t('外卡')]].map(([id,label])=><button key={id} type="button" role="tab" aria-selected={mode===id} data-mode={id} onClick={()=>setMode(id)}>{label}</button>)}
    </div>
    <LeaguePager league={league} onPick={pick} renderPanel={panel}/>
    <p className="standings-legend">{clinchLegend().map(([key,label])=><span key={key}><sup className={'clinch clinch-'+key}>{key}</sup>{label}</span>)}</p>
  </section>;
}
