const fs=require('node:fs'),path=require('node:path');
const validator=require(path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator'));
const run=path.resolve('art-factory/rts/runs/highland-pine/2026-10-06-v1');
validator.validateBytes(new Uint8Array(fs.readFileSync(path.join(run,'candidate/pine.glb'))),{uri:'pine.glb',maxIssues:100}).then(report=>{
  fs.writeFileSync(path.join(run,'qa/gltf-validator.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.issues));process.exitCode=report.issues.numErrors?1:0;
}).catch(error=>{console.error(error);process.exitCode=1;});
