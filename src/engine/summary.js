/* MLB Live Scoreboard - summary.js
   賽後摘要：終場比分、系列賽戰況、勝敗投、致勝一擊、全壘打、本場之星與比賽資訊。
   資料全部來自 MLB 官方 live feed 與 schedule（seriesStatus）。 */

let gameSummaryKey='';

function summaryPlayer(box,id){
  for(const side of ['away','home']){
    const player=box?.teams?.[side]?.players?.['ID'+id];
    if(player)return {player,side};
  }
  return null;
}

function summaryPitchingLine(stats){
  const s=stats||{};
  const parts=[];
  if(s.inningsPitched!=null)parts.push(`${s.inningsPitched} 局`);
  if(s.hits!=null)parts.push(`${s.hits} 安`);
  if(s.earnedRuns!=null)parts.push(`${s.earnedRuns} 自責分`);
  if(s.strikeOuts!=null)parts.push(`${s.strikeOuts} 三振`);
  return parts.join(' ');
}

function summaryBattingLine(stats){
  const s=stats||{};
  const parts=[`${s.atBats??0} 打數 ${s.hits??0} 安打`];
  if(s.homeRuns)parts.push(`${s.homeRuns} 全壘打`);
  if(s.rbi)parts.push(`${s.rbi} 打點`);
  if(s.runs)parts.push(`${s.runs} 得分`);
  if(s.baseOnBalls)parts.push(`${s.baseOnBalls} 保送`);
  return parts.join(' · ');
}

function summaryHalf(play){
  return `${play?.about?.inning??'-'} 局${zhHalfInning(play?.about?.halfInning)}`;
}

function summaryHomeRunName(rbi){
  return ({1:'陽春全壘打',2:'兩分砲',3:'三分砲',4:'滿貫砲'})[Number(rbi)]||'全壘打';
}

// 最後一次讓勝隊從「沒有領先」變成「領先」的得分打席，就是致勝一擊。
function summaryGoAheadPlay(plays,winner){
  const all=plays?.allPlays||[];
  const scoring=(plays?.scoringPlays||[]).map(i=>all[i]).filter(Boolean);
  let away=0,home=0,found=null;
  for(const play of scoring){
    const nextAway=Number(play.result?.awayScore??away),nextHome=Number(play.result?.homeScore??home);
    const before=winner==='away'?away>home:home>away;
    const after=winner==='away'?nextAway>nextHome:nextHome>nextAway;
    if(!before&&after)found=play;
    away=nextAway;home=nextHome;
  }
  return found;
}

function summarySeriesText(gameType,status){
  if(!status||!Number.isFinite(Number(status.wins)))return '';
  const wins=Number(status.wins),losses=Number(status.losses);
  if(status.isTied)return `系列賽 ${wins}–${losses} 平手`;
  const leader=status.winningTeam?teamZhName(status.winningTeam):'';
  if(!leader)return '';
  if(status.isOver){
    if(gameType==='W')return `${leader} ${wins}–${losses} 奪下世界大賽冠軍`;
    const round=({F:'外卡系列賽',D:'分區賽',L:'冠軍賽'})[gameType]||'系列賽';
    return `${leader} ${wins}–${losses} 贏得${round}`;
  }
  return `${leader} 系列賽 ${wins}–${losses} 領先`;
}

function summaryFacts(feed){
  const info=feed?.liveData?.boxscore?.info||[];
  const value=label=>String(info.find(item=>item?.label===label)?.value||'').replace(/\.$/,'').trim();
  const venue=feed?.gameData?.venue?.name||value('Venue');
  const facts=[];
  if(value('T'))facts.push(`比賽時間 ${value('T')}`);
  if(value('Att'))facts.push(`觀眾 ${value('Att')} 人`);
  if(venue)facts.push(venue);
  return facts;
}

function buildGameSummaryHTML(feed){
  const gd=feed?.gameData||{},live=feed?.liveData||{},ls=live.linescore||{},status=gd.status||{};
  const away=gd.teams?.away||{},home=gd.teams?.home||{};
  const detailed=String(status.detailedState||'');
  const coded=String(status.codedGameState||'').toUpperCase();
  if(coded==='D'||coded==='C'||/postponed|cancel/i.test(detailed)){
    return `<div class="game-summary-empty">這場比賽已${/cancel/i.test(detailed)||coded==='C'?'取消':'延賽'}，沒有賽後摘要。</div>`;
  }
  const final=/final|game over|completed/i.test(`${status.abstractGameState||''} ${detailed}`);
  if(!final){
    const live=status.abstractGameState==='Live';
    const now=live?`比賽進行中（${inningLabel(ls)}），目前 ${teamZhName(away)} ${ls.teams?.away?.runs??0} : ${ls.teams?.home?.runs??0} ${teamZhName(home)}。`:'比賽尚未開始。';
    return `<div class="game-summary-empty"><b>${esc(now)}</b><span>終場後會在這裡整理賽後摘要：勝敗投、致勝一擊、全壘打與本場之星。</span></div>`;
  }

  const awayRuns=Number(ls.teams?.away?.runs??0),homeRuns=Number(ls.teams?.home?.runs??0);
  const winner=awayRuns>homeRuns?'away':homeRuns>awayRuns?'home':null;
  const innings=(ls.innings||[]).length;
  const scheduleGame=state.games.find(g=>Number(g.gamePk)===Number(gd.game?.pk??feed?.gamePk));
  const seriesText=summarySeriesText(gd.game?.type,scheduleGame?.seriesStatus);
  const box=live.boxscore||{};
  const teamBlock=(team,side,runs)=>`<div class="summary-team${winner===side?' win':''}">
      <span class="summary-logo">${team.id?`<img src="${esc(teamLogo(team.id))}" alt="">`:''}</span>
      <b>${esc(teamZhName(team))}</b><small>${side==='away'?'客隊':'主隊'}</small>
    </div>`;

  let html=`<div class="summary-head"><span class="summary-eyebrow">賽後摘要</span>${seriesText?`<span class="summary-series">${esc(seriesText)}</span>`:''}</div>
  <div class="summary-score">
    ${teamBlock(away,'away',awayRuns)}
    <div class="summary-final"><strong>${awayRuns} : ${homeRuns}</strong><small>終場${innings>9?` · 延長 ${innings} 局`:''}</small></div>
    ${teamBlock(home,'home',homeRuns)}
  </div>`;

  const decisions=live.decisions||{};
  const decisionRows=[['winner','勝投','win'],['loser','敗投','loss'],['save','救援','save']].map(([key,label,tone])=>{
    const person=decisions[key];
    if(!person?.id)return '';
    const found=summaryPlayer(box,person.id);
    const stats=found?.player?.stats?.pitching;
    const record=String(stats?.note||'').match(/(\d+-\d+)/)?.[1];
    const team=found?gd.teams?.[found.side]:null;
    return `<li><span class="summary-tag ${tone}">${label}</span><b>${esc(person.fullName||found?.player?.person?.fullName||'')}${record?`<em>（${esc(record)}）</em>`:''}</b><small>${esc([team?teamZhName(team):'',summaryPitchingLine(stats)].filter(Boolean).join(' · '))}</small></li>`;
  }).join('');
  if(decisionRows)html+=`<section class="summary-block"><h3>勝敗投</h3><ul class="summary-list">${decisionRows}</ul></section>`;

  const goAhead=winner?summaryGoAheadPlay(live.plays,winner):null;
  if(goAhead){
    const batter=goAhead.matchup?.batter?.fullName||'';
    const event=zhEventName(goAhead.result?.event)||goAhead.result?.event||'';
    const rbi=Number(goAhead.result?.rbi)||0;
    html+=`<section class="summary-block"><h3>致勝一擊</h3><p class="summary-key">${esc(`${batter} ${event}${rbi?`，${rbi} 分打點`:''}`)}<small>${esc(`${summaryHalf(goAhead)} · 比分 ${goAhead.result?.awayScore??'-'} : ${goAhead.result?.homeScore??'-'}`)}</small></p></section>`;
  }

  const homers=(live.plays?.allPlays||[]).filter(play=>play.result?.eventType==='home_run');
  html+=`<section class="summary-block"><h3>全壘打</h3>${homers.length?`<ul class="summary-list">${homers.map(play=>{
    const team=play.about?.halfInning==='top'?away:home;
    return `<li><span class="summary-mini-logo">${team.id?`<img src="${esc(teamLogo(team.id))}" alt="">`:''}</span><b>${esc(play.matchup?.batter?.fullName||'')}</b><small>${esc(`${summaryHalf(play)} · ${summaryHomeRunName(play.result?.rbi)}`)}</small></li>`;
  }).join('')}</ul>`:'<p class="summary-none">本場沒有全壘打</p>'}</section>`;

  const performers=(box.topPerformers||[]).filter(item=>item?.player?.person?.id);
  if(performers.length){
    html+=`<section class="summary-block"><h3>本場之星</h3><ul class="summary-list">${performers.map(item=>{
      const found=summaryPlayer(box,item.player.person.id);
      const team=found?gd.teams?.[found.side]:null;
      const stats=found?.player?.stats||item.player.stats||{};
      const pitcher=item.type==='starter'||item.type==='reliever'||item.type==='pitcher';
      return `<li><span class="summary-mini-logo">${team?.id?`<img src="${esc(teamLogo(team.id))}" alt="">`:''}</span><b>${esc(item.player.person.fullName)}</b><small>${esc(pitcher?summaryPitchingLine(stats.pitching):summaryBattingLine(stats.batting))}</small></li>`;
    }).join('')}</ul></section>`;
  }

  const facts=summaryFacts(feed);
  if(facts.length)html+=`<p class="summary-facts">${facts.map(esc).join(' · ')}</p>`;
  return html;
}

function renderGameSummary(feed){
  if(!els.gameSummary)return;
  const html=buildGameSummaryHTML(feed);
  // 內容不變時不重建 DOM，避免每 5 秒刷新時畫面跳動。
  if(html===gameSummaryKey)return;
  gameSummaryKey=html;
  els.gameSummary.innerHTML=html;
}
