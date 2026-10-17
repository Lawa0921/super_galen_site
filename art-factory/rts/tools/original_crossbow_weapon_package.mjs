import {build} from 'esbuild';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const run=path.resolve('art-factory/rts/runs/original-crossbow-weapon/2026-10-06-v1');
const out=path.resolve('tmp/rts/handoff-20261006/review-site'),folder=path.join(out,'models/weapon-only');await mkdir(folder,{recursive:true});
const report=JSON.parse(await readFile(path.join(run,'geometry-candidate/weapon-candidate-report.json'),'utf8')),hashes=[];
for(const lod of [0,1]){const name=`original-crossbow-grip-lod${lod}.glb`,bytes=await readFile(path.join(run,'geometry-candidate',name));const sha=createHash('sha256').update(bytes).digest('hex');if(sha!==report.files[name])throw Error('Source changed');hashes.push(sha);await writeFile(path.join(folder,name),bytes);}
await copyFile('art-factory/rts/review/crossbow-weapon-20261006.html',path.join(out,'crossbow-weapon.html'));
await writeFile(path.join(out,'weapon.json'),JSON.stringify({hashes,base:'./models/weapon-only'},null,2)+'\n');
await copyFile(path.join(run,'qa/detail/weapon-lod0-quarter.png'),path.join(out,'crossbow-weapon.png'));
await build({entryPoints:['art-factory/rts/tools/original_crossbow_weapon_scene.ts'],outfile:path.join(out,'weapon.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,logLevel:'warning'});
console.log(JSON.stringify({out,hashes,scope:'Local asset-only inspection; motion rejected; no runtime publication'}));
