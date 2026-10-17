import {describe,expect,it} from 'vitest';
import {UnitPresentation} from './unit-presentation';
import {SimulationClock} from './clock';

describe('fixed tick unit presentation',()=>{
  it('interpolates positions and derives stride speed from actual displacement, including crowd slowdown and a stop',()=>{
    const pose=new UnitPresentation();pose.sample({x:10,z:20,facing:0},0,1,3);
    let result=pose.sample({x:10.15,z:20,facing:0},.05,0,3);expect(result.x).toBe(10);expect(result.speed).toBeCloseTo(3);
    result=pose.sample({x:10.15,z:20,facing:0},.05,.5,3);expect(result.x).toBeCloseTo(10.075);expect(result.speed).toBeCloseTo(3);
    result=pose.sample({x:10.225,z:20,facing:0},.1,.5,3);expect(result.x).toBeCloseTo(10.1875);expect(result.speed).toBeCloseTo(1.5);
    result=pose.sample({x:10.225,z:20,facing:0},.15,.5,3);expect(result.speed).toBe(0);
  });
  it('does not rewind on pause/resume and takes the short rotation across the angle seam',()=>{
    const pose=new UnitPresentation();pose.sample({x:0,z:0,facing:Math.PI-.1},0,1,3);
    const half={...pose.sample({x:.15,z:0,facing:-Math.PI+.1},.05,.5,3)};
    expect(Math.abs(half.facing)).toBeCloseTo(Math.PI);expect(half.x).toBeCloseTo(.075);
    expect(pose.sample({x:.15,z:0,facing:-Math.PI+.1},.05,0,3).x).toBeCloseTo(half.x);
  });
  it('initializes at the visible position and snaps across missing snapshots rather than dragging from fog',()=>{
    const pose=new UnitPresentation();expect(pose.sample({x:85,z:73,facing:1},100,.2,3)).toMatchObject({x:85,z:73,speed:0});
    expect(pose.sample({x:90,z:73,facing:1},101,.2,3)).toMatchObject({x:90,z:73,speed:0});
  });
  it('exposes the render remainder without changing the twenty-hertz simulation',()=>{
    let ticks=0;const clock=new SimulationClock(()=>ticks++);clock.frame(0);clock.frame(25);expect(clock.interpolation).toBeCloseTo(.5);
    clock.frame(60);expect(ticks).toBe(1);expect(clock.interpolation).toBeCloseTo(.2);clock.setPaused(true);expect(clock.interpolation).toBe(0);
  });
});
