const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{webcrypto:crypto,randomUUID}=require('crypto');
const strip=s=>s.replace(/^import.*;$/gm,'').replace(/^export \{.*;$/gm,'').replace(/^export (default )?/gm,(_,d)=>d?'globalThis.entry = ':'');
let now=Date.UTC(2026,9,13,0,1),sender=async()=>{},count=0;
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
const ctx={Response,Request,Headers,URL,TextEncoder,TextDecoder,crypto,Date:Clock,console,DurableObject:class{},sendGmail:async(...args)=>{count++;return sender(...args)}};
vm.createContext(ctx);
const smtp={TextEncoder,btoa};vm.createContext(smtp);vm.runInContext(strip(fs.readFileSync('worker/src/smtp.js','utf8'))+'\nglobalThis.email=validEmail;',smtp);ctx.validEmail=smtp.email;
vm.runInContext(strip(fs.readFileSync('worker/src/feedback.js','utf8'))+'\nglobalThis.api={FeedbackService,feedbackRequest,normalizeFeedback};',ctx);
const env={SMTP_USER:'owner@gmail.com',SMTP_PASSWORD:'test-secret',FEEDBACK_TO_EMAIL:'owner@gmail.com',FRONTEND_ORIGIN:'https://b110212000.github.io'};
const data=patch=>({id:randomUUID(),type:'bug',message:'測試回饋，比分畫面需要調整。',email:'',version:'2.8.0',gamePk:849809,...patch});
function service(){
 const map=new Map();let alarm=null,queue=Promise.resolve();
 const storage={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k),getAlarm:async()=>alarm,setAlarm:async v=>alarm=v};
 const c={storage,blockConcurrencyWhile:fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p},waitUntil:p=>p.catch(()=>{})};
 const obj=new ctx.api.FeedbackService(c,env);
 const call=async(d,client='a'.repeat(64))=>{const res=await obj.fetch(new Request('https://feedback.internal/send',{method:'POST',body:JSON.stringify({data:d,client})}));return {status:res.status,body:await res.json()}};
 return {obj,map,call,storage};
}
(async()=>{
 assert(ctx.api.normalizeFeedback(data()));
 for(const patch of [{id:'bad'},{type:'__proto__'},{message:'short'},{message:'x'.repeat(2001)},{email:'a@b.com\r\nBcc: x@z.com'},{website:'bot'},{message:'a'.repeat(10)+'\0'}])assert.equal(ctx.api.normalizeFeedback(data(patch)),null);
 const d=service(),item=data();let captured;sender=async(_,mail)=>{captured=mail};count=0;
 assert.equal((await d.call(item)).status,200);assert.equal(count,1);assert(captured.text.includes(item.message));assert(!captured.text.includes('a'.repeat(64)));
 assert.equal((await d.call(item)).status,200);assert.equal(count,1,'same ID should not send twice');
 assert.equal((await d.call({...item,message:'不同的內容，必須拒絕這個 ID'})).status,409);
 assert.equal((await d.call(data())).status,429);now+=30_000;
 for(let i=0;i<4;i++){assert.equal((await d.call(data())).status,200);now+=30_000;}
 assert.equal((await d.call(data())).status,429,'hourly cap');now+=3_600_000;
 assert.equal((await d.call(data())).status,200);
 const stored=JSON.stringify(d.map.get('feedback'));assert(!stored.includes(item.message));assert(!stored.includes('owner@gmail.com'));assert(!stored.includes('test-secret'));
 // Two simultaneous requests with the same ID reserve one delivery.
 const parallel=service();let release;sender=()=>new Promise(r=>release=r);const concurrent=data();const pending=parallel.call(concurrent);await new Promise(r=>setImmediate(r));
 assert.equal((await parallel.call(concurrent)).body.error,'FEEDBACK_PENDING');release();await pending;assert.equal((await parallel.call(concurrent)).status,200);
 // Definite failure can retry after the cooldown; uncertain delivery must not resend.
 const failure=service(),retry=data();sender=async()=>{throw new Error('no auth')};assert.equal((await failure.call(retry)).status,502);now+=30_000;
 sender=async()=>{};assert.equal((await failure.call(retry)).status,200);
 const uncertain=service(),uncertainItem=data();sender=async()=>{throw Object.assign(new Error('connection lost'),{uncertain:true})};assert.equal((await uncertain.call(uncertainItem)).body.error,'FEEDBACK_UNCERTAIN');const before=count;now+=30_000;assert.equal((await uncertain.call(uncertainItem)).body.error,'FEEDBACK_UNCERTAIN');assert.equal(count,before);
 const quota=service();sender=async()=>{};for(let i=0;i<100;i++)assert.equal((await quota.call(data(),i.toString(16).padStart(64,'0'))).status,200);assert.equal((await quota.call(data(),'f'.repeat(64))).body.error,'FEEDBACK_DAILY_LIMIT');
 now+=86_400_000;await quota.obj.alarm();assert.equal(quota.map.has('feedback'),false,'expired metadata cleaned');assert.equal((await quota.call(data())).status,200);
 // Public API validates origin/body before reaching the Durable Object; recipient cannot be overridden.
 let forwarded=0,forwardBody;
 const apiEnv={...env,FEEDBACK_SERVICE:{idFromName:v=>v,get:()=>({fetch:async req=>{forwarded++;forwardBody=await req.json();return Response.json({ok:true})}})}};
 const req=(body=data(),headers={},method='POST')=>new Request('https://worker.test/api/feedback',{method,headers:{origin:env.FRONTEND_ORIGIN,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
 assert.equal((await ctx.api.feedbackRequest(req(data(),{origin:'https://evil.example'}),apiEnv)).status,403);
 assert.equal((await ctx.api.feedbackRequest(req(data(),{'content-type':'text/plain'}),apiEnv)).status,415);
 assert.equal((await ctx.api.feedbackRequest(req('{broken'),apiEnv)).status,400);
 assert.equal((await ctx.api.feedbackRequest(req('x'.repeat(13000)),apiEnv)).status,413);
 assert.equal((await ctx.api.feedbackRequest(req(data(),{},'GET'),apiEnv)).status,405);
 assert.equal((await ctx.api.feedbackRequest(req(),{...apiEnv,SMTP_PASSWORD:''})).status,503);
 assert.equal(forwarded,0);
 assert.equal((await ctx.api.feedbackRequest(req(data({to:'attacker@example.com'})),apiEnv)).status,200);
 assert.equal(forwarded,1);assert.equal(forwardBody.data.to,undefined);assert(/^[a-f0-9]{64}$/.test(forwardBody.client));assert(!JSON.stringify(forwardBody).includes('192.0.2.1'));
 vm.runInContext(strip(fs.readFileSync('worker/src/index.js','utf8')),ctx);
 const waits=[];const res=await ctx.entry.fetch(req(),apiEnv,{waitUntil:p=>waits.push(p)});assert.equal(res.status,200);assert.equal(res.headers.get('access-control-allow-origin'),env.FRONTEND_ORIGIN);assert.equal(res.headers.get('cache-control'),'no-store');await Promise.all(waits);
 console.log('feedback ok: validation, origin, limits, concurrency, dedupe, uncertain delivery, privacy, cleanup, routing');
})().catch(e=>{console.error(e);process.exit(1)});
