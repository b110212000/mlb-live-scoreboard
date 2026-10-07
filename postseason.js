/* MLB Live Scoreboard - postseason.js
   系列賽與季後賽戰況資料整理、渲染與載入。 */

function teamZhName(team){
  const names={
    108:'天使',109:'響尾蛇',110:'金鶯',111:'紅襪',112:'小熊',113:'紅人',114:'守護者',115:'洛磯',
    116:'老虎',117:'太空人',118:'皇家',119:'道奇',120:'國民',121:'大都會',133:'運動家',134:'海盜',
    135:'教士',136:'水手',137:'巨人',138:'紅雀',139:'光芒',140:'遊騎兵',141:'藍鳥',142:'雙城',
    143:'費城人',144:'勇士',145:'白襪',146:'馬林魚',147:'洋基',158:'釀酒人'
  };
  return names[Number(team?.id)]||team?.teamName||team?.name||teamAbbr(team);
}
function currentSeriesName(gd){
  const type=gd?.game?.gameType;
  if(type==='W')return '世界大賽';
  const awayLeague=Number(gd?.teams?.away?.league?.id);
  const homeLeague=Number(gd?.teams?.home?.league?.id);
  const league=awayLeague===104&&homeLeague===104?'國家聯盟':
    awayLeague===103&&homeLeague===103?'美國聯盟':'';
  const round=({F:'外卡系列賽',D:'分區賽',L:'冠軍賽',P:'季後賽'})[type]||seriesName(type);
  return league+round;
}
function seriesGameNumber(n){
  const zh=['一','二','三','四','五','六','七'];
  return '第'+(zh[n-1]||String(n))+'場';
}
function seriesGameDateText(g){
  if(!g?.gameDate)return '';
  const d=new Date(g.gameDate);
  if(Number.isNaN(d.getTime()))return '';
  return new Intl.DateTimeFormat(undefined,{month:'numeric',day:'numeric'}).format(d);
}
function seriesGameClockText(g){
  if(!g?.gameDate)return '';
  const d=new Date(g.gameDate);
  if(Number.isNaN(d.getTime()))return '';
  return new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',hour12:true}).format(d);
}
function seriesGameStatusInfo(g,index,type){
  const abstract=g.status?.abstractGameState||'';
  const detailed=g.status?.detailedState||'';
  const final=abstract==='Final'||/final|game over|completed/i.test(detailed);
  const live=abstract==='Live'||/progress|live|inning/i.test(detailed);
  const need=playoffNeedWins(type);
  const conditional=index+1>need;

  if(final)return {kind:'final',status:'終場',time:'',conditional:false};
  if(live)return {kind:'live',status:'進行中',time:'',conditional:false};
  return {
    kind:'preview',
    status:'',
    time:seriesGameClockText(g)||'時間未定',
    conditional
  };
}
function seriesPairKey(a,b){
  return [Number(a),Number(b)].filter(Number.isFinite).sort((x,y)=>x-y).join('-');
}
function seriesStanding(games,away,home){
  const wins=new Map([[Number(away?.id),0],[Number(home?.id),0]]);
  for(const g of games){
    if(g.status?.abstractGameState!=='Final')continue;
    const aId=Number(g.teams?.away?.team?.id),hId=Number(g.teams?.home?.team?.id);
    const as=Number(g.teams?.away?.score),hs=Number(g.teams?.home?.score);
    if(!Number.isFinite(as)||!Number.isFinite(hs)||as===hs)continue;
    const winner=as>hs?aId:hId;
    wins.set(winner,(wins.get(winner)||0)+1);
  }
  return teamZhName(away)+' '+(wins.get(Number(away?.id))||0)+'–'+(wins.get(Number(home?.id))||0)+' '+teamZhName(home);
}
function seriesGameTime(g){
  if(!g?.gameDate)return '';
  const d=new Date(g.gameDate);
  if(Number.isNaN(d.getTime()))return '';
  return new Intl.DateTimeFormat(undefined,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' · 當地時間';
}
function renderCurrentSeries(gd,games){
  const away=gd?.teams?.away||{},home=gd?.teams?.home||{};
  const type=gd?.game?.gameType||'';
  els.currentSeriesTitle.textContent=currentSeriesName(gd);
  els.currentSeriesSummary.textContent=seriesStanding(games,away,home);
  state.currentSeriesGames=games;

  if(!games.length){
    els.currentSeriesGames.innerHTML='<div class="series-overview-empty">找不到目前系列賽賽程</div>';
    return;
  }

  els.currentSeriesGames.innerHTML=games.map((g,index)=>{
    const aRaw=g.teams?.away?.team||{},hRaw=g.teams?.home?.team||{};
    const a={...aRaw,name:aRaw.name||aRaw.teamName||'對手待定'};
    const h={...hRaw,name:hRaw.name||hRaw.teamName||'對手待定'};
    const aScore=g.teams?.away?.score,hScore=g.teams?.home?.score;
    const info=seriesGameStatusInfo(g,index,type);
    const showScore=info.kind!=='preview'&&aScore!=null&&hScore!=null;
    const label=seriesGameNumber(index+1)+'比賽'+(info.kind==='preview'&&seriesGameDateText(g)?' · '+seriesGameDateText(g):'');
    const center=info.kind==='preview'
      ? '<span class="series-game-time">'+esc(info.time)+'</span>'+(info.conditional?'<span class="series-game-if">如有需要</span>':'')
      : '<span class="series-game-status '+(info.kind==='live'?'live':'')+'">'+esc(info.status)+'</span>';

    return '<button type="button" class="series-game-row '+(g.gamePk===state.selectedGamePk?'current':'')+'" data-series-game-pk="'+g.gamePk+'">'+
      '<span class="series-game-label">'+esc(label)+'</span>'+
      '<span class="series-side away">'+(a.id?'<span class="series-side-logo-shell"><img src="'+esc(teamLogo(a.id))+'" alt=""></span>':'<span class="series-tbd-logo">?</span>')+'<span class="series-side-name">'+esc(a.id?teamZhName(a):'對手待定')+'</span></span>'+
      '<span class="series-game-side-score away '+(showScore?'':'pending')+'">'+(showScore?esc(aScore):'0')+'</span>'+
      '<span class="series-game-center">'+center+'</span>'+
      '<span class="series-game-side-score home '+(showScore?'':'pending')+'">'+(showScore?esc(hScore):'0')+'</span>'+
      '<span class="series-side home">'+(h.id?'<span class="series-side-logo-shell"><img src="'+esc(teamLogo(h.id))+'" alt=""></span>':'<span class="series-tbd-logo">?</span>')+'<span class="series-side-name">'+esc(h.id?teamZhName(h):'對手待定')+'</span></span>'+
    '</button>';
  }).join('');
  if(state.liveDetailTab==='series')requestAnimationFrame(()=>syncLiveDetailHeight());
}
async function loadCurrentSeries(force=false){
  if(state.seriesLoading)return;
  const gamePk=state.selectedGamePk;
  if(!gamePk){
    els.currentSeriesTitle.textContent='系列賽';
    els.currentSeriesSummary.textContent='目前沒有選取比賽';
    els.currentSeriesGames.innerHTML='<div class="series-overview-empty">請先選擇一場季後賽</div>';
    return;
  }

  state.seriesLoading=true;
  try{
    let feed=state.currentFeedGamePk===gamePk?state.currentFeed:null;
    if(!feed){
      feed=await getJSON(API+'/v1.1/game/'+gamePk+'/feed/live');
      state.currentFeed=feed;
      state.currentFeedGamePk=gamePk;
    }
    const gd=feed.gameData||{},away=gd.teams?.away||{},home=gd.teams?.home||{};
    const season=Number(gd.game?.season)||Number(String(els.dateInput.value||'').slice(0,4))||new Date().getFullYear();
    const type=gd.game?.gameType||'';
    const key=[season,type,seriesPairKey(away.id,home.id)].join(':');
    const cached=state.seriesCache.get(key);

    let games;
    if(!force&&cached&&Date.now()-cached.time<60000){
      games=cached.games;
    }else{
      // MLB 有專門依系列賽分組的 postseason endpoint。
      // 直接找出包含目前 gamePk 的官方 series，能保留完整未來賽程，
      // 包含 if necessary 與尚未完全確定對手的場次。
      const data=await getJSON(
        API+'/v1/schedule/postseason/series?season='+season+'&sportId=1'
      );
      const officialSeries=findPostseasonSeriesByGame(data,gamePk);
      if(officialSeries){
        games=(officialSeries.games||[])
          .filter(g=>POSTSEASON.has(g.gameType||officialSeries._gameType))
          .sort((a,b)=>new Date(a.gameDate)-new Date(b.gameDate));
      }else{
        // API 若暫時尚未把目前比賽收進 series，才退回原本的球隊賽程做法。
        const fallback=await getJSON(
          API+'/v1/schedule?sportId=1&teamId='+away.id+
          '&startDate='+season+'-09-20&endDate='+season+'-11-15&hydrate=team,linescore'
        );
        const targetPair=seriesPairKey(away.id,home.id);
        games=(fallback.dates||[]).flatMap(d=>d.games||[])
          .filter(g=>POSTSEASON.has(g.gameType)&&g.gameType===type&&
            seriesPairKey(g.teams?.away?.team?.id,g.teams?.home?.team?.id)===targetPair)
          .sort((a,b)=>new Date(a.gameDate)-new Date(b.gameDate));
      }
      state.seriesCache.set(key,{time:Date.now(),games});
    }
    renderCurrentSeries(gd,games);
  }catch(err){
    els.currentSeriesTitle.textContent='系列賽';
    els.currentSeriesSummary.textContent='系列賽資料讀取失敗';
    els.currentSeriesGames.innerHTML='<div class="series-overview-empty">'+esc(err.message)+'</div>';
  }finally{
    state.seriesLoading=false;
  }
}

function postseasonYear(){
  const raw=els.dateInput.value||localDateString();
  const y=Number(String(raw).slice(0,4));
  return Number.isFinite(y)?y:new Date().getFullYear();
}
function playoffRoundName(type){
  return ({F:'外卡',D:'分區系列賽',L:'聯盟冠軍賽',W:'世界大賽'})[type]||type;
}
function playoffNeedWins(type){
  return type==='F'?2:type==='D'?3:4;
}
function playoffLeague(game){
  const type=game.gameType||game._postseasonSeriesGameType;
  if(type==='W')return 'WS';
  const text=String(game.seriesDescription||'')+' '+String(game.description||'');
  if(/American League|\bAL(?:WC|DS|CS)?\b/i.test(text))return 'AL';
  if(/National League|\bNL(?:WC|DS|CS)?\b/i.test(text))return 'NL';
  return 'OTHER';
}
const MLB_TEAM_ABBR={
  108:'LAA',109:'ARI',110:'BAL',111:'BOS',112:'CHC',113:'CIN',114:'CLE',115:'COL',
  116:'DET',117:'HOU',118:'KC',119:'LAD',120:'WSH',121:'NYM',133:'ATH',134:'PIT',
  135:'SD',136:'SEA',137:'SF',138:'STL',139:'TB',140:'TEX',141:'TOR',142:'MIN',
  143:'PHI',144:'ATL',145:'CWS',146:'MIA',147:'NYY',158:'MIL'
};
const MLB_TEAM_IDS=new Set(Object.keys(MLB_TEAM_ABBR).map(Number));

function scheduleTeam(t){
  const team=t?.team||{};
  const id=Number(team.id);
  const realTeam=MLB_TEAM_IDS.has(id);

  if(!realTeam){
    return {
      id:null,
      name:'待定',
      abbreviation:'TBD',
      placeholder:true
    };
  }

  return {
    id,
    name:team.name||team.teamName||'待定',
    abbreviation:MLB_TEAM_ABBR[id]||team.abbreviation||team.teamCode?.toUpperCase()||'TBD',
    placeholder:false
  };
}
function normalizePostseasonSeries(data){
  return (data?.series||[]).map((s,index)=>{
    const sid=String(s.id??s.seriesId??('series-'+index));
    const gameType=s.gameType||s.games?.[0]?.gameType||'';
    const games=(s.games||[]).map(g=>({
      ...g,
      _postseasonSeriesId:sid,
      _postseasonSeriesSort:Number(s.sortNumber??s.seriesSortNumber??index),
      _postseasonSeriesGameType:gameType
    }));
    return {...s,_id:sid,_gameType:gameType,games};
  });
}
function flattenPostseasonSeries(data){
  return normalizePostseasonSeries(data).flatMap(s=>s.games||[]);
}
function findPostseasonSeriesByGame(data,gamePk){
  const target=Number(gamePk);
  return normalizePostseasonSeries(data).find(s=>(s.games||[]).some(g=>Number(g.gamePk)===target))||null;
}
function seriesKey(game){
  if(game?._postseasonSeriesId){
    return (game.gameType||game._postseasonSeriesGameType||'P')+':'+game._postseasonSeriesId;
  }
  const a=game.teams?.away?.team?.id||('A'+game.gamePk);
  const h=game.teams?.home?.team?.id||('H'+game.gamePk);
  return game.gameType+':'+[String(a),String(h)].sort().join('-');
}
function buildPostseasonSeries(games){
  const groups=new Map();
  for(const g of games){
    const gameType=g.gameType||g._postseasonSeriesGameType;
    if(!['F','D','L','W'].includes(gameType))continue;
    const key=seriesKey({...g,gameType});
    if(!groups.has(key)){
      groups.set(key,{
        key,type:gameType,league:playoffLeague({...g,gameType}),description:g.seriesDescription||playoffRoundName(gameType),
        games:[],firstDate:g.gameDate||'',teams:new Map()
      });
    }
    const s=groups.get(key);
    s.games.push(g);
    if(g.gameDate&&(!s.firstDate||g.gameDate<s.firstDate))s.firstDate=g.gameDate;
    for(const side of ['away','home']){
      const tm=scheduleTeam(g.teams?.[side]);
      if(tm.id||tm.name!=='待定'){
        const tkey=String(tm.id||tm.name);
        if(!s.teams.has(tkey))s.teams.set(tkey,{...tm,wins:0,losses:0});
      }
    }
  }

  const series=[];
  for(const s of groups.values()){
    for(const g of s.games){
      const final=g.status?.abstractGameState==='Final'||/Final|Completed Game Early/i.test(g.status?.detailedState||'');
      if(!final)continue;
      const aw=Number(g.teams?.away?.score),hm=Number(g.teams?.home?.score);
      if(!Number.isFinite(aw)||!Number.isFinite(hm)||aw===hm)continue;
      const winnerSide=aw>hm?'away':'home', loserSide=winnerSide==='away'?'home':'away';
      const w=scheduleTeam(g.teams?.[winnerSide]),l=scheduleTeam(g.teams?.[loserSide]);
      const wk=String(w.id||w.name),lk=String(l.id||l.name);
      if(!s.teams.has(wk))s.teams.set(wk,{...w,wins:0,losses:0});
      if(!s.teams.has(lk))s.teams.set(lk,{...l,wins:0,losses:0});
      s.teams.get(wk).wins++; s.teams.get(lk).losses++;
    }
    const teams=[...s.teams.values()].sort((a,b)=>b.wins-a.wins||a.name.localeCompare(b.name));
    while(teams.length<2)teams.push({id:null,name:'待定',abbreviation:'TBD',wins:0,losses:0});
    s.teamList=teams.slice(0,2);
    s.needWins=playoffNeedWins(s.type);
    s.winner=s.teamList.find(t=>t.wins>=s.needWins)||null;
    s.completedGames=s.games.filter(g=>g.status?.abstractGameState==='Final').length;
    series.push(s);
  }
  return series.sort((a,b)=>String(a.firstDate).localeCompare(String(b.firstDate)));
}
function seriesCardHTML(s){
  if(!s)return '<div class="series-card pending"><div class="series-status">對戰組合待定</div></div>';
  const a=s.teamList[0],b=s.teamList[1];
  const top=a.wins>=b.wins?a:b, bottom=top===a?b:a;
  const rows=[top,bottom].map(t=>{
    const winner=s.winner&&String(s.winner.id||s.winner.name)===String(t.id||t.name);
    return '<div class="series-team '+(winner?'series-winner':'')+'">'+
      (t.id?'<span class="series-logo-shell"><img class="series-logo" src="'+esc(teamLogo(t.id))+'" alt=""></span>':'<span class="series-logo-shell"><span class="series-tbd-mini">?</span></span>')+
      '<span class="series-abbr">'+esc(t.abbreviation||'TBD')+'</span>'+
      '<span class="series-record">'+t.wins+'勝'+t.losses+'敗</span>'+
    '</div>';
  }).join('');
  const nextGame=s.games.find(g=>g.status?.abstractGameState!=='Final')||s.games[0]||null;
  const nextDate=nextGame?.gameDate?seriesGameTime(nextGame):'';
  const hasTbd=s.teamList.some(t=>!t.id||t.name==='待定'||t.abbreviation==='TBD');
  let statusHTML=hasTbd
    ? ('對手待定'+(nextDate?' · '+esc(nextDate):''))
    : '尚未開打';
  if(s.winner){
    const other=s.teamList.find(t=>t!==s.winner);
    statusHTML=esc(s.winner.abbreviation||s.winner.name)+' 晉級 <span class="series-score">'+s.winner.wins+'–'+(other?.wins||0)+'</span>';
  }else if(a.wins===b.wins&&a.wins>0){
    statusHTML='系列賽平手 <span class="series-score">'+a.wins+'–'+b.wins+'</span>';
  }else if(a.wins!==b.wins){
    const lead=a.wins>b.wins?a:b,trail=lead===a?b:a;
    statusHTML=esc(lead.abbreviation||lead.name)+' 系列賽領先 <span class="series-score">'+lead.wins+'–'+trail.wins+'</span>';
  }
  return '<div class="series-card '+(s.winner?'clinched':'')+'">'+rows+'<div class="series-status">'+statusHTML+'</div></div>';
}
function roundColumnHTML(title,list,count){
  const arr=[...list];
  while(arr.length<count)arr.push(null);
  return '<div class="round-column"><div class="round-title">'+esc(title)+'</div><div class="series-stack">'+
    arr.slice(0,count).map(seriesCardHTML).join('')+'</div></div>';
}
function renderLeagueBracket(league,series){
  const wc=series.filter(s=>s.league===league&&s.type==='F');
  const ds=series.filter(s=>s.league===league&&s.type==='D');
  const cs=series.filter(s=>s.league===league&&s.type==='L');
  const name=league==='AL'?'美國聯盟':'國家聯盟';
  const badge=league==='AL'?'AL':'NL';
  const columns=[
    roundColumnHTML('外卡',wc,2),
    roundColumnHTML(league+'DS',ds,2),
    roundColumnHTML(league+'CS',cs,1)
  ];
  return '<section class="league-block '+(league==='NL'?'nl-block':'al-block')+'">'+
    '<div class="league-title"><span class="league-badge">'+badge+'</span>'+name+'</div>'+
    '<div class="league-rounds">'+columns.join('')+'</div></section>';
}
function renderBracket(games,year){
  const series=buildPostseasonSeries(games);
  if(!series.length){
    els.bracketBoard.className='bracket-empty';
    els.bracketBoard.textContent=year+' 年目前沒有可顯示的季後賽系列賽資料';
    return;
  }
  const ws=series.find(s=>s.type==='W')||null;
  els.bracketBoard.className='bracket-board';
  els.bracketBoard.innerHTML=
    renderLeagueBracket('AL',series)+
    '<section class="ws-column"><div class="ws-trophy">🏆</div><div class="ws-title">WORLD SERIES</div>'+seriesCardHTML(ws)+'</section>'+
    renderLeagueBracket('NL',series);
}
async function loadBracket(force=false){
  const year=postseasonYear();
  if(state.bracketLoading)return;
  if(!force&&state.bracketYear===year&&els.bracketBoard.dataset.loaded==='1')return;
  state.bracketLoading=true;
  state.bracketYear=year;
  els.bracketYearText.textContent=year+' POSTSEASON';
  els.bracketStatus.textContent='更新中…';
  els.bracketBoard.className='bracket-empty';
  els.bracketBoard.textContent='載入季後賽戰況中…';
  try{
    const data=await getJSON(API+'/v1/schedule/postseason/series?season='+year+'&sportId=1');
    const games=flattenPostseasonSeries(data).filter(g=>['F','D','L','W'].includes(g.gameType||g._postseasonSeriesGameType));
    renderBracket(games,year);
    els.bracketBoard.dataset.loaded='1';
    els.bracketStatus.textContent='共 '+games.length+' 場季後賽賽程 · '+new Date().toLocaleTimeString('zh-TW',{hour12:false})+' 更新';
  }catch(err){
    els.bracketBoard.className='bracket-empty';
    els.bracketBoard.textContent='季後賽戰況載入失敗：'+err.message;
    els.bracketStatus.textContent='讀取失敗';
  }finally{
    state.bracketLoading=false;
  }
}
