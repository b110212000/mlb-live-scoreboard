const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
function fixture(ua,platform='',touch=0){
 const calls=[],timers=new Map(),listeners=new Map();let next=0;
 const ctx={navigator:{userAgent:ua,platform,maxTouchPoints:touch},location:{assign:url=>calls.push(url)},document:{hidden:false,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)},window:{addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)},setTimeout:f=>{timers.set(++next,f);return next},clearTimeout:n=>timers.delete(n),console,Date,Map};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('highlights.js','utf8'),ctx);
 const event={target:{closest:()=>({dataset:{youtubeId:'cv8qfCAzrmM'}})},button:0,preventDefault(){this.prevented=true}};
 return {ctx,event,calls,timers,listeners};
}
let f=fixture('iPhone');f.ctx.openRecapVideo(f.event);assert(f.event.prevented);assert.equal(f.calls[0],'youtube://www.youtube.com/watch?v=cv8qfCAzrmM');
f.ctx.document.hidden=true;f.listeners.get('visibilitychange')();assert.equal(f.timers.size,0);f.ctx.document.hidden=false;assert.equal(f.calls.length,1);
f=fixture('iPhone');f.ctx.openRecapVideo(f.event);[...f.timers.values()][0]();assert.equal(f.calls[1],'https://www.youtube.com/watch?v=cv8qfCAzrmM');
f=fixture('iPhone');f.ctx.openRecapVideo(f.event);f.listeners.get('pagehide')();assert.equal(f.timers.size,0);
f=fixture('iPhone');f.ctx.openRecapVideo(f.event);f.ctx.openRecapVideo(f.event);assert.equal(f.timers.size,1);
f=fixture('Macintosh','MacIntel',5);f.ctx.openRecapVideo(f.event);assert(f.calls[0].startsWith('youtube://'));
f=fixture('Android Chrome/130');f.ctx.openRecapVideo(f.event);assert(f.calls[0].includes('package=com.google.android.youtube;'));assert(f.calls[0].includes('S.browser_fallback_url=https%3A%2F%2Fwww.youtube.com'));assert.equal(f.timers.size,0);
f=fixture('Windows Chrome');f.ctx.openRecapVideo(f.event);assert.equal(f.calls.length,0);assert(!f.event.prevented);
f=fixture('iPhone');f.event.ctrlKey=true;f.ctx.openRecapVideo(f.event);assert.equal(f.calls.length,0);
f=fixture('iPhone');f.event.target.closest=()=>({dataset:{youtubeId:'invalid'}});f.ctx.openRecapVideo(f.event);assert.equal(f.calls.length,0);
console.log('PASS YouTube app launch: iPhone/iPad, Android Intent, web fallback, background cancellation, repeat tap, desktop, modifier-click, invalid ID');
