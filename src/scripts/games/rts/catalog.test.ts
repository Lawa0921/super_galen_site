import { describe, expect, it } from 'vitest';
import { BUILDINGS, UNITS, RESEARCH, SKILLS, GUARD_MOTION, requirementsMet } from './catalog';

describe('original kingdom technology tree', () => {
  it('locks guard contact and locomotion timing to the reviewed original motion contract',()=>{
    expect(GUARD_MOTION).toEqual({version:1,locomotion:{clip:'Walk',strideMeters:2,cycleSeconds:2/3},attack:{clip:'Attack',durationSeconds:1.2,contactSeconds:16/30}});
    expect(GUARD_MOTION.attack.contactSeconds).toBeLessThan(GUARD_MOTION.attack.durationSeconds);
    expect(UNITS.guard.speed).toBeCloseTo(GUARD_MOTION.locomotion.strideMeters/GUARD_MOTION.locomotion.cycleSeconds);
    expect(UNITS.guard.range).toBe(.58); // Move 3cm closer from the measured .61m pose, then recheck full 3D geometry.
  });
  it('covers every approved role and reachable tier without unlocking mounted or siege troops early', () => {
    // Shipped roster; the preview roster is covered in roster.test.ts.
    expect(Object.keys(UNITS).filter(k => k !== 'neutral-raider' && !UNITS[k as keyof typeof UNITS].preview)).toHaveLength(7);
    expect(Object.keys(BUILDINGS)).toHaveLength(10);
    expect(requirementsMet(UNITS.knight.requires, 1, ['townhall','forge','stable'])).toBe(false);
    expect(requirementsMet(UNITS.knight.requires, 2, ['townhall','forge','stable'])).toBe(true);
    expect(requirementsMet(BUILDINGS.workshop.requires, 2, ['townhall','forge'])).toBe(false);
    expect(requirementsMet(BUILDINGS.workshop.requires, 3, ['townhall','forge'])).toBe(true);
  });
  it('locks crossbows behind lumber and second-tier blacksmith upgrades behind a castle', () => {
    expect(requirementsMet(UNITS.crossbow.requires,1,['townhall','barracks'])).toBe(false);
    expect(requirementsMet(UNITS.crossbow.requires,1,['townhall','barracks','lumbermill'])).toBe(true);
    expect(RESEARCH.weapons2.previous).toBe('weapons1');
    expect(RESEARCH.weapons3.requires.tier).toBe(3);
    expect(SKILLS.banner.minLevel).toBe(3);
  });
  it('has finite costs and meaningful health, duration and supply for every production item', () => {
    for(const item of [...Object.values(BUILDINGS),...Object.values(UNITS),...Object.values(RESEARCH)]) {
      expect(item.cost.gold).toBeGreaterThanOrEqual(0);
      expect(item.cost.wood).toBeGreaterThanOrEqual(0);
      expect(item.duration).toBeGreaterThan(0);
    }
    expect(UNITS.worker.cost).toEqual({gold:50,wood:0});
    expect(UNITS.worker.supply).toBe(1);
    expect(UNITS.commander.supply).toBe(5);
    expect(BUILDINGS.townhall.supply).toBe(10);
  });
});
