// Web Push 會在下一階段接上 VAPID。
// 目前先保留統一入口，讓 GameMonitor 的流程已經完整，
// 之後只需要替換這個函式，不必重寫監控邏輯。

export async function sendScorePush({ gamePk, subscribers, scoring }) {
  if (!Array.isArray(subscribers) || subscribers.length === 0 || !scoring) {
    return { sent: 0, enabled: false };
  }

  console.log("Push pending VAPID setup", {
    gamePk,
    subscribers: subscribers.length,
    scoring
  });

  return {
    sent: 0,
    enabled: false,
    reason: "VAPID_NOT_CONFIGURED"
  };
}
