const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
function fixture(ua,platform='',touch=0){
 const calls=[],timers=new Map(),listeners=new Map();let next=0;
 const ctx={navigator:{userAgent:ua,platform,maxTouchPoints:touch},location:{assign:url=>calls.push(url)},document:{hidden:false,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)},window:{addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)},setTimeout:f=>{timers.set(++next,f);return next},clearTimeout:n=>timers.delete(n),console,Date,Map};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('highlights.js','utf8'),ctx);
 const event={target:{closest:()=>({dataset:{youtubeId:'cv8qfCAzrmM'}})},button:0,preventDefault(){this.prevented=true}};
 return {ctx,event,calls,timers,listeners};
}
let f=fixture('iPhone');let link=f.ctx.recapVideoLink('cv8qfCAzrmM');assert.equal(link.href,'youtube://www.youtube.com/watch?v=cv8qfCAzrmM');assert.equal(link.target,'_self');
f.ctx.openRecapVideo(f.event);assert(!f.event.prevented);assert.equal(f.calls.length,0,'native anchor must perform navigation');
f.ctx.document.hidden=true;f.listeners.get('visibilitychange')();assert.equal(f.timers.size,0);
f=fixture('iPhone');f.ctx.openRecapVideo(f.event);[...f.timers.values()][0]();assert.equal(f.calls[0],'https://www.youtube.com/watch?v=cv8qfCAzrmM');
f=fixture('iPhone');f.ctx.openRecapVideo(f.event);f.listeners.get('pagehide')();assert.equal(f.timers.size,0);
f=fixture('iPhone');f.ctx.openRecapVideo(f.event);f.ctx.openRecapVideo(f.event);assert.equal(f.timers.size,1);
f=fixture('Macintosh','MacIntel',5);assert(f.ctx.recapVideoLink('cv8qfCAzrmM').href.startsWith('youtube://'));
f=fixture('Android Chrome/130');link=f.ctx.recapVideoLink('cv8qfCAzrmM');assert(link.href.includes('package=com.google.android.youtube;'));assert(link.href.includes('S.browser_fallback_url=https%3A%2F%2Fwww.youtube.com'));assert.equal(link.target,'_self');f.ctx.openRecapVideo(f.event);assert(!f.event.prevented);assert.equal(f.calls.length,0);
f=fixture('Windows Chrome');assert.equal(f.ctx.recapVideoLink('cv8qfCAzrmM').target,'_blank');f.ctx.openRecapVideo(f.event);assert.equal(f.calls.length,0);
f=fixture('iPhone');f.event.ctrlKey=true;f.ctx.openRecapVideo(f.event);assert.equal(f.timers.size,0);
f=fixture('iPhone');f.event.target.closest=()=>({dataset:{youtubeId:'invalid'}});f.ctx.openRecapVideo(f.event);assert.equal(f.timers.size,0);
// Five-second polling must not replace a link between touchstart and click.
f=fixture('iPhone');let writes=0,html='';f.ctx.els={recapList:{set innerHTML(v){writes++;html=v}},recapSummary:{}};f.ctx.esc=String;f.ctx.requestAnimationFrame=fn=>fn();f.ctx.syncLiveDetailHeight=()=>{};
const data={officialDate:'2026-10-07',videos:[{id:'cv8qfCAzrmM',title:'MLB Highlights'}]};
f.ctx.renderGameRecap(data);f.ctx.renderGameRecap(data);assert.equal(writes,1);assert(html.includes('href="youtube://'));assert(html.includes('target="_self"'));
f.ctx.renderRecapMessage('loading');f.ctx.renderGameRecap(data);assert.equal(writes,3);
// Exercise touch handlers with the real selectors, including a nested image in an anchor.
function touch(link,x,y){return {target:{closest:s=>link&&s.split(',').map(x=>x.trim()).includes('a')?{}:null},touches:[{clientX:x,clientY:y}],preventDefault(){this.prevented=true}};}
const listeners={};const noop=()=>{};const classes={add:noop,remove:noop};const panel={};
const ctx={els:{liveDetailViewport:{addEventListener:(n,f)=>listeners[n]=f,clientWidth:360},liveDetailTrack:{classList:classes,style:{}},liveDetailStats:panel,liveDetailStatus:panel,liveDetailSeries:panel,liveDetailRecap:panel},state:{liveDetailTab:'recap'},performance:{now:()=>0},window:{ResizeObserver:true,addEventListener:noop},ResizeObserver:class{observe(){}},console};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('ui.js','utf8'),ctx);ctx.initLiveDetailSwipe();
listeners.touchstart(touch(true,0,0));let move=touch(true,12,1);listeners.touchmove(move);assert(!move.prevented,'swipe swallowed link');
listeners.touchstart(touch(false,0,0));move=touch(false,30,1);listeners.touchmove(move);assert(move.prevented,'background swipe should still work');
const app=fs.readFileSync('app.js','utf8');const start=app.indexOf('(() => {',app.indexOf('// iPhone Web App'));const end=app.indexOf('})();',start)+5;
const pull={style:{},classList:classes,querySelector:()=>({})};const pullCtx={document:{addEventListener:(n,f)=>listeners[n]=f},window:{scrollY:0},els:{pullRefresh:pull,pullRefreshText:{}},setTimeout:noop};vm.createContext(pullCtx);vm.runInContext(app.slice(start,end),pullCtx);
listeners.touchstart(touch(true,0,0));move=touch(true,0,20);listeners.touchmove(move);assert(!move.prevented,'pull refresh swallowed link');
listeners.touchstart(touch(false,0,0));move=touch(false,0,4);listeners.touchmove(move);assert(!move.prevented,'small movement swallowed tap');move=touch(false,0,80);listeners.touchmove(move);assert(move.prevented,'pull refresh should still work');
console.log('PASS native mobile links, fallback, stable DOM, tap with slight movement, link gesture exclusion, background gestures');
