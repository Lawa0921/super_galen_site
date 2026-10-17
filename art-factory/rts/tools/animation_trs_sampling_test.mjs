import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {adaptiveTrsKeys} from './animation_trs_sampling.mjs';
const row=(x=0,angle=0)=>[x,0,0,...new Quaternion().setFromAxisAngle(new Vector3(0,0,1),angle).toArray(),1,1,1];
test('Linear motion and true spherical rotation retain only endpoints',()=>{
 assert.deepEqual(adaptiveTrsKeys([0,.25,.5,.75,1],[0,.25,.5,.75,1].flatMap(t=>row(t,t))),[0,4]);
});
test('Intermediate translation excursion cannot disappear between equal endpoints',()=>{
 assert.deepEqual(adaptiveTrsKeys([0,.5,1],[...row(),...row(.1),...row()]),[0,1,2]);
});
test('Intermediate rotation excursion is retained',()=>{
 assert.deepEqual(adaptiveTrsKeys([0,.5,1],[...row(),...row(0,.1),...row()]),[0,1,2]);
});
test('Rejects unordered times and nonfinite samples',()=>{
 assert.throws(()=>adaptiveTrsKeys([0,0],[...row(),...row()]),/times/);
 const values=[...row(),...row()];values[3]=NaN;assert.throws(()=>adaptiveTrsKeys([0,1],values),/finite/i);
});
