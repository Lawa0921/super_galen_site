import {describe,it,expect} from 'vitest';
import {ShadowCadence} from './shadow-cadence';

describe('world shadow update cadence',()=>{
  it('renders the first zero-delta frame, freezes pause and updates at the exact 30Hz boundary',()=>{
    const cadence=new ShadowCadence();expect(cadence.update(0)).toBe(true);expect(cadence.update(0)).toBe(false);
    expect(cadence.update(1/60)).toBe(false);expect(cadence.update(1/60)).toBe(true);expect(cadence.update(0)).toBe(false);
  });
  it('retains fractional time at 45FPS instead of dropping to 22.5 shadow updates per second',()=>{
    const cadence=new ShadowCadence();cadence.update(0);let updates=0;
    for(let i=0;i<45;i++)if(cadence.update(1/45))updates++;
    expect(updates).toBe(30);
  });
  it('refreshes structural changes during pause, resumes once after a stall and ignores invalid deltas',()=>{
    const cadence=new ShadowCadence();cadence.update(0);
    expect(cadence.update(0,true)).toBe(true);expect(cadence.update(0)).toBe(false);
    for(const dt of [NaN,Infinity,-1])expect(cadence.update(dt)).toBe(false);
    expect(cadence.update(1)).toBe(true);expect(cadence.update(0)).toBe(false);
  });
  it('keeps close views at full frame rate while a paused close view stays still',()=>{
    const cadence=new ShadowCadence();cadence.update(0);
    for(let i=0;i<8;i++)expect(cadence.update(1/120,false,true)).toBe(true);
    expect(cadence.update(0,false,true)).toBe(false);expect(cadence.update(0,true,true)).toBe(true);
  });
});
