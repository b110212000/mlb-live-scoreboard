import { DurableObject } from "cloudflare:workers";
import { sendGmail, validEmail } from "./smtp.js";

const DAY = 86_400_000, HOUR = 3_600_000, MAX_BYTES = 12_288;
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TYPES = { bug: "問題回報", idea: "功能建議", other: "其他" };
const reply = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export function feedbackConfigured(env) {
  return Boolean(env.FEEDBACK_SERVICE && validEmail(String(env.SMTP_USER || "").trim()) &&
    validEmail(String(env.FEEDBACK_TO_EMAIL || "").trim()) && String(env.SMTP_PASSWORD || "").trim());
}

export function normalizeFeedback(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || body.website) return null;
  if (typeof body.id !== "string" || !ID.test(body.id) || typeof body.type !== "string" || !Object.hasOwn(TYPES, body.type)) return null;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (message.length < 10 || message.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(message) || (email && !validEmail(email))) return null;
  if (body.email != null && typeof body.email !== "string") return null;
  return {
    id: body.id.toLowerCase(), type: body.type, message, email,
    version: typeof body.version === "string" && /^\d+\.\d+\.\d+$/.test(body.version) && body.version.length < 30 ? body.version : "unknown",
    gamePk: Number.isSafeInteger(body.gamePk) && body.gamePk > 0 ? body.gamePk : null
  };
}

async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) throw new Error("TYPE");
  if (Number(request.headers.get("content-length")) > MAX_BYTES) throw new Error("SIZE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("BODY");
  const decoder = new TextDecoder(); let text = "", bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error("SIZE"); }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

async function digest(text) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), x => x.toString(16).padStart(2, "0")).join("");
}

export async function feedbackRequest(request, env) {
  if (request.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
  // CORS alone does not reject cross-site submissions. Require the configured site origin.
  if (!env.FRONTEND_ORIGIN || request.headers.get("origin") !== env.FRONTEND_ORIGIN) return reply({ error: "FORBIDDEN" }, 403);
  if (!feedbackConfigured(env)) return reply({ error: "FEEDBACK_UNAVAILABLE" }, 503);
  let data;
  try { data = normalizeFeedback(await readBody(request)); }
  catch (error) { return reply({ error: "INVALID_FEEDBACK" }, error.message === "SIZE" ? 413 : error.message === "TYPE" ? 415 : 400); }
  if (!data) return reply({ error: "INVALID_FEEDBACK" }, 400);
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) return reply({ error: "FEEDBACK_UNAVAILABLE" }, 503);
  // Secret-keyed HMAC: retain no raw IP address in rate-limit storage or email.
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SMTP_PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const client = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip))), x => x.toString(16).padStart(2, "0")).join("");
  const stub = env.FEEDBACK_SERVICE.get(env.FEEDBACK_SERVICE.idFromName("global"));
  return stub.fetch(new Request("https://feedback.internal/send", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data, client })
  }));
}

export class FeedbackService extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.ctx = ctx; this.env = env; }

  async fetch(request) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/send") return reply({ error: "NOT_FOUND" }, 404);
    const { data: input, client } = await request.json();
    const data = normalizeFeedback(input);
    if (!data || !/^[a-f0-9]{64}$/.test(client)) return reply({ error: "INVALID_FEEDBACK" }, 400);
    const hash = await digest(JSON.stringify(data));
    const reservation = await this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now(), day = Math.floor(now / DAY), hour = Math.floor(now / HOUR);
      const state = await this.ctx.storage.get("feedback") || { day, count: 0, clients: {}, requests: {} };
      for (const [id, item] of Object.entries(state.requests)) if (now - item.at >= DAY) delete state.requests[id];
      for (const [id, item] of Object.entries(state.clients)) if (now - item.at >= HOUR) delete state.clients[id];
      const previous = state.requests[data.id];
      if (previous) {
        if (previous.hash !== hash || previous.client !== client) return reply({ error: "FEEDBACK_ID_CONFLICT" }, 409);
        if (previous.status === "sent") return reply({ ok: true, id: data.id });
        if (previous.status === "uncertain" || (previous.status === "pending" && now - previous.at > 25_000)) return reply({ error: "FEEDBACK_UNCERTAIN" }, 409);
        if (previous.status === "pending") return reply({ error: "FEEDBACK_PENDING" }, 409);
      }
      if (state.day !== day) { state.day = day; state.count = 0; }
      if (state.count >= 100) return reply({ error: "FEEDBACK_DAILY_LIMIT" }, 429);
      const limit = state.clients[client];
      if (limit && (now - limit.at < 30_000 || (limit.hour === hour && limit.count >= 5))) return reply({ error: "FEEDBACK_RATE_LIMIT" }, 429);
      // Reserve before network I/O, so parallel/retried requests cannot send duplicate mail.
      state.count++;
      state.clients[client] = { hour, at: now, count: limit?.hour === hour ? limit.count + 1 : 1 };
      state.requests[data.id] = { hash, client, at: now, status: "pending" };
      await this.ctx.storage.put("feedback", state);
      if (!await this.ctx.storage.getAlarm()) await this.ctx.storage.setAlarm(now + DAY);
      return null;
    });
    if (reservation) return reservation;
    const task = this.deliver(data);
    this.ctx.waitUntil(task);
    return task;
  }

  async deliver(data) {
    let status = "sent";
    try {
      await sendGmail(this.env, {
        id: data.id, replyTo: data.email, subject: `[MLB 回饋] ${TYPES[data.type]}`,
        text: ["MLB 即時戰況 — 使用者回饋", `類型：${TYPES[data.type]}`, `時間：${new Date().toISOString()}`,
          `網站版本：${data.version}`, `比賽 ID：${data.gamePk || "未選擇"}`, `聯絡信箱：${data.email || "未提供"}`,
          `回饋編號：${data.id}`, "", "回饋內容：", data.message].join("\n")
      });
    } catch (error) {
      status = error.uncertain ? "uncertain" : "failed";
      console.warn("Feedback delivery failed", { id: data.id, code: status, stage: error.stage || "config" });
    }
    await this.ctx.blockConcurrencyWhile(async () => {
      const state = await this.ctx.storage.get("feedback");
      if (state?.requests[data.id]) {
        state.requests[data.id].status = status;
        await this.ctx.storage.put("feedback", state);
      }
    });
    return status === "sent" ? reply({ ok: true, id: data.id }) : reply({ error: status === "uncertain" ? "FEEDBACK_UNCERTAIN" : "FEEDBACK_SEND_FAILED" }, 502);
  }

  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      const state = await this.ctx.storage.get("feedback"); if (!state) return;
      const now = Date.now();
      for (const [id, item] of Object.entries(state.requests)) if (now - item.at >= DAY) delete state.requests[id];
      for (const [id, item] of Object.entries(state.clients)) if (now - item.at >= HOUR) delete state.clients[id];
      if (!Object.keys(state.requests).length) await this.ctx.storage.delete("feedback");
      else { await this.ctx.storage.put("feedback", state); await this.ctx.storage.setAlarm(Math.min(...Object.values(state.requests).map(item => item.at + DAY))); }
    });
  }
}
