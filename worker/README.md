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
   │     ├── 保存推播訂閱、預設提醒項目、推播語言、追蹤球隊、已訂閱場次（含單場自訂）
   │     ├── 每 15 分鐘以 Alarm 同步賽程：自動訂閱追蹤球隊的季後賽、清掉終場 / 延賽場次
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
| `src/taiwan.js` | 台灣旅外球員：依出生地找出 MLB 與小聯盟各層級的台灣球員與本季成績（快取 3 小時） |
| `src/calendar.js` | 單場比賽行事曆檔（.ics）：依語言的標題（預設中文）、UTC 時間、開賽前 15 分鐘提醒、連回 App |
| `src/messages.js` | 推播通知與行事曆的文字（繁體中文 / 英文 / 日文）與三種語言的隊名，與前端 `src/teams.js` 一致 |
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
- 通知文字依裝置的推播語言（`lang`：`zh` 繁體中文、`en` 英文、`ja` 日文；沒有或不認得時用繁體中文，舊訂閱維持中文）。同一事件依語言分批送出；隊名中文與英文沿用 MLB 原名，日文用片假名（ドジャース）。

## 儲存寫入

例行賽幾乎天天有比賽，Cloudflare 免費方案每天有 10 萬筆 Durable Object 寫入上限。GameMonitor 只有在比賽狀態（比分、局數、狀態等）改變時才寫入快照，訂閱者資料內容沒變也不寫入；`lastCheckedAt` 最多每 5 分鐘寫一次，因此 `/api/monitor/:gamePk` 的最後檢查時間可能落後最多 5 分鐘。

## 輪詢頻率

| 比賽狀態 | 下次檢查 |
| --- | --- |
| 距離開賽超過 5 分鐘 | 直接排到開賽前 5 分鐘 |
| 開賽前 5 分鐘內 / 其他非 Live 狀態 | 每 30 秒 |
| Live | 每 5 秒 |
| Final | 停止（若終場通知未送達，30 秒後重試） |
| 延賽 / 取消 / 移出賽程 | 停止並清除訂閱 |
| 讀取 MLB 失敗 | 30 秒後重試 |

DeviceRegistry 在有追蹤球隊或已訂閱場次時，每 15 分鐘同步一次（追蹤球隊、新增場次時也會立即同步；`GET /state` 時若有追蹤球隊且超過 10 分鐘未同步，會先同步再回傳）。

下一輪對手確定前，MLB 賽程以佔位隊伍表示（例如 ALCS 的「CLE/CWS」、世界大賽的「AL Champion」／「NL Champion」，各有自己的 team id），`teamId` 查詢不會包含這些場次；前一輪結束、MLB 換成真正球隊後的下一次同步才會自動訂閱。

同步內容：

- 追蹤球隊：查詢該隊昨天到 10 天後的例行賽與季後賽（`gameType` R / F / D / L / W / P），自動訂閱尚未開打或進行中的場次；例行賽只預先訂閱 3 天內的場次。使用者取消過的場次（`dismissed`）不會加回。每台裝置最多 60 場。
- 清單整理：終場移除；延賽 / 取消會先取消 GameMonitor 訂閱再移除；已不在賽程中的場次在預定時間 6 小時後移除（GameMonitor 會先依 feed 的 X 狀態自行停止）。

## API

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/health` | 服務狀態 |
| `GET` | `/api/push/public-key` | 取得 VAPID 公鑰，前端訂閱前使用 |
| `GET` | `/api/devices/:deviceId/state` | 這台裝置的預設提醒項目、追蹤球隊、已訂閱場次 |
| `PUT` | `/api/devices/:deviceId/defaults` | 修改預設提醒項目 `{prefs}`，同步到所有未自訂的場次 |
| `PUT` | `/api/devices/:deviceId/lang` | 推播語言 `{lang: "zh" \| "en" \| "ja"}`，同步到所有已訂閱的場次（不重發訂閱成功）；前端切換介面語言時呼叫 |
| `PUT` | `/api/devices/:deviceId/subscription` | 更新推播訂閱 `{subscription}`；endpoint 改變時所有場次改送新 endpoint |
| `POST` | `/api/devices/:deviceId/games` | 訂閱單場 `{gamePk, subscription?, import?, lang?}`；終場 409 `GAME_FINAL`、延賽取消 409 `GAME_CALLED_OFF` |
| `DELETE` | `/api/devices/:deviceId/games/:gamePk` | 取消單場（也會取消不在清單中的舊訂閱） |
| `PUT` | `/api/devices/:deviceId/games/:gamePk/prefs` | 單場自訂 `{prefs}`；`{prefs: null}` 或與預設相同時改回預設 |
| `POST` | `/api/devices/:deviceId/teams` | 追蹤球隊 `{teamId, subscription?, lang?}`，立即同步並回傳 `added` |
| `DELETE` | `/api/devices/:deviceId/teams/:teamId` | 取消追蹤，移除只因追蹤而加入的場次 |
| `POST` | `/api/devices/:deviceId/sync` | 立即同步一次 |
| `POST` | `/api/watch` | 舊版直接訂閱單場：`{gamePk, deviceId, subscription, prefs?, confirm?, lang?}`（保留給舊前端；沒帶 `lang` 時沿用既有語言） |
| `DELETE` | `/api/watch` | 舊版取消訂閱：`{gamePk, deviceId 或 endpoint}` |
| `GET` | `/api/watch/:gamePk/status?deviceId=...` | 查詢裝置是否已訂閱與其 `prefs`，前端用來恢復鈴鐺狀態 |
| `POST` | `/api/push/test` | 測試推播 `{subscription, lang?}`：立即送一則，30 秒後再送一則 |
| `GET` | `/api/push/status` | 測試推播的待送狀態 |
| `GET` | `/api/taiwan-players?season=YYYY` | 台灣旅外球員名單：各層級（MLB、3A、2A、高階1A、1A、新人聯盟）本季成績、目前球隊與母隊 |
| `GET` | `/api/calendar/:gamePk.ics?lang=en` | 單場比賽行事曆檔（`text/calendar`），iPhone 開啟後可直接加入行事曆；開賽時間未定時為全天行程；`lang`（`en` / `ja`）決定標題語言，預設中文 |
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
| `APP_URL` | 前端網址，行事曆檔的連結會回到這裡的該場比賽 |

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
node tests/calendar.cjs
node tests/highlights.cjs
```

或執行 `npm test` 跑全部測試。測試使用模擬的 MLB 與推播回應，不會發送真實通知；真實裝置收件，尤其是 iPhone 主畫面 App，仍需實機確認。


## 意見回饋與 Gmail SMTP

`POST /api/feedback` 交由全域 `FeedbackService` Durable Object 限流、去重，再經 `smtp.gmail.com:465`（TLS）寄送。這個物件與 GameMonitor / DeviceRegistry / PushService 分開，不改動原有通知資料或 VAPID 金鑰。

Cloudflare → Workers & Pages → `mlb-score-notify` → Settings → Variables and Secrets，以下三項都選 **Secret**，設定在 Production，按 Deploy：

| 名稱 | 內容 |
| --- | --- |
| `SMTP_USER` | 完整 Gmail 寄件地址 |
| `SMTP_PASSWORD` | Google 開啟兩步驟驗證後產生的 16 碼應用程式密碼；不是帳號登入密碼 |
| `FEEDBACK_TO_EMAIL` | 固定收件地址；寄給自己可與 SMTP_USER 相同 |

這些 Secret 不寫入 repo、前端或 log，也不需要傳給開發者。寄件 / 收件均由後端固定；訪客選填的信箱只作為 Reply-To。

API 需要 `Content-Type: application/json`、與 FRONTEND_ORIGIN 一致的 Origin，及由 Cloudflare 提供的連線 IP。Body：`id`（UUID v4；重試同一內容必須沿用）、`type`（bug / idea / other）、`message`（10–2000 字）、`email`（選填）、`version`、`gamePk`（選填）、`website`（蜜罐必須空白）。最大請求 12 KiB。

每 IP 30 秒最多一次、每個 UTC 小時最多 5 次，全站每 UTC 日最多 100 次 SMTP 嘗試。這是網站自設保護上限，不是 Gmail 保證額度；Gmail 另有寄信與反濫用限制。限流使用 IP 的加密 HMAC，不保存或寄送原始 IP。

同一 ID / 相同內容已送達時直接回覆成功；處理中回 `FEEDBACK_PENDING`。如果 Gmail 可能已接受信件但回應丟失，回 `FEEDBACK_UNCERTAIN`，同一 ID 不再重送。明確失敗可在限流冷卻後重試。介面失敗會保留原文；成功只代表 SMTP 接受，不保證進入收件匣（也請檢查垃圾郵件）。

儲存內容只有限流時間、次數、雜湊、隨機回饋 ID 與寄送狀態，不保存回饋正文或聯絡信箱；鬧鐘清理 24 小時前的記錄，閒置時停止。Email 本身保留在維護者 Gmail。

`/health` 的 `feedbackEnabled` 只代表三個 Secrets 與 binding 已設定，不保證認證成功。部署後還要以表單送一則測試回饋，並確認收到信。`npm test` 的 SMTP 與 API 測試使用 mock，不會寄信。


### 共用 SMTP 寄送（Issue #8：後端指定收件者）

`worker/src/smtp.js` 的 `sendGmail(env,message)` 現在可由**可信的伺服器端呼叫者**用 `message.to` 指定單一收件者，例如 OrderLead 已驗證／待驗證帳號所屬的 Email。未傳 `message.to` 時仍沿用 `env.FEEDBACK_TO_EMAIL`，保留舊版回饋流程。SMTP `To:` 與 `RCPT TO` 一致，嚴格驗證收件地址，不接受多收件人或換行 Header 注入。可選的 `kind` 僅支援 `mlb-feedback`、`orderlead-verify`、`orderlead-reset`，顯示固定的 MLB Feedback 或 OrderLead 寄件名稱。

可信後端程式使用示例（**這不是公共 API**）：

```js
await sendGmail(env, {
  id: crypto.randomUUID(),
  to: verifiedRecipientEmail, // 從 OrderLead 後端註冊/重設流程得到
  kind: "orderlead-verify", // 或 orderlead-reset
  subject: "OrderLead 信箱驗證",
  text: "請在期限內使用你的專屬驗證連結完成驗證。"
});
```

- MLB `POST /api/feedback` **仍只能寄到後端固定 `FEEDBACK_TO_EMAIL`**。公開請求的 `to`、`email`、`kind` 都不會用來設定 SMTP 收件者；它不是任意寄信 Relay。
- **沒有新增 `/api/send-mail` 或任意跨網站寄信 API**。若跨專案共用，應優先讓 OrderLead Worker 自行引入 SMTP 模組並為自己的 Worker 配置同一 Gmail 的 `SMTP_USER`／`SMTP_PASSWORD` **Cloudflare Secrets**，或未來將私有郵件服務抽出後用 Cloudflare Service Binding（僅 Worker→Worker）調用。
- 不同 Worker **不會自動共享** Secret，不能從 MLB 的 Cloudflare Worker 直接讀取 `SMTP_PASSWORD`。切勿把 Gmail 應用程式密碼放在 GitHub、`wrangler.jsonc`、PWA 或 GET 回應內。
- OrderLead 忘記密碼／註冊驗證還需要自己的 D1 高熵一次性 Token、原子消耗、真實 Email 歸屬驗證、寄信節流、防帳號探測、重設後 Session 撤銷；僅 SMTP 支援 `to` **不代表 OrderLead 登入或救援已完成**。
- Gmail 的實際寄信配額與垃圾郵件政策適用於**兩個 App 合計**，伺服器 `FeedbackService` 的獨立限流不代替 OrderLead 自己的驗證郵件限流。

本次 SMTP 和回饋單元測試使用模擬 Socket，不會實際向用戶發信。Cloudflare Workers Builds 更新完成後仍須確認 MLB 原有意見回饋正常。


### 由同一個 MLB Worker 給 OrderLead 寄認證信（Issue #10）

**已改用同一支 `mlb-score-notify` Worker，不需要複製 Gmail Secrets 到 OrderLead。**

- `worker/src/index.js` 的 **named RPC export `OrderLeadMailService`** 只可由 Cloudflare 帳號中有明確 Service Binding 的其他 Worker 呼叫；不是公開 HTTP 路由。`/api/feedback` 仍然只能寄到 `FEEDBACK_TO_EMAIL`。
- OrderLead 的 `orderlead-api` 宣告 `services: [{binding:"MLB_MAIL",service:"mlb-score-notify",entrypoint:"OrderLeadMailService"}]`。未來 OrderLead 完成安全註冊／重設流程後，從後端 `env.MLB_MAIL.sendAuthMail({id,kind,to,link})` 呼叫同一 Worker。
- `kind` 僅接受 `verify`、`reset`；驗證/重設連結只能是 `https://b110212000.github.io/stock-order-tracker/#/auth/{email-verify|reset-password}/<43-char-token>`，必須吻合用途。標題、內文、寄件顯示名稱由 MLB Worker 固定，禁止透過 RPC 傳入任意 SMTP Header。
- 仍由**現有的** `FeedbackService` Durable Object 儲存寄送數與狀態，但用獨立 `orderleadMail` key 與 MLB feedback 配額隔離：全域每日最多 100 次 SMTP 嘗試、每收件者每小時最多 5 次、Message ID 去重。只儲存 HMAC 摘要、時間與狀態；不儲存 email、token 或驗證連結內容；可能已寄出的不確定結果不可自動重寄。
- Gmail `SMTP_USER`、`SMTP_PASSWORD` **只在 MLB Worker 的原有 Cloudflare Secrets**。OrderLead Worker 不需這兩個 Secret。此種 Service Binding 須是**同一個 Cloudflare 帳號**，並且 MLB 端 named entrypoint 已先部署。不要加任何公開 `/api/mail`。
- SMTP mock tests 和 Workers Builds 通過**不代表 OrderLead 可以直接註冊**：OrderLead #75 還需要真實、已驗證 Email 的 D1 註冊／登入和一次性 token/密碼重設、WAF/限速及 iPhone 端到端驗收，才可以觸發寄信。沒有完整後端認證前，新的 RPC 保持無公開呼叫者。
