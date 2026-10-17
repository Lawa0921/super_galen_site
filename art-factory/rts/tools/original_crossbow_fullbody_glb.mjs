/** Structural/export QA, independent of model quality. */
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const validator=require(path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator'));
const run=process.argv[2]??'art-factory/rts/runs/original-crossbow-complete/2026-10-07-v2';
const authoring=JSON.parse(await readFile(`${run}/qa/authoring.json`,'utf8'));
const exported=JSON.parse(await readFile(`${run}/qa/export.json`,'utf8'));
assert.equal(exported.source_sha256,authoring.candidate_sha256);
const rows=[];
for(const lod of [0,1]){
 const bytes=await readFile(`${run}/candidate/original-crossbow-grip-lod${lod}.glb`);
 const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 const report=await validator.validateBytes(new Uint8Array(bytes),{uri:`fullbody-lod${lod}.glb`,maxIssues:1000});
 const names=gltf.nodes.map(n=>n.name);
 for(const name of [...authoring.equipment.new_objects,...authoring.equipment.new_bones])assert(names.includes(name),`Missing ${name}`);
 assert.deepEqual(gltf.animations.map(a=>a.name).sort(),['Attack','Death','Hurt','Idle','Walk']);
 const attack=gltf.animations.find(a=>a.name==='Attack');
 const duration=Math.max(...attack.samplers.map(s=>gltf.accessors[s.input].max[0]));
 assert.equal(duration,3);
 const sha=createHash('sha256').update(bytes).digest('hex');assert.equal(sha,exported.rows[lod].sha256);
 rows.push({lod,sha256:sha,attackDuration:duration,jointCount:gltf.skins[0].joints.length,issues:report.issues});
 assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);
}
await writeFile(`${run}/qa/glb-validation.json`,JSON.stringify({structural_pass:true,art_approved:false,runtime_publish_allowed:false,rows},null,2)+'\n');
console.log(JSON.stringify({structural_pass:true,art_approved:false,rows:rows.map(r=>({...r,issues:{errors:r.issues.numErrors,warnings:r.issues.numWarnings,infos:r.issues.numInfos}}))}));
