import {useRef,useState} from 'react';
import {useScoreboard,actions} from '../store.js';
import {MLB_TEAMS} from '../teams.js';
import {SUPPORT_NOTICE,logo,SubsStatus} from './SubscriptionShared.jsx';

const LEAGUES=[['AL','美國聯盟'],['NL','國家聯盟']];
const DIVISIONS=[['E','東區'],['C','中區'],['W','西區']];
const LEAGUE_KEY='mlb-team-follow-league';
// 記住上次選的聯盟（只是瀏覽便利；讀不到時預設美國聯盟）。
function savedLeague(){
  try{return localStorage.getItem(LEAGUE_KEY)==='NL'?'NL':'AL'}catch(_){return 'AL'}
}

export function TeamFollow(){
  const {subs}=useScoreboard();
  const [league,setLeague]=useState(savedLeague);
  const viewportRef=useRef(null),trackRef=useRef(null),swipe=useRef(null),switchDrag=useRef(null),blockClickUntil=useRef(0);
  const index=league==='NL'?1:0;
  const blocked=Boolean(SUPPORT_NOTICE[subs.support]);
  const followed=new Set(subs.teams);
  const busy=id=>Boolean(subs.busy?.['team:'+id]);
  const gameCount=id=>subs.games.filter(game=>game.teamIds?.includes(id)).length;
  const followedIn=key=>MLB_TEAMS.filter(team=>team.league===key&&followed.has(team.id)).length;
  const pick=key=>{
    setLeague(key);
    try{localStorage.setItem(LEAGUE_KEY,key)}catch(_){}
  };
  const toggle=team=>followed.has(team.id)?actions.subs.unfollowTeam(team.id):actions.subs.followTeam(team.id);
  // 滑動結束後短時間內的 click 不算點卡片，避免滑動時誤觸追蹤。
  const blockClickAfterSwipe=e=>{
    if(Date.now()<blockClickUntil.current){e.preventDefault();e.stopPropagation()}
  };

  // 內容區左右滑：向左滑看國家聯盟、向右滑回美國聯盟，手指移動時內容跟著動。
  const resetTrack=()=>{
    trackRef.current?.classList.remove('dragging');
    if(trackRef.current)trackRef.current.style.transform='';
  };
  const swipeStart=e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    swipe.current={id:e.pointerId,x:e.clientX,y:e.clientY,t:performance.now(),dir:null};
  };
  const swipeMove=e=>{
    const g=swipe.current;
    if(!g||g.id!==e.pointerId)return;
    const dx=e.clientX-g.x,dy=e.clientY-g.y;
    if(!g.dir){
      if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
      g.dir=Math.abs(dx)>Math.abs(dy)?'x':'y';
      if(g.dir==='x'){
        e.currentTarget.setPointerCapture?.(e.pointerId);
        trackRef.current.classList.add('dragging');
      }
    }
    if(g.dir!=='x')return;
    const width=viewportRef.current.clientWidth||1;
    const pastEdge=(index===0&&dx>0)||(index===1&&dx<0);
    trackRef.current.style.transform=`translate3d(${-index*width+(pastEdge?dx*.3:dx)}px,0,0)`;
  };
  const swipeEnd=e=>{
    const g=swipe.current;
    if(!g||g.id!==e.pointerId)return;
    swipe.current=null;
    if(g.dir!=='x')return;
    resetTrack();
    blockClickUntil.current=Date.now()+350;
    const dx=e.clientX-g.x,width=viewportRef.current.clientWidth||1;
    const fast=Math.abs(dx)/Math.max(1,performance.now()-g.t)>.55;
    if(Math.abs(dx)<Math.min(90,width*.2)&&!fast)return;
    if(dx<0&&index===0)pick('NL');
    if(dx>0&&index===1)pick('AL');
  };
  const swipeCancel=e=>{
    if(swipe.current?.id!==e.pointerId)return;
    swipe.current=null;
    resetTrack();
  };

  // 開關本身可以往左右拖：往右拖選國家聯盟、往左拖選美國聯盟；方向鍵也能切換。
  const switchDown=e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    switchDrag.current={id:e.pointerId,x:e.clientX};
  };
  const switchUp=e=>{
    const g=switchDrag.current;
    switchDrag.current=null;
    if(!g||g.id!==e.pointerId)return;
    const dx=e.clientX-g.x;
    if(Math.abs(dx)<24)return;
    blockClickUntil.current=Date.now()+350;
    pick(dx>0?'NL':'AL');
  };
  const switchKey=e=>{
    const key=e.key==='ArrowRight'?'NL':e.key==='ArrowLeft'?'AL':null;
    if(!key)return;
    e.preventDefault();
    pick(key);
    e.currentTarget.querySelector(`[data-league=${key}]`)?.focus();
  };

  return <section className="card subs-shell" aria-label="追蹤球隊">
    <p className="subs-intro">點一下球隊卡片追蹤，再點一下取消；左右滑動可切換聯盟。追蹤後會自動訂閱該隊接下來的季後賽，通知依「訂閱管理」的提醒項目發送。</p>
    <SubsStatus subs={subs}/>

    <div className="league-switch" role="radiogroup" aria-label="選擇聯盟" data-active={league}
      onPointerDown={switchDown} onPointerUp={switchUp} onPointerCancel={()=>{switchDrag.current=null}} onClickCapture={blockClickAfterSwipe} onKeyDown={switchKey}>
      <span className="league-switch-thumb" aria-hidden="true"/>
      {LEAGUES.map(([key,label])=>{
        const count=followedIn(key);
        return <button key={key} type="button" role="radio" aria-checked={league===key} tabIndex={league===key?0:-1} data-league={key} onClick={()=>pick(key)}>
          <span>{label}</span>
          {count>0&&<span className="league-count" aria-label={`已追蹤 ${count} 隊`}>{count}</span>}
        </button>;
      })}
    </div>

    <div className="league-viewport" ref={viewportRef} onPointerDown={swipeStart} onPointerMove={swipeMove} onPointerUp={swipeEnd} onPointerCancel={swipeCancel} onClickCapture={blockClickAfterSwipe}>
      <div className="league-track" ref={trackRef} style={{'--league-index':index}}>
        {LEAGUES.map(([key,label])=><div key={key} className={'league-panel'+(key===league?' active':'')} data-league={key} aria-label={label} inert={key!==league}>
          {/* 東區、中區、西區三欄並排，每區的球隊由上往下排（subgrid 讓三欄同一列對齊）。 */}
          <div className="divisions">
            {DIVISIONS.map(([division,divisionLabel])=><section key={division} className="division" aria-labelledby={'division'+key+division}>
              <h3 id={'division'+key+division}>{divisionLabel}</h3>
              {MLB_TEAMS.filter(team=>team.league===key&&team.division===division).map(team=>{
                const on=followed.has(team.id),count=gameCount(team.id);
                return <button key={team.id} type="button" className="team-card" data-team-id={team.id} aria-pressed={on} aria-label={`追蹤${team.name}（${team.en}）`}
                  disabled={busy(team.id)||(!on&&blocked)} onClick={()=>toggle(team)}>
                  <span className="team-card-badge" aria-hidden="true">{busy(team.id)?'…':on?'✓':'＋'}</span>
                  <span className="subs-logo team-card-logo" aria-hidden="true"><img src={logo(team.id)} alt=""/></span>
                  <span className="team-card-names">
                    <b className="team-card-zh">{team.name}</b>
                    <small className="team-card-en">{team.en}</small>
                    {on&&<span className="team-card-state">{count?`自動訂閱 ${count} 場`:'已追蹤'}</span>}
                  </span>
                </button>;
              })}
            </section>)}
          </div>
        </div>)}
      </div>
    </div>
  </section>;
}
