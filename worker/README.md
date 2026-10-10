# MLB Score Notify Worker

MLB 季後賽即時戰況的 Cloudflare Worker 後端，負責單場比賽的 Web Push 通知。前端的比分資料仍由瀏覽器直接讀取 MLB Stats API，不經過這個 Worker。

正式網址：<https://mlb-score-notify.b110212000.workers.dev>

## 架構

```text
前端 (GitHub Pages)
   │  POST /api/watch {gamePk, deviceId, subscription}
   ▼
Worker (src/index.js) ── 路由與 CORS
   │
   ├── GameMonitor Durable Object（每個 gamePk 一個）
   │     ├── 保存訂閱者、比分基準與通知進度
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
| `src/game-monitor.js` | `GameMonitor`：訂閱管理、輪詢、通知判斷與重試 |
| `src/push-service.js` | `PushService`：VAPID 金鑰、批次發送、測試推播 |
| `src/mlb.js` | 讀取 MLB live feed 並整理成快照 |
| `src/highlights.js` | YouTube 影片推薦（前端入口目前隱藏） |
| `src/push.js` | 早期的推播佔位函式，目前沒有被任何模組引用 |
| `wrangler.jsonc` | Worker 名稱、Durable Object 綁定與環境變數 |

## 通知規則

每個訂閱裝置會收到：

| 事件 | 時機 |
| --- | --- |
| 訂閱成功 | 新訂閱後立即發送；同一裝置重複訂閱不重發，取消後重新訂閱會再發 |
| MLB 即將開賽 | 開賽前 5 分鐘內 |
| MLB 比賽開始 | 比賽進入 Live |
| MLB 比分更新 | 任一隊比分與該裝置上次收到的比分不同 |
| MLB 比賽結束 | Final，且該裝置已收到最後比分 |

- 每個裝置各自保存比分基準（`lastScore`），不會補送訂閱前已發生的得分。
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
| 讀取 MLB 失敗 | 30 秒後重試 |

## API

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/health` | 服務狀態 |
| `GET` | `/api/push/public-key` | 取得 VAPID 公鑰，前端訂閱前使用 |
| `POST` | `/api/watch` | 訂閱單場比賽：`{gamePk, deviceId, subscription}`；已終場回傳 409 `GAME_FINAL` |
| `DELETE` | `/api/watch` | 取消訂閱：`{gamePk, deviceId 或 endpoint}` |
| `GET` | `/api/watch/:gamePk/status?deviceId=...` | 查詢裝置是否已訂閱，前端重新載入時用來恢復鈴鐺狀態 |
| `POST` | `/api/push/test` | 測試推播：立即送一則，30 秒後再送一則 |
| `GET` | `/api/push/status` | 測試推播的待送狀態 |
| `GET` | `/api/highlights/:gamePk` | 賽後影片推薦（需 `YOUTUBE_API_KEY`） |
| `POST` | `/api/monitor/start` | 診斷用：不訂閱，只啟動監控 `{gamePk}` |
| `GET` | `/api/monitor/:gamePk` | 診斷用：讀取監控狀態 |
| `POST` | `/api/monitor/:gamePk/check` | 診斷用：立即檢查一次 |
| `DELETE` | `/api/monitor/:gamePk` | 診斷用：停止監控 |

`/health` 範例回應：

```json
{
  "ok": true,
  "service": "mlb-score-notify",
  "phase": "game-watch-notifications",
  "version": "1.7.0",
  "durableObject": "GameMonitor",
  "liveIntervalMs": 5000,
  "idleIntervalMs": 30000,
  "pushEnabled": true,
  "pushTestEnabled": true,
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

本機開發：

```sh
cd worker
npm install
npx wrangler dev
```

Durable Object 的類別名稱（`GameMonitor`、`PushService`）與 storage 中的訂閱格式是既有訂閱能否繼續運作的關鍵。除非必要，不要更改；若必須更改，需要撰寫 migration 並保留舊格式相容（`normalizeSubscriber()` 目前已相容最早期直接保存 `PushSubscription` 的格式）。

## 測試

在專案根目錄執行：

```sh
node tests/game-monitor.cjs
node tests/highlights.cjs
```

或執行 `npm test` 跑全部測試。測試使用模擬的 MLB 與推播回應，不會發送真實通知；真實裝置收件，尤其是 iPhone 主畫面 App，仍需實機確認。
