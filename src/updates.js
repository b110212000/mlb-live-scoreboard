import {useSyncExternalStore} from 'react';
import {APP_VERSION} from './config.js';

let state={remote:null,checking:false,applying:false,error:'',notes:null};
const listeners=new Set();
const publish=patch=>{state={...state,...patch};listeners.forEach(fn=>fn())};
export const useAppUpdate=()=>useSyncExternalStore(fn=>{listeners.add(fn);return ()=>listeners.delete(fn)},()=>state,()=>state);
const valid=v=>typeof v==='string'&&/^\d+\.\d+\.\d+$/.test(v);
export function newer(a,b){if(!valid(a)||!valid(b))return false;const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]}return false;}
async function request(path){
  const url=new URL(path,location.href);url.searchParams.set('_check',Date.now());
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error('network');return await response.text();}finally{clearTimeout(timer)}
}
let inFlight=null,lastCheck=0;
export function checkAppUpdate(force=false){
  if(inFlight)return inFlight;
  if(!force&&Date.now()-lastCheck<60000)return Promise.resolve();
  publish({checking:true,error:''});
  inFlight=(async()=>{
    try{
      const {version}=JSON.parse(await request('./version.json'));
      if(!valid(version))throw new Error('network');
      publish({remote:newer(version,APP_VERSION)?version:null});
      try{const notes=state.notes?.version===version?state.notes:JSON.parse(await request('./release-notes.json'));if(notes.version===version)publish({notes});else publish({notes:null});}catch{publish({notes:null})}
    }catch{publish({error:'network'})}
    finally{lastCheck=Date.now();publish({checking:false});inFlight=null}
  })();
  return inFlight;
}
export async function applyAppUpdate(returnPoint){
  if(!state.remote||state.applying)return;
  // A draft stays in the mounted feedback form; never reload and lose it.
  if(document.querySelector('#feedbackMessage')?.value.trim()||document.querySelector('#feedbackEmail')?.value.trim()||document.querySelector('.feedback-form')?.getAttribute('aria-busy')==='true'){publish({error:'draft'});return;}
  publish({applying:true,error:''});
  try{
    const target=state.remote,html=await request('./index.html');
    if(!html.includes('name="app-version" content="'+target+'"')){publish({error:'deploying',applying:false});return;}
    // Check referenced same-origin scripts and styles before leaving a working page.
    const doc=new DOMParser().parseFromString(html,'text/html');
    const paths=[...doc.querySelectorAll('script[src],link[rel="stylesheet"][href]')].map(el=>el.getAttribute('src')||el.getAttribute('href'));
    if(!paths.length)throw new Error('network');
    await Promise.all(paths.map(path=>{const url=new URL(path,location.href);if(url.origin!==location.origin)throw new Error('network');return request(url.href)}));
    const point={...returnPoint,at:Date.now()};
    try{sessionStorage.setItem('mlb-update-return',JSON.stringify(point))}catch{}
    const url=new URL(location.href);url.searchParams.set('_v',target);
    url.searchParams.delete('gamePk');url.searchParams.delete('gameDate');
    if(point.view==='player'&&point.playerId){url.searchParams.set('view','player');url.searchParams.set('playerId',point.playerId)}
    if(point.view==='activePlayers'||point.view==='player'&&point.playerFrom==='activePlayers'){
      url.searchParams.set('view',point.view);
      url.searchParams.set('playersTab',point.activeTab||'teams');url.searchParams.set('league',point.activeLeague||'MLB');
      if(point.activeTeamId)url.searchParams.set('teamId',point.activeTeamId);else url.searchParams.delete('teamId');
      if(point.view==='player')url.searchParams.set('playerFrom','activePlayers');
    }
    location.replace(url.href);
  }catch{publish({error:'network',applying:false})}
}
