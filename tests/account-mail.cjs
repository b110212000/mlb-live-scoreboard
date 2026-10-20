const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto:crypto,randomUUID}=require('node:crypto');
const strip=s=>s.replace(/^import.*;$/gm,'').replace(/^export \{.*;$/gm,'').replace(/^export /gm,'');
const s={TextEncoder,btoa};vm.createContext(s);
vm.runInContext(strip(fs.readFileSync('worker/src/smtp.js','utf8'))+'\nglobalThis.valid=validEmail',s);
const ctx={TextEncoder,URL,validEmail:s.valid,WorkerEntrypoint:class{constructor(_,env){this.env=env}}};
vm.createContext(ctx);
vm.runInContext(strip(fs.readFileSync('worker/src/account-mail.js','utf8'))+
'\nglobalThis.mail={OrderLeadMailService,validOrderLeadMail,orderLeadMailContent}',ctx);
const valid=(kind='verify')=>({id:randomUUID(),kind,to:'person@example.com',
 link:'https://b110212000.github.io/stock-order-tracker/#/auth/'+
 (kind==='verify'?'email-verify':'reset-password')+'/'+('a'.repeat(43))});
const ok=valid();
assert(ctx.mail.validOrderLeadMail(ok));
assert.equal(ctx.mail.orderLeadMailContent(ok).kind,'orderlead-verify');
assert.equal(ctx.mail.orderLeadMailContent(valid('reset')).kind,'orderlead-reset');
for(const bad of [
 {...ok,to:'bad'}, {...ok,kind:'reset'},
 {...ok,link:ok.link.replace('https:','http:')},
 {...ok,link:ok.link.replace('b110212000.github.io','evil.example')},
 {...ok,link:ok.link+'?token=extra'},
 {...ok,subject:'injected'}, {...ok,id:'invalid'}]){
 assert.equal(ctx.mail.validOrderLeadMail(bad),false);
}
console.log('named mail RPC payload and fixed templates ok');
