/** Rebuild candidate animations from evaluated Blender poses with slerp-aware keys. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Matrix4,Vector3,Quaternion} from 'three';
import {adaptiveTrsKeys} from './animation_trs_sampling.mjs';

const base=path.resolve('art-factory/rts/runs/guard-right-hand-cage');
const sourceRun=path.join(base,'2026-10-08-v19-wrist-export-exact-skin'),run=path.join(base,'2026-10-08-v20-wrist-slerp-export');
const read=name=>fs.readFileSync(path.join(sourceRun,name)),sha=data=>createHash('sha256').update(data).digest('hex');
const reference=JSON.parse(read('qa/blender-reference.json')),sourceExport=JSON.parse(read('qa/export-restored.json'));
const matrixBytes=read('qa/blender-skin-matrices.f32');
if(sha(matrixBytes)!==reference.binary_sha256||reference.source_sha256!==sourceExport.source_sha256)throw Error('Frozen reference mismatch');
if(sha(read('qa/blender-static-skin.json'))!==reference.static_skin_sha256||sha(read('qa/blender-pose-extrema.json'))!==reference.pose_extrema_sha256)throw Error('Static/off-grid reference hash mismatch');
const dense=new Float32Array(matrixBytes.buffer,matrixBytes.byteOffset,matrixBytes.byteLength/4);
function glb(bytes){
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB');
  const n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n).toString('utf8')),start=28+n;
  if(bytes.readUInt32LE(24+n)!==0x004e4942)throw Error('Missing GLB binary');
  return {doc,binary:bytes.subarray(start)};
}
const original=read('candidate/'+sourceExport.exports[0].file);
if(sha(original)!==sourceExport.exports[0].sha256)throw Error('Source GLB hash mismatch');
const {doc:template}=glb(original),parents=new Map(),names=new Map();
template.nodes.forEach((node,i)=>{if(names.has(node.name))throw Error('Ambiguous node name');names.set(node.name,i);for(const child of node.children??[]){if(parents.has(child))throw Error('Multiple node parents');parents.set(child,i);}});
const staticWorld=new Map();
function world(index){
  if(staticWorld.has(index))return staticWorld.get(index);
  const node=template.nodes[index],m=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3(...node.translation??[0,0,0]),new Quaternion(...node.rotation??[0,0,0,1]),new Vector3(...node.scale??[1,1,1]));
  if(parents.has(index))m.premultiply(world(parents.get(index)));staticWorld.set(index,m);return m;
}
const C=new Matrix4().set(1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1),rest=reference.bones.map(n=>new Matrix4().set(...reference.bone_rest_matrices[n].flat()));
const boneIndices=new Map(reference.bones.map((n,i)=>[n,i]));
const controlStride=2,limits={position:4e-7,rotation:4e-7,scale:4e-7};
const pose=new Matrix4(),parentPose=new Matrix4(),local=new Matrix4(),reconstructed=new Matrix4(),position=new Vector3(),rotation=new Quaternion(),scale=new Vector3();
const plan=[],qa=[];let maximumTrsReconstructionError=0,worstTrs;
function posed(bone,sample,target){
  const offset=(sample*reference.bones.length+bone)*16;
  return target.set(...dense.subarray(offset,offset+16)).multiply(rest[bone]).premultiply(C);
}
for(const clip of reference.clips){
  const samples=[];for(let i=0;i<clip.count;i+=controlStride)samples.push(i);if(samples.at(-1)!==clip.count-1)samples.push(clip.count-1);
  const times=samples.map(i=>i/reference.step_per_frame/reference.fps),tracks=[];
  for(let bi=0;bi<reference.bones.length;bi++){
    const name=reference.bones[bi],nodeIndex=names.get(name);if(nodeIndex===undefined)throw Error('Missing bone node');
    const parentIndex=parents.get(nodeIndex),parentBone=boneIndices.get(template.nodes[parentIndex]?.name);
    const values=new Float64Array(samples.length*10);let last;
    for(let i=0;i<samples.length;i++){
      const frameIndex=clip.offset+samples[i];posed(bi,frameIndex,pose);
      if(parentBone!==undefined)posed(parentBone,frameIndex,parentPose);else parentPose.copy(parentIndex===undefined?new Matrix4():world(parentIndex));
      local.copy(parentPose).invert().multiply(pose);local.decompose(position,rotation,scale);rotation.normalize();
      if(last&&rotation.dot(last)<0)rotation.set(-rotation.x,-rotation.y,-rotation.z,-rotation.w);last=rotation.clone();
      reconstructed.compose(position,rotation,scale);
      const error=Math.max(...local.elements.map((v,j)=>Math.abs(v-reconstructed.elements[j])));
      if(error>maximumTrsReconstructionError){maximumTrsReconstructionError=error;worstTrs={clip:clip.name,bone:name,frame:samples[i]/reference.step_per_frame,local:local.toArray(),reconstructed:reconstructed.toArray()};}
      values.set([...position.toArray(),...rotation.toArray(),...scale.toArray()],i*10);
    }
    const kept=adaptiveTrsKeys(times,values,limits);
    tracks.push({bone:name,times:kept.map(i=>times[i]),values:kept.map(i=>Array.from(values.subarray(i*10,i*10+10)))});
  }
  plan.push({name:clip.name,tracks});qa.push({clip:clip.name,source_control_samples:samples.length,bones:tracks.map(t=>({name:t.bone,keys:t.times.length}))});
  console.log('SLERP_PLAN',clip.name,tracks.reduce((n,t)=>n+t.times.length,0));
}
// Independent source inspection confirmed real local shear, including in the
// native evaluated matrices. A local component threshold is not a spatial
// correctness bound; retain this projection residual and let the unchanged
// 50 micrometre full-world parity gate decide whether the TRS export is usable.
if(!Number.isFinite(maximumTrsReconstructionError))throw Error('Nonfinite TRS projection');
for(const dir of ['candidate','qa','raw'])fs.mkdirSync(path.join(run,dir),{recursive:true});
for(const file of ['blender-skin-matrices.f32','blender-static-skin.json','blender-pose-extrema.json'])fs.copyFileSync(path.join(sourceRun,'qa',file),path.join(run,'qa',file));
reference.source_vertex_identity_required=true;
fs.writeFileSync(path.join(run,'qa/blender-reference.json'),JSON.stringify(reference,null,2)+'\n');
const exports=[];
for(const asset of sourceExport.exports){
  const bytes=read('candidate/'+asset.file);if(sha(bytes)!==asset.sha256)throw Error('Source asset changed');
  const {doc,binary}=glb(bytes),beforeNodes=JSON.stringify(doc.nodes),beforeMeshes=JSON.stringify(doc.meshes),beforeSkins=JSON.stringify(doc.skins);
  const chunks=[binary];let length=binary.length;
  const nodeNames=new Map(doc.nodes.map((n,i)=>[n.name,i]));
  function append(values,type,width){
    const data=Buffer.alloc(values.length*4);values.forEach((v,i)=>data.writeFloatLE(v,i*4));
    const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length});chunks.push(data);length+=data.length;
    const index=doc.accessors.length;doc.accessors.push({bufferView:view,componentType:5126,count:values.length/width,type,...type==='SCALAR'?{min:[Math.min(...values)],max:[Math.max(...values)]}:{}});return index;
  }
  doc.animations=plan.map(clip=>{
    const animation={name:clip.name,channels:[],samplers:[]};
    for(const track of clip.tracks){
      const input=append(track.times,'SCALAR',1),node=nodeNames.get(track.bone);if(node===undefined)throw Error('Missing LOD bone');
      for(const [property,start,width,type] of [['translation',0,3,'VEC3'],['rotation',3,4,'VEC4'],['scale',7,3,'VEC3']]){
        const output=append(track.values.flatMap(v=>v.slice(start,start+width)),type,width),sampler=animation.samplers.length;
        animation.samplers.push({input,output,interpolation:'LINEAR'});animation.channels.push({sampler,target:{node,path:property}});
      }
    }return animation;
  });
  if(JSON.stringify(doc.nodes)!==beforeNodes||JSON.stringify(doc.meshes)!==beforeMeshes||JSON.stringify(doc.skins)!==beforeSkins)throw Error('Protected geometry/bind metadata changed');
  doc.buffers[0].byteLength=length;const jsonText=JSON.stringify(doc),json=Buffer.from(jsonText.padEnd(Math.ceil(Buffer.byteLength(jsonText)/4)*4)),blob=Buffer.concat(chunks);
  const out=Buffer.alloc(28+json.length+blob.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(json.length,12);out.writeUInt32LE(0x4e4f534a,16);json.copy(out,20);out.writeUInt32LE(blob.length,20+json.length);out.writeUInt32LE(0x004e4942,24+json.length);blob.copy(out,28+json.length);
  const file=`guard-wrist-slerp-lod${asset.lod}.glb`;fs.writeFileSync(path.join(run,'candidate',file),out);exports.push({lod:asset.lod,file,sha256:sha(out),bytes:out.length,source_sha256:asset.sha256});
}
const report={status:'candidate_pending_actual_three_parity',mode:'slerp',source_sha256:reference.source_sha256,runtime_publish_allowed:false,materials:'NONE',exports,limits,control_hz:reference.fps*reference.step_per_frame/controlStride,qa_hz:reference.fps*reference.step_per_frame,maximumTrsReconstructionError,worstTrs,
  projection_policy:'Source local shear is measured and retained as diagnostic; final actual Three world-space point bound must remain <=0.00005 m. No spatial tolerance relaxation.',
  method:'Evaluated Blender skin matrices -> world bone poses -> actual exported-parent local TRS. Adaptive glTF spherical rotation/linear translation and scale; odd reference samples held out. Source geometry, skins and node metadata preserved.',clips:qa};
fs.writeFileSync(path.join(run,'qa/export-slerp.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({exports,maximumTrsReconstructionError},null,2));
