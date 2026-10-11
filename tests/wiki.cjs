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
  },
  entities:{
    Q600:entity({zhwiki:'鈴木一朗',enwiki:'Ichiro Suzuki'}),
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
  'en|Empty Zh':'English only text.',
  'en|Bud Selig':'Allan Huber "Bud" Selig (; born July 30, 1934) is an American baseball executive.\nHe served as commissioner.',
  'en|Martín Dihigo':'Martín Dihigo () was a Cuban player.',
};
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
  if(lang==='zh')assert.equal(url.searchParams.get('variant'),'zh-tw');
  assert.equal(url.searchParams.get('exintro'),'1');assert.equal(url.searchParams.get('explaintext'),'1');
  const key=`${lang}|${title}`;
  return json({query:{pages:[key in extracts?{title,extract:extracts[key]}:{title,missing:true}]}});
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
  assert.deepEqual({...ichiro,paragraphs:[...ichiro.paragraphs]},{lang:'zh',title:'鈴木一朗',paragraphs:['鈴木一朗（1973年10月22日—）是日本棒球選手。','他在2001年加入西雅圖水手。']});
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

  // 失敗不快取，下次重試。
  failNext=true;
  await assert.rejects(w.loadWikiBio({id:400085+1,fullName:'Retry Guy',birthDate:'1950-01-01'}),/HTTP 503/);
  assert.equal(await w.loadWikiBio({id:400085+1,fullName:'Retry Guy',birthDate:'1950-01-01'}),null);

  console.log('PASS wiki bio: P3541 lookup, zh-tw intro, en fallback, name + birth-date fallback, birth gap tolerance, tidy, cache, retry after failure');
})().catch(err=>{console.error(err);process.exit(1)});
