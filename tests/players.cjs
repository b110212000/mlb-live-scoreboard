const assert=require('assert/strict');

(async()=>{
  const p=await import('../src/players.js');
  const i18n=await import('../src/i18n.js');
  i18n.setLangPref('zh');

  // 舊隊名保留英文，暱稱相同才用中文隊名；非大聯盟球隊用原名。
  for(const [team,expected] of [
    [{id:142,name:'Washington Senators'},'Washington Senators'],
    [{id:142,name:'Minnesota Twins'},'雙城'],
    [{id:119,name:'Brooklyn Dodgers'},'道奇'],
    [{id:111,name:'Boston Red Sox'},'紅襪'],
    [{id:145,name:'Chicago White Sox'},'白襪'],
    [{id:114,name:'Cleveland Indians'},'Cleveland Indians'],
    [{id:133,name:'Oakland Athletics'},'運動家'],
    [{id:139,name:'Tampa Bay Devil Rays'},'光芒'],
    [{id:144,name:'Boston Braves'},'勇士'],
    [{id:136},'水手'],
    [{id:400,name:'Las Vegas Aviators'},'Las Vegas Aviators'],
  ])assert.equal(p.teamDisplayName(team),expected,team.name);

  // 主要獎項依 MLB 獎項 id 對照：排除小聯盟、聯盟外與球隊獎項；退休背號依球隊。
  const awards=p.majorAwards([
    {id:'ALAS',name:'AL All-Star',season:'2002'},{id:'ALAS',name:'AL All-Star',season:'2001'},{id:'ALAS',name:'AL All-Star',season:'2001'},
    {id:'ALMVP',name:'AL MVP',season:'2001'},{id:'ASMVP',name:'Ted Williams All-Star MVP',season:'2007'},
    {id:'MLBHOF',name:'Hall Of Fame',season:'2025'},{id:'RETIREDUNI_136',name:'Uniform number retired',season:'2025'},
    {id:'RETIREDUNI_9999',name:'Uniform number retired',season:'2025'},
    {id:'TLMSAS',name:'TEX Mid-Season All-Star',season:'2000'},{id:'AFLHOF',name:'AFL Hall of Fame Member',season:'2010'},
    {id:'ILROY',name:'INT Rookie of the Year',season:'2000'},{id:'SEAMVP',name:'Mariners MVP',season:'2001'},
    {id:'MLBCOMROY',name:'Rookie of the Year - MLB.com Awards',season:'2001'},{id:'ALROY',name:'Jackie Robinson AL Rookie of the Year',season:'2001'},
  ]);
  assert.deepEqual(awards.map(a=>a.label),['名人堂','明星賽 MVP','美聯 MVP','美聯新人王','美聯明星賽','水手退休背號']);
  const allStar=awards.find(a=>a.label==='美聯明星賽');
  assert.equal(allStar.count,2);assert.deepEqual(allStar.seasons,[2001,2002]);
  assert.deepEqual(p.majorAwards(undefined),[]);

  assert.equal(p.seasonsText([2001,2007,2009]),'2001、2007、2009');
  assert.equal(p.seasonsText([2001,2002,2003,2004,2005]),'2001、2002、2003、2004、2005');
  assert.equal(p.seasonsText([2001,2002,2003,2004,2005,2006]),'2001–2006');
  assert.equal(p.seasonsText([]),'');

  assert.equal(p.heightCm(`5' 11"`),180);assert.equal(p.heightCm(`6' 4"`),193);assert.equal(p.heightCm(''),null);
  assert.equal(p.weightKg(175),79);assert.equal(p.weightKg(0),null);
  assert.equal(p.handsText({pitchHand:{code:'R'},batSide:{code:'L'}}),'右投左打');
  assert.equal(p.handsText({pitchHand:{code:'R'},batSide:{code:'S'}}),'右投左右開弓');
  assert.equal(p.handsText({}),'');

  // 生日當天才加一歲；不受時區影響。
  assert.equal(p.ageOn('1973-10-22',new Date(2026,9,11)),52);
  assert.equal(p.ageOn('1973-10-11',new Date(2026,9,11)),53);
  assert.equal(p.ageOn('1973-10-12',new Date(2026,9,11)),52);
  assert.equal(p.ageOn('',new Date(2026,9,11)),null);

  // 逐年成績分組：每年一列主要成績，同年其他紀錄收在 details。
  const row=(season,sport,team,games,extra={})=>({season:String(season),sport:{abbreviation:sport},...(team?{team:{id:team,name:'T'+team}}:{}),stat:{gamesPlayed:games},...extra});
  const seasons=p.groupSeasons([
    // 2026：小聯盟復健（1A、3A）+ 大聯盟 → 大聯盟為主。
    row(2026,'Minors',null,17),row(2026,'A',1,3),row(2026,'AAA',2,14),row(2026,'MLB',116,114),
    // 2012：大聯盟兩隊 → 合計列（2 隊）為主，兩隊收合。
    row(2012,'MLB',136,95),row(2012,'MLB',147,67),row(2012,'MLB',null,162,{numTeams:2}),
    // 2023：只有小聯盟、多層級 → 小聯盟合計為主；同層級合計列不列入。
    row(2023,'Minors',null,75),row(2023,'ROK',3,3),row(2023,'A+',4,64),row(2023,'A+',5,8),row(2023,'A+',null,72),
    // 2021：只有一隊。
    row(2021,'ROK',3,9),
    // 2019：兩隊但沒有合計列 → 出賽多的那隊為主。
    row(2019,'MLB',110,20),row(2019,'MLB',111,40),
    // 2018：只有合計列（沒有球隊）→ 不顯示。
    row(2018,'Minors',null,5),
  ]);
  assert.deepEqual(seasons.map(s=>s.season),['2012','2019','2021','2023','2026']);
  const [s2012,s2019,s2021,s2023,s2026]=seasons;
  assert.equal(s2026.level,'MLB');assert.equal(s2026.main.team.id,116);assert.equal(s2026.total,false);
  assert.deepEqual(s2026.details.map(d=>d.team.id),[1,2]);
  assert.equal(s2012.total,true);assert.equal(s2012.teams,2);assert.equal(s2012.main.stat.gamesPlayed,162);assert.deepEqual(s2012.details.map(d=>d.team.id),[136,147]);
  assert.equal(s2023.level,'Minors');assert.equal(s2023.total,true);assert.equal(s2023.teams,3);assert.equal(s2023.main.stat.gamesPlayed,75);assert.deepEqual(s2023.details.map(d=>d.team.id),[3,4,5]);
  assert.equal(s2021.level,'ROK');assert.equal(s2021.total,false);assert.deepEqual(s2021.details,[]);
  assert.equal(s2019.main.team.id,111);assert.deepEqual(s2019.details.map(d=>d.team.id),[110]);
  assert.equal(p.levelName('Minors'),'小聯盟');assert.equal(p.levelName('XYZ'),'XYZ');
  assert.deepEqual(p.groupSeasons(undefined),[]);

  // 畫面上的日期用斜線。
  assert.equal(p.slashDate('2001-04-02'),'2001/04/02');
  assert.equal(p.slashDate(undefined),'');
  assert.equal(p.slashDate('Opening Day'),'Opening Day');

  assert.equal(p.foldText('Carlos Beltrán'),'carlos beltran');
  assert.equal(p.countryName('Dominican Republic'),'多明尼加');assert.equal(p.countryName('Atlantis'),'Atlantis');
  assert.equal(p.hofNoteText('First unanimous inductee'),'史上首位全票入選');assert.equal(p.hofNoteText(undefined),'');
  assert.equal(p.bodyText({height:`6' 4"`,weight:220}),'193 公分 · 100 公斤');
  assert.equal(p.dateText('2001-04-02'),'2001/04/02');
  assert(p.headshot(400085,120).includes('/w_120,q_90/v1/people/400085/headshot/67/current'));
  // 英文：隊名用暱稱、MLB 原文（國家、名人堂說明）、英制身高體重、英文日期。
  i18n.setLangPref('en');
  assert.equal(p.teamDisplayName({id:142,name:'Minnesota Twins'}),'Twins');
  assert.equal(p.teamDisplayName({id:142,name:'Washington Senators'}),'Washington Senators');
  assert.equal(p.teamDisplayName({id:119,name:'Brooklyn Dodgers'}),'Dodgers');
  assert.equal(p.handsText({pitchHand:{code:'R'},batSide:{code:'L'}}),'Bats L / Throws R');
  assert.equal(p.handsText({pitchHand:{code:'R'},batSide:{code:'S'}}),'Bats Switch / Throws R');
  assert.equal(p.bodyText({height:`6' 4"`,weight:220}),`6' 4" · 220 lb`);
  assert.equal(p.dateText('2001-04-02'),'Apr 2, 2001');
  assert.equal(p.countryName('Dominican Republic'),'Dominican Republic');
  assert.equal(p.hofNoteText('First unanimous inductee'),'First unanimous inductee');
  assert.equal(p.levelName('AAA'),'AAA');assert.equal(p.positionName('SS'),'Shortstop');
  assert.equal(p.seasonsText([2001,2007]),'2001, 2007');
  assert.deepEqual(p.majorAwards([{id:'MLBHOF',season:'2025'},{id:'ALMVP',season:'2001'},{id:'RETIREDUNI_136',season:'2025'}]).map(a=>a.label),['Hall of Fame','AL MVP','Mariners retired number']);

  // 日文：隊名片假名、右投両打、公制、日期用斜線。
  i18n.setLangPref('ja');
  assert.equal(p.teamDisplayName({id:142,name:'Minnesota Twins'}),'ツインズ');
  assert.equal(p.handsText({pitchHand:{code:'R'},batSide:{code:'S'}}),'右投両打');
  assert.equal(p.bodyText({height:`6' 4"`,weight:220}),'193 cm · 100 kg');
  assert.equal(p.dateText('2001-04-02'),'2001/04/02');
  assert.equal(p.countryName('Dominican Republic'),'ドミニカ共和国');
  assert.equal(p.positionName('SS'),'遊撃手');
  assert.deepEqual(p.majorAwards([{id:'MLBHOF',season:'2025'},{id:'RETIREDUNI_136',season:'2025'}]).map(a=>a.label),['野球殿堂','マリナーズの永久欠番']);
  i18n.setLangPref('zh');
  console.log('players helpers ok');
})().catch(err=>{console.error(err);process.exit(1)});
