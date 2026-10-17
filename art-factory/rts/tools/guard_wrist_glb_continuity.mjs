/** Diagnostic-only post-export quaternion correction, keeping raw exports. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {canonicalizeRotationQuaternions} from './glb_quaternion_continuity.mjs';

const run=path.resolve(process.argv[2]??'art-factory/rts/runs/guard-right-hand-cage/2026-10-08-v18-wrist-export-continuity');
const inputMode=process.argv[3]??'direct';
if(!['direct','restored'].includes(inputMode))throw Error('Expected direct or restored input');
const input=JSON.parse(fs.readFileSync(path.join(run,`qa/export-${inputMode}.json`),'utf8'));
const sha=data=>createHash('sha256').update(data).digest('hex');
const exports=input.exports.map(asset=>{
  const bytes=fs.readFileSync(path.join(run,'candidate',asset.file));
  if(sha(bytes)!==asset.sha256)throw Error('Input export hash changed');
  const fixed=canonicalizeRotationQuaternions(bytes),file=asset.file.replace(`-${inputMode}-`,'-continuous-');
  fs.writeFileSync(path.join(run,'candidate',file),fixed.buffer);
  return {lod:asset.lod,file,bytes:fixed.buffer.length,sha256:sha(fixed.buffer),source_sha256:asset.sha256,quaternion_correction:fixed.report};
});
const report={...input,mode:'continuous',status:'quaternion_corrected_pending_actual_three_interpolation',exports};
fs.writeFileSync(path.join(run,'qa/export-continuous.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({mode:report.mode,exports:exports.map(e=>({lod:e.lod,sha256:e.sha256,changedKeys:e.quaternion_correction.changedKeys}))},null,2));
