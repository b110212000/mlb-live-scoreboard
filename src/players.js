// 球員資料共用：照片、守備位置 / 國家 / 獎項 / 層級名稱（依目前語言）、身高體重與日期格式。
import {teamById,teamLabel} from './teams.js';
import {t,lang,locale} from './i18n.js';

export const headshot=(id,width=240)=>`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_${width},q_90/v1/people/${id}/headshot/67/current`;

// 名稱表在呼叫時才翻譯（t() 依目前語言）。
const POSITIONS=()=>({P:t('投手'),SP:t('先發投手'),RP:t('救援投手'),TWP:t('二刀流'),C:t('捕手'),'1B':t('一壘手'),'2B':t('二壘手'),'3B':t('三壘手'),SS:t('游擊手'),LF:t('左外野手'),CF:t('中外野手'),RF:t('右外野手'),OF:t('外野手'),DH:t('指定打擊'),IF:t('內野手'),UT:t('工具人')});
const POSITION_TYPES=()=>({Pitcher:t('投手'),Catcher:t('捕手'),Infielder:t('內野手'),Outfielder:t('外野手'),Hitter:t('指定打擊'),'Two-Way Player':t('二刀流')});
export const positionName=abbr=>POSITIONS()[abbr]||'';
export const positionTypeName=type=>POSITION_TYPES()[type]||'';

// 球隊名稱：同一支球隊的舊隊名（例如 Washington Senators → 現在的雙城）保留英文原名，暱稱相同（Brooklyn Dodgers）才用目前語言的隊名。
export function teamDisplayName(team){
  const mlb=teamById(team?.id);
  if(!mlb)return team?.name||'';
  if(!team.name||team.name===mlb.en)return teamLabel(mlb);
  return team.name.endsWith(mlb.nick)?teamLabel(mlb):team.name;
}

// 搜尋用：去掉重音符號、轉小寫（Beltrán → beltran）。
export const foldText=text=>String(text||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();

// 國家：MLB 資料是英文，英文介面直接用原文。
const COUNTRIES=()=>({USA:t('美國'),Japan:t('日本'),'Dominican Republic':t('多明尼加'),Venezuela:t('委內瑞拉'),'Puerto Rico':t('波多黎各'),Cuba:t('古巴'),Taiwan:t('台灣'),'South Korea':t('南韓'),Korea:t('南韓'),Mexico:t('墨西哥'),Canada:t('加拿大'),Panama:t('巴拿馬'),Curacao:t('古拉索'),Colombia:t('哥倫比亞'),Australia:t('澳洲'),Netherlands:t('荷蘭'),Bahamas:t('巴哈馬'),Nicaragua:t('尼加拉瓜'),Aruba:t('阿魯巴'),Germany:t('德國'),Ireland:t('愛爾蘭'),Scotland:t('蘇格蘭'),England:t('英格蘭'),Wales:t('威爾斯'),'Virgin Islands':t('美屬維京群島')});
export const countryName=name=>lang()==='en'?name||'':COUNTRIES()[name]||name||'';

// MLB 的層級縮寫 → 目前語言（Minors 是小聯盟各層級的合計列）。
const LEVELS=()=>({MLB:'MLB',AAA:t('3A'),AA:t('2A'),'A+':t('高階1A'),A:t('1A'),'A-':t('短期1A'),ROK:t('新人'),RK:t('新人'),WIN:t('冬季聯盟'),Minors:t('小聯盟')});
export const levelName=abbr=>LEVELS()[abbr]||abbr||'';

// 逐年成績分組：每年一列主要成績，同年其他紀錄放在 details（畫面上收合，點一下展開）。
// API 每年有各隊各層級的列（層級由低到高、同層級依先後），另有沒有球隊的合計列：
// 大聯盟多隊合計（numTeams）、小聯盟合計（Minors）、同層級多隊合計。
// 主要成績：有大聯盟就用大聯盟（多隊用合計）；只有小聯盟時用小聯盟合計；只有一隊就是那一列。
export function groupSeasons(splits){
  const level=split=>split.sport?.abbreviation;
  const bySeason=new Map();
  for(const split of splits||[]){
    const season=String(split?.season||'');
    if(!season)continue;
    if(!bySeason.has(season))bySeason.set(season,[]);
    bySeason.get(season).push(split);
  }
  return [...bySeason.entries()].sort((a,b)=>Number(a[0])-Number(b[0])).flatMap(([season,rows])=>{
    const teamRows=rows.filter(row=>row.team?.id&&level(row)!=='Minors');
    if(!teamRows.length)return [];
    const mlb=teamRows.filter(row=>level(row)==='MLB');
    const pool=mlb.length?mlb:teamRows;
    const totals=rows.filter(row=>!row.team?.id);
    let main=pool.length===1?pool[0]
      :mlb.length?totals.find(row=>level(row)==='MLB')
      :totals.find(row=>level(row)==='Minors')||totals.find(row=>level(row)!=='MLB');
    // 沒有合計列時，用出賽最多的那一列。
    if(!main)main=[...pool].sort((a,b)=>(Number(b.stat?.gamesPlayed)||0)-(Number(a.stat?.gamesPlayed)||0))[0];
    const total=!main.team?.id;
    return [{season,main,level:level(main),total,teams:total?Number(main.numTeams)||pool.length:1,details:teamRows.filter(row=>row!==main)}];
  });
}

// 投打習慣：中文「右投左打 / 右投左右開弓」、日文「右投左打 / 右投両打」、英文「Bats L / Throws R」。
export function handsText(person){
  const throws=person?.pitchHand?.code,bats=person?.batSide?.code;
  if(!throws&&!bats)return '';
  if(lang()==='en')return [bats?`Bats ${bats==='S'?'Switch':bats}`:'',throws?`Throws ${throws}`:''].filter(Boolean).join(' / ');
  const hand={L:'左',R:'右'};
  const throwText=hand[throws]?hand[throws]+'投':'';
  const batText=bats==='S'?(lang()==='ja'?'両打':'左右開弓'):hand[bats]?hand[bats]+'打':'';
  return throwText+batText;
}

// 5' 11" → 180 公分；175 → 79 公斤。
export function heightCm(text){
  const match=String(text||'').match(/(\d+)'\s*(\d+)?/);
  return match?Math.round((Number(match[1])*12+Number(match[2]||0))*2.54):null;
}
export const weightKg=lb=>Number(lb)>0?Math.round(Number(lb)*0.4536):null;
// 身高體重：英文介面用英制原文（6' 4" · 220 lb），其他語言換成公制。
export function bodyText(person){
  if(lang()==='en')return [person?.height||'',Number(person?.weight)>0?`${person.weight} lb`:''].filter(Boolean).join(' · ');
  const cm=heightCm(person?.height),kg=weightKg(person?.weight);
  return [cm?t('{n} 公分',{n:cm}):'',kg?t('{n} 公斤',{n:kg}):''].filter(Boolean).join(' · ');
}

// 畫面上的日期用斜線：2001-04-02 → 2001/04/02。
export const slashDate=value=>String(value||'').replace(/^(\d{4})-(\d{2})-(\d{2})/,'$1/$2/$3');
// 依語言：中文 / 日文 2001/04/02，英文 Apr 2, 2001（以 UTC 解析，避免時區差一天）。
export function dateText(value){
  if(lang()!=='en'||!/^\d{4}-\d{2}-\d{2}/.test(String(value||'')))return slashDate(value);
  return new Intl.DateTimeFormat(locale(),{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(String(value).slice(0,10)+'T00:00:00Z'));
}

// 生日是 YYYY-MM-DD（不用 new Date 解析，避免依時區差一天）。
export function ageOn(birthDate,until=new Date()){
  const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthDate||''));
  if(!match)return null;
  const [year,month,day]=match.slice(1).map(Number);
  const beforeBirthday=until.getMonth()+1<month||(until.getMonth()+1===month&&until.getDate()<day);
  return until.getFullYear()-year-(beforeBirthday?1:0);
}

// 主要獎項，依 MLB 獎項 id 對照（名稱不一致，且小聯盟、球隊、媒體也有同名的「MVP」「新人王」「明星賽」，不能用名稱比對）。
// 其餘如單週 / 單月最佳、球隊 MVP、小聯盟獎項不列。
const AWARD_LABELS=()=>[
  ['MLBHOF',t('名人堂')],
  ['WSMVP',t('世界大賽 MVP')],
  ['ALCSMVP',t('美聯冠軍賽 MVP')],['NLCSMVP',t('國聯冠軍賽 MVP')],
  ['ASMVP',t('明星賽 MVP')],
  ['ALMVP',t('美聯 MVP')],['NLMVP',t('國聯 MVP')],
  ['ALCY',t('美聯賽揚獎')],['NLCY',t('國聯賽揚獎')],['MLBCY',t('賽揚獎')],
  ['ALROY',t('美聯新人王')],['NLROY',t('國聯新人王')],['MLBROY',t('新人王')],
  ['ALAS',t('美聯明星賽')],['NLAS',t('國聯明星賽')],
  ['ALPG',t('美聯白金手套')],['NLPG',t('國聯白金手套')],
  ['ALGG',t('美聯金手套')],['NLGG',t('國聯金手套')],['MLGG',t('金手套')],
  ['ALSS',t('美聯銀棒獎')],['NLSS',t('國聯銀棒獎')],
  ['ALHAA',t('美聯漢克阿倫獎')],['NLHAA',t('國聯漢克阿倫獎')],
  ['ALREL',t('美聯年度最佳救援投手')],['NLREL',t('國聯年度最佳救援投手')],
  ['ALCPOY',t('美聯東山再起獎')],['NLCPOY',t('國聯東山再起獎')],
  ['MLBRC',t('羅貝托克萊門特獎')],
  ['DHOY',t('年度最佳指定打擊')],
];
// 球隊退休背號：RETIREDUNI_<球隊 id>。
function awardLabel(id,labels){
  const index=labels.findIndex(([key])=>key===id);
  if(index>=0)return {key:id,label:labels[index][1],order:index};
  const retired=/^RETIREDUNI_(\d+)$/.exec(id);
  const team=retired&&teamById(Number(retired[1]));
  return team?{key:id,label:t('{team}退休背號',{team:teamLabel(team)}),order:labels.length}:null;
}
// 回傳 [{key, label, count, seasons}]，依重要性排列；key 是 MLB 獎項 id（例如 MLBHOF）。
export function majorAwards(awards){
  const labels=AWARD_LABELS();
  const groups=new Map();
  for(const award of awards||[]){
    const match=awardLabel(String(award?.id||''),labels);
    if(!match)continue;
    const group=groups.get(match.key)||{...match,seasons:[]};
    if(award.season)group.seasons.push(Number(award.season));
    groups.set(match.key,group);
  }
  return [...groups.values()]
    .map(group=>({...group,seasons:[...new Set(group.seasons)].sort((a,b)=>a-b),count:Math.max(1,new Set(group.seasons).size)}))
    .sort((a,b)=>a.order-b.order||b.count-a.count);
}

export function seasonsText(seasons){
  if(!seasons.length)return '';
  if(seasons.length<=5)return seasons.join(lang()==='en'?', ':'、');
  return `${seasons[0]}–${seasons[seasons.length-1]}`;
}

// 名人堂入選說明（MLB 資料是英文，英文介面直接用原文）。
const HOF_NOTES=()=>({
  'Veterans Committee Inductee':t('老將委員會選入'),
  'Contemporary Era Ballot Selection':t('當代時代委員會選入'),
  'Classic Era Ballot Selection':t('經典時代委員會選入'),
  'Modern Baseball Committee Inductee':t('現代棒球委員會選入'),
  'First unanimous inductee':t('史上首位全票入選'),
  'No cap logo on plaque':t('銘牌上沒有球隊帽徽')
});
export const hofNoteText=note=>lang()==='en'?note||'':HOF_NOTES()[note]||note||'';
