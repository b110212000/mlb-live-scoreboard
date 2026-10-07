/* MLB Live Scoreboard - api.js
   共用設定、DOM/state、HTTP 與基礎資料工具。 */

const API = 'https://statsapi.mlb.com/api';
const POSTSEASON = new Set(['F','D','L','W','P']);
const REFRESH_MS = 5000;
const $ = id => document.getElementById(id);

const els = {
  dateInput:$('dateInput'), refreshBtn:$('refreshBtn'), liveTitleActions:$('liveTitleActions'), gameTabs:$('gameTabs'),
  error:$('errorBox'), liveDot:$('liveDot'), updateText:$('updateText'), liveChip:$('liveChip'),
  series:$('seriesText'), state:$('statePill'), inning:$('inningText'),
  awayLogo:$('awayLogo'), homeLogo:$('homeLogo'), awayName:$('awayName'), homeName:$('homeName'),
  awayRhe:$('awayRhe'), homeRhe:$('homeRhe'), bigScore:$('bigScore'), gameWatchBtn:$('gameWatchBtn'),
  batterPhoto:$('batterPhoto'), pitcherPhoto:$('pitcherPhoto'),
  batterName:$('batterName'), batterMeta:$('batterMeta'), pitcherName:$('pitcherName'), pitcherMeta:$('pitcherMeta'),
  balls:$('balls'), strikes:$('strikes'), outs:$('outs'),
  lastPitchMain:$('lastPitchMain'), lastPitchSub:$('lastPitchSub'),
  pitchEfficiency:$('pitchEfficiency'), pitchEfficiencySub:$('pitchEfficiencySub'),
  latestPlay:$('latestPlay'), pitchSequence:$('pitchSequence'),
  base1:$('base1'), base2:$('base2'), base3:$('base3'), baseSummary:$('baseSummary'),
  pitchDot:$('pitchDot'), pitchData:$('pitchData'), strikeZone:$('strikeZone'),
  inningHead:$('inningHead'), inningBody:$('inningBody'), teamStatsBoard:$('teamStatsBoard'), boxScoreBoard:$('boxScoreBoard'),
  scoringEvents:$('scoringEvents'), recentEvents:$('recentEvents'),
  liveDetailTabs:$('liveDetailTabs'), liveDetailViewport:$('liveDetailViewport'), liveDetailTrack:$('liveDetailTrack'),
  liveDetailStats:$('liveDetailStats'), liveDetailStatus:$('liveDetailStatus'), liveDetailSeries:$('liveDetailSeries'),
  currentSeriesTitle:$('currentSeriesTitle'), currentSeriesSummary:$('currentSeriesSummary'),
  currentSeriesGames:$('currentSeriesGames'),
  gameHighlights:$('gameHighlights'), highlightTicker:$('highlightTicker'),
  highlightCounter:$('highlightCounter'), highlightsToggle:$('highlightsToggle'),
  topControls:$('topControls'), topControlsToggle:$('topControlsToggle'),
  pullRefresh:$('pullRefresh'), pullRefreshText:$('pullRefreshText'),
  featureMenuButton:$('featureMenuButton'), featureMenu:$('featureMenu'),
  appTitle:$('appTitle'), appSubtitle:$('appSubtitle'), liveView:$('liveView'), bracketView:$('bracketView'), rosterView:$('rosterView'), installView:$('installView'), notificationView:$('notificationView'),
  bracketBoard:$('bracketBoard'), bracketStatus:$('bracketStatus'), bracketYearText:$('bracketYearText'),
  heroRosterBtn:$('heroRosterBtn'), rosterBackBtn:$('rosterBackBtn'), rosterBoard:$('rosterBoard'),
  rosterMatchupTitle:$('rosterMatchupTitle'), rosterMeta:$('rosterMeta'),
  installStatus:$('installStatus'), installAppBtn:$('installAppBtn'), installAppHint:$('installAppHint'),
  shareAppBtn:$('shareAppBtn'), copyAppBtn:$('copyAppBtn'), copyAppHint:$('copyAppHint'), installGuide:$('installGuide'),
  notificationStatus:$('notificationStatus'), notificationPermission:$('notificationPermission'), notificationSubscription:$('notificationSubscription'),
  notificationLastTest:$('notificationLastTest'), notificationTestMessage:$('notificationTestMessage'), testNotificationBtn:$('testNotificationBtn')
};

const outDots=[...document.querySelectorAll('[data-out-dot]')];
const state = {games:[],selectedGamePk:null,loading:false,highlights:[],highlightIndex:0,highlightGamePk:null,highlightsExpanded:false,view:'live',topControlsExpanded:true,bracketYear:null,bracketLoading:false,rosterLoading:false,currentFeed:null,currentFeedGamePk:null,rosterCache:new Map(),bullpenCache:new Map(),liveDetailTab:'status',seriesLoading:false,seriesCache:new Map(),currentSeriesGames:[]};
let deferredInstallPrompt=null;

function localDateString(d=new Date()){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function showError(msg){
  els.error.style.display=msg?'block':'none';
  els.error.textContent=msg||'';
}
async function getJSON(url){
  const r=await fetch(url,{cache:'no-store'});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
function teamLogo(id){return id?`https://www.mlbstatic.com/team-logos/${id}.svg`:''}
function headshot(id){
  return id?`https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_90/v1/people/${id}/headshot/67/current`:
    'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#203449"/><circle cx="50" cy="37" r="18" fill="#6d8298"/><path d="M18 95c5-25 20-37 32-37s27 12 32 37" fill="#6d8298"/></svg>');
}
function gameLabel(g){
  const away=g.teams?.away?.team||{};
  const home=g.teams?.home?.team||{};
  const a=teamAbbr(away);
  const h=teamAbbr(home);
  return a+' '+(g.teams?.away?.score??0)+' - '+(g.teams?.home?.score??0)+' '+h;
}
function gameLocalDateTime(g){
  if(!g?.gameDate)return '';
  const d=new Date(g.gameDate);
  if(Number.isNaN(d.getTime()))return '';
  const date=new Intl.DateTimeFormat(undefined,{month:'numeric',day:'numeric'}).format(d);
  const time=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
  return date+' '+time+' · 當地時間';
}

function shiftLocalDateString(dateText,days){
  const parts=String(dateText).split('-').map(Number);
  if(parts.length!==3||parts.some(v=>!Number.isFinite(v)))return dateText;
  const d=new Date(parts[0],parts[1]-1,parts[2]+days,12,0,0);
  return localDateString(d);
}
function gameLocalDateKey(g){
  if(!g?.gameDate)return '';
  const d=new Date(g.gameDate);
  return Number.isNaN(d.getTime())?'':localDateString(d);
}
