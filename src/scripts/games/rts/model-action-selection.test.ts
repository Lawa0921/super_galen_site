import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from './models';

const entry={url:'/assets/games/rts/models/worker.glb',status:'published' as const};
function asset(actions:Record<string,number>,customAttack=false):GLTF {
  const scene=new THREE.Group(),body=new THREE.Object3D();body.name='Body';scene.add(body);
  if(customAttack)scene.userData.rtsMotion={version:1,locomotion:{clip:'Walk',strideMeters:2,cycleSeconds:1},attack:{clip:'Strike',durationSeconds:1,contactSeconds:.5}};
  const animations=Object.entries(actions).map(([name,value])=>new THREE.AnimationClip(name,1,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,1],[0,value])]));
  return {scene,animations} as unknown as GLTF;
}
const poses=(model:ModelInstance)=>model.root.children.map(root=>root.getObjectByName('Body')!.position.x);

describe('authored work and spell action selection',()=>{
  it.each([['work','Work',4],['cast','Cast',8]] as const)('plays the dedicated %s clip in both LODs and keeps it looping', (state,clip,value)=>{
    const make=()=>asset({Idle:0,Attack:1,[clip]:value});
    const model=new ModelInstance(make(),entry,0,false,make());
    try{
      model.animate(state,.25,{sequence:9,elapsed:.9});expect(poses(model)).toEqual([value*.25,value*.25]);
      model.setDetailPixels(20);model.animate(state,1,{sequence:10,elapsed:0});
      poses(model).forEach(x=>expect(x).toBeCloseTo(value*.25));
    }finally{model.dispose();}
  });
  it('changes from work to cast even though both used to select Attack',()=>{
    const model=new ModelInstance(asset({Idle:0,Attack:1,Work:4,Cast:8}),entry);
    try{model.animate('work',.25);model.animate('cast',.25);expect(poses(model)[0]).toBeCloseTo(2);}
    finally{model.dispose();}
  });
  it.each(['work','cast'])('keeps the authored attack fallback for legacy %s assets',state=>{
    const model=new ModelInstance(asset({Idle:0,Walk:0,Strike:4},true),entry);
    try{model.animate(state,.25);expect(poses(model)[0]).toBeCloseTo(1);model.animate(state,1);expect(poses(model)[0]).toBeCloseTo(1);}
    finally{model.dispose();}
  });
  it('chooses each unshared LOD independently and falls back to idle only when no action exists',()=>{
    const model=new ModelInstance(asset({Idle:0,Attack:1,Work:4}),entry,0,false,asset({Idle:2}));
    try{model.animate('work',.25);expect(poses(model)).toEqual([1,.5]);}
    finally{model.dispose();}
  });
  it('resets a completed attack before looping the legacy work fallback',()=>{
    const model=new ModelInstance(asset({Idle:0,Attack:1}),entry);
    try{
      model.animate('attack',0,{sequence:3,elapsed:2});expect(poses(model)[0]).toBe(1);
      model.animate('work',.25);expect(poses(model)[0]).toBeCloseTo(.25);
      model.animate('work',1);expect(poses(model)[0]).toBeCloseTo(.25);
    }finally{model.dispose();}
  });
  it.each(['work','cast'])('restores authored loop speed after a retimed combat attack enters %s',state=>{
    const source=asset({Idle:0,Walk:0,Strike:4},true);source.scene.userData.rtsMotion.attack.durationSeconds=4;
    const model=new ModelInstance(source,entry);
    try{
      model.animate('attack',0,{sequence:3,elapsed:2});expect(poses(model)[0]).toBe(2);
      model.animate(state,.25);expect(poses(model)[0]).toBeCloseTo(1);
    }finally{model.dispose();}
  });
  it('returns to a looping idle after a missing death clip clamped its fallback',()=>{
    const model=new ModelInstance(asset({Idle:4}),entry);
    try{
      model.animate('death',2);expect(poses(model)[0]).toBe(4);
      model.animate('idle',.25);expect(poses(model)[0]).toBeCloseTo(1);
      model.animate('idle',1);expect(poses(model)[0]).toBeCloseTo(1);
    }finally{model.dispose();}
  });
});
