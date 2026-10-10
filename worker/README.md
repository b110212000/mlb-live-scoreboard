# MLB Score Notify Worker

MLB 季後賽即時戰況的 Cloudflare Worker 後端，負責單場比賽的 Web Push 通知與訂閱管理（追蹤球隊、提醒項目）。前端的比分資料仍由瀏覽器直接讀取 MLB Stats API，不經過這個 Worker。

正式網址：<https://mlb-score-notify.b110212000.workers.dev>

## 架構

```text
前端 (GitHub Pages)
   │  /api/devices/:deviceId/...（訂閱管理、鈴鐺）
   ▼
Worker (src/index.js) ── 路由與 CORS
   │
   ├── DeviceRegistry Durable Object（每個 deviceId 一個）
   │     ├── 保存推播訂閱、預設提醒項目、追蹤球隊、已訂閱場次（含單場自訂）
   │     ├── 每小時以 Alarm 同步賽程：自動訂閱追蹤球隊的季後賽、清掉終場 / 延賽場次
   │     └── 以 POST/DELETE /watch 呼叫各場 GameMonitor
   │
   ├── GameMonitor Durable Object（每個 gamePk 一個）
   │     ├── 保存訂閱者、各裝置的提醒項目（prefs）、比分基準與通知進度
   │     ├── 以 Alarm 輪詢 MLB live feed
   │     └── 判斷事件 → 呼叫 PushService /send
   │
   └── PushService Durable Object（全域唯一 "global"）
         ├── 產生並保存 VAPID 金鑰
         ├── 以 web-push 套件發送通知
         └── 測試推播流程
                 ▼
        Apple APNs / Google FCM 等推播服務 → 裝置上的 service-worker.js
```

| 檔案 | 用途 |
| --- | --- |
| `src/index.js` | 入口、路由、CORS（只允許 `FRONTEND_ORIGIN`） |
| `src/device-registry.js` | `DeviceRegistry`：每台裝置的訂閱清單、追蹤球隊同步、提醒項目 |
| `src/game-monitor.js` | `GameMonitor`：單場訂閱者、輪詢、依提醒項目判斷通知與重試 |
| `src/prefs.js` | 提醒項目（`pregame5`、`start`、`homeScore`、`awayScore`、`final`）的預設值與正規化 |
| `src/push-service.js` | `PushService`：VAPID 金鑰、批次發送、測試推播 |
| `src/mlb.js` | 讀取 MLB live feed 並整理成快照；判斷 Live / Final / 延賽取消 |
| `src/highlights.js` | YouTube 影片推薦（前端入口目前隱藏） |
| `wrangler.jsonc` | Worker 名稱、Durable Object 綁定與環境變數 |

## 通知規則

每個訂閱裝置依自己的提醒項目（`prefs`）收到：

| 事件 | 提醒項目 | 時機 |
| --- | --- | --- |
| 訂閱成功 | （一律） | 手動訂閱後立即發送，內容列出開啟的提醒項目；同一裝置重複訂閱不重發，取消後重新訂閱會再發。追蹤球隊自動加入（`confirm: false`）與舊訂閱搬入（`import`）不發 |
| MLB 即將開賽 | `pregame5` | 開賽前 5 分鐘內 |
| MLB 比賽開始 | `start` | 比賽進入 Live |
| 某隊 得分 | `awayScore` / `homeScore` | 該隊比分與該裝置上次的比分基準不同；兩隊同時變動時標題為「MLB 比分更新」 |
| MLB 比賽結束 | `final` | Final，且該裝置已收到最後比分 |

- 每個裝置各自保存比分基準（`lastScore`），不會補送訂閱前已發生的得分。沒開啟的那隊得分不通知，但仍更新比分基準。
- 沒有 `prefs` 的舊訂閱視為全部開啟（`normalizePrefs`），舊版前端呼叫 `/api/watch` 不帶 `prefs` 時沿用既有設定。
- 事件發生後才開啟的項目不補發（例如比賽進行中才打開「比賽開始」）。
- 關閉「比賽結束」的裝置在終場時直接視為完成並移除。
- 延賽、取消或被移出賽程（`codedGameState` D / C / X）的場次不發任何通知，直接清除訂閱並停止 Alarm；這類場次也不能再訂閱（409 `GAME_CALLED_OFF`）。
- 推送暫時失敗時保留未完成狀態，約 30 秒後重試；成功者不會重複收到。
- 推播服務回應 400 / 404 / 410 時視為訂閱失效並移除。
- 所有終場通知送達後清空該場訂閱並停止 Alarm。
- 同一場比賽的訂閱、取消與 Alarm 透過 `exclusive()` 依序處理，避免互相覆蓋。
- 通知內含 `gamePk` 與 `./?view=live&gamePk=...`，前端點擊後直接開啟該場比賽。

## 輪詢頻率

| 比賽狀態 | 下次檢查 |
| --- | --- |
| 距離開賽超過 5 分鐘 | 直接排到開賽前 5 分鐘 |
| 開賽前 5 分鐘內 / 其他非 Live 狀態 | 每 30 秒 |
| Live | 每 5 秒 |
| Final | 停止（若終場通知未送達，30 秒後重試） |
| 延賽 / 取消 / 移出賽程 | 停止並清除訂閱 |
| 讀取 MLB 失敗 | 30 秒後重試 |

DeviceRegistry 在有追蹤球隊或已訂閱場次時，每小時同步一次（追蹤球隊、新增場次時也會立即同步）：

- 追蹤球隊：查詢該隊昨天到 10 天後的季後賽（`gameType` F / D / L / W / P），自動訂閱尚未開打或進行中的場次；使用者取消過的場次（`dismissed`）不會加回。
- 清單整理：終場移除；延賽 / 取消會先取消 GameMonitor 訂閱再移除；已不在賽程中的場次在預定時間 6 小時後移除（GameMonitor 會先依 feed 的 X 狀態自行停止）。

## API

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/health` | 服務狀態 |
| `GET` | `/api/push/public-key` | 取得 VAPID 公鑰，前端訂閱前使用 |
| `GET` | `/api/devices/:deviceId/state` | 這台裝置的預設提醒項目、追蹤球隊、已訂閱場次 |
| `PUT` | `/api/devices/:deviceId/defaults` | 修改預設提醒項目 `{prefs}`，同步到所有未自訂的場次 |
| `PUT` | `/api/devices/:deviceId/subscription` | 更新推播訂閱 `{subscription}`；endpoint 改變時所有場次改送新 endpoint |
| `POST` | `/api/devices/:deviceId/games` | 訂閱單場 `{gamePk, subscription?, import?}`；終場 409 `GAME_FINAL`、延賽取消 409 `GAME_CALLED_OFF` |
| `DELETE` | `/api/devices/:deviceId/games/:gamePk` | 取消單場（也會取消不在清單中的舊訂閱） |
| `PUT` | `/api/devices/:deviceId/games/:gamePk/prefs` | 單場自訂 `{prefs}`；`{prefs: null}` 或與預設相同時改回預設 |
| `POST` | `/api/devices/:deviceId/teams` | 追蹤球隊 `{teamId, subscription?}`，立即同步並回傳 `added` |
| `DELETE` | `/api/devices/:deviceId/teams/:teamId` | 取消追蹤，移除只因追蹤而加入的場次 |
| `POST` | `/api/devices/:deviceId/sync` | 立即同步一次 |
| `POST` | `/api/watch` | 舊版直接訂閱單場：`{gamePk, deviceId, subscription, prefs?, confirm?}`（保留給舊前端） |
| `DELETE` | `/api/watch` | 舊版取消訂閱：`{gamePk, deviceId 或 endpoint}` |
| `GET` | `/api/watch/:gamePk/status?deviceId=...` | 查詢裝置是否已訂閱與其 `prefs`，前端用來恢復鈴鐺狀態 |
| `POST` | `/api/push/test` | 測試推播：立即送一則，30 秒後再送一則 |
| `GET` | `/api/push/status` | 測試推播的待送狀態 |
| `GET` | `/api/highlights/:gamePk` | 賽後影片推薦（需 `YOUTUBE_API_KEY`） |
| `POST` | `/api/monitor/start` | 診斷用：不訂閱，只啟動監控 `{gamePk}` |
| `GET` | `/api/monitor/:gamePk` | 診斷用：讀取監控狀態 |
| `POST` | `/api/monitor/:gamePk/check` | 診斷用：立即檢查一次 |
| `DELETE` | `/api/monitor/:gamePk` | 診斷用：停止監控 |

`deviceId` 由前端產生（UUID，`[A-Za-z0-9_-]{8,80}`）。與既有 `/api/watch` 相同，持有 deviceId 即可管理該裝置的訂閱；回應不會包含推播金鑰。

`/health` 範例回應：

```json
{
  "ok": true,
  "service": "mlb-score-notify",
  "phase": "subscription-management",
  "version": "2.1.0",
  "durableObject": "GameMonitor",
  "liveIntervalMs": 5000,
  "idleIntervalMs": 30000,
  "pushEnabled": true,
  "pushTestEnabled": true,
  "subscriptionManagement": true,
  "highlightsEnabled": false
}
```

`highlightsEnabled` 只表示有設定 `YOUTUBE_API_KEY`，不代表金鑰有效或還有配額。

## VAPID 金鑰

VAPID 金鑰對在第一次使用時由 `PushService` 在伺服器端產生，保存在該 Durable Object 的 storage 中。API 只公開公鑰，私鑰不會回傳給瀏覽器，也不會進入版本庫。

> **不要刪除或重建 `PushService` Durable Object。** 金鑰一旦改變，GameMonitor 中保存的所有既有訂閱都會無法送達，使用者必須重新訂閱。前端偵測到公鑰變更時會重建瀏覽器端的訂閱，但不會自動更新各場比賽在伺服器端的訂閱。

## 設定

`wrangler.jsonc` 中的變數：

| 名稱 | 說明 |
| --- | --- |
| `FRONTEND_ORIGIN` | CORS 允許的前端來源 |
| `VAPID_SUBJECT` | VAPID 聯絡資訊 |

Secret（在 Cloudflare 後台 Settings → Variables and Secrets 設定，不要放進 vars、前端或版本庫）：

| 名稱 | 說明 |
| --- | --- |
| `YOUTUBE_API_KEY` | 選填。YouTube Data API v3 金鑰，限制只能呼叫該 API。未設定時 `/api/highlights` 回傳 `setup-required` 與官方頻道搜尋連結，不會改用網頁抓取或 AI |

## 部署

使用 Cloudflare Workers Builds 自動部署：

- Repository：`b110212000/mlb-live-scoreboard`
- Root directory：`worker`
- Deploy command：`npx wrangler deploy`

Workers Builds 會在 `worker/` 執行 `npm ci`，因此 `worker/package-lock.json` 必須提交。修改 `worker/package.json` 的套件後，請在 `worker/` 執行 `npm install` 更新 lockfile 一起提交，否則建置會以 `EUSAGE` 失敗。

本機開發：

```sh
cd worker
npm ci
npx wrangler dev
```

Durable Object 透過 `wrangler.jsonc` 的 `exports` 宣告（與 `migrations` 互斥），新增類別時在 `durable_objects.bindings` 與 `exports` 各加一筆。

Durable Object 的類別名稱（`GameMonitor`、`PushService`、`DeviceRegistry`）與 storage 中的訂閱格式是既有訂閱能否繼續運作的關鍵。除非必要，不要更改；若必須更改，需要撰寫 migration 並保留舊格式相容（`normalizeSubscriber()` 目前已相容最早期直接保存 `PushSubscription` 的格式）。

## 測試

在專案根目錄執行：

```sh
node tests/game-monitor.cjs
node tests/device-registry.cjs
node tests/highlights.cjs
```

或執行 `npm test` 跑全部測試。測試使用模擬的 MLB 與推播回應，不會發送真實通知；真實裝置收件，尤其是 iPhone 主畫面 App，仍需實機確認。
