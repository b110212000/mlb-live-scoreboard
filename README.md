# MLB 季後賽即時戰況

一個以 **MLB Stats API** 為資料來源的純前端季後賽即時戰況網站。

目前提供：

- 季後賽每日賽事切換
- 即時比分
- 當前局數與比賽狀態
- 打者 / 投手資訊
- 投手總用球數與目前打席投球數
- Balls / Strikes / Outs
- 壘上跑者
- 最近一球球速、球種、轉速與進壘位置
- 逐局比分
- 得分紀錄
- 最近打席
- 本場焦點事件
- 即時比賽下半部三分頁：統計 / 賽況 / 系列賽（賽後精華暫時隱藏）
- 完整 Box Score（打者 / 投手本場成績）
- 當前系列賽總覽，可點場次直接切換比賽
- 牛棚近期負荷狀態（依近 3 日登板與用球推估）
- 季後賽淘汰賽戰況
- 系列賽目前勝敗與晉級狀態
- 對戰名單：兩隊 active roster、先發打線、先發投手
- 打者例行賽 AVG / OBP / SLG / OPS / HR / RBI
- 投手例行賽 ERA / WHIP / FIP* / K/9 / BB/9 / W-L
- 比賽時間依使用者裝置時區自動換算
- iPhone / iPad 加入主畫面
- 專屬「安裝 / 分享 App」頁
- Web Share 系統分享與複製網址
- 單場比賽通知：開賽前 5 分鐘、正式開賽、比分變更、比賽結束
- 下拉重新整理
- 網站版本更新偵測

公開網站：

https://b110212000.github.io/mlb-live-scoreboard/

---

## 專案架構

即時比分與球員資料仍由前端直接讀取 MLB Stats API；單場比賽通知則使用 Cloudflare Workers + Durable Objects + Web Push，不使用傳統資料庫。

```text
Browser / iPhone Web App
        │
        ├── index.html
        │     ├── HTML
        │     ├── CSS
        │     └── JavaScript
        │
        ├── MLB Stats API
        │     ├── Schedule
        │     └── Live Game Feed
        │
        └── MLB Static Assets
              ├── Team Logo
              └── Player Headshot
```

所有比賽資料都由瀏覽器直接向 MLB API 取得。

---

## 專案檔案

| 檔案 | 用途 |
| --- | --- |
| `index.html` | 主頁面，包含 UI、CSS、API 呼叫與即時更新邏輯 |
| `manifest.json` | Web App / 加入主畫面設定 |
| `app-icon.svg` | App / 網站圖示 |
| `service-worker.js` | Push-only Service Worker；負責接收與點擊 Web Push，不快取 App 資源 |
| `.nojekyll` | 避免 GitHub Pages 使用 Jekyll 處理靜態檔案 |
| `README.md` | 專案文件 |

> 為避免 iPhone Web App 快取舊版 CSS / JavaScript，目前不使用 Service Worker 做離線快取。

---

# 架設方式

## 方法一：GitHub Pages

這是目前正式使用的部署方式。

### 1. 將專案 Push 到 GitHub

預設分支：

```text
main
```

首頁必須位於：

```text
/index.html
```

### 2. 開啟 GitHub Pages

進入 Repository：

```text
Settings
→ Pages
```

設定：

```text
Source: Deploy from a branch
Branch: main
Folder: / (root)
```

儲存後 GitHub 會自動部署。

網站網址格式：

```text
https://<GitHub帳號>.github.io/<Repository名稱>/
```

此專案目前為：

```text
https://b110212000.github.io/mlb-live-scoreboard/
```

之後只要更新 `main` branch，GitHub Pages 就會重新部署。

---

## 方法二：本機執行

不建議直接雙擊：

```text
index.html
```

部分瀏覽器在 `file://` 模式下可能限制 API Request。

建議啟動一個簡單 HTTP Server。

### macOS / Linux

進入專案資料夾：

```bash
cd mlb-live-scoreboard
python3 -m http.server 8080
```

瀏覽器開啟：

```text
http://localhost:8080/
```

### Windows

如果使用 Python Launcher：

```powershell
cd mlb-live-scoreboard
py -m http.server 8080
```

或：

```powershell
python -m http.server 8080
```

瀏覽器開啟：

```text
http://localhost:8080/
```

---

# 安裝 / 分享 App

左上功能選單提供：

```text
📲 安裝 / 分享 App
```

此頁包含：

- 分享這個 App
- 複製網站網址
- 加入主畫面的操作教學
- 已安裝狀態偵測
- 支援 `beforeinstallprompt` 的瀏覽器可直接叫出安裝提示

分享使用瀏覽器的：

```javascript
navigator.share()
```

若裝置不支援 Web Share API，則改以 Clipboard API 複製網址。

## iPhone / iPad 限制

iOS 不允許網站程式直接將 Web App 自動加入桌面。

因此 iPhone / iPad 仍需由使用者最後手動操作：

```text
Safari
→ 分享
→ 加入主畫面
→ 加入
```

網站可以提供教學與偵測是否已在 standalone 模式執行，但無法繞過 Apple 的使用者確認流程。

---

# iPhone / iPad 加入主畫面

使用 Safari 開啟網站：

```text
https://b110212000.github.io/mlb-live-scoreboard/
```

接著：

```text
分享
→ 加入主畫面
→ 加入
```

加入後會以接近獨立 App 的方式開啟。

目前使用：

```json
"display": "standalone"
```

因此從主畫面開啟時不會顯示一般 Safari 的完整瀏覽器介面。

---

# 使用到的 API

API Base URL：

```text
https://statsapi.mlb.com/api
```

---

## 1. 每日賽程

Endpoint：

```http
GET /v1/schedule
```

目前使用：

```text
https://statsapi.mlb.com/api/v1/schedule
?sportId=1
&startDate=YYYY-MM-DD
&endDate=YYYY-MM-DD
&hydrate=team,linescore
```

日期選擇器以**使用者裝置的當地日期**為準。

由於 MLB API 的 schedule 日期不一定等於使用者所在地的日曆日期，程式會針對使用者選擇的日期：

1. 前後各多抓一天的 MLB 賽程。
2. 將每場比賽的 `gameDate` 轉換成瀏覽器 / iPhone 的當地時區。
3. 只保留換算後日期等於使用者所選日期的比賽。

例如使用者在台灣選擇 `10/07`，即使該場比賽在 MLB 官方賽程中屬於美國的 `10/06`，只要換算成台灣時間後是 `10/07`，網站就會顯示該場比賽。

用途：

- 取得使用者當地日期對應的 MLB 比賽
- 判斷有哪些季後賽比賽
- 取得 Game PK
- 取得主客隊
- 取得目前比分
- 取得比賽狀態
- 取得比賽開始時間

程式會再依 `gameType` 過濾季後賽。

目前會辨識：

| gameType | 類型 |
| --- | --- |
| `F` | Wild Card / 外卡 |
| `D` | Division Series / 分區系列賽 |
| `L` | League Championship Series / 聯盟冠軍賽 |
| `W` | World Series / 世界大賽 |
| `P` | 其他 Postseason 類型 |

---

## 2. 即時比賽資料

Endpoint：

```http
GET /v1.1/game/{gamePk}/feed/live
```

範例：

```text
https://statsapi.mlb.com/api/v1.1/game/123456/feed/live
```

其中：

```text
gamePk
```

由 Schedule API 取得。

這個 Endpoint 是即時比賽頁面的主要資料來源。

目前使用的內容包含：

- 即時比分
- inning / inningState
- Balls
- Strikes
- Outs
- 壘上跑者
- Current Batter
- Current Pitcher
- Pitch Count
- Pitch Type
- Pitch Speed
- Spin Rate
- Pitch Coordinates
- Play Events
- Scoring Plays
- Box Score
- R / H / E
- 每局比分
- 打席結果

---

## 3. 完整 Box Score

即時比賽頁會直接從 Live Game Feed 的：

```text
liveData.boxscore
```

產生兩隊完整 Box Score，並隨即時比賽資料一起更新。

打者欄位：

```text
AB / R / H / RBI / BB / SO / HR
```

投手欄位：

```text
IP / H / R / ER / BB / K / HR / P
```

其中 `P` 為該投手本場用球數。

主要資料來源：

```http
GET /v1.1/game/{gamePk}/feed/live
```

另外在查詢過去比賽的投手使用量時，也會使用：

```http
GET /v1/game/{gamePk}/boxscore
```

---

## 4. 牛棚負荷狀態

對戰名單頁會顯示兩隊牛棚投手的近期使用量。

系統會先查球隊目前比賽日前 3 日的賽程：

```http
GET /v1/schedule
```

主要參數：

```text
sportId=1
teamId={teamId}
startDate=YYYY-MM-DD
endDate=YYYY-MM-DD
```

接著針對過去已完成比賽讀取 Box Score：

```http
GET /v1/game/{gamePk}/boxscore
```

並統計每位投手：

- 昨日用球數
- 前 3 日總用球數
- 前 3 日登板場次
- 是否連續多日登板
- 本場是否已經登板
- 本場目前用球數

畫面會標示：

```text
🟢 休息充足
🟡 可能受限
🔴 高負荷
🔴 本場已登板
```

目前判斷屬於**前端推估**，不是 MLB 或球隊官方的 Available / Unavailable 狀態。

目前使用的概略規則：

- 本場已投球：本場已登板
- 昨日超過 30 球、連續 3 日登板、或前 3 日累計至少 60 球：高負荷
- 昨日 16～30 球、連續 2 日登板、前 3 日累計至少 35 球、或前 3 日登板至少 2 場：可能受限
- 其餘：休息充足

這項資訊只能作為觀賽參考；實際能否登板仍取決於球隊教練、傷勢與當日狀況。

---

## 5. 對戰名單

對戰名單頁會依目前選中的比賽，同時顯示兩隊 active roster。

### Team Roster

Endpoint：

```http
GET /v1/teams/{teamId}/roster
```

目前使用的主要參數：

```text
rosterType=active
season=YYYY
date=YYYY-MM-DD
hydrate=person(stats(group=[hitting,pitching],type=[season],season=YYYY))
```

用途：

- 取得球隊 active roster
- 球衣背號
- 守備位置
- 球員基本資料
- 當季例行賽打擊 / 投球成績

如果 roster 回應沒有完整帶回球員 stats，前端會再使用：

```http
GET /v1/people?personIds=...
```

並用相同 stats hydrate 一次補齊球員 season stats。

### 本場先發

先發打線與先發投手由目前選中比賽的 Live Game Feed / Boxscore 判斷：

```http
GET /v1.1/game/{gamePk}/feed/live
```

主要使用：

```text
liveData.boxscore.teams.away/home.battingOrder
liveData.boxscore.teams.away/home.pitchers
gameData.probablePitchers
```

若 MLB 尚未公布先發打線，頁面仍會先顯示兩隊 active roster，並標示「先發打線尚未公布」。

### 顯示指標

打者：

```text
AVG / OBP / SLG / OPS / HR / RBI
```

投手：

```text
ERA / WHIP / FIP* / K/9 / BB/9 / W-L
```

`FIP*` 不是 MLB Stats API 的直接欄位，目前以前端依例行賽的 HR、BB、HBP、K、IP 計算：

```text
FIP* = (13×HR + 3×(BB+HBP) - 2×K) / IP + 3.10
```

其中 3.10 為目前頁面採用的固定估算常數，因此畫面使用 `FIP*` 標示，避免誤認為官方直接提供的 FIP。

---

## 6. 季後賽戰況

季後賽戰況頁同樣使用：

```http
GET /v1/schedule
```

目前會抓該年度大約：

```text
09/20 ～ 11/15
```

的賽程資料，再過濾：

```text
F / D / L / W
```

前端會自行將同一組對戰的比賽合併，計算：

```text
系列賽勝場
系列賽敗場
是否已晉級
```

例如：

```text
NYY 系列賽領先 3–0
```

或：

```text
LAD 晉級 3–1
```

淘汰賽流程：

```text
Wild Card
   ↓
Division Series
   ↓
League Championship Series
   ↓
World Series
```

---

# MLB 靜態資源

## 球隊 Logo

使用：

```text
https://www.mlbstatic.com/team-logos/{teamId}.svg
```

範例：

```text
https://www.mlbstatic.com/team-logos/147.svg
```

其中 `teamId` 由 MLB API 的 Team 資料取得。

---

## 球員頭像

使用：

```text
https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_90/v1/people/{playerId}/headshot/67/current
```

其中：

```text
playerId
```

由 Live Game Feed 中的 Batter / Pitcher 資料取得。

---

# 時區處理

MLB API 的 `gameDate` 為可以直接由 JavaScript `Date` 解析的時間資料。

網站會使用瀏覽器本身的時區：

```javascript
new Date(game.gameDate)
```

並透過：

```javascript
Intl.DateTimeFormat()
```

轉換。

因此：

- 台灣開啟 → 顯示台灣時間
- 日本開啟 → 顯示日本時間
- 美國開啟 → 顯示使用者所在地時區

不需要另外寫死 UTC+8。

---

# 即時比賽詳細資訊分頁

逐局比分以下改為三個 Tab，避免即時比賽頁面過長：

```text
統計｜賽況｜系列賽
```

## 統計

顯示完整 Box Score：

- 兩隊打者本場成績
- 兩隊投手本場成績

## 賽況

集中顯示比賽進行中的資訊：

- 壘上與投球位置
- 目前投打對決
- 得分紀錄
- 最近打席

## 系列賽

依目前選中的季後賽比賽，直接使用 MLB 官方「依系列賽分組」的 postseason endpoint：

```http
GET /v1/schedule/postseason/series
```

主要參數：

```text
season=YYYY
sportId=1
```

前端會找出包含目前 `gamePk` 的官方 series，直接取得該系列賽所有場次。

因此可以保留：

- 已完成場次
- 進行中場次
- 尚未開打場次
- `if necessary` 場次
- MLB 已排日期但對手尚未完全確定的場次

例如：

```text
國家聯盟分區賽

第一場　教士  2　終場　3  釀酒人
第二場　教士  3　終場　4  釀酒人
第三場　釀酒人　進行中　教士
第四場 · 10/8　10:00　如有需要
第五場 · 10/10　04:30　如有需要
```

如果未來輪次的對手尚未確認，畫面會先顯示：

```text
對手待定
```

並保留 MLB 已公布的日期 / 時間；API 後續補上正式球隊後，頁面會自動更新。

「季後賽戰況」頁也改用同一個官方 series endpoint 分組，避免 TBD 場次因為沒有 team id 而被錯誤拆成多個系列賽。

每一場皆可點擊。點擊後會：

1. 將日期切換成該場比賽在使用者裝置時區的日期。
2. 選取該場 `gamePk`。
3. 載入該場即時資料。
4. 自動切回「賽況」Tab。

---

# 更新頻率

## 即時比賽

```text
每 5 秒
```

重新取得 MLB 即時資料。

---

## 季後賽戰況

戰況頁開啟時會載入一次。

之後約：

```text
每 60 秒
```

重新整理季後賽系列賽資料。

---

## 網站版本

網站使用 `version.json` 做輕量版本檢查，不再每次下載所有 CSS / JavaScript 計算 hash。

檢查時機：

```text
開啟頁面
切回 App / 視窗重新取得焦點
每 15 秒
```

平常每次只讀取一個很小的 `version.json`。偵測到新版後，會先確認新版 `index.html` 已經部署完成，再重新載入頁面。

所有前端 CSS / JavaScript URL 也會附帶版本參數，例如：

```text
styles.css?v=1.0.1
app.js?v=1.0.1
```

因此新版部署後可以直接避開瀏覽器舊資源快取，尤其是 iPhone 主畫面 Web App。

另外也支援：

```text
頁面頂端下拉 → 重新整理整個網站
```

---

# 本場焦點

網站會從 Live Game Feed 的 Play Events 自動整理重要事件，例如：

- 全壘打
- 滿貫砲
- 雙響砲 / 三響砲
- 多打點
- 單場多安
- 投手大量三振
- 雙殺
- 盜壘
- 守備失誤
- 單局大量得分
- 追平
- 超前
- 逆轉
- 再見勝利

這些資訊由前端依 MLB API 回傳資料自行判斷，不是另外呼叫新聞 API。

---

# 專案檔案結構

前端目前依責任拆分：

```text
index.html       → 畫面結構 / HTML
styles.css       → 所有 CSS 樣式

api.js           → 共用設定、DOM/state、HTTP 與基礎資料工具
live.js          → 即時比賽、投打、好球帶、焦點、Box Score、得分事件
postseason.js    → 系列賽與季後賽戰況
roster.js        → 對戰名單、球員數據、先發與牛棚負荷
notifications.js  → Web Push 訂閱與測試通知
ui.js            → Tab 滑動、功能選單、畫面切換、安裝 / 分享
app.js           → 事件綁定、初始化、更新排程、版本檢查
```

JavaScript 依下列順序載入：

```html
<script src="./api.js"></script>
<script src="./live.js"></script>
<script src="./postseason.js"></script>
<script src="./roster.js"></script>
<script src="./notifications.js"></script>
<script src="./ui.js"></script>
<script src="./app.js"></script>
```

`app.js` 現在只負責啟動應用，不再放主要功能邏輯。

網站版本由 `version.json` 統一發布；每次版本異動時，同步更新頁尾版號與前端資源的版本參數。


---

# 技術

目前不使用 Framework。

主要技術：

```text
HTML5
CSS3
Vanilla JavaScript
Fetch API
Intl.DateTimeFormat
GitHub Pages
Cloudflare Workers / Durable Objects
Web Push API
Web App Manifest
MLB Stats API
```

優點：

- 不需要 Server
- 不需要 Database
- 不需要 API Key
- GitHub Pages 即可部署
- 維護成本低
- 手機與桌面皆可使用

---

# 注意事項

- MLB API 回傳格式若日後調整，前端解析可能需要同步修改。
- 即時資料更新速度取決於 MLB Stats API。
- 本專案沒有保存使用者個資。
- 通知功能使用 Cloudflare Worker；MLB 比賽資料仍由 MLB Stats API 提供。
- 本專案目前沒有離線比賽資料模式。
- 球隊 Logo、球員照片與比賽資料來源皆屬 MLB 相關資料來源。

---

## License

此專案目前主要作為個人 MLB 即時戰況工具使用。


## 版本號規則

目前版本：`v1.7.7`

版本格式：

```
v主版號.功能版號.修正版號
```

規則：

- 畫面調整、樣式修改、Bug 修復：第三碼 +1
  - 例如 `v1.0.0 → v1.0.1`
- 新增功能：第二碼 +1，第三碼歸 0
  - 例如 `v1.0.4 → v1.1.0`
- 第一碼只在專案負責人明確指定時變更
- 第二碼每次 +1 時，第三碼一定重設為 0



## v1.1.1 單場通知驗證與修正

- 鈴鐺亮色為未訂閱，暗色為已訂閱；重新載入由後端 deviceId 狀態恢復，Final 隱藏。
- 發送開賽前 5 分鐘、正式開賽、任一隊比分變更及終場通知。
- 每個裝置各自保留比分基準，不補送訂閱前的得分；推送暫時失敗會重試。
- 最後得分與 Final 同次檢查時，先送比分，再送終場；該裝置比分未送達時保留訂閱重試。
- 成功發送終場後移除該裝置，404 / 410 過期 endpoint 亦移除。
- 同場 Durable Object 的訂閱、取消及 Alarm 依序處理，避免外部請求期間相互覆蓋。
- 前端忽略點擊前啟動的舊 status 回應，避免訂閱結果被覆蓋。
- 驗證包含 JavaScript 語法、DOM ID、通知情境與失敗重試、鈴鐺狀態及 Worker 打包。
- Web Push 服務接受的順序可由程式控制；裝置顯示時間仍取決於推送服務及網路。
- iPhone 實機收件仍需以 Safari 加入主畫面的 App 訂閱後確認。

發布先更新程式與頁尾 / CSS / JS 版本，等待 Pages 與 Worker 部署驗證，最後更新 version.json。

本機回歸驗證：`node tests/game-monitor.cjs` 與 `node tests/game-watch-ui.cjs`。測試使用模擬 MLB 與 Push 回應，不發送真實通知。



## v1.2.0 訂閱成功通知

- 每次新訂閱成功後立即推播，標題為「客隊 vs 主隊｜訂閱成功」。
- 重新載入與相同訂閱重複 POST 不重複推播；取消後重新訂閱會再發一次。
- 暫時發送失敗保留待送狀態，約 30 秒後重試；原有訂閱不補發成功通知。
- 開賽前、開賽、比分更新與終場通知繼續依原有規則發送。


## v1.2.1 最近打席收合修正

- 最近打席補上與得分紀錄一致的純箭頭收合／展開按鈕，預設展開。
- 點擊標題列或箭頭皆可切換，收合後即時比分更新仍保持收合狀態。


## v1.3.0 通知直達比賽

- 所有單場通知包含 gamePk，點擊即進入通知對應比賽，依 MLB 開賽時間換算裝置當地日期。
- 已開啟 App 時重新導向該場；未開啟或原視窗無法導向時開啟新視窗，不重用其他 GitHub Pages 專案。
- App 啟動時更新 Push-only Service Worker，無需重新訂閱。
- 無效或無法取得的比賽顯示錯誤，不靜默導向其他場次。通知路由載入後清除，避免干擾後續手動切換。


## v1.3.1 最近打席半局分組

- 最近 8 筆打席維持最新在上，依局數及上／下半局分組。
- 分組標題顯示進攻球隊 Logo、隊名、局數和純箭頭；上半局為客隊、下半局為主隊。
- 每個半局可獨立收合，資料更新保留收合狀態；切換比賽重新預設展開。


## v1.3.2 最近打席標題精簡

- 移除最近打席外層收合箭頭與收合操作，內容固定顯示。
- 各球隊半局的獨立收合箭頭維持原有功能。


## v1.3.3 球員數據姓名欄縮窄

- 統計頁打者／投手姓名欄改為固定寬度：桌面 100px、手機 84px，長姓名自動換行。
- 守備位置另起一行，手機表格最小寬度由 480px 縮至 420px，讓更多數據出現在畫面中。


## v1.3.4 修正最近打席收合層級

- 恢復最近打席外層收合箭頭，整區可收合／展開。
- 半局細項移除獨立收合操作與箭頭，固定顯示球隊 Logo、隊名、局數及打席紀錄。



## v1.4.0 MLB 官方賽後精華

- 在「系列賽」右方新增「賽後精華」，四欄頁籤皆支援點選與滑動。
- 終場後依目前比賽顯示影片縮圖、原始名稱、片長、官方比賽日期及影片說明；點擊開啟 YouTube。
- Worker `GET /api/highlights/:gamePk` 先向 MLB 查證賽事，再查詢 MLB 官方 YouTube 頻道公開搜尋頁；同時驗證頻道及影片擁有者 ID。
- 比對雙方隊名與完整比賽日期；雙重賽必須吻合 Game 1 / Game 2。排除 Shorts、單局、每球及系列賽合輯，不用上傳日期猜測比賽。
- 成功結果快取 15 分鐘，尚未找到快取 3 分鐘。僅開啟精華頁時查詢；切換比賽後不會被舊請求覆蓋。
- 尚未終場、尚未找到、來源讀取失敗分別顯示訊息；可重新整理，或前往官方頻道查詢。未找到不代表官方一定尚未發布。
- 不需要新增 YouTube API Key。公開搜尋頁結構若變更，會顯示讀取失敗，需更新解析器。
- 發布順序：先驗證 Pages 與 Worker 的 v1.4.0 程式部署，最後才更新 `version.json`。


## v1.4.1 精華影片開啟 YouTube App

- 點縮圖或片名：iPhone / iPad 嘗試以 YouTube URL scheme 開啟 App；Android Chrome 使用指定 YouTube 套件的 Intent。
- 未切換至 App 時嘗試回到網頁播放器；iOS 離開頁面後取消 fallback，避免返回網站時又跳走。
- 保留「使用網頁版」連結，桌面與 Ctrl / Command 點擊維持新分頁。
- App 是否能啟動仍取決於裝置安裝情況、系統提示與瀏覽器政策。部署驗證不等同 iPhone 實機驗證。


## v1.4.2 修正精華單次點擊

- 縮圖與片名直接使用原生 App 連結；手機在原分頁交給系統處理，不再取消 click 後用 JavaScript 喚起 App。
- 左右滑動及下拉更新排除連結、按鈕與輸入欄位；下拉至少移動 10px 才攔截手勢，避免輕微手指移動吃掉 click。
- 精華內容不變時保留原 DOM，避免每 5 秒比分刷新重建正在點擊的連結。
- 保留 iOS 網頁備援及離開頁面取消計時器、Android Intent 備援與「使用網頁版」連結。
- 已測試事件與 DOM 行為；iPhone Safari／主畫面 App 的實際跳轉仍需實機確認。


## v1.5.0 同場官方相關影片

- 賽後精華頁保留整場精華並優先顯示，再列出 MLB 官方同場全壘打、守備、投手、完整半局、逐球回顧與終場片段，最多 12 部並標示類型。
- 雙方隊名可出現在片名或影片說明，仍須確認完整比賽日期；季後賽及雙重賽若有 Game 編號，必須吻合，不混入其他場次或賽前預測／新聞合輯。
- 搜尋摘要不完整時，最多補讀 4 支影片的官方說明，並驗證影片 ID 和頻道 ID；個別補讀失敗不影響已確認影片。
- 改用 v2 後端快取避免沿用舊的單支精華結果；沿用原生 App 連結與單擊手勢修正。
- 公開搜尋結果有限，沒有足夠場次資訊的片段不會列入；不保證收齊全部相關影片。


## v1.6.0 精華影片繁體中文化

- 片名與重點說明使用繁體中文；球隊中文化，球員姓名透過本場 MLB 球員名單替換成代碼、翻譯後還原英文。英文原文收在可展開區塊，並標示自動翻譯供參考。
- Worker 加入 `AI` binding，使用 Cloudflare Workers AI `@cf/qwen/qwen3-30b-a3b-fp8`，每批最多 4 支、每場最多 12 支影片；只傳送已驗證的公開片名與清理廣告後的說明。
- 翻譯提示指定台灣棒球術語；回傳需符合影片 ID、中文文字、長度及數字檢查，前端統一 escape，避免來源／模型文字變成 HTML。
- 依原文內容 SHA-256 快取成功譯文 7 天；原文改動會重新翻譯。失敗快取 3 分鐘；同 isolate 相同批次共用請求。
- 22 秒翻譯期限、格式錯誤或 AI 額度不足時保留影片及英文原文，不會使精華功能失效。快取是邊緣 Cache API，可能提前失效，不是永久資料庫。
- Cloudflare Workers AI 有每日免費額度；已在 Workers Paid 的帳號超額可計費，實際額度／用量以 Cloudflare 後台為準。本次不變更付費方案。
- 自動翻譯不代表 MLB 官方中文稿；仍需對照原文，尤其球員、紀錄、數字與棒球語境。


## v1.7.0 官方 API 影片推薦（取代 v1.4–v1.6 的抓取／翻譯流程）

- 所有 YouTube 資料改用 YouTube Data API v3；移除網頁解析器、AI 翻譯呼叫與 AI binding，不提供爬取備援。影片只提供連結，不下載、轉存或嵌入播放器。
- MLB 固定官方 channel ID；愛爾達以官方 `@ELTASPORTSHD` handle 呼叫 channels.list，核對回傳 handle 與 channel ID，再限定該頻道查詢。兩來源由 videos.list 再核對公開影片與擁有者。
- 中文來源優先，最多 12 支；比對双方球隊、完整日期與場次，愛爾達另考慮台灣開賽日期。配對為網站功能，不能保證所有場次都有影片或不會誤配；不標示由 API 推論的影片類型。
- 保留 API 原始標題、完整介紹、原始縮圖與頻道名稱，不改寫或自動翻譯。縮圖使用官方回傳網址與 contain，介紹可展開完整閱讀。
- 新 API 快取命名空間：結果最多 6 小時、頻道 24 小時，逾期重新取得；舊抓取／翻譯快取不再讀取，原 TTL 最長 7 天後失效。前端不接受舊來源格式。
- 加入官方提供的 YouTube Logo，來源與獨立推薦說明、隱私政策、使用條款及 YouTube／Google 政策連結。訪客在影片功能前須明確同意；同意限本機分頁，支援撤回並清空影片記憶體快取。不需要 YouTube 帳號或 OAuth。
- 未設定金鑰或 API 失敗時不取得 YouTube 網頁，只提供愛爾達／MLB 頻道搜尋連結。API 失敗僅短暫快取 3 分鐘；同 isolate 同場請求合併，前端刷新不繞過後端快取。

### 必要部署設定（由專案擁有者完成）

1. 在 Google Cloud 專案啟用 **YouTube Data API v3**，建立 API Key，將 API 限制為 YouTube Data API v3。此公開資料用途不需要 OAuth 或個別影片授權。
2. 在 Cloudflare `mlb-score-notify` 的 **Settings → Variables and Secrets** 新增 Secret **`YOUTUBE_API_KEY`**，儲存後重新部署。不要將值放進 GitHub、前端或公開對話。可用 `wrangler secret put YOUTUBE_API_KEY` 在可信本機設定。
3. 依 Google Cloud 控制台管理 API 配額；兩頻道 search.list 有搜尋配額成本。未有真實金鑰時只測試 mock API 與未設定金鑰流程，不宣稱已通過真實 API 影片列表驗證。
4. 官方 API 本身不代表全部法律問題已解決。維護者仍須遵守 API 條款、品牌規範、隱私政策與適用法律；本次不是法律認證，也未審核 MLB 數據／標誌的其他利用權利。

### 驗證

- `node tests/highlights.cjs`：官方端點、原始資訊、頻道／日期／場次过滤、無金鑰不抓取、快取、部分失敗、併發。
- `node tests/recap-policy.cjs`：同意前不呼叫 API、不顯示縮圖、原文／escape、撤回、舊回應阻擋。
- 既有通知與手機連結測試、全部 JS 語法、Wrangler dry run、DOM／資源版本與部署比對。


## v1.7.1 暫時隱藏賽後精華

- 隱藏賽後精華按鈕與面板，頁籤恢復為統計／賽況／系列賽三等欄。
- 左右滑動僅涵蓋三個頁籤，停用精華刷新事件與排程；不會從一般操作載入影片 API。
- 影片推薦前後端程式保留，待來源與配對方案確認後再恢復。本次僅前端 UI 更新，Worker 不需重新部署。
- 先確認 Pages 新版程式部署，最後更新 version.json。


## v1.7.2 無比賽時隱藏下方功能區

- NO GAME 時隱藏統計／賽況／系列賽頁籤與其內容，有比賽資料時自動恢復。
- 初始載入先隱藏詳細資訊，避免短暫顯示空資料區；賽後精華維持隱藏。
- 此次只修改前端；先確認部署完成，最後更新 version.json。


## v1.7.3 統一統計與賽況邊框

- 統計內容加上與賽況相同的卡片外框、圓角及背景，頁籤下方間距一致。
- 統計／賽況卡片在手機上也保留完整四邊邊線，不另加完整 Box Score 標題或收合層級。


## v1.7.4 隱藏功能選單對戰名單入口

- 暫時隱藏漢堡功能選單中的「對戰名單」項目。
- 保留比分區對戰名單按鈕、頁面與程式，方便之後恢復選單入口。


## v1.7.5 無比賽提示

- NO GAME 時，在隱藏詳細資訊功能區的位置顯示提示卡片與切換日期說明。
- 裝置當地日期顯示「今日沒有比賽」；其他日期顯示「這天沒有比賽」。
- 有比賽資料時自動隱藏提示並恢復詳細資訊頁籤與內容。


## v1.7.6 清楚的完整邊框與影片政策入口隱藏

- 統計／賽況同樣保留完整四邊外框，邊線改為較明顯的 #42617f、圓角 18px；兩面板皆有左右 10px 留白，避免手機邊線貼齊滑動容器邊緣。
- 頁尾「隱私政策／使用條款」入口隨影片功能一起隱藏；政策頁仍保留供日後恢復影片功能。


## v1.7.7 固定頁尾

- 資料來源與版本頁尾固定在視窗底部，短頁與捲動時皆維持相同位置。
- 主內容預留底部空間，頁尾支援 iPhone 主畫面安全區，避免遮住最後一筆資料。
- 窄螢幕資料來源文字可省略，版本保持可見；影片政策入口維持隱藏。
