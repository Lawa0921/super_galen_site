import {build} from 'esbuild';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd(),source=path.join(root,'art-factory/rts/review'),out=path.join(root,'tmp/rts/handoff-20261006/review-site');
await mkdir(out,{recursive:true});
const entries=JSON.parse(await readFile(path.join(source,'handoff-20261006.json'),'utf8'));
for(const [unit,entry] of Object.entries(entries)){
 const folder=path.join(out,'models',unit);await mkdir(folder,{recursive:true});
 for(const lod of [0,1]){
  const name=`${entry.stem}-lod${lod}.glb`,bytes=await readFile(path.join(root,entry.base.slice(1),name));
  if(createHash('sha256').update(bytes).digest('hex')!==entry.hashes[lod])throw new Error(`${unit} LOD${lod} changed during packaging`);
  await writeFile(path.join(folder,name),bytes);
 }
 entry.base='./models/'+unit;
}
let html=await readFile(path.join(source,'handoff-20261006.html'),'utf8');
html=html.replace('/art-factory/rts/review/handoff-20261006.css','./app.css').replace('/art-factory/rts/tools/handoff_review_scene.ts','./app.js').replace('href="/games/rts/"','href="http://127.0.0.1:4324/games/rts/"');
await writeFile(path.join(out,'index.html'),html);
await copyFile(path.join(source,'handoff-20261006.css'),path.join(out,'app.css'));
await writeFile(path.join(out,'handoff-20261006.json'),JSON.stringify(entries,null,2)+'\n');
await build({entryPoints:[path.join(root,'art-factory/rts/tools/handoff_review_scene.ts')],outfile:path.join(out,'app.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,logLevel:'warning'});
console.log(JSON.stringify({out,units:Object.keys(entries),scope:'standalone local candidate review only; runtime registry unchanged'}));
