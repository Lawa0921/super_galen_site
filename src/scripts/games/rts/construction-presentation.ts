import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {isDeathReplacement,readBuildingLifecycleMetadata} from './building-lifecycle-presentation';

export interface RtsConstructionMetadata {version:1;thresholds:number[];stages:Array<{id:number;name:string}>}
interface ConstructionSource {stage:number;name:string;rtsPartIds:string[];rtsSourcePartIds:string[];rtsSourceObjects:string[]}
export interface ConstructionAsset {metadata:RtsConstructionMetadata;completed?:THREE.Group;users:number;source:GLTF}
const prepared=new WeakMap<GLTF,ConstructionAsset>();
const CONSTRUCTION_THRESHOLDS_V1=[0,.18,.55,.82] as const;
const identityKeys=['rtsPartIds','rtsSourcePartIds','rtsSourceObjects'] as const;
const invalid=()=>new Error('Invalid RTS construction metadata');
function identity(value:unknown):value is string[]{return Array.isArray(value)&&value.length>0&&value.every(v=>typeof v==='string'&&v.trim().length>0)&&new Set(value).size===value.length;}
function stageOwner(mesh:THREE.Mesh,scene:THREE.Object3D):THREE.Object3D|undefined {
  for(let node:THREE.Object3D|null=mesh;node&&node!==scene;node=node.parent)if(node.userData.rtsConstructionStage!==undefined)return node;
}
/** GLTFLoader places multi-primitive node extras on the parent Group. */
export function constructionNodes(scene:THREE.Object3D):THREE.Object3D[]{
  const nodes=new Set<THREE.Object3D>();scene.traverse(o=>{if(o instanceof THREE.Mesh){const node=stageOwner(o,scene);if(node)nodes.add(node);}});return [...nodes];
}
export function readConstructionMetadata(scene:THREE.Object3D):RtsConstructionMetadata|undefined {
  readBuildingLifecycleMetadata(scene);
  const input=scene.userData.rtsConstruction;let hasHints=false;
  scene.traverse(o=>{if(o.userData.rtsConstructionStage!==undefined||identityKeys.some(key=>o.userData[key]!==undefined))hasHints=true;});
  if(input===undefined){if(hasHints)throw invalid();return undefined;}
  const m=input as RtsConstructionMetadata;
  if(!m||m.version!==1||!Array.isArray(m.thresholds)||m.thresholds.length!==CONSTRUCTION_THRESHOLDS_V1.length||
    m.thresholds.some((v,i)=>v!==CONSTRUCTION_THRESHOLDS_V1[i])||
    !Array.isArray(m.stages)||m.stages.length!==4||m.stages.some((s,i)=>!s||s.id!==i||typeof s.name!=='string'||!s.name.trim()))throw invalid();
  const stages=new Set<number>();let meshes=0;
  scene.traverse(o=>{
    if(o.userData.rtsConstructionStage!==undefined){const stage=o.userData.rtsConstructionStage;
      if(!Number.isInteger(stage)||stage<0||stage>3||identityKeys.some(key=>!identity(o.userData[key])))throw invalid();}
    if(o instanceof THREE.Mesh){const node=stageOwner(o,scene);if(!node)throw invalid();const stage=node.userData.rtsConstructionStage;
      for(let parent=node.parent;parent&&parent!==scene;parent=parent.parent)if(parent.userData.rtsConstructionStage!==undefined&&parent.userData.rtsConstructionStage>stage)throw invalid();
      stages.add(stage);meshes++;}
  });
  if(!meshes||stages.size!==4)throw invalid();
  return structuredClone(m);
}
export function sameConstruction(a:RtsConstructionMetadata|undefined,b:RtsConstructionMetadata|undefined):boolean {return JSON.stringify(a)===JSON.stringify(b);}

function localToScene(object:THREE.Object3D,scene:THREE.Object3D):THREE.Matrix4 {
  const chain:THREE.Object3D[]=[];for(let node:THREE.Object3D|null=object;node&&node!==scene;node=node.parent)chain.unshift(node);
  const matrix=new THREE.Matrix4();for(const node of chain)matrix.multiply(node.matrixAutoUpdate?new THREE.Matrix4().compose(node.position,node.quaternion,node.scale):node.matrix);return matrix;
}
function completeMesh(source:GLTF):THREE.Group|undefined {
  const meshes:THREE.Mesh[]=[];source.scene.traverse(o=>{if(o instanceof THREE.Mesh&&!isDeathReplacement(o,source.scene))meshes.push(o);});
  // Animated, reflected, transparent, morphing or partially drawn primitives keep
  // their original render path; baking them would change authored behavior.
  if(source.animations.length||meshes.some(m=>m instanceof THREE.SkinnedMesh||Array.isArray(m.material)||m.material.transparent||Object.keys(m.geometry.morphAttributes).length||m.geometry.drawRange.start!==0||m.geometry.drawRange.count!==Infinity||localToScene(m,source.scene).determinant()<=0))return undefined;
  const byMaterial=new Map<THREE.Material,THREE.Mesh[]>();for(const mesh of meshes){const material=mesh.material as THREE.Material;const list=byMaterial.get(material)??[];list.push(mesh);byMaterial.set(material,list);}
  // Avoid BufferGeometryUtils' incompatible-attribute fallback and retain the
  // exact original meshes rather than dropping an attribute or a primitive.
  const layout=(g:THREE.BufferGeometry)=>JSON.stringify(Object.keys(g.attributes).sort().map(key=>{const a=g.attributes[key];return [key,a.itemSize,a.normalized,a.array.constructor.name];}));
  if([...byMaterial.values()].some(group=>group.some(m=>layout(m.geometry)!==layout(group[0].geometry))))return undefined;
  const root=new THREE.Group();root.name='RTS construction completed';
  for(const [material,group] of byMaterial){
    const mixedIndices=group.some(m=>!!m.geometry.index!==!!group[0].geometry.index);
    const copies=group.map(mesh=>{const geometry=mixedIndices&&mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone(),matrix=localToScene(mesh,source.scene);
      // applyMatrix4 normalizes normals even for an identity matrix. Preserve
      // the source-authored normal bytes for the contract's identity pivots.
      if(!matrix.equals(new THREE.Matrix4()))geometry.applyMatrix4(matrix);return geometry;});
    const geometry=mergeGeometries(copies,false);copies.forEach(g=>g.dispose());
    if(!geometry){root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});return undefined;}
    geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,material);mesh.name='RTS completed '+material.name;
    mesh.userData.rtsConstructionSources=group.map(object=>{const owner=stageOwner(object,source.scene)!;return structuredClone({stage:owner.userData.rtsConstructionStage,name:owner.name,
      rtsPartIds:owner.userData.rtsPartIds,rtsSourcePartIds:owner.userData.rtsSourcePartIds,rtsSourceObjects:owner.userData.rtsSourceObjects} satisfies ConstructionSource);});
    for(const key of identityKeys)mesh.userData[key]=[...new Set(mesh.userData.rtsConstructionSources.flatMap((s:ConstructionSource)=>s[key]))];
    root.add(mesh);
  }
  return root;
}
/** Reference counts separate the library's preparation lease from instance leases. */
export function retainConstruction(source:GLTF):ConstructionAsset|undefined {
  const metadata=readConstructionMetadata(source.scene);if(!metadata)return undefined;
  if(source.scene.userData.rtsBuildingLifecycle&&source.animations.length)throw new Error('Invalid RTS building lifecycle animation');
  let asset=prepared.get(source);if(!asset){asset={metadata,completed:completeMesh(source),source,users:0};prepared.set(source,asset);}asset.users++;return asset;
}
export function releaseConstruction(asset:ConstructionAsset):void {
  if(--asset.users)return;asset.completed?.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});prepared.delete(asset.source);
}
