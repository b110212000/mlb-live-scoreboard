const assert=require('assert/strict');
const fs=require('fs');

(async()=>{
  const t=await import('../scripts/theme-light.mjs');

  // 顏色解析與輸出。
  assert.deepEqual(t.parseColor('#fff'),{r:255,g:255,b:255,a:1});
  assert.deepEqual(t.parseColor('#0006'),{r:0,g:0,b:0,a:0.4});
  assert.deepEqual(t.parseColor('rgba(248,251,255,.96)'),{r:248,g:251,b:255,a:0.96});
  assert.equal(t.formatColor({r:1,g:2,b:3,a:1}),'#010203');
  assert.equal(t.formatColor({r:0,g:0,b:0,a:0.2}),'rgba(0,0,0,0.2)');

  // 指定的重點色。
  assert.equal(t.lightColor('#06111f'),'#eef2f7');
  assert.equal(t.lightColor('#0c1b2d'),'#ffffff');
  assert.equal(t.lightColor('#f6f8fb'),'#13202e');
  assert.equal(t.lightColor('#fff'),'#13202e');
  assert.equal(t.lightColor('white'),'#13202e');
  assert.equal(t.lightColor('#55d8ff'),'#0a7fb0');
  // 隊徽白色圓底不變。
  assert.equal(t.lightColor('rgba(248,251,255,.96)'),'rgba(248,251,255,0.96)');
  // 半透明黑色（遮罩）維持深色、淡一點。
  assert.equal(t.lightColor('rgba(0,0,0,.52)'),'rgba(0,0,0,0.286)');
  // 自動換算：深色表面變淺色、保留層次（原本越亮越白）；淺色文字變深色；鮮豔中間色加深。
  const lum=hex=>{const c=t.parseColor(hex);return (0.2126*c.r+0.7152*c.g+0.0722*c.b)/255};
  const page=lum(t.lightColor('#091827')),card=lum(t.lightColor('#132c45'));
  assert(page>0.85&&card>0.85,'surfaces become light');
  assert(card>page,'lighter dark surface stays lighter');
  assert(lum(t.lightColor('#c5d4e2'))<0.25,'light text becomes dark');
  assert(lum(t.lightColor('#8bf0b9'))<0.5&&lum(t.lightColor('#8bf0b9'))<lum('#8bf0b9')-0.3,'bright status colour darkens for white backgrounds');
  // 半透明白色疊層 → 半透明深色。
  assert.match(t.lightColor('#ffffff12'),/^rgba\((\d+),\1,\1,0\.071\)$/);

  // 選擇器加前綴。
  assert.equal(t.prefixSelector(':root'),':root[data-theme=light]');
  assert.equal(t.prefixSelector('html'),'html[data-theme=light]');
  assert.equal(t.prefixSelector('html::-webkit-scrollbar, body'),'html[data-theme=light]::-webkit-scrollbar,html[data-theme=light] body');
  assert.equal(t.prefixSelector('.a:is(.b,.c) .d'),'html[data-theme=light] .a:is(.b,.c) .d');
  assert.equal(t.prefixSelector('#featureMenu::backdrop'),'html[data-theme=light] #featureMenu::backdrop');

  const css=`
    /* 註解 {不要被當成規則} */
    :root{--bg:#06111f;--size:4px}
    button{min-height:42px;background:#0b1829;color:var(--text);border:1px solid var(--line)}
    .subs-link{padding:4px;background:none;color:var(--accent)}
    .card{box-shadow:0 10px 30px rgba(0,0,0,.4),0 0 0 1px #55d8ff;border-radius:8px}
    .fade{-webkit-mask-image:linear-gradient(#000 60%,transparent)}
    .imp{color:#fff!important}
    @media(max-width:600px){.x{background:#0b1a2b;padding:2px}.y{gap:2px}}
    @keyframes pulse{to{box-shadow:0 0 0 9px rgba(61,220,151,0)}}
    [data-theme-option=dark] .swatch{background:#06111f}
  `;
  const out=t.buildLightTheme(css,'html[data-theme=light] .extra{color:red}');
  // 只留顏色相關宣告、變數換算、非顏色變數不輸出。
  assert(out.includes(':root[data-theme=light]{--bg:#eef2f7}'));
  assert(out.includes('html[data-theme=light] button{background:#f2f5f8;color:var(--text);border:1px solid var(--line)}'),'button colours');
  assert(!out.includes('min-height'));
  // 沒有顏色值但會影響顏色的宣告也照抄，維持原本的權重關係。
  assert(out.includes('html[data-theme=light] .subs-link{background:none;color:var(--accent)}'));
  // 陰影維持深色、淡一點；有顏色的部分照一般規則。
  assert(out.includes('html[data-theme=light] .card{box-shadow:0 10px 30px rgba(0,0,0,0.18),0 0 0 1px #0a7fb0}'));
  // 遮罩、@keyframes、已是主題專用的規則不轉換；!important 保留；@media 保留。
  assert(!out.includes('mask'));assert(!out.includes('pulse'));assert(!out.includes('swatch'));
  assert(out.includes('html[data-theme=light] .imp{color:#13202e!important}'));
  assert(/@media\(max-width:600px\)\{\n\s+html\[data-theme=light\] \.x\{background:#[0-9a-f]{6}\}\n\}/.test(out));
  assert(!out.includes('.y{'));
  assert(!out.includes('不要被當成規則'));
  // 手動調整接在最後。
  assert(out.trim().endsWith('html[data-theme=light] .extra{color:red}'));

  // 專案裡的 theme-light.css 必須是由目前的 styles.css 產生的（改了 styles.css 要重新 npm run build）。
  const expected=t.buildLightTheme(fs.readFileSync('styles.css','utf8'),fs.readFileSync('src/theme-light.css','utf8'));
  assert.equal(fs.readFileSync('theme-light.css','utf8').replace(/\r\n/g,'\n'),expected,'theme-light.css is stale: run npm run build');

  console.log('PASS light theme: colour mapping (manual tokens, surfaces keep elevation, text/accents darken, overlays and shadows stay dark), selector prefixes, cascade mirroring, @media, keyframes/mask/data-theme skipped, !important, generated file up to date');
})().catch(err=>{console.error(err);process.exit(1)});
