/* 官方頻道影片推薦：YouTube Data API 原始資訊，無 AI 翻譯。 */
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
  els.recapSummary.textContent = '選擇比賽後查看官方頻道影片';
  renderRecapMessage('目前沒有可顯示的比賽');
}

async function loadGameRecap(force = false) {
  const pk = Number(state.selectedGamePk);
  if (!pk || state.currentFeedGamePk !== pk) { resetGameRecap(); return; }
  const feed = state.currentFeed;
  const teams = feed?.gameData?.teams || {};
  const generation = ++recapGeneration;
  recapGamePk = pk;
  els.recapSummary.textContent = `${recapTeamName(teams.away) || '客隊'} 對 ${recapTeamName(teams.home) || '主隊'}`;
  if (feed?.gameData?.status?.abstractGameState !== 'Final') {
    renderRecapMessage('比賽尚未結束，賽後再來看精華');
    return;
  }
  if (!hasRecapConsent()) { renderRecapConsent(); return; }
  const cached = recapCache.get(pk);
  if (!force && cached && Date.now() < cached.expires) { renderGameRecap(cached.data); return; }
  renderRecapMessage('正在尋找愛爾達與 MLB 官方影片…');
  try {
    if (!recapRequests.has(pk)) {
      recapRequests.set(pk, fetch(`${PUSH_API}/api/highlights/${pk}`, {signal: AbortSignal.timeout(60000)})
        .then(async response => {
          if (!response.ok) throw new Error('Highlights unavailable');
          const data = await response.json();
          if (hasRecapConsent()) recapCache.set(pk, {data, expires: Date.now() + (data.status === 'ready' ? 900000 : 180000)});
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

function hasRecapConsent() {
  try { return sessionStorage.getItem('mlb-youtube-consent') === '1.7.0'; } catch (_) { return false; }
}

function renderRecapConsent() {
  if (recapRenderedKey === 'consent') return;
  renderRecapMessage('');
  els.recapList.innerHTML = `<div class="recap-consent">
    <p>此功能使用 YouTube API Services，顯示官方頻道的公開影片資訊。載入縮圖時，瀏覽器會連線至 YouTube 圖片服務；點擊影片將前往 YouTube。</p>
    <p>請先閱讀並同意<a href="./privacy.html">隱私政策</a>及<a href="./terms.html">使用條款</a>，包含 <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube 服務條款</a>與<a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google 隱私政策</a>。</p>
    <button type="button" data-recap-consent="accept">同意並查看影片推薦</button>
  </div>`;
  recapRenderedKey = 'consent';
  syncLiveDetailHeight();
}

function recapSourceLinks(data) {
  return (data.sourceLinks || []).filter(link => /^https:\/\/www\.youtube\.com\/@(?:MLB|ELTASPORTSHD)\/search\?/.test(link.url || '')).map(link =>
    `<a class="recap-source-link" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">前往 ${esc(link.label)} 搜尋 ↗</a>`).join('');
}

function renderGameRecap(data) {
  if (!hasRecapConsent()) { renderRecapConsent(); return; }
  const renderKey = JSON.stringify(data);
  if (renderKey === recapRenderedKey) return;
  // Never display v1.6 scraped/translated responses during deployment or from an old endpoint.
  if (data.videos?.length && !Number.isFinite(data.fetchedAt)) {
    renderRecapMessage('影片推薦正在更新，請稍後重新整理');
    return;
  }
  const videos = (data.videos || []).filter(video => /^[\w-]{11}$/.test(video.id) &&
    /^UC[\w-]{22}$/.test(video.channelId || '') && /^https:\/\/(?:i\.ytimg\.com|img\.youtube\.com)\//.test(video.thumbnail || ''));
  const messages = {'not-final':'比賽尚未結束，賽後再來看精華','setup-required':'影片列表尚未啟用，可先前往官方頻道搜尋',
    unavailable:'暫時無法取得影片列表，可前往官方頻道搜尋'};
  const header = `<p class="recap-meta">本網站依對戰與日期篩選推薦，並非 YouTube 的完整搜尋結果；本網站未與影片頻道合作或獲其背書。影片資訊與縮圖來自 YouTube。</p>`;
  if (!videos.length) {
    els.recapList.innerHTML = header + `<div class="recap-empty">${esc(messages[data.status] || '目前尚未找到可確認為同場比賽的官方影片')}</div>` + recapSourceLinks(data);
  } else {
    els.recapList.innerHTML = header + videos.map(video => {
      const videoLink = recapVideoLink(video.id);
      return `<article class="recap-item">
        <a class="recap-thumbnail" href="${esc(videoLink.href)}" data-youtube-id="${esc(video.id)}" target="${videoLink.target}" rel="noopener noreferrer" aria-label="前往 YouTube 觀看 ${esc(video.title)}">
          <img src="${esc(video.thumbnail)}" alt="${esc(video.title)}" loading="lazy" referrerpolicy="no-referrer">
        </a>
        <div class="recap-copy"><h3><a href="${esc(videoLink.href)}" data-youtube-id="${esc(video.id)}" target="${videoLink.target}" rel="noopener noreferrer">${esc(video.title)}</a></h3>
          <div class="recap-meta">YouTube · <a href="https://www.youtube.com/channel/${esc(video.channelId)}" target="_blank" rel="noopener noreferrer">${esc(video.channelTitle)}</a></div>
          <div class="recap-meta">本網站配對之 MLB 比賽日期：${esc(data.officialDate)}</div>
          <details class="recap-original"><summary>影片原始介紹</summary><p class="recap-description">${esc(video.description || '此影片未提供介紹。')}</p></details>
          <a class="recap-meta" href="https://www.youtube.com/watch?v=${esc(video.id)}" target="_blank" rel="noopener noreferrer">前往 YouTube 網頁觀看 ↗</a>
        </div>
      </article>`;
    }).join('') + (data.partial ? '<p class="recap-meta">部分頻道暫時無法取得，先顯示已確認影片。</p>' : '') + recapSourceLinks(data);
  }
  els.recapList.insertAdjacentHTML('beforeend', '<button type="button" class="recap-withdraw" data-recap-consent="withdraw">撤回影片功能同意</button>');
  recapRenderedKey = renderKey;
  requestAnimationFrame(() => syncLiveDetailHeight());
}

if (typeof els !== 'undefined' && els.recapList) {
  on(els.recapList,'click', event => {
    const action = event.target.closest('[data-recap-consent]')?.dataset.recapConsent;
    if (!action) return;
    if (action === 'accept') {
      try { sessionStorage.setItem('mlb-youtube-consent','1.7.0'); } catch (_) { renderRecapMessage('瀏覽器無法保存同意狀態，請允許此網站的儲存空間後再試。'); return; }
      loadGameRecap(true);
    } else {
      try { sessionStorage.removeItem('mlb-youtube-consent'); } catch (_) {}
      recapGeneration++;
      recapCache.clear();
      recapRenderedKey = null;
      if (cancelYouTubeLaunch) cancelYouTubeLaunch();
      renderRecapConsent();
    }
  });
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
  on(document,'visibilitychange', onVisibility);
  on(window,'pagehide', cleanup);
  cancelYouTubeLaunch = cleanup;
  timer = setTimeout(() => {
    cleanup();
    // Never send the user to the web player after returning from the app.
    if (!document.hidden && Date.now() - started < 5000) location.assign(webUrl);
  }, 2200);
  // The anchor's default action opens YouTube; this handler only arms the fallback.
}


function recapTeamName(team) {
  const names = {108:'天使',109:'響尾蛇',110:'金鶯',111:'紅襪',112:'小熊',113:'紅人',114:'守護者',115:'洛磯',116:'老虎',117:'太空人',118:'皇家',119:'道奇',120:'國民',121:'大都會',133:'運動家',134:'海盜',135:'教士',136:'水手',137:'巨人',138:'紅雀',139:'光芒',140:'遊騎兵',141:'藍鳥',142:'雙城',143:'費城人',144:'勇士',145:'白襪',146:'馬林魚',147:'洋基',158:'釀酒人'};
  return names[team?.id] || team?.name || '';
}
