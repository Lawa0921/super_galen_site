import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {Matrix4,Vector3,Quaternion} from 'three';
const run='art-factory/rts/runs/modular-kingdom/2026-10-08-v1';
const {validateBytes}=createRequire(import.meta.url)(path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator'));
const kit=JSON.parse(await readFile(run+'/kit.json','utf8')),lock=JSON.parse(await readFile(run+'/raw/source-lock.json','utf8'));
function parse(bytes){const n=bytes.readUInt32LE(12);return {doc:JSON.parse(bytes.subarray(20,20+n)),bin:bytes.subarray(28+n)};}
function geometry(bytes){
 const {doc,bin}=parse(bytes),points=[];let triangles=0;
 function accessor(index){const a=doc.accessors[index],v=doc.bufferViews[a.bufferView],size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],component={5126:4,5125:4,5123:2,5121:1}[a.componentType],stride=v.byteStride??size*component;
  const read={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType];
  return Array.from({length:a.count},(_,i)=>Array.from({length:size},(_,j)=>bin[read]((v.byteOffset??0)+(a.byteOffset??0)+i*stride+j*component)));
 }
 function node(id,parent){const n=doc.nodes[id],local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3().fromArray(n.translation??[0,0,0]),new Quaternion().fromArray(n.rotation??[0,0,0,1]),new Vector3().fromArray(n.scale??[1,1,1]));const m=parent.clone().multiply(local);
  if(n.mesh!==undefined)for(const p of doc.meshes[n.mesh].primitives){const positions=accessor(p.attributes.POSITION);triangles+=(p.indices===undefined?positions.length:doc.accessors[p.indices].count)/3;for(const v of positions)points.push(new Vector3().fromArray(v).applyMatrix4(m));}
  for(const child of n.children??[])node(child,m);
 }for(const n of doc.scenes[doc.scene??0].nodes)node(n,new Matrix4());return {points,triangles,doc};
}
function compareSurface(a,b){
 const cell=.001,tolerance=.00002,buckets=new Map();
 for(const p of a){const key=[p.x,p.y,p.z].map(v=>Math.floor(v/cell)).join(',');if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p);}
 let worst=0;
 for(const p of b){const index=[p.x,p.y,p.z].map(v=>Math.floor(v/cell));let closest=Infinity;
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)for(const q of buckets.get([index[0]+dx,index[1]+dy,index[2]+dz].join(','))??[])closest=Math.min(closest,p.distanceTo(q));
  assert.ok(closest<=tolerance,`Surface moved ${closest}m at ${p.toArray()}`);worst=Math.max(worst,closest);
 }return worst;
}
const rows=[];
for(const original of lock){
 const file=original.id+'.glb',bytes=await readFile(run+'/candidate/'+file),before=await readFile(original.previous_candidate),report=await validateBytes(new Uint8Array(bytes),{uri:file,maxIssues:1000,externalResourceFunction:async uri=>new Uint8Array(await readFile('public/assets/games/rts/materials/detail-v1/'+path.basename(uri)))});
 assert.equal(report.issues.numErrors,0,file+' validator');await writeFile(run+'/qa/validator-'+file+'.json',JSON.stringify(report,null,2));
 const a=geometry(before),b=geometry(bytes);assert.equal(a.triangles,b.triangles,file+' triangle count');
 const error=Math.max(compareSurface(a.points,b.points),compareSurface(b.points,a.points));
 assert.equal(a.doc.meshes.length,b.doc.meshes.length,file+' draw batches');
 assert.ok(b.triangles<20000);for(const image of b.doc.images)assert.match(image.uri,/^\.\.\/materials\/detail-v1\/[a-z-]+\.(jpg|png)$/);
 rows.push({id:original.id,sha256:createHash('sha256').update(bytes).digest('hex'),triangles:b.triangles,runtimeMeshes:b.doc.meshes.length,maxSurfaceErrorMeters:error,validatorErrors:0,validatorWarnings:report.issues.numWarnings,bytes:bytes.length});
}
assert.ok(Object.values(kit.parts).some(p=>p.category==='window'&&p.used_by.includes('townhall-tier2')&&p.used_by.includes('townhall-tier3')));
assert.ok(Object.values(kit.parts).some(p=>p.category==='door'&&p.used_by.includes('townhall-tier2')&&p.used_by.includes('townhall-tier3')));
await writeFile(run+'/qa/structural.json',JSON.stringify({status:'passed',rows,uvException:'Only lancet window moulding UVs rebased to part-local space at same density; other source art retained.'},null,2)+'\n');
console.log(JSON.stringify({assets:rows.length,errors:0,maxSurfaceErrorMeters:Math.max(...rows.map(r=>r.maxSurfaceErrorMeters))}));
