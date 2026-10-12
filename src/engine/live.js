/* MLB Live Scoreboard - live.js
   即時賽事、投打資訊、好球帶、焦點、隊伍/球員 Box Score 與得分事件。 */

async function loadSchedule(keepSelection=true,requestedGamePk=null){
  if(state.loading) return;
  state.loading=true;
  showError('');
  try{
    const date=els.dateInput.value||localDateString();

    // MLB 的 schedule 日期不一定等於使用者所在地的日曆日期。
    // 前後各多抓一天，再依瀏覽器 / iPhone 的當地時區重新歸類。
    const startDate=shiftLocalDateString(date,-1);
    const endDate=shiftLocalDateString(date,1);
    const data=await getJSON(`${API}/v1/schedule?sportId=1&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&hydrate=team,linescore,seriesStatus`);
    const all=(data.dates||[]).flatMap(d=>d.games||[]);
    const unique=[...new Map(all.map(g=>[g.gamePk,g])).values()];
    state.games=unique
      .filter(g=>LIVE_TYPES.has(g.gameType)&&gameLocalDateKey(g)===date)
      .sort((a,b)=>new Date(a.gameDate)-new Date(b.gameDate));

    if(requestedGamePk!=null){
      if(!state.games.some(g=>g.gamePk===requestedGamePk)){
        throw new Error(t('通知指定的比賽不在該日賽程中，請稍後重新整理'));
      }
      state.selectedGamePk=requestedGamePk;
    }
    if(!keepSelection||!state.games.some(g=>g.gamePk===state.selectedGamePk)){
      // 預設選擇：進行中的追蹤球隊比賽 > 進行中 > 追蹤球隊 > 第一場。
      const followed=followedTeamSet();
      const isLive=g=>g.status?.abstractGameState==='Live';
      const isFollowed=g=>followed.has(Number(g.teams?.away?.team?.id))||followed.has(Number(g.teams?.home?.team?.id));
      const pick=state.games.find(g=>isLive(g)&&isFollowed(g))||state.games.find(isLive)||state.games.find(isFollowed)||state.games[0];
      state.selectedGamePk=pick?.gamePk??null;
    }
    renderTabs();
    if(state.selectedGamePk) await loadGame(state.selectedGamePk);
    else renderNoGame(date);
    return true;
  }catch(err){
    showError(t('無法取得 MLB 即時資料：{error}',{error:err.message}));
    markUpdated(false,false);
    return false;
  }finally{
    state.loading=false;
  }
}

function renderTabs(){
  bridge.publish({games:state.games.map(g=>({gamePk:g.gamePk,label:gameLabel(g),time:gameLocalDateTime(g),awayId:Number(g.teams?.away?.team?.id)||null,homeId:Number(g.teams?.home?.team?.id)||null})),selectedGamePk:state.selectedGamePk});
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
    showError(t('賽事資料讀取失敗：{error}',{error:err.message}));
    markUpdated(false,false);
  }
}

function markUpdated(ok,isLive){
  els.liveDot.classList.toggle('off',!ok);
  els.liveDot.classList.toggle('live',!!(ok&&isLive));
  const time=new Date().toLocaleTimeString(locale(),{hour12:false});
  els.updateText.textContent=ok?(isLive?'LIVE':t('已更新')):t('更新失敗');
  els.liveChip.dataset.tooltip=ok?t('最後更新 {time}',{time}):t('更新失敗 · {time}',{time});
}

function setGameDetailsVisible(visible){
  els.liveDetailTabs.hidden=!visible;
  els.liveDetailViewport.hidden=!visible;
  document.getElementById('noGameMessage').hidden=visible;
}

function renderNoGame(date){
  setGameDetailsVisible(false);
  document.getElementById('noGameText').textContent=date===localDateString()?t('今日沒有比賽'):t('這天沒有比賽');
  bridge.publish({score:null,emptyDate:date});
  resetGameRecap();
  if(els.gameWatchBtn)els.gameWatchBtn.hidden=true;
  resetMatchup();
  els.inningHead.innerHTML='';els.inningBody.innerHTML='';
  els.teamStatsBoard.className='team-stats-empty';els.teamStatsBoard.textContent=t('目前沒有隊伍統計資料');
  els.boxScoreBoard.className='boxscore-empty';els.boxScoreBoard.textContent=t('目前沒有 Box Score 資料');
  els.scoringEvents.className='empty';els.scoringEvents.textContent=t('尚無得分紀錄');
  els.recentEvents.className='empty';els.recentEvents.textContent=t('尚無打席紀錄');
  state.currentSeriesGames=[];
  els.currentSeriesTitle.textContent=t('系列賽');
  els.currentSeriesSummary.textContent=t('目前沒有選取比賽');
  els.currentSeriesGames.innerHTML='<div class="series-overview-empty">'+t('目前沒有系列賽資料')+'</div>';
  state.highlights=[];state.highlightIndex=0;state.highlightGamePk=null;state.highlightsExpanded=false;
  syncHighlights();
  setBases(null,null,null);renderPitchLocation(null);markUpdated(true,false);
}

function resetMatchup(){
  els.batterName.textContent='--';els.pitcherName.textContent='--';
  els.batterPhoto.src=headshot(null);els.pitcherPhoto.src=headshot(null);
  els.batterMeta.textContent=t('請切換其他日期');els.pitcherMeta.textContent=t('總用球 {total} · 本打席 {count} 球',{total:'--',count:'--'});
  els.lastPitchMain.textContent='--';els.lastPitchSub.textContent=t('等待投球資料');
  els.pitchEfficiency.textContent='--';els.pitchEfficiencySub.textContent=t('好球數 / 用球數');
  els.latestPlay.textContent=t('尚無最新打席資訊');els.pitchSequence.innerHTML='';
  els.balls.textContent='0';els.strikes.textContent='0';setOuts(0);
}

function renderGame(feed){
  setGameDetailsVisible(true);
  const gd=feed.gameData||{}, live=feed.liveData||{}, ls=live.linescore||{}, plays=live.plays||{}, cp=plays.currentPlay||{};
  const away=gd.teams?.away||{}, home=gd.teams?.home||{}, awayLine=ls.teams?.away||{}, homeLine=ls.teams?.home||{}, status=gd.status||{};

  bridge.publish({emptyDate:null,score:{
    series:findSeriesDescription()||seriesName(gd.game?.type||gd.game?.gameType),
    status:status.detailedState||status.abstractGameState||'--',inning:inningLabel(ls),
    away:{...away,runs:awayLine.runs??0,hits:awayLine.hits??0,errors:awayLine.errors??0},
    home:{...home,runs:homeLine.runs??0,hits:homeLine.hits??0,errors:homeLine.errors??0}
  }});

  if(state.liveDetailTab==='recap')loadGameRecap();
  else if(recapGamePk!==Number(state.selectedGamePk))resetGameRecap();
  renderGameWatchButton(feed);
  syncGameWatchStatus(gd.game?.pk??state.selectedGamePk);
  renderGameSummary(feed);

  const batter=ls.offense?.batter||cp.matchup?.batter, pitcher=ls.defense?.pitcher||cp.matchup?.pitcher;
  els.batterName.textContent=batter?.fullName||'--';els.pitcherName.textContent=pitcher?.fullName||'--';
  els.batterPhoto.src=headshot(batter?.id);els.pitcherPhoto.src=headshot(pitcher?.id);
  els.batterPhoto.alt=batter?.fullName||t('打者');els.pitcherPhoto.alt=pitcher?.fullName||t('投手');

  // 投打習慣整句翻譯（右打 / Bats Right / 右打ち），不能把 MLB 的 Right、Left 接上「打」「投」。
  const bats={R:t('右打'),L:t('左打'),S:t('左右開弓')}[cp.matchup?.batSide?.code]||cp.matchup?.batSide?.description||'';
  const batterEvent=zhEventName(cp.result?.event)||t('目前打席進行中');
  els.batterMeta.textContent=batter?(bats?t('{bats} · {event}',{bats,event:batterEvent}):batterEvent):t('目前沒有打者資料');

  const pStats=getPitcherStats(live.boxscore,pitcher?.id);
  const currentPitches=(cp.playEvents||[]).filter(e=>e.isPitch||e.type==='pitch');
  const throws={R:t('右投'),L:t('左投')}[cp.matchup?.pitchHand?.code]||cp.matchup?.pitchHand?.description||'';
  const pitchVars={throws,total:pStats.pitches??'--',count:currentPitches.length};
  els.pitcherMeta.textContent=throws?t('{throws} · 總用球 {total} · 本打席 {count} 球',pitchVars):t('總用球 {total} · 本打席 {count} 球',pitchVars);

  els.balls.textContent=ls.balls??cp.count?.balls??0;
  els.strikes.textContent=ls.strikes??cp.count?.strikes??0;
  setOuts(ls.outs??cp.count?.outs??0);

  setBases(ls.offense?.first,ls.offense?.second,ls.offense?.third);
  els.latestPlay.textContent=zhDescription(cp.result?.description)||zhPitchResult(latestEventDescription(cp))||t('目前沒有打席說明');

  const lastPitch=[...currentPitches].reverse().find(e=>e.pitchData||e.details);
  renderLastPitch(lastPitch);
  renderPitchSequence(currentPitches);
  renderPitchLocation(lastPitch);

  if(pStats.pitches){
    const strikes=pStats.strikes??null;
    const pct=strikes!=null?Math.round(strikes/pStats.pitches*100):null;
    els.pitchEfficiency.textContent=pct!=null?t('{pct}% 好球',{pct}):t('{n} 球',{n:pStats.pitches});
    els.pitchEfficiencySub.textContent=strikes!=null?t('{strikes} 好球 / {pitches} 用球',{strikes,pitches:pStats.pitches}):t('投手累計用球');
  }else{
    els.pitchEfficiency.textContent='--';els.pitchEfficiencySub.textContent=t('好球數 / 用球數');
  }

  renderHighlights(feed);
  renderLineScore(ls,away,home);renderBoxScore(feed);renderScoringPlays(plays);renderRecentPlays(plays,{away,home},feed.gamePk??gd.game?.pk??state.selectedGamePk);
  if(state.liveDetailTab==='series')loadCurrentSeries();
  if(state.liveDetailTab==='status')requestAnimationFrame(()=>syncLiveDetailHeight());
}

function findSeriesDescription(){
  const raw=String(state.games.find(g=>g.gamePk===state.selectedGamePk)?.seriesDescription||'').trim();
  if(!raw)return '';
  const names={
    'NL Division Series':t('國聯分區系列賽'),
    'AL Division Series':t('美聯分區系列賽'),
    'NL Championship Series':t('國聯冠軍系列賽'),
    'AL Championship Series':t('美聯冠軍系列賽'),
    'National League Wild Card Series':t('國聯外卡系列賽'),
    'American League Wild Card Series':t('美聯外卡系列賽'),
    'World Series':t('世界大賽'),
    'Regular Season':t('例行賽')
  };
  return names[raw]||raw;
}
function seriesName(type){
  return ({R:t('例行賽'),F:t('外卡系列賽'),D:t('分區系列賽'),L:t('聯盟冠軍系列賽'),W:t('世界大賽'),P:t('季後賽')})[type]||'MLB';
}
function inningLabel(ls){
  if(!ls.currentInning) return ls.inningState||'--';
  const st=String(ls.inningState||'').toLowerCase();
  const half=ls.isTopInning===true||st.includes('top')?'top':ls.isTopInning===false||st.includes('bottom')?'bottom':'';
  return inningHalfText(ls.currentInning,half,true);
}
// 「N 局上 / N局下」整句翻譯（英日文語序不同，不能拼接「局」「上」）；spaced 對應局數後有空格的原文。
function inningHalfText(n,half,spaced){
  if(spaced)return half==='top'?t('{n} 局上',{n}):half==='bottom'?t('{n} 局下',{n}):t('{n} 局',{n});
  return half==='top'?t('{n}局上',{n}):half==='bottom'?t('{n}局下',{n}):t('{n}局',{n});
}
function setBases(r1,r2,r3){
  [[els.base1,r1],[els.base2,r2],[els.base3,r3]].forEach(([el,r])=>el.classList.toggle('on',!!r));
  els.baseSummary.innerHTML=
    '<div><span>'+t('一壘')+'</span><strong>'+esc(r1?.fullName||'--')+'</strong></div>'+
    '<div><span>'+t('二壘')+'</span><strong>'+esc(r2?.fullName||'--')+'</strong></div>'+
    '<div><span>'+t('三壘')+'</span><strong>'+esc(r3?.fullName||'--')+'</strong></div>';
}
function setOuts(value){
  const outs=Math.max(0,Math.min(3,Number(value)||0));
  els.outs.textContent=String(outs);
  outDots.forEach((dot,index)=>dot.classList.toggle('on',index<outs));
  document.querySelector('.outs-dots')?.setAttribute('aria-label',t('{n} 出局',{n:outs}));
}
function getPitcherStats(boxscore,pitcherId){
  if(!boxscore||!pitcherId) return {};
  const key=`ID${pitcherId}`;
  const p=boxscore.teams?.home?.players?.[key]||boxscore.teams?.away?.players?.[key];
  const s=p?.stats?.pitching||{};
  return {pitches:s.numberOfPitches??s.pitchesThrown??null,strikes:s.strikes??null};
}

function zhEventName(s){
  // 英文介面直接用 MLB 的英文原名。
  if(lang()==='en')return s||'';
  const m={
    'Single':t('一壘安打'),'Double':t('二壘安打'),'Triple':t('三壘安打'),'Home Run':t('全壘打'),
    'Strikeout':t('三振'),'Walk':t('四壞保送'),'Intent Walk':t('故意四壞保送'),'Hit By Pitch':t('觸身球'),
    'Flyout':t('飛球出局'),'Lineout':t('平飛球出局'),'Groundout':t('滾地球出局'),'Pop Out':t('內野高飛球出局'),
    'Forceout':t('封殺出局'),'Field Error':t('守備失誤'),'Fielders Choice':t('野手選擇'),
    'Fielders Choice Out':t('野手選擇出局'),'Double Play':t('雙殺'),'Grounded Into DP':t('雙殺打'),'Triple Play':t('三殺'),
    'Sac Fly':t('高飛犧牲打'),'Sac Bunt':t('犧牲觸擊'),'Bunt Groundout':t('觸擊滾地球出局'),
    'Bunt Pop Out':t('觸擊高飛球出局'),'Catcher Interference':t('捕手妨礙'),
    'Runner Out':t('跑者出局'),'Stolen Base':t('盜壘成功'),'Caught Stealing':t('盜壘失敗'),
    'Pickoff':t('牽制出局'),'Wild Pitch':t('暴投'),'Passed Ball':t('捕逸'),'Balk':t('投手犯規'),
    'Game Advisory':t('比賽資訊'),'Pitching Substitution':t('更換投手'),'Offensive Substitution':t('進攻換人'),
    'Defensive Substitution':t('守備換人'),'Defensive Switch':t('守備位置調整')
  };
  return m[s] || s || '';
}

function zhPitchType(s){
  // 英文介面直接用 MLB 的英文原名。
  if(lang()==='en')return s||'';
  const m={
    '4-Seam Fastball':t('四縫線速球'),'Four-Seam Fastball':t('四縫線速球'),'Sinker':t('伸卡球'),
    'Slider':t('滑球'),'Sweeper':t('橫掃滑球'),'Changeup':t('變速球'),'Curveball':t('曲球'),
    'Knuckle Curve':t('指關節曲球'),'Cutter':t('卡特球'),'Split-Finger':t('指叉球'),
    'Splitter':t('指叉球'),'Knuckleball':t('蝴蝶球'),'Forkball':t('叉指球'),
    'Eephus':t('小便球'),'Slurve':t('滑曲球'),'Screwball':t('螺旋球')
  };
  return m[s] || s || '';
}

function zhPitchResult(s){
  // 英文介面直接用 MLB 的英文原名。
  if(lang()==='en')return s||'';
  const m={
    'Ball':t('壞球'),'Called Strike':t('主審判好球'),'Swinging Strike':t('揮棒落空'),
    'Swinging Strike (Blocked)':t('揮棒落空（捕手擋球）'),'Foul':t('界外球'),
    'Foul Tip':t('擦棒被捕'),'In play, no out':t('擊球進場，無出局'),
    'In play, out(s)':t('擊球進場，造成出局'),'In play, run(s)':t('擊球進場，帶有打點'),
    'Hit By Pitch':t('觸身球'),'Intent Ball':t('故意壞球'),'Pitchout':t('投球出框'),
    'Blocked Ball':t('捕手擋球'),'Foul Bunt':t('觸擊界外'),'Missed Bunt':t('觸擊落空')
  };
  return m[s] || s || '';
}

function zhDescription(text){
  if(!text) return '';
  if(lang()!=='zh')return String(text);
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
  if(!pitches.length){els.pitchSequence.innerHTML='<span class="subtitle">'+t('尚無投球')+'</span>';return}
  els.pitchSequence.innerHTML=pitches.map((e,i)=>`<span class="pitch-chip ${pitchResultClass(e)}" title="${esc(e.details?.description||e.details?.call?.description||'')}">${pitchLetter(e)}</span>`).join('');
}
function renderLastPitch(p){
  if(!p){els.lastPitchMain.textContent='--';els.lastPitchSub.textContent=t('等待投球資料');return}
  const type=zhPitchType(p.details?.type?.description||p.details?.type?.code||t('投球'));
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
    els.pitchData.textContent=t('目前沒有可顯示的投球座標。');
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
  els.pitchData.innerHTML=t('球種：{type}',{type:'<strong>'+esc(type)+'</strong>'})+'<br>'+t('球速：{speed}',{speed:'<strong>'+esc(speed)+'</strong>'})+'<br>'+t('轉速：{spin}',{spin:'<strong>'+esc(spin)+'</strong>'})+'<br>'+t('結果：{result}',{result:'<strong>'+esc(result)+'</strong>'});
}

// 統計已完成打席、逐球記錄與官方逐局資料，產生全部符合條件的本場焦點。
function buildHighlightItems(feed){
  const gd=feed.gameData||{},live=feed.liveData||{},plays=live.plays||{};
  const all=plays.allPlays||[];
  // 日文用片假名隊名（ドジャースが勝ち越し）；中文、英文沿用 MLB 隊名。
  const sideName=(team,fallback)=>(lang()==='ja'&&teamName(team))||team?.name||fallback;
  const awayName=sideName(gd.teams?.away,t('客隊'));
  const homeName=sideName(gd.teams?.home,t('主隊'));
  const awayTeamId=Number(gd.teams?.away?.id)||null;
  const homeTeamId=Number(gd.teams?.home?.id)||null;
  const batters=new Map(),pitchers=new Map(),errors={away:[],home:[]};
  const items=[],seen=new Set(),scoreChanges=[];
  let prevAway=0,prevHome=0,seq=0;
  const when=p=>inningHalfText(String(p.about?.inning??'-'),p.about?.halfInning);
  // half：'top' | 'bottom' | ''（整場型焦點），供畫面判斷上/下半局，不再搜尋文字。
  const add=(id,priority,icon,title,desc,meta,tone,order,inningSort=null,teamId=null,half='')=>{
    if(seen.has(id))return;
    seen.add(id);
    items.push({
      id,priority,icon,title,desc,meta:meta||'',tone:tone||'',
      order:order??seq,
      inningSort:Number.isFinite(Number(inningSort))?Number(inningSort):null,
      teamId:Number(teamId)||null,
      half:half==='top'||half==='bottom'?half:''
    });
  };
  const bFor=p=>{
    const id=p.matchup?.batter?.id, name=p.matchup?.batter?.fullName;
    if(!id&&!name)return null;
    const key=String(id||name);
    const teamId=p.about?.halfInning==='top'?awayTeamId:homeTeamId;
    if(!batters.has(key))batters.set(key,{key,name:name||t('打者'),teamId,hits:0,hr:0,rbi:0,single:0,double:0,triple:0,walks:0});
    else if(!batters.get(key).teamId)batters.get(key).teamId=teamId;
    return batters.get(key);
  };
  const pFor=p=>{
    const id=p.matchup?.pitcher?.id,name=p.matchup?.pitcher?.fullName;
    if(!id&&!name)return null;
    const key=String(id||name);
    const teamId=p.about?.halfInning==='top'?homeTeamId:awayTeamId;
    if(!pitchers.has(key))pitchers.set(key,{key,name:name||t('投手'),teamId,hrAllowed:0,strikeouts:0});
    else if(!pitchers.get(key).teamId)pitchers.get(key).teamId=teamId;
    return pitchers.get(key);
  };

  for(const p of all){
    const event=p.result?.event||'',etype=p.result?.eventType||'';
    if(!event&&!etype)continue;
    const n=seq++,b=bFor(p),pitcher=pFor(p);
    const id=String(p.atBatIndex??n);
    const inning=when(p),rbi=Math.max(0,Number(p.result?.rbi)||0);
    const half=p.about?.halfInning;
    const batterName=b?.name||t('打者');
    const pitcherName=pitcher?.name||t('投手');
    const offenseTeamId=p.about?.halfInning==='top'?awayTeamId:homeTeamId;
    const defenseTeamId=p.about?.halfInning==='top'?homeTeamId:awayTeamId;
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
      const hrType=rbi===4?t('滿貫砲'):rbi===3?t('三分砲'):rbi===2?t('兩分砲'):rbi===1?t('陽春砲'):t('全壘打');
      const hitEvent=(p.playEvents||[]).findLast?.(x=>x.hitData)||
        [...(p.playEvents||[])].reverse().find(x=>x.hitData);
      const dist=hitEvent?.hitData?.totalDistance;
      const speed=hitEvent?.hitData?.launchSpeed;
      const extra=[];
      if(Number.isFinite(Number(dist))&&Number(dist)>0)extra.push(t('{n} 呎',{n:Math.round(Number(dist))}));
      if(Number.isFinite(Number(speed))&&Number(speed)>0)extra.push(Number(speed).toFixed(1)+' mph');
      add('hr:'+id,84,'💣',t('{name} {type}',{name:batterName,type:hrType}),
        t('{batter} 從 {pitcher} 手中擊出{type}。',{batter:batterName,pitcher:pitcherName,type:hrType})+(extra.length?t('擊球資訊：{info}。',{info:extra.join(t('、'))}):''),
        inning,'hot',n,p.about?.inning,offenseTeamId,half);
    }
    if(pitcher&&(event==='Strikeout'||etype.startsWith('strikeout')))pitcher.strikeouts++;
    const isError=event==='Field Error'||etype==='field_error'||/\b(fielding|throwing) error\b/i.test(p.result?.description||'');
    if(isError){
      const defending=p.about?.halfInning==='top'?'home':'away';
      errors[defending].push({id,inning,n});
      const team=defending==='home'?homeName:awayName;
      add('error:'+id,79,'⚠️',t('{team} 發生守備失誤',{team}),
        t('{inning}，{team} 出現守備失誤，讓攻方有機會延續進攻。',{inning,team}),inning,'warn',n,p.about?.inning,defenseTeamId,half);
    }
    if(rbi>=2&&!isHR){
      add('multiRbi:'+id,69,'⚡',t('{name} 單次貢獻 {rbi} 打點',{name:batterName,rbi}),
        t('{name} 在{inning}的一次攻勢中送回 {rbi} 分。',{name:batterName,inning,rbi}),inning,'good',n,p.about?.inning,offenseTeamId,half);
    }
    const isDP=/double.play|grounded.into.dp/i.test(event+' '+etype);
    if(isDP){
      const fielding=p.about?.halfInning==='top'?homeName:awayName;
      add('dp:'+id,53,'🧤',t('{team} 策動雙殺',{team:fielding}),
        t('{inning}，{team}完成雙殺守備，迅速拿下兩個出局數。',{inning,team:fielding}),inning,'good',n,p.about?.inning,defenseTeamId,half);
    }

    // 盜壘資訊多半位於跑者紀錄，不能只靠打席 event。
    const steals=new Set();
    for(const runner of p.runners||[]){
      const details=runner.details||{};
      const action=details.event||'';
      if(/stolen.base/i.test(action)){
        const name=details.runner?.fullName||t('跑者');
        const target=runner.movement?.end||'';
        steals.add(name+'|'+target);
      }
    }
    if(/stolen.base/i.test(event+' '+etype)&&!steals.size){
      steals.add(batterName+'|');
    }
    for(const steal of steals){
      const parts=steal.split('|');
      add('steal:'+id+':'+steal,59,'🏃',t('{name} 盜壘成功',{name:parts[0]}),
        parts[1]?t('{inning}，{name}完成盜壘，抵達{base}。',{inning,name:parts[0],base:({ '2B':t('二壘'),'3B':t('三壘'),score:t('本壘')}[parts[1]]||parts[1])}):t('{inning}，{name}完成盜壘。',{inning,name:parts[0]}),inning,'good',n,p.about?.inning,offenseTeamId,half);
    }

    const awRaw=Number(p.result?.awayScore),hmRaw=Number(p.result?.homeScore);
    const aw=Number.isFinite(awRaw)?awRaw:prevAway;
    const hm=Number.isFinite(hmRaw)?hmRaw:prevHome;
    if(aw!==prevAway||hm!==prevHome){
      const before=Math.sign(prevAway-prevHome),after=Math.sign(aw-hm);
      scoreChanges.push({aw,hm,prevAway,prevHome,inning:p.about?.inning,half:p.about?.halfInning,id,n});
      if(before!==0&&after===0){
        add('tie:'+id,96,'⚖️',t('{team} 追平比賽',{team:nameForScore}),
          t('{inning}，{team}將比分追成 {away}：{home}。',{inning,team:nameForScore,away:aw,home:hm}),inning,'hot',n,p.about?.inning,offenseTeamId,half);
      }else if(before!==after&&after!==0){
        const leader=after>0?awayName:homeName;
        const leaderTeamId=after>0?awayTeamId:homeTeamId;
        const reversed=before!==0&&before!==after;
        const vars={inning,team:leader,away:aw,home:hm};
        add('lead:'+id,reversed?100:80,reversed?'🔄':'⬆️',reversed?t('{team} 逆轉超前',vars):t('{team} 取得領先',vars),
          reversed?t('{inning}，{team}完成逆轉，比分 {away}：{home}。',vars):t('{inning}，{team}取得領先，比分 {away}：{home}。',vars),inning,reversed?'hot':'good',n,p.about?.inning,leaderTeamId,half);
      }
      if(!isHR&&rbi<2){
        const eventZh=zhEventName(event)||t('得分攻勢');
        add('score:'+id,61,'🏟️',t('{team} 再添分數',{team:nameForScore}),
          b?.name?t('{inning}，{name} {event}，比分來到 {away}：{home}。',{inning,name:b.name,event:eventZh,away:aw,home:hm}):t('{inning}，比分來到 {away}：{home}。',{inning,away:aw,home:hm}),inning,'',n,p.about?.inning,offenseTeamId,half);
      }
    }
    prevAway=aw;prevHome=hm;
  }

  for(const b of batters.values()){
    if(b.hr>=2){
      const word=b.hr===2?t('雙響砲'):b.hr===3?t('三響砲'):t('{n}響砲',{n:b.hr});
      add('hitterMultiHR:'+b.key,105,'🔥',t('{name} {type}',{name:b.name,type:word}),
        t('{name} 本場已敲出 {hr} 支全壘打，累計 {rbi} 分打點。',{name:b.name,hr:b.hr,rbi:b.rbi}),t('多轟里程碑'),'hot',undefined,null,b.teamId);
    }
    if(b.single&&b.double&&b.triple&&b.hr){
      add('cycle:'+b.key,115,'🏆',t('{name} 完成完全打擊',{name:b.name}),
        t('{name} 本場集齊一壘安打、二壘安打、三壘安打與全壘打。',{name:b.name}),t('完全打擊'),'hot',undefined,null,b.teamId);
    }
    if(b.hits>=3){
      add('hitMilestone:'+b.key,b.hits>=4?93:76,'🎯',t('{name} 單場 {hits} 安',{name:b.name,hits:b.hits}),
        b.hr?t('{name} 今天已敲出 {hits} 支安打，其中包含 {hr} 支全壘打。',{name:b.name,hits:b.hits,hr:b.hr}):t('{name} 今天已敲出 {hits} 支安打。',{name:b.name,hits:b.hits}),t('打擊表現'),'good',undefined,null,b.teamId);
    }
    if(b.rbi>=3){
      add('rbiMilestone:'+b.key,b.rbi>=5?98:85,'⚡',t('{name} 單場 {rbi} 打點',{name:b.name,rbi:b.rbi}),
        t('{name} 本場累計貢獻 {rbi} 分打點。',{name:b.name,rbi:b.rbi}),t('打點表現'),'good',undefined,null,b.teamId);
    }
  }
  for(const p of pitchers.values()){
    if(p.hrAllowed>=2){
      add('pitcherHR:'+p.key,p.hrAllowed>=3?94:82,'📉',t('{name} 挨了 {n} 轟',{name:p.name,n:p.hrAllowed}),
        t('{name} 本場已被對手擊出 {n} 支全壘打。',{name:p.name,n:p.hrAllowed}),t('投手挨轟'),'warn',undefined,null,p.teamId);
    }
    if(p.strikeouts>=5){
      add('pitcherK:'+p.key,p.strikeouts>=10?99:p.strikeouts>=8?88:68,'⚾',
        t('{name} 累計 {n} 次三振',{name:p.name,n:p.strikeouts}),
        t('{name} 本場已送出 {n} 次三振。',{name:p.name,n:p.strikeouts}),t('投手壓制力'),'good',undefined,null,p.teamId);
    }
  }

  // 官方逐局統計適合找出單局大量得分的情況。
  for(const inn of live.linescore?.innings||[]){
    for(const side of ['away','home']){
      const runs=Number(inn?.[side]?.runs);
      if(Number.isFinite(runs)&&runs>=3){
        const name=side==='away'?awayName:homeName;
        const half=side==='away'?'top':'bottom';
        add('bigInning:'+side+':'+inn.num,91,'🚨',t('{team} 單局攻下 {runs} 分',{team:name,runs}),
          t('{inning}，{team}單局灌進 {runs} 分。',{inning:inningHalfText(String(inn.num),half),team:name,runs}),t('單局攻勢'),'hot',seq,inn.num,side==='away'?awayTeamId:homeTeamId,half);
      }
    }
  }
  for(const side of ['away','home']){
    const official=Number(live.linescore?.teams?.[side]?.errors);
    const count=Number.isFinite(official)?official:errors[side].length;
    if(count>=2){
      const team=side==='away'?awayName:homeName;
      add('errorTotal:'+side,89,'⚠️',t('{team} 累計 {n} 次失誤',{team,n:count}),
        t('{team} 本場已有 {n} 次守備失誤。',{team,n:count}),t('守備狀態'),'warn',undefined,null,side==='away'?awayTeamId:homeTeamId);
    }
  }
  // 最後半局的致勝分：僅在 MLB 標示比賽結束時判斷。
  const isFinal=gd.status?.abstractGameState==='Final';
  const last=scoreChanges.at(-1);
  if(isFinal&&last&&last.half==='bottom'&&Number(last.inning)>=9&&
     last.hm>last.aw&&last.prevHome<=last.prevAway){
    add('walkoff',110,'🎉',t('{team} 再見勝利',{team:homeName}),
      t('{inning}，{team}攻下致勝分，以 {home}：{away} 結束比賽。',{inning:inningHalfText(String(last.inning),'bottom'),team:homeName,home:last.hm,away:last.aw}),t('再見時刻'),'hot',last.n,last.inning,homeTeamId,last.half);
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

function highlightVisual(item,className){
  if(item?.teamId){
    return '<span class="'+className+' highlight-team-logo-shell" aria-hidden="true">'+
      '<img class="highlight-team-logo" src="'+esc(teamLogo(item.teamId))+'" alt="" />'+
    '</span>';
  }
  return '<span class="'+className+'" aria-hidden="true">'+esc(item?.icon||'⚾')+'</span>';
}

// React owns focus rotation and expanded state; engine only computes event data.
function syncHighlights(){bridge.publish({highlights:state.highlights,highlightGamePk:state.highlightGamePk})}
function renderHighlights(feed){
  state.highlightGamePk=feed.gameData?.game?.pk??state.selectedGamePk;
  state.highlights=buildHighlightItems(feed);
  syncHighlights();
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
  if(!players.length)return '<div class="boxscore-empty">'+t('尚無打擊紀錄')+'</div>';
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
    '<thead><tr><th>'+t('打者')+'</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>BB</th><th>SO</th><th>HR</th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table></div>';
}
function boxPitchingTable(box){
  const players=boxPitchers(box);
  if(!players.length)return '<div class="boxscore-empty">'+t('尚無投球紀錄')+'</div>';
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
    '<thead><tr><th>'+t('投手')+'</th><th>IP</th><th>H</th><th>R</th><th>ER</th><th>BB</th><th>K</th><th>HR</th><th>P</th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table></div>';
}
function boxTeamHTML(team,box){
  return '<section class="boxscore-team">'+
    '<div class="boxscore-team-head"><img src="'+esc(teamLogo(team?.id))+'" alt=""><span>'+esc(team?.name||t('球隊'))+'</span></div>'+
    '<div class="boxscore-group"><div class="boxscore-group-title">'+t('打者')+'</div>'+boxBattingTable(box)+'</div>'+
    '<div class="boxscore-group"><div class="boxscore-group-title">'+t('投手')+'</div>'+boxPitchingTable(box)+'</div>'+
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
    ['runs',t('得分')],
    ['hits',t('安打')],
    ['errors',t('失誤')],
    ['homeRuns',t('全壘打')],
    ['walks',t('保送')],
    ['strikeOuts',t('三振')],
    ['leftOnBase',t('殘壘')]
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
    els.teamStatsBoard.textContent=t('目前沒有隊伍統計資料');
    els.boxScoreBoard.className='boxscore-empty';
    els.boxScoreBoard.textContent=t('目前沒有 Box Score 資料');
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
  head+='<th>'+t('得分')+'</th><th>'+t('安打')+'</th><th>'+t('失誤')+'</th></tr>';
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
  const all=plays.allPlays||[];
  const scoring=(plays.scoringPlays||[])
    .map(i=>all[i])
    .filter(Boolean)
    .reverse();
  if(!scoring.length){els.scoringEvents.className='empty';els.scoringEvents.textContent=t('尚無得分紀錄');return}
  els.scoringEvents.className='';els.scoringEvents.innerHTML=scoring.map(p=>eventHTML(p,true)).join('');
}
function renderRecentPlays(plays,teams={},gamePk=state.selectedGamePk){
  const all=(plays.allPlays||[]).slice(-8).reverse();
  if(!all.length){els.recentEvents.className='empty';els.recentEvents.textContent=t('尚無打席紀錄');return}
  const groups=new Map();
  for(const play of all){
    const inning=play.about?.inning??'-';
    const half=play.about?.halfInning;
    const side=half==='top'?'away':half==='bottom'?'home':null;
    const key=String(inning)+'-'+(side||'unknown');
    if(!groups.has(key))groups.set(key,{inning,half,side,plays:[]});
    groups.get(key).plays.push(play);
  }
  els.recentEvents.className='recent-halves';
  els.recentEvents.innerHTML=[...groups].map(([key,group])=>{
    const team=teams[group.side]||{};
    const name=team.name||team.teamName||(group.side==='away'?t('客隊'):group.side==='home'?t('主隊'):t('球隊未定'));
    const label=inningHalfText(group.inning,group.half,true);
    const logo=team.id?'<span class="recent-half-logo"><img src="'+esc(teamLogo(team.id))+'" alt="" loading="lazy"></span>':'';
    return '<section class="recent-half">'+
      '<div class="recent-half-head">'+logo+
        '<span class="recent-half-team">'+esc(name)+'</span>'+
        '<span class="recent-half-inning">'+esc(label)+'</span>'+
      '</div>'+
      '<div class="recent-half-plays">'+group.plays.map(p=>eventHTML(p,false)).join('')+'</div>'+
    '</section>';
  }).join('');
}
// 只回傳中文片段（summary.js 仍在使用）；顯示「N 局上/下」請改用 inningHalfText()。
function zhHalfInning(v){
  return v==='top'?'上':v==='bottom'?'下':'';
}

function buildBroadcastText(play){
  const batter=play.matchup?.batter?.fullName||t('打者');
  const event=zhEventName(play.result?.event||'');
  const rbi=Number(play.result?.rbi||0);
  const runners=(play.runners||[])
    .filter(r=>r?.movement?.end==='score')
    .map(r=>r?.details?.runner?.fullName)
    .filter(Boolean);

  let text=t('{batter} {event}',{batter,event:event || t('完成本次打席')});

  if(rbi>0){
    text+=t('，{rbi} 分打點',{rbi});
  }

  if(runners.length){
    text+=t('；{names} 回本壘得分',{names:runners.join(t('、'))});
  }

  const outs=play.count?.outs;
  if(typeof outs==='number'){
    text+=t('。目前 {outs} 出局',{outs});
  }

  return text;
}

function eventHTML(play,showScore){
  const inning=inningHalfText(play.about?.inning??'-',play.about?.halfInning);
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

/* 通知直達：先以比賽 ID 取得真正開賽時間，再換算使用者當地日期。 */
async function loadInitialGame(){
  if(state.loading)return;
  const url=new URL(location.href);
  const raw=url.searchParams.get('gamePk');
  if(raw===null)return loadSchedule(false);
  const gamePk=/^[1-9]\d*$/.test(raw)?Number(raw):NaN;
  if(!Number.isSafeInteger(gamePk)){
    await loadSchedule(false);
    showError(t('通知的比賽編號無效'));
    return;
  }
  state.notificationGamePending=true;
  state.loading=true;
  try{
    const feed=await getJSON(API+'/v1.1/game/'+gamePk+'/feed/live');
    const actualPk=Number(feed?.gamePk??feed?.gameData?.game?.pk);
    if(actualPk!==gamePk)throw new Error(t('通知的比賽資料不符'));
    const gameDate=feed?.gameData?.datetime?.dateTime;
    const date=gameLocalDateKey({gameDate});
    if(!date)throw new Error(t('無法取得這場比賽的開賽日期'));
    els.dateInput.value=date;
    state.selectedGamePk=gamePk;
    state.currentFeed=feed;
    state.currentFeedGamePk=gamePk;
    renderGame(feed);
    markUpdated(true,feed.gameData?.status?.abstractGameState==='Live');
    state.loading=false;
    if(!await loadSchedule(true,gamePk))return;
    // 通知路由只消費一次，避免後續手動切換後重新整理又跳回舊場次。
    clearNotificationRoute();
  }catch(error){
    showError(t('無法開啟通知比賽：{error}',{error:error?.message||String(error)}));
    markUpdated(false,false);
  }finally{
    state.loading=false;
  }
}

function clearNotificationRoute(){
  state.notificationGamePending=false;
  const url=new URL(location.href);
  url.searchParams.delete('gamePk');
  url.searchParams.delete('gameDate');
  history.replaceState(null,'',url.toString());
}

