import {t,locale} from './i18n.js';
export const MLB_API='https://statsapi.mlb.com/api/v1';
const cache=new Map(),pending=new Map();
export async function cachedJSON(url,ttl=5000){
  const previous=cache.get(url);
  if(previous&&Date.now()-previous.at<ttl)return previous.data;
  if(pending.has(url))return pending.get(url);
  const work=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(url,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.json();cache.set(url,{data,at:Date.now()});
      while(cache.size>80)cache.delete(cache.keys().next().value);
      return data;
    }finally{clearTimeout(timer);pending.delete(url)}
  })();
  pending.set(url,work);return work;
}
export function localDate(date=new Date()){
  if(!Number.isFinite(date.getTime()))return '';
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&localDate(new Date(value+'T12:00:00'))===value;}
export function shiftDate(value,days){const date=new Date(value+'T12:00:00');date.setDate(date.getDate()+days);return localDate(date);}
export function gamesOnDate(schedule,date){
  if(!Array.isArray(schedule?.dates))throw new Error('schedule');
  const games=schedule.dates.flatMap(day=>Array.isArray(day.games)?day.games:[]);
  return [...new Map(games.filter(g=>Number.isSafeInteger(g.gamePk)&&localDate(new Date(g.gameDate))===date).map(g=>[g.gamePk,g])).values()].sort((a,b)=>new Date(a.gameDate)-new Date(b.gameDate));
}
export function gameKind(game){
  const s=game?.status||{},detail=s.detailedState||'',code=s.codedGameState;
  if(code==='D'||/postponed/i.test(detail))return 'postponed';
  if(['C','X'].includes(code)||/cancel+ed|unknown/i.test(detail))return 'cancelled';
  if(/suspend/i.test(detail))return 'suspended';
  if(/delay/i.test(detail))return 'delayed';
  if(s.abstractGameState==='Final')return 'final';
  if(s.abstractGameState==='Live')return 'live';
  return 'preview';
}
export function gameStatusText(game){
  const kind=gameKind(game),ls=game.linescore;
  if(kind==='live'&&ls?.currentInning){
    if(ls.inningState==='Middle')return t('{n} 局換邊',{n:ls.currentInning});
    if(ls.inningState==='End')return t('{n} 局結束',{n:ls.currentInning});
    if(ls.isTopInning===true||ls.inningState==='Top')return t('{n} 局上',{n:ls.currentInning});
    if(ls.isTopInning===false||ls.inningState==='Bottom')return t('{n} 局下',{n:ls.currentInning});
  }
  return {postponed:t('延賽'),cancelled:t('比賽取消'),suspended:t('比賽暫停'),delayed:t('比賽延遲'),final:t('已完賽'),live:t('進行中'),preview:t('尚未開賽')}[kind];
}
export function gameTime(game){
  const date=new Date(game.gameDate);
  return game.status?.startTimeTBD||!Number.isFinite(date.getTime())?t('時間未定'):new Intl.DateTimeFormat(locale(),{hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
}
