// Public metadata via YouTube Data API v3 only. No HTML scraping or AI inference.
export const MLB_CHANNEL_ID = 'UCoLrcjPV5PbUrUyXq5mjc_A';
const API = 'https://www.googleapis.com/youtube/v3/';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const ZH_TEAMS = {108:'天使',109:'響尾蛇',110:'金鶯',111:'紅襪',112:'小熊',113:'紅人',114:'守護者',115:'洛磯',116:'老虎',117:'太空人',118:'皇家',119:'道奇',120:'國民',121:'大都會',133:'運動家',134:'海盜',135:'教士',136:'水手',137:'巨人',138:'紅雀',139:'光芒',140:'遊騎兵',141:'藍鳥',142:'雙城',143:'費城人',144:'勇士',145:'白襪',146:'馬林魚',147:'洋基',158:'釀酒人'};
const inFlight = new Map();
const normalize = text => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function youtube(resource, params, apiKey) {
  const url = new URL(resource, API);
  for (const [key,value] of Object.entries(params)) url.searchParams.set(key, value);
  // Secret stays server-side and out of URLs/log messages.
  const response = await fetch(url, {headers: {'X-Goog-Api-Key': apiKey}, signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`YOUTUBE_API_${response.status}`);
  return response.json();
}

function mentionsTeam(text, team, chinese) {
  if (chinese && ZH_TEAMS[team.id] && text.includes(ZH_TEAMS[team.id])) return true;
  const aliases = [team.teamName,team.name].filter(Boolean);
  if (team.id === 109) aliases.push('D-backs','Dbacks','Diamondbacks');
  const clean = ` ${normalize(text)} `;
  return aliases.some(alias => clean.includes(` ${normalize(alias)} `));
}

export function matchesGame(video, game, chinese = false) {
  const text = `${video.title} ${video.description}`;
  if (!['away','home'].every(side => mentionsTeam(text,game.teams[side].team,chinese))) return false;
  if (chinese && !/MLB|美國職棒|大聯盟/i.test(text)) return false;
  if (/preview|prediction|series highlights|all games|賽前預告|賽前分析|轉播預告/i.test(video.title)) return false;
  const expected = game.doubleHeader && game.doubleHeader !== 'N' ? game.gameNumber :
    ['F','D','L','W'].includes(game.gameType) ? game.seriesGameNumber : null;
  const numbers = [...text.matchAll(/\b(?:game|gm|g)\s*(\d+)\b|第\s*(\d+)\s*(?:戰|場)/gi)].map(m => Number(m[1] || m[2]));
  if (expected && numbers.some(n => n !== Number(expected))) return false;
  if (game.doubleHeader && game.doubleHeader !== 'N' && !numbers.length) return false;
  // ELTA commonly uses Taiwan's next-day date. Require an explicit full date,
  // both opponents, and no conflicting series/game number; never use upload date alone.
  const dates = [game.officialDate];
  if (chinese) {
    const taiwan = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(game.gameDate));
    if (/^\d{4}-\d{2}-\d{2}$/.test(taiwan)) dates.push(taiwan);
  }
  return [...new Set(dates)].some(date => {
    const [y,m,d] = date.split('-').map(Number);
    const numeric = [...text.matchAll(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})\b/g)].some(([,mm,dd,yy]) => +mm===m && +dd===d && (+yy<100?2000+ +yy:+yy)===y);
    const iso = new RegExp(`(?:^|[^0-9])${y}[-/]0?${m}[-/]0?${d}(?![0-9])`).test(text);
    const compact = text.includes(`${y}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}`);
    const named = new RegExp(`\\b${MONTHS[m-1]}\\s+0?${d}(?:st|nd|rd|th)?\\b`,'i').test(text) && new RegExp(`\\b${y}\\b`).test(text);
    return numeric || iso || compact || named;
  });
}

export function publicVideo(item, channelId) {
  const s = item.snippet;
  if (!/^[\w-]{11}$/.test(item.id || '') || s?.channelId !== channelId || item.status?.privacyStatus !== 'public' || s.liveBroadcastContent !== 'none') return null;
  const thumbnail = s.thumbnails?.high || s.thumbnails?.medium || s.thumbnails?.default;
  if (!thumbnail?.url || !/^https:\/\/(?:i\.ytimg\.com|img\.youtube\.com)\//.test(thumbnail.url)) return null;
  // Preserve original API title/description/thumbnail. No translation, rewrite, or inferred categories.
  return {id:item.id,title:s.title,description:s.description || '',channelId,channelTitle:s.channelTitle,
    channelUrl:`https://www.youtube.com/channel/${channelId}`,url:`https://www.youtube.com/watch?v=${item.id}`,
    thumbnail:thumbnail.url,thumbnailWidth:thumbnail.width,thumbnailHeight:thumbnail.height,publishedAt:s.publishedAt};
}

async function channelVideos(channelId, query, game, apiKey) {
  const start = new Date(game.officialDate+'T00:00:00Z');
  const end = new Date(start.getTime()+4*86400000);
  const found = await youtube('search',{part:'snippet',type:'video',channelId,q:query,maxResults:'50',order:'relevance',
    publishedAfter:start.toISOString(),publishedBefore:end.toISOString()},apiKey);
  const ids = [...new Set((found.items || []).filter(item=>item.snippet?.channelId===channelId).map(item=>item.id?.videoId).filter(id=>/^[\w-]{11}$/.test(id || '')))];
  if (!ids.length) return [];
  const details = await youtube('videos',{part:'snippet,status',id:ids.join(',')},apiKey);
  const byId = new Map((details.items || []).map(item=>[item.id,item]));
  return ids.map(id=>byId.get(id)).filter(Boolean).map(item=>publicVideo(item,channelId)).filter(Boolean);
}

export function sourceLinks(game) {
  const teams = game.teams;
  const english = `${teams.away.team.teamName || teams.away.team.name} ${teams.home.team.teamName || teams.home.team.name} ${game.officialDate}`;
  const chinese = `MLB ${ZH_TEAMS[teams.away.team.id] || teams.away.team.name} ${ZH_TEAMS[teams.home.team.id] || teams.home.team.name} ${game.officialDate.replaceAll('-','')}`;
  return [{label:'愛爾達體育家族｜中文',url:`https://www.youtube.com/@ELTASPORTSHD/search?query=${encodeURIComponent(chinese)}`},
    {label:'MLB 官方頻道｜英文',url:`https://www.youtube.com/@MLB/search?query=${encodeURIComponent(english)}`}];
}

async function loadHighlights(gamePk,cache,env) {
  const response = await fetch(`https://statsapi.mlb.com/api/v1/schedule?gamePk=${gamePk}&hydrate=team`,{signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error('MLB_SOURCE_UNAVAILABLE');
  const schedule = await response.json();
  const game = (schedule.dates || []).flatMap(date=>date.games || []).find(game=>Number(game.gamePk)===gamePk);
  if (!game) return {status:'not-found',videos:[]};
  if (game.status?.abstractGameState !== 'Final') return {status:'not-final',videos:[]};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(game.officialDate || '') || !Number.isFinite(Date.parse(game.gameDate))) throw new Error('GAME_DATE_MISSING');
  const base = {gamePk,officialDate:game.officialDate,sourceLinks:sourceLinks(game)};
  if (!env.YOUTUBE_API_KEY) return {...base,status:'setup-required',videos:[]};
  // New namespace never reads the former scraped/AI-translated cache.
  const key = new Request(`https://mlb-highlights.internal/youtube-api-v1/games/${gamePk}`);
  const cached = cache && await cache.match(key);
  if (cached) {
    const result = await cached.json();
    if (Date.now()-result.fetchedAt < 21600000) return result;
  }
  try {
    const channelKey = new Request('https://mlb-highlights.internal/youtube-api-v1/elta-channel');
    const saved = cache && await cache.match(channelKey);
    let channel = saved && await saved.json();
    if (!channel || Date.now()-channel.fetchedAt >= 86400000) {
      const data = await youtube('channels',{part:'snippet',forHandle:'@ELTASPORTSHD'},env.YOUTUBE_API_KEY);
      const item = data.items?.[0];
      if (!/^UC[\w-]{22}$/.test(item?.id || '') || item.snippet?.customUrl?.toLowerCase() !== '@eltasportshd') throw new Error('ELTA_CHANNEL_UNVERIFIED');
      channel = {id:item.id,fetchedAt:Date.now()};
      if (cache) await cache.put(channelKey,new Response(JSON.stringify(channel),{headers:{'cache-control':'public, max-age=86400'}}));
    }
    const english = `${game.teams.away.team.teamName || game.teams.away.team.name} ${game.teams.home.team.teamName || game.teams.home.team.name}`;
    const chinese = `MLB ${ZH_TEAMS[game.teams.away.team.id] || ''} ${ZH_TEAMS[game.teams.home.team.id] || ''}`;
    const results = await Promise.allSettled([
      channelVideos(channel.id,chinese,game,env.YOUTUBE_API_KEY),
      channelVideos(MLB_CHANNEL_ID,english,game,env.YOUTUBE_API_KEY)
    ]);
    const videos = [];
    results.forEach((result,index)=>{if(result.status==='fulfilled') videos.push(...result.value.filter(v=>matchesGame(v,game,index===0)));});
    const partial = results.some(r=>r.status==='rejected');
    const result = {...base,status:videos.length?'ready':partial?'unavailable':'pending',partial,
      fetchedAt:Date.now(),videos:[...new Map(videos.map(v=>[v.id,v])).values()].slice(0,12)};
    if (cache) await cache.put(key,new Response(JSON.stringify(result),{headers:{'cache-control':`public, max-age=${partial?180:videos.length?21600:3600}`}}));
    return result;
  } catch (_) {
    // No scrape fallback, no secret/upstream response in browser or logs.
    const result = {...base,status:'unavailable',fetchedAt:Date.now(),videos:[]};
    if (cache) await cache.put(key,new Response(JSON.stringify(result),{headers:{'cache-control':'public, max-age=180'}}));
    return result;
  }
}

export async function getGameHighlights(gamePk,cache,env={}) {
  if (!inFlight.has(gamePk)) inFlight.set(gamePk,loadHighlights(gamePk,cache,env).finally(()=>inFlight.delete(gamePk)));
  return inFlight.get(gamePk);
}
