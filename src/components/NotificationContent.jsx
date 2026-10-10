import {memo} from 'react';
export const NotificationContent=memo(function NotificationContent(){return <>

<section className="card notification-shell">
<div className="notification-head">
<div className="notification-icon">{"🔔"}</div>
<h2>{"訂閱通知"}</h2>
<p>{"比分中央的鈴鐺可訂閱單場比賽；此頁保留 Web Push 測試工具。"}</p>
<div id="notificationStatus" className="notification-status">{"檢查裝置通知能力中…"}</div>
</div>
<div className="notification-checks">
<div className="notification-check">
<span>{"通知權限"}</span>
<strong id="notificationPermission">{"尚未確認"}</strong>
</div>
<div className="notification-check">
<span>{"Push 訂閱"}</span>
<strong id="notificationSubscription">{"尚未建立 Push 訂閱"}</strong>
</div>
<div className="notification-check">
<span>{"最近測試"}</span>
<strong id="notificationLastTest">{"尚未測試"}</strong>
</div>
</div>
<button id="testNotificationBtn" className="notification-test-button" type="button">
<span className="notification-test-icon">{"🔔"}</span>
<span>
<strong>{"測試訂閱"}</strong>
<small>{"立即通知一次，30 秒後再背景通知一次"}</small>
</span>
</button>
<div id="notificationTestMessage" className="notification-test-message">{"\n          點擊後會要求通知權限，第一則與 30 秒後的第二則都會由 Cloudflare Web Push 發送。\n        "}</div>
<div className="notification-flow">
<div><b>{"1"}</b><span>{"允許通知"}</span></div>
<i>{"→"}</i>
<div><b>{"2"}</b><span>{"立即收到"}</span></div>
<i>{"→"}</i>
<div><b>{"3"}</b><span>{"關閉網站"}</span></div>
<i>{"→"}</i>
<div><b>{"4"}</b><span>{"30 秒後再收到"}</span></div>
</div>
<div className="notification-note">{"\n          iPhone / iPad 必須先用 Safari 將網站「加入主畫面」，再從主畫面開啟 MLB 戰況後測試。第二則通知用來確認網站關閉或手機鎖定後，背景 Push 仍可正常送達。\n        "}</div>
</section>

</>});
