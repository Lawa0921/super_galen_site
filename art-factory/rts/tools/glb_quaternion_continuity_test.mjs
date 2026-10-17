import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalizeRotationQuaternions} from './glb_quaternion_continuity.mjs';

function fixture(interpolation, rows) {
  const times = interpolation==='CUBICSPLINE'?rows.length/3:rows.length;
  const json={asset:{version:'2.0'},buffers:[{byteLength:times*4+rows.length*16}],bufferViews:[{buffer:0,byteOffset:0,byteLength:times*4},{buffer:0,byteOffset:times*4,byteLength:rows.length*16}],
    accessors:[{bufferView:0,componentType:5126,count:times,type:'SCALAR'},{bufferView:1,componentType:5126,count:rows.length,type:'VEC4'}],
    animations:[{samplers:[{input:0,output:1,interpolation}],channels:[{sampler:0,target:{node:0,path:'rotation'}}]}],nodes:[{name:'Bone'}]};
  const js=Buffer.from(JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length/4)*4));
  const bin=Buffer.alloc(times*4+rows.length*16);for(let i=0;i<times;i++)bin.writeFloatLE(i,i*4);
  rows.flat().forEach((v,i)=>bin.writeFloatLE(v,times*4+i*4));
  const out=Buffer.alloc(28+js.length+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
  out.writeUInt32LE(js.length,12);out.writeUInt32LE(0x4e4f534a,16);js.copy(out,20);out.writeUInt32LE(bin.length,20+js.length);out.writeUInt32LE(0x004e4942,24+js.length);bin.copy(out,28+js.length);
  return {bytes:out,read:bytes=>Array.from({length:rows.length},(_,r)=>Array.from({length:4},(_,c)=>bytes.readFloatLE(28+js.length+times*4+r*16+c*4)))};
}
const near=(got,want)=>{got.forEach((v,i)=>assert.ok(Math.abs(v-want[i])<1e-7,`${got} != ${want}`));};
test('LINEAR rotation uses a continuous hemisphere and keeps caller bytes immutable',()=>{
  const f=fixture('LINEAR',[[0,0,0,1],[0,0,-.6,-.8],[0,0,.8,.6]]),before=Buffer.from(f.bytes);
  const out=canonicalizeRotationQuaternions(f.bytes);near(f.read(out.buffer)[1],[0,0,.6,.8]);assert.equal(out.report.changedKeys,1);assert.deepEqual(f.bytes,before);
});
test('CUBICSPLINE flips the value and both tangents together',()=>{
  const f=fixture('CUBICSPLINE',[[0,0,0,0],[0,0,0,1],[.1,.2,.3,.4],[-.1,-.2,-.3,-.4],[0,0,0,-1],[-.4,-.3,-.2,-.1]]);
  const out=canonicalizeRotationQuaternions(f.bytes),rows=f.read(out.buffer);near(rows[3],[.1,.2,.3,.4]);near(rows[4],[0,0,0,1]);near(rows[5],[.4,.3,.2,.1]);near(rows[2],[.1,.2,.3,.4]);assert.equal(out.report.changedKeys,1);
});
test('Antipodal cubic identity no longer interpolates through zero quaternion',()=>{
  const f=fixture('CUBICSPLINE',[[0,0,0,0],[0,0,0,1],[0,0,0,0],[0,0,0,0],[0,0,0,-1],[0,0,0,0]]);
  const rows=f.read(canonicalizeRotationQuaternions(f.bytes).buffer);const middle=rows[1].map((v,i)=>(v+rows[4][i])*.5);assert.ok(Math.abs(Math.hypot(...middle)-1)<1e-7);
});
test('Already continuous rotation is byte-identical and idempotent',()=>{
  const f=fixture('LINEAR',[[0,0,0,1],[0,0,.6,.8]]);const out=canonicalizeRotationQuaternions(f.bytes);assert.equal(out.report.changedKeys,0);assert.deepEqual(out.buffer,f.bytes);assert.deepEqual(canonicalizeRotationQuaternions(out.buffer).buffer,out.buffer);
});
test('Zero quaternion fails closed without mutating input',()=>{
  const f=fixture('LINEAR',[[0,0,0,1],[0,0,0,0]]),before=Buffer.from(f.bytes);assert.throws(()=>canonicalizeRotationQuaternions(f.bytes),/quaternion/i);assert.deepEqual(f.bytes,before);
});
