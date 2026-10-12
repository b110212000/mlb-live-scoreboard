import {memo} from 'react';
import {t} from '../i18n.js';
// Stable hosts: notifications.js 直接更新這些元素的文字與狀態，因此這個元件只在 lang 改變時重畫
// （重畫只更新文字；engine 的 relocalize 會接著把狀態文字換成新語言）。
export const NotificationContent=memo(function NotificationContent(){return <>

<section className="card notification-shell">
<div className="notification-head">
<div className="notification-icon">{"🔔"}</div>
<h2>{t('測試這台裝置的推播')}</h2>
<p>{t('確認通知權限與背景推播都正常。要訂閱比賽、追蹤球隊或調整提醒項目，請到「訂閱管理」。')}</p>
<div id="notificationStatus" className="notification-status">{t('檢查裝置通知能力中…')}</div>
</div>
<div className="notification-checks">
<div className="notification-check">
<span>{t('通知權限')}</span>
<strong id="notificationPermission">{t('尚未確認')}</strong>
</div>
<div className="notification-check">
<span>{t('Push 訂閱')}</span>
<strong id="notificationSubscription">{t('尚未建立 Push 訂閱')}</strong>
</div>
<div className="notification-check">
<span>{t('最近測試')}</span>
<strong id="notificationLastTest">{t('尚未測試')}</strong>
</div>
</div>
<button id="testNotificationBtn" className="notification-test-button" type="button">
<span className="notification-test-icon">{"🔔"}</span>
<span>
<strong>{t('測試訂閱')}</strong>
<small>{t('立即通知一次，30 秒後再背景通知一次')}</small>
</span>
</button>
<div id="notificationTestMessage" className="notification-test-message">{t('點擊後會要求通知權限，第一則與 30 秒後的第二則都會由 Cloudflare Web Push 發送。')}</div>
<div className="notification-flow">
<div><b>{"1"}</b><span>{t('允許通知')}</span></div>
<i>{"→"}</i>
<div><b>{"2"}</b><span>{t('立即收到')}</span></div>
<i>{"→"}</i>
<div><b>{"3"}</b><span>{t('關閉網站')}</span></div>
<i>{"→"}</i>
<div><b>{"4"}</b><span>{t('30 秒後再收到')}</span></div>
</div>
<div className="notification-note">{t('iPhone / iPad 必須先用 Safari 將網站「加入主畫面」，再從主畫面開啟 MLB 戰況後測試。第二則通知用來確認網站關閉或手機鎖定後，背景 Push 仍可正常送達。')}</div>
</section>

</>});
