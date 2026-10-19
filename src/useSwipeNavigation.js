import {useEffect,useRef} from 'react';

// Horizontal gestures only: leave vertical scrolling, pinch zoom and scrollable tables native.
// onSwipe receives the direction and whether the gesture started near the left edge.
export function useSwipeNavigation(onSwipe,enabled=true){
  const ref=useRef(null),handler=useRef(onSwipe);
  handler.current=onSwipe;
  useEffect(()=>{
    const el=ref.current;
    if(!el||!enabled)return;
    let start=null,blockUntil=0;
    const reset=()=>{start=null;el.style.removeProperty('--swipe-offset')};
    const down=e=>{
      reset();
      if(document.querySelector('dialog[open]')||e.touches.length!==1)return;
      if(e.target.closest('input,select,textarea,[role=tablist],[role=radiogroup],.standings-scroll,.scroll,.boxscore-scroll'))return;
      const p=e.touches[0];start={x:p.clientX,y:p.clientY,dx:0,dir:null,edge:p.clientX<=40,time:Date.now()};
    };
    const move=e=>{
      if(!start)return;
      if(e.touches.length!==1){reset();return;}
      const p=e.touches[0],dx=p.clientX-start.x,dy=p.clientY-start.y;
      if(!start.dir&&Math.max(Math.abs(dx),Math.abs(dy))<10)return;
      if(!start.dir)start.dir=Math.abs(dx)>Math.abs(dy)*1.4?'x':'y';
      if(start.dir==='y'){reset();return;}
      start.dx=dx;
      if(e.cancelable)e.preventDefault();
      el.style.setProperty('--swipe-offset',`${Math.max(-24,Math.min(48,dx*.16))}px`);
    };
    const end=()=>{
      const g=start;reset();
      if(!g||g.dir!=='x')return;
      blockUntil=Date.now()+400;
      if(Math.abs(g.dx)<64||Date.now()-g.time>1500)return;
      handler.current(g.dx>0?'right':'left',g.edge);
    };
    const click=e=>{if(Date.now()<blockUntil){e.preventDefault();e.stopPropagation()}};
    el.addEventListener('touchstart',down,{passive:true});
    el.addEventListener('touchmove',move,{passive:false});
    el.addEventListener('touchend',end,{passive:true});
    el.addEventListener('touchcancel',reset,{passive:true});
    el.addEventListener('click',click,true);
    return ()=>{reset();el.removeEventListener('touchstart',down);el.removeEventListener('touchmove',move);el.removeEventListener('touchend',end);el.removeEventListener('touchcancel',reset);el.removeEventListener('click',click,true)};
  },[enabled]);
  return ref;
}
