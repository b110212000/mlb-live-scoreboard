// 球員資料共用：照片、中文守備位置 / 國家 / 獎項名稱、單位換算、層級名稱。
import {teamById} from './teams.js';

export const headshot=(id,width=240)=>`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_${width},q_90/v1/people/${id}/headshot/67/current`;

export const POSITION_ZH={P:'投手',SP:'先發投手',RP:'救援投手',TWP:'二刀流',C:'捕手','1B':'一壘手','2B':'二壘手','3B':'三壘手',SS:'游擊手',LF:'左外野手',CF:'中外野手',RF:'右外野手',OF:'外野手',DH:'指定打擊',IF:'內野手',UT:'工具人'};
export const POSITION_TYPE_ZH={Pitcher:'投手',Catcher:'捕手',Infielder:'內野手',Outfielder:'外野手',Hitter:'指定打擊','Two-Way Player':'二刀流'};

// 球隊中文名：同一支球隊的舊隊名（例如 Washington Senators → 現在的雙城）保留英文，暱稱相同（Brooklyn Dodgers）才用中文。
export function teamNameZh(team){
  const mlb=teamById(team?.id);
  if(!mlb)return team?.name||'';
  if(!team.name||team.name===mlb.en)return mlb.name;
  const words=mlb.en.split(' ');
  const nickname=words.slice(/ (Sox|Jays)$/.test(mlb.en)?-2:-1).join(' ');
  return team.name.endsWith(nickname)?mlb.name:team.name;
}

// 搜尋用：去掉重音符號、轉小寫（Beltrán → beltran）。
export const foldText=text=>String(text||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();

const COUNTRY_ZH={USA:'美國',Japan:'日本','Dominican Republic':'多明尼加',Venezuela:'委內瑞拉','Puerto Rico':'波多黎各',Cuba:'古巴',Taiwan:'台灣','South Korea':'南韓',Korea:'南韓',Mexico:'墨西哥',Canada:'加拿大',Panama:'巴拿馬',Curacao:'古拉索',Colombia:'哥倫比亞',Australia:'澳洲',Netherlands:'荷蘭',Bahamas:'巴哈馬',Nicaragua:'尼加拉瓜',Aruba:'阿魯巴',Germany:'德國',Ireland:'愛爾蘭',Scotland:'蘇格蘭',England:'英格蘭',Wales:'威爾斯','Virgin Islands':'美屬維京群島'};
export const countryZh=name=>COUNTRY_ZH[name]||name||'';

// MLB 的層級縮寫 → 中文。
export const LEVEL_ZH={MLB:'MLB',AAA:'3A',AA:'2A','A+':'高階1A',A:'1A','A-':'短期1A',ROK:'新人',RK:'新人',WIN:'冬季聯盟'};

const HAND_ZH={L:'左',R:'右',S:'左右開弓'};
export function handsText(person){
  const throws=HAND_ZH[person?.pitchHand?.code],bats=person?.batSide?.code;
  if(!throws&&!bats)return '';
  return `${throws?throws+'投':''}${bats==='S'?'左右開弓':bats?HAND_ZH[bats]+'打':''}`;
}

// 5' 11" → 180 公分；175 → 79 公斤。
export function heightCm(text){
  const match=String(text||'').match(/(\d+)'\s*(\d+)?/);
  return match?Math.round((Number(match[1])*12+Number(match[2]||0))*2.54):null;
}
export const weightKg=lb=>Number(lb)>0?Math.round(Number(lb)*0.4536):null;

// 畫面上的日期用斜線：2001-04-02 → 2001/04/02。
export const slashDate=value=>String(value||'').replace(/^(\d{4})-(\d{2})-(\d{2})/,'$1/$2/$3');

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
const AWARD_LABELS=[
  ['MLBHOF','名人堂'],
  ['WSMVP','世界大賽 MVP'],
  ['ALCSMVP','美聯冠軍賽 MVP'],['NLCSMVP','國聯冠軍賽 MVP'],
  ['ASMVP','明星賽 MVP'],
  ['ALMVP','美聯 MVP'],['NLMVP','國聯 MVP'],
  ['ALCY','美聯賽揚獎'],['NLCY','國聯賽揚獎'],['MLBCY','賽揚獎'],
  ['ALROY','美聯新人王'],['NLROY','國聯新人王'],['MLBROY','新人王'],
  ['ALAS','美聯明星賽'],['NLAS','國聯明星賽'],
  ['ALPG','美聯白金手套'],['NLPG','國聯白金手套'],
  ['ALGG','美聯金手套'],['NLGG','國聯金手套'],['MLGG','金手套'],
  ['ALSS','美聯銀棒獎'],['NLSS','國聯銀棒獎'],
  ['ALHAA','美聯漢克阿倫獎'],['NLHAA','國聯漢克阿倫獎'],
  ['ALREL','美聯年度最佳救援投手'],['NLREL','國聯年度最佳救援投手'],
  ['ALCPOY','美聯東山再起獎'],['NLCPOY','國聯東山再起獎'],
  ['MLBRC','羅貝托克萊門特獎'],
  ['DHOY','年度最佳指定打擊'],
];
// 球隊退休背號：RETIREDUNI_<球隊 id>。
function awardLabel(id){
  const index=AWARD_LABELS.findIndex(([key])=>key===id);
  if(index>=0)return {label:AWARD_LABELS[index][1],order:index};
  const retired=/^RETIREDUNI_(\d+)$/.exec(id);
  const team=retired&&teamById(Number(retired[1]));
  return team?{label:`${team.name}退休背號`,order:AWARD_LABELS.length}:null;
}
// 回傳 [{label, count, seasons}]，依重要性排列。
export function majorAwards(awards){
  const groups=new Map();
  for(const award of awards||[]){
    const match=awardLabel(String(award?.id||''));
    if(!match)continue;
    const {label,order}=match;
    const group=groups.get(label)||{label,order,seasons:[]};
    if(award.season)group.seasons.push(Number(award.season));
    groups.set(label,group);
  }
  return [...groups.values()]
    .map(group=>({...group,seasons:[...new Set(group.seasons)].sort((a,b)=>a-b),count:Math.max(1,new Set(group.seasons).size)}))
    .sort((a,b)=>a.order-b.order||b.count-a.count);
}

export function seasonsText(seasons){
  if(!seasons.length)return '';
  if(seasons.length<=5)return seasons.join('、');
  return `${seasons[0]}–${seasons[seasons.length-1]}`;
}

// 名人堂入選說明。
const HOF_NOTES={
  'Veterans Committee Inductee':'老將委員會選入',
  'Contemporary Era Ballot Selection':'當代時代委員會選入',
  'Classic Era Ballot Selection':'經典時代委員會選入',
  'Modern Baseball Committee Inductee':'現代棒球委員會選入',
  'First unanimous inductee':'史上首位全票入選',
  'No cap logo on plaque':'銘牌上沒有球隊帽徽'
};
export const hofNoteZh=note=>HOF_NOTES[note]||note||'';
