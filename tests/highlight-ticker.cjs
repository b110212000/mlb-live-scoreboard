const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let now=2300,next=0,writes=0,html='';
const timers=new Map();
const state={highlights:[],highlightIndex:0,highlightGamePk:null,highlightsExpanded:false};
const ctx={state,document:{hidden:false},els:{
 highlightTicker:{set innerHTML(v){html=v;writes++;},get innerHTML(){return html;}},
 highlightCounter:{textContent:''},gameHighlights:{hidden:true,innerHTML:''},
 highlightsToggle:{setAttribute(){}}
},esc:v=>String(v??''),teamLogo:id=>'logo-'+id,
 setTimeout(fn,ms){const id=++next;timers.set(id,{fn,at:now+ms});return id;},
 clearTimeout(id){timers.delete(id);},console};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('live.js','utf8'),ctx);
ctx.buildHighlightItems=feed=>feed.items.map(x=>({...x}));
const items=[{id:'a',title:'A',desc:'First',teamId:119},{id:'b',title:'B',desc:'Second',teamId:144}];
const feed={gameData:{game:{pk:101}},items};
function tick(ms){
 const end=now+ms;
 while(true){
  const due=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
  if(!due)break;
  const [id,timer]=due;timers.delete(id);now=timer.at;timer.fn();
 }
 now=end;
}
ctx.renderHighlights(feed);assert.equal(writes,1);assert.equal(timers.size,1);
tick(2700);ctx.renderHighlights(feed);assert.equal(writes,1,'global 5s poll must not restart first slide');
tick(2299);ctx.renderHighlights(feed);assert.equal(writes,1);
tick(1);assert.equal(writes,2);assert.equal(state.highlightIndex,1);
ctx.renderHighlights(feed);assert.equal(writes,2,'poll after rotation must not cause a second animation');
tick(5000);assert.equal(writes,3);assert.equal(state.highlightIndex,0);
ctx.renderHighlights({...feed,items:[...items,{id:'c',title:'C',desc:'Third'}]});
assert.equal(writes,3,'new count must not rebuild unchanged active slide');assert.equal(ctx.els.highlightCounter.textContent,'1 / 3');
state.highlightsExpanded=true;ctx.syncHighlights();assert.equal(timers.size,0);assert(!html.includes('is-rotating'));
const expandedWrites=writes;tick(10000);assert.equal(writes,expandedWrites);
state.highlightsExpanded=false;ctx.syncHighlights();assert.equal(timers.size,1);
ctx.document.hidden=true;ctx.renderHighlightTicker();assert.equal(timers.size,0);const hiddenWrites=writes;
tick(10000);assert.equal(writes,hiddenWrites);
ctx.document.hidden=false;ctx.renderHighlightTicker();assert.equal(timers.size,1);
tick(4999);assert.equal(state.highlightIndex,0);tick(1);assert.equal(state.highlightIndex,1);
ctx.renderHighlights({gameData:{game:{pk:102}},items:[items[1]]});assert.equal(timers.size,0);assert.equal(ctx.els.highlightCounter.textContent,'1 / 1');assert(!html.includes('is-rotating'));
ctx.renderHighlights({gameData:{game:{pk:102}},items:[]});assert.equal(timers.size,0);assert.equal(ctx.els.highlightCounter.textContent,'0 / 0');
const emptyWrites=writes;ctx.renderHighlights({gameData:{game:{pk:102}},items:[]});assert.equal(writes,emptyWrites);
const app=fs.readFileSync('app.js','utf8');assert(!app.includes('setInterval(advanceHighlights'));assert(app.includes("document.addEventListener('visibilitychange',()=>{\n  renderHighlightTicker();"));
console.log('PASS stable DOM across polls/rotation, aligned 5s clock, count-only update, expand/background pause, resume, game switch and empty state');
