import {afterEach,describe,expect,it} from 'vitest';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from './models';
const models:ModelInstance[]=[];
afterEach(()=>{models.splice(0).forEach(model=>model.dispose());});
function asset(hurtDuration:number|null=1):GLTF {
  const scene=new THREE.Group(),body=new THREE.Object3D();body.name='Body';scene.add(body);
  scene.userData.rtsMotion={version:1,locomotion:{clip:'Walk',strideMeters:2,cycleSeconds:1},attack:{clip:'Attack',durationSeconds:1,contactSeconds:.5}};
  const clip=(name:string,duration:number,values:number[])=>new THREE.AnimationClip(name,duration,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,duration],values)]);
  const animations=[clip('Idle',1,[0,0]),clip('Walk',1,[0,2]),clip('Work',1,[0,3]),clip('Attack',2,[0,4]),clip('Cast',1,[3,3]),clip('Death',1,[-4,-4])];
  if(hurtDuration!==null)animations.push(new THREE.AnimationClip('Hurt',hurtDuration,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,hurtDuration*.25,hurtDuration],[0,-2,0])]));
  return {scene,animations} as unknown as GLTF;
}
function model(high=asset(),low=asset()){
  const instance=new ModelInstance(high,{url:'/assets/games/rts/models/guard.glb',status:'published'},0,false,low);models.push(instance);return instance;
}
const pose=(m:ModelInstance)=>m.root.children.map(root=>root.getObjectByName('Body')!.position.x);
describe('authored hurt playback',()=>{
  it('holds the entry fade on repeated simulation ages from a moving pose',()=>{
    const m=model();m.animate('walk',.25,undefined,2);expect(pose(m)).toEqual([.5,.5]);
    m.animate('walk',.016,undefined,2,{sequence:1,elapsed:0});const entry=pose(m);
    for(let frame=0;frame<4;frame++){
      m.animate('walk',.016,undefined,2,{sequence:1,elapsed:0});expect(pose(m)).toEqual(entry);
    }
    m.animate('walk',.016,undefined,2,{sequence:1,elapsed:.05});const halfway=pose(m);expect(halfway).not.toEqual(entry);
    m.animate('walk',.016,undefined,2,{sequence:1,elapsed:.05});expect(pose(m)).toEqual(halfway);
  });
  it('seeks the actual recoil at simulation age without using attack retiming and freezes repeated ages in both LODs',()=>{
    const m=model();m.animate('idle',.1);m.animate('idle',.1,undefined,0,{sequence:1,elapsed:.2});
    pose(m).forEach(x=>expect(x).toBeCloseTo(-1.6));const before=pose(m);
    m.setDetailPixels(20);m.animate('idle',.1,undefined,0,{sequence:1,elapsed:.2});expect(pose(m)).toEqual(before);
    m.animate('idle',0,undefined,0,{sequence:1,elapsed:.2});expect(pose(m)).toEqual(before);
    m.animate('idle',.05,undefined,0,{sequence:1,elapsed:.3});pose(m).forEach(x=>expect(x).toBeCloseTo(-1.8666666667));
  });
  it.each(['idle','walk','work'])('returns to looping %s after the short reaction window',base=>{
    const m=model();m.animate(base,.1,undefined,4,{sequence:1,elapsed:.2});expect(pose(m)[0]).toBeLessThan(-1);
    m.animate(base,.1,undefined,4,{sequence:1,elapsed:.35});pose(m).forEach(x=>expect(x).toBeCloseTo(base==='idle'?0:base==='walk'?.4:.3,6));
    m.animate(base,.2,undefined,4,{sequence:1,elapsed:.55});
    pose(m).forEach(x=>expect(x).toBeCloseTo(base==='idle'?0:base==='walk'?1.2:.9));
  });
  it.each(['attack','cast','death'])('lets %s immediately take priority over a visible reaction',base=>{
    const m=model();m.animate('idle',.1,undefined,0,{sequence:7,elapsed:.2});expect(pose(m)[0]).toBeLessThan(-1);
    m.animate(base,0,base==='attack'?{sequence:7,elapsed:.4}:undefined,0,{sequence:7,elapsed:.25});
    pose(m).forEach(x=>expect(x).toBeCloseTo(base==='attack'?1.6:base==='cast'?3:-4));
  });
  it('does not replay an old or future cue when a unit becomes visible',()=>{
    for(const elapsed of [.35,1,-.1,Number.NaN]){
      const m=model();m.animate('idle',.2,undefined,0,{sequence:9,elapsed});expect(pose(m)).toEqual([0,0]);
    }
  });
  it('uses the shorter actual LOD clip window and leaves a missing clip on its base action',()=>{
    const short=model(asset(.2),asset(.15));short.animate('idle',.1,undefined,0,{sequence:1,elapsed:.1});expect(pose(short).every(x=>x<0)).toBe(true);
    short.animate('idle',.1,undefined,0,{sequence:1,elapsed:.15});pose(short).forEach(x=>expect(x).toBeCloseTo(0,6));
    const missing=model(asset(),asset(null));missing.animate('walk',.2,undefined,2,{sequence:1,elapsed:.1});expect(pose(missing)).toEqual([.4,.4]);
  });
});
