/* MLB Live Scoreboard - roster.js
   對戰名單、球員賽季數據、先發與牛棚負荷。 */

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
