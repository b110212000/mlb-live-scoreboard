// 球員頁的「生平」：維基百科條目導言（官方 API；內容依 CC BY-SA 4.0 授權，頁面上必須標示出處與授權）。
// 用 Wikidata 的「MLB.com 球員編號」（P3541）找條目；找不到（多半是總教練、裁判、經營者或黑人聯盟球員）
// 再用「姓名 + baseball」搜尋，並比對生日確認是同一人。優先中文維基（台灣正體），沒有再用英文。
// 只在使用者開啟球員頁時查詢那一位，同一次開啟快取。
const WIKIDATA='https://www.wikidata.org/w/api.php';
const HEADERS={'Api-User-Agent':'MLB-Live-Scoreboard (https://b110212000.github.io/mlb-live-scoreboard/)'};
// 舊時代球員各資料來源的生日常有出入（差一天、一個月甚至一兩年），兩年內都視為同一人。
const MAX_BIRTH_GAP_DAYS=731;
const cache=new Map();

async function api(base,params){
  const url=new URL(base);
  for(const [key,value] of Object.entries({format:'json',formatversion:'2',origin:'*',...params}))url.searchParams.set(key,value);
  const response=await fetch(url,{headers:HEADERS});
  if(!response.ok)throw new Error('HTTP '+response.status);
  return response.json();
}

const search=async query=>((await api(WIKIDATA,{action:'query',list:'search',srsearch:query,srlimit:'5'})).query?.search||[]).map(hit=>hit.title);
const entities=async(ids,props)=>(await api(WIKIDATA,{action:'wbgetentities',ids:ids.join('|'),props,sitefilter:'zhwiki|enwiki'})).entities||{};

// Wikidata 生日（+1934-07-30T00:00:00Z）與 MLB 生日（1934-07-30）相差幾天；無法比較時回傳 Infinity。
export function birthGap(wikidataTime,birthDate){
  const wd=/^\+?(\d{4})-(\d{2})-(\d{2})/.exec(String(wikidataTime||''));
  const mlb=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthDate||''));
  if(!wd||!mlb)return Infinity;
  // Wikidata 只知道年份時月日是 00。
  const day=match=>Date.UTC(Number(match[1]),Math.max(1,Number(match[2]))-1,Math.max(1,Number(match[3])));
  return Math.abs(day(wd)-day(mlb))/86_400_000;
}

async function findEntity(person){
  const [byId]=await search(`haswbstatement:P3541=${person.id}`);
  if(byId)return (await entities([byId],'sitelinks'))[byId]||null;
  if(!person.fullName||!person.birthDate)return null;
  const hits=await search(`${person.fullName} baseball haswbstatement:P31=Q5`);
  if(!hits.length)return null;
  const found=await entities(hits,'sitelinks|claims');
  let best=null,bestGap=Infinity;
  for(const id of hits){
    const gap=birthGap(found[id]?.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time,person.birthDate);
    if(gap<bestGap){best=found[id];bestGap=gap}
  }
  return bestGap<=MAX_BIRTH_GAP_DAYS?best:null;
}

// 純文字摘要會留下發音模板被拿掉後的殘骸，例如「Selig (; born July 30, 1934)」、空括號。
export const tidy=text=>text
  .replace(/\(\s*[;,]\s*/g,'(').replace(/（\s*[；，;,]\s*/g,'（')
  .replace(/\s*\(\s*\)|（\s*）/g,'')
  .replace(/[ \t]{2,}/g,' ').trim();

async function intro(lang,title){
  const params={action:'query',prop:'extracts',exintro:'1',explaintext:'1',redirects:'1',titles:title};
  if(lang==='zh')params.variant='zh-tw';
  const page=(await api(`https://${lang}.wikipedia.org/w/api.php`,params)).query?.pages?.[0];
  const paragraphs=String(page?.extract||'').split(/\n+/).map(tidy).filter(Boolean);
  return page&&!page.missing&&paragraphs.length?{lang,title:page.title,paragraphs}:null;
}

// 回傳 {lang:'zh'|'en', title, paragraphs} 或 null（維基百科沒有這個人）。
export function loadWikiBio(person){
  const key=Number(person?.id);
  if(!cache.has(key)){
    cache.set(key,(async()=>{
      const entity=await findEntity(person);
      const zh=entity?.sitelinks?.zhwiki?.title,en=entity?.sitelinks?.enwiki?.title;
      return (zh&&await intro('zh',zh))||(en&&await intro('en',en))||null;
    })().catch(err=>{cache.delete(key);throw err}));
  }
  return cache.get(key);
}

export function wikiUrl(bio){
  const path=encodeURIComponent(bio.title.replace(/ /g,'_'));
  return bio.lang==='zh'?`https://zh.wikipedia.org/zh-tw/${path}`:`https://en.wikipedia.org/wiki/${path}`;
}
