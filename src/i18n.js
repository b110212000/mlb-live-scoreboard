// 多國語系：繁體中文（原文）、English、日本語。
// 程式裡的文字一律寫 t('中文原文')；字典（src/locales/en.js、ja.js）以中文原文為 key。
// 參數用 {名稱}：t('共 {n} 人',{n:3})。字典缺字時顯示中文；tests/i18n.cjs 會檢查每個 t() 都有英文與日文。
import en from './locales/en.js';
import ja from './locales/ja.js';

const KEY='mlb-lang';
export const LANGS=[['auto','跟隨裝置'],['zh','繁體中文'],['en','English'],['ja','日本語']];
const DICTS={en,ja};
const HTML_LANG={zh:'zh-Hant-TW',en:'en',ja:'ja'};
const LOCALE={zh:'zh-TW',en:'en-US',ja:'ja-JP'};
let current='zh';

export function langPref(){
  try{const value=localStorage.getItem(KEY);return LANGS.some(([key])=>key===value)?value:'auto'}catch(_){return 'auto'}
}

// 跟隨裝置：中文 → 繁體中文、日文 → 日本語、英文 → English；其他語言用英文。
export function detectLang(list){
  const tags=list||(typeof navigator==='undefined'?[]:navigator.languages?.length?navigator.languages:[navigator.language]);
  for(const tag of tags){
    const value=String(tag||'').toLowerCase();
    if(value.startsWith('zh'))return 'zh';
    if(value.startsWith('ja'))return 'ja';
    if(value.startsWith('en'))return 'en';
  }
  return tags.some(Boolean)?'en':'zh';
}

export const resolveLang=pref=>pref==='zh'||pref==='en'||pref==='ja'?pref:detectLang();

export function applyLang(pref=langPref()){
  current=resolveLang(pref);
  if(typeof document!=='undefined')document.documentElement.lang=HTML_LANG[current];
  return current;
}

export function setLangPref(pref){
  try{localStorage.setItem(KEY,pref)}catch(_){}
  return applyLang(pref);
}

export const lang=()=>current;
// Intl 日期 / 數字格式用的語系。
export const locale=()=>LOCALE[current];

export function t(text,params){
  const dict=DICTS[current];
  let out=dict&&Object.prototype.hasOwnProperty.call(dict,text)?dict[text]:text;
  if(params)out=out.replace(/\{(\w+)\}/g,(match,name)=>params[name]!=null?String(params[name]):match);
  return out;
}

// 句子中間要放連結等 React 元素時用：回傳字串與元素交錯的陣列（呼叫端用 Fragment 加 key 輸出）。
// tParts('以上摘自〈{title}〉',{title:<a …/>}) → ['以上摘自〈',<a …/>,'〉']
export function tParts(text,parts){
  return t(text).split(/(\{\w+\})/).filter(Boolean).map(segment=>{
    const name=/^\{(\w+)\}$/.exec(segment)?.[1];
    return name&&Object.prototype.hasOwnProperty.call(parts,name)?parts[name]:segment;
  });
}
