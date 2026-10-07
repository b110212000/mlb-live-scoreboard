# MLB Score Notify Worker

Cloudflare Worker backend for MLB game monitoring.

## Deploy

Cloudflare Workers Builds:

- Repository: `b110212000/mlb-live-scoreboard`
- Root directory: `worker`
- Deploy command: `npx wrangler deploy`

## Current phase: monitoring foundation

Web Push is intentionally disabled for now.

This phase verifies the backend independently before adding browser notification permission, VAPID keys, Service Worker push handling, or notification UI.

Implemented:

- Worker deployment
- Durable Object provisioning
- one `GameMonitor` per MLB `gamePk`
- persistent monitor state
- MLB live-feed polling
- 5 second polling while a game is live
- 30 second polling while the game is not live
- scoring-play count / latest scoring event tracking
- automatic stop at Final
- subscriber storage reserved for the later Web Push phase
- diagnostic monitor APIs

## Health check

```
GET /health
```

Expected response:

```json
{
  "ok": true,
  "service": "mlb-score-notify",
  "phase": "monitoring-foundation",
  "durableObject": "GameMonitor",
  "liveIntervalMs": 5000,
  "idleIntervalMs": 30000,
  "pushEnabled": false
}
```

## Monitor-only test

Start monitoring a game without any Push subscription:

```
POST /api/monitor/start
Content-Type: application/json

{
  "gamePk": 123456
}
```

Read persisted state:

```
GET /api/monitor/123456
```

Force one immediate MLB check:

```
POST /api/monitor/123456/check
```

Stop the monitor:

```
DELETE /api/monitor/123456
```

The monitor-only endpoints are for validating Cloudflare + Durable Objects + MLB polling before Web Push is enabled.

## Notification phase

Not enabled yet.

The next phase will add:

- VAPID public/private key configuration
- browser `PushSubscription`
- Service Worker `push` and `notificationclick`
- score notification delivery
- frontend reserve/cancel notification controls

The VAPID private key must be stored as a Cloudflare secret and must never be committed to this public repository.


## Web Push test phase

A dedicated `PushService` Durable Object now validates Web Push before MLB game subscriptions are enabled.

The frontend notification page performs this sequence:

1. Request notification permission from a user click.
2. Register the push-only `service-worker.js`.
3. Fetch the server VAPID public key.
4. Create a browser `PushSubscription`.
5. Call `POST /api/push/test`.
6. Cloudflare immediately sends the first real Web Push notification.
7. `PushService` stores a one-time test and schedules a Durable Object alarm for 30 seconds later.
8. The alarm sends the second real Web Push notification.

The VAPID key pair is generated server-side on first use and persisted in the singleton `PushService` Durable Object. Only the public key is exposed by the API; the private key is never committed to GitHub or returned to the browser.

Routes:

```
GET  /api/push/public-key
POST /api/push/test
GET  /api/push/status
```

The service worker intentionally has no `fetch` handler and does not cache application assets. It only handles Push notifications and notification clicks, while deleting any legacy Cache Storage entries during activation.

`pushTestEnabled: true` means the test flow is available. `pushEnabled: false` remains false until real MLB game subscriptions are connected to the push delivery layer.
