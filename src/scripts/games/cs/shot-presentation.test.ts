import { describe, expect, it } from 'vitest';
import { SHOT_PRESENTATION, shotEnvelope } from './shot-presentation';
describe('weapon-specific firing envelope', () => {
  it('makes rifle and sniper impulses distinct while recovering between isolated shots', () => {
    expect(SHOT_PRESENTATION.rifle.flashSize).toBeGreaterThan(SHOT_PRESENTATION.smg.flashSize);
    expect(SHOT_PRESENTATION.sniper.flashSize).toBeGreaterThan(SHOT_PRESENTATION.rifle.flashSize);
    for(const weapon of ['pistol','smg','rifle','sniper'] as const) {
      const first=shotEnvelope(weapon,0,false,false), middle=shotEnvelope(weapon,.025,false,false), rested=shotEnvelope(weapon,1,false,false);
      expect(first.kick).toBeGreaterThan(middle.kick);
      expect(first.light).toBeGreaterThan(middle.light);
      expect(rested).toEqual({kick:0,light:0});
      expect(first.kick).toBeLessThanOrEqual(.13);
      expect(shotEnvelope(weapon,-1,false,false)).toEqual({kick:0,light:0});
    }
  });
  it('keeps ADS modest, reduced motion steady, and does not create light for stale or invalid shots', () => {
    const hip=shotEnvelope('rifle',0,false,false), ads=shotEnvelope('rifle',0,true,false);
    expect(ads.kick).toBeLessThan(hip.kick);
    expect(shotEnvelope('rifle',0,false,true).kick).toBe(0);
    expect(shotEnvelope('rifle',NaN,false,false)).toEqual({kick:0,light:0});
    expect(shotEnvelope('rifle',.2,false,false).light).toBe(0);
  });
});
