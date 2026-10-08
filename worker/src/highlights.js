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

function mentionsTeam(text, team) {
  const aliases = [team.teamName, team.name].filter(Boolean);
  if (team.id === 109) aliases.push('D-backs', 'Dbacks', 'Diamondbacks');
  const normalized = ` ${normalize(text)} `;
  return aliases.some(alias => normalized.includes(` ${normalize(alias)} `));
}

function sameGameNumber(video, game) {
  const number = game.doubleHeader && game.doubleHeader !== 'N' ? game.gameNumber :
    ['F','D','L','W'].includes(game.gameType) ? game.seriesGameNumber : null;
  if (!number) return true;
  const numbers = [...`${video.title} ${video.description}`.matchAll(/\b(?:game|gm)\s*(\d+)\b/gi)].map(match => Number(match[1]));
  if (game.doubleHeader && game.doubleHeader !== 'N' && !numbers.length) return false;
  return numbers.every(value => value === Number(number));
}

function hasGameContext(video, game, titleOnly = false) {
  const combined = `${video.title} ${video.description}`;
  const text = titleOnly ? video.title : combined;
  if (!['away','home'].every(side => mentionsTeam(text, game.teams[side].team))) return false;
  const [year, month, day] = game.officialDate.split('-').map(Number);
  const numericDates = [...combined.matchAll(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})\b/g)];
  const numericMatch = numericDates.some(([,m,d,y]) => +m === month && +d === day && (+y < 100 ? 2000 + +y : +y) === year);
  const namedMatch = new RegExp(`\\b${months[month-1]}\\s+0?${day}(?:st|nd|rd|th)?\\b`, 'i').test(combined) && new RegExp(`\\b${year}\\b`).test(combined);
  return (numericMatch || namedMatch) && sameGameNumber(video, game);
}

export function matchesGame(video, game) {
  const title = normalize(video.title);
  return /\bgame(?: \d+)? highlights\b/.test(title) &&
    !/\b(shorts?|full inning|every play|final \d+ outs|all games|series highlights)\b/.test(title) && hasGameContext(video, game, true);
}

function isRelatedClip(video) {
  const title = normalize(video.title);
  if (/\b(preview|prediction|morning lineup|all games|news|roundup|series highlights)\b/.test(title)) return false;
  // Exclude whole-series compilations even when the description mentions this game.
  if (/\bfull\b.*\b(?:nlds|alds|nlcs|alcs|world series) highlights\b/.test(title)) return false;
  return /\b(highlights?|home runs?|homers?|grand slam|strikeouts?|strikes out|fans \d+|full inning|every play|final \d+ outs|recap|catch|catches|robs?|robbed|pitching|innings|walk off)\b/.test(title);
}

export function classifyGameVideo(video, game) {
  if (matchesGame(video, game)) return 'full';
  if (!isRelatedClip(video) || !hasGameContext(video, game)) return null;
  const title = normalize(video.title);
  if (/home run|homer|grand slam/.test(title)) return 'homer';
  if (/catch|robbed|robs|defen|diving|throw/.test(title)) return 'defense';
  if (/strikeout|strikes out|fans \d+|pitching|scoreless|strong innings/.test(title)) return 'pitching';
  if (/final \d+ outs/.test(title)) return 'finish';
  if (/full inning/.test(title)) return 'inning';
  if (/every play/.test(title)) return 'plays';
  return 'related';
}

export function parseVideoDetails(html, expectedId) {
  const raw = html.match(/var ytInitialPlayerResponse = (\{.*?\});/s)?.[1];
  if (!raw) throw new Error('VIDEO_DETAILS_FORMAT');
  const video = JSON.parse(raw).videoDetails;
  if (video?.videoId !== expectedId || video?.channelId !== MLB_CHANNEL_ID) throw new Error('VIDEO_DETAILS_CHANNEL');
  return {title: video.title, description: video.shortDescription || ''};
}

export async function selectGameVideos(candidates, game, readDetails) {
  const selected = new Map();
  const add = video => {
    const kind = classifyGameVideo(video, game);
    if (kind) selected.set(video.id, {...video, kind});
  };
  candidates.forEach(add);
  // Search snippets can omit the opponent/date. Enrich only a bounded number of likely clips.
  const incomplete = candidates.filter(video => !selected.has(video.id) && isRelatedClip(video) &&
    !/\bgame(?: \d+)? highlights\b/i.test(video.title) && sameGameNumber(video, game) &&
    ['away','home'].some(side => mentionsTeam(`${video.title} ${video.description}`, game.teams[side].team))).slice(0, 4);
  await Promise.all(incomplete.map(async video => {
    try { add({...video, ...await readDetails(video.id)}); } catch (_) { /* Keep verified results if one clip fails. */ }
  }));
  const order = new Map(candidates.map((video, index) => [video.id, index]));
  return [...selected.values()].sort((a,b) => Number(b.kind === 'full') - Number(a.kind === 'full') || order.get(a.id) - order.get(b.id)).slice(0, 12);
}

async function getResponse(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(15000), headers: {'accept-language': 'en-US,en;q=0.9'}});
  if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
  return response;
}

export async function getGameHighlights(gamePk, cache) {
  const key = new Request(`https://mlb-highlights.internal/v2/games/${gamePk}`);
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
  const videos = await selectGameVideos(parseChannelVideos(html), game, async id => {
    const response = await getResponse(`https://www.youtube.com/watch?v=${id}`);
    return parseVideoDetails(await response.text(), id);
  });
  const result = {status: videos.length ? 'ready' : 'pending', gamePk, officialDate: game.officialDate, searchUrl, videos};
  if (cache) await cache.put(key, new Response(JSON.stringify(result), {headers: {'content-type': 'application/json', 'cache-control': `public, max-age=${videos.length ? 900 : 180}`}}));
  return result;
}
