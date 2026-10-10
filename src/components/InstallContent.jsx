import {memo} from 'react';
export const InstallContent=memo(function InstallContent(){return <>

<section className="card install-shell">
<div className="install-head">
<div className="install-app-icon"><img src="./app-icon.svg?v=2.0.2" alt="MLB 戰況 App 圖示" /></div>
<h2>{"MLB 戰況 App"}</h2>
<p>{"分享給朋友，或加入 iPhone 主畫面，以 App 模式直接開啟。"}</p>
<div id="installStatus" className="install-status">{"檢查裝置狀態中…"}</div>
</div>
<div className="install-actions">
<button id="installAppBtn" className="install-action primary" type="button">
<span className="install-action-icon">{"📲"}</span>
<strong>{"安裝到主畫面"}</strong>
<small id="installAppHint">{"查看安裝方式"}</small>
</button>
<button id="shareAppBtn" className="install-action" type="button">
<span className="install-action-icon">{"↗️"}</span>
<strong>{"分享這個 App"}</strong>
<small>{"開啟系統分享"}</small>
</button>
<button id="copyAppBtn" className="install-action" type="button">
<span className="install-action-icon">{"🔗"}</span>
<strong>{"複製網址"}</strong>
<small id="copyAppHint">{"複製網站連結"}</small>
</button>
</div>
<div id="installGuide" className="install-guide">
<div className="install-guide-title">{"iPhone / iPad 加入主畫面"}</div>
<div className="install-steps">
<div className="install-step">
<div className="install-step-num">{"1"}</div>
<div className="install-step-icon">{"🧭"}</div>
<div><b>{"使用 Safari 開啟"}</b><span>{"如果目前不是 Safari，先用 Safari 打開這個網站。"}</span></div>
</div>
<div className="install-step">
<div className="install-step-num">{"2"}</div>
<div className="install-step-icon">{"⬆️"}</div>
<div><b>{"按 Safari 的分享按鈕"}</b><span>{"找到方框往上箭頭的「分享」按鈕。"}</span></div>
</div>
<div className="install-step">
<div className="install-step-num">{"3"}</div>
<div className="install-step-icon">{"➕"}</div>
<div><b>{"加入主畫面"}</b><span>{"選「加入主畫面」，再按右上角「加入」。"}</span></div>
</div>
</div>
</div>
<div className="install-tip">{"iOS 不允許網站自行把 App 加到桌面，所以最後的「加入主畫面」必須由你親自確認。已加入後，從桌面開啟會使用獨立 App 模式。"}</div>
</section>

</>});
