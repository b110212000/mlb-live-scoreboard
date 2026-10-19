import { connect } from "cloudflare:sockets";

// This client only submits authenticated mail to Gmail over implicit TLS.
// Only TRUSTED server-side callers may select recipients; NEVER forward public body.to.
// The SMTP credential stays a Cloudflare Worker Secret, not a browser/API field.
export const validEmail = value => typeof value === "string" && value.length <= 254 &&
  /^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value);

function base64(text) {
  return btoa(Array.from(new TextEncoder().encode(text), byte => String.fromCharCode(byte)).join(""));
}

// Brand labels are fixed server-defined values, not caller-provided header text.
const mailKinds = Object.freeze({
  "mlb-feedback": { label: "MLB Feedback", prefix: "feedback" },
  "orderlead-verify": { label: "OrderLead", prefix: "orderlead-verify" },
  "orderlead-reset": { label: "OrderLead", prefix: "orderlead-reset" }
});

export function createMail({ from, to, replyTo, subject, text, id, kind = "mlb-feedback" }) {
  if (!validEmail(from) || !validEmail(to) || (replyTo && !validEmail(replyTo))) throw new Error("SMTP_CONFIG");
  if (typeof kind !== "string" || !Object.hasOwn(mailKinds, kind)) throw new Error("SMTP_CONFIG");
  if (typeof subject !== "string" || typeof text !== "string" || !text.length) throw new Error("SMTP_CONFIG");
  const { label, prefix } = mailKinds[kind];
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("SMTP_MESSAGE_ID");
  const headers = [
    `From: ${label} <${from}>`, `To: <${to}>`,
    ...(replyTo ? [`Reply-To: <${replyTo}>`] : []),
    `Subject: =?UTF-8?B?${base64(subject)}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${prefix}-${id}@${from.split("@")[1]}>`,
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64"
  ];
  // Base64 body also prevents SMTP dot-termination / header injection by feedback text.
  return headers.join("\r\n") + "\r\n\r\n" + base64(text).match(/.{1,76}/g).join("\r\n") + "\r\n";
}

export async function sendGmail(env, message, openSocket = connect) {
  const user = String(env.SMTP_USER || "").trim();
  const password = String(env.SMTP_PASSWORD || "").replace(/\s/g, "");
  // message.to must originate from a verified backend workflow (never an
  // unchecked frontend field). Keep the old feedback recipient as fallback.
  const chosen = message.to === undefined ? env.FEEDBACK_TO_EMAIL : message.to;
  const to = typeof chosen === "string" ? chosen.trim() : "";
  if (!validEmail(user) || !validEmail(to) || !password) throw new Error("SMTP_CONFIG");
  const mail = createMail({ ...message, from: user, to });
  const socket = openSocket({ hostname: "smtp.gmail.com", port: 465 }, { secureTransport: "on" });
  const reader = socket.readable.getReader(), writer = socket.writable.getWriter();
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  let buffer = "", dataStarted = false, definitive = false, accepted = false, stage = "connect", timer;
  // Do not log server replies or authentication commands: they may contain credentials.
  socket.closed.catch(() => {});
  async function response(expected) {
    let code = null, lines = 0;
    while (true) {
      while (!buffer.includes("\r\n")) {
        const { value, done } = await reader.read();
        if (done) throw new Error("SMTP_DISCONNECTED");
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 16_384) throw new Error("SMTP_INVALID_RESPONSE");
      }
      const end = buffer.indexOf("\r\n"), line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const match = /^(\d{3})([ -])/.exec(line);
      if (!match || ++lines > 100 || (code && code !== match[1])) throw new Error("SMTP_INVALID_RESPONSE");
      code = match[1];
      if (match[2] === "-") continue;
      if (!expected.includes(Number(code))) {
        definitive = true;
        throw new Error("SMTP_REJECTED");
      }
      return;
    }
  }
  async function command(value, expected) {
    await writer.write(encoder.encode(value + "\r\n"));
    await response(expected);
  }
  const transaction = async () => {
    await socket.opened;
    await response([220]);
    stage = "hello";
    await command("EHLO mlb-feedback", [250]);
    stage = "auth";
    await command("AUTH LOGIN", [334]);
    await command(base64(user), [334]);
    await command(base64(password), [235]);
    stage = "envelope";
    await command(`MAIL FROM:<${user}>`, [250]);
    await command(`RCPT TO:<${to}>`, [250, 251]);
    await command("DATA", [354]);
    stage = "data";
    dataStarted = true;
    await writer.write(encoder.encode(mail + ".\r\n"));
    await response([250]);
    accepted = true;
    // A lost QUIT response cannot turn an accepted message into a failure / duplicate.
    writer.write(encoder.encode("QUIT\r\n")).catch(() => {});
    return { accepted: true };
  };
  try {
    return await Promise.race([
      transaction(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("SMTP_TIMEOUT")), 18_000); })
    ]);
  } catch (error) {
    const safe = new Error(error.message === "SMTP_CONFIG" ? "SMTP_CONFIG" : "SMTP_FAILED");
    safe.uncertain = dataStarted && !definitive && !accepted;
    safe.stage = stage;
    throw safe;
  } finally {
    clearTimeout(timer);
    socket.close().catch(() => {});
  }
}
