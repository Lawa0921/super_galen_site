import {describe,expect,it} from 'vitest';
import {Vector3 as V} from 'three';
import {TwoSphereReach} from './two-sphere-reach';
describe('nearest shared reach of two hands',()=>{
 it('leaves an interior origin unchanged and projects a single active reach',()=>{
  const solver=new TwoSphereReach(),out=new V();
  expect(solver.project(new V(.3,.2,0),new V(),1,new V(.5,0,0),1,out)).toBe(true);expect(out.toArray()).toEqual([.3,.2,0]);
  expect(solver.project(new V(2,0,0),new V(),1,new V(.5,0,0),1,out)).toBe(true);expect(out.distanceTo(new V(1,0,0))).toBeLessThan(1e-12);
 });
 it('projects onto the shared circle when both reach bounds are active',()=>{
  const solver=new TwoSphereReach(),out=new V();expect(solver.project(new V(.5,4,0),new V(),1,new V(1,0,0),1,out)).toBe(true);
  expect(out.distanceTo(new V(.5,Math.sqrt(.75),0))).toBeLessThan(1e-12);
 });
 it('handles nested, coincident and tangent spheres without NaN',()=>{
  const solver=new TwoSphereReach(),out=new V();
  expect(solver.project(new V(3,0,0),new V(),2,new V(),1,out)).toBe(true);expect(out.toArray()).toEqual([1,0,0]);
  expect(solver.project(new V(1,4,0),new V(),1,new V(2,0,0),1,out)).toBe(true);expect(out.distanceTo(new V(1,0,0))).toBeLessThan(1e-12);
 });
 it('refuses disjoint or invalid reach without overwriting the output',()=>{
  const solver=new TwoSphereReach(),out=new V(7,8,9);
  expect(solver.project(new V(),new V(),1,new V(3,0,0),1,out)).toBe(false);expect(out.toArray()).toEqual([7,8,9]);
  expect(()=>solver.project(new V(),new V(),NaN,new V(),1,out)).toThrow();expect(out.toArray()).toEqual([7,8,9]);
 });
});
