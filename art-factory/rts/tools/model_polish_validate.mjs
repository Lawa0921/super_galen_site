// Khronos glTF-Validator over every model-polish candidate (external polish-v1 maps resolved from public/).
// Usage: node art-factory/rts/tools/model_polish_validate.mjs [validator-module-dir] [run-dir]
import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const where=process.argv[2]??'tmp/rts/handoff-20261006/validator/node_modules/gltf-validator';
const validator=createRequire(import.meta.url)(path.resolve(where));
const run=process.argv[3]??'art-factory/rts/runs/model-polish/2026-10-16-v1',dir=run+'/candidate/models',assets=[];
for(const name of (await readdir(dir)).filter(n=>n.endsWith('.glb')).sort()){
  const bytes=await readFile(path.join(dir,name)),models='public/assets/games/rts/models';
  const report=await validator.validateBytes(new Uint8Array(bytes),{uri:name,maxIssues:0,
    externalResourceFunction:async uri=>new Uint8Array(await readFile(path.resolve(models,decodeURIComponent(uri))))});
  assets.push({file:name,sha256:createHash('sha256').update(bytes).digest('hex'),errors:report.issues.numErrors,warnings:report.issues.numWarnings,
    messages:report.issues.messages.filter(m=>m.severity<=1).map(m=>`${m.code} ${m.pointer??''}`).slice(0,12)});
}
const result={validator:where,assets,errors:assets.reduce((n,r)=>n+r.errors,0),warnings:assets.reduce((n,r)=>n+r.warnings,0)};
await writeFile(run+'/qa/gltf-validator.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({files:assets.length,errors:result.errors,warnings:result.warnings}));
for(const a of assets)if(a.errors||a.warnings)console.log(a.file,a.errors,a.warnings,a.messages.join(' ; '));
if(result.errors)process.exitCode=1;
