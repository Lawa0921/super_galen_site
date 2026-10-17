/** Diagnostic only. Never imported by the game runtime. */
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function installShadowProxyExperiment(renderer:THREE.WebGLRenderer,scene:THREE.Scene){
 const nodes:THREE.SkinnedMesh[]=[];
 scene.traverse(o=>{
  if(!(o instanceof THREE.SkinnedMesh)||Array.isArray(o.material)||!o.boundingSphere||!o.boundingBox||o.children.length)return;
  const m=o.material as THREE.MeshStandardMaterial,g=o.geometry;
  if(m.transparent||m.alphaTest||m.alphaToCoverage||m.alphaMap||m.displacementMap||m.clippingPlanes?.length||m.clipShadows||m.wireframe||o.customDepthMaterial||o.customDistanceMaterial||g.groups.length||Object.keys(g.morphAttributes).length||g.drawRange.start!==0||g.drawRange.count!==Infinity)return;
  for(let p:THREE.Object3D|null=o;p;p=p.parent)if(!p.visible||p instanceof THREE.Bone)return;
  nodes.push(o);
 });
 const attributes=(g:THREE.BufferGeometry)=>Object.entries(g.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([k,a])=>[k,a.itemSize,a.normalized,a.array.constructor.name].join(':')).join('|');
 const groups:THREE.SkinnedMesh[][]=[];
 for(const mesh of nodes){
  const material=mesh.material as THREE.Material;
  const group=groups.find(([first])=>{
   const a=first.material as THREE.Material;
   return first.skeleton===mesh.skeleton&&first.matrixWorld.equals(mesh.matrixWorld)&&first.bindMode===mesh.bindMode&&first.bindMatrix.equals(mesh.bindMatrix)&&first.bindMatrixInverse.equals(mesh.bindMatrixInverse)&&a.side===material.side&&a.shadowSide===material.shadowSide&&first.layers.mask===mesh.layers.mask&&!!first.geometry.index===!!mesh.geometry.index&&attributes(first.geometry)===attributes(mesh.geometry);
  });
  if(group)group.push(mesh);else groups.push([mesh]);
 }
 const batches: Array<{originals:THREE.SkinnedMesh[];proxy:THREE.SkinnedMesh}>=[];
 const counts={sourceMeshes:0,proxies:0,colorProxyDraws:0,shadowProxyDraws:0};
 for(const originals of groups){
  if(originals.length<2)continue;
  const first=originals[0],geometry=mergeGeometries(originals.map(m=>m.geometry),false);if(!geometry)continue;
  const source=first.material as THREE.Material,material=new THREE.MeshBasicMaterial({side:source.side});material.shadowSide=source.shadowSide;
  const proxy=new THREE.SkinnedMesh(geometry,material);proxy.name='DIAGNOSTIC_SHADOW_PROXY';proxy.position.copy(first.position);proxy.quaternion.copy(first.quaternion);proxy.scale.copy(first.scale);proxy.bindMode=first.bindMode;proxy.bind(first.skeleton,first.bindMatrix);proxy.bindMatrixInverse.copy(first.bindMatrixInverse);
  proxy.boundingSphere=first.boundingSphere!.clone();proxy.boundingBox=first.boundingBox!.clone();
  for(const mesh of originals.slice(1)){proxy.boundingSphere.union(mesh.boundingSphere!);proxy.boundingBox.union(mesh.boundingBox!);}
  proxy.visible=false;proxy.castShadow=true;proxy.layers.mask=first.layers.mask;
  proxy.onBeforeRender=()=>{counts.colorProxyDraws++;};proxy.onBeforeShadow=()=>{counts.shadowProxyDraws++;};
  first.parent!.add(proxy);proxy.updateWorldMatrix(true,true);batches.push({originals,proxy});counts.sourceMeshes+=originals.length;counts.proxies++;
 }
 const original=renderer.shadowMap.render;
 renderer.shadowMap.render=function(...args:Parameters<typeof original>){
  if(args[1]!==scene||!this.enabled||!this.autoUpdate&&!this.needsUpdate)return original.apply(this,args);
  const active=batches.filter(b=>b.originals.every(m=>{if(!m.castShadow)return false;for(let p:THREE.Object3D|null=m;p;p=p.parent)if(!p.visible)return false;return true;}));
  try{
   for(const b of active){for(const m of b.originals)m.visible=false;b.proxy.visible=true;}
   return original.apply(this,args);
  }finally{for(const b of active){b.proxy.visible=false;for(const m of b.originals)m.visible=true;}}
 };
 return counts;
}
