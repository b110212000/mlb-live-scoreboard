import {memo,useEffect,useState,useRef} from 'react';
import {useScoreboard,actions} from '../store.js';
const logo=id=>id?`https://www.mlbstatic.com/team-logos/${id}.svg`:undefined;
// Stable host: Push integration owns only this button's subscription state.
const WatchButton=memo(function WatchButton(){return <button id="gameWatchBtn" className="game-watch-button" type="button" aria-pressed="false" aria-label="訂閱這場比賽通知" title="訂閱這場比賽通知" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg></button>});
export function Scoreboard(){
  const {score,emptyDate}=useScoreboard();
  const team=side=>score?.[side]||{};
  const rhe=side=>{const t=team(side);return `R ${t.runs??0} · H ${t.hits??0} · E ${t.errors??0}`};
  return <section className="card hero">
    <div className="statusline"><div><span id="seriesText">{score?.series||(emptyDate?`${emptyDate} 沒有 MLB 季後賽賽事`:'等待載入賽事')}</span><span id="statePill" className="pill">{score?.status||(emptyDate?'NO GAME':'--')}</span></div><div className="hero-status-right"><div id="inningText" className="inning">{score?.inning||'--'}</div><button id="heroRosterBtn" className="matchup-roster-btn" type="button" onClick={()=>actions.navigate('roster')}>對戰名單</button></div></div>
    <div className="teams"><div className="team"><span className="logo-shell"><img id="awayLogo" className="logo" src={logo(team('away').id)} data-team-id={team('away').id||''} alt={team('away').name||'客隊'}/></span><div><div id="awayName" className="team-name">{team('away').name||'客隊'}</div><div id="awayRhe" className="team-sub">{rhe('away')}</div></div></div>
      <div className="score-center"><WatchButton/><div id="bigScore" className="bigscore"><span>{team('away').runs??0}</span><span>{team('home').runs??0}</span></div></div>
      <div className="team home"><div><div id="homeName" className="team-name">{team('home').name||'主隊'}</div><div id="homeRhe" className="team-sub">{rhe('home')}</div></div><span className="logo-shell"><img id="homeLogo" className="logo" src={logo(team('home').id)} data-team-id={team('home').id||''} alt={team('home').name||'主隊'}/></span></div>
    </div>
  </section>;
}
export function GameTabs(){const {games,selectedGamePk}=useScoreboard();return <div id="gameTabs">{games.map(g=><button type="button" key={g.gamePk} className={'game-tab '+(g.gamePk===selectedGamePk?'active':'')} onClick={()=>actions.selectGame(g.gamePk)}><span className="game-tab-main">{g.label}</span><span className="game-tab-time">{g.time}</span></button>)}</div>}
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
  return <section className="card highlights-card" aria-label="本場焦點">
    <div className="highlights-topline"><span className="highlights-label">🔥 本場焦點</span><button id="highlightsToggle" className="highlights-toggle" type="button" aria-controls="gameHighlights" aria-expanded={expanded} aria-label={expanded?'收合全部本場焦點':'展開全部本場焦點'} onClick={()=>setExpanded(x=>!x)}><span className="highlight-chevron" aria-hidden="true">⌄</span></button></div>
    <div className="highlight-ticker-row"><div id="highlightTicker" className="highlight-ticker" aria-live="off"><div key={itemKey} className={'highlight-ticker-slide'+(rotating?' is-rotating':'')}><div className="highlight-ticker-title">{item&&<HighlightIcon item={item} className="highlight-ticker-icon"/>}<span>{item?.title||'等待焦點事件'}</span></div><div className="highlight-ticker-desc">{item?.desc||'目前還沒有符合條件的焦點事件'}</div></div></div><span id="highlightCounter" className="highlight-counter">{list.length?index+1:0} / {list.length}</span></div>
    <div id="gameHighlights" className="highlights-grid" hidden={!expanded}>{list.length?list.map(x=><article key={x.id} className={'highlight-item '+(x.tone||'')+((x.meta+' '+x.desc).includes('局上')?' top-half':(x.meta+' '+x.desc).includes('局下')?' bottom-half':'')}><div className="highlight-top"><HighlightIcon item={x} className="highlight-icon"/><div className="highlight-title">{x.title}</div></div><div className="highlight-desc">{x.desc}</div>{x.meta&&<div className="highlight-meta">{x.meta}</div>}</article>):<div className="empty">目前還沒有符合條件的焦點事件</div>}</div>
  </section>;
}
