/* 本場 MLB 官方 YouTube 賽後精華。 */
const recapCache = new Map();
const recapRequests = new Map();
let recapGeneration = 0;
let recapGamePk = null;
let recapRenderedKey = null;

function renderRecapMessage(message) {
  recapRenderedKey = null;
  els.recapList.innerHTML = `<div class="recap-empty">${esc(message)}</div>`;
  syncLiveDetailHeight();
}

function resetGameRecap() {
  recapGeneration++;
  recapGamePk = null;
  els.recapSummary.textContent = '選擇比賽後查看 MLB 官方影片';
  renderRecapMessage('目前沒有可顯示的比賽');
}

async function loadGameRecap(force = false) {
  const pk = Number(state.selectedGamePk);
  if (!pk || state.currentFeedGamePk !== pk) { resetGameRecap(); return; }
  const feed = state.currentFeed;
  const teams = feed?.gameData?.teams || {};
  const generation = ++recapGeneration;
  recapGamePk = pk;
  els.recapSummary.textContent = `${teams.away?.name || '客隊'} vs. ${teams.home?.name || '主隊'}`;
  if (feed?.gameData?.status?.abstractGameState !== 'Final') {
    renderRecapMessage('比賽尚未結束，賽後再來看精華');
    return;
  }
  const cached = recapCache.get(pk);
  if (!force && cached && Date.now() < cached.expires) { renderGameRecap(cached.data); return; }
  renderRecapMessage('正在尋找 MLB 官方精華與相關影片…');
  try {
    if (!recapRequests.has(pk)) {
      recapRequests.set(pk, fetch(`${PUSH_API}/api/highlights/${pk}`, {signal: AbortSignal.timeout(50000)})
        .then(async response => {
          if (!response.ok) throw new Error('Highlights unavailable');
          const data = await response.json();
          recapCache.set(pk, {data, expires: Date.now() + (data.status === 'ready' ? 900000 : 180000)});
          return data;
        }).finally(() => recapRequests.delete(pk)));
    }
    const data = await recapRequests.get(pk);
    if (generation !== recapGeneration || pk !== Number(state.selectedGamePk)) return;
    renderGameRecap(data);
  } catch (_) {
    if (generation !== recapGeneration || pk !== Number(state.selectedGamePk)) return;
    renderRecapMessage('暫時無法載入影片，請點「重新整理」再試一次');
  }
}

function renderGameRecap(data) {
  const renderKey = JSON.stringify(data);
  if (renderKey === recapRenderedKey) return;
  const videos = (data.videos || []).filter(video => /^[\w-]{11}$/.test(video.id));
  if (!videos.length) {
    renderRecapMessage(data.status === 'not-final' ? '比賽尚未結束，賽後再來看精華' : '目前尚未找到這場比賽的官方精華或相關影片');
    if (data.searchUrl?.startsWith('https://www.youtube.com/@MLB/search?')) {
      els.recapList.insertAdjacentHTML('beforeend', `<a class="recap-source-link" href="${esc(data.searchUrl)}" target="_blank" rel="noopener noreferrer">前往 MLB 官方頻道查看 ↗</a>`);
    }
  } else {
    els.recapList.innerHTML = videos.map(video => {
      const description = String(video.description || '').split(/Don't forget to subscribe|Follow us elsewhere/i)[0].trim();
      const videoLink = recapVideoLink(video.id);
      const kindLabel = ({full:'整場精華',homer:'全壘打',defense:'守備亮點',pitching:'投手表現',finish:'終場時刻',inning:'完整半局',plays:'逐球回顧',related:'相關片段'})[video.kind] || '整場精華';
      return `<article class="recap-item">
        <a class="recap-thumbnail" href="${esc(videoLink.href)}" data-youtube-id="${esc(video.id)}" target="${videoLink.target}" rel="noopener noreferrer" aria-label="觀看 ${esc(video.title)}">
          <img src="https://i.ytimg.com/vi/${esc(video.id)}/hqdefault.jpg" alt="${esc(video.title)}" loading="lazy" width="480" height="360">
          ${video.duration ? `<span class="recap-duration">${esc(video.duration)}</span>` : ''}
        </a>
        <div class="recap-copy"><h3><a href="${esc(videoLink.href)}" data-youtube-id="${esc(video.id)}" target="${videoLink.target}" rel="noopener noreferrer">${esc(video.title)}</a></h3>
          <div class="recap-meta">${esc(kindLabel)} · MLB 官方 · ${esc(data.officialDate)}</div>
          <p>${esc(description || '前往 YouTube 觀看這場比賽的完整賽後精華。')}</p>
          <a class="recap-meta" href="https://www.youtube.com/watch?v=${esc(video.id)}" target="_blank" rel="noopener noreferrer">使用網頁版 ↗</a>
        </div>
      </article>`;
    }).join('');
  }
  recapRenderedKey = renderKey;
  requestAnimationFrame(() => syncLiveDetailHeight());
}


// Use a real anchor destination so the OS handles the original user tap.
function recapVideoLink(id) {
  const webUrl = 'https://www.youtube.com/watch?v=' + id;
  const nav = typeof navigator === 'undefined' ? {} : navigator;
  const ua = nav.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  if (ios) return {href: 'youtube://www.youtube.com/watch?v=' + id, target: '_self', ios: true};
  if (/Android/.test(ua) && /Chrome|SamsungBrowser/.test(ua)) {
    return {href: 'intent://www.youtube.com/watch?v=' + id +
      '#Intent;scheme=https;package=com.google.android.youtube;S.browser_fallback_url=' + encodeURIComponent(webUrl) + ';end', target: '_self'};
  }
  return {href: webUrl, target: '_blank'};
}
// Observe the native click only to provide a fallback. Never cancel navigation.
let cancelYouTubeLaunch = null;
function openRecapVideo(event) {
  const link = event.target.closest('[data-youtube-id]');
  if (!link || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const id = link.dataset.youtubeId;
  if (!/^[\w-]{11}$/.test(id)) return;
  const webUrl = 'https://www.youtube.com/watch?v=' + id;
  if (!recapVideoLink(id).ios) return;
  if (cancelYouTubeLaunch) cancelYouTubeLaunch();
  let timer;
  const started = Date.now();
  const cleanup = () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', cleanup);
    if (cancelYouTubeLaunch === cleanup) cancelYouTubeLaunch = null;
  };
  const onVisibility = () => { if (document.hidden) cleanup(); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', cleanup);
  cancelYouTubeLaunch = cleanup;
  timer = setTimeout(() => {
    cleanup();
    // Never send the user to the web player after returning from the app.
    if (!document.hidden && Date.now() - started < 5000) location.assign(webUrl);
  }, 2200);
  // The anchor's default action opens YouTube; this handler only arms the fallback.
}
