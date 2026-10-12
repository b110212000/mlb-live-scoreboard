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
  if(s.inningsPitched!=null)parts.push(t('{ip} 局',{ip:s.inningsPitched}));
  if(s.hits!=null)parts.push(t('{n} 安',{n:s.hits}));
  if(s.earnedRuns!=null)parts.push(t('{n} 自責分',{n:s.earnedRuns}));
  if(s.strikeOuts!=null)parts.push(t('{n} 三振',{n:s.strikeOuts}));
  return parts.join(' ');
}

function summaryBattingLine(stats){
  const s=stats||{};
  const parts=[t('{ab} 打數 {h} 安打',{ab:s.atBats??0,h:s.hits??0})];
  if(s.homeRuns)parts.push(t('{n} 全壘打',{n:s.homeRuns}));
  if(s.rbi)parts.push(t('{n} 打點',{n:s.rbi}));
  if(s.runs)parts.push(t('{n} 得分',{n:s.runs}));
  if(s.baseOnBalls)parts.push(t('{n} 保送',{n:s.baseOnBalls}));
  return parts.join(' · ');
}

function summaryHalf(play){
  const n=play?.about?.inning??'-',half=play?.about?.halfInning;
  return half==='top'?t('{n} 局上',{n}):half==='bottom'?t('{n} 局下',{n}):t('{n} 局',{n});
}

function summaryHomeRunName(rbi){
  return ({1:t('陽春全壘打'),2:t('兩分砲'),3:t('三分砲'),4:t('滿貫砲')})[Number(rbi)]||t('全壘打');
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
  if(status.isTied)return t('系列賽 {wins}–{losses} 平手',{wins,losses});
  const leader=status.winningTeam?teamZhName(status.winningTeam):'';
  if(!leader)return '';
  if(status.isOver){
    if(gameType==='W')return t('{team} {wins}–{losses} 奪下世界大賽冠軍',{team:leader,wins,losses});
    const round=({F:t('外卡系列賽'),D:t('分區賽'),L:t('冠軍賽')})[gameType]||t('系列賽');
    return t('{team} {wins}–{losses} 贏得{round}',{team:leader,wins,losses,round});
  }
  return t('{team} 系列賽 {wins}–{losses} 領先',{team:leader,wins,losses});
}

function summaryFacts(feed){
  const info=feed?.liveData?.boxscore?.info||[];
  const value=label=>String(info.find(item=>item?.label===label)?.value||'').replace(/\.$/,'').trim();
  const venue=feed?.gameData?.venue?.name||value('Venue');
  const facts=[];
  if(value('T'))facts.push(t('比賽時間 {time}',{time:value('T')}));
  if(value('Att'))facts.push(t('觀眾 {n} 人',{n:value('Att')}));
  if(venue)facts.push(venue);
  return facts;
}

function buildGameSummaryHTML(feed){
  const gd=feed?.gameData||{},live=feed?.liveData||{},ls=live.linescore||{},status=gd.status||{};
  const away=gd.teams?.away||{},home=gd.teams?.home||{};
  const detailed=String(status.detailedState||'');
  const coded=String(status.codedGameState||'').toUpperCase();
  if(coded==='D'||coded==='C'||/postponed|cancel/i.test(detailed)){
    return `<div class="game-summary-empty">${/cancel/i.test(detailed)||coded==='C'?t('這場比賽已取消，沒有賽後摘要。'):t('這場比賽已延賽，沒有賽後摘要。')}</div>`;
  }
  const final=/final|game over|completed/i.test(`${status.abstractGameState||''} ${detailed}`);
  if(!final){
    const live=status.abstractGameState==='Live';
    const now=live?t('比賽進行中（{inning}），目前 {away} {awayRuns} : {homeRuns} {home}。',{inning:inningLabel(ls),away:teamZhName(away),awayRuns:ls.teams?.away?.runs??0,homeRuns:ls.teams?.home?.runs??0,home:teamZhName(home)}):t('比賽尚未開始。');
    return `<div class="game-summary-empty"><b>${esc(now)}</b><span>${t('終場後會在這裡整理賽後摘要：勝敗投、致勝一擊、全壘打與本場之星。')}</span></div>`;
  }

  const awayRuns=Number(ls.teams?.away?.runs??0),homeRuns=Number(ls.teams?.home?.runs??0);
  const winner=awayRuns>homeRuns?'away':homeRuns>awayRuns?'home':null;
  const innings=(ls.innings||[]).length;
  const scheduleGame=state.games.find(g=>Number(g.gamePk)===Number(gd.game?.pk??feed?.gamePk));
  const seriesText=summarySeriesText(gd.game?.type,scheduleGame?.seriesStatus);
  const box=live.boxscore||{};
  const teamBlock=(team,side,runs)=>`<div class="summary-team${winner===side?' win':''}">
      <span class="summary-logo">${team.id?`<img src="${esc(teamLogo(team.id))}" alt="">`:''}</span>
      <b>${esc(teamZhName(team))}</b><small>${side==='away'?t('客隊'):t('主隊')}</small>
    </div>`;

  let html=`<div class="summary-head"><span class="summary-eyebrow">${t('賽後摘要')}</span>${seriesText?`<span class="summary-series">${esc(seriesText)}</span>`:''}</div>
  <div class="summary-score">
    ${teamBlock(away,'away',awayRuns)}
    <div class="summary-final"><strong>${awayRuns} : ${homeRuns}</strong><small>${t('終場')}${innings>9?` · ${t('延長 {n} 局',{n:innings})}`:''}</small></div>
    ${teamBlock(home,'home',homeRuns)}
  </div>`;
  const record=side=>{
    const r=scheduleGame?.teams?.[side]?.leagueRecord;
    return r&&Number.isFinite(Number(r.wins))?`${teamZhName(side==='away'?away:home)} ${r.wins}–${r.losses}`:'';
  };
  if(gd.game?.type==='R'&&(record('away')||record('home'))){
    html+=`<p class="summary-records">${t('本季戰績：{records}',{records:esc([record('away'),record('home')].filter(Boolean).join(' · '))})}</p>`;
  }

  const decisions=live.decisions||{};
  const decisionRows=[['winner',t('勝投'),'win'],['loser',t('敗投'),'loss'],['save',t('救援'),'save']].map(([key,label,tone])=>{
    const person=decisions[key];
    if(!person?.id)return '';
    const found=summaryPlayer(box,person.id);
    const stats=found?.player?.stats?.pitching;
    const record=String(stats?.note||'').match(/(\d+-\d+)/)?.[1];
    const team=found?gd.teams?.[found.side]:null;
    return `<li><span class="summary-tag ${tone}">${label}</span><b>${esc(person.fullName||found?.player?.person?.fullName||'')}${record?`<em>${t('（{record}）',{record:esc(record)})}</em>`:''}</b><small>${esc([team?teamZhName(team):'',summaryPitchingLine(stats)].filter(Boolean).join(' · '))}</small></li>`;
  }).join('');
  if(decisionRows)html+=`<section class="summary-block"><h3>${t('勝敗投')}</h3><ul class="summary-list">${decisionRows}</ul></section>`;

  const goAhead=winner?summaryGoAheadPlay(live.plays,winner):null;
  if(goAhead){
    const batter=goAhead.matchup?.batter?.fullName||'';
    const event=zhEventName(goAhead.result?.event)||goAhead.result?.event||'';
    const rbi=Number(goAhead.result?.rbi)||0;
    html+=`<section class="summary-block"><h3>${t('致勝一擊')}</h3><p class="summary-key">${esc(rbi?t('{batter} {event}，{rbi} 分打點',{batter,event,rbi}):`${batter} ${event}`)}<small>${esc(`${summaryHalf(goAhead)} · ${t('比分 {away} : {home}',{away:goAhead.result?.awayScore??'-',home:goAhead.result?.homeScore??'-'})}`)}</small></p></section>`;
  }

  const homers=(live.plays?.allPlays||[]).filter(play=>play.result?.eventType==='home_run');
  html+=`<section class="summary-block"><h3>${t('全壘打')}</h3>${homers.length?`<ul class="summary-list">${homers.map(play=>{
    const team=play.about?.halfInning==='top'?away:home;
    return `<li><span class="summary-mini-logo">${team.id?`<img src="${esc(teamLogo(team.id))}" alt="">`:''}</span><b>${esc(play.matchup?.batter?.fullName||'')}</b><small>${esc(`${summaryHalf(play)} · ${summaryHomeRunName(play.result?.rbi)}`)}</small></li>`;
  }).join('')}</ul>`:'<p class="summary-none">'+t('本場沒有全壘打')+'</p>'}</section>`;

  const performers=(box.topPerformers||[]).filter(item=>item?.player?.person?.id);
  if(performers.length){
    html+=`<section class="summary-block"><h3>${t('本場之星')}</h3><ul class="summary-list">${performers.map(item=>{
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
