import {describe,it,expect} from 'vitest';
import {SimulationClock} from './clock';
describe('fixed simulation clock',()=>{
  it('advances at 20 Hz independently of render frequency',()=>{let ticks=0;const c=new SimulationClock(()=>ticks++);c.frame(0);for(let i=1;i<=120;i++)c.frame(i*1000/120);expect(ticks).toBe(20);});
  it('drops suspended time, preserves manual pause and never ticks after disposal',()=>{let ticks=0;const c=new SimulationClock(()=>ticks++);c.frame(0);c.frame(100);expect(ticks).toBe(2);c.setPaused(true);c.frame(120000);c.setPaused(false);c.frame(120100);expect(ticks).toBe(2);c.frame(120150);expect(ticks).toBe(3);c.dispose();c.frame(120200);expect(ticks).toBe(3);});
  it('does not turn a background-tab gap into thousands of late orders',()=>{let ticks=0;const c=new SimulationClock(()=>ticks++);c.frame(0);c.frame(3600000);expect(ticks).toBeLessThanOrEqual(5);});
});
