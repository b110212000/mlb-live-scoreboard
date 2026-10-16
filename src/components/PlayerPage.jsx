import {Fragment,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useScoreboard,actions} from '../store.js';
import {teamById,teamLabel} from '../teams.js';
import {TAIWAN_PLAYER_NAMES} from '../taiwanPlayers.js';
import {logo} from './SubscriptionShared.jsx';
import {headshot,positionName,positionTypeName,countryName,levelName,handsText,bodyText,dateText,ageOn,majorAwards,seasonsText,teamDisplayName,groupSeasons} from '../players.js';
import {loadWikiBio,wikiUrl} from '../wiki.js';
import {StatLabel} from './StatHelp.jsx';
import {STAT_FIELDS} from '../statGlossary.js';
import {t,tParts,lang} from '../i18n.js';

const API='https://statsapi.mlb.com/api/v1';
const backLabel=from=>({hof:t('名人堂'),taiwan:t('台灣旅外'),live:t('即時比賽'),standings:t('戰績排行')})[from]||'';
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
  if(!person)throw new Error(t('找不到這位球員'));
  const career={};
  for(const stat of person.stats||[]){
    if(stat.type?.displayName==='career')career[stat.group?.displayName]=stat.splits?.[0]?.stat||null;
  }
  const groups=statGroups(person,career);
  const yearly={};
  await Promise.all(groups.map(async group=>{
    const stats=await getJSON(`${API}/people/${id}/stats?stats=yearByYear&group=${group}&leagueListId=mlb_milb`).catch(()=>({stats:[]}));
    // 年份由舊到新，每年一列主要成績（大聯盟優先），同年其他紀錄收在 details。
    yearly[group]=groupSeasons(stats.stats?.[0]?.splits||[]);
  }));
  const result={person,groups,yearly,career};
  cache.set(id,result);
  return result;
}

// 標籤在畫面重畫時才翻譯（跟著目前語言）。
const careerTiles={
  hitting:s=>[[t('出賽'),s.gamesPlayed],[t('安打'),s.hits],[t('全壘打'),s.homeRuns],[t('打點'),s.rbi],[t('盜壘'),s.stolenBases],[t('打擊率'),s.avg],[t('上壘率'),s.obp],['OPS',s.ops]],
  pitching:s=>[[t('出賽'),s.gamesPlayed],[t('勝敗'),`${s.wins??0}-${s.losses??0}`],[t('防禦率'),s.era],[t('局數'),s.inningsPitched],[t('三振'),s.strikeOuts],[t('救援'),s.saves],['WHIP',s.whip]]
};
const yearColumns={
  hitting:()=>[[t('場'),'gamesPlayed'],[t('打數'),'atBats'],[t('安打'),'hits'],[t('全壘打'),'homeRuns'],[t('打點'),'rbi'],[t('盜壘'),'stolenBases'],[t('打擊率'),'avg'],['OPS','ops']],
  pitching:()=>[[t('場'),'gamesPlayed'],[t('先發'),'gamesStarted'],[t('勝'),'wins'],[t('敗'),'losses'],[t('救援'),'saves'],[t('局數'),'inningsPitched'],[t('三振'),'strikeOuts'],[t('防禦率'),'era'],['WHIP','whip']]
};
const groupName=group=>group==='pitching'?t('投球'):t('打擊');

// 逐年成績：每年一列（有大聯盟就顯示大聯盟，同年多隊顯示合計「N 隊」）；
// 同年的其他紀錄（小聯盟、各隊）收合，點那一年展開。
function YearTable({group,seasons}){
  const [open,setOpen]=useState(()=>new Set());
  const toggle=season=>setOpen(current=>{
    const next=new Set(current);
    if(next.has(season))next.delete(season);else next.add(season);
    return next;
  });
  const columns=yearColumns[group]();
  const statCells=split=>columns.map(([,key])=><td key={key}>{split.stat?.[key]??'-'}</td>);
  return <div className="standings-scroll">
    <table className="standings-table player-years">
      <thead><tr><th scope="col">{t('年')}</th><th scope="col">{t('層級')}</th><th scope="col" className="team-col">{t('球隊')}</th>{columns.map(([label,key])=><th key={key} scope="col"><StatLabel id={STAT_FIELDS[key]}>{label}</StatLabel></th>)}</tr></thead>
      <tbody>{seasons.flatMap(row=>{
        const more=row.details.length,expanded=more>0&&open.has(row.season);
        const toggleLabel=expanded?t('{year} 年，收合同年其他 {n} 筆紀錄',{year:row.season,n:more}):t('{year} 年，展開同年其他 {n} 筆紀錄',{year:row.season,n:more});
        // 整列可點；年份是按鈕（鍵盤也能操作，點擊冒泡到整列，只切換一次）。
        const main=<tr key={row.season} className={[row.level==='MLB'?'mlb':'',more?'has-more':'',expanded?'expanded':''].filter(Boolean).join(' ')} onClick={more?()=>toggle(row.season):undefined}>
          <td>{more
            ?<button type="button" className="year-toggle" aria-expanded={expanded} aria-label={toggleLabel}><span className="year-num">{row.season}</span><span className="year-more" aria-hidden="true">{expanded?'−':`+${more}`}</span></button>
            :<span className="year-num">{row.season}</span>}</td>
          <td>{levelName(row.level)}</td>
          <td className="team-col">{row.total?t('{n} 隊',{n:row.teams}):teamDisplayName(row.main.team)}</td>
          {statCells(row.main)}
        </tr>;
        if(!expanded)return [main];
        return [main,...row.details.map((split,i)=><tr key={`${row.season}-${i}`} className="sub">
          <td/><td>{levelName(split.sport?.abbreviation)}</td>
          <td className="team-col">{teamDisplayName(split.team)}</td>
          {statCells(split)}
        </tr>)];
      })}</tbody>
    </table>
  </div>;
}

// 小聯盟球隊加上母隊體系，與台灣旅外頁一致（例：響尾蛇體系 · Reno Aces）。
function currentTeamText(team){
  if(teamById(team.id))return teamDisplayName(team);
  const org=teamLabel(team.parentOrgId);
  return org?t('{org}體系 · {team}',{org,team:team.name}):team.name||'';
}

function Facts({person}){
  const deceased=person.deathDate;
  const age=!deceased&&person.birthDate?ageOn(person.birthDate):null;
  const place=[countryName(person.birthCountry),[person.birthCity,person.birthStateProvince].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const rows=[
    [deceased?t('生卒'):t('生日'),person.birthDate?(deceased?`${dateText(person.birthDate)} – ${dateText(person.deathDate)}`:<>{dateText(person.birthDate)}{age!=null&&<><wbr/><span className="player-fact-age">{t('（{n} 歲）',{n:age})}</span></>}</>):''],
    [t('出生地'),place],
    [t('身高體重'),bodyText(person)],
    [t('大聯盟初登板'),dateText(person.mlbDebutDate)],
    [t('最後出賽'),!person.active?dateText(person.lastPlayedDate):''],
    [t('選秀'),person.draftYear?t('{year} 年',{year:person.draftYear}):'']
  ].filter(([,value])=>value);
  return <dl className="player-facts">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

const WIKI_LANG={zh:'zh-Hant-TW',en:'en',ja:'ja'};

// 生平：維基百科條目導言，放在球員頁最下方；必須標示條目、作者（維基百科貢獻者）與 CC BY-SA 4.0 授權。
// 依介面語言取中文 / 英文 / 日文維基；維基百科沒有這個人時整段不顯示。
function WikiBio({person,visible,uiLang}){
  const [state,setState]=useState({id:null,bio:undefined,error:''});
  const [expanded,setExpanded]=useState(false);
  const [clamp,setClamp]=useState(true);
  const textRef=useRef(null);
  const key=`${uiLang}:${person.id}`;
  useEffect(()=>{
    let cancelled=false;
    setState({id:key,bio:undefined,error:''});setExpanded(false);setClamp(true);
    loadWikiBio(person)
      .then(bio=>{if(!cancelled)setState({id:key,bio,error:''})})
      .catch(err=>{if(!cancelled)setState({id:key,bio:null,error:t('維基百科資料讀取失敗：{error}',{error:err.message})})});
    return ()=>{cancelled=true};
  },[person,key]);
  const bio=state.id===key?state.bio:undefined;
  // 內容放得下就不收合；頁面隱藏時量不到高度，等顯示時再量。
  useLayoutEffect(()=>{
    const el=textRef.current;
    if(!el||!visible||expanded||!el.clientHeight)return;
    setClamp(el.scrollHeight>el.clientHeight+2);
  },[bio,visible,expanded]);
  if(bio===null&&!state.error)return null;
  const credit=bio&&tParts('以上摘自維基百科〈{title}〉條目導言，由維基百科貢獻者撰寫，依 {license} 授權。',{
    title:<a href={wikiUrl(bio)} target="_blank" rel="noopener">{bio.displayTitle}</a>,
    license:<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>
  });
  return <section className="subs-section player-wiki" aria-labelledby="playerWikiTitle">
    <div className="subs-section-head"><h3 id="playerWikiTitle">{t('生平')}</h3><span>{t('維基百科')}</span></div>
    {bio===undefined&&!state.error&&<p className="player-wiki-note">{t('載入維基百科資料中…')}</p>}
    {state.error&&<p className="player-wiki-note">{state.error}</p>}
    {bio&&<>
      {bio.lang!==uiLang&&<p className="player-wiki-note">{t('中文維基百科沒有這個條目，以下為英文維基百科的介紹。')}</p>}
      <div ref={textRef} className={'player-wiki-text'+(clamp&&!expanded?' clamp':'')} lang={WIKI_LANG[bio.lang]}>
        {bio.paragraphs.map((text,i)=><p key={i}>{text}</p>)}
      </div>
      {clamp&&<button type="button" className="subs-link player-wiki-toggle" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?t('收合'):t('展開全文')}</button>}
      <p className="player-wiki-credit">{credit.map((part,i)=><Fragment key={i}>{part}</Fragment>)}</p>
    </>}
  </section>;
}

function careerNote(person,hasMinors){
  if(person.active)return hasMinors?t('尚未在大聯盟出賽，以下為小聯盟成績。'):t('尚未在大聯盟出賽。');
  return hasMinors?t('沒有大聯盟出賽紀錄，以下為小聯盟成績。'):t('沒有大聯盟出賽紀錄。');
}

export function PlayerPage(){
  const {view,playerId,playerFrom,lang:uiLang}=useScoreboard();
  const [loaded,setLoaded]=useState({id:null,data:null,error:''});
  useEffect(()=>{
    if(view!=='player'||!playerId)return;
    let cancelled=false;
    setLoaded(current=>current.id===playerId?current:{id:playerId,data:null,error:''});
    loadPlayer(playerId)
      .then(data=>{if(!cancelled)setLoaded({id:playerId,data,error:''})})
      .catch(err=>{if(!cancelled)setLoaded({id:playerId,data:null,error:err.message})});
    return ()=>{cancelled=true};
  },[view,playerId]);

  const from=playerFrom&&playerFrom!=='player'?playerFrom:'hof';
  const data=loaded.id===playerId?loaded.data:null;
  const person=data?.person;
  const awards=person?majorAwards(person.awards):[];
  const hof=awards.find(award=>award.key==='MLBHOF');
  // 台灣球員：中文與日文介面顯示中文（漢字）姓名，英文介面只顯示英文名。
  const localName=person&&lang()!=='en'?TAIWAN_PLAYER_NAMES[person.id]:null;
  const team=person?.active?person.currentTeam:null;
  const hasMlb=data&&data.groups.some(group=>data.career[group]?.gamesPlayed);

  return <section className="card subs-shell player-shell" aria-label={t('球員資料')}>
    <button type="button" className="subs-link player-back" onClick={actions.closePlayer}>{t('← 返回{page}',{page:backLabel(from)})}</button>
    {!playerId&&<p className="subs-empty">{t('請從名人堂或台灣旅外選擇球員。')}</p>}
    {loaded.error&&loaded.id===playerId&&<div className="subs-banner">{t('球員資料讀取失敗：{error}',{error:loaded.error})}</div>}
    {playerId&&!data&&!loaded.error&&<p className="subs-empty">{t('載入球員資料中…')}</p>}
    {person&&<>
      <header className="player-head">
        <img className="player-photo" src={headshot(person.id,360)} alt={person.fullName}/>
        <div className="player-title">
          <h2>{localName||person.fullName}{localName&&<small>{person.fullName}</small>}</h2>
          <p className="player-sub">{[person.primaryNumber?`#${person.primaryNumber}`:'',positionName(person.primaryPosition?.abbreviation)||positionTypeName(person.primaryPosition?.type),handsText(person)].filter(Boolean).join(' · ')}</p>
          <div className="player-badges">
            {hof&&<span className="player-badge player-badge-hof">{t('名人堂 {year}',{year:hof.seasons[0]||''}).trim()}</span>}
            {person.active&&<span className="player-badge player-badge-active">{t('現役')}</span>}
            {team&&<span className="player-badge player-badge-team"><span className="subs-logo small" aria-hidden="true"><img src={logo(teamById(team.id)?team.id:team.parentOrgId)} alt=""/></span>{currentTeamText(team)}</span>}
          </div>
        </div>
      </header>
      <Facts person={person}/>

      <section className="subs-section" aria-labelledby="playerCareerTitle">
        <div className="subs-section-head"><h3 id="playerCareerTitle">{t('大聯盟生涯')}</h3></div>
        {hasMlb?data.groups.filter(group=>data.career[group]?.gamesPlayed).map(group=><div key={group} className="player-tiles" aria-label={groupName(group)}>
          {data.groups.length>1&&<span className="player-tiles-label">{groupName(group)}</span>}
          {careerTiles[group](data.career[group]).map(([label,value],i)=><div key={label} className="player-tile"><b>{value??'-'}</b><span><StatLabel id={(group==='hitting'?['G','H','HR','RBI','SB','AVG','OBP','OPS']:['G',null,'ERA','IP','K',null,'WHIP'])[i]}>{label}</StatLabel></span></div>)}
        </div>):<p className="subs-empty">{careerNote(person,data.groups.some(group=>data.yearly[group]?.length))}</p>}
      </section>

      {awards.length>0&&<section className="subs-section" aria-labelledby="playerAwardsTitle">
        <div className="subs-section-head"><h3 id="playerAwardsTitle">{t('主要獎項')}</h3></div>
        <ul className="player-awards">{awards.map(award=><li key={award.key}>
          <b>{award.label}{award.count>1&&<em>×{award.count}</em>}</b>
          <small>{seasonsText(award.seasons)}</small>
        </li>)}</ul>
      </section>}

      {data.groups.map(group=>data.yearly[group]?.length?<section key={group} className="subs-section" aria-label={t('逐年成績（{group}）',{group:groupName(group)})}>
        <div className="subs-section-head"><h3>{data.groups.length>1?t('逐年成績（{group}）',{group:groupName(group)}):t('逐年成績')}</h3>{data.yearly[group].some(row=>row.level!=='MLB'||row.details.some(split=>split.sport?.abbreviation!=='MLB'))&&<span>{t('含小聯盟')}</span>}</div>
        <YearTable key={`${person.id}-${group}`} group={group} seasons={data.yearly[group]}/>
      </section>:null)}

      <WikiBio person={person} visible={view==='player'} uiLang={uiLang}/>
    </>}
  </section>;
}
