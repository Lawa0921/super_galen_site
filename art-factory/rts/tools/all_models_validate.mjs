import {readFile,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const validator=createRequire(import.meta.url)(path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator'));
const run='art-factory/rts/runs/all-models/2026-10-14-v1',manifest=JSON.parse(await readFile(run+'/review-manifest.json')),assets=[];
for(const [id,entry]of Object.entries(manifest.assets))for(const [lod,key]of ['url','lod1'].entries()){
 if(!entry[key])continue;const original='public'+entry[key],candidate=run+'/candidate/'+path.basename(original);let file=original;try{await access(candidate);file=candidate;}catch{}
 const bytes=await readFile(file),report=await validator.validateBytes(new Uint8Array(bytes),{uri:path.basename(file),maxIssues:0,externalResourceFunction:async uri=>new Uint8Array(await readFile(path.resolve(path.dirname(original),decodeURIComponent(uri))))});assets.push({id,lod,file,sha256:createHash('sha256').update(bytes).digest('hex'),...report});
}
const result={assets,errors:assets.reduce((n,r)=>n+r.issues.numErrors,0),warnings:assets.reduce((n,r)=>n+r.issues.numWarnings,0)};await writeFile(run+'/qa/gltf-validator.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({files:assets.length,errors:result.errors,warnings:result.warnings}));if(result.errors)process.exitCode=1;
