const assert=require('assert/strict');

// 模擬 Wikidata / 維基百科 API。
const entity=(sitelinks,birth)=>({sitelinks:Object.fromEntries(Object.entries(sitelinks).map(([site,title])=>[site,{site,title}])),
  ...(birth?{claims:{P569:[{mainsnak:{datavalue:{value:{time:birth}}}}]}}:{})});
const wikidata={
  search:{
    'haswbstatement:P3541=400085':['Q600'],
    'haswbstatement:P3541=500':['Q500'],
    'Bud Selig baseball haswbstatement:P31=Q5':['Q1','Q2927496'],
    'Martín Dihigo baseball haswbstatement:P31=Q5':['Q970037'],
    'Someone Else baseball haswbstatement:P31=Q5':['Q9'],
    'haswbstatement:P3541=650067':['Q700'],
    'Jacob Ruppert baseball haswbstatement:P31=Q5':[],
    'Jacob Ruppert haswbstatement:P31=Q5':['Q6119204','Q120733904'],
  },
  entities:{
    Q600:entity({zhwiki:'鈴木一朗',enwiki:'Ichiro Suzuki',jawiki:'イチロー'}),
    Q700:entity({zhwiki:'巴克·奥尼尔',enwiki:"Buck O'Neil"}),
    Q6119204:entity({enwiki:'Jacob Ruppert'},'+1867-08-05T00:00:00Z'),
    Q120733904:entity({enwiki:'Jacob Ruppert Sr.'},'+1842-01-01T00:00:00Z'),
    Q500:entity({zhwiki:'空條目',enwiki:'Empty Zh'}),
    Q1:entity({enwiki:'Bud Selig (actor)'},'+1960-01-01T00:00:00Z'),
    Q2927496:entity({enwiki:'Bud Selig'},'+1934-07-30T00:00:00Z'),
    Q970037:entity({enwiki:'Martín Dihigo'},'+1906-05-25T00:00:00Z'),
    Q9:entity({enwiki:'Someone Else'},'+1990-01-01T00:00:00Z'),
  }
};
const extracts={
  'zh|鈴木一朗':'鈴木一朗（1973年10月22日—）是日本棒球選手。\n\n他在2001年加入西雅圖水手。\n',
  'zh|空條目':'',
  'ja|イチロー':'イチロー（1973年10月22日 - ）は、日本の野球選手。',
  'en|Ichiro Suzuki':'Ichiro Suzuki (born October 22, 1973) is a Japanese baseball player.',
  'en|Empty Zh':'English only text.',
  'en|Bud Selig':'Allan Huber "Bud" Selig (; born July 30, 1934) is an American baseball executive.\nHe served as commissioner.',
  'en|Martín Dihigo':'Martín Dihigo () was a Cuban player.',
  'zh|巴克·奥尼尔':'巴克·奧尼爾（1911年11月13日—2006年10月6日）是美國棒球員。',
  'en|Jacob Ruppert':'Jacob Ruppert was an American brewer and owner of the New York Yankees.',
};
// 中文條目名稱是簡體時，台灣正體的顯示名稱。
const variantTitles={'巴克·奥尼尔':'巴克·奧尼爾'};
const calls=[];let failNext=false;
globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));calls.push(url);
  assert.equal(url.searchParams.get('origin'),'*');
  assert(init?.headers?.['Api-User-Agent']?.startsWith('MLB-Live-Scoreboard'),'Api-User-Agent header');
  if(failNext){failNext=false;return new Response('',{status:503})}
  const json=body=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
  if(url.hostname==='www.wikidata.org'){
    if(url.searchParams.get('list')==='search')return json({query:{search:(wikidata.search[url.searchParams.get('srsearch')]||[]).map(title=>({title}))}});
    const ids=url.searchParams.get('ids').split('|');
    return json({entities:Object.fromEntries(ids.map(id=>[id,wikidata.entities[id]||{missing:''}]))});
  }
  const lang=url.hostname.split('.')[0],title=url.searchParams.get('titles');
  if(lang==='zh'){assert.equal(url.searchParams.get('variant'),'zh-tw');assert.equal(url.searchParams.get('inprop'),'varianttitles');}
  assert.equal(url.searchParams.get('exintro'),'1');assert.equal(url.searchParams.get('explaintext'),'1');
  const key=`${lang}|${title}`;
  const page=key in extracts?{title,extract:extracts[key],...(lang==='zh'?{varianttitles:{zh:title,'zh-tw':variantTitles[title]||title}}:{})}:{title,missing:true};
  return json({query:{pages:[page]}});
};

(async()=>{
  const w=await import('../src/wiki.js');

  // 生日比對：同一天 0；差一天 / 一年；只知道年份；無法比較。
  assert.equal(w.birthGap('+1934-07-30T00:00:00Z','1934-07-30'),0);
  assert.equal(w.birthGap('+1907-06-05T00:00:00Z','1907-06-06'),1);
  assert.equal(w.birthGap('+1906-05-25T00:00:00Z','1905-05-25'),365);
  assert.equal(w.birthGap('+1887-00-00T00:00:00Z','1887-03-19'),77);
  assert.equal(w.birthGap(undefined,'1900-01-01'),Infinity);
  assert.equal(w.birthGap('+1900-01-01T00:00:00Z',''),Infinity);

  assert.equal(w.tidy('Selig (; born July 30, 1934) is'),'Selig (born July 30, 1934) is');
  assert.equal(w.tidy('Dihigo () was  a player'),'Dihigo was a player');
  assert.equal(w.tidy('鈴木一朗（；1973年）'),'鈴木一朗（1973年）');

  // MLB 球員編號（P3541）→ 中文維基（台灣正體），段落切開。
  const ichiro=await w.loadWikiBio({id:400085,fullName:'Ichiro Suzuki',birthDate:'1973-10-22'});
  assert.deepEqual({...ichiro,paragraphs:[...ichiro.paragraphs]},{lang:'zh',title:'鈴木一朗',displayTitle:'鈴木一朗',paragraphs:['鈴木一朗（1973年10月22日—）是日本棒球選手。','他在2001年加入西雅圖水手。']});
  assert.equal(w.wikiUrl(ichiro),'https://zh.wikipedia.org/zh-tw/%E9%88%B4%E6%9C%A8%E4%B8%80%E6%9C%97');
  // 同一位球員只查一次。
  const before=calls.length;await w.loadWikiBio({id:400085});assert.equal(calls.length,before);

  // 中文條目沒有內容 → 英文。
  const empty=await w.loadWikiBio({id:500,fullName:'X',birthDate:'1990-01-01'});
  assert.equal(empty.lang,'en');assert.equal(w.wikiUrl(empty),'https://en.wikipedia.org/wiki/Empty_Zh');

  // 沒有 P3541：姓名搜尋，選生日相符的人（同名演員不算）；清掉發音殘骸。
  const selig=await w.loadWikiBio({id:673180,fullName:'Bud Selig',birthDate:'1934-07-30'});
  assert.equal(selig.title,'Bud Selig');assert.equal(selig.paragraphs[0],'Allan Huber "Bud" Selig (born July 30, 1934) is an American baseball executive.');
  // 生日相差一年（資料來源不同）仍算同一人。
  const dihigo=await w.loadWikiBio({id:819764,fullName:'Martín Dihigo',birthDate:'1905-05-25'});
  assert.deepEqual([...dihigo.paragraphs],['Martín Dihigo was a Cuban player.']);
  // 生日差太多 → 不是同一人；沒有生日不做姓名搜尋；完全沒有 → null。
  assert.equal(await w.loadWikiBio({id:9001,fullName:'Someone Else',birthDate:'1950-01-01'}),null);
  const searches=calls.length;
  assert.equal(await w.loadWikiBio({id:9002,fullName:'No Birthday'}),null);
  assert.equal(calls.length,searches+1,'only the P3541 search without a birth date');
  assert.equal(await w.loadWikiBio({id:9003,fullName:'Nobody Here',birthDate:'1950-01-01'}),null);

  // 簡體條目名稱：顯示台灣正體，連結用原條目名稱。
  const buck=await w.loadWikiBio({id:650067,fullName:"Buck O'Neil",birthDate:'1911-11-13'});
  assert.equal(buck.displayTitle,'巴克·奧尼爾');assert.equal(buck.title,'巴克·奥尼尔');
  assert.equal(w.wikiUrl(buck),'https://zh.wikipedia.org/zh-tw/'+encodeURIComponent('巴克·奥尼尔'));
  // 球團老闆：加 baseball 搜不到，再不加 baseball 搜，依生日選出本人（不是同名父親）。
  const ruppert=await w.loadWikiBio({id:122270,fullName:'Jacob Ruppert',birthDate:'1867-08-05'});
  assert.equal(ruppert.title,'Jacob Ruppert');assert.equal(ruppert.lang,'en');

  // 失敗不快取，下次重試。
  failNext=true;
  await assert.rejects(w.loadWikiBio({id:400085+1,fullName:'Retry Guy',birthDate:'1950-01-01'}),/HTTP 503/);
  assert.equal(await w.loadWikiBio({id:400085+1,fullName:'Retry Guy',birthDate:'1950-01-01'}),null);

  // 介面語言：日文先找日文維基、沒有再英文；英文只找英文維基；快取依語言分開。
  const i18n=await import('../src/i18n.js');
  i18n.setLangPref('ja');
  const ichiroJa=await w.loadWikiBio({id:400085,fullName:'Ichiro Suzuki',birthDate:'1973-10-22'});
  assert.equal(ichiroJa.lang,'ja');assert.equal(ichiroJa.title,'イチロー');assert.deepEqual([...ichiroJa.paragraphs],['イチロー（1973年10月22日 - ）は、日本の野球選手。']);
  assert.equal(w.wikiUrl(ichiroJa),'https://ja.wikipedia.org/wiki/'+encodeURIComponent('イチロー'));
  assert.equal((await w.loadWikiBio({id:500,fullName:'X',birthDate:'1990-01-01'})).lang,'en');
  i18n.setLangPref('en');
  const ichiroEn=await w.loadWikiBio({id:400085,fullName:'Ichiro Suzuki',birthDate:'1973-10-22'});
  assert.equal(ichiroEn.lang,'en');assert.equal(w.wikiUrl(ichiroEn),'https://en.wikipedia.org/wiki/Ichiro_Suzuki');
  assert.equal(await w.loadWikiBio({id:650067,fullName:"Buck O'Neil",birthDate:'1911-11-13'}),null,'english UI must not fall back to the Chinese article');
  i18n.setLangPref('zh');
  assert.equal((await w.loadWikiBio({id:400085})).lang,'zh');

  console.log('PASS wiki bio: UI language order (ja → en, en only), P3541 lookup, zh-tw intro and display title, en fallback, name + birth-date fallback (with and without "baseball"), birth gap tolerance, tidy, cache, retry after failure');
})().catch(err=>{console.error(err);process.exit(1)});
