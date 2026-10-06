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
- 季後賽淘汰賽戰況
- 系列賽目前勝敗與晉級狀態
- 比賽時間依使用者裝置時區自動換算
- iPhone / iPad 加入主畫面
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
&date=YYYY-MM-DD
&hydrate=team,linescore
```

用途：

- 取得指定日期 MLB 比賽
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

## 3. 季後賽戰況

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

網站會檢查 `index.html` 是否有更新。

當 GitHub Pages 已部署新版，而使用者重新回到 App 時，網站會檢查版本並重新載入，以降低 iPhone Web App 使用舊 CSS / JavaScript 的問題。

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
