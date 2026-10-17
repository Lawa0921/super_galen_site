import {afterEach,describe,expect,it} from 'vitest';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from './models';
const instances:ModelInstance[]=[];
afterEach(()=>{instances.splice(0).forEach(m=>m.dispose());});
function asset(dedicated=true):GLTF{
  const scene=new THREE.Group(),body=new THREE.Object3D();body.name='Body';scene.add(body);
  const clip=(name:string,duration:number,values:number[])=>new THREE.AnimationClip(name,duration,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,duration],values)]);
  const animations=[clip('Idle',1,[0,0]),clip('Walk',1,[0,2]),clip('Attack',1,[0,10]),clip('Hurt',1,[-2,-2]),clip('Death',1,[-4,-4])];
  if(dedicated)animations.push(clip('Cast',1,[0,4]),clip('CastCleave',2,[0,6]),clip('CastMend',.5,[0,8]),clip('CastBanner',1,[0,12]),clip('Mine',1,[1,1]),clip('Chop',1,[2,2]),clip('Build',1,[3,3]));
  return {scene,animations} as unknown as GLTF;
}
function model(high=asset(),low=asset()){const m=new ModelInstance(high,{url:'/assets/games/rts/models/commander.glb',status:'published'},0,false,low);instances.push(m);return m;}
const pose=(m:ModelInstance)=>m.root.children.map(root=>root.getObjectByName('Body')!.position.x);
describe('simulation-timed casting and authored work',()=>{
  it.each([['heal',2],['cleave',3],['mend',4],['banner',6]] as const)('shows %s once over .6 seconds in both LODs, above attack and hurt', (kind,mid)=>{
    const m=model();m.animate('attack',.016,{sequence:1,elapsed:.1},0,{sequence:1,elapsed:.1},{kind,sequence:1,elapsed:.3});
    pose(m).forEach(x=>expect(x).toBeCloseTo(mid));m.setDetailPixels(20);
    for(const dt of [0,.016,.5]){m.animate('attack',dt,{sequence:1,elapsed:.1},0,undefined,{kind,sequence:1,elapsed:.3});pose(m).forEach(x=>expect(x).toBeCloseTo(mid));}
    m.animate('attack',0,{sequence:1,elapsed:.7},0,undefined,{kind,sequence:1,elapsed:.6});pose(m).forEach(x=>expect(x).toBeCloseTo(7));
  });
  it('freezes cast entry fades at the same age and restarts a new sequence',()=>{
    const m=model();m.animate('walk',.25);expect(pose(m)).toEqual([.5,.5]);
    m.animate('walk',.016,undefined,2,undefined,{kind:'mend',sequence:1,elapsed:0});const first=pose(m);
    m.animate('walk',.016,undefined,2,undefined,{kind:'mend',sequence:1,elapsed:0});expect(pose(m)).toEqual(first);
    m.animate('walk',.016,undefined,2,undefined,{kind:'mend',sequence:1,elapsed:.3});pose(m).forEach(x=>expect(x).toBeCloseTo(4));
    m.animate('idle',.016,undefined,0,undefined,{kind:'mend',sequence:2,elapsed:0});expect(pose(m)).toEqual([0,0]);
  });
  it('gives death immediate priority and discards stale/future raw cast loops',()=>{
    const m=model();m.animate('idle',.1,undefined,0,undefined,{kind:'mend',sequence:1,elapsed:.3});
    m.animate('death',0,undefined,0,undefined,{kind:'mend',sequence:1,elapsed:.35});expect(pose(m)).toEqual([-4,-4]);
    for(const elapsed of [.6,5,-.1,Number.NaN]){
      const stale=model();stale.animate('cast',.1,undefined,0,undefined,{kind:'heal',sequence:1,elapsed});expect(pose(stale)).toEqual([0,0]);
    }
  });
  it('uses the same timed attack fallback when dedicated clips are missing',()=>{
    const m=model(asset(false),asset(false));m.animate('cast',.1,undefined,0,undefined,{kind:'cleave',sequence:1,elapsed:.3});pose(m).forEach(x=>expect(x).toBeCloseTo(5));
    m.animate('cast',.2,undefined,0,undefined,{kind:'cleave',sequence:1,elapsed:.7});pose(m).forEach(x=>expect(x).toBeCloseTo(0));
  });
  it.each([['mine',1],['chop',2],['build',3]] as const)('uses %s, permits hurt, then resumes its cycle', (name,value)=>{
    const m=model();m.animate(name,.2);pose(m).forEach(x=>expect(x).toBeCloseTo(value));
    m.animate(name,.1,undefined,0,{sequence:1,elapsed:.2});pose(m).forEach(x=>expect(x).toBeCloseTo(-2));
    m.animate(name,.1,undefined,0,{sequence:1,elapsed:.4});pose(m).forEach(x=>expect(x).toBeCloseTo(value));
    const fallback=model(asset(false),asset(false));fallback.animate(name,.2);pose(fallback).forEach(x=>expect(x).toBeCloseTo(2));
  });
});
