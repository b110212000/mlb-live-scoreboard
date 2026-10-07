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
