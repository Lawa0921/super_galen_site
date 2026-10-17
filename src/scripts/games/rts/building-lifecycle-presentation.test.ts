import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {BuildingLifecyclePresentation,readBuildingLifecycleMetadata,type BuildingLifecycleMetadata} from './building-lifecycle-presentation';
import {ModelInstance} from './models';

const entry={url:'/assets/games/rts/models/house.glb',status:'published' as const};
function authored(){
  const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial(),clusters:BuildingLifecycleMetadata['clusters']=[];
  scene.userData.rtsConstruction={version:1,thresholds:[0,.18,.55,.82],stages:[0,1,2,3].map(id=>({id,name:'stage-'+id}))};
  const add=(id:string,stage:number,role?:string)=>{
    const owner=new THREE.Group();owner.name=id;owner.userData={rtsConstructionStage:stage,rtsPartIds:[id],rtsSourcePartIds:['source-'+id],rtsSourceObjects:[id]};
    if(role)Object.assign(owner.userData,{rtsLifecycleRole:role,rtsLifecycleNodeId:id,rtsReplacementSet:'wall'});
    if(role!=='completedSource'){
      owner.userData.rtsDestructionCluster=id;
      clusters.push({id,pivot:[0,0,0],axis:[0,0,1],angle:stage?Math.PI/2:0,translation:[0,0,0],delay:0,duration:1});
    }
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);mesh.name=id+' mesh';owner.add(mesh);scene.add(owner);return owner;
  };
  add('foundation',0);add('intact-wall',1,'completedSource');add('wall-a',1,'deathReplacement');add('wall-b',1,'deathReplacement');add('roof',2);add('trim',3);
  scene.userData.rtsBuildingLifecycle={version:1,destructionSeconds:3,damageThresholds:[.65,.3],clusters,anchors:{impact:[[0,1,0]],repair:[[0,0,0]]},replacementSets:[{id:'wall',stage:1,completedOwners:['intact-wall'],deathFragments:['wall-a','wall-b'],swapAtDestructionAge:0}]};
  return {scene,animations:[]} as unknown as GLTF;
}
const visibleNames=(root:THREE.Object3D)=>{const names:string[]=[];root.traverseVisible(o=>{if(o instanceof THREE.Mesh)names.push(o.name);});return names;};

describe('authored building lifecycle presentation',()=>{
  it('thaws completed transforms before destruction and preserves anchors, fragment poses and restoration',()=>{
    const cached=new ModelInstance(authored(),entry),reference=new ModelInstance(authored(),entry),world=new THREE.Scene();world.add(cached.root,reference.root);
    cached.root.position.set(7,0,9);reference.root.position.copy(cached.root.position);cached.cacheBuildingTransform(true);world.updateMatrixWorld(true);
    expect(cached.root.matrixAutoUpdate).toBe(false);expect(cached.buildingEffectAnchors()).toEqual(reference.buildingEffectAnchors());
    for(const age of [0,.5,2.6]){
      cached.setConstruction(1);reference.setConstruction(1);cached.setDestruction(age,1);reference.setDestruction(age,1);
      cached.cacheBuildingTransform(false);world.updateMatrixWorld(true);expect(cached.root.matrixAutoUpdate).toBe(true);
      expect(visibleNames(cached.root)).toEqual(visibleNames(reference.root));
      cached.root.traverse(node=>{if(node.name)expect(node.matrixWorld.elements).toEqual(reference.root.getObjectByName(node.name)!.matrixWorld.elements);});
    }
    cached.setConstruction(1);reference.setConstruction(1);cached.cacheBuildingTransform(true);world.updateMatrixWorld(true);
    expect(visibleNames(cached.root)).toEqual(visibleNames(reference.root));expect(cached.buildingEffectAnchors()).toEqual(reference.buildingEffectAnchors());
    cached.dispose();reference.dispose();
  });
  it('exposes independent authored effect anchors in world space through instance and scene transforms',()=>{
    const source=authored();source.scene.position.set(1,0,0);const model=new ModelInstance(source,{...entry,scale:2,yaw:Math.PI/2});model.root.position.set(10,0,20);
    const anchors=model.buildingEffectAnchors()!;expect(anchors.impact[0][0]).toBeCloseTo(10);expect(anchors.impact[0][1]).toBeCloseTo(2);expect(anchors.impact[0][2]).toBeCloseTo(18);
    anchors.impact[0][0]=999;expect(model.buildingEffectAnchors()!.impact[0][0]).toBeCloseTo(10);model.dispose();
    const legacy=new ModelInstance({scene:new THREE.Group(),animations:[]} as unknown as GLTF,entry);expect(legacy.buildingEffectAnchors()).toBeUndefined();legacy.dispose();
  });
  it('keeps fracture meshes out of living construction and completed batching',()=>{
    const source=authored(),a=new ModelInstance(source,entry),b=new ModelInstance(source,entry);
    expect(visibleNames(a.root)).toHaveLength(1);
    const meshes:THREE.Mesh[]=[];a.root.traverseVisible(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
    expect(meshes[0].geometry.attributes.position.count).toBe(16);
    a.setConstruction(.18);expect(visibleNames(a.root)).toEqual(['foundation mesh','intact-wall mesh']);
    expect(a.setDestruction(1,.18)).toBe(true);expect(visibleNames(a.root)).toEqual(['foundation mesh','wall-a mesh','wall-b mesh']);
    expect(visibleNames(b.root)).toHaveLength(1);expect(source.scene.children.every(n=>n.visible)).toBe(true);
    a.setConstruction(.18);expect(visibleNames(a.root)).toEqual(['foundation mesh','intact-wall mesh']);a.dispose();b.dispose();
  });
  it('evaluates scene-space pivots through transformed parents without accumulating or sharing pose',()=>{
    const source=authored(),parent=new THREE.Group();parent.position.set(3,0,0);parent.rotation.y=.4;parent.scale.set(2,1,1);source.scene.add(parent);
    const node=source.scene.getObjectByName('roof')!;parent.add(node);node.position.set(1,0,0);source.scene.updateMatrixWorld(true);
    const initial=node.matrixWorld.clone(),original=node.matrix.clone(),p=new BuildingLifecyclePresentation(source.scene);
    p.apply(1,1);source.scene.updateMatrixWorld(true);
    const expected=new THREE.Matrix4().makeRotationZ(Math.PI/2).multiply(initial);
    node.matrixWorld.elements.forEach((v,i)=>expect(v).toBeCloseTo(expected.elements[i],10));
    const once=node.matrix.clone();p.apply(1,1);expect(node.matrix.equals(once)).toBe(true);
    p.apply(.5,1);p.apply(1,1);expect(node.matrix.equals(once)).toBe(true);
    p.restore();source.scene.updateMatrixWorld(true);expect(node.matrixAutoUpdate).toBe(true);expect(node.matrix.equals(original)).toBe(true);
  });
  it('uses authored delays, clamps analytic ages and preserves fixed foundations',()=>{
    const source=authored(),c=source.scene.userData.rtsBuildingLifecycle.clusters.find((v:{id:string})=>v.id==='roof');c.delay=.2;c.duration=.8;c.translation=[1,0,0];
    const p=new BuildingLifecyclePresentation(source.scene),roof=source.scene.getObjectByName('roof')!;
    p.apply(.2,1);expect(roof.matrix.equals(new THREE.Matrix4())).toBe(true);p.apply(.6,1);
    expect(roof.matrix.elements[12]).toBeCloseTo(.5);expect(roof.matrix.elements[0]).toBeCloseTo(Math.SQRT1_2);
    p.apply(3,1);expect(roof.matrix.elements[12]).toBe(1);expect(source.scene.getObjectByName('foundation')!.matrix.equals(new THREE.Matrix4())).toBe(true);
    expect(()=>p.apply(NaN,1)).toThrow('destruction age');expect(()=>p.apply(1,Infinity)).toThrow('construction progress');
  });
  it('rotates a source point around its authored pivot and keeps explicit matrix ownership on restore',()=>{
    const source=authored(),c=source.scene.userData.rtsBuildingLifecycle.clusters.find((v:{id:string})=>v.id==='roof');c.pivot=[2,1,0];c.translation=[0,-.5,2];
    const roof=source.scene.getObjectByName('roof')!;roof.matrixAutoUpdate=false;roof.matrix.makeTranslation(3,1,0);
    const p=new BuildingLifecyclePresentation(source.scene);p.apply(1,1);
    const point=new THREE.Vector3().applyMatrix4(roof.matrix);expect(point.toArray()).toEqual([2,1.5,2]);
    p.restore();expect(roof.matrixAutoUpdate).toBe(false);expect(new THREE.Vector3().applyMatrix4(roof.matrix).toArray()).toEqual([3,1,0]);
  });
  it('preserves role filtering when completed batching falls back for transparent materials',()=>{
    const source=authored();(source.scene.children[0].children[0] as THREE.Mesh).material=new THREE.MeshStandardMaterial({transparent:true});
    const model=new ModelInstance(source,entry);expect(visibleNames(model.root)).toEqual(['foundation mesh','intact-wall mesh','roof mesh','trim mesh']);
    model.setDestruction(0,1);expect(visibleNames(model.root)).toEqual(['foundation mesh','wall-a mesh','wall-b mesh','roof mesh','trim mesh']);model.dispose();
  });
  it.each([
    (s:THREE.Group)=>{delete s.userData.rtsBuildingLifecycle;},
    (s:THREE.Group)=>{s.userData.rtsBuildingLifecycle.clusters[0].axis=[0,2,0];},
    (s:THREE.Group)=>{s.userData.rtsBuildingLifecycle.clusters[0].duration=3;},
    (s:THREE.Group)=>{s.userData.rtsBuildingLifecycle.clusters[0].pivot[0]=NaN;},
    (s:THREE.Group)=>{s.userData.rtsBuildingLifecycle.clusters.push({...s.userData.rtsBuildingLifecycle.clusters[0]});},
    (s:THREE.Group)=>{s.userData.rtsBuildingLifecycle.clusters.push({...s.userData.rtsBuildingLifecycle.clusters[0],id:'unused'});},
    (s:THREE.Group)=>{s.userData.rtsBuildingLifecycle.replacementSets[0].deathFragments=['wall-a'];},
    (s:THREE.Group)=>{s.userData.rtsBuildingLifecycle.replacementSets[0].deathFragments=['wall-a','wall-a'];},
    (s:THREE.Group)=>{s.getObjectByName('wall-b')!.userData.rtsConstructionStage=2;},
    (s:THREE.Group)=>{s.getObjectByName('wall-b')!.userData.rtsDestructionCluster='roof';},
    (s:THREE.Group)=>{s.getObjectByName('wall-b')!.userData.rtsLifecycleRole='unknown';},
    (s:THREE.Group)=>{s.getObjectByName('wall-b')!.userData.rtsLifecycleNodeId='wall-a';},
    (s:THREE.Group)=>{s.getObjectByName('foundation')!.add(s.getObjectByName('roof')!);},
    (s:THREE.Group)=>{s.userData.rtsBuildingLifecycle.anchors.repair=[];},
    (s:THREE.Group)=>{const roof=s.getObjectByName('roof')!;roof.add(roof.children[0].clone());roof.children[0].userData={rtsConstructionStage:3,rtsPartIds:['nested'],rtsSourcePartIds:['nested'],rtsSourceObjects:['nested']};},
  ])('rejects malformed or unaccounted metadata before publishing geometry',mutate=>{
    const source=authored();mutate(source.scene);expect(()=>new ModelInstance(source,entry)).toThrow('RTS building lifecycle');
  });
  it('keeps existing metadata-free buildings compatible',()=>{
    const scene=new THREE.Group();expect(readBuildingLifecycleMetadata(scene)).toBeUndefined();
    const model=new ModelInstance({scene,animations:[]} as unknown as GLTF,entry);expect(model.setDestruction(1,1)).toBe(false);model.dispose();
  });
  it.each([
    (low:GLTF)=>{low.scene.userData.rtsBuildingLifecycle.clusters[2].angle=.7;},
    (low:GLTF)=>{low.scene.userData.rtsBuildingLifecycle.clusters[2].delay=.2;},
    (low:GLTF)=>{low.scene.getObjectByName('wall-a')!.userData.rtsDestructionCluster='wall-b';low.scene.getObjectByName('wall-b')!.userData.rtsDestructionCluster='wall-a';},
    (low:GLTF)=>{low.scene.getObjectByName('roof')!.userData.rtsPartIds=['another-source-part'];},
  ])('rejects independently valid LODs with incompatible lifecycle semantics',mutate=>{
    const high=authored(),low=authored();mutate(low);expect(readBuildingLifecycleMetadata(low.scene)).toBeDefined();
    expect(()=>new ModelInstance(high,entry,0,false,low)).toThrow('lifecycle metadata differs');
  });
  it('accepts reordered metadata and simpler geometry when both LODs preserve lifecycle semantics',()=>{
    const high=authored(),low=authored();low.scene.userData.rtsBuildingLifecycle.clusters.reverse();low.scene.userData.rtsBuildingLifecycle.replacementSets[0].deathFragments.reverse();
    for(const owner of low.scene.children)(owner.children[0] as THREE.Mesh).geometry=new THREE.PlaneGeometry(.9,.9);
    const model=new ModelInstance(high,entry,0,false,low);model.setDestruction(.5,1);model.setDetailPixels(10);
    expect(visibleNames(model.root)).toEqual(['foundation mesh','wall-a mesh','wall-b mesh','roof mesh','trim mesh']);model.dispose();
  });
});
