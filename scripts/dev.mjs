import {context} from 'esbuild';
import {enginePlugin} from './engine-plugin.mjs';
import {readFile} from 'node:fs/promises';
await import('./build.mjs');
const {version}=JSON.parse(await readFile('package.json','utf8'));
const ctx=await context({entryPoints:['src/main.jsx'],outfile:`assets/app-${version}.js`,bundle:true,format:'esm',jsx:'automatic',plugins:[enginePlugin],define:{'process.env.NODE_ENV':'"development"'}});
await ctx.watch();const server=await ctx.serve({servedir:'.',host:'127.0.0.1',port:5173});
console.log(`http://${server.hosts[0]}:${server.port}/`);
