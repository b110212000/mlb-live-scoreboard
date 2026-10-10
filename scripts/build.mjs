import {build} from 'esbuild';
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {enginePlugin} from './engine-plugin.mjs';
const {version}=JSON.parse(await readFile('package.json','utf8'));
await mkdir('assets',{recursive:true});
await Promise.all([180,192,512].map(size=>sharp('app-icon.svg').resize(size,size).png().toFile(`assets/app-icon-${size}.png`)));

await build({entryPoints:['src/main.jsx'],outfile:`assets/app-${version}.js`,bundle:true,minify:true,format:'esm',target:['safari16','chrome110'],jsx:'automatic',legalComments:'linked',plugins:[enginePlugin],define:{'process.env.NODE_ENV':'"production"'},metafile:true}).then(async result=>writeFile('build-meta.json',JSON.stringify(result.metafile,null,2)));
let html=await readFile('src/index.html','utf8');
html=html.replaceAll('__VERSION__',version);
await writeFile('index.html',html);
console.log(`Built React scoreboard v${version}`);
