import {useRef} from 'react';

// 美國聯盟 / 國家聯盟左右開關與可左右滑動的內容區（追蹤球隊、戰績排行共用）。
export const LEAGUES=[['AL','美國聯盟'],['NL','國家聯盟']];

// 記住上次選的聯盟（只是瀏覽便利；讀不到時預設美國聯盟）。
export function savedLeague(key){
  try{return localStorage.getItem(key)==='NL'?'NL':'AL'}catch(_){return 'AL'}
}
export function saveLeague(key,league){
  try{localStorage.setItem(key,league)}catch(_){}
}

function useBlockClickAfterSwipe(){
  const until=useRef(0);
  return {
    mark:()=>{until.current=Date.now()+350},
    // 滑動結束後短時間內的 click 不算點擊，避免滑動時誤觸。
    onClickCapture:e=>{if(Date.now()<until.current){e.preventDefault();e.stopPropagation()}}
  };
}

// 開關本身可以往左右拖：往右拖選國家聯盟、往左拖選美國聯盟；方向鍵也能切換。
export function LeagueSwitch({league,onPick,counts={},label='選擇聯盟'}){
  const drag=useRef(null);
  const block=useBlockClickAfterSwipe();
  const down=e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    drag.current={id:e.pointerId,x:e.clientX};
  };
  const up=e=>{
    const g=drag.current;
    drag.current=null;
    if(!g||g.id!==e.pointerId)return;
    const dx=e.clientX-g.x;
    if(Math.abs(dx)<24)return;
    block.mark();
    onPick(dx>0?'NL':'AL');
  };
  const key=e=>{
    const next=e.key==='ArrowRight'?'NL':e.key==='ArrowLeft'?'AL':null;
    if(!next)return;
    e.preventDefault();
    onPick(next);
    e.currentTarget.querySelector(`[data-league=${next}]`)?.focus();
  };
  return <div className="league-switch" role="radiogroup" aria-label={label} data-active={league}
    onPointerDown={down} onPointerUp={up} onPointerCancel={()=>{drag.current=null}} onClickCapture={block.onClickCapture} onKeyDown={key}>
    <span className="league-switch-thumb" aria-hidden="true"/>
    {LEAGUES.map(([id,text])=>{
      const count=counts[id]||0;
      return <button key={id} type="button" role="radio" aria-checked={league===id} tabIndex={league===id?0:-1} data-league={id} onClick={()=>onPick(id)}>
        <span>{text}</span>
        {count>0&&<span className="league-count" aria-label={`已追蹤 ${count} 隊`}>{count}</span>}
      </button>;
    })}
  </div>;
}

// 內容區左右滑：向左滑看國家聯盟、向右滑回美國聯盟，手指移動時內容跟著動。
// renderPanel(leagueId) 回傳該聯盟的內容；非目前聯盟的面板設為 inert。
export function LeaguePager({league,onPick,renderPanel}){
  const viewportRef=useRef(null),trackRef=useRef(null),swipe=useRef(null);
  const block=useBlockClickAfterSwipe();
  const index=league==='NL'?1:0;
  const reset=()=>{
    trackRef.current?.classList.remove('dragging');
    if(trackRef.current)trackRef.current.style.transform='';
  };
  const start=e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    swipe.current={id:e.pointerId,x:e.clientX,y:e.clientY,t:performance.now(),dir:null};
  };
  const move=e=>{
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
  const end=e=>{
    const g=swipe.current;
    if(!g||g.id!==e.pointerId)return;
    swipe.current=null;
    if(g.dir!=='x')return;
    reset();
    block.mark();
    const dx=e.clientX-g.x,width=viewportRef.current.clientWidth||1;
    const fast=Math.abs(dx)/Math.max(1,performance.now()-g.t)>.55;
    if(Math.abs(dx)<Math.min(90,width*.2)&&!fast)return;
    if(dx<0&&index===0)onPick('NL');
    if(dx>0&&index===1)onPick('AL');
  };
  const cancel=e=>{
    if(swipe.current?.id!==e.pointerId)return;
    swipe.current=null;
    reset();
  };
  return <div className="league-viewport" ref={viewportRef} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel} onClickCapture={block.onClickCapture}>
    <div className="league-track" ref={trackRef} style={{'--league-index':index}}>
      {LEAGUES.map(([id,text])=><div key={id} className={'league-panel'+(id===league?' active':'')} data-league={id} aria-label={text} inert={id!==league}>
        {renderPanel(id)}
      </div>)}
    </div>
  </div>;
}
