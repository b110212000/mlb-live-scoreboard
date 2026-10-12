// 列出程式裡所有 t('…') / tParts('…') 的字典 key（中文原文），供 tests/i18n.cjs 檢查翻譯是否齊全。
// 用法：node scripts/i18n-keys.mjs [--missing]   （--missing 只列出英文或日文字典缺少的 key）
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

async function sourceFiles(dir){
  const out=[];
  for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})){
    const rel=path.posix.join(dir,entry.name);
    if(entry.isDirectory()){if(entry.name!=='locales')out.push(...await sourceFiles(rel));}
    else if(/\.(js|jsx)$/.test(entry.name))out.push(rel);
  }
  return out;
}

// 解析 JS 字串字面值（'…' 或 "…"）的內容，處理跳脫字元。
function unescape(body){
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g,(match,code)=>{
    if(code[0]==='u')return String.fromCodePoint(parseInt(code.replace(/[u{}]/g,''),16));
    if(code[0]==='x')return String.fromCharCode(parseInt(code.slice(1),16));
    return {n:'\n',t:'\t',r:'\r'}[code]??code;
  });
}

export async function collectKeys(){
  const keys=new Map();
  const pattern=/\b(?:t|tParts)\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")/g;
  for(const file of await sourceFiles('src')){
    if(file==='src/i18n.js')continue;
    const source=await readFile(path.join(root,file),'utf8');
    for(const match of source.matchAll(pattern)){
      const key=unescape(match[1]??match[2]);
      if(!keys.has(key))keys.set(key,file);
    }
  }
  return keys;
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
  const keys=await collectKeys();
  const onlyMissing=process.argv.includes('--missing');
  const dicts={};
  for(const lang of ['en','ja'])dicts[lang]=(await import(pathToFileURL(path.join(root,'src','locales',lang+'.js')).href)).default;
  const rows=[...keys].filter(([key])=>!onlyMissing||!(key in dicts.en)||!(key in dicts.ja));
  console.log(JSON.stringify(rows.map(([key,file])=>({key,file,en:key in dicts.en,ja:key in dicts.ja})),null,1));
  console.error(`${keys.size} keys, ${rows.length} listed`);
}
