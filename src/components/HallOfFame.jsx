import {useEffect,useMemo,useState} from 'react';
import {useScoreboard,actions} from '../store.js';
import {teamById,teamLabel} from '../teams.js';
import {logo} from './SubscriptionShared.jsx';
import {headshot,positionName,positionTypeName,hofNoteText,foldText} from '../players.js';
import {t} from '../i18n.js';

const API='https://statsapi.mlb.com/api/v1';
// MLB 把以總教練、裁判、經營者或先驅身分入選的人，守備位置標為 Unknown（X）。
const CATEGORY_KEYS=['all','Pitcher','Catcher','Infielder','Outfielder','Hitter','Unknown'];
const categoryLabel=key=>({all:t('全部'),Pitcher:t('投手'),Catcher:t('捕手'),Infielder:t('內野手'),Outfielder:t('外野手'),Hitter:t('指定打擊'),Unknown:t('非球員')})[key];
let request=null;

// 名人堂名單一年只變一次，整個工作階段只抓一次（失敗時下次再試）。
function loadHallOfFame(){
  request||=fetchHallOfFame().catch(err=>{request=null;throw err});
  return request;
}

// 只存原始資料；位置、隊名、說明在畫面重畫時依目前語言產生。搜尋涵蓋各語言的隊名。
async function fetchHallOfFame(){
  const response=await fetch(`${API}/awards/MLBHOF/recipients`);
  if(!response.ok)throw new Error('HTTP '+response.status);
  const data=await response.json();
  return (data.awards||[]).filter(entry=>entry.player?.id).map(entry=>{
    const position=entry.player.primaryPosition||{};
    const category=CATEGORY_KEYS.includes(position.type)&&position.type!=='all'?position.type:'Unknown';
    const team=teamById(entry.team?.id);
    const name=entry.player.nameFirstLast||'';
    return {
      id:entry.player.id,name,season:Number(entry.season)||0,category,team,
      abbr:position.abbreviation,type:position.type,notes:entry.notes,
      search:foldText([name,team?.name,team?.en,team?.ja,team?.abbr].filter(Boolean).join(' '))
    };
  });
}

function HofCard({item}){
  const position=item.category==='Unknown'?t('非球員'):positionName(item.abbr)||positionTypeName(item.type);
  const note=hofNoteText(item.notes);
  return <button type="button" className="hof-card" data-player-id={item.id} onClick={()=>actions.openPlayer(item.id)}>
    <img className="hof-photo" src={headshot(item.id,120)} alt="" loading="lazy"/>
    <span className="hof-info">
      <b className="hof-name">{item.name}</b>
      <span className="hof-meta">
        {item.team&&<span className="subs-logo small" aria-hidden="true"><img src={logo(item.team.id)} alt="" loading="lazy"/></span>}
        <span>{[position,teamLabel(item.team)].filter(Boolean).join(' · ')}</span>
      </span>
      {note&&<small className="hof-note">{note}</small>}
    </span>
    <span className="hof-arrow" aria-hidden="true">›</span>
  </button>;
}

export function HallOfFame(){
  const {view}=useScoreboard();
  const [items,setItems]=useState(null);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('all');
  const [decade,setDecade]=useState('all');

  useEffect(()=>{
    if(view!=='hof'||items)return;
    let cancelled=false;
    setError('');
    loadHallOfFame()
      .then(next=>{if(!cancelled)setItems(next)})
      .catch(err=>{if(!cancelled)setError(err.message)});
    return ()=>{cancelled=true};
  },[view,items,attempt]);

  const decades=useMemo(()=>[...new Set((items||[]).map(item=>Math.floor(item.season/10)*10))].sort((a,b)=>b-a),[items]);
  const words=foldText(query).split(/\s+/).filter(Boolean);
  // 依年代與搜尋篩選後，再算各身分人數（身分按鈕上的數字）。
  const matched=(items||[]).filter(item=>(decade==='all'||Math.floor(item.season/10)*10===Number(decade))&&words.every(word=>item.search.includes(word)));
  const counts={all:matched.length};
  for(const item of matched)counts[item.category]=(counts[item.category]||0)+1;
  const shown=category==='all'?matched:matched.filter(item=>item.category===category);
  const groups=[];
  for(const item of [...shown].sort((a,b)=>b.season-a.season||a.name.localeCompare(b.name))){
    if(groups.at(-1)?.season!==item.season)groups.push({season:item.season,items:[]});
    groups.at(-1).items.push(item);
  }
  const years=items?.length?`${Math.min(...items.map(item=>item.season))}–${Math.max(...items.map(item=>item.season))}`:'';
  const filtered=query||category!=='all'||decade!=='all';

  return <section className="card subs-shell hof-shell" aria-label={t('名人堂')}>
    <p className="subs-intro">{items?t('美國棒球名人堂（Cooperstown）{years} 年的入選者，共 {n} 人。',{years,n:items.length}):t('美國棒球名人堂（Cooperstown）歷年入選者。')}{t('點選人物可看生涯成績與主要獎項；「非球員」為以總教練、裁判、經營者或先驅身分入選。資料來自 MLB 官方。')}</p>
    {error&&<div className="subs-banner">{t('名人堂資料讀取失敗：{error}',{error})} <button type="button" className="subs-link" onClick={()=>setAttempt(n=>n+1)}>{t('重試')}</button></div>}
    {!items&&!error&&<p className="subs-empty">{t('載入名人堂中…')}</p>}
    {items&&<>
      <div className="hof-filters">
        <input type="search" className="hof-search" value={query} onChange={event=>setQuery(event.target.value)} placeholder={t('搜尋姓名或球隊')} aria-label={t('搜尋姓名或球隊')} enterKeyHint="search"/>
        <select className="hof-decade" value={decade} onChange={event=>setDecade(event.target.value)} aria-label={t('入選年代')}>
          <option value="all">{t('全部年代')}</option>
          {decades.map(value=><option key={value} value={value}>{t('{decade} 年代',{decade:value})}</option>)}
        </select>
      </div>
      <div className="hof-cats" role="group" aria-label={t('身分')}>
        {CATEGORY_KEYS.map(key=><button key={key} type="button" data-category={key} aria-pressed={category===key} onClick={()=>setCategory(key)}>
          {categoryLabel(key)}<small>{counts[key]||0}</small>
        </button>)}
      </div>
      {filtered&&<p className="hof-result">{t('符合 {n} 人',{n:shown.length})}{' '}<button type="button" className="subs-link" onClick={()=>{setQuery('');setCategory('all');setDecade('all')}}>{t('清除篩選')}</button></p>}
      {!groups.length&&<p className="subs-empty">{t('沒有符合條件的名人堂成員。')}</p>}
      {groups.map(group=><section key={group.season} className="subs-section hof-year" aria-label={t('{year} 年入選',{year:group.season})}>
        <div className="subs-section-head"><h3>{t('{year} 年',{year:group.season})}</h3><span>{t('{n} 人',{n:group.items.length})}</span></div>
        <div className="hof-list">{group.items.map(item=><HofCard key={item.id} item={item}/>)}</div>
      </section>)}
    </>}
  </section>;
}
