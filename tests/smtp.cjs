const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('worker/src/smtp.js','utf8').replace(/^import.*;$/gm,'').replace(/^export /gm,'');
function runtime(extra={}){
 const ctx={TextEncoder,TextDecoder,btoa,setTimeout,clearTimeout,...extra};vm.createContext(ctx);
 vm.runInContext(source+'\nglobalThis.api={sendGmail,createMail,validEmail};',ctx);return ctx.api;
}
const env={SMTP_USER:'sender@gmail.com',SMTP_PASSWORD:'app password for test',FEEDBACK_TO_EMAIL:'owner@gmail.com'};
const message={id:'b2158024-4058-4c1e-a62e-c3e62b225f3a',replyTo:'visitor@example.com',subject:'[MLB 回饋] 問題回報',text:'中文意見\n.\r\nBcc: injected@example.com\n<script>hello</script>'};
function connection({rejectAt=-1,disconnectAt=-1,quitError=false,hang=false}={}){
 const replies=['250-gmail\r\n250 AUTH LOGIN\r\n','334 user\r\n','334 password\r\n','235 OK\r\n','250 OK\r\n','250 OK\r\n','354 Go\r\n','250 Accepted\r\n','221 Bye\r\n'];
 let ctrl,index=0,closed=false;const writes=[];
 const emit=text=>{const bytes=new TextEncoder().encode(text);for(let i=0;i<bytes.length;i+=3)ctrl.enqueue(bytes.slice(i,i+3));};
 const socket={opened:Promise.resolve(),closed:Promise.resolve(),readable:new ReadableStream({start(c){ctrl=c;if(!hang)emit('220 gmail\r\n')}}),
  writable:new WritableStream({write(bytes){const text=new TextDecoder().decode(bytes);writes.push(text);const current=index++;
   if(current===disconnectAt){ctrl.close();closed=true;return;}
   if(current===8&&quitError)throw new Error('QUIT failed');
   emit(current===rejectAt?'535 rejected\r\n':replies[current]);
  }}),close:async()=>{if(!closed){closed=true;ctrl.close();}}};
 return {writes,open:(address,options)=>{assert.deepEqual(JSON.parse(JSON.stringify(address)),{hostname:'smtp.gmail.com',port:465});assert.equal(options.secureTransport,'on');return socket;},get closed(){return closed}};
}
(async()=>{
 const api=runtime();
 for(const email of ['a@gmail.com','a.b+tag@example.co.uk'])assert(api.validEmail(email));
 for(const email of ['a@gmail.com\r\nBcc:x@y.com','a@x.com>','bad','a b@x.com'])assert(!api.validEmail(email));
 const mail=api.createMail({...message,from:env.SMTP_USER,to:env.FEEDBACK_TO_EMAIL});
 assert(mail.includes('Reply-To: <visitor@example.com>'));
 assert(!mail.includes('Bcc: injected'));assert.equal(Buffer.from(mail.split('\r\n\r\n')[1].replace(/\r\n/g,''),'base64').toString(),message.text);
 assert.throws(()=>api.createMail({...message,from:env.SMTP_USER,to:'x@y.com\r\nBcc:z@y.com'}));
 const good=connection();assert.equal((await api.sendGmail(env,message,good.open)).accepted,true);assert(good.closed);
 // Reusable server-only recipient: OrderLead signup/reset email can go to
 // an individual verified address without FEEDBACK_TO_EMAIL being configured.
 const mailEnv={SMTP_USER:env.SMTP_USER,SMTP_PASSWORD:env.SMTP_PASSWORD};
 const verifyMail={...message,to:'new-account@example.com',kind:'orderlead-verify',
   subject:'OrderLead Email 驗證',text:'請完成 Email 驗證'};
 const verifyConn=connection();
 assert.equal((await api.sendGmail(mailEnv,verifyMail,verifyConn.open)).accepted,true);
 assert.equal(verifyConn.writes[5],'RCPT TO:<new-account@example.com>\\r\\n'.replace(/\\r/g,'\\r'));
 const verifyMime=verifyConn.writes[7];
 assert(verifyMime.includes('From: OrderLead <sender@gmail.com>'));
 assert(verifyMime.includes('To: <new-account@example.com>'));
 assert(verifyMime.includes('Message-ID: <orderlead-verify-'));
 const resetConn=connection();
 assert.equal((await api.sendGmail(mailEnv,{...verifyMail,kind:'orderlead-reset',
   to:'new-account+reset@example.com'},resetConn.open)).accepted,true);
 assert.equal(resetConn.writes[5],'RCPT TO:<new-account+reset@example.com>\\r\\n'.replace(/\\r/g,'\\r'));
 assert(resetConn.writes[7].includes('Message-ID: <orderlead-reset-'));
 // A user-controlled recipient that is not a single valid address must
 // be rejected before opening a socket or sending an SMTP command.
 for(const badTo of ['', 'a@example.com\\r\\nBcc:evil@example.com',
   'person@example.com,evil@example.com', 'bad', 1, null]){
   await assert.rejects(api.sendGmail(mailEnv,{...verifyMail,to:badTo},
     ()=>{throw Error('MUST_NOT_CONNECT')}),/SMTP_CONFIG/);
 }
 await assert.rejects(api.sendGmail(mailEnv,{...verifyMail,kind:'evil\\r\\nBcc:'},
   ()=>{throw Error('MUST_NOT_CONNECT')}),/SMTP_CONFIG/);

 assert.equal(good.writes[2],Buffer.from(env.SMTP_USER).toString('base64')+'\r\n');
 assert.equal(good.writes[3],Buffer.from('apppasswordfortest').toString('base64')+'\r\n');
 assert.equal(good.writes[5],'RCPT TO:<owner@gmail.com>\r\n');assert(good.writes[7].endsWith('\r\n.\r\n'));
 const bad=connection({rejectAt:3});await assert.rejects(api.sendGmail(env,message,bad.open),e=>e.message==='SMTP_FAILED'&&!e.uncertain&&!String(e).includes(env.SMTP_PASSWORD));
 const unknown=connection({disconnectAt:7});await assert.rejects(api.sendGmail(env,message,unknown.open),e=>e.uncertain===true);
 const denied=connection({rejectAt:7});await assert.rejects(api.sendGmail(env,message,denied.open),e=>e.uncertain===false);
 const bye=connection({quitError:true});assert.equal((await api.sendGmail(env,message,bye.open)).accepted,true);
 const timeout=connection({hang:true});const fast=runtime({setTimeout:fn=>setTimeout(fn,5)});await assert.rejects(fast.sendGmail(env,message,timeout.open),e=>!e.uncertain);assert(timeout.closed);
 await assert.rejects(api.sendGmail({...env,SMTP_PASSWORD:''},message,()=>{throw new Error('should not connect')}),/SMTP_CONFIG/);
 console.log('smtp ok: TLS, fragmented multiline replies, UTF-8, injection, auth, timeout, uncertain delivery, QUIT');
})().catch(e=>{console.error(e);process.exit(1)});
