// 多國語系：程式裡每個 t('中文原文') 在英文、日文字典都要有翻譯，參數一致，且沒有用不到的 key。
const assert=require('assert/strict');
const path=require('path');
const {pathToFileURL}=require('url');

const root=path.resolve(__dirname,'..');
const load=rel=>import(pathToFileURL(path.join(root,rel)).href);

(async()=>{
  const {collectKeys}=await load('scripts/i18n-keys.mjs');
  const keys=await collectKeys();
  assert(keys.size>500,'should find the t() keys in src');
  const dicts={en:(await load('src/locales/en.js')).default,ja:(await load('src/locales/ja.js')).default};
  const params=text=>[...new Set([...String(text).matchAll(/\{(\w+)\}/g)].map(match=>match[1]))].sort();
  for(const [lang,dict] of Object.entries(dicts)){
    const missing=[...keys.keys()].filter(key=>!Object.prototype.hasOwnProperty.call(dict,key));
    assert.deepEqual(missing,[],`${lang}.js 缺少翻譯（node scripts/i18n-keys.mjs --missing 可列出）`);
    const unused=Object.keys(dict).filter(key=>!keys.has(key));
    assert.deepEqual(unused,[],`${lang}.js 有程式沒用到的 key`);
    for(const [key,value] of Object.entries(dict)){
      assert(typeof value==='string'&&value.length>0,`${lang}.js 翻譯是空的：${key}`);
      assert.deepEqual(params(value),params(key),`${lang}.js 參數不一致：${key}`);
    }
  }
  // 英文翻譯不應留下中文；日文翻譯不應出現日文不用的繁體字。
  const han=/\p{Script=Han}/u;
  assert.deepEqual(Object.entries(dicts.en).filter(([,value])=>han.test(value)).map(([key])=>key),[],'英文翻譯裡有漢字');
  const traditional=/[這們嗎說與發對會來點數壘擊戰讀單擇關裡錄壞觸聯]/u;
  assert.deepEqual(Object.entries(dicts.ja).filter(([,value])=>traditional.test(value)).map(([key])=>key),[],'日文翻譯裡有繁體字');

  const i18n=await load('src/i18n.js');
  // 自動偵測：裝置語言清單中第一個中文 / 日文 / 英文；其他語言用英文；沒有資料時用中文。
  assert.equal(i18n.detectLang(['zh-TW','en-US']),'zh');
  assert.equal(i18n.detectLang(['zh-Hans-CN']),'zh');
  assert.equal(i18n.detectLang(['ja-JP','en-US']),'ja');
  assert.equal(i18n.detectLang(['en-GB']),'en');
  assert.equal(i18n.detectLang(['fr-FR','ja']),'ja');
  assert.equal(i18n.detectLang(['fr-FR','de-DE']),'en');
  assert.equal(i18n.detectLang([]),'zh');
  assert.equal(i18n.resolveLang('ja'),'ja');
  assert.equal(i18n.resolveLang('auto'),i18n.detectLang());
  assert.deepEqual(i18n.LANGS.map(([key])=>key),['auto','zh','en','ja']);

  // t()：中文原文就是 key；沒有翻譯時回傳原文；缺少的參數保留 {name}。
  i18n.setLangPref('zh');
  assert.equal(i18n.lang(),'zh');assert.equal(i18n.locale(),'zh-TW');
  assert.equal(i18n.t('{n} 局上',{n:3}),'3 局上');
  assert.equal(i18n.t('字典裡沒有的文字'),'字典裡沒有的文字');
  i18n.setLangPref('en');
  assert.equal(i18n.lang(),'en');assert.equal(i18n.locale(),'en-US');
  assert.equal(i18n.t('{n} 局上',{n:3}),'Top 3');
  assert.equal(i18n.t('{n} 局上'),'Top {n}');
  assert.equal(i18n.t('{n} 局',{n:9}),'Inning 9');
  assert.equal(i18n.t('{ip} 局',{ip:'6.1'}),'6.1 IP');
  assert.equal(i18n.t('字典裡沒有的文字'),'字典裡沒有的文字');
  // tParts()：把翻譯切開，{link} 換成元件。
  const link={type:'a'};
  const parts=i18n.tParts('收不到通知？到{link}確認這台裝置能收到推播。',{link});
  assert.equal(parts.filter(part=>part===link).length,1);
  assert(parts.every(part=>part===link||typeof part==='string'));
  assert(!parts.join('').includes('{link}'));
  i18n.setLangPref('ja');
  assert.equal(i18n.lang(),'ja');assert.equal(i18n.locale(),'ja-JP');
  assert.equal(i18n.t('全壘打'),'本塁打');
  assert.equal(i18n.t('{n} 局下',{n:7}),'7回裏');
  i18n.setLangPref('zh');

  // Worker 推播 / 行事曆文字：三種語言的項目要一致。
  const messages=await load('worker/src/messages.js');
  const shape=value=>Object.fromEntries(Object.entries(value).map(([key,item])=>[key,item&&typeof item==='object'?shape(item):typeof item]));
  const zhShape=shape(messages.text('zh'));
  for(const lang of messages.LANGS)assert.deepEqual(shape(messages.text(lang)),zhShape,`worker ${lang} 文字項目不一致`);
  assert.equal(messages.normalizeLang('fr'),'zh');assert.equal(messages.normalizeLang(undefined),'zh');
  assert.equal(messages.teamShortName(119,'en'),'Dodgers');assert.equal(messages.teamShortName(119,'ja'),'ドジャース');
  assert.equal(messages.teamShortName(999,'ja','Las Vegas Aviators'),'Las Vegas Aviators');
  // 前端 src/teams.js 與 Worker 的隊名要一致。
  const {MLB_TEAMS}=await load('src/teams.js');
  for(const team of MLB_TEAMS)assert.deepEqual(['zh','en','ja'].map(lang=>messages.teamShortName(team.id,lang)),[team.name,team.nick,team.ja],`隊名不一致：${team.id}`);
  const snapshot={awayName:'Los Angeles Dodgers',homeName:'Milwaukee Brewers',awayTeamId:119,homeTeamId:158,awayScore:3,homeScore:2,currentInning:7,isTopInning:false};
  assert.equal(messages.scoreLine(snapshot,'zh'),'Los Angeles Dodgers 3：2 Milwaukee Brewers');
  assert.equal(messages.scoreLine(snapshot,'en'),'Los Angeles Dodgers 3-2 Milwaukee Brewers');
  assert.equal(messages.scoreLine(snapshot,'ja'),'ドジャース 3－2 ブルワーズ');
  assert.deepEqual(['zh','en','ja'].map(lang=>messages.inningText(snapshot,lang)),['7 局下','Bot 7','7回裏']);
  console.log('i18n ok');
})().catch(err=>{console.error(err);process.exit(1)});
