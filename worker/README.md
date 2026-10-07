# MLB Score Notify Worker

Cloudflare Worker backend for MLB game monitoring.

## Deploy

Cloudflare Workers Builds:

- Repository: `b110212000/mlb-live-scoreboard`
- Root directory: `worker`
- Deploy command: `npx wrangler deploy`

## Current phase

This first deploy verifies:

- Worker deployment
- Durable Object provisioning
- Per-game `GameMonitor`
- 5 second polling while a game is live
- subscriber storage inside the game's Durable Object
- MLB scoring-play change detection

Web Push / VAPID delivery is intentionally not enabled yet. After the Worker is deployed successfully, the push delivery layer will be connected.

## Health check

```
GET /health
```

Expected response includes:

```json
{
  "ok": true,
  "service": "mlb-score-notify",
  "liveIntervalMs": 5000,
  "pushEnabled": false
}
```
