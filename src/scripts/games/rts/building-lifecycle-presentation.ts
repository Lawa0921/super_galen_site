import * as THREE from 'three';

type Triple=[number,number,number];
interface DestructionCluster {id:string;pivot:Triple;axis:Triple;angle:number;translation:Triple;delay:number;duration:number}
interface ReplacementSet {id:string;stage:number;completedOwners:string[];deathFragments:string[];swapAtDestructionAge:0}
export interface BuildingLifecycleMetadata {version:1;destructionSeconds:3;damageThresholds:[number,number];clusters:DestructionCluster[];anchors:{impact:Triple[];repair:Triple[]};replacementSets:ReplacementSet[]}
const keys=['rtsDestructionCluster','rtsLifecycleRole','rtsLifecycleNodeId','rtsReplacementSet'] as const;
const invalid=()=>new Error('Invalid RTS building lifecycle metadata');
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const triple=(v:unknown):v is Triple=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n));
const stage=(v:unknown):v is number=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<=3;
const names=(v:unknown):v is string[]=>Array.isArray(v)&&v.length>0&&v.every(text)&&new Set(v).size===v.length;
function owners(scene:THREE.Object3D):THREE.Object3D[]{const result:THREE.Object3D[]=[];scene.traverse(o=>{if(keys.some(k=>o.userData[k]!==undefined))result.push(o);});return result;}

/** Reject incomplete bindings before a source can enter the completed batch. */
export function readBuildingLifecycleMetadata(scene:THREE.Object3D):BuildingLifecycleMetadata|undefined {
  const input=scene.userData.rtsBuildingLifecycle,nodes=owners(scene);
  if(input===undefined){if(nodes.length)throw invalid();return undefined;}
  const m=input as BuildingLifecycleMetadata;
  if(!m||m.version!==1||m.destructionSeconds!==3||!Array.isArray(m.damageThresholds)||m.damageThresholds.length!==2||m.damageThresholds[0]!==.65||m.damageThresholds[1]!==.3||
    !Array.isArray(m.clusters)||!m.clusters.length||!Array.isArray(m.replacementSets)||!m.anchors||
    ![m.anchors.impact,m.anchors.repair].every(v=>Array.isArray(v)&&v.length>0&&v.every(triple))||scene.userData.rtsConstruction?.version!==1)throw invalid();
  const clusters=new Map<string,DestructionCluster>(),clusterStages=new Map<string,number>();
  for(const c of m.clusters){
    if(!c||!text(c.id)||clusters.has(c.id)||!triple(c.pivot)||!triple(c.axis)||Math.abs(Math.hypot(...c.axis)-1)>1e-5||!triple(c.translation)||!Number.isFinite(c.angle)||!Number.isFinite(c.delay)||c.delay<0||!Number.isFinite(c.duration)||c.duration<=0||c.delay+c.duration>2.6+1e-9)throw invalid();clusters.set(c.id,c);
  }
  const nodeSet=new Set(nodes),roleNodes=new Map<string,THREE.Object3D>(),used=new Set<THREE.Object3D>();
  for(const node of nodes){
    const d=node.userData;if(node===scene||!stage(d.rtsConstructionStage))throw invalid();
    for(let p=node.parent;p&&p!==scene;p=p.parent)if(nodeSet.has(p))throw invalid();
    const role=d.rtsLifecycleRole;
    if(role!==undefined&&role!=='completedSource'&&role!=='deathReplacement')throw invalid();
    if(role===undefined){if(d.rtsLifecycleNodeId!==undefined||d.rtsReplacementSet!==undefined)throw invalid();}
    else{if(!text(d.rtsLifecycleNodeId)||!text(d.rtsReplacementSet)||roleNodes.has(d.rtsLifecycleNodeId))throw invalid();roleNodes.set(d.rtsLifecycleNodeId,node);}
    if(role==='completedSource'){if(d.rtsDestructionCluster!==undefined)throw invalid();}
    else{
      const id=d.rtsDestructionCluster;if(!text(id)||!clusters.has(id)||clusterStages.has(id)&&clusterStages.get(id)!==d.rtsConstructionStage)throw invalid();clusterStages.set(id,d.rtsConstructionStage);
    }
  }
  scene.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    if(o instanceof THREE.SkinnedMesh||Object.keys(o.geometry.morphAttributes).length)throw invalid();
    let owner:THREE.Object3D|null=o;
    while(owner&&owner!==scene&&!nodeSet.has(owner)){
      // A nested stage cannot silently inherit another stage's death cluster.
      if(owner.userData.rtsConstructionStage!==undefined)throw invalid();owner=owner.parent;
    }
    if(!owner||owner===scene)throw invalid();used.add(owner);
  });
  if(used.size!==nodes.length||!used.size||clusterStages.size!==clusters.size)throw invalid();
  const sets=new Set<string>(),accounted=new Set<string>();
  for(const set of m.replacementSets){
    if(!set||!text(set.id)||sets.has(set.id)||!stage(set.stage)||set.swapAtDestructionAge!==0||!names(set.completedOwners)||!names(set.deathFragments))throw invalid();sets.add(set.id);
    for(const [role,ids] of [['completedSource',set.completedOwners],['deathReplacement',set.deathFragments]] as const)for(const id of ids){
      const node=roleNodes.get(id),d=node?.userData;
      if(!d||accounted.has(id)||d.rtsLifecycleRole!==role||d.rtsReplacementSet!==set.id||d.rtsConstructionStage!==set.stage)throw invalid();accounted.add(id);
    }
  }
  if(accounted.size!==roleNodes.size)throw invalid();return structuredClone(m);
}

/** Includes ancestor roles because GLTFLoader wraps multi-material primitives. */
export function isDeathReplacement(node:THREE.Object3D,scene:THREE.Object3D):boolean {
  for(let o:THREE.Object3D|null=node;o&&o!==scene;o=o.parent)if(o.userData.rtsLifecycleRole==='deathReplacement')return true;return false;
}
/** LODs may simplify meshes and reorder metadata, but must preserve the same
 * semantic parts, replacement relationships and analytic motion recipes. */
export function buildingLifecycleSignature(scene:THREE.Object3D):string|undefined {
  const m=readBuildingLifecycleMetadata(scene);if(!m)return undefined;
  const nodes=owners(scene),sorted=(values:string[])=>[...new Set(values)].sort();
  const byId=<T extends {id:string}>(a:T,b:T)=>a.id.localeCompare(b.id);
  const clusters=m.clusters.map(c=>{
    const bound=nodes.filter(n=>n.userData.rtsDestructionCluster===c.id);
    return {id:c.id,pivot:c.pivot,axis:c.axis,angle:c.angle,translation:c.translation,delay:c.delay,duration:c.duration,
      stage:bound[0].userData.rtsConstructionStage,parts:sorted(bound.flatMap(n=>n.userData.rtsPartIds)),sourceParts:sorted(bound.flatMap(n=>n.userData.rtsSourcePartIds))};
  }).sort(byId);
  const replacementSets=m.replacementSets.map(s=>({id:s.id,stage:s.stage,completedOwners:sorted(s.completedOwners),deathFragments:sorted(s.deathFragments),swapAtDestructionAge:s.swapAtDestructionAge})).sort(byId);
  const roleBindings=nodes.filter(n=>n.userData.rtsLifecycleRole!==undefined).map(n=>{
    const d=n.userData;return {id:d.rtsLifecycleNodeId,role:d.rtsLifecycleRole,set:d.rtsReplacementSet,stage:d.rtsConstructionStage,cluster:d.rtsDestructionCluster??null,parts:sorted(d.rtsPartIds),sourceParts:sorted(d.rtsSourcePartIds)};
  }).sort(byId);
  return JSON.stringify({version:m.version,destructionSeconds:m.destructionSeconds,damageThresholds:m.damageThresholds,anchors:{impact:m.anchors.impact,repair:m.anchors.repair},clusters,replacementSets,roleBindings});
}
function sceneMatrix(object:THREE.Object3D,scene:THREE.Object3D):THREE.Matrix4 {
  const chain:THREE.Object3D[]=[];for(let node:THREE.Object3D|null=object;node&&node!==scene;node=node.parent)chain.unshift(node);
  const matrix=new THREE.Matrix4();for(const node of chain){if(node.matrixAutoUpdate)node.updateMatrix();matrix.multiply(node.matrix);}return matrix;
}
interface Binding {node:THREE.Object3D;stage:number;role?:string;delta?:THREE.Matrix4;original:THREE.Matrix4;scene:THREE.Matrix4;parentInverse:THREE.Matrix4;auto:boolean;visible:boolean}
/** Immutable geometry with per-instance analytic poses, driven only by game age. */
export class BuildingLifecyclePresentation {
  readonly metadata:BuildingLifecycleMetadata;
  private bindings:Binding[];
  private clusters:Array<{recipe:DestructionCluster;axis:THREE.Vector3;delta:THREE.Matrix4}>;
  private rotation=new THREE.Quaternion();
  private position=new THREE.Vector3();
  private scale=new THREE.Vector3(1,1,1);
  private active=false;
  constructor(scene:THREE.Object3D){
    const metadata=readBuildingLifecycleMetadata(scene);if(!metadata)throw invalid();this.metadata=metadata;
    this.clusters=metadata.clusters.map(recipe=>({recipe,axis:new THREE.Vector3(...recipe.axis),delta:new THREE.Matrix4()}));
    const deltas=new Map(this.clusters.map(c=>[c.recipe.id,c.delta]));
    this.bindings=owners(scene).map(node=>{
      const world=sceneMatrix(node,scene),parent=node.parent===scene?new THREE.Matrix4():sceneMatrix(node.parent!,scene);
      if(Math.abs(parent.determinant())<1e-12)throw invalid();
      return {node,stage:node.userData.rtsConstructionStage,role:node.userData.rtsLifecycleRole,delta:deltas.get(node.userData.rtsDestructionCluster),original:node.matrix.clone(),scene:world,parentInverse:parent.invert(),auto:node.matrixAutoUpdate,visible:node.visible};
    });
  }
  apply(age:number,construction:number):void {
    if(!Number.isFinite(age)||age<0)throw new Error('Invalid destruction age');
    if(!Number.isFinite(construction))throw new Error('Invalid construction progress');
    construction=Math.max(0,Math.min(1,construction));this.active=true;
    for(const {recipe:c,axis,delta} of this.clusters){
      const t=Math.max(0,Math.min(1,(age-c.delay)/c.duration)),e=t*t*(3-2*t);
      this.rotation.setFromAxisAngle(axis,c.angle*e);this.position.fromArray(c.pivot).applyQuaternion(this.rotation).multiplyScalar(-1);
      this.position.x+=c.pivot[0]+c.translation[0]*e;this.position.y+=c.pivot[1]+c.translation[1]*e;this.position.z+=c.pivot[2]+c.translation[2]*e;
      delta.compose(this.position,this.rotation,this.scale);
    }
    for(const b of this.bindings){
      b.node.visible=b.role!=='completedSource'&&construction>=[0,.18,.55,.82][b.stage];
      if(!b.delta)continue;
      b.node.matrixAutoUpdate=false;b.node.matrix.copy(b.parentInverse).multiply(b.delta).multiply(b.scene);b.node.matrixWorldNeedsUpdate=true;
    }
  }
  restore():void {
    if(!this.active)return;
    for(const b of this.bindings){b.node.matrixAutoUpdate=b.auto;b.node.matrix.copy(b.original);b.node.matrixWorldNeedsUpdate=true;b.node.visible=b.visible;}this.active=false;
  }
}
