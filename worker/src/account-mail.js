import { WorkerEntrypoint } from "cloudflare:workers";
import { validEmail } from "./smtp.js";

// The only available capability is a named RPC entrypoint that can be bound
// by another Worker in this Cloudflare account. The default public fetch
// handler remains unchanged: no /api/mail or anonymous SMTP endpoint.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const token="[A-Za-z0-9_-]{43}";
const fragment={
  verify:new RegExp("^#/auth/email-verify/"+token+"$"),
  reset:new RegExp("^#/auth/reset-password/"+token+"$")
};
const FRONTEND="https://b110212000.github.io";
const PATH="/stock-order-tracker/";

export function validOrderLeadMail(message){
  if(!message||typeof message!=="object"||Array.isArray(message)||
    Object.keys(message).sort().join(",")!=="id,kind,link,to"||
    typeof message.id!=="string"||!uuid.test(message.id)||
    (message.kind!=="verify"&&message.kind!=="reset")||
    !validEmail(message.to)||typeof message.link!=="string"||
    message.link.length>350||message.link.length<80)return false;
  let parsed;
  try{parsed=new URL(message.link);}catch{return false;}
  return parsed.protocol==="https:"&&parsed.origin===FRONTEND&&
    parsed.pathname===PATH&&parsed.search===""&&
    fragment[message.kind].test(parsed.hash);
}

/** No arbitrary sender name, subject, body or Reply-To may be supplied. */
export function orderLeadMailContent(message){
  if(!validOrderLeadMail(message))throw Error("MAIL_INVALID");
  const verify=message.kind==="verify";
  return {
    id:message.id,to:message.to,
    kind:verify?"orderlead-verify":"orderlead-reset",
    subject:verify?"OrderLead 信箱驗證":"OrderLead 重設登入密碼",
    text:[
      verify?"請使用以下連結驗證 OrderLead 信箱：":"請使用以下連結重新設定 OrderLead 的密碼：",
      message.link,"",
      verify?"此驗證連結預計於 30 分鐘後失效。":"此重設連結預計於 15 分鐘後失效。",
      "若不是你本人操作，請忽略此信。不要將連結轉傳給他人。"
    ].join("\n")
  };
}

export class OrderLeadMailService extends WorkerEntrypoint {
  async sendAuthMail(message){
    // Validate again inside the receiving Worker; the source must be a
    // trusted account Worker and never a forwarded browser payload.
    if(!validOrderLeadMail(message))throw Error("MAIL_INVALID");
    if(!this.env?.FEEDBACK_SERVICE||
      typeof this.env.SMTP_USER!=="string"||
      typeof this.env.SMTP_PASSWORD!=="string"){
      throw Error("MAIL_UNAVAILABLE");
    }
    const stub=this.env.FEEDBACK_SERVICE.get(
      this.env.FEEDBACK_SERVICE.idFromName("global")
    );
    // Private Durable Object endpoint. Not handled by public index.js.
    const res=await stub.fetch(new Request("https://feedback.internal/orderlead-mail",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify(message)
    }));
    if(res.status!==200)throw Error(res.status===429?"MAIL_RATE_LIMITED":"MAIL_FAILED");
    return {accepted:true};
  }
}
