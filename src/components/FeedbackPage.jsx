import {useRef,useState} from 'react';
import {actions,useScoreboard} from '../store.js';
import {PUSH_API,APP_VERSION} from '../config.js';
import {t} from '../i18n.js';

function errorMessage(code){
  switch(code){
    case 'FEEDBACK_RATE_LIMIT':return t('送出太頻繁，請稍後再試。');
    case 'FEEDBACK_DAILY_LIMIT':return t('今日回饋已達上限，請明天再試。');
    case 'FEEDBACK_UNAVAILABLE':return t('回饋功能暫時無法使用，請稍後再試。');
    case 'FEEDBACK_UNCERTAIN':return t('寄送結果尚未確認，請勿重複送出。內容已保留。');
    case 'FEEDBACK_PENDING':return t('這則回饋仍在寄送中，請稍後再確認。');
    case 'INVALID_FEEDBACK':return t('請確認回饋內容與聯絡信箱是否正確。');
    default:return t('送出未完成，內容已保留，請稍後再試。');
  }
}

export function FeedbackPage(){
  const {selectedGamePk}=useScoreboard();
  const [type,setType]=useState('bug'),[message,setMessage]=useState(''),[email,setEmail]=useState('');
  const [busy,setBusy]=useState(false),[result,setResult]=useState(null);
  const website=useRef(null),inFlight=useRef(false),attempt=useRef(null);
  const update=fn=>value=>{fn(value);setResult(null)};
  async function submit(event){
    event.preventDefault();
    if(inFlight.current)return;
    if(message.trim().length<10){setResult({error:'short'});return;}
    const fields={type,message:message.trim(),email:email.trim(),version:APP_VERSION,gamePk:selectedGamePk||null};
    const signature=JSON.stringify(fields);
    // Retain the same ID after network failure. The server can acknowledge an already sent mail.
    if(attempt.current?.signature!==signature)attempt.current={signature,id:crypto.randomUUID()};
    inFlight.current=true;setBusy(true);setResult(null);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25_000);
    try{
      const response=await fetch(PUSH_API+'/api/feedback',{
        method:'POST',headers:{'content-type':'application/json'},signal:controller.signal,
        body:JSON.stringify({...fields,id:attempt.current.id,website:website.current?.value||''})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ok!==true)throw Object.assign(new Error('feedback'),{code:data.error});
      setMessage('');setEmail('');attempt.current=null;
      if(website.current)website.current.value='';
      setResult({ok:true});actions.notify(t('回饋已送出，謝謝你的建議！'));
    }catch(error){
      setResult({error:error.code||'network'});
      actions.notify(errorMessage(error.code),true);
    }finally{clearTimeout(timer);inFlight.current=false;setBusy(false);}
  }
  const types=[['bug',t('問題回報')],['idea',t('功能建議')],['other',t('其他')]];
  return <section className="card feedback-shell" aria-label={t('意見回饋')}>
    <div className="feedback-intro"><h3>{t('分享你的想法')}</h3><p>{t('遇到問題或有新點子，都可以在這裡告訴我。')}</p></div>
    <form className="feedback-form" onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy} className="feedback-fields">
        <fieldset className="feedback-kind"><legend>{t('回饋類型')}</legend><div className="feedback-types">
          {types.map(([value,label])=><label key={value} className={'feedback-type'+(type===value?' selected':'')}>
            <input type="radio" name="feedbackType" value={value} checked={type===value} onChange={()=>update(setType)(value)}/><span>{label}</span>
          </label>)}
        </div></fieldset>
        <div className="feedback-field"><label htmlFor="feedbackMessage">{t('回饋內容')}</label>
          <textarea id="feedbackMessage" required minLength={10} maxLength={2000} rows={6} value={message}
            placeholder={t('請描述遇到的問題，或你希望新增的功能…')} onChange={e=>update(setMessage)(e.target.value)} aria-describedby="feedbackLength"/>
          <small id="feedbackLength" className="feedback-count">{t('{n} / 2000 字，至少 10 字',{n:message.length})}</small>
        </div>
        <div className="feedback-field"><label htmlFor="feedbackEmail">{t('聯絡信箱（選填）')}</label>
          <input id="feedbackEmail" type="email" maxLength={254} autoComplete="email" inputMode="email" value={email}
            placeholder="you@example.com" onChange={e=>update(setEmail)(e.target.value)} aria-describedby="feedbackEmailHint"/>
          <small id="feedbackEmailHint">{t('如果希望收到回覆，可以留下信箱。')}</small>
        </div>
        <div className="feedback-trap" aria-hidden="true"><label>{t('請留空')}<input ref={website} name="website" tabIndex={-1} autoComplete="off"/></label></div>
        <p className="feedback-note">{t('內容會寄給網站維護者，並附上網站版本與目前比賽編號，方便確認問題。')}</p>
        <button className="feedback-submit" type="submit" disabled={busy}>{busy?t('送出中…'):t('送出回饋')}</button>
      </fieldset>
      <div className={'feedback-result'+(result?.error?' feedback-result-error':'')} role="status" aria-live="polite">
        {result?.ok?t('回饋已送出，謝謝你的建議！'):result?.error==='short'?t('請至少輸入 10 字的回饋內容。'):result?.error?errorMessage(result.error):''}
      </div>
    </form>
  </section>;
}
