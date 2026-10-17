/** Numeric regression for real GLTFLoader skinning, node associations and local bounds. */
import test from 'node:test';
import assert from 'node:assert/strict';
let audit;
try { ({auditBoundsGlb:audit}=await import('./original_guard_bounds_qa.mjs')); } catch {}

function fixture(radius=6) {
  const chunks=[],views=[],accessors=[];let offset=0;
  function add(data,type,componentType) {
    const bytes=Buffer.from(data.buffer,data.byteOffset,data.byteLength);
    if(offset%4){const pad=Buffer.alloc(4-offset%4);chunks.push(pad);offset+=pad.length;}
    const view=views.push({buffer:0,byteOffset:offset,byteLength:bytes.length})-1;
    chunks.push(bytes);offset+=bytes.length;
    const widths={SCALAR:1,VEC3:3,VEC4:4,MAT4:16};
    const accessor={bufferView:view,componentType,count:data.length/widths[type],type};
    return accessors.push(accessor)-1;
  }
  const position=add(new Float32Array([0,0,0,1,0,0,0,1,0]),'VEC3',5126);
  accessors[position].min=[0,0,0];accessors[position].max=[1,1,0];
  const joints=add(new Uint16Array(12),'VEC4',5123);
  const weights=add(new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0]),'VEC4',5126);
  const index=add(new Uint16Array([0,1,2]),'SCALAR',5123);
  const inverse=add(new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),'MAT4',5126);
  const times=add(new Float32Array([0,.37,1]),'SCALAR',5126);
  accessors[times].min=[0];accessors[times].max=[1];
  const values=add(new Float32Array([0,0,0,1.48,0,0,4,0,0]),'VEC3',5126);
  if(offset%4){chunks.push(Buffer.alloc(4-offset%4));offset+=4-offset%4;}
  const primitive={attributes:{POSITION:position,JOINTS_0:joints,WEIGHTS_0:weights},indices:index};
  const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],
    nodes:[
      {name:'TransformedRoot',translation:[11,-2,7],rotation:[0,Math.sin(.35),0,Math.cos(.35)],scale:[2,3,.5],children:[1,2]},
      {name:'Moving'},
      {name:'BodyWithTwoMaterials',mesh:0,skin:0,extras:{rtsConservativeBounds:{sphere_center_y_up_m:[0,0,0],sphere_radius_m:radius}}}
    ],
    meshes:[{name:'FixtureMesh',primitives:[{...primitive,material:0},{...primitive,material:1}]}],
    skins:[{joints:[1],inverseBindMatrices:inverse}],
    materials:[{pbrMetallicRoughness:{}},{pbrMetallicRoughness:{}}],
    animations:[{name:'Attack',samplers:[{input:times,output:values,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:1,path:'translation'}}]}],
    accessors,bufferViews:views,buffers:[{byteLength:offset}]};
  let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);
  const binary=Buffer.concat(chunks),header=Buffer.alloc(12),jsonHead=Buffer.alloc(8),binHead=Buffer.alloc(8);
  header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);
  jsonHead.writeUInt32LE(json.length);jsonHead.writeUInt32LE(0x4e4f534a,4);
  binHead.writeUInt32LE(binary.length);binHead.writeUInt32LE(0x004e4942,4);
  return 'data:model/gltf-binary;base64,'+Buffer.concat([header,jsonHead,json,binHead,binary]).toString('base64');
}

test('deformed vertices use source-node local coordinates despite transformed ancestors and split materials',async()=>{
  assert.equal(typeof audit,'function','bounds audit is not implemented');
  const result=await audit({url:fixture(),expectedClips:['Attack'],sampleHz:60});
  assert.equal(result.status,'pass',JSON.stringify(result));
  assert.equal(result.primitiveDrawCount,2);
  assert.equal(result.sourceNodes.length,1);
  assert.equal(result.sourceNodes[0].nodeIndex,2);
  assert.equal(result.sourceNodes[0].primitiveCount,2);
  assert.ok(Math.abs(result.sourceNodes[0].sampledAabbMin[0])<1e-6);
  assert.ok(Math.abs(result.sourceNodes[0].sampledAabbMax[0]-5)<1e-6);
  assert.equal(result.clips[0].sampledKeyTimeCount,3);
  assert.equal(result.clips[0].sampleCount,62);
  assert.equal(result.clips[0].allKeyTimesCovered,true);
});

test('a sphere that contains the rest pose but misses the attack tip fails with the exact exported sample',async()=>{
  assert.equal(typeof audit,'function','bounds audit is not implemented');
  const result=await audit({url:fixture(2),expectedClips:['Attack'],sampleHz:60});
  assert.equal(result.status,'fail');
  assert.ok(Math.abs(result.maxOutsideDistanceM-3)<1e-6,JSON.stringify(result));
  assert.equal(result.worstSample.clip,'Attack');
  assert.equal(result.worstSample.timeSeconds,1);
  assert.equal(result.worstSample.nodeIndex,2);
  assert.equal(result.worstSample.vertexIndex,1);
  assert.ok(result.errors.some(e=>e.code==='bounds_outside'));
});
