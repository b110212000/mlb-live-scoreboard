// 外觀：深色 / 淺色 / 跟隨系統。偏好存在 localStorage，套用在 <html data-theme>。
// index.html 的 <head> 已先用同樣規則套用一次，避免載入時先閃一下深色。
const KEY='mlb-theme';
export const THEMES=[['dark','深色'],['light','淺色'],['system','跟隨系統']];
// 瀏覽器網址列 / 狀態列的顏色（與頁面底色一致）。
const META_COLOR={dark:'#06111f',light:'#eef2f7'};
const media=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: light)'):null;

export function themePref(){
  try{const value=localStorage.getItem(KEY);return THEMES.some(([key])=>key===value)?value:'dark'}catch(_){return 'dark'}
}

export const resolveTheme=pref=>pref==='system'?(media?.matches?'light':'dark'):pref==='light'?'light':'dark';

export function applyTheme(pref=themePref()){
  const theme=resolveTheme(pref);
  document.documentElement.dataset.theme=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',META_COLOR[theme]);
  return theme;
}

export function setThemePref(pref){
  try{localStorage.setItem(KEY,pref)}catch(_){}
  return applyTheme(pref);
}

// 跟隨系統時，手機 / 電腦切換深淺色就立刻跟著變。
media?.addEventListener?.('change',()=>{if(themePref()==='system')applyTheme('system')});
