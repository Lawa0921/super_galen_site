const fs=require('node:fs'),crypto=require('node:crypto');
function load(file){const bytes=fs.readFileSync(file),len=bytes.readUInt32LE(12);return{doc:JSON.parse(bytes.subarray(20,20+len)),bin:bytes.subarray(28+len)}}
function data(g,i){const a=g.doc.accessors[i],v=g.doc.bufferViews[a.bufferView],s={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[a.componentType],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],o=(v.byteOffset||0)+(a.byteOffset||0);const rows=[];for(let j=0;j<a.count;j++)rows.push(g.bin.subarray(o+j*(v.byteStride||s*n),o+j*(v.byteStride||s*n)+s*n));return Buffer.concat(rows)}
const base='art-factory/rts/runs/original-crossbow-grip/continuation-20261006-2/candidate/',run='art-factory/rts/runs/original-crossbow-waist/2026-10-06-v1/',rows=[];
for(const lod of [0,1]){
 const name=`original-crossbow-grip-lod${lod}.glb`,a=load(base+name),b=load(run+'candidate/'+name);const differences=[];let checked=0;
 const bodyA=a.doc.nodes.find(n=>n.name===`crossbowOriginalBody_LOD${lod}`)?.mesh;
 const bodyB=b.doc.nodes.find(n=>n.name===`crossbowOriginalBody_LOD${lod}`)?.mesh;
 if(bodyA===undefined||bodyA!==bodyB||a.doc.meshes.length!==b.doc.meshes.length)throw Error('Body identity or mesh count changed');
 a.doc.meshes.forEach((m,mi)=>m.primitives.forEach((p,pi)=>{
  for(const [key,accessor]of Object.entries({...p.attributes,indices:p.indices})){
   if(mi===bodyA&&['JOINTS_0','WEIGHTS_0'].includes(key))continue;
   const q=b.doc.meshes[mi].primitives[pi],j=key==='indices'?q.indices:q.attributes[key];checked++;
   if(!data(a,accessor).equals(data(b,j)))differences.push(`mesh${mi}/${pi}/${key}`);
  }
 }));
 let animationTracks=0;
 for(const anim of a.doc.animations){const other=b.doc.animations.find(x=>x.name===anim.name);for(let i=0;i<anim.samplers.length;i++)for(const k of ['input','output']){animationTracks++;if(!data(a,anim.samplers[i][k]).equals(data(b,other.samplers[i][k])))differences.push(`${anim.name}/${i}/${k}`)}}
 rows.push({lod,checked,animationTracks,differences,sha256:crypto.createHash('sha256').update(fs.readFileSync(run+'candidate/'+name)).digest('hex')});
}
const result={pass:rows.every(x=>!x.differences.length),scope:'All exported geometry, normals, UVs, indices, non-body weights and animation accessor bytes; body joint/weight accessors excluded.',rows};fs.writeFileSync(run+'qa/glb-preservation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.pass)process.exitCode=1;
