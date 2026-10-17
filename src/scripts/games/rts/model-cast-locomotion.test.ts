import {afterEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from './models';

const instances:ModelInstance[]=[];
afterEach(()=>{instances.splice(0).forEach(m=>m.dispose());vi.restoreAllMocks();});
function asset(dedicated=true):GLTF {
  const scene=new THREE.Group(),bones=['Root','Pelvis','SpineLower','Thigh_L','Shin_L','Foot_L','Thigh_R','Shin_R','Foot_R'].map(name=>{const b=new THREE.Bone();b.name=name;return b;});
  scene.add(bones[0]);bones[0].add(bones[1]);bones[1].add(bones[2],bones[3],bones[6]);bones[3].add(bones[4]);bones[4].add(bones[5]);bones[6].add(bones[7]);bones[7].add(bones[8]);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(12).fill(0),4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
  const body=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());body.name='Body';scene.add(body);body.bind(new THREE.Skeleton(bones));
  const clip=(name:string,lower:number,upper:number)=>new THREE.AnimationClip(name,1,bones.map((b,i)=>new THREE.NumberKeyframeTrack(`${b.name}.position[x]`,[0,1],[0,(i===2?upper:lower)*(i+1)])));
  const animations=[clip('Idle',0,0),clip('Walk',1,2),clip('Attack',0,10),clip('Death',-4,-4),clip('Hurt',-2,-2)];
  if(dedicated)animations.push(clip('Cast',0,4),clip('CastCleave',0,6),clip('CastMend',0,8),clip('CastBanner',0,12));
  scene.userData.rtsMotion={version:1,locomotion:{clip:'Walk',strideMeters:2,cycleSeconds:1},attack:{clip:'Attack',durationSeconds:1,contactSeconds:.5}};
  return {scene,animations} as unknown as GLTF;
}
function model(dedicated=true,shared=true){const high=asset(dedicated),low=asset(dedicated);if(!shared)low.animations[0].tracks[0].values[0]=.001;const m=new ModelInstance(high,{url:'/assets/games/rts/models/commander.glb',status:'published'},0,false,low);instances.push(m);return m;}
function pose(m:ModelInstance,lod=0){return (m.root.children[lod].getObjectByName('Body') as THREE.SkinnedMesh).skeleton.bones.map(b=>b.position.x);}
const lower=(m:ModelInstance)=>pose(m).filter((_,i)=>i!==2);
function sameLower(a:ModelInstance,b:ModelInstance){lower(a).forEach((v,i)=>expect(v).toBeCloseTo(lower(b)[i],6));}
function cast(m:ModelInstance,dt:number,elapsed:number,kind:'heal'|'cleave'|'mend'|'banner'='mend',sequence=1,base='walk',speed=2){m.animate(base,dt,undefined,speed,undefined,{kind,sequence,elapsed});}

describe('walking while casting',()=>{
  it.each([['heal',4],['cleave',6],['mend',8],['banner',12]] as const)('keeps %s legs in the existing walk phase and freezes only spell pose at equal age', (kind,upper)=>{
    const m=model(),walk=model();m.animate('walk',.27,undefined,2);walk.animate('walk',.27,undefined,2);
    for(const [dt,age] of [[.05,.3],[.07,.3],[.1,.4],[0,.4]] as const){
      cast(m,dt,age,kind);walk.animate('walk',dt,undefined,2);sameLower(m,walk);
      expect(pose(m)[2]).toBeCloseTo(upper*3*age/.6);expect(pose(m,1)).toEqual(pose(m));
    }
    const before=pose(m);cast(m,0,.4,kind);expect(pose(m)).toEqual(before);
    cast(m,.03,.6,kind);walk.animate('walk',.03,undefined,2);sameLower(m,walk);
    m.animate('walk',.04,undefined,1);walk.animate('walk',.04,undefined,1);sameLower(m,walk);
  });
  it('holds the upper entry blend at the same age while lower tracks advance exactly once',()=>{
    const m=model(),walk=model();m.animate('walk',.25,undefined,2);walk.animate('walk',.25,undefined,2);
    cast(m,0,0);const entry=pose(m)[2];expect(entry).toBeCloseTo(1.5);
    cast(m,.02,.05);walk.animate('walk',.02,undefined,2);const upper=pose(m)[2];sameLower(m,walk);
    const update=vi.spyOn(THREE.AnimationMixer.prototype,'update');cast(m,.08,.05);
    expect(update).toHaveBeenCalledTimes(1);update.mockRestore();walk.animate('walk',.08,undefined,2);
    expect(pose(m)[2]).toBeCloseTo(upper);sameLower(m,walk);
    m.setDetailPixels(20);expect(pose(m,1)).toEqual(pose(m));
  });
  it('handles moving, stopping, resuming, a new cast, and immediate death without stale layer weights',()=>{
    const m=model(),walk=model();m.animate('walk',.2,undefined,2);walk.animate('walk',.3,undefined,2);cast(m,.1,.3);
    cast(m,.05,.35,'mend',1,'idle',0);expect(pose(m)[2]).toBeCloseTo(8*3*.35/.6);
    const stopped=pose(m);cast(m,0,.35,'mend',1,'idle',0);expect(pose(m)).toEqual(stopped);
    cast(m,.05,.4);walk.animate('walk',.05,undefined,2);sameLower(m,walk);expect(pose(m)[2]).toBeCloseTo(16);
    cast(m,.05,.3,'banner',2);expect(pose(m)[2]).toBeCloseTo(18);
    m.animate('death',0,undefined,0,undefined,{kind:'banner',sequence:2,elapsed:.35});expect(pose(m)).toEqual(new Array(9).fill(0));
    m.animate('death',.2);pose(m).forEach((x,i)=>expect(x).toBeCloseTo(-.8*(i+1)));
  });
  it('retains the full-body timed legacy fallback when no dedicated spell exists',()=>{
    const m=model(false);m.animate('walk',.2,undefined,2);cast(m,.05,.3);expect(lower(m)).toEqual(new Array(8).fill(0));expect(pose(m)[2]).toBeCloseTo(15);
  });
  it('preserves feet on a new sequence and fades the upper body back into the continuous walk',()=>{
    const m=model(),walk=model();m.animate('walk',.25,undefined,2);walk.animate('walk',.25,undefined,2);
    cast(m,.1,.3);walk.animate('walk',.1,undefined,2);sameLower(m,walk);
    cast(m,0,0,'banner',2);sameLower(m,walk);
    cast(m,.1,.55,'banner',2);walk.animate('walk',.1,undefined,2);sameLower(m,walk);const upper=pose(m)[2];
    cast(m,0,.6,'banner',2);sameLower(m,walk);expect(pose(m)[2]).toBeCloseTo(upper);
    for(const dt of [.05,.11,.1]){m.animate('walk',dt,undefined,1);walk.animate('walk',dt,undefined,1);sameLower(m,walk);}
    expect(pose(m)[2]).toBeCloseTo(pose(walk)[2]);
  });
  it('can stop and resume during the entry window without replaying the upper entry',()=>{
    const m=model(),walk=model();m.animate('walk',.2,undefined,2);walk.animate('walk',.22,undefined,2);cast(m,.02,.05);
    cast(m,.02,.1,'mend',1,'idle',0);expect(pose(m)[2]).toBeCloseTo(4);
    cast(m,.02,.12);walk.animate('walk',.02,undefined,2);sameLower(m,walk);expect(pose(m)[2]).toBeCloseTo(4.8);
  });
  it.each([true,false])('resumes the pre-heal stride after the priest stops for one simulation tick (shared rig %s)',shared=>{
    const m=model(true,shared),walk=model(true,shared);m.animate('walk',.27,undefined,2);walk.animate('walk',.27,undefined,2);
    cast(m,.02,0,'heal',1,'cast',0);cast(m,.03,0,'heal',1,'cast',0);
    cast(m,.02,.05,'heal');walk.animate('walk',.02,undefined,2);sameLower(m,walk);expect(pose(m,1)).toEqual(pose(m));
    cast(m,.03,.05,'heal');walk.animate('walk',.03,undefined,2);sameLower(m,walk);expect(pose(m,1)).toEqual(pose(m));
  });
  it.each(['expired','new-sequence','death'])('does not reuse a stopped stride after %s',ending=>{
    const m=model(),fresh=model();m.animate('walk',.27,undefined,2);cast(m,0,0,'heal',1,'cast',0);
    if(ending==='expired')m.animate('idle',0);
    else if(ending==='death')m.animate('death',0);
    const sequence=ending==='new-sequence'?2:1;
    cast(m,.03,.3,'heal',sequence);cast(fresh,.03,.3,'heal',sequence);sameLower(m,fresh);
  });
  it.each([true,false])('clears every layer when death interrupts the return to walk (shared rig %s)',shared=>{
    const m=model(true,shared);m.animate('walk',.2,undefined,2);cast(m,.1,.5);cast(m,.02,.6);
    m.animate('death',0);expect(pose(m)).toEqual(new Array(9).fill(0));expect(pose(m,1)).toEqual(pose(m));
    m.animate('death',.1);pose(m).forEach((x,i)=>expect(x).toBeCloseTo(-.4*(i+1)));expect(pose(m,1)).toEqual(pose(m));
  });
  it('falls back to a new incomplete dedicated clip instead of retaining the previous spell layer',()=>{
    const high=asset(),low=asset();for(const source of [high,low])source.animations.find(c=>c.name==='CastBanner')!.tracks=source.animations.find(c=>c.name==='CastBanner')!.tracks.filter(t=>t.name.startsWith('SpineLower.'));
    const m=new ModelInstance(high,{url:'/assets/games/rts/models/commander.glb',status:'published'},0,false,low);instances.push(m);
    m.animate('walk',.2,undefined,2);cast(m,.05,.3);cast(m,.05,.3,'banner',2);
    expect(pose(m)[2]).toBeCloseTo(18);expect(lower(m)).toEqual(new Array(8).fill(0));expect(pose(m,1)).toEqual(pose(m));
  });
  it('updates independent LOD mixers once each and clears layers for attack or hurt after the cast window',()=>{
    for(const next of ['attack','hurt']){
      const m=model(true,false);m.animate('walk',.2,undefined,2);
      const update=vi.spyOn(THREE.AnimationMixer.prototype,'update');cast(m,.05,.4);expect(update).toHaveBeenCalledTimes(2);update.mockRestore();
      if(next==='attack')m.animate('attack',0,{sequence:1,elapsed:.7},0,undefined,{kind:'mend',sequence:1,elapsed:.7});
      else m.animate('walk',0,undefined,2,{sequence:1,elapsed:.2},{kind:'mend',sequence:1,elapsed:.7});
      if(next==='attack'){expect(pose(m)[2]).toBeCloseTo(21);expect(lower(m)).toEqual(new Array(8).fill(0));}
      else pose(m).forEach((x,i)=>expect(x).toBeCloseTo(-.4*(i+1)));
      expect(pose(m,1)).toEqual(pose(m));
    }
  });
});
