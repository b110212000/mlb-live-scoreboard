import { DurableObject } from "cloudflare:workers";
import webpush from "web-push";

const TEST_DELAY_MS = 30_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const publicRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey)
  );
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);

  if (!privateJwk.d) throw new Error("VAPID_PRIVATE_KEY_EXPORT_FAILED");

  return {
    publicKey: toBase64Url(publicRaw),
    privateKey: privateJwk.d
  };
}

function validSubscription(value) {
  return Boolean(
    value &&
    typeof value.endpoint === "string" &&
    value.endpoint.startsWith("https://") &&
    value.keys &&
    typeof value.keys.p256dh === "string" &&
    typeof value.keys.auth === "string"
  );
}

export class PushService extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async ensureVapidKeys() {
    let keys = await this.ctx.storage.get("vapidKeys");
    if (keys?.publicKey && keys?.privateKey) return keys;

    keys = await generateVapidKeys();
    await this.ctx.storage.put("vapidKeys", keys);
    return keys;
  }

  async send(subscription, payload) {
    const keys = await this.ensureVapidKeys();
    webpush.setVapidDetails(
      this.env.VAPID_SUBJECT || this.env.FRONTEND_ORIGIN || "https://example.com",
      keys.publicKey,
      keys.privateKey
    );

    return webpush.sendNotification(
      subscription,
      JSON.stringify(payload),
      { TTL: 120 }
    );
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/public-key") {
      const keys = await this.ensureVapidKeys();
      return json({ publicKey: keys.publicKey });
    }

    if (request.method === "POST" && url.pathname === "/test") {
      return this.createTest(request);
    }

    if (request.method === "POST" && url.pathname === "/send") {
      return this.sendBatch(request);
    }

    if (request.method === "GET" && url.pathname === "/status") {
      const pending = await this.ctx.storage.get("pendingTests") || [];
      return json({
        ok: true,
        pending: pending.length,
        nextAlarmAt: await this.ctx.storage.getAlarm()
      });
    }

    return json({ error: "NOT_FOUND" }, 404);
  }

  async sendBatch(request) {
    const body = await request.json().catch(() => ({}));
    const subscriptions = Array.isArray(body.subscriptions) ? body.subscriptions : [];
    const payload = body.payload && typeof body.payload === "object" ? body.payload : null;

    if (!payload || subscriptions.length === 0) {
      return json({ error: "INVALID_PUSH_BATCH" }, 400);
    }

    const results = [];
    for (const subscription of subscriptions) {
      const endpoint = subscription?.endpoint || "";
      if (!validSubscription(subscription)) {
        results.push({ endpoint, ok: false, expired: false, statusCode: 400 });
        continue;
      }

      try {
        await this.send(subscription, payload);
        results.push({ endpoint, ok: true, expired: false, statusCode: 201 });
      } catch (error) {
        const statusCode = Number(error?.statusCode) || 0;
        results.push({
          endpoint,
          ok: false,
          expired: statusCode === 404 || statusCode === 410,
          statusCode,
          message: error?.message || String(error)
        });
      }
    }

    return json({
      ok: true,
      sent: results.filter(item => item.ok).length,
      expired: results.filter(item => item.expired).length,
      results
    });
  }

  async createTest(request) {
    const body = await request.json().catch(() => ({}));
    const subscription = body.subscription;

    if (!validSubscription(subscription)) {
      return json({ error: "INVALID_PUSH_SUBSCRIPTION" }, 400);
    }

    const testId = crypto.randomUUID();
    const createdAt = Date.now();

    try {
      await this.send(subscription, {
        title: "MLB 戰況通知測試",
        body: "第一則測試通知成功。30 秒後還會再收到一則背景通知。",
        tag: `push-test-now-${testId}`,
        url: "./?view=notifications",
        testId,
        stage: "immediate"
      });
    } catch (error) {
      console.error("Immediate push failed", {
        testId,
        statusCode: error?.statusCode,
        message: error?.message || String(error)
      });
      return json({
        error: "IMMEDIATE_PUSH_FAILED",
        message: error?.message || String(error),
        statusCode: error?.statusCode || null
      }, 502);
    }

    const pending = await this.ctx.storage.get("pendingTests") || [];
    pending.push({
      testId,
      dueAt: createdAt + TEST_DELAY_MS,
      subscription
    });
    await this.ctx.storage.put("pendingTests", pending);
    await this.scheduleNextAlarm(pending);

    return json({
      ok: true,
      testId,
      immediateSent: true,
      delayedAfterMs: TEST_DELAY_MS,
      delayedScheduledAt: createdAt + TEST_DELAY_MS
    });
  }

  async scheduleNextAlarm(pending) {
    if (!pending.length) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    const nextAt = Math.min(...pending.map(item => Number(item.dueAt)));
    await this.ctx.storage.setAlarm(nextAt);
  }

  async alarm() {
    const now = Date.now();
    const pending = await this.ctx.storage.get("pendingTests") || [];
    const due = pending.filter(item => Number(item.dueAt) <= now + 1000);
    const remaining = pending.filter(item => Number(item.dueAt) > now + 1000);

    for (const item of due) {
      try {
        await this.send(item.subscription, {
          title: "MLB 戰況背景通知測試",
          body: "30 秒背景通知成功。關閉網站後也能由 Cloudflare Web Push 喚醒通知。",
          tag: `push-test-delayed-${item.testId}`,
          url: "./?view=notifications",
          testId: item.testId,
          stage: "delayed"
        });
      } catch (error) {
        console.error("Delayed push failed", {
          testId: item.testId,
          statusCode: error?.statusCode,
          message: error?.message || String(error)
        });
      }
    }

    await this.ctx.storage.put("pendingTests", remaining);
    await this.scheduleNextAlarm(remaining);
  }
}
