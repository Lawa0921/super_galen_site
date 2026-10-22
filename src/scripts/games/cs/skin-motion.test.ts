import { describe, it, expect } from 'vitest';
import * as T from 'three';
import { compileSkinMotion, createSkinMotion, type MotionBake } from './skin-motion';
import { createMatch } from './engine';
import actualBake from '../../../../art-factory/cs/runs/run-20261005-v7-cmu-cycles/candidate/cycles-v3.json';
function bake(): MotionBake {
 const frames=[0,.3,0,-.3,0].map((a,i)=>({offset:[0,Math.sin(i*Math.PI/2)*.02,0],rotations:[new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),a).toArray()]}));
 return {schema:'cs-cmu-target-cycles-v1',bones:['leg'],clips:[{name:'walk',duration:1,distance:1,frames},{name:'run',duration:.8,distance:2,frames:structuredClone(frames)}]};
}
function setup(data=compileSkinMotion(bake())) {
 const leg=new T.Bone(),visual=new T.Group();visual.add(leg);
 const controller=createSkinMotion({visual,bones:new Map([['leg',leg]])},data),match=createMatch('attack');match.phase='live';
 const actor=match.actors[1];actor.x=actor.z=0;
 return {leg,visual,controller,match,actor,step(x:number,time:number){actor.x=x;match.time=time;controller.update(actor,match);}};
}
describe('baked skin motion',()=>{
 it('accepts closed quantized rotations within the declared unit tolerance, while still rejecting an open seam',()=>{
  const raw=bake();raw.clips.forEach(c=>c.frames.forEach(f=>{f.rotations[0]=[.000001,0,0,.999999];}));
  const data=compileSkinMotion(raw),pose=data.createPose();data.sample('walk',.3,pose);
  expect(pose.rotations[0].length()).toBeCloseTo(1,12);
  expect(pose.rotations[0].x).toBeCloseTo(.000001/.999999,11);
  raw.clips[0].frames.at(-1)!.rotations[0]=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.1).toArray();
  expect(()=>compileSkinMotion(raw)).toThrow('Open motion rotation seam');
 });
 it('keeps distinct walk/run fallback samples and applies the run phase offset exactly once',()=>{
  const raw=bake();raw.clips[1].phaseOffset=.5;
  raw.clips[1].frames.forEach((f,i)=>{f.offset=[.1,.2+Math.sin(i*Math.PI/2)*.03,-.1];f.rotations[0]=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),.4+Math.sin(i*Math.PI/2)*.2).toArray();});
  const data=compileSkinMotion(raw),a=data.createPose(),b=data.createPose(),walk=data.createPose(),run=data.createPose();
  expect(data.sampleBlend(.37,.23,a,b)).toBe(.37);data.sample('walk',.23,walk);data.sample('run',.23,run);
  expect(a.offset.distanceTo(walk.offset)).toBeLessThan(1e-10);expect(b.offset.distanceTo(run.offset)).toBeLessThan(1e-10);
  expect(a.rotations[0].angleTo(walk.rotations[0])).toBeLessThan(1e-7);expect(b.rotations[0].angleTo(run.rotations[0])).toBeLessThan(1e-7);
  expect(a.offset.distanceTo(b.offset)).toBeGreaterThan(.1);expect(a.rotations[0].angleTo(b.rotations[0])).toBeGreaterThan(.1);
  raw.clips[1].phaseOffset=0;compileSkinMotion(raw).sample('run',.73,run);
  expect(b.offset.distanceTo(run.offset)).toBeLessThan(1e-10);expect(b.rotations[0].angleTo(run.rotations[0])).toBeLessThan(1e-7);
 });
 it('samples authored intermediate contact poses rather than blending only walk and run endpoints',()=>{
  const raw=bake(),flat=(angle:number)=>Array.from({length:5},()=>({offset:[0,.01,0],rotations:[new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),angle).toArray()]}));
  raw.blendSpace={knots:[{mix:0,frames:flat(0)},{mix:.5,frames:flat(.8)},{mix:1,frames:flat(.2)}]};
  const data=compileSkinMotion(raw),a=data.createPose(),b=data.createPose();
  const weight=data.sampleBlend(.5,.123,a,b);
  expect(a.rotations[0].clone().slerp(b.rotations[0],weight).angleTo(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.8))).toBeLessThan(1e-7);
  const left=data.sampleBlend(.25,.999,a,b);expect(a.rotations[0].clone().slerp(b.rotations[0],left).x).toBeCloseTo(Math.sin(.2),8);
  const s=setup(data);s.step(0,0);for(let i=1;i<=120;i++)s.step(i*.05,i/60);
  expect(s.controller.state.runMix).toBeCloseTo(.5,6);expect(s.leg.quaternion.angleTo(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.8))).toBeLessThan(1e-6);
 });
 it('rejects incomplete or unordered contact blend spaces and nonfinite blend coordinates',()=>{
  for(const mixes of [[.1,1],[0,.5,.5,1],[0,.7,.3,1],[0,.9]]){
   const raw=bake();raw.blendSpace={knots:mixes.map(mix=>({mix,frames:structuredClone(raw.clips[0].frames)}))};expect(()=>compileSkinMotion(raw)).toThrow();
  }
  const data=compileSkinMotion(bake()),a=data.createPose(),b=data.createPose();
  for(const mix of [-.1,1.1,NaN])expect(()=>data.sampleBlend(mix,.5,a,b)).toThrow();
 });
 it('advances from resolved distance, while blocked movement does not advance and pause freezes the exact pose',()=>{
  const s=setup();s.step(0,0);s.actor.moving=true;s.step(0,.05);expect(s.controller.state.phase).toBe(0);expect(s.controller.state.weight).toBe(0);
  s.step(.1,.1);expect(s.controller.state.phase).toBeGreaterThan(0);expect(Math.abs(s.leg.quaternion.x)).toBeGreaterThan(.001);
  const pose=s.leg.quaternion.toArray(),phase=s.controller.state.phase;s.step(.1,.1);
  expect(s.controller.state.phase).toBe(phase);expect(s.leg.quaternion.toArray()).toEqual(pose);
 });
 it('rebases round, match, resurrection and teleport without treating spawn travel as a stride',()=>{
  const s=setup();s.step(0,0);s.step(.2,.05);expect(s.controller.state.phase).toBeGreaterThan(0);
  s.match.round++;s.step(20,.1);expect(s.controller.state.phase).toBe(0);expect(s.controller.state.weight).toBe(0);
  s.step(20.2,.15);s.actor.hp=0;s.step(20.2,.2);s.actor.hp=100;s.step(-20,.25);expect(s.controller.state.phase).toBe(0);
  s.step(-19.8,.3);s.step(8,.35);expect(s.controller.state.phase).toBe(0);
  const next=createMatch('attack');next.phase='live';s.controller.update(next.actors[1],next);expect(s.controller.state.phase).toBe(0);
 });
 it('shares immutable compiled samples while keeping actor states and bone poses independent',()=>{
  const raw=bake(),data=compileSkinMotion(raw),a=setup(data),b=setup(data);raw.clips[0].frames[1].rotations[0][0]=NaN;
  a.step(0,0);b.step(0,0);a.step(.1,.05);
  expect(b.leg.quaternion.toArray()).toEqual([0,0,0,1]);expect(b.controller.state.phase).toBe(0);
  expect(a.leg.quaternion.toArray().every(Number.isFinite)).toBe(true);
 });
 it('applies the recorded phase alignment before sampling both rotations and pelvis motion',()=>{
  const raw=bake(),original=compileSkinMotion(raw);raw.clips[1].phaseOffset=.5;
  const aligned=compileSkinMotion(raw),a=aligned.createPose(),b=original.createPose();
  aligned.sample('run',.125,a);original.sample('run',.625,b);
  expect(a.rotations[0].angleTo(b.rotations[0])).toBeLessThan(1e-7);expect(a.offset.distanceTo(b.offset)).toBeLessThan(1e-8);
  for(const offset of [-.1,1,NaN]){raw.clips[1].phaseOffset=offset;expect(()=>compileSkinMotion(raw)).toThrow();}
 });
 it('normalizes antipodal keys and has continuous value and endpoint velocity on the baked loop',()=>{
  const raw=bake();raw.clips.forEach(c=>c.frames.forEach((f,i)=>{if(i%2)f.rotations[0]=f.rotations[0].map(v=>-v);}));
  const data=compileSkinMotion(raw),out=()=>({offset:new T.Vector3(),rotations:[new T.Quaternion()]}),a=out(),b=out(),before=out(),after=out(),eps=1e-5;
  data.sample('walk',0,a);data.sample('walk',1,b);data.sample('walk',1-eps,before);data.sample('walk',eps,after);
  expect(a.rotations[0].angleTo(b.rotations[0])).toBeLessThan(1e-7);
  expect(Math.abs((after.rotations[0].x-a.rotations[0].x)/eps-(b.rotations[0].x-before.rotations[0].x)/eps)).toBeLessThan(1e-3);
  expect(after.rotations[0].length()).toBeCloseTo(1,10);
 });
 it('rejects corrupt/open/incomplete data and missing rig bones before changing the pose',()=>{
  for(const kind of ['nan','open','missing','distance']){
   const raw=bake();if(kind==='nan')raw.clips[0].frames[1].rotations[0][0]=NaN;
   if(kind==='open')raw.clips[0].frames.at(-1)!.rotations[0]=[1,0,0,0];
   if(kind==='missing')raw.clips.pop();if(kind==='distance')raw.clips[0].distance=0;
   expect(()=>compileSkinMotion(raw)).toThrow();
  }
  const visual=new T.Group();expect(()=>createSkinMotion({visual,bones:new Map()},compileSkinMotion(bake()))).toThrow();expect(visual.position.toArray()).toEqual([0,0,0]);
 });
 it('keeps the actual retargeted twelve-bone walk/run bake C1 under the runtime consumer',()=>{
  const data=compileSkinMotion(actualBake),eps=1e-5;
  function difference(a:T.Quaternion,b:T.Quaternion,dt:number){
   const q=a.clone().invert().multiply(b);if(q.w<0)q.set(-q.x,-q.y,-q.z,-q.w);
   const v=new T.Vector3(q.x,q.y,q.z),n=v.length();return v.multiplyScalar((n<1e-12?2:2*Math.atan2(n,q.w)/n)/dt);
  }
  for(const clip of actualBake.clips){
   for(const center of [0,.5]){
   const end=center||1;
   const samples=[center,center+eps,center+2*eps,end-2*eps,end-eps,end].map(phase=>{const out=data.createPose();data.sample(clip.name,phase,out);return out;});
   const [a,a1,a2,b2,b1,b]=samples,dt=eps*clip.duration;
   expect(a.offset.distanceTo(b.offset)).toBeLessThan(1e-8);
   for(let i=0;i<data.bones.length;i++){
    expect(a.rotations[i].angleTo(b.rotations[i])).toBeLessThan(1e-7);
    const va=difference(a.rotations[i],a1.rotations[i],dt).multiplyScalar(4).sub(difference(a.rotations[i],a2.rotations[i],dt)).multiplyScalar(.5);
    const vb=difference(b.rotations[i],b1.rotations[i],dt).multiplyScalar(4).sub(difference(b.rotations[i],b2.rotations[i],dt)).multiplyScalar(-.5);
    expect(va.distanceTo(vb),`${clip.name}/${data.bones[i]}`).toBeLessThan(1e-3);
   }
   const va=a1.offset.clone().sub(a.offset).multiplyScalar(4).sub(a2.offset.clone().sub(a.offset)).divideScalar(2*dt);
   const vb=b1.offset.clone().sub(b.offset).multiplyScalar(4).sub(b2.offset.clone().sub(b.offset)).divideScalar(-2*dt);
   expect(va.distanceTo(vb)).toBeLessThan(1e-3);
   }
   const out=data.createPose();for(let i=0;i<=1024;i++){data.sample(clip.name,(i/512)%1,out);expect(out.rotations.every(q=>Math.abs(q.length()-1)<1e-8)).toBe(true);}
  }
 });
});
