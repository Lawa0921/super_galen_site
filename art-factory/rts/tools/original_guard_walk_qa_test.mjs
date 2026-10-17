import test from 'node:test';
import assert from 'node:assert/strict';
let audit;try{({auditWalkGlb:audit}=await import('./original_guard_walk_qa.mjs'));}catch{}
function fixture(stationary=false){
  const chunks=[],views=[],accessors=[];let offset=0;
  const add=(data,type,componentType)=>{
    if(offset%4){const p=Buffer.alloc(4-offset%4);chunks.push(p);offset+=p.length;}
    const b=Buffer.from(data.buffer,data.byteOffset,data.byteLength),v=views.push({buffer:0,byteOffset:offset,byteLength:b.length})-1;
    chunks.push(b);offset+=b.length;
    const i=accessors.push({bufferView:v,componentType,count:data.length/({SCALAR:1,VEC3:3,VEC4:4,MAT4:16}[type]),type})-1;return i;
  };
  const p=add(new Float32Array([-.25,0,-.15,-.15,0,-.15,-.25,0,.15,-.15,0,.15,.15,0,-.15,.25,0,-.15,.15,0,.15,.25,0,.15]),'VEC3',5126);
  accessors[p].min=[-.25,0,-.15];accessors[p].max=[.25,0,.15];
  const j=add(new Uint16Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),'VEC4',5123);
  const w=add(new Float32Array(Array.from({length:8},()=>[1,0,0,0]).flat()),'VEC4',5126);
  const ix=add(new Uint16Array([0,2,1,1,2,3,4,6,5,5,6,7]),'SCALAR',5123);
  const inv=add(new Float32Array(Array.from({length:2},()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]).flat()),'MAT4',5126);
  const times=add(new Float32Array([0,.2,.5,1]),'SCALAR',5126);accessors[times].min=[0];accessors[times].max=[1];
  const l=add(new Float32Array(stationary?[0,0,0,0,0,0,0,0,0,0,0,0]:[0,0,0,0,0,.6,0,.2,0,0,0,0]),'VEC3',5126);
  const r=add(new Float32Array([0,.2,0,0,.2,0,0,.2,0,0,.2,0]),'VEC3',5126);
  if(offset%4){const p=Buffer.alloc(4-offset%4);chunks.push(p);offset+=p.length;}
  const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1,2],extras:{rtsMotion:{version:1,locomotion:{clip:'Walk',strideMeters:3,cycleSeconds:1}}}}],
    nodes:[{name:'Foot_L'},{name:'Foot_R'},{name:'TwoSoles',mesh:0,skin:0}],skins:[{joints:[0,1],inverseBindMatrices:inv}],
    meshes:[{primitives:[{attributes:{POSITION:p,JOINTS_0:j,WEIGHTS_0:w},indices:ix}]}],
    animations:[{name:'Walk',samplers:[{input:times,output:l},{input:times,output:r}],channels:[{sampler:0,target:{node:0,path:'translation'}},{sampler:1,target:{node:1,path:'translation'}}]}],
    accessors,bufferViews:views,buffers:[{byteLength:offset}]};
  let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const b=Buffer.concat(chunks),h=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
  h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+b.length,8);jh.writeUInt32LE(json.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(b.length);bh.writeUInt32LE(0x004e4942,4);
  return 'data:model/gltf-binary;base64,'+Buffer.concat([h,jh,json,bh,b]).toString('base64');
}
test('actual foot vertices lock to world ground under runtime pi yaw and 3 m/s translation',async()=>{
  assert.equal(typeof audit,'function','walk audit not implemented');
  const r=await audit({url:fixture(),speedMps:3,sampleHz:120});
  assert.equal(r.status,'pass',JSON.stringify(r.errors));
  const s=r.samples.find(s=>Math.abs(s.timeSeconds-.1)<1e-6);
  assert.ok(s.feet.left.sole.horizontalSpeedMps<1e-5,JSON.stringify(s));
  assert.ok(Math.abs(s.feet.left.toe.pointWorld[2]-.15)<1e-5,JSON.stringify(s));
  assert.ok(s.feet.right.sole.heightM>.19);
  const flight=r.samples.find(s=>Math.abs(s.timeSeconds-.5)<1e-6);
  assert.ok(flight.feet.left.sole.heightM>.19&&flight.feet.right.sole.heightM>.19);
  assert.equal(r.feet.left.soleVertexCount,4);
});
test('a ground-height foot that does not countertranslate reports 3 m/s sliding',async()=>{
  assert.equal(typeof audit,'function','walk audit not implemented');
  const r=await audit({url:fixture(true),speedMps:3,sampleHz:120});
  assert.equal(r.status,'pass',JSON.stringify(r.errors));
  const s=r.samples.find(s=>Math.abs(s.timeSeconds-.1)<1e-6);
  assert.ok(Math.abs(s.feet.left.sole.horizontalSpeedMps-3)<1e-5,JSON.stringify(s));
  assert.equal(s.feet.left.sole.heightM,0);
});
