/** Read-only Khronos validator package reused from main RTS worktree. */
const fs=require('node:fs'),path=require('node:path');
const crypto=require('node:crypto');
const validator=require('C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts/tmp/rts/handoff-20261006/validator/node_modules/gltf-validator');
const run=path.resolve('art-factory/rts/runs/landmark-kit/2026-10-08-v1');
(async()=>{
  const results=[];
  for(const name of fs.readdirSync(path.join(run,'candidate')).filter(n=>n.endsWith('.glb')).sort()){
    const bytes=fs.readFileSync(path.join(run,'candidate',name));
    const report=await validator.validateBytes(new Uint8Array(bytes),{uri:name,maxIssues:0,writeTimestamp:false});
    results.push({candidate:name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),...report});
  }
  const errors=results.reduce((n,r)=>n+r.issues.numErrors,0),warnings=results.reduce((n,r)=>n+r.issues.numWarnings,0);
  fs.writeFileSync(path.join(run,'qa/gltf-validator.json'),JSON.stringify({validator:validator.version(),results,errors,warnings},null,2)+'\n');
  console.log(JSON.stringify({files:results.length,errors,warnings}));process.exitCode=errors?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
