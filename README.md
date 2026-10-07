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
- 即時比賽下半部三分頁：統計 / 賽況 / 系列賽
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
- 下拉重新整理
- 網站版本更新偵測

公開網站：

https://b110212000.github.io/mlb-live-scoreboard/

---

## 專案架構

本專案不需要 Backend，也不需要資料庫。

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
| `service-worker.js` | 舊 PWA Cache 清除與解除註冊用途 |
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
- 本專案沒有自己的 Backend。
- 本專案目前沒有離線比賽資料模式。
- 球隊 Logo、球員照片與比賽資料來源皆屬 MLB 相關資料來源。

---

## License

此專案目前主要作為個人 MLB 即時戰況工具使用。


## 版本號規則

目前版本：`v1.0.7`

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
