import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalToGltf,mapVertices,comparePose,sourceNodeName} from './arm_pose_parity.mjs';

test('source identity uses the glTF node index even when Three renames a mesh',()=>{
  assert.equal(sourceNodeName({nodes:1},[{name:'ForearmArmor'},{name:'UpperArmArmor'}]),'UpperArmArmor');
});
test('a missing or invalid glTF node association cannot invent a component name',()=>{
  for(const association of [undefined,{}, {nodes:-1},{nodes:3},{nodes:.5}])assert.throws(()=>sourceNodeName(association,[{name:'Arm'}]),/node/);
  assert.throws(()=>sourceNodeName({nodes:0},[{}]),/name/);
});

test('canonical conversion preserves right, changes up and forward',()=>{
  assert.deepEqual(canonicalToGltf([[1,2,3],[-4,-5,-6]]),[[1,3,-2],[-4,-6,5]]);
});
test('rest map permits reordered exporter vertices and seam duplicates while requiring coverage',()=>{
  assert.deepEqual(mapVertices([[0,1,0],[0,0,0],[0,1,0],[1,0,0]],[[0,0,0],[1,0,0],[0,1,0]]),[2,0,2,1]);
});
test('a missing source vertex cannot silently produce a passing partial comparison',()=>{
  assert.throws(()=>mapVertices([[0,0,0]],[[0,0,0],[1,0,0]]),/coverage/);
});
test('unknown exported geometry rejects before comparing poses',()=>{
  assert.throws(()=>mapVertices([[.01,0,0]],[[0,0,0]]),/distance/);
});
test('empty, ambiguous or nonfinite reference is not a useful comparison',()=>{
  assert.throws(()=>mapVertices([],[]),/empty/);
  assert.throws(()=>mapVertices([[0,0,0]],[[0,0,0],[0,0,0]]),/ambiguous/);
  assert.throws(()=>canonicalToGltf([[0,NaN,0]]),/finite/);
});
test('pose comparison follows the rest mapping instead of re-matching a wrong pose',()=>{
  const mapping=[1,0];
  const result=comparePose([[2.001,0,0],[0,1,0]],[[0,1,0],[2,0,0]],mapping);
  assert.ok(Math.abs(result.maxDeviationM-.001)<1e-12);
  assert.equal(result.worstExportedVertex,0);
  assert.equal(result.vertices,2);
  assert.ok(comparePose([[0,1,0],[2,0,0]],[[0,1,0],[2,0,0]],mapping).maxDeviationM>2);
});
test('pose count and source index mismatch fail closed',()=>{
  assert.throws(()=>comparePose([[0,0,0]],[[0,0,0]],[0,0]),/count/);
  assert.throws(()=>comparePose([[0,0,0]],[[0,0,0]],[1]),/index/);
});
