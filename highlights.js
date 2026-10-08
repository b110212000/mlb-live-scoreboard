/* 本場 MLB 官方 YouTube 賽後精華。 */
const recapCache = new Map();
const recapRequests = new Map();
let recapGeneration = 0;
let recapGamePk = null;

function renderRecapMessage(message) {
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
  renderRecapMessage('正在尋找 MLB 官方賽後精華…');
  try {
    if (!recapRequests.has(pk)) {
      recapRequests.set(pk, fetch(`${PUSH_API}/api/highlights/${pk}`, {signal: AbortSignal.timeout(35000)})
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
  const videos = (data.videos || []).filter(video => /^[\w-]{11}$/.test(video.id));
  if (!videos.length) {
    renderRecapMessage(data.status === 'not-final' ? '比賽尚未結束，賽後再來看精華' : '目前尚未找到這場比賽的官方精華');
    if (data.searchUrl?.startsWith('https://www.youtube.com/@MLB/search?')) {
      els.recapList.insertAdjacentHTML('beforeend', `<a class="recap-source-link" href="${esc(data.searchUrl)}" target="_blank" rel="noopener noreferrer">前往 MLB 官方頻道查看 ↗</a>`);
    }
  } else {
    els.recapList.innerHTML = videos.map(video => {
      const description = String(video.description || '').split(/Don't forget to subscribe|Follow us elsewhere/i)[0].trim();
      return `<article class="recap-item">
        <a class="recap-thumbnail" href="https://www.youtube.com/watch?v=${esc(video.id)}" data-youtube-id="${esc(video.id)}" target="_blank" rel="noopener noreferrer" aria-label="觀看 ${esc(video.title)}">
          <img src="https://i.ytimg.com/vi/${esc(video.id)}/hqdefault.jpg" alt="${esc(video.title)}" loading="lazy" width="480" height="360">
          ${video.duration ? `<span class="recap-duration">${esc(video.duration)}</span>` : ''}
        </a>
        <div class="recap-copy"><h3><a href="https://www.youtube.com/watch?v=${esc(video.id)}" data-youtube-id="${esc(video.id)}" target="_blank" rel="noopener noreferrer">${esc(video.title)}</a></h3>
          <div class="recap-meta">MLB 官方 · 比賽日期 ${esc(data.officialDate)}</div>
          <p>${esc(description || '前往 YouTube 觀看這場比賽的完整賽後精華。')}</p>
          <a class="recap-meta" href="https://www.youtube.com/watch?v=${esc(video.id)}" target="_blank" rel="noopener noreferrer">使用網頁版 ↗</a>
        </div>
      </article>`;
    }).join('');
  }
  requestAnimationFrame(() => syncLiveDetailHeight());
}


// Launch synchronously from the tap; delayed app launches lose browser user activation.
let cancelYouTubeLaunch = null;
function openRecapVideo(event) {
  const link = event.target.closest('[data-youtube-id]');
  if (!link || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const id = link.dataset.youtubeId;
  if (!/^[\w-]{11}$/.test(id)) return;
  const webUrl = 'https://www.youtube.com/watch?v=' + id;
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const androidChrome = /Android/.test(ua) && /Chrome|SamsungBrowser/.test(ua);
  if (!ios && !androidChrome) return; // Preserve desktop/modifier-click behavior.
  event.preventDefault();
  if (cancelYouTubeLaunch) cancelYouTubeLaunch();
  if (androidChrome) {
    location.assign('intent://www.youtube.com/watch?v=' + id +
      '#Intent;scheme=https;package=com.google.android.youtube;S.browser_fallback_url=' + encodeURIComponent(webUrl) + ';end');
    return;
  }
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
  try {
    location.assign('youtube://www.youtube.com/watch?v=' + id);
  } catch (_) {
    cleanup();
    location.assign(webUrl);
  }
}
