const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto:crypto,randomUUID}=require('node:crypto');
const strip=s=>s.replace(/^import.*;$/gm,'').replace(/^export \{.*;$/gm,'').replace(/^export /gm,'');
const smtp={TextEncoder,btoa};vm.createContext(smtp);
vm.runInContext(strip(fs.readFileSync('worker/src/smtp.js','utf8'))+'\nglobalThis.valid=validEmail;',smtp);
const sends=[];
let fail=false;
const ctx={Response,Request,Headers,URL,TextEncoder,TextDecoder,crypto,Date,
 validEmail:smtp.valid,DurableObject:class{},WorkerEntrypoint:class{
   constructor(_,env){this.env=env}
 },sendGmail:async(_,payload)=>{
   sends.push(payload);
   if(fail)throw Object.assign(Error('lost'),{uncertain:true});
   return {accepted:true};
 }};
vm.createContext(ctx);
vm.runInContext(strip(fs.readFileSync('worker/src/account-mail.js','utf8'))+
 '\nglobalThis.Api={OrderLeadMailService,validOrderLeadMail,orderLeadMailContent}',ctx);
ctx.validOrderLeadMail=ctx.Api.validOrderLeadMail;
ctx.orderLeadMailContent=ctx.Api.orderLeadMailContent;
vm.runInContext(strip(fs.readFileSync('worker/src/feedback.js','utf8'))+
 '\nglobalThis.FeedbackService=FeedbackService',ctx);
const store=new Map();
const env={SMTP_USER:'sender@gmail.com',SMTP_PASSWORD:'test-app-password'};
const storage={get:async k=>structuredClone(store.get(k)),
 put:async(k,v)=>store.set(k,structuredClone(v)),delete:async k=>store.delete(k),
 getAlarm:async()=>null,setAlarm:async()=>{}};
let queue=Promise.resolve();
const doCtx={storage,blockConcurrencyWhile:fn=>{
 const result=queue.then(fn);queue=result.catch(()=>{});return result;
},waitUntil:p=>p.catch(()=>{})};
const dobj=new ctx.FeedbackService(doCtx,env);
env.FEEDBACK_SERVICE={idFromName:()=>1,get:()=>({fetch:req=>dobj.fetch(req)})};
const rpc=new ctx.Api.OrderLeadMailService(null,env);
const make=(to='user@example.com',kind='verify')=>({id:randomUUID(),kind,to,
 link:'https://b110212000.github.io/stock-order-tracker/#/auth/'+
 (kind==='verify'?'email-verify':'reset-password')+'/'+('a'.repeat(43))});
(async()=>{
 const first=make();
 assert.equal((await rpc.sendAuthMail(first)).accepted,true);
 assert.equal(sends.length,1);
 assert.equal(sends[0].to,first.to);
 assert.equal((await rpc.sendAuthMail(first)).accepted,true);
 assert.equal(sends.length,1,'idempotent repeated send');
 const stored=JSON.stringify(store.get('orderleadMail'));
 assert(!stored.includes(first.to));
 assert(!stored.includes(first.link));
 assert(!stored.includes('a'.repeat(43)));
 const reset=make('reset@example.com','reset');
 assert.equal((await rpc.sendAuthMail(reset)).accepted,true);
 assert.equal(sends.at(-1).kind,'orderlead-reset');
 for(let i=0;i<5;i++)await rpc.sendAuthMail(make('limited@example.com'));
 await assert.rejects(rpc.sendAuthMail(make('limited@example.com')),/MAIL_RATE_LIMITED/);
 const previous=sends.length;fail=true;
 const uncertain=make('uncertain@example.com');
 await assert.rejects(rpc.sendAuthMail(uncertain),/MAIL_FAILED/);
 fail=false;
 await assert.rejects(rpc.sendAuthMail(uncertain),/MAIL_FAILED/);
 assert.equal(sends.length,previous+1);
 const source=fs.readFileSync('worker/src/index.js','utf8');
 assert(source.includes('export { OrderLeadMailService }'));
 assert(!source.includes('/api/send-mail'));
 console.log('private mail Durable Object: accepted, dedup, recipient limits, no secrets persisted');
})().catch(e=>{console.error(e);process.exitCode=1});
