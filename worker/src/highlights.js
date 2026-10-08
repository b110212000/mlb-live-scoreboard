// Public MLB channel only. No API key or third-party video source.
export const MLB_CHANNEL_ID = 'UCoLrcjPV5PbUrUyXq5mjc_A';
const textOf = value => value?.simpleText || (value?.runs || []).map(run => run.text || '').join('');
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function parseChannelVideos(html) {
  const raw = html.match(/var ytInitialData = (\{.*?\});<\/script>/s)?.[1];
  if (!raw) throw new Error('VIDEO_SOURCE_FORMAT');
  const data = JSON.parse(raw);
  if (data.metadata?.channelMetadataRenderer?.externalId !== MLB_CHANNEL_ID) throw new Error('VIDEO_SOURCE_CHANNEL');
  const videos = new Map();
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    const video = node.videoRenderer;
    if (video) {
      const owners = video.ownerText?.runs || video.shortBylineText?.runs || [];
      if (owners.some(owner => owner.navigationEndpoint?.browseEndpoint?.browseId === MLB_CHANNEL_ID) && /^[\w-]{11}$/.test(video.videoId)) {
        const id = video.videoId;
        videos.set(id, {
          id, title: textOf(video.title),
          description: textOf(video.descriptionSnippet) || textOf(video.detailedMetadataSnippets?.[0]?.snippetText),
          duration: textOf(video.lengthText),
          url: `https://www.youtube.com/watch?v=${id}`,
          thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
        });
      }
    }
    for (const child of Object.values(node)) visit(child);
  };
  visit(data.contents);
  return [...videos.values()];
}

export function matchesGame(video, game) {
  const title = normalize(video.title);
  const combined = `${video.title} ${video.description}`;
  if (!/\bgame(?: \d+)? highlights\b/.test(title)) return false;
  if (/\b(shorts?|full inning|every play|final \d+ outs|all games|series highlights)\b/.test(title)) return false;
  for (const side of ['away', 'home']) {
    const team = game.teams[side].team;
    const aliases = [team.teamName, team.name].filter(Boolean);
    if (team.id === 109) aliases.push('D-backs', 'Dbacks', 'Diamondbacks');
    if (!aliases.some(alias => (` ${title} `).includes(` ${normalize(alias)} `))) return false;
  }
  const [year, month, day] = game.officialDate.split('-').map(Number);
  // Require a complete date, not just upload time (Taiwan and US dates differ).
  const numericDates = [...combined.matchAll(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})\b/g)];
  const numericMatch = numericDates.some(([,m,d,y]) => +m === month && +d === day && (+y < 100 ? 2000 + +y : +y) === year);
  const namedMatch = new RegExp(`\\b${months[month-1]}\\s+0?${day}(?:st|nd|rd|th)?\\b`, 'i').test(combined) && new RegExp(`\\b${year}\\b`).test(combined);
  if (!numericMatch && !namedMatch) return false;
  if (game.doubleHeader && game.doubleHeader !== 'N') {
    if (!new RegExp(`\\b(?:game|gm)\\s*${Number(game.gameNumber)}\\b`, 'i').test(combined)) return false;
  }
  return true;
}

async function getResponse(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(15000), headers: {'accept-language': 'en-US,en;q=0.9'}});
  if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
  return response;
}

export async function getGameHighlights(gamePk, cache) {
  const key = new Request(`https://mlb-highlights.internal/v1/games/${gamePk}`);
  const cached = cache && await cache.match(key);
  if (cached) return cached.json();
  const schedule = await (await getResponse(`https://statsapi.mlb.com/api/v1/schedule?gamePk=${gamePk}&hydrate=team`)).json();
  const game = (schedule.dates || []).flatMap(date => date.games || []).find(game => Number(game.gamePk) === gamePk);
  if (!game) return {status: 'not-found', videos: []};
  if (game.status?.abstractGameState !== 'Final') return {status: 'not-final', videos: []};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(game.officialDate || '')) throw new Error('GAME_DATE_MISSING');
  const [year, month, day] = game.officialDate.split("-").map(Number);
  const query = `${game.teams.away.team.teamName || game.teams.away.team.name} ${game.teams.home.team.teamName || game.teams.home.team.name} ${months[month-1]} ${day} ${year} Highlights`;
  const searchUrl = `https://www.youtube.com/@MLB/search?query=${encodeURIComponent(query)}`;
  const html = await (await getResponse(searchUrl)).text();
  const videos = parseChannelVideos(html).filter(video => matchesGame(video, game)).slice(0, 6);
  const result = {status: videos.length ? 'ready' : 'pending', gamePk, officialDate: game.officialDate, searchUrl, videos};
  if (cache) await cache.put(key, new Response(JSON.stringify(result), {headers: {'content-type': 'application/json', 'cache-control': `public, max-age=${videos.length ? 900 : 180}`}}));
  return result;
}
