import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const validator=createRequire(import.meta.url)(path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator'));
const run='art-factory/rts/runs/commander-assembly/2026-10-14-v1',assets=[];
for(const lod of [0,1]){const file=`${run}/candidate/commander-lod${lod}.glb`,bytes=await readFile(file);const report=await validator.validateBytes(new Uint8Array(bytes),{uri:path.basename(file),maxIssues:0,externalResourceFunction:async uri=>new Uint8Array(await readFile(path.resolve('public/assets/games/rts/models',decodeURIComponent(uri))))});assets.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),...report});}
const result={assets,errors:assets.reduce((n,r)=>n+r.issues.numErrors,0),warnings:assets.reduce((n,r)=>n+r.issues.numWarnings,0)};await writeFile(run+'/qa/gltf-validator.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({errors:result.errors,warnings:result.warnings}));if(result.errors)process.exitCode=1;
