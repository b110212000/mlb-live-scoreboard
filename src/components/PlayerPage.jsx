import {useEffect,useState} from 'react';
import {useScoreboard,actions} from '../store.js';
import {teamById} from '../teams.js';
import {TAIWAN_PLAYER_NAMES} from '../taiwanPlayers.js';
import {logo} from './SubscriptionShared.jsx';
import {headshot,POSITION_ZH,POSITION_TYPE_ZH,countryZh,LEVEL_ZH,handsText,heightCm,weightKg,ageOn,majorAwards,seasonsText,teamNameZh} from '../players.js';

const API='https://statsapi.mlb.com/api/v1';
const BACK_LABEL={hof:'名人堂',taiwan:'台灣旅外',live:'即時比賽',standings:'戰績排行'};
const cache=new Map();

async function getJSON(url){
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error('HTTP '+response.status);
  return response.json();
}

// 依守備位置決定要看打擊或投球；另一項有足夠出賽時也一起列（例如 Babe Ruth 的投球、Martín Dihigo 的打擊）。
function statGroups(person,career){
  const abbr=person.primaryPosition?.abbreviation,type=person.primaryPosition?.type;
  if(abbr==='TWP')return ['hitting','pitching'];
  const pitched=Number(career.pitching?.gamesPlayed)||0,batted=Number(career.hitting?.gamesPlayed)||0;
  if(type==='Pitcher')return batted>=pitched+50?['pitching','hitting']:['pitching'];
  return pitched>=20?['hitting','pitching']:['hitting'];
}

// 一位球員只查需要的資料（個人、非大量使用）：基本資料 + 獎項 + 大聯盟生涯，以及含小聯盟的逐年成績。
async function loadPlayer(id){
  if(cache.has(id))return cache.get(id);
  const data=await getJSON(`${API}/people/${id}?hydrate=currentTeam,awards,stats(group=[hitting,pitching],type=[career])`);
  const person=data.people?.[0];
  if(!person)throw new Error('找不到這位球員');
  const career={};
  for(const stat of person.stats||[]){
    if(stat.type?.displayName==='career')career[stat.group?.displayName]=stat.splits?.[0]?.stat||null;
  }
  const groups=statGroups(person,career);
  const yearly={};
  await Promise.all(groups.map(async group=>{
    const stats=await getJSON(`${API}/people/${id}/stats?stats=yearByYear&group=${group}&leagueListId=mlb_milb`).catch(()=>({stats:[]}));
    // 只保留有球隊的列（去掉「小聯盟合計」與同層級多隊的合計列）；年份由舊到新。
    // 同一年保留 API 的順序：層級由低到高（新人 → 1A → … → 大聯盟），同層級轉隊依先後。
    yearly[group]=(stats.stats?.[0]?.splits||[])
      .filter(split=>split.team?.id&&split.sport?.abbreviation!=='Minors')
      .sort((a,b)=>Number(a.season)-Number(b.season));
  }));
  const result={person,groups,yearly,career};
  cache.set(id,result);
  return result;
}

const CAREER_TILES={
  hitting:s=>[['出賽',s.gamesPlayed],['安打',s.hits],['全壘打',s.homeRuns],['打點',s.rbi],['盜壘',s.stolenBases],['打擊率',s.avg],['上壘率',s.obp],['OPS',s.ops]],
  pitching:s=>[['出賽',s.gamesPlayed],['勝敗',`${s.wins??0}-${s.losses??0}`],['防禦率',s.era],['局數',s.inningsPitched],['三振',s.strikeOuts],['救援',s.saves],['WHIP',s.whip]]
};
const YEAR_COLUMNS={
  hitting:[['場','gamesPlayed'],['打數','atBats'],['安打','hits'],['全壘打','homeRuns'],['打點','rbi'],['盜壘','stolenBases'],['打擊率','avg'],['OPS','ops']],
  pitching:[['場','gamesPlayed'],['先發','gamesStarted'],['勝','wins'],['敗','losses'],['救援','saves'],['局數','inningsPitched'],['三振','strikeOuts'],['防禦率','era'],['WHIP','whip']]
};
const GROUP_ZH={hitting:'打擊',pitching:'投球'};

// 小聯盟球隊加上母隊體系，與台灣旅外頁一致（例：響尾蛇體系 · Reno Aces）。
function currentTeamText(team){
  if(teamById(team.id))return teamNameZh(team);
  const org=teamById(team.parentOrgId)?.name;
  return org?`${org}體系 · ${team.name}`:team.name||'';
}

function Facts({person}){
  const deceased=person.deathDate;
  const age=!deceased&&person.birthDate?ageOn(person.birthDate):null;
  const cm=heightCm(person.height),kg=weightKg(person.weight);
  const place=[countryZh(person.birthCountry),[person.birthCity,person.birthStateProvince].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const rows=[
    [deceased?'生卒':'生日',person.birthDate?(deceased?`${person.birthDate} – ${person.deathDate}`:`${person.birthDate}${age!=null?`（${age} 歲）`:''}`):''],
    ['出生地',place],
    ['身高體重',[cm?`${cm} 公分`:'',kg?`${kg} 公斤`:''].filter(Boolean).join(' · ')],
    ['大聯盟初登板',person.mlbDebutDate||''],
    ['最後出賽',!person.active?person.lastPlayedDate||'':''],
    ['選秀',person.draftYear?`${person.draftYear} 年`:'']
  ].filter(([,value])=>value);
  return <dl className="player-facts">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function PlayerPage(){
  const {view,playerId,playerFrom}=useScoreboard();
  const [loaded,setLoaded]=useState({id:null,data:null,error:''});
  useEffect(()=>{
    if(view!=='player'||!playerId)return;
    let cancelled=false;
    setLoaded(current=>current.id===playerId?current:{id:playerId,data:null,error:''});
    loadPlayer(playerId)
      .then(data=>{if(!cancelled)setLoaded({id:playerId,data,error:''})})
      .catch(err=>{if(!cancelled)setLoaded({id:playerId,data:null,error:'球員資料讀取失敗：'+err.message})});
    return ()=>{cancelled=true};
  },[view,playerId]);

  const from=playerFrom&&playerFrom!=='player'?playerFrom:'hof';
  const data=loaded.id===playerId?loaded.data:null;
  const person=data?.person;
  const awards=person?majorAwards(person.awards):[];
  const hof=awards.find(award=>award.label==='名人堂');
  const zh=person?TAIWAN_PLAYER_NAMES[person.id]:null;
  const team=person?.active?person.currentTeam:null;
  const hasMlb=data&&data.groups.some(group=>data.career[group]?.gamesPlayed);

  return <section className="card subs-shell player-shell" aria-label="球員資料">
    <button type="button" className="subs-link player-back" onClick={actions.closePlayer}>← 返回{BACK_LABEL[from]||''}</button>
    {!playerId&&<p className="subs-empty">請從名人堂或台灣旅外選擇球員。</p>}
    {loaded.error&&loaded.id===playerId&&<div className="subs-banner">{loaded.error}</div>}
    {playerId&&!data&&!loaded.error&&<p className="subs-empty">載入球員資料中…</p>}
    {person&&<>
      <header className="player-head">
        <img className="player-photo" src={headshot(person.id,360)} alt={person.fullName}/>
        <div className="player-title">
          <h2>{zh||person.fullName}{zh&&<small>{person.fullName}</small>}</h2>
          <p className="player-sub">{[person.primaryNumber?`#${person.primaryNumber}`:'',POSITION_ZH[person.primaryPosition?.abbreviation]||POSITION_TYPE_ZH[person.primaryPosition?.type]||'',handsText(person)].filter(Boolean).join(' · ')}</p>
          <div className="player-badges">
            {hof&&<span className="player-badge player-badge-hof">名人堂 {hof.seasons[0]||''}</span>}
            {person.active&&<span className="player-badge player-badge-active">現役</span>}
            {team&&<span className="player-badge player-badge-team"><span className="subs-logo small" aria-hidden="true"><img src={logo(teamById(team.id)?team.id:team.parentOrgId)} alt=""/></span>{currentTeamText(team)}</span>}
          </div>
        </div>
      </header>
      <Facts person={person}/>

      <section className="subs-section" aria-labelledby="playerCareerTitle">
        <div className="subs-section-head"><h3 id="playerCareerTitle">大聯盟生涯</h3></div>
        {hasMlb?data.groups.filter(group=>data.career[group]?.gamesPlayed).map(group=><div key={group} className="player-tiles" aria-label={GROUP_ZH[group]}>
          {data.groups.length>1&&<span className="player-tiles-label">{GROUP_ZH[group]}</span>}
          {CAREER_TILES[group](data.career[group]).map(([label,value])=><div key={label} className="player-tile"><b>{value??'-'}</b><span>{label}</span></div>)}
        </div>):<p className="subs-empty">{person.active?'尚未在大聯盟出賽':'沒有大聯盟出賽紀錄'}{data.groups.some(group=>data.yearly[group]?.length)?'，以下為小聯盟成績。':'。'}</p>}
      </section>

      {awards.length>0&&<section className="subs-section" aria-labelledby="playerAwardsTitle">
        <div className="subs-section-head"><h3 id="playerAwardsTitle">主要獎項</h3></div>
        <ul className="player-awards">{awards.map(award=><li key={award.label}>
          <b>{award.label}{award.count>1&&<em>×{award.count}</em>}</b>
          <small>{seasonsText(award.seasons)}</small>
        </li>)}</ul>
      </section>}

      {data.groups.map(group=>data.yearly[group]?.length?<section key={group} className="subs-section" aria-label={'逐年成績'+GROUP_ZH[group]}>
        <div className="subs-section-head"><h3>逐年成績{data.groups.length>1?`（${GROUP_ZH[group]}）`:''}</h3>{data.yearly[group].some(split=>split.sport?.abbreviation!=='MLB')&&<span>含小聯盟</span>}</div>
        <div className="standings-scroll">
          <table className="standings-table player-years">
            <thead><tr><th scope="col">年</th><th scope="col">層級</th><th scope="col" className="team-col">球隊</th>{YEAR_COLUMNS[group].map(([label])=><th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{data.yearly[group].map((split,i)=><tr key={i} className={split.sport?.abbreviation==='MLB'?'mlb':''}>
              <td>{split.season}</td><td>{LEVEL_ZH[split.sport?.abbreviation]||split.sport?.abbreviation||''}</td>
              <td className="team-col">{teamNameZh(split.team)}</td>
              {YEAR_COLUMNS[group].map(([label,key])=><td key={label}>{split.stat?.[key]??'-'}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </section>:null)}
    </>}
  </section>;
}
