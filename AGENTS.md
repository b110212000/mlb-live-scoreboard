# MLB scoreboard maintenance

- React entry: src/main.jsx. App/navigation: src/App.jsx. Components: src/components.
- Engine compatibility modules in src/engine retain tested MLB/Web Push/detail renderer logic. React-managed DOM must not be mutated by engine code. Fixed detail hosts are intentionally memoized and remain mounted between page switches.
- Build using npm ci and npm run build; test using npm test (install Playwright Chromium first). Commit package-lock.json and generated root index.html, assets/app-<version>.js, its license file, and generated PNG icons, since GitHub Pages serves the root directly.
- Preserve the existing Worker and subscription format unless the task specifically calls for changing them.
- worker/ is deployed by Cloudflare Workers Builds, which runs `npm ci` in worker/. Keep worker/package-lock.json committed and regenerate it whenever worker/package.json changes (missing lockfile caused silent EUSAGE build failures from b774582 to 73e7065).
- A healthy /health does NOT prove a Worker deploy succeeded (the old deploy stays live). After pushing worker/ changes, verify the commit's "Workers Builds: mlb-score-notify" GitHub check-run is success, and that /api/push/public-key is unchanged.
- Subscriptions (v2.1.0+): the per-device DeviceRegistry Durable Object (worker/src/device-registry.js, keyed by the frontend deviceId) is the source of truth for a device's subscribed games, followed teams and notification prefs; it drives each game's GameMonitor via POST/DELETE /watch. The bell and the 訂閱管理 page use /api/devices/:deviceId/*. GameMonitor subscribers carry `prefs` (missing = all on, see worker/src/prefs.js); keep /api/watch working for old cached clients.
- Postponed/cancelled/removed games (codedGameState D/C/X, MLB reports Postponed as abstract "Final") are NOT final: never send 「比賽結束」 for them; use isCalledOffGame in worker/src/mlb.js.
- Only integrate official public APIs or properly licensed data. The owner rejected CPBL/NPB support because they lack public APIs (scraping or undocumented internal endpoints are not acceptable).
- Follow user version rules: bug/UI patch +1, feature minor +1, major only explicitly requested.
- Before repository writes, read the latest main SHA. Never overwrite concurrent changes.
- Keep footer, package version, resource version references, README and icons in sync. version.json must be updated LAST in a separate commit after deployed assets have been verified.
- Do not describe browser simulations as physical iPhone/Web Push tests.
