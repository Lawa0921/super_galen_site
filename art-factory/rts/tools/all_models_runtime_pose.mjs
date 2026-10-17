/** Geometry-only Three AnimationMixer sampling; no renderer, audio or images. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const run=process.env.RTS_POSE_RUN??'art-factory/rts/runs/all-models/2026-10-14-v1';
const unit=process.argv[2],samples=Number(process.argv[3]??31),lods=[];
for(const lod of [0,1]){
  const file=`${run}/candidate/${unit}${lod?'-lod1':''}.glb`,bytes=await readFile(file);
  const size=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+size)),binary=bytes.subarray(size+28);
  // Material decoding is unrelated to skeleton deformation and requires DOM
  // image APIs. The source bytes and all geometry/skin/animation data are kept.
  delete doc.materials;delete doc.textures;delete doc.images;
  for(const mesh of doc.meshes)for(const p of mesh.primitives)delete p.material;
  const raw=JSON.stringify(doc),json=Buffer.from(raw.padEnd(Math.ceil(Buffer.byteLength(raw)/4)*4));
  const blob=Buffer.alloc(28+json.length+binary.length);blob.writeUInt32LE(0x46546c67,0);blob.writeUInt32LE(2,4);blob.writeUInt32LE(blob.length,8);blob.writeUInt32LE(json.length,12);blob.writeUInt32LE(0x4e4f534a,16);json.copy(blob,20);blob.writeUInt32LE(binary.length,20+json.length);blob.writeUInt32LE(0x004e4942,24+json.length);binary.copy(blob,28+json.length);
  const gltf=await new GLTFLoader().parseAsync(blob.buffer.slice(blob.byteOffset,blob.byteOffset+blob.byteLength),'');
  const root=gltf.scene,mixer=new THREE.AnimationMixer(root),meshes=[];
  root.updateMatrixWorld(true);
  root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
  const geometry=meshes.map(m=>({name:m.parent.name+'/'+m.name,positions:Array.from(m.geometry.attributes.position.array),indices:m.geometry.index?Array.from(m.geometry.index.array):Array.from({length:m.geometry.attributes.position.count},(_,i)=>i),joints:Array.from(m.geometry.attributes.skinIndex.array),weights:Array.from(m.geometry.attributes.skinWeight.array),bones:m.skeleton.bones.map(b=>b.name),bind:m.bindMatrix.toArray()}));
  const poses=[];
  for(const clip of gltf.animations){
    mixer.stopAllAction();const a=mixer.clipAction(clip).reset();a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();
    for(let i=0;i<samples;i++){
      const fraction=i/(samples-1);a.time=clip.duration*fraction;a.paused=true;mixer.update(0);root.updateMatrixWorld(true);
      poses.push({clip:clip.name,fraction,time:clip.duration*fraction,meshes:meshes.map(m=>{m.skeleton.update();return {skin:Array.from(m.skeleton.boneMatrices),outer:m.matrixWorld.clone().multiply(m.bindMatrixInverse).toArray()};})});
    }
  }
  lods.push({lod,file,sha256:createHash('sha256').update(bytes).digest('hex'),geometry,poses});
}
await writeFile(`${run}/qa/${unit}-runtime-poses.json`,JSON.stringify({unit,samples,lods}));
console.log(JSON.stringify({unit,samples,lods:lods.map(r=>({lod:r.lod,poses:r.poses.length,meshes:r.geometry.length,sha256:r.sha256}))}));
