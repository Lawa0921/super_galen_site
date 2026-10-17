import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {validateBytes}=createRequire(import.meta.url)(path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator'));
const run='art-factory/rts/runs/detail-refinement/2026-10-07-v1';
const parse=b=>{const n=b.readUInt32LE(12);return {doc:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};};
const rows=[];
for(const filename of (await readdir(`${run}/candidate`)).filter(n=>n.endsWith('.glb'))){
 const bytes=await readFile(`${run}/candidate/${filename}`),old=await readFile(`tmp/rts/handoff-20261006/review-site/model-detail/before/${filename}`);
 const {doc,bin}=parse(bytes),before=parse(old),unit=/^(guard|crossbow)(-lod1)?\.glb$/.test(filename);
 const report=await validateBytes(new Uint8Array(bytes),{uri:filename,maxIssues:1000,externalResourceFunction:async uri=>new Uint8Array(await readFile(`${run}/candidate/materials/${path.basename(uri)}`))});
 await writeFile(`${run}/qa/validator-${filename}.json`,JSON.stringify(report,null,2)+'\n');
 assert.equal(report.issues.numErrors,0,filename+' glTF validation');
 if(unit){
   for(const key of ['nodes','skins','animations','meshes','accessors','bufferViews','scenes'])assert.deepEqual(doc[key],before.doc[key],filename+' preserves '+key);
   assert.deepEqual(bin,before.bin,filename+' exact original geometry/weights/animation bytes');
 }
 const bounds=d=>{
   const positions=d.meshes.flatMap(m=>m.primitives.map(p=>d.accessors[p.attributes.POSITION]));
   return {min:[0,1,2].map(k=>Math.min(...positions.map(a=>a.min[k]))),max:[0,1,2].map(k=>Math.max(...positions.map(a=>a.max[k])))};
 };
 const b=bounds(doc),o=bounds(before.doc);
 if(!unit)for(const k of [0,2]){assert.ok(b.min[k]>=o.min[k]-.08,filename+' min footprint');assert.ok(b.max[k]<=o.max[k]+.08,filename+' max footprint');}
 const triangles=doc.meshes.reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0),0);
 if(!unit)assert.ok(triangles<(filename==='rock.glb'?4000:20000),filename+' triangles');
 const shared=doc.images?.filter(i=>i.uri?.includes('/materials/detail-v1/'))??[];
 assert.ok(shared.length>0,filename+' shared original materials');
 rows.push({filename,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),triangles,bounds:b,previousBounds:o,validatorErrors:report.issues.numErrors,validatorWarnings:report.issues.numWarnings,sharedImages:shared.length,exactUnitDataPreserved:unit});
}
await writeFile(`${run}/qa/structural.json`,JSON.stringify({status:'passed',rows},null,2)+'\n');
console.log(JSON.stringify(rows.map(r=>({file:r.filename,triangles:r.triangles,bytes:r.bytes,errors:r.validatorErrors}))));
