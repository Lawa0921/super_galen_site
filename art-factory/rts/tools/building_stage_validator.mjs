import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const validator=require('C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts/tmp/rts/handoff-20261006/validator/node_modules/gltf-validator');
const run=path.resolve('art-factory/rts/runs/building-stages/2026-10-08-v1');
const rows=[];
for(const id of ['barracks','stable','workshop']) {
  const bytes=await fs.readFile(path.join(run,'candidate',id+'.glb'));
  const result=await validator.validateBytes(new Uint8Array(bytes), {uri:id+'.glb',externalResourceFunction:async uri=>{
    const target=path.resolve(run,'candidate',decodeURIComponent(uri));
    if(!target.startsWith(path.join(run,'candidate')+path.sep)) throw new Error('Texture escapes candidate');
    return new Uint8Array(await fs.readFile(target));
  }});
  rows.push({id,issues:result.issues,runtime_publish_allowed:false});
}
await fs.writeFile(path.join(run,'qa/gltf-validator.json'),JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify(rows.map(row=>({id:row.id,errors:row.issues.numErrors,warnings:row.issues.numWarnings})),null,2));
if(rows.some(row=>row.issues.numErrors)) process.exitCode=1;
