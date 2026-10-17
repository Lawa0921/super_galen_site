import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const validator=require('../../../tmp/rts/handoff-20261006/validator/node_modules/gltf-validator');
const run=path.resolve('art-factory/rts/runs/unit-shared-textures/2026-10-09-v1');
const parity=JSON.parse(await readFile(path.join(run,'qa/byte-parity.json'),'utf8'));
const rows=[];
for(const row of parity.models){
  const bytes=await readFile(path.join(run,'candidate/models',row.id+'.glb'));
  if(createHash('sha256').update(bytes).digest('hex')!==row.candidate_sha256)throw new Error('Candidate SHA changed');
  const result=await validator.validateBytes(new Uint8Array(bytes),{uri:row.id+'.glb',externalResourceFunction:async uri=>{
    const shared=uri.match(/^\.\.\/materials\/unit-shared\/([a-f0-9]{64}\.(?:jpg|png))$/);
    if(shared)return new Uint8Array(await readFile(path.join(run,'candidate/materials/unit-shared',shared[1])));
    const existing=uri.match(/^\.\.\/(materials\/detail-v1\/[A-Za-z0-9._-]+\.(?:jpg|png)|terrain\/dirt-road\.png)$/);
    if(existing)return new Uint8Array(await readFile(path.resolve('public/assets/games/rts',existing[1])));
    throw new Error('Unrecognised external material URI: '+uri);
  }});
  rows.push({id:row.id,sha256:row.candidate_sha256,issues:result.issues});
}
await writeFile(path.join(run,'qa/gltf-validator.json'),JSON.stringify({validatorVersion:validator.version(),rows},null,2)+'\n');
console.log(JSON.stringify(rows.map(row=>({id:row.id,errors:row.issues.numErrors,warnings:row.issues.numWarnings}))));
if(rows.some(row=>row.issues.numErrors))process.exitCode=1;
