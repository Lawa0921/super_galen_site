const fs=require('fs'),path=require('path');
const validator=require(path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator'));
(async()=>{
 const root=path.resolve(process.argv[2]),results={};
 for(const lod of [0,1]){
  const name=`original-crossbow-grip-lod${lod}.glb`;
  results[lod]=await validator.validateBytes(new Uint8Array(fs.readFileSync(path.join(root,'candidate',name))),{uri:name,maxIssues:100});
  console.log(`LOD${lod}: errors=${results[lod].issues.numErrors} warnings=${results[lod].issues.numWarnings}`);
 }
 fs.writeFileSync(path.join(root,'qa','gltf-validator.json'),JSON.stringify(results,null,2));
 if(Object.values(results).some(r=>r.issues.numErrors))process.exitCode=1;
})();
