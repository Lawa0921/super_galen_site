import test from 'node:test';
import assert from 'node:assert/strict';
import {clipTimeForFrame} from './original_guard_arm_clip_time.mjs';

test('frame 25 reaches the authored pose in a 24 fps exported clip',()=>{
  assert.ok(Math.abs(clipTimeForFrame(25,0,40,40/24)-25/24)<1e-12);
});
test('actual duration supports nonzero start and the final held pose',()=>{
  assert.equal(clipTimeForFrame(10,10,50,2),0);
  assert.equal(clipTimeForFrame(30,10,50,2),1);
  assert.equal(clipTimeForFrame(50,10,50,2),2);
});
test('unknown frame ranges cannot silently select a different pose',()=>{
  for(const args of [[-1,0,40,2],[41,0,40,2],[0,0,0,2],[0,0,40,0],[NaN,0,40,2]])
    assert.throws(()=>clipTimeForFrame(...args),/frame|duration/);
});
