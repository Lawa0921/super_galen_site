import {build} from 'esbuild';
import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('tmp/rts/handoff-20261006/review-site/riverbank');await mkdir(path.join(out,'models'),{recursive:true});
await copyFile('art-factory/rts/runs/riverbank/2026-10-07-v1/raw/stone-bridge-baseline.glb',path.join(out,'models/stone-bridge-baseline.glb'));
await copyFile('art-factory/rts/review/handoff-20261006.css',path.join(out,'app.css'));
const html=(await readFile('art-factory/rts/review/riverbank.html','utf8')).replace('./handoff-20261006.css','./app.css').replace('../tools/riverbank_review_scene.ts','./app.js').replace('href="/games/rts/"','href="http://127.0.0.1:4324/games/rts/"');
await writeFile(path.join(out,'index.html'),html);
await build({entryPoints:['art-factory/rts/tools/riverbank_review_scene.ts'],outfile:path.join(out,'app.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,logLevel:'warning'});
await mkdir(path.join(out,'shots'),{recursive:true});
for(const folder of ['channel','interaction']){
 const source=`art-factory/rts/runs/riverbank/2026-10-07-v1/qa/runtime/${folder}`;
 for(const file of await readdir(source).catch(error=>{if(error.code==='ENOENT')return [];throw error;}))if(file.endsWith('.png'))await copyFile(path.join(source,file),path.join(out,'shots',file));
}
console.log('http://127.0.0.1:4334/riverbank/');
