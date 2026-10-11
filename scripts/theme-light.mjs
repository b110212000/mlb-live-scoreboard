// 淺色主題：由深色的 styles.css 自動產生 theme-light.css，只在 <html data-theme="light"> 時生效。
// 每條含顏色的規則複製一份，選擇器前加 html[data-theme=light]，顏色換成淺色對應色（只留含顏色的宣告）；
// @media 保留、@keyframes 略過；最後接上手動調整（src/theme-light.css）。
// styles.css 改了顏色，重新 npm run build 就會同步；theme-light.css 不要手動修改。
const PREFIX='html[data-theme=light]';
const COLOR=/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b|rgba?\([^)]*\)|\b(?:white|black)\b/gi;
const SHADOW_PROPS=/^(?:box-shadow|text-shadow|filter|-webkit-filter)$/;
const SKIP_PROPS=/^(?:-webkit-)?mask/;
// 與顏色有關的屬性：即使值沒有顏色（none、0、inherit、var(...)）也照抄一份，
// 讓淺色層的權重關係與原本一致（例如 .subs-link{background:none} 仍蓋得過 button 的底色）。
const COLOR_PROPS=/^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|text-decoration(?:-color)?|column-rule(?:-color)?|-webkit-text-fill-color|-webkit-tap-highlight-color|scrollbar-color)$/;

// 重點顏色直接指定（頁面底色、面板、文字、強調色與狀態色），其餘依亮度自動換算。
const MANUAL={
  '#06111f':'#eef2f7','#071321':'#f4f7fb','#06101c':'#e9eff6',
  '#0c1b2d':'#ffffff','#10233a':'#f3f6fa','#081624':'#edf2f8',
  '#223a54':'#d3dde8',
  '#f6f8fb':'#13202e','#ffffff':'#13202e','#96a9bd':'#5a6b7d',
  '#55d8ff':'#0a7fb0','#3ddc97':'#11905c','#ffc857':'#a86a00','#ff6b7a':'#cc2f42','#64a7ff':'#2f6fd0',
  // 隊徽底下的白色圓底維持白色。
  'rgba(248,251,255,0.96)':'rgba(248,251,255,0.96)','rgba(248,251,255,0.97)':'rgba(248,251,255,0.97)','rgba(248,251,255,0.95)':'rgba(248,251,255,0.95)'
};

const round=(value,digits=3)=>Number(value.toFixed(digits));

export function parseColor(text){
  const value=text.trim().toLowerCase();
  if(value==='white')return {r:255,g:255,b:255,a:1};
  if(value==='black')return {r:0,g:0,b:0,a:1};
  if(value.startsWith('#')){
    let hex=value.slice(1);
    if(hex.length<=4)hex=[...hex].map(ch=>ch+ch).join('');
    const n=index=>parseInt(hex.slice(index,index+2),16);
    return {r:n(0),g:n(2),b:n(4),a:hex.length===8?round(n(6)/255):1};
  }
  const parts=value.replace(/^rgba?\(|\)$/g,'').split(/[\s,/]+/).filter(Boolean).map(Number);
  return {r:parts[0],g:parts[1],b:parts[2],a:parts.length>3?parts[3]:1};
}

export function formatColor({r,g,b,a}){
  const c=[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))));
  if(a>=1)return '#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
  return `rgba(${c.join(',')},${round(a)})`;
}

const key=color=>{const c=parseColor(color);return c.a>=1?formatColor(c):`rgba(${c.r},${c.g},${c.b},${c.a})`};

function toHsl({r,g,b}){
  r/=255;g/=255;b/=255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;
  if(max===min)return {h:0,s:0,l};
  const d=max-min,s=l>0.5?d/(2-max-min):d/(max+min);
  const h=max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;
  return {h:h/6,s,l};
}

function toRgb({h,s,l}){
  if(!s)return {r:l*255,g:l*255,b:l*255};
  const hue=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p};
  const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;
  return {r:hue(p,q,h+1/3)*255,g:hue(p,q,h)*255,b:hue(p,q,h-1/3)*255};
}

// 深色主題的顏色 → 淺色主題的顏色。
export function lightColor(color){
  if(MANUAL[key(color)])return MANUAL[key(color)];
  const c=parseColor(color);
  // 半透明的黑色是遮罩或陰影：維持深色，淡一點。
  if(c.r+c.g+c.b<60&&c.a<1)return formatColor({r:0,g:0,b:0,a:c.a*0.55});
  const {h,s,l}=toHsl(c);
  let L,S=s;
  if(l<0.2){
    // 深色表面 → 淺色表面；保留層次（原本越亮的面板越白），並降低彩度。
    L=0.92+l*0.4;S=s*0.45;
  }else{
    // 邊框、文字、強調色：亮度反轉。
    L=Math.max(0.08,0.88-(l-0.2)*1.05);
    // 鮮豔的中間色（狀態色、強調色）在白底要更深才看得清楚。
    if(s>0.5&&l>=0.45&&l<=0.85)L=Math.min(L,0.36);
  }
  return formatColor({...toRgb({h,s:S,l:L}),a:c.a});
}

// 陰影維持深色、淡一點；有顏色的光暈照一般規則換算。
function shadowColor(color){
  const c=parseColor(color);
  return toHsl(c).l<0.25?formatColor({...c,a:c.a*0.45}):lightColor(color);
}

// 去掉註解（略過字串）。
function stripComments(css){
  let out='',i=0;
  while(i<css.length){
    const ch=css[i];
    if(ch==='"'||ch==="'"){const end=css.indexOf(ch,i+1);out+=css.slice(i,end+1);i=end+1;continue}
    if(css.startsWith('/*',i)){i=css.indexOf('*/',i+2)+2;continue}
    out+=ch;i++;
  }
  return out;
}

// 依最上層的 { } 切成區塊：{prelude, body}。
function blocks(css){
  const out=[];let i=0;
  while(i<css.length){
    const open=css.indexOf('{',i);
    if(open<0)break;
    let depth=1,j=open+1;
    while(j<css.length&&depth){if(css[j]==='{')depth++;else if(css[j]==='}')depth--;j++}
    out.push({prelude:css.slice(i,open).trim(),body:css.slice(open+1,j-1)});
    i=j;
  }
  return out;
}

// 在最上層（不在括號、字串裡）切開。
function splitTop(text,separator){
  const parts=[];let depth=0,quote='',start=0;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quote){if(ch===quote)quote='';continue}
    if(ch==='"'||ch==="'")quote=ch;
    else if(ch==='(')depth++;
    else if(ch===')')depth--;
    else if(ch===separator&&!depth){parts.push(text.slice(start,i));start=i+1}
  }
  parts.push(text.slice(start));
  return parts;
}

export function prefixSelector(selector){
  return splitTop(selector,',').map(part=>{
    const sel=part.trim();
    if(sel.startsWith(':root'))return ':root[data-theme=light]'+sel.slice(5);
    if(/^html(?![\w-])/.test(sel))return PREFIX+sel.slice(4);
    return PREFIX+' '+sel;
  }).join(',');
}

function lightDeclarations(body){
  const out=[];
  for(const declaration of splitTop(body,';')){
    const colon=declaration.indexOf(':');
    if(colon<0)continue;
    const prop=declaration.slice(0,colon).trim(),value=declaration.slice(colon+1).trim();
    if(!prop||SKIP_PROPS.test(prop))continue;
    COLOR.lastIndex=0;
    const hasColor=COLOR.test(value);
    if(!hasColor&&!COLOR_PROPS.test(prop))continue;
    const convert=SHADOW_PROPS.test(prop)?shadowColor:lightColor;
    out.push(`${prop}:${hasColor?value.replace(COLOR,match=>convert(match)):value}`);
  }
  return out;
}

function convert(css,indent=''){
  const out=[];
  for(const {prelude,body} of blocks(css)){
    if(prelude.startsWith('@keyframes')||prelude.startsWith('@-webkit-keyframes'))continue;
    if(prelude.startsWith('@')){
      const inner=convert(body,indent+'  ');
      if(inner.length)out.push(`${indent}${prelude}{\n${inner.join('\n')}\n${indent}}`);
      continue;
    }
    // 已經是淺色專用的規則不再轉換。
    if(prelude.includes('data-theme'))continue;
    const declarations=lightDeclarations(body);
    if(declarations.length)out.push(`${indent}${prefixSelector(prelude)}{${declarations.join(';')}}`);
  }
  return out;
}

export function buildLightTheme(css,extra=''){
  // Windows 取出的檔案可能是 CRLF，統一成 LF，產生的結果才會一致。
  css=css.replace(/\r\n?/g,'\n');extra=extra.replace(/\r\n?/g,'\n');
  return [
    '/* 自動產生：npm run build 依 styles.css 產生淺色主題（scripts/theme-light.mjs），請勿手動修改。',
    '   手動調整請寫在 src/theme-light.css。 */',
    ...convert(stripComments(css)),
    '',
    '/* ---- 手動調整（src/theme-light.css） ---- */',
    extra.trim(),
    ''
  ].join('\n');
}
