import {readFile} from 'node:fs/promises';
export const engineFiles=['api','live','postseason','roster','notifications','highlights','ui','app'];
export async function engineSource(){
  const sources=await Promise.all(engineFiles.map(name=>readFile(`src/engine/${name}.js`,'utf8')));
  return `export function createEngine(callbacks){
    let disposed=false;
    const bridge={publish:patch=>{if(!disposed)callbacks.publish(patch)}};
    const timeouts=new Set(),intervals=new Set(),frames=new Set(),observers=new Set();
    const lifetime=new AbortController();
    function on(target,type,fn,options){
      target.addEventListener(type,fn,typeof options==='boolean'?{capture:options,signal:lifetime.signal}:{...options,signal:lifetime.signal});
    }
    const setTimeout=(fn,ms)=>{if(disposed)return null;const id=window.setTimeout(()=>{timeouts.delete(id);if(!disposed)fn()},ms);timeouts.add(id);return id};
    const clearTimeout=id=>{timeouts.delete(id);window.clearTimeout(id)};
    const setInterval=(fn,ms)=>{if(disposed)return null;const id=window.setInterval(()=>{if(!disposed)fn()},ms);intervals.add(id);return id};
    const clearInterval=id=>{intervals.delete(id);window.clearInterval(id)};
    const requestAnimationFrame=fn=>{if(disposed)return null;const id=window.requestAnimationFrame(t=>{frames.delete(id);if(!disposed)fn(t)});frames.add(id);return id};
    const fetch=(url,options={})=>window.fetch(url,{...options,signal:lifetime.signal});
    const ManagedResizeObserver=window.ResizeObserver?class extends window.ResizeObserver{constructor(fn){super((...args)=>{if(!disposed)fn(...args)});observers.add(this)}}:null;
    ${sources.join('\n\n')}
    return {
      navigate:switchView,
      async selectGame(gamePk){if(disposed)return;clearNotificationRoute();state.selectedGamePk=Number(gamePk);renderTabs();await loadGame(state.selectedGamePk)},
      dispose(){disposed=true;lifetime.abort();timeouts.forEach(window.clearTimeout);intervals.forEach(window.clearInterval);frames.forEach(window.cancelAnimationFrame);observers.forEach(o=>o.disconnect())}
    };
  }`;
}
export const enginePlugin={name:'scoreboard-engine',setup(build){
  build.onResolve({filter:/^scoreboard:engine$/},()=>({path:'engine',namespace:'scoreboard'}));
  build.onLoad({filter:/.*/,namespace:'scoreboard'},async()=>({contents:await engineSource(),loader:'js'}));
}};
