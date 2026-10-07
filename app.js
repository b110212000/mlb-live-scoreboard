/* MLB Live Scoreboard - app.js
   MLB API、資料處理、畫面互動與更新邏輯集中於此檔案。 */

(() => {
  const API = 'https://statsapi.mlb.com/api';
  const POSTSEASON = new Set(['F','D','L','W','P']);
  const REFRESH_MS = 5000;
  const $ = id => document.getElementById(id);

  const els = {
    dateInput:$('dateInput'), refreshBtn:$('refreshBtn'), gameTabs:$('gameTabs'),
    error:$('errorBox'), liveDot:$('liveDot'), updateText:$('updateText'), liveChip:$('liveChip'),
    series:$('seriesText'), state:$('statePill'), inning:$('inningText'),
    awayLogo:$('awayLogo'), homeLogo:$('homeLogo'), awayName:$('awayName'), homeName:$('homeName'),
    awayRhe:$('awayRhe'), homeRhe:$('homeRhe'), bigScore:$('bigScore'),
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
    appTitle:$('appTitle'), appSubtitle:$('appSubtitle'), liveView:$('liveView'), bracketView:$('bracketView'), rosterView:$('rosterView'), installView:$('installView'),
    bracketBoard:$('bracketBoard'), bracketStatus:$('bracketStatus'), bracketYearText:$('bracketYearText'),
    heroRosterBtn:$('heroRosterBtn'), rosterBackBtn:$('rosterBackBtn'), rosterBoard:$('rosterBoard'),
    rosterMatchupTitle:$('rosterMatchupTitle'), rosterMeta:$('rosterMeta'),
    installStatus:$('installStatus'), installAppBtn:$('installAppBtn'), installAppHint:$('installAppHint'),
    shareAppBtn:$('shareAppBtn'), copyAppBtn:$('copyAppBtn'), copyAppHint:$('copyAppHint'), installGuide:$('installGuide')
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

  async function loadSchedule(keepSelection=true){
    if(state.loading) return;
    state.loading=true;
    showError('');
    try{
      const date=els.dateInput.value||localDateString();

      // MLB 的 schedule 日期不一定等於使用者所在地的日曆日期。
      // 前後各多抓一天，再依瀏覽器 / iPhone 的當地時區重新歸類。
      const startDate=shiftLocalDateString(date,-1);
      const endDate=shiftLocalDateString(date,1);
      const data=await getJSON(`${API}/v1/schedule?sportId=1&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&hydrate=team,linescore`);
      const all=(data.dates||[]).flatMap(d=>d.games||[]);
      const unique=[...new Map(all.map(g=>[g.gamePk,g])).values()];
      state.games=unique
        .filter(g=>POSTSEASON.has(g.gameType)&&gameLocalDateKey(g)===date)
        .sort((a,b)=>new Date(a.gameDate)-new Date(b.gameDate));

      if(!keepSelection||!state.games.some(g=>g.gamePk===state.selectedGamePk)){
        const live=state.games.find(g=>g.status?.abstractGameState==='Live');
        state.selectedGamePk=(live||state.games[0])?.gamePk??null;
      }
      renderTabs();
      if(state.selectedGamePk) await loadGame(state.selectedGamePk);
      else renderNoGame(date);
    }catch(err){
      showError(`無法取得 MLB 即時資料：${err.message}`);
      markUpdated(false,false);
    }finally{
      state.loading=false;
    }
  }

  function renderTabs(){
    if(!state.games.length){els.gameTabs.innerHTML='';return}
    els.gameTabs.innerHTML=state.games.map(g=>
      '<button type="button" class="game-tab '+(g.gamePk===state.selectedGamePk?'active':'')+'" data-pk="'+g.gamePk+'">'+
        '<span class="game-tab-main">'+esc(gameLabel(g))+'</span>'+
        '<span class="game-tab-time">'+esc(gameLocalDateTime(g))+'</span>'+
      '</button>'
    ).join('');
    els.gameTabs.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',async()=>{
      state.selectedGamePk=Number(btn.dataset.pk);renderTabs();await loadGame(state.selectedGamePk);
    }));
  }

  async function loadGame(gamePk){
    try{
      const feed=await getJSON(`${API}/v1.1/game/${gamePk}/feed/live`);
      if(gamePk!==state.selectedGamePk)return;
      state.currentFeed=feed;
      state.currentFeedGamePk=gamePk;
      renderGame(feed);
      const isLive=feed.gameData?.status?.abstractGameState==='Live';
      markUpdated(true,isLive);
    }catch(err){
      showError(`賽事資料讀取失敗：${err.message}`);
      markUpdated(false,false);
    }
  }


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
  const LIVE_DETAIL_TABS=['stats','status','series'];
  function liveDetailIndex(tab){
    const i=LIVE_DETAIL_TABS.indexOf(tab);
    return i<0?1:i;
  }
  function activeLiveDetailPanel(){
    return [els.liveDetailStats,els.liveDetailStatus,els.liveDetailSeries][liveDetailIndex(state.liveDetailTab)];
  }
  function syncLiveDetailHeight(immediate=false){
    const panel=activeLiveDetailPanel();
    if(!panel||!els.liveDetailViewport)return;
    const h=Math.max(1,panel.scrollHeight);
    if(immediate){
      const old=els.liveDetailViewport.style.transition;
      els.liveDetailViewport.style.transition='none';
      els.liveDetailViewport.style.height=h+'px';
      void els.liveDetailViewport.offsetHeight;
      els.liveDetailViewport.style.transition=old;
    }else{
      els.liveDetailViewport.style.height=h+'px';
    }
  }
  function positionLiveDetailTrack(tab,animate=true){
    const index=liveDetailIndex(tab);
    els.liveDetailTrack.classList.toggle('dragging',!animate);
    els.liveDetailTrack.style.transform='translate3d('+(-index*100)+'%,0,0)';
  }
  function setLiveDetailTab(tab,options={}){
    if(!LIVE_DETAIL_TABS.includes(tab))tab='status';
    const animate=options.animate!==false;
    state.liveDetailTab=tab;
    els.liveDetailTabs.querySelectorAll('[data-live-tab]').forEach(btn=>{
      const active=btn.dataset.liveTab===tab;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-selected',String(active));
    });
    [els.liveDetailStats,els.liveDetailStatus,els.liveDetailSeries].forEach((panel,index)=>{
      const active=index===liveDetailIndex(tab);
      panel.classList.toggle('active',active);
      panel.setAttribute('aria-hidden',String(!active));
    });
    positionLiveDetailTrack(tab,animate);
    requestAnimationFrame(()=>syncLiveDetailHeight(!animate));
    if(tab==='series')loadCurrentSeries();
  }

  function initLiveDetailSwipe(){
    const viewport=els.liveDetailViewport,track=els.liveDetailTrack;
    let startX=0,startY=0,lastX=0,startTime=0,dragging=false,horizontal=false;
    const blockedTarget=t=>!!t.closest('.boxscore-scroll, .scroll, input, select, textarea');

    viewport.addEventListener('touchstart',e=>{
      if(e.touches.length!==1||blockedTarget(e.target))return;
      const t=e.touches[0];
      startX=lastX=t.clientX;startY=t.clientY;startTime=performance.now();
      dragging=true;horizontal=false;
    },{passive:true});

    viewport.addEventListener('touchmove',e=>{
      if(!dragging||e.touches.length!==1)return;
      const t=e.touches[0],dx=t.clientX-startX,dy=t.clientY-startY;
      lastX=t.clientX;
      if(!horizontal){
        if(Math.abs(dx)<7&&Math.abs(dy)<7)return;
        if(Math.abs(dy)>=Math.abs(dx)){dragging=false;return;}
        horizontal=true;
        track.classList.add('dragging');
      }
      e.preventDefault();
      const width=Math.max(1,viewport.clientWidth);
      const index=liveDetailIndex(state.liveDetailTab);
      let offset=dx;
      if((index===0&&dx>0)||(index===LIVE_DETAIL_TABS.length-1&&dx<0))offset*=0.28;
      track.style.transform='translate3d('+(-index*width+offset)+'px,0,0)';
    },{passive:false});

    const finish=()=>{
      if(!dragging&&!horizontal)return;
      const dx=lastX-startX;
      const dt=Math.max(1,performance.now()-startTime);
      const velocity=dx/dt;
      const width=Math.max(1,viewport.clientWidth);
      let index=liveDetailIndex(state.liveDetailTab);
      if(horizontal&&(Math.abs(dx)>Math.min(90,width*.20)||Math.abs(velocity)>.55)){
        if(dx<0)index=Math.min(LIVE_DETAIL_TABS.length-1,index+1);
        else index=Math.max(0,index-1);
      }
      dragging=false;horizontal=false;
      track.classList.remove('dragging');
      setLiveDetailTab(LIVE_DETAIL_TABS[index],{animate:true});
    };

    viewport.addEventListener('touchend',finish,{passive:true});
    viewport.addEventListener('touchcancel',finish,{passive:true});

    if('ResizeObserver' in window){
      const ro=new ResizeObserver(()=>syncLiveDetailHeight());
      [els.liveDetailStats,els.liveDetailStatus,els.liveDetailSeries].forEach(p=>ro.observe(p));
    }else{
      window.addEventListener('resize',()=>syncLiveDetailHeight(true));
    }
    window.addEventListener('resize',()=>{
      positionLiveDetailTrack(state.liveDetailTab,false);
      syncLiveDetailHeight(true);
    });
  }
  async function openSeriesGame(gamePk){
    if(state.loading){
      setTimeout(()=>openSeriesGame(gamePk),150);
      return;
    }
    const game=state.currentSeriesGames.find(g=>Number(g.gamePk)===Number(gamePk));
    if(!game)return;
    const date=gameLocalDateKey(game);
    if(date)els.dateInput.value=date;
    state.selectedGamePk=Number(gamePk);
    await loadSchedule(true);
    setLiveDetailTab('status');
    requestAnimationFrame(()=>document.querySelector('.hero')?.scrollIntoView({behavior:'smooth',block:'start'}));
  }

  function markUpdated(ok,isLive){
    els.liveDot.classList.toggle('off',!ok);
    els.liveDot.classList.toggle('live',!!(ok&&isLive));
    const time=new Date().toLocaleTimeString('zh-TW',{hour12:false});
    els.updateText.textContent=ok?(isLive?'LIVE':'已更新'):'更新失敗';
    els.liveChip.dataset.tooltip=ok?('最後更新 '+time):('更新失敗 · '+time);
  }

  function renderNoGame(date){
    els.series.textContent=`${date} 沒有 MLB 季後賽賽事`;
    els.state.textContent='NO GAME';els.inning.textContent='--';
    els.bigScore.innerHTML='<span>0</span><span>0</span>';
    els.awayName.textContent='客隊';els.homeName.textContent='主隊';
    els.awayLogo.removeAttribute('src');els.homeLogo.removeAttribute('src');
    resetMatchup();
    els.inningHead.innerHTML='';els.inningBody.innerHTML='';
    els.teamStatsBoard.className='team-stats-empty';els.teamStatsBoard.textContent='目前沒有隊伍統計資料';
    els.boxScoreBoard.className='boxscore-empty';els.boxScoreBoard.textContent='目前沒有 Box Score 資料';
    els.scoringEvents.className='empty';els.scoringEvents.textContent='尚無得分紀錄';
    els.recentEvents.className='empty';els.recentEvents.textContent='尚無打席紀錄';
    state.currentSeriesGames=[];
    els.currentSeriesTitle.textContent='系列賽';
    els.currentSeriesSummary.textContent='目前沒有選取比賽';
    els.currentSeriesGames.innerHTML='<div class="series-overview-empty">目前沒有系列賽資料</div>';
    state.highlights=[];state.highlightIndex=0;state.highlightGamePk=null;state.highlightsExpanded=false;
    syncHighlights();
    setBases(null,null,null);renderPitchLocation(null);markUpdated(true,false);
  }

  function resetMatchup(){
    els.batterName.textContent='--';els.pitcherName.textContent='--';
    els.batterPhoto.src=headshot(null);els.pitcherPhoto.src=headshot(null);
    els.batterMeta.textContent='請切換其他日期';els.pitcherMeta.textContent='總用球 -- · 本打席 -- 球';
    els.lastPitchMain.textContent='--';els.lastPitchSub.textContent='等待投球資料';
    els.pitchEfficiency.textContent='--';els.pitchEfficiencySub.textContent='好球數 / 用球數';
    els.latestPlay.textContent='尚無最新打席資訊';els.pitchSequence.innerHTML='';
    els.balls.textContent='0';els.strikes.textContent='0';setOuts(0);
  }

  function renderGame(feed){
    const gd=feed.gameData||{}, live=feed.liveData||{}, ls=live.linescore||{}, plays=live.plays||{}, cp=plays.currentPlay||{};
    const away=gd.teams?.away||{}, home=gd.teams?.home||{}, awayLine=ls.teams?.away||{}, homeLine=ls.teams?.home||{}, status=gd.status||{};

    els.series.textContent=findSeriesDescription()||seriesName(gd.game?.gameType);
    els.state.textContent=status.detailedState||status.abstractGameState||'--';
    els.inning.textContent=inningLabel(ls);
    els.awayName.textContent=away.name||'客隊';els.homeName.textContent=home.name||'主隊';
    els.awayLogo.src=teamLogo(away.id);els.homeLogo.src=teamLogo(home.id);
    els.awayLogo.dataset.teamId=String(away.id||'');els.homeLogo.dataset.teamId=String(home.id||'');
    els.awayLogo.alt=away.name||'客隊';els.homeLogo.alt=home.name||'主隊';

    const ar=awayLine.runs??0, hr=homeLine.runs??0;
    els.bigScore.innerHTML=`<span>${ar}</span><span>${hr}</span>`;
    els.awayRhe.textContent=`R ${ar} · H ${awayLine.hits??0} · E ${awayLine.errors??0}`;
    els.homeRhe.textContent=`R ${hr} · H ${homeLine.hits??0} · E ${homeLine.errors??0}`;

    const batter=ls.offense?.batter||cp.matchup?.batter, pitcher=ls.defense?.pitcher||cp.matchup?.pitcher;
    els.batterName.textContent=batter?.fullName||'--';els.pitcherName.textContent=pitcher?.fullName||'--';
    els.batterPhoto.src=headshot(batter?.id);els.pitcherPhoto.src=headshot(pitcher?.id);
    els.batterPhoto.alt=batter?.fullName||'打者';els.pitcherPhoto.alt=pitcher?.fullName||'投手';

    const batterSide=cp.matchup?.batSide?.description||cp.matchup?.batSide?.code||'';
    els.batterMeta.textContent=batter?`${batterSide?batterSide+'打 · ':''}${zhEventName(cp.result?.event)||'目前打席進行中'}`:'目前沒有打者資料';

    const pStats=getPitcherStats(live.boxscore,pitcher?.id);
    const currentPitches=(cp.playEvents||[]).filter(e=>e.isPitch||e.type==='pitch');
    const hand=cp.matchup?.pitchHand?.description||cp.matchup?.pitchHand?.code||'';
    els.pitcherMeta.textContent=`${hand?hand+'投 · ':''}總用球 ${pStats.pitches??'--'} · 本打席 ${currentPitches.length} 球`;

    els.balls.textContent=ls.balls??cp.count?.balls??0;
    els.strikes.textContent=ls.strikes??cp.count?.strikes??0;
    setOuts(ls.outs??cp.count?.outs??0);

    setBases(ls.offense?.first,ls.offense?.second,ls.offense?.third);
    els.latestPlay.textContent=zhDescription(cp.result?.description)||zhPitchResult(latestEventDescription(cp))||'目前沒有打席說明';

    const lastPitch=[...currentPitches].reverse().find(e=>e.pitchData||e.details);
    renderLastPitch(lastPitch);
    renderPitchSequence(currentPitches);
    renderPitchLocation(lastPitch);

    if(pStats.pitches){
      const strikes=pStats.strikes??null;
      const pct=strikes!=null?Math.round(strikes/pStats.pitches*100):null;
      els.pitchEfficiency.textContent=pct!=null?`${pct}% 好球`:`${pStats.pitches} 球`;
      els.pitchEfficiencySub.textContent=strikes!=null?`${strikes} 好球 / ${pStats.pitches} 用球`:'投手累計用球';
    }else{
      els.pitchEfficiency.textContent='--';els.pitchEfficiencySub.textContent='好球數 / 用球數';
    }

    renderHighlights(feed);
    renderLineScore(ls,away,home);renderBoxScore(feed);renderScoringPlays(plays);renderRecentPlays(plays);
    if(state.liveDetailTab==='series')loadCurrentSeries();
    if(state.liveDetailTab==='status')requestAnimationFrame(()=>syncLiveDetailHeight());
  }

  function findSeriesDescription(){
    return state.games.find(g=>g.gamePk===state.selectedGamePk)?.seriesDescription||'';
  }
  function seriesName(type){
    return ({F:'外卡系列賽',D:'分區系列賽',L:'聯盟冠軍系列賽',W:'世界大賽',P:'季後賽'})[type]||'MLB 季後賽';
  }
  function inningLabel(ls){
    if(!ls.currentInning) return ls.inningState||'--';
    const st=String(ls.inningState||'').toLowerCase();
    const half=ls.isTopInning===true||st.includes('top')?'上':ls.isTopInning===false||st.includes('bottom')?'下':'';
    return `${ls.currentInning} 局${half}`;
  }
  function setBases(r1,r2,r3){
    [[els.base1,r1],[els.base2,r2],[els.base3,r3]].forEach(([el,r])=>el.classList.toggle('on',!!r));
    els.baseSummary.innerHTML=
      '<div><span>一壘</span><strong>'+esc(r1?.fullName||'--')+'</strong></div>'+
      '<div><span>二壘</span><strong>'+esc(r2?.fullName||'--')+'</strong></div>'+
      '<div><span>三壘</span><strong>'+esc(r3?.fullName||'--')+'</strong></div>';
  }
  function setOuts(value){
    const outs=Math.max(0,Math.min(3,Number(value)||0));
    els.outs.textContent=String(outs);
    outDots.forEach((dot,index)=>dot.classList.toggle('on',index<outs));
    document.querySelector('.outs-dots')?.setAttribute('aria-label',outs+' 出局');
  }
  function getPitcherStats(boxscore,pitcherId){
    if(!boxscore||!pitcherId) return {};
    const key=`ID${pitcherId}`;
    const p=boxscore.teams?.home?.players?.[key]||boxscore.teams?.away?.players?.[key];
    const s=p?.stats?.pitching||{};
    return {pitches:s.numberOfPitches??s.pitchesThrown??null,strikes:s.strikes??null};
  }

  function zhEventName(s){
    const m={
      'Single':'一壘安打','Double':'二壘安打','Triple':'三壘安打','Home Run':'全壘打',
      'Strikeout':'三振','Walk':'四壞保送','Intent Walk':'故意四壞保送','Hit By Pitch':'觸身球',
      'Flyout':'飛球出局','Lineout':'平飛球出局','Groundout':'滾地球出局','Pop Out':'內野高飛球出局',
      'Forceout':'封殺出局','Field Error':'守備失誤','Fielders Choice':'野手選擇',
      'Fielders Choice Out':'野手選擇出局','Double Play':'雙殺','Triple Play':'三殺',
      'Sac Fly':'高飛犧牲打','Sac Bunt':'犧牲觸擊','Bunt Groundout':'觸擊滾地球出局',
      'Bunt Pop Out':'觸擊高飛球出局','Catcher Interference':'捕手妨礙',
      'Runner Out':'跑者出局','Stolen Base':'盜壘成功','Caught Stealing':'盜壘失敗',
      'Pickoff':'牽制出局','Wild Pitch':'暴投','Passed Ball':'捕逸','Balk':'投手犯規',
      'Game Advisory':'比賽資訊','Pitching Substitution':'更換投手','Offensive Substitution':'進攻換人',
      'Defensive Substitution':'守備換人','Defensive Switch':'守備位置調整'
    };
    return m[s] || s || '';
  }

  function zhPitchType(s){
    const m={
      '4-Seam Fastball':'四縫線速球','Four-Seam Fastball':'四縫線速球','Sinker':'伸卡球',
      'Slider':'滑球','Sweeper':'橫掃滑球','Changeup':'變速球','Curveball':'曲球',
      'Knuckle Curve':'指關節曲球','Cutter':'卡特球','Split-Finger':'指叉球',
      'Splitter':'指叉球','Knuckleball':'蝴蝶球','Forkball':'叉指球',
      'Eephus':'小便球','Slurve':'滑曲球','Screwball':'螺旋球'
    };
    return m[s] || s || '';
  }

  function zhPitchResult(s){
    const m={
      'Ball':'壞球','Called Strike':'主審判好球','Swinging Strike':'揮棒落空',
      'Swinging Strike (Blocked)':'揮棒落空（捕手擋球）','Foul':'界外球',
      'Foul Tip':'擦棒被捕','In play, no out':'擊球進場，無出局',
      'In play, out(s)':'擊球進場，造成出局','In play, run(s)':'擊球進場，帶有打點',
      'Hit By Pitch':'觸身球','Intent Ball':'故意壞球','Pitchout':'投球出框',
      'Blocked Ball':'捕手擋球','Foul Bunt':'觸擊界外','Missed Bunt':'觸擊落空'
    };
    return m[s] || s || '';
  }

  function zhDescription(text){
    if(!text) return '';
    let t=String(text);

    const phrases=[
      ['homers','擊出全壘打'],
      ['singles','擊出一壘安打'],
      ['doubles','擊出二壘安打'],
      ['triples','擊出三壘安打'],
      ['strikes out swinging','揮棒落空遭到三振'],
      ['strikes out looking','站著遭到三振'],
      ['strikes out','遭到三振'],
      ['walks','獲得四壞保送'],
      ['intentionally walks','獲得故意四壞保送'],
      ['hit by pitch','遭觸身球保送'],
      ['flies out','擊出飛球出局'],
      ['flys out','擊出飛球出局'],
      ['lines out','擊出平飛球出局'],
      ['grounds out','擊出滾地球出局'],
      ['pops out','擊出內野高飛球出局'],
      ['reaches on a fielding error','因守備失誤上壘'],
      ['reaches on a throwing error','因傳球失誤上壘'],
      ['out at first','在一壘前出局'],
      ['scores','跑回本壘得分'],
      ['advances to 2nd','推進至二壘'],
      ['advances to 3rd','推進至三壘'],
      ['advances to 1st','推進至一壘'],
      ['to 2nd','至二壘'],
      ['to 3rd','至三壘'],
      ['to 1st','至一壘']
    ];
    for(const [en,zh] of phrases){
      t=t.replace(new RegExp(en,'ig'),zh);
    }

    t=t.replace(/\bRBI\b/g,'打點');
    t=t.replace(/\bRBIs\b/g,'打點');
    t=t.replace(/\bground ball\b/ig,'滾地球');
    t=t.replace(/\bfly ball\b/ig,'飛球');
    t=t.replace(/\bline drive\b/ig,'平飛球');
    t=t.replace(/\bsharp line drive\b/ig,'強勁平飛球');
    t=t.replace(/\bsoft ground ball\b/ig,'軟弱滾地球');
    t=t.replace(/\bfielding error\b/ig,'守備失誤');
    t=t.replace(/\bthrowing error\b/ig,'傳球失誤');
    return t;
  }

  function latestEventDescription(play){
    const e=(play?.playEvents||[]).at(-1);
    return e?.details?.description||e?.details?.call?.description||'';
  }

  function pitchResultClass(e){
    const code=e?.details?.code||'';
    const desc=(e?.details?.description||e?.details?.call?.description||'').toLowerCase();
    if(e?.details?.isInPlay) return 'hit';
    if(desc.includes('foul')) return 'foul';
    if(e?.details?.isStrike||['S','C','W','T','M','Q'].includes(code)) return 'strike';
    if(e?.details?.isBall||['B','*B','P','I','H'].includes(code)) return 'ball';
    return '';
  }
  function pitchLetter(e){
    const c=pitchResultClass(e);
    return c==='ball'?'B':c==='strike'?'S':c==='foul'?'F':c==='hit'?'X':'•';
  }
  function renderPitchSequence(pitches){
    if(!pitches.length){els.pitchSequence.innerHTML='<span class="subtitle">尚無投球</span>';return}
    els.pitchSequence.innerHTML=pitches.map((e,i)=>`<span class="pitch-chip ${pitchResultClass(e)}" title="${esc(e.details?.description||e.details?.call?.description||'')}">${pitchLetter(e)}</span>`).join('');
  }
  function renderLastPitch(p){
    if(!p){els.lastPitchMain.textContent='--';els.lastPitchSub.textContent='等待投球資料';return}
    const type=zhPitchType(p.details?.type?.description||p.details?.type?.code||'投球');
    const speed=p.pitchData?.startSpeed;
    const result=zhPitchResult(p.details?.description||p.details?.call?.description||'');
    els.lastPitchMain.textContent=`${speed?Math.round(speed)+' mph · ':''}${type}`;
    els.lastPitchSub.textContent=result||'--';
  }
  function renderPitchLocation(p){
    const pd=p?.pitchData||{};
    const x=pd.coordinates?.pX, z=pd.coordinates?.pZ;

    // 整個 zone-wrap 是投球座標畫布，不是好球帶。
    // pX / pZ 映射到完整畫布；內層 strikeZone 才代表實際好球帶。
    const W=118,H=160;
    const X_MIN=-2,X_MAX=2,Z_MIN=0,Z_MAX=5;
    const mapX=v=>clamp((v-X_MIN)/(X_MAX-X_MIN),0,1)*W;
    const mapY=v=>(1-clamp((v-Z_MIN)/(Z_MAX-Z_MIN),0,1))*H;

    // 好球帶框本身使用本壘板 17 吋寬度：左右各約 0.708 ft。
    // 球本身用圓點大小呈現是否壓線，不把球半徑灌進框的寬度。
    // 垂直優先使用 MLB 每一球依打者提供的 strikeZoneBottom / strikeZoneTop。
    const halfPlateFt=(17/12)/2;
    const zoneLeft=mapX(-halfPlateFt);
    const zoneRight=mapX(halfPlateFt);
    const szBottom=typeof pd.strikeZoneBottom==='number'?pd.strikeZoneBottom:1.5;
    const szTop=typeof pd.strikeZoneTop==='number'?pd.strikeZoneTop:3.5;
    const zoneTop=mapY(szTop);
    const zoneBottom=mapY(szBottom);

    els.strikeZone.style.left=zoneLeft+'px';
    els.strikeZone.style.top=zoneTop+'px';
    els.strikeZone.style.width=Math.max(1,zoneRight-zoneLeft)+'px';
    els.strikeZone.style.height=Math.max(1,zoneBottom-zoneTop)+'px';

    if(typeof x!=='number'||typeof z!=='number'){
      els.pitchDot.style.display='none';
      els.pitchData.textContent='目前沒有可顯示的投球座標。';
      return;
    }

    const left=mapX(x);
    const top=mapY(z);
    els.pitchDot.style.left=left+'px';
    els.pitchDot.style.top=top+'px';
    els.pitchDot.style.display='block';
    els.pitchDot.classList.toggle('ball',pitchResultClass(p)==='ball');

    const type=zhPitchType(p.details?.type?.description||'--');
    const speed=pd.startSpeed!=null?Math.round(pd.startSpeed)+' mph':'--';
    const spin=pd.breaks?.spinRate!=null?Math.round(pd.breaks.spinRate)+' rpm':'--';
    const result=zhPitchResult(p.details?.description||p.details?.call?.description||'--');
    els.pitchData.innerHTML='球種：<strong>'+esc(type)+'</strong><br>球速：<strong>'+esc(speed)+'</strong><br>轉速：<strong>'+esc(spin)+'</strong><br>結果：<strong>'+esc(result)+'</strong>';
  }

  // 統計已完成打席、逐球記錄與官方逐局資料，產生全部符合條件的本場焦點。
  function buildHighlightItems(feed){
    const gd=feed.gameData||{},live=feed.liveData||{},plays=live.plays||{};
    const all=plays.allPlays||[];
    const awayName=gd.teams?.away?.name||'客隊';
    const homeName=gd.teams?.home?.name||'主隊';
    const batters=new Map(),pitchers=new Map(),errors={away:[],home:[]};
    const items=[],seen=new Set(),scoreChanges=[];
    let prevAway=0,prevHome=0,seq=0;
    const halfName=h=>h==='top'?'上':h==='bottom'?'下':'';
    const when=p=>String(p.about?.inning??'-')+'局'+halfName(p.about?.halfInning);
    const add=(id,priority,icon,title,desc,meta,tone,order,inningSort=null)=>{
      if(seen.has(id))return;
      seen.add(id);
      items.push({id,priority,icon,title,desc,meta:meta||'',tone:tone||'',order:order??seq,inningSort:Number.isFinite(Number(inningSort))?Number(inningSort):null});
    };
    const bFor=p=>{
      const id=p.matchup?.batter?.id, name=p.matchup?.batter?.fullName;
      if(!id&&!name)return null;
      const key=String(id||name);
      if(!batters.has(key))batters.set(key,{key,name:name||'打者',hits:0,hr:0,rbi:0,single:0,double:0,triple:0,walks:0});
      return batters.get(key);
    };
    const pFor=p=>{
      const id=p.matchup?.pitcher?.id,name=p.matchup?.pitcher?.fullName;
      if(!id&&!name)return null;
      const key=String(id||name);
      if(!pitchers.has(key))pitchers.set(key,{key,name:name||'投手',hrAllowed:0,strikeouts:0});
      return pitchers.get(key);
    };

    for(const p of all){
      const event=p.result?.event||'',etype=p.result?.eventType||'';
      if(!event&&!etype)continue;
      const n=seq++,b=bFor(p),pitcher=pFor(p);
      const id=String(p.atBatIndex??n);
      const inning=when(p),rbi=Math.max(0,Number(p.result?.rbi)||0);
      const batterName=b?.name||'打者';
      const pitcherName=pitcher?.name||'投手';
      const nameForScore=p.about?.halfInning==='top'?awayName:homeName;
      const isHR=event==='Home Run'||etype==='home_run';
      const hitKind=({Single:'single',Double:'double',Triple:'triple','Home Run':'hr'})[event];
      if(b){
        if(hitKind){
          b.hits++;
          b[hitKind]++;
        }
        if(event==='Walk'||event==='Intent Walk')b.walks++;
        b.rbi+=rbi;
      }
      if(isHR){
        if(b&&!hitKind){b.hits++;b.hr++;}
        if(pitcher)pitcher.hrAllowed++;
        const hrType=rbi===4?'滿貫砲':rbi===3?'三分砲':rbi===2?'兩分砲':rbi===1?'陽春砲':'全壘打';
        const hitEvent=(p.playEvents||[]).findLast?.(x=>x.hitData)||
          [...(p.playEvents||[])].reverse().find(x=>x.hitData);
        const dist=hitEvent?.hitData?.totalDistance;
        const speed=hitEvent?.hitData?.launchSpeed;
        const extra=[];
        if(Number.isFinite(Number(dist))&&Number(dist)>0)extra.push(Math.round(Number(dist))+' 呎');
        if(Number.isFinite(Number(speed))&&Number(speed)>0)extra.push(Number(speed).toFixed(1)+' mph');
        add('hr:'+id,84,'💣',batterName+' '+hrType,
          batterName+' 從 '+pitcherName+' 手中擊出'+hrType+'。'+(extra.length?'擊球資訊：'+extra.join('、')+'。':''),
          inning,'hot',n,p.about?.inning);
      }
      if(pitcher&&(event==='Strikeout'||etype.startsWith('strikeout')))pitcher.strikeouts++;
      const isError=event==='Field Error'||etype==='field_error'||/\b(fielding|throwing) error\b/i.test(p.result?.description||'');
      if(isError){
        const defending=p.about?.halfInning==='top'?'home':'away';
        errors[defending].push({id,inning,n});
        const team=defending==='home'?homeName:awayName;
        add('error:'+id,79,'⚠️',team+' 發生守備失誤',
          inning+'，'+team+' 出現守備失誤，讓攻方有機會延續進攻。',inning,'warn',n,p.about?.inning);
      }
      if(rbi>=2&&!isHR){
        add('multiRbi:'+id,69,'⚡',batterName+' 單次貢獻 '+rbi+' 打點',
          batterName+' 在'+inning+'的一次攻勢中送回 '+rbi+' 分。',inning,'good',n,p.about?.inning);
      }
      const isDP=/double.play|grounded.into.dp/i.test(event+' '+etype);
      if(isDP){
        const fielding=p.about?.halfInning==='top'?homeName:awayName;
        add('dp:'+id,53,'🧤',fielding+' 策動雙殺',
          inning+'，'+fielding+'完成雙殺守備，迅速拿下兩個出局數。',inning,'good',n,p.about?.inning);
      }

      // 盜壘資訊多半位於跑者紀錄，不能只靠打席 event。
      const steals=new Set();
      for(const runner of p.runners||[]){
        const details=runner.details||{};
        const action=details.event||'';
        if(/stolen.base/i.test(action)){
          const name=details.runner?.fullName||'跑者';
          const target=runner.movement?.end||'';
          steals.add(name+'|'+target);
        }
      }
      if(/stolen.base/i.test(event+' '+etype)&&!steals.size){
        steals.add(batterName+'|');
      }
      for(const steal of steals){
        const parts=steal.split('|');
        add('steal:'+id+':'+steal,59,'🏃',parts[0]+' 盜壘成功',
          inning+'，'+parts[0]+'完成盜壘'+(parts[1]?'，抵達'+({ '2B':'二壘','3B':'三壘',score:'本壘'}[parts[1]]||parts[1]):'')+'。',inning,'good',n,p.about?.inning);
      }

      const awRaw=Number(p.result?.awayScore),hmRaw=Number(p.result?.homeScore);
      const aw=Number.isFinite(awRaw)?awRaw:prevAway;
      const hm=Number.isFinite(hmRaw)?hmRaw:prevHome;
      if(aw!==prevAway||hm!==prevHome){
        const before=Math.sign(prevAway-prevHome),after=Math.sign(aw-hm);
        scoreChanges.push({aw,hm,prevAway,prevHome,inning:p.about?.inning,half:p.about?.halfInning,id,n});
        if(before!==0&&after===0){
          add('tie:'+id,96,'⚖️',nameForScore+' 追平比賽',
            inning+'，'+nameForScore+'將比分追成 '+aw+'：'+hm+'。',inning,'hot',n,p.about?.inning);
        }else if(before!==after&&after!==0){
          const leader=after>0?awayName:homeName;
          const reversed=before!==0&&before!==after;
          add('lead:'+id,reversed?100:80,reversed?'🔄':'⬆️',leader+(reversed?' 逆轉超前':' 取得領先'),
            inning+'，'+leader+(reversed?'完成逆轉':'取得領先')+'，比分 '+aw+'：'+hm+'。',inning,reversed?'hot':'good',n,p.about?.inning);
        }
        if(!isHR&&rbi<2){
          const eventZh=zhEventName(event)||'得分攻勢';
          add('score:'+id,61,'🏟️',nameForScore+' 再添分數',
            inning+'，'+(b?.name?b.name+' '+eventZh+'，':'')+'比分來到 '+aw+'：'+hm+'。',inning,'',n,p.about?.inning);
        }
      }
      prevAway=aw;prevHome=hm;
    }

    for(const b of batters.values()){
      if(b.hr>=2){
        const word=b.hr===2?'雙響砲':b.hr===3?'三響砲':b.hr+'響砲';
        add('hitterMultiHR:'+b.key,105,'🔥',b.name+' '+word,
          b.name+' 本場已敲出 '+b.hr+' 支全壘打，累計 '+b.rbi+' 分打點。','多轟里程碑','hot');
      }
      if(b.single&&b.double&&b.triple&&b.hr){
        add('cycle:'+b.key,115,'🏆',b.name+' 完成完全打擊',
          b.name+' 本場集齊一壘安打、二壘安打、三壘安打與全壘打。','完全打擊','hot');
      }
      if(b.hits>=3){
        add('hitMilestone:'+b.key,b.hits>=4?93:76,'🎯',b.name+' 單場 '+b.hits+' 安',
          b.name+' 今天已敲出 '+b.hits+' 支安打'+(b.hr?'，其中包含 '+b.hr+' 支全壘打':'')+'。','打擊表現','good');
      }
      if(b.rbi>=3){
        add('rbiMilestone:'+b.key,b.rbi>=5?98:85,'⚡',b.name+' 單場 '+b.rbi+' 打點',
          b.name+' 本場累計貢獻 '+b.rbi+' 分打點。','打點表現','good');
      }
    }
    for(const p of pitchers.values()){
      if(p.hrAllowed>=2){
        add('pitcherHR:'+p.key,p.hrAllowed>=3?94:82,'📉',p.name+' 挨了 '+p.hrAllowed+' 轟',
          p.name+' 本場已被對手擊出 '+p.hrAllowed+' 支全壘打。','投手挨轟','warn');
      }
      if(p.strikeouts>=5){
        add('pitcherK:'+p.key,p.strikeouts>=10?99:p.strikeouts>=8?88:68,'⚾',
          p.name+' 累計 '+p.strikeouts+' 次三振',
          p.name+' 本場已送出 '+p.strikeouts+' 次三振。','投手壓制力','good');
      }
    }

    // 官方逐局統計適合找出單局大量得分的情況。
    for(const inn of live.linescore?.innings||[]){
      for(const side of ['away','home']){
        const runs=Number(inn?.[side]?.runs);
        if(Number.isFinite(runs)&&runs>=3){
          const name=side==='away'?awayName:homeName;
          add('bigInning:'+side+':'+inn.num,91,'🚨',name+' 單局攻下 '+runs+' 分',
            String(inn.num)+'局'+(side==='away'?'上':'下')+'，'+name+'單局灌進 '+runs+' 分。','單局攻勢','hot',seq,inn.num);
        }
      }
    }
    for(const side of ['away','home']){
      const official=Number(live.linescore?.teams?.[side]?.errors);
      const count=Number.isFinite(official)?official:errors[side].length;
      if(count>=2){
        const team=side==='away'?awayName:homeName;
        add('errorTotal:'+side,89,'⚠️',team+' 累計 '+count+' 次失誤',
          team+' 本場已有 '+count+' 次守備失誤。','守備狀態','warn');
      }
    }
    // 最後半局的致勝分：僅在 MLB 標示比賽結束時判斷。
    const isFinal=gd.status?.abstractGameState==='Final';
    const last=scoreChanges.at(-1);
    if(isFinal&&last&&last.half==='bottom'&&Number(last.inning)>=9&&
       last.hm>last.aw&&last.prevHome<=last.prevAway){
      add('walkoff',110,'🎉',homeName+' 再見勝利',
        String(last.inning)+'局下，'+homeName+'攻下致勝分，以 '+last.hm+'：'+last.aw+' 結束比賽。','再見時刻','hot',last.n,last.inning);
    }
    return items.sort((a,b)=>{
      const aNoInning=a.inningSort==null, bNoInning=b.inningSort==null;
      // 1) 多轟里程碑、守備狀態等「整場型焦點」固定置頂
      if(aNoInning!==bNoInning)return aNoInning?-1:1;
      if(aNoInning&&bNoInning)return (b.priority-a.priority)||(b.order-a.order);
      // 2) 有局數時，越後面的局數越上面
      if(a.inningSort!==b.inningSort)return b.inningSort-a.inningSort;
      // 3) 同一局較晚發生的事件優先
      return (b.order-a.order)||(b.priority-a.priority);
    });
  }

  function renderHighlightTicker(){
    const list=state.highlights||[];
    if(!list.length){
      els.highlightTicker.innerHTML='<span class="highlight-ticker-desc">目前還沒有符合條件的焦點事件</span>';
      els.highlightCounter.textContent='0 / 0';
      return;
    }
    state.highlightIndex=((state.highlightIndex%list.length)+list.length)%list.length;
    const item=list[state.highlightIndex];
    els.highlightTicker.innerHTML=
      '<span class="highlight-ticker-icon" aria-hidden="true">'+item.icon+'</span>'+
      '<span class="highlight-ticker-title">'+esc(item.title)+'</span>'+
      '<span class="highlight-ticker-desc">· '+esc(item.desc)+'</span>';
    els.highlightCounter.textContent=(state.highlightIndex+1)+' / '+list.length;
  }

  function syncHighlights(){
    const list=state.highlights||[];
    els.gameHighlights.hidden=!state.highlightsExpanded;
    els.highlightsToggle.setAttribute('aria-expanded',String(state.highlightsExpanded));
    els.highlightsToggle.setAttribute('aria-label',
      (state.highlightsExpanded?'收合':'展開')+'全部 '+list.length+' 則本場焦點');
    renderHighlightTicker();
    if(!state.highlightsExpanded)return;
    els.gameHighlights.innerHTML=list.length?list.map(x=>{
      const inningText=(x.meta||'')+' '+(x.desc||'');
      const halfClass=inningText.includes('局上')?' top-half':inningText.includes('局下')?' bottom-half':'';
      return '<article class="highlight-item '+x.tone+halfClass+'">'+
        '<div class="highlight-top"><span class="highlight-icon" aria-hidden="true">'+x.icon+'</span>'+
        '<div class="highlight-title">'+esc(x.title)+'</div></div>'+
        '<div class="highlight-desc">'+esc(x.desc)+'</div>'+
        (x.meta?'<div class="highlight-meta">'+esc(x.meta)+'</div>':'')+
      '</article>';
    }).join(''):'<div class="empty" style="grid-column:1/-1">目前還沒有符合條件的焦點事件</div>';
  }

  function renderHighlights(feed){
    const gamePk=feed.gameData?.game?.pk??state.selectedGamePk;
    if(gamePk!==state.highlightGamePk){
      state.highlightGamePk=gamePk;
      state.highlightIndex=0;
      state.highlightsExpanded=false;
    }
    const oldId=state.highlights[state.highlightIndex]?.id;
    state.highlights=buildHighlightItems(feed);
    const retained=state.highlights.findIndex(item=>item.id===oldId);
    if(retained>=0)state.highlightIndex=retained;
    else if(state.highlightIndex>=state.highlights.length)state.highlightIndex=0;
    syncHighlights();
  }

  function advanceHighlights(){
    if(state.highlightsExpanded||state.highlights.length<=1||document.hidden)return;
    state.highlightIndex=(state.highlightIndex+1)%state.highlights.length;
    renderHighlightTicker();
  }

  function teamAbbr(team){
    return team?.abbreviation||team?.teamCode?.toUpperCase()||
      String(team?.name||'---').split(/\s+/).map(x=>x[0]).join('').slice(0,3).toUpperCase();
  }

  function boxPlayer(box,id){
    return box?.players?.['ID'+id]||{};
  }
  function boxBatters(box){
    const ids=(box?.batters||[]).map(Number).filter(Boolean);
    return ids.map(id=>boxPlayer(box,id)).filter(p=>p?.person?.id);
  }
  function boxPitchers(box){
    const ids=(box?.pitchers||[]).map(Number).filter(Boolean);
    return ids.map(id=>boxPlayer(box,id)).filter(p=>p?.person?.id);
  }
  function boxValue(v){
    return v==null||v===''?'--':String(v);
  }
  function boxBattingTable(box){
    const players=boxBatters(box);
    if(!players.length)return '<div class="boxscore-empty">尚無打擊紀錄</div>';
    const rows=players.map(p=>{
      const s=p.stats?.batting||{},pos=p.position?.abbreviation||'';
      return '<tr>'+
        '<td>'+esc(p.person?.fullName||'--')+(pos?'<span class="player-pos">'+esc(pos)+'</span>':'')+'</td>'+
        '<td>'+boxValue(s.atBats)+'</td><td>'+boxValue(s.runs)+'</td><td>'+boxValue(s.hits)+'</td>'+
        '<td>'+boxValue(s.rbi)+'</td><td>'+boxValue(s.baseOnBalls)+'</td>'+
        '<td>'+boxValue(s.strikeOuts)+'</td><td>'+boxValue(s.homeRuns)+'</td>'+
      '</tr>';
    }).join('');
    return '<div class="boxscore-scroll"><table class="boxscore-table">'+
      '<thead><tr><th>打者</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>BB</th><th>SO</th><th>HR</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table></div>';
  }
  function boxPitchingTable(box){
    const players=boxPitchers(box);
    if(!players.length)return '<div class="boxscore-empty">尚無投球紀錄</div>';
    const rows=players.map(p=>{
      const s=p.stats?.pitching||{};
      const pitches=s.numberOfPitches??s.pitchesThrown;
      return '<tr>'+
        '<td>'+esc(p.person?.fullName||'--')+'</td>'+
        '<td>'+boxValue(s.inningsPitched)+'</td><td>'+boxValue(s.hits)+'</td>'+
        '<td>'+boxValue(s.runs)+'</td><td>'+boxValue(s.earnedRuns)+'</td>'+
        '<td>'+boxValue(s.baseOnBalls)+'</td><td>'+boxValue(s.strikeOuts)+'</td>'+
        '<td>'+boxValue(s.homeRuns)+'</td><td>'+boxValue(pitches)+'</td>'+
      '</tr>';
    }).join('');
    return '<div class="boxscore-scroll"><table class="boxscore-table">'+
      '<thead><tr><th>投手</th><th>IP</th><th>H</th><th>R</th><th>ER</th><th>BB</th><th>K</th><th>HR</th><th>P</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table></div>';
  }
  function boxTeamHTML(team,box){
    return '<section class="boxscore-team">'+
      '<div class="boxscore-team-head"><img src="'+esc(teamLogo(team?.id))+'" alt=""><span>'+esc(team?.name||'球隊')+'</span></div>'+
      '<div class="boxscore-group"><div class="boxscore-group-title">打者</div>'+boxBattingTable(box)+'</div>'+
      '<div class="boxscore-group"><div class="boxscore-group-title">投手</div>'+boxPitchingTable(box)+'</div>'+
    '</section>';
  }
  function teamGameStats(box,line){
    const batting=box?.teamStats?.batting||{};
    return {
      runs:line?.runs??batting.runs??0,
      hits:line?.hits??batting.hits??0,
      errors:line?.errors??0,
      homeRuns:batting.homeRuns??0,
      walks:batting.baseOnBalls??0,
      strikeOuts:batting.strikeOuts??0,
      leftOnBase:batting.leftOnBase??0
    };
  }
  function renderTeamStats(feed){
    const bs=feed?.liveData?.boxscore||{},ls=feed?.liveData?.linescore||{},gd=feed?.gameData||{};
    const awayTeam=gd.teams?.away||{},homeTeam=gd.teams?.home||{};
    const away=teamGameStats(bs.teams?.away,ls.teams?.away);
    const home=teamGameStats(bs.teams?.home,ls.teams?.home);
    const metrics=[
      ['runs','得分'],
      ['hits','安打'],
      ['errors','失誤'],
      ['homeRuns','全壘打'],
      ['walks','保送'],
      ['strikeOuts','三振'],
      ['leftOnBase','殘壘']
    ];
    els.teamStatsBoard.className='team-stats-card';
    els.teamStatsBoard.innerHTML=
      '<div class="team-stats-head">'+
        '<div class="team-stats-head-team away"><img src="'+esc(teamLogo(awayTeam.id))+'" alt=""><span>'+esc(teamAbbr(awayTeam))+'</span></div>'+
        '<div class="team-stats-vs">TEAM</div>'+
        '<div class="team-stats-head-team home"><span>'+esc(teamAbbr(homeTeam))+'</span><img src="'+esc(teamLogo(homeTeam.id))+'" alt=""></div>'+
      '</div>'+
      '<div class="team-stats-grid">'+metrics.map(([key,label])=>
        '<div class="team-stat-row">'+
          '<div class="team-stat-value away">'+esc(away[key])+'</div>'+
          '<div class="team-stat-label">'+esc(label)+'</div>'+
          '<div class="team-stat-value home">'+esc(home[key])+'</div>'+
        '</div>'
      ).join('')+'</div>';
  }
  function renderBoxScore(feed){
    const bs=feed?.liveData?.boxscore||{},gd=feed?.gameData||{};
    const away=bs.teams?.away,home=bs.teams?.home;
    if(!away&&!home){
      els.teamStatsBoard.className='team-stats-empty';
      els.teamStatsBoard.textContent='目前沒有隊伍統計資料';
      els.boxScoreBoard.className='boxscore-empty';
      els.boxScoreBoard.textContent='目前沒有 Box Score 資料';
      return;
    }
    renderTeamStats(feed);
    els.boxScoreBoard.className='boxscore-board';
    els.boxScoreBoard.innerHTML=
      boxTeamHTML(gd.teams?.away||{},away||{})+
      boxTeamHTML(gd.teams?.home||{},home||{});
    if(state.liveDetailTab==='stats')requestAnimationFrame(()=>syncLiveDetailHeight());
  }

  function renderLineScore(ls,away,home){
    const innings=ls.innings||[], maxInning=Math.max(9,...innings.map(i=>i.num||0));
    let head='<tr><th class="teamhead"></th>';
    for(let i=1;i<=maxInning;i++) head+='<th>'+i+'</th>';
    head+='<th>得分</th><th>安打</th><th>失誤</th></tr>';
    els.inningHead.innerHTML=head;
    const rows=[
      {side:'away',team:away,total:ls.teams?.away||{}},
      {side:'home',team:home,total:ls.teams?.home||{}}
    ];
    els.inningBody.innerHTML=rows.map(row=>{
      const abbr=teamAbbr(row.team);
      let tr='<tr><td class="teamcell"><div class="score-team"><span class="score-team-abbr">'+esc(abbr)+'</span></div></td>';
      for(let i=1;i<=maxInning;i++){
        const inn=innings.find(x=>x.num===i);
        const runs=inn?.[row.side]?.runs;
        tr+='<td>'+(runs==null?'-':runs)+'</td>';
      }
      return tr+'<td class="total">'+(row.total.runs??0)+'</td><td>'+(row.total.hits??0)+'</td><td>'+(row.total.errors??0)+'</td></tr>';
    }).join('');
  }
  function renderScoringPlays(plays){
    const all=plays.allPlays||[], scoring=(plays.scoringPlays||[]).map(i=>all[i]).filter(Boolean);
    if(!scoring.length){els.scoringEvents.className='empty';els.scoringEvents.textContent='尚無得分紀錄';return}
    els.scoringEvents.className='';els.scoringEvents.innerHTML=scoring.map(p=>eventHTML(p,true)).join('');
  }
  function renderRecentPlays(plays){
    const all=(plays.allPlays||[]).slice(-8).reverse();
    if(!all.length){els.recentEvents.className='empty';els.recentEvents.textContent='尚無打席紀錄';return}
    els.recentEvents.className='';els.recentEvents.innerHTML=all.map(p=>eventHTML(p,false)).join('');
  }
  function zhHalfInning(v){
    return v==='top'?'上':v==='bottom'?'下':'';
  }

  function buildBroadcastText(play){
    const batter=play.matchup?.batter?.fullName||'打者';
    const event=zhEventName(play.result?.event||'');
    const rbi=Number(play.result?.rbi||0);
    const runners=(play.runners||[])
      .filter(r=>r?.movement?.end==='score')
      .map(r=>r?.details?.runner?.fullName)
      .filter(Boolean);

    let text=`${batter} ${event || '完成本次打席'}`;

    if(rbi>0){
      text+=`，${rbi} 分打點`;
    }

    if(runners.length){
      text+=`；${runners.join('、')} 回本壘得分`;
    }

    const outs=play.count?.outs;
    if(typeof outs==='number'){
      text+=`。目前 ${outs} 出局`;
    }

    return text;
  }

  function eventHTML(play,showScore){
    const inning=`${play.about?.inning??'-'}局${zhHalfInning(play.about?.halfInning)}`;
    const desc=buildBroadcastText(play);
    const score=showScore
      ? `${play.result?.awayScore??'-'} - ${play.result?.homeScore??'-'}`
      : zhEventName(play.result?.event||'');

    const halfClass=play.about?.halfInning==='top'?'top-half':play.about?.halfInning==='bottom'?'bottom-half':'';
    return `<div class="event ${halfClass}">
      <div class="event-inning">${esc(inning)}</div>
      <div class="event-desc">${esc(desc)}</div>
      <div class="event-score">${esc(score)}</div>
    </div>`;
  }



  function rosterPositionLabel(abbr){
    const map={
      P:'投手',SP:'先發投手',RP:'後援投手',C:'捕手','1B':'一壘手','2B':'二壘手',
      '3B':'三壘手',SS:'游擊手',LF:'左外野手',CF:'中外野手',RF:'右外野手',
      OF:'外野手',IF:'內野手',DH:'指定打擊',PH:'代打',PR:'代跑',TWP:'二刀流'
    };
    return map[abbr]||abbr||'--';
  }
  function seasonStat(person,group){
    const entries=person?.stats||[];
    const found=entries.find(s=>
      String(s.group?.displayName||s.group?.id||'').toLowerCase()===group
    );
    return found?.splits?.[0]?.stat||{};
  }
  function stat3(v){
    if(v==null||v==='')return '--';
    const n=Number(v);
    if(!Number.isFinite(n))return String(v);
    return n.toFixed(3).replace(/^0/,'');
  }
  function stat2(v){
    if(v==null||v==='')return '--';
    const n=Number(v);
    return Number.isFinite(n)?n.toFixed(2):String(v);
  }
  function baseballInnings(v){
    if(v==null||v==='')return 0;
    const s=String(v),parts=s.split('.');
    const whole=Number(parts[0])||0;
    const outs=Number(parts[1])||0;
    return whole+(outs===1?1/3:outs===2?2/3:0);
  }
  function rate9(value,innings){
    const n=Number(value)||0,ip=baseballInnings(innings);
    return ip>0?(n*9/ip):null;
  }
  function estimatedFip(s){
    const ip=baseballInnings(s.inningsPitched);
    if(!ip)return null;
    const hr=Number(s.homeRuns)||0,bb=Number(s.baseOnBalls)||0,hbp=Number(s.hitBatsmen)||0,k=Number(s.strikeOuts)||0;
    return (13*hr+3*(bb+hbp)-2*k)/ip+3.10;
  }
  function metricHTML(label,value){
    return '<span class="roster-stat"><small>'+esc(label)+'</small>'+esc(value)+'</span>';
  }
  function hitterMetrics(person){
    const s=seasonStat(person,'hitting');
    const ops=s.ops!=null?s.ops:
      (Number.isFinite(Number(s.obp))&&Number.isFinite(Number(s.slg))?Number(s.obp)+Number(s.slg):null);
    return [
      ['AVG',stat3(s.avg)],['OBP',stat3(s.obp)],['SLG',stat3(s.slg)],
      ['OPS',stat3(ops)],['HR',s.homeRuns??'--'],['RBI',s.rbi??'--']
    ];
  }
  function pitcherMetrics(person){
    const s=seasonStat(person,'pitching');
    const fip=estimatedFip(s);
    const k9=rate9(s.strikeOuts,s.inningsPitched);
    const bb9=rate9(s.baseOnBalls,s.inningsPitched);
    return [
      ['ERA',stat2(s.era)],['WHIP',stat2(s.whip)],['FIP*',fip==null?'--':fip.toFixed(2)],
      ['K/9',k9==null?'--':k9.toFixed(2)],['BB/9',bb9==null?'--':bb9.toFixed(2)],
      ['W-L',(s.wins??'--')+'-'+(s.losses??'--')]
    ];
  }
  function isPitcherEntry(entry){
    const a=entry?.position?.abbreviation||'';
    return ['P','SP','RP'].includes(a)||entry?.position?.type==='Pitcher';
  }
  function rosterPlayerHTML(entry,options={}){
    const p=entry?.person||{};
    const id=p.id;
    const abbr=options.position||entry?.position?.abbreviation||'--';
    const pitcher=isPitcherEntry({...entry,position:{...(entry?.position||{}),abbreviation:abbr}});
    const metrics=pitcher?pitcherMetrics(p):hitterMetrics(p);
    return '<div class="roster-player '+(options.starter?'starter':'')+'">'+
      '<img class="roster-photo" src="'+esc(headshot(id))+'" alt="">'+
      '<div class="roster-player-main">'+
        '<div class="roster-player-top">'+
          (options.order?'<span class="roster-order">#'+options.order+'</span>':'')+
          '<span class="roster-player-name">'+esc(p.fullName||'--')+'</span>'+
          (options.starter?'<span class="starter-tag">先發</span>':'')+
          '<span class="roster-pos">'+esc(abbr+' · '+rosterPositionLabel(abbr))+'</span>'+
        '</div>'+
        '<div class="roster-stats">'+metrics.map(x=>metricHTML(x[0],x[1])).join('')+'</div>'+
        (options.usage?bullpenUsageHTML(options.usage):'')+
      '</div>'+
    '</div>';
  }
  function lineupInfo(feed,side){
    const box=feed?.liveData?.boxscore?.teams?.[side]||{};
    const players=box.players||{};
    let ids=(box.battingOrder||[]).map(Number).filter(Boolean);
    if(!ids.length){
      ids=Object.values(players)
        .filter(p=>p?.battingOrder)
        .sort((a,b)=>Number(a.battingOrder)-Number(b.battingOrder))
        .map(p=>p.person?.id).filter(Boolean);
    }
    const lineup=ids.map((id,index)=>{
      const bp=players['ID'+id]||{};
      return {id,order:index+1,position:bp.position?.abbreviation||bp.allPositions?.[0]?.abbreviation||'--'};
    });
    const probable=feed?.gameData?.probablePitchers?.[side]?.id||null;
    const starterId=Number(box.pitchers?.[0]||probable)||null;
    return {lineup,starterId};
  }
  async function fetchTeamRoster(teamId,season,date){
    const key=[teamId,season,date].join(':');
    const cached=state.rosterCache.get(key);
    if(cached&&Date.now()-cached.time<15*60*1000)return cached.rows;

    const hydrate='person(stats(group=[hitting,pitching],type=[season],season='+season+'))';
    const url=API+'/v1/teams/'+teamId+'/roster?rosterType=active&season='+season+
      (date?'&date='+encodeURIComponent(date):'')+'&hydrate='+encodeURIComponent(hydrate);
    const data=await getJSON(url);
    let rows=data.roster||[];

    // 某些 roster 回應只帶基本 person 資料，再以 people endpoint 一次補齊 season stats。
    const missing=rows.filter(r=>!(r.person?.stats||[]).length).map(r=>r.person?.id).filter(Boolean);
    if(missing.length){
      try{
        const people=await getJSON(API+'/v1/people?personIds='+missing.join(',')+'&hydrate='+encodeURIComponent(hydrate));
        const map=new Map((people.people||[]).map(p=>[p.id,p]));
        rows=rows.map(r=>map.has(r.person?.id)?{...r,person:map.get(r.person.id)}:r);
      }catch(_){}
    }
    state.rosterCache.set(key,{time:Date.now(),rows});
    return rows;
  }

  function pitchCountFromBoxPlayer(p){
    const s=p?.stats?.pitching||{};
    const n=s.numberOfPitches??s.pitchesThrown;
    return Number.isFinite(Number(n))?Number(n):0;
  }
  function bullpenUsageStatus(u){
    const today=u.todayPitches||0;
    const yesterday=u.dayPitches?.[1]||0;
    const total=u.totalPitches||0;
    const apps=u.appearances||0;
    const consecutive=u.consecutiveDays||0;

    if(today>0)return {tone:'red',icon:'🔴',label:'本場已登板'};
    if(yesterday>30||consecutive>=3||total>=60)return {tone:'red',icon:'🔴',label:'高負荷'};
    if(yesterday>=16||consecutive>=2||total>=35||apps>=2)return {tone:'yellow',icon:'🟡',label:'可能受限'};
    return {tone:'green',icon:'🟢',label:'休息充足'};
  }
  function bullpenUsageHTML(u){
    const s=bullpenUsageStatus(u||{});
    const y=u?.dayPitches?.[1]||0;
    const total=u?.totalPitches||0;
    const apps=u?.appearances||0;
    const today=u?.todayPitches||0;
    let detail='前3日 '+total+' 球 / '+apps+' 場 · 昨天 '+y+' 球';
    if(today>0)detail='本場 '+today+' 球 · '+detail;
    return '<div class="bullpen-usage">'+
      '<span class="bullpen-badge '+s.tone+'">'+s.icon+' '+esc(s.label)+'</span>'+
      '<span class="bullpen-detail">'+esc(detail)+'</span>'+
    '</div>';
  }
  function currentTeamPitchUsage(feed,side){
    const box=feed?.liveData?.boxscore?.teams?.[side]||{};
    const map=new Map();
    for(const id of box.pitchers||[]){
      const p=box.players?.['ID'+id]||{};
      map.set(Number(id),pitchCountFromBoxPlayer(p));
    }
    return map;
  }
  async function fetchBullpenUsage(teamId,referenceDate,currentGamePk,feed,side){
    const key=[teamId,referenceDate,currentGamePk].join(':');
    const cached=state.bullpenCache.get(key);
    if(cached&&Date.now()-cached.time<55000)return cached.usage;

    const startDate=shiftLocalDateString(referenceDate,-3);
    const endDate=shiftLocalDateString(referenceDate,-1);
    const schedule=await getJSON(
      API+'/v1/schedule?sportId=1&teamId='+teamId+
      '&startDate='+encodeURIComponent(startDate)+'&endDate='+encodeURIComponent(endDate)
    );
    const games=(schedule.dates||[]).flatMap(d=>d.games||[])
      .filter(g=>g.gamePk&&g.gamePk!==currentGamePk&&g.status?.abstractGameState==='Final');

    const usage=new Map();
    const ensure=id=>{
      id=Number(id);
      if(!usage.has(id))usage.set(id,{dayPitches:{1:0,2:0,3:0},totalPitches:0,appearances:0,consecutiveDays:0,todayPitches:0});
      return usage.get(id);
    };

    const boxes=await Promise.all(games.map(async g=>{
      try{
        const box=await getJSON(API+'/v1/game/'+g.gamePk+'/boxscore');
        return {game:g,box};
      }catch(_){return null}
    }));

    for(const item of boxes.filter(Boolean)){
      const g=item.game,box=item.box||{};
      const awayId=Number(g.teams?.away?.team?.id);
      const teamSide=awayId===Number(teamId)?'away':'home';
      const tb=box.teams?.[teamSide]||{};
      const official=g.officialDate||String(g.gameDate||'').slice(0,10);
      let ago=0;
      for(let n=1;n<=3;n++){
        if(shiftLocalDateString(referenceDate,-n)===official){ago=n;break}
      }
      if(!ago)continue;
      for(const id of tb.pitchers||[]){
        const p=tb.players?.['ID'+id]||{};
        const pitches=pitchCountFromBoxPlayer(p);
        const u=ensure(id);
        u.dayPitches[ago]+=pitches;
        u.totalPitches+=pitches;
        u.appearances+=1;
      }
    }

    for(const u of usage.values()){
      let streak=0;
      for(let n=1;n<=3;n++){
        if((u.dayPitches[n]||0)>0)streak++;
        else break;
      }
      u.consecutiveDays=streak;
    }

    const today=currentTeamPitchUsage(feed,side);
    for(const [id,pitches] of today){
      ensure(id).todayPitches=pitches;
    }

    state.bullpenCache.set(key,{time:Date.now(),usage});
    return usage;
  }

  function renderTeamRoster(team,rows,lineup,bullpenUsage=new Map()){
    const byId=new Map(rows.map(r=>[Number(r.person?.id),r]));
    const used=new Set();
    const starterPitcher=lineup.starterId?byId.get(Number(lineup.starterId)):null;
    if(starterPitcher)used.add(Number(starterPitcher.person?.id));

    const starters=lineup.lineup.map(item=>{
      const r=byId.get(Number(item.id));
      if(!r)return '';
      used.add(Number(item.id));
      return rosterPlayerHTML(r,{starter:true,order:item.order,position:item.position});
    }).filter(Boolean);

    const rest=rows.filter(r=>!used.has(Number(r.person?.id))).sort((a,b)=>{
      const ap=isPitcherEntry(a)?1:0,bp=isPitcherEntry(b)?1:0;
      return ap-bp||String(a.person?.fullName||'').localeCompare(String(b.person?.fullName||''));
    });
    const hitters=rest.filter(r=>!isPitcherEntry(r));
    const pitchers=rest.filter(isPitcherEntry);

    const section=(title,items,emptyText)=>
      '<div class="roster-section"><div class="roster-section-title"><span>'+esc(title)+'</span><small>'+items.length+' 人</small></div>'+
      '<div class="roster-list">'+(items.length?items.join(''):'<div class="roster-meta">'+esc(emptyText)+'</div>')+'</div></div>';

    const starterPitcherHTML=starterPitcher
      ?[rosterPlayerHTML(starterPitcher,{starter:true,position:'P'})]
      :[];

    return '<section class="roster-team">'+
      '<div class="roster-team-head">'+
        '<img class="roster-team-logo" src="'+esc(teamLogo(team.id))+'" alt="">'+
        '<div><div class="roster-team-name">'+esc(team.name||team.teamName||'球隊')+'</div>'+
        '<div class="roster-team-sub">'+esc(teamAbbr(team))+' · Active roster '+rows.length+' 人</div></div>'+
      '</div>'+
      section('先發投手',starterPitcherHTML,'先發投手尚未公布')+
      section('先發打線',starters,'先發打線尚未公布')+
      section('替補野手',hitters.map(r=>rosterPlayerHTML(r)),'目前沒有其他野手')+
      '<div class="roster-section"><div class="roster-section-title"><span>牛棚負荷狀態</span><small>依近期用球推估</small></div>'+
      '<div class="bullpen-legend">🟢 休息充足　🟡 可能受限　🔴 高負荷 / 本場已登板。僅依前 3 日登板與用球數推估，非球隊官方可用狀態。</div>'+
      '<div class="roster-list">'+(pitchers.length?pitchers.map(r=>{
        const id=Number(r.person?.id);
        return rosterPlayerHTML(r,{usage:bullpenUsage.get(id)||{}});
      }).join(''):'<div class="roster-meta">目前沒有其他投手</div>')+'</div></div>'+
      '<div class="roster-note">打者：AVG / OBP / SLG / OPS / HR / RBI。投手：ERA / WHIP / FIP* / K/9 / BB/9 / W-L。FIP* 以例行賽數據及 3.10 常數估算。</div>'+
    '</section>';
  }
  async function loadMatchupRoster(force=false){
    if(state.rosterLoading)return;
    const gamePk=state.selectedGamePk;
    if(!gamePk){
      els.rosterMatchupTitle.textContent='對戰名單';
      els.rosterMeta.textContent='目前沒有選取比賽';
      els.rosterBoard.className='roster-empty';
      els.rosterBoard.textContent='請先回到即時比賽選擇一場賽事';
      return;
    }
    state.rosterLoading=true;
    els.rosterBoard.className='roster-empty';
    els.rosterBoard.textContent='載入兩隊 26 人名單與例行賽數據中…';
    try{
      let feed=state.currentFeedGamePk===gamePk?state.currentFeed:null;
      if(!feed||force){
        feed=await getJSON(API+'/v1.1/game/'+gamePk+'/feed/live');
        state.currentFeed=feed;state.currentFeedGamePk=gamePk;
      }
      const gd=feed.gameData||{};
      const away=gd.teams?.away||{},home=gd.teams?.home||{};
      const season=Number(gd.game?.season)||Number(String(els.dateInput.value||'').slice(0,4))||new Date().getFullYear();
      const officialDate=gd.datetime?.officialDate||els.dateInput.value||'';
      els.rosterMatchupTitle.textContent=teamAbbr(away)+' vs '+teamAbbr(home);
      els.rosterMeta.textContent=season+' 例行賽數據 · '+officialDate+' 名單';
      const [awayRows,homeRows,awayBullpen,homeBullpen]=await Promise.all([
        fetchTeamRoster(away.id,season,officialDate),
        fetchTeamRoster(home.id,season,officialDate),
        fetchBullpenUsage(away.id,officialDate,gamePk,feed,'away'),
        fetchBullpenUsage(home.id,officialDate,gamePk,feed,'home')
      ]);
      const awayLineup=lineupInfo(feed,'away');
      const homeLineup=lineupInfo(feed,'home');
      els.rosterBoard.className='roster-board';
      els.rosterBoard.innerHTML=
        renderTeamRoster(away,awayRows,awayLineup,awayBullpen)+
        renderTeamRoster(home,homeRows,homeLineup,homeBullpen);
    }catch(err){
      els.rosterBoard.className='roster-empty';
      els.rosterBoard.textContent='對戰名單載入失敗：'+err.message;
    }finally{
      state.rosterLoading=false;
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
  function scheduleTeam(t){
    const team=t?.team||{};
    return {
      id:team.id||null,
      name:team.name||team.teamName||'待定',
      abbreviation:team.abbreviation||team.teamCode?.toUpperCase()||teamAbbr(team)
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
  function setFeatureMenuOpen(open){
    els.featureMenu.hidden=!open;
    els.featureMenuButton.setAttribute('aria-expanded',String(open));
  }

  function isStandaloneApp(){
    return window.matchMedia?.('(display-mode: standalone)').matches===true||
      window.navigator.standalone===true;
  }
  function isIOSDevice(){
    return /iPad|iPhone|iPod/.test(navigator.userAgent)||
      (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  }
  function syncInstallPage(){
    if(isStandaloneApp()){
      els.installStatus.textContent='✅ 已從主畫面以 App 模式開啟';
      els.installAppBtn.disabled=true;
      els.installAppHint.textContent='這台裝置已安裝';
      return;
    }
    els.installAppBtn.disabled=false;
    if(deferredInstallPrompt){
      els.installStatus.textContent='✅ 此瀏覽器支援直接安裝';
      els.installAppHint.textContent='點一下開啟安裝視窗';
    }else if(isIOSDevice()){
      els.installStatus.textContent='iPhone / iPad：使用 Safari 加入主畫面';
      els.installAppHint.textContent='查看 iPhone 安裝步驟';
    }else{
      els.installStatus.textContent='可分享連結；安裝方式依瀏覽器而定';
      els.installAppHint.textContent='查看安裝方式';
    }
  }
  async function shareThisApp(){
    const url=new URL('./',location.href).href;
    const data={title:'MLB 戰況 App',text:'MLB 季後賽即時比分、對戰名單與球員數據',url};
    if(navigator.share){
      try{await navigator.share(data);return}catch(err){
        if(err?.name==='AbortError')return;
      }
    }
    try{
      await navigator.clipboard.writeText(url);
      els.copyAppHint.textContent='已複製，可貼給朋友';
      setTimeout(()=>els.copyAppHint.textContent='複製網站連結',1800);
    }catch(_){}
  }
  async function copyThisApp(){
    const url=new URL('./',location.href).href;
    try{
      await navigator.clipboard.writeText(url);
      els.copyAppHint.textContent='✓ 已複製';
      setTimeout(()=>els.copyAppHint.textContent='複製網站連結',1800);
    }catch(_){
      els.copyAppHint.textContent='請長按網址複製';
    }
  }
  function flashInstallGuide(){
    els.installGuide.classList.remove('flash');
    void els.installGuide.offsetWidth;
    els.installGuide.classList.add('flash');
    els.installGuide.scrollIntoView({behavior:'smooth',block:'center'});
  }
  async function installThisApp(){
    if(isStandaloneApp())return;
    if(deferredInstallPrompt){
      deferredInstallPrompt.prompt();
      try{await deferredInstallPrompt.userChoice}catch(_){}
      deferredInstallPrompt=null;
      syncInstallPage();
      return;
    }
    flashInstallGuide();
  }
  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();
    deferredInstallPrompt=e;
    syncInstallPage();
  });
  window.addEventListener('appinstalled',()=>{
    deferredInstallPrompt=null;
    syncInstallPage();
  });
  els.installAppBtn.addEventListener('click',installThisApp);
  els.shareAppBtn.addEventListener('click',shareThisApp);
  els.copyAppBtn.addEventListener('click',copyThisApp);

  function switchView(view){
    state.view=view;
    const bracket=view==='bracket',roster=view==='roster',install=view==='install',live=view==='live';
    els.liveView.hidden=!live;
    els.bracketView.hidden=!bracket;
    els.rosterView.hidden=!roster;
    els.installView.hidden=!install;
    els.featureMenu.querySelectorAll('[data-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===view));

    if(bracket){
      els.appTitle.textContent='MLB 季後賽戰況';
      els.appSubtitle.textContent='外卡・分區系列賽・聯盟冠軍賽・世界大賽';
    }else if(roster){
      els.appTitle.textContent='MLB 對戰名單';
      els.appSubtitle.textContent='兩隊 Active roster・本場先發・例行賽打投數據';
    }else if(install){
      els.appTitle.textContent='安裝 / 分享 MLB 戰況';
      els.appSubtitle.textContent='加入主畫面・分享給朋友・App 使用教學';
      syncInstallPage();
    }else{
      els.appTitle.textContent='MLB 季後賽即時戰況';
      els.appSubtitle.textContent='即時比分・打者 / 投手・用球數・B/S/O・壘包・球速球種・逐局與得分紀錄';
    }

    els.topControlsToggle.hidden=!live;
    if(bracket){
      els.topControls.hidden=true;
      loadBracket();
    }else if(roster){
      els.topControls.hidden=true;
      loadMatchupRoster();
    }else if(install){
      els.topControls.hidden=true;
    }else{
      setTopControlsExpanded(state.topControlsExpanded);
    }
    setFeatureMenuOpen(false);
  }

  function setTopControlsExpanded(expanded){
    state.topControlsExpanded=expanded;
    els.topControls.hidden=!expanded;
    els.topControlsToggle.setAttribute('aria-expanded',String(expanded));
    els.topControlsToggle.setAttribute('aria-label',expanded?'收合日期與更新':'展開日期與更新');
  }
  els.featureMenuButton.addEventListener('click',e=>{
    e.stopPropagation();
    setFeatureMenuOpen(els.featureMenu.hidden);
  });
  els.featureMenu.addEventListener('click',e=>{
    const btn=e.target.closest('[data-view]');
    if(btn)switchView(btn.dataset.view);
  });
  document.addEventListener('click',e=>{
    if(!els.featureMenu.contains(e.target)&&!els.featureMenuButton.contains(e.target))setFeatureMenuOpen(false);
  });

  els.heroRosterBtn.addEventListener('click',()=>switchView('roster'));
  els.rosterBackBtn.addEventListener('click',()=>switchView('live'));
  els.liveDetailTabs.addEventListener('click',e=>{
    const btn=e.target.closest('[data-live-tab]');
    if(btn)setLiveDetailTab(btn.dataset.liveTab);
  });
  els.currentSeriesGames.addEventListener('click',e=>{
    const btn=e.target.closest('[data-series-game-pk]');
    if(btn)openSeriesGame(Number(btn.dataset.seriesGamePk));
  });

  els.topControlsToggle.addEventListener('click',()=>{
    setTopControlsExpanded(els.topControlsToggle.getAttribute('aria-expanded')!=='true');
  });

  document.querySelectorAll('[data-collapse-section]').forEach(section=>{
    const head=section.querySelector('[data-collapse-head]');
    const body=section.querySelector('[data-collapse-body]');
    const btn=section.querySelector('.collapse-toggle');
    if(!head||!body||!btn)return;
    const setExpanded=expanded=>{
      body.hidden=!expanded;
      btn.setAttribute('aria-expanded',String(expanded));
      const title=head.querySelector('h2')?.textContent?.trim()||'區塊';
      btn.setAttribute('aria-label',(expanded?'收合':'展開')+title);
    };
    const toggle=()=>setExpanded(btn.getAttribute('aria-expanded')!=='true');
    btn.addEventListener('click',e=>{e.stopPropagation();toggle();});
    head.addEventListener('click',e=>{if(e.target.closest('button'))return;toggle();});
  });

  els.highlightsToggle.addEventListener('click',()=>{
    state.highlightsExpanded=!state.highlightsExpanded;
    syncHighlights();
  });
  setInterval(advanceHighlights,5000);


  // iPhone Web App：在頁面頂端往下拉，放開後重新載入整個頁面。
  (() => {
    const THRESHOLD=72, MAX_PULL=116;
    let startY=null,startX=null,distance=0,tracking=false;

    const reset=()=>{
      startY=startX=null;distance=0;tracking=false;
      els.pullRefresh.classList.remove('visible','refreshing');
      els.pullRefresh.style.transform='translate(-50%,-58px)';
      els.pullRefreshText.textContent='下拉重新整理';
      els.pullRefresh.querySelector('.pull-refresh-icon').textContent='↓';
    };

    document.addEventListener('touchstart',e=>{
      if(window.scrollY>1||e.touches.length!==1)return;
      const t=e.touches[0];
      startY=t.clientY;startX=t.clientX;distance=0;tracking=true;
    },{passive:true});

    document.addEventListener('touchmove',e=>{
      if(!tracking||startY==null||e.touches.length!==1)return;
      const t=e.touches[0],dy=t.clientY-startY,dx=t.clientX-startX;
      if(dy<=0){reset();return;}
      if(Math.abs(dx)>Math.abs(dy)*.8){reset();return;}
      if(window.scrollY>1){reset();return;}

      e.preventDefault();
      distance=Math.min(MAX_PULL,dy*.58);
      const y=-58+distance;
      els.pullRefresh.style.transform='translate(-50%,'+y+'px)';
      els.pullRefresh.classList.add('visible');
      const ready=distance>=THRESHOLD;
      els.pullRefreshText.textContent=ready?'放開重新整理':'下拉重新整理';
      els.pullRefresh.querySelector('.pull-refresh-icon').textContent=ready?'↻':'↓';
    },{passive:false});

    const finish=()=>{
      if(!tracking)return;
      const shouldRefresh=distance>=THRESHOLD;
      tracking=false;
      if(!shouldRefresh){reset();return;}

      els.pullRefresh.classList.add('visible','refreshing');
      els.pullRefresh.style.transform='translate(-50%,10px)';
      els.pullRefreshText.textContent='重新整理中…';
      els.pullRefresh.querySelector('.pull-refresh-icon').textContent='↻';

      setTimeout(()=>{
        const u=new URL(location.href);
        u.searchParams.set('_pull',Date.now());
        location.replace(u.toString());
      },140);
    };

    document.addEventListener('touchend',finish,{passive:true});
    document.addEventListener('touchcancel',reset,{passive:true});
  })();

  els.refreshBtn.addEventListener('click',()=>loadSchedule(true));
  els.dateInput.addEventListener('change',()=>{loadSchedule(false);if(state.view==='bracket')loadBracket(true)});
  els.dateInput.value=localDateString();
  switchView('live');
  initLiveDetailSwipe();
  setLiveDetailTab('status',{animate:false});
  loadSchedule(false);
  setInterval(()=>{if(state.view==='live')loadSchedule(true)},REFRESH_MS);
  setInterval(()=>{if(state.view==='bracket')loadBracket(true)},60000);
  setInterval(()=>{if(state.view==='roster')loadMatchupRoster(true)},60000);
  setInterval(()=>{if(state.view==='live'&&state.liveDetailTab==='series')loadCurrentSeries(true)},60000);
  async function disableLegacyPwaCache(){
    let hadController=false;
    try{
      if('serviceWorker' in navigator){
        hadController=!!navigator.serviceWorker.controller;
        const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(reg=>reg.unregister()));
      }
      if('caches' in window){
        const keys=await caches.keys();
        await Promise.all(keys.map(key=>caches.delete(key)));
      }
    }catch(_){}
    if(hadController&&!sessionStorage.getItem('pwa-cache-migrated-v2')){
      sessionStorage.setItem('pwa-cache-migrated-v2','1');
      const u=new URL(location.href);
      u.searchParams.set('_refresh',Date.now());
      location.replace(u.toString());
      return true;
    }
    return false;
  }

  async function freshIndexHash(){
    const paths=['./index.html','./styles.css','./app.js'];
    const texts=await Promise.all(paths.map(async path=>{
      const u=new URL(path,location.href);
      u.searchParams.set('_check',Date.now());
      const r=await fetch(u.toString(),{cache:'no-store'});
      if(!r.ok)throw new Error('version check failed');
      return r.text();
    }));
    const text=texts.join('\n/* asset */\n');
    let h=2166136261;
    for(let i=0;i<text.length;i++){
      h^=text.charCodeAt(i);
      h=Math.imul(h,16777619);
    }
    return (h>>>0).toString(16);
  }

  async function checkForAppUpdate(){
    try{
      const hash=await freshIndexHash();
      const prev=localStorage.getItem('mlb-index-hash');
      if(!prev){
        localStorage.setItem('mlb-index-hash',hash);
        return;
      }
      if(prev!==hash){
        localStorage.setItem('mlb-index-hash',hash);
        const u=new URL(location.href);
        u.searchParams.set('_v',Date.now());
        location.replace(u.toString());
      }
    }catch(_){}
  }

  window.addEventListener('load',async()=>{
    const reloading=await disableLegacyPwaCache();
    if(!reloading)checkForAppUpdate();
  });
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)checkForAppUpdate();
  });
  window.addEventListener('focus',checkForAppUpdate);
  setInterval(checkForAppUpdate,60000);
})();
