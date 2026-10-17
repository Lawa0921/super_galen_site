import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const {validateBytes}=createRequire(import.meta.url)(path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator'));
const run='art-factory/rts/runs/work-cast/2026-10-11-v2',rows=[];
for(const unit of ['worker','priest','commander'])for(const lod of [0,1]){
  const file=`${run}/candidate/${unit}-lod${lod}.glb`,bytes=await readFile(file);
  const report=await validateBytes(new Uint8Array(bytes),{uri:`${unit}-lod${lod}.glb`,maxIssues:200,externalResourceFunction:async uri=>new Uint8Array(await readFile(path.resolve('public/assets/games/rts/models',decodeURIComponent(uri))))});
  rows.push({unit,lod,file,sha256:createHash('sha256').update(bytes).digest('hex'),issues:report.issues,info:report.info});
}
await writeFile(`${run}/qa/gltf-validator.json`,JSON.stringify({runtime_publish_allowed:false,assets:rows},null,2)+'\n');
console.log(JSON.stringify(rows.map(r=>({unit:r.unit,lod:r.lod,errors:r.issues.numErrors,warnings:r.issues.numWarnings,animations:r.info.animationCount}))));
if(rows.some(r=>r.issues.numErrors))process.exitCode=1;
