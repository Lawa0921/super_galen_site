/** Khronos glTF validation of the staged procedural-gauntlet candidates with their shipped external textures. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const {validateBytes}=createRequire(import.meta.url)(path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator'));
const RUN_DIRS={worker:'2026-10-09-worker',crossbow:'2026-10-09-crossbow-a2',guard:'2026-10-09-guard-a2'};
const runs='art-factory/rts/runs/procedural-gauntlet',models='public/assets/games/rts/models',rows=[];
for(const unit of ['worker','crossbow','guard'])for(const ident of [unit,unit+'-lod1']){
  const file=`${runs}/${RUN_DIRS[unit]}/candidate/${ident}.glb`,bytes=await readFile(file);
  const report=await validateBytes(new Uint8Array(bytes),{uri:`${ident}.glb`,maxIssues:200,externalResourceFunction:async uri=>new Uint8Array(await readFile(path.join(models,decodeURIComponent(uri))))});
  const top=report.issues.messages.filter(m=>m.severity<=1).slice(0,12).map(m=>`${m.code} ${m.pointer??''}`);
  rows.push({id:ident,candidate:file,sha256:createHash('sha256').update(bytes).digest('hex'),numErrors:report.issues.numErrors,numWarnings:report.issues.numWarnings,
    numInfos:report.issues.numInfos,errorsAndWarnings:top,validatorVersion:report.validatorVersion,info:{totalTriangleCount:report.info?.totalTriangleCount,animationCount:report.info?.animationCount,hasSkins:report.info?.hasSkins}});
}
await writeFile(`${runs}/gltf-validator.json`,JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify(rows.map(r=>({id:r.id,e:r.numErrors,w:r.numWarnings,tri:r.info.totalTriangleCount,top:r.errorsAndWarnings.slice(0,3)}))));
