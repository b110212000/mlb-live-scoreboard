import {memo,useEffect,useState,useRef} from 'react';
import {useScoreboard,actions} from '../store.js';
import {t} from '../i18n.js';
const logo=id=>id?`https://www.mlbstatic.com/team-logos/${id}.svg`:undefined;
// 沒有球隊資料或隊徽載入失敗時顯示本機 SVG；球隊切換以 key 重建，重新嘗試新隊徽。
export function TeamLogo({id,team,label}){
  const [failed,setFailed]=useState(false);
  const src=logo(team.id);
  if(src&&!failed)return <img id={id} className="logo" src={src} data-team-id={team.id} alt={label} onError={()=>setFailed(true)}/>;
  return <svg id={id} className="logo logo-fallback" data-team-id={team.id||''} viewBox="0 0 64 64" role="img" aria-label={label}>
    <circle cx="32" cy="32" r="29" fill="#fff" stroke="#cbd5e1" strokeWidth="2"/>
    <g fill="none" stroke="#dc4655" strokeWidth="2" strokeLinecap="round">
      <path d="M15 9c14 12 14 34 0 46M49 9C35 21 35 43 49 55"/>
      <path d="m18 15 5-2m-1 9 5-1m-3 9h5m-5 8 5 1m-7 7 5 2m-9 4 5 3m23-39-5-2m1 9-5-1m3 9h-5m5 8-5 1m7 7-5 2m9 4-5 3"/>
    </g>
  </svg>;
}
// Stable host: Push integration owns only this button's subscription state.
// aria-label / title 由 notifications.js 依訂閱狀態更新；只在 lang 改變時重畫（relocalize 會再依狀態更新）。
const WatchButton=memo(function WatchButton(){return <button id="gameWatchBtn" className="game-watch-button" type="button" aria-pressed="false" aria-label={t('訂閱這場比賽通知')} title={t('訂閱這場比賽通知')} hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg></button>});
export function Scoreboard(){
  const {score,emptyDate,subs,lang}=useScoreboard();
  const followed=new Set(subs.teams);
  const favStar=side=>followed.has(Number(team(side).id))?<span className="logo-fav" title={t('追蹤的球隊')} aria-label={t('追蹤的球隊')}>★</span>:null;
  const team=side=>score?.[side]||{};
  const rhe=side=>{const t=team(side);return `R ${t.runs??0} · H ${t.hits??0} · E ${t.errors??0}`};
  return <section className="card hero">
    <div className="statusline"><div><span id="seriesText">{score?.series||(emptyDate?t('{date} 沒有 MLB 賽事',{date:emptyDate.replace(/-/g,'/')}):t('等待載入賽事'))}</span><span id="statePill" className="pill">{score?.status||(emptyDate?'NO GAME':'--')}</span></div><div className="hero-status-right"><div id="inningText" className="inning">{score?.inning||'--'}</div><button id="heroRosterBtn" className="matchup-roster-btn" type="button" onClick={()=>actions.navigate('roster')}>{t('對戰名單')}</button></div></div>
    <div className="teams"><div className="team"><span className="logo-shell">{favStar('away')}<TeamLogo key={team('away').id||'empty'} id="awayLogo" team={team('away')} label={team('away').name||t('客隊')}/></span><div><div id="awayName" className="team-name">{team('away').name||t('客隊')}</div><div id="awayRhe" className="team-sub">{rhe('away')}</div></div></div>
      <div className="score-center"><WatchButton lang={lang}/><div id="bigScore" className="bigscore"><span>{team('away').runs??0}</span><span>{team('home').runs??0}</span></div></div>
      <div className="team home"><div><div id="homeName" className="team-name">{team('home').name||t('主隊')}</div><div id="homeRhe" className="team-sub">{rhe('home')}</div></div><span className="logo-shell">{favStar('home')}<TeamLogo key={team('home').id||'empty'} id="homeLogo" team={team('home')} label={team('home').name||t('主隊')}/></span></div>
    </div>
  </section>;
}
// 追蹤球隊的比賽加上星號並排在前面（其餘維持開賽時間順序）。
// 例行賽一天最多 15 場：比賽多時可展開成格狀一次看完（記住使用者的選擇）。
const GRID_KEY='mlb-game-tabs-grid';
export function GameTabs(){
  const {games,selectedGamePk,subs}=useScoreboard();
  const [grid,setGrid]=useState(()=>{try{return localStorage.getItem(GRID_KEY)==='1'}catch(_){return false}});
  const followed=new Set(subs.teams);
  const isFollowed=g=>followed.has(g.awayId)||followed.has(g.homeId);
  const ordered=[...games.filter(isFollowed),...games.filter(g=>!isFollowed(g))];
  const canGrid=games.length>4;
  const toggleGrid=()=>setGrid(current=>{
    const next=!current;
    try{localStorage.setItem(GRID_KEY,next?'1':'0')}catch(_){}
    return next;
  });
  // 切換按鈕放在可橫向捲動的列表外面，捲動到後面的場次時也看得到。
  return <><div id="gameTabs" className={canGrid&&grid?'grid':undefined}>{ordered.map(g=>{
    const fav=isFollowed(g);
    return <button type="button" key={g.gamePk} className={'game-tab '+(g.gamePk===selectedGamePk?'active':'')+(fav?' followed':'')} title={fav?t('追蹤的球隊'):undefined} onClick={()=>actions.selectGame(g.gamePk)}>
      <span className="game-tab-main">{fav&&<span className="game-tab-star" aria-label={t('追蹤的球隊')}>★</span>}{g.label}</span><span className="game-tab-time">{g.time}</span>
    </button>;
  })}</div>{canGrid&&<button type="button" className="game-tabs-toggle" aria-expanded={grid} aria-controls="gameTabs" onClick={toggleGrid}>{grid?t('收合列表'):t('全部 {n} 場',{n:games.length})}</button>}</>;
}
export function ErrorMessage(){const {error}=useScoreboard();return <div id="errorBox" className="error" style={{display:error?'block':'none'}} role="alert">{error}</div>}
function HighlightIcon({item,className}){return item.teamId?<span className={className+' highlight-team-logo-shell'} aria-hidden="true"><img className="highlight-team-logo" src={logo(item.teamId)} alt=""/></span>:<span className={className}>{item.icon}</span>}
export function Highlights(){
  const {highlights:list,highlightGamePk:gamePk}=useScoreboard();
  const [expanded,setExpanded]=useState(false),[selection,setSelection]=useState({gamePk:null,id:null,index:0});
  const [visible,setVisible]=useState(!document.hidden);
  const sameGame=selection.gamePk===gamePk;
  const retained=sameGame?list.findIndex(x=>x.id===selection.id):-1;
  const index=retained>=0?retained:(sameGame?selection.index:0)%Math.max(1,list.length),item=list[index];
  const rotating=list.length>1&&!expanded&&visible;
  const latest=useRef({list,index,gamePk});latest.current={list,index,gamePk};
  const itemKey=JSON.stringify([gamePk,item?.id,item?.title,item?.desc,item?.teamId,rotating]);
  useEffect(()=>{setExpanded(false)},[gamePk]);
  useEffect(()=>{const handler=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',handler);return ()=>document.removeEventListener('visibilitychange',handler)},[]);
  // Keep this clock independent of polling. Identical feed refreshes do not restart animation.
  useEffect(()=>{if(!rotating)return;const timer=setTimeout(()=>{const {list,index,gamePk}=latest.current;const next=(index+1)%list.length;setSelection({gamePk,id:list[next]?.id,index:next})},5000);return ()=>clearTimeout(timer)},[itemKey]);
  return <section className="card highlights-card" aria-label={t('本場焦點')}>
    <div className="highlights-topline"><span className="highlights-label">{t('🔥 本場焦點')}</span><button id="highlightsToggle" className="highlights-toggle" type="button" aria-controls="gameHighlights" aria-expanded={expanded} aria-label={expanded?t('收合全部本場焦點'):t('展開全部本場焦點')} onClick={()=>setExpanded(x=>!x)}><span className="highlight-chevron" aria-hidden="true">⌄</span></button></div>
    <div className="highlight-ticker-row"><div id="highlightTicker" className="highlight-ticker" aria-live="off"><div key={itemKey} className={'highlight-ticker-slide'+(rotating?' is-rotating':'')}><div className="highlight-ticker-title">{item&&<HighlightIcon item={item} className="highlight-ticker-icon"/>}<span>{item?.title||t('等待焦點事件')}</span></div><div className="highlight-ticker-desc">{item?.desc||t('目前還沒有符合條件的焦點事件')}</div></div></div><span id="highlightCounter" className="highlight-counter">{list.length?index+1:0} / {list.length}</span></div>
    <div id="gameHighlights" className="highlights-grid" hidden={!expanded}>{list.length?list.map(x=><article key={x.id} className={'highlight-item '+(x.tone||'')+(x.half==='top'?' top-half':x.half==='bottom'?' bottom-half':'')}><div className="highlight-top"><HighlightIcon item={x} className="highlight-icon"/><div className="highlight-title">{x.title}</div></div><div className="highlight-desc">{x.desc}</div>{x.meta&&<div className="highlight-meta">{x.meta}</div>}</article>):<div className="empty">{t('目前還沒有符合條件的焦點事件')}</div>}</div>
  </section>;
}
