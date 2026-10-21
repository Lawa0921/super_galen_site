import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AIM, BARRIER, BEAT, COINS, DEVICE, EMBER } from '../mech';
import { HEAT } from './heat';
import { MOON } from './moon';
import { ECHO } from './echo';
import { SKILLS } from '../../data/skills';

/**
 * Every mechanic's numbers as plan 8c left them (spec §8 starting proposals, the Task 2–6 tuning in retune.md), written
 * out: a change to any of them is a decision, made here on purpose, never a side effect of an edit elsewhere.
 */
describe('the mechanics numbers (plan 8c)', () => {
  it('stand as tuned', () => {
    expect(HEAT).toEqual({ max: 5, pctPer: 8, overloadPct: 200, backlashPct: 15, iceCool: 2 });
    expect(AIM).toEqual({ cap: 3, dmgPct: 10, critPct: 0, consumePct: 50 });
    expect(COINS).toEqual({ cap: 10, coinPowerPct: 15, gold: 2 });
    expect(BARRIER).toEqual({ releasePct: 10 });
    expect({ ...MOON, order: [...MOON.order] }).toEqual({ order: ['first', 'full', 'waning', 'new'], pct: 30 });
    expect(EMBER).toEqual({ sharePct: 50, capPct: 50 });
    expect(BEAT).toEqual({ max: 4, pctPer: 10 });
    expect(DEVICE).toEqual({ cap: 2, maxLevel: 3, levelPct: 25, coilShock: 0.3 });
    expect(ECHO).toEqual({ powerPct: 70 });
  });
});

describe('skill words take their percentages from the numbers (plan 8c final)', () => {
  const SOURCE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'skills.ts');

  it('data/skills.ts writes no percentage by hand', () => {
    const src = readFileSync(SOURCE, 'utf8');
    const descs = [...src.matchAll(/desc: (['`])((?:(?!\1).)*)\1/g)].map((m) => m[2]);
    expect(descs.length).toBeGreaterThan(100);
    expect(descs.filter((d) => /\d\s*%/.test(d))).toEqual([]);
  });

  it('every description is filled in, with the numbers it names', () => {
    for (const d of Object.values(SKILLS)) expect(d.desc, d.id).not.toMatch(/[{}]/);
    expect(SKILLS['fortune-strike'].desc).toContain('每枚威力多 15%');
    expect(SKILLS['starfall-arrow'].desc).toContain('威力多 50%');
    expect(SKILLS['exorcism-thrust'].desc).toContain('威力多 10%');
    expect(SKILLS['heaven-spear'].desc).toContain('威力多 10%');
    expect(SKILLS['tesla-coil'].desc).toContain('30% 讓牠們感電');
    expect(SKILLS['flame-burst'].desc).toContain('15% HP');
    expect(SKILLS['crimson-end'].desc).toContain('30% HP');
    expect(SKILLS['sunder-arrow'].desc).toContain('防禦降低 30%');
    expect(SKILLS['hunters-mark'].desc).toContain('防禦降低 40%');
    expect(SKILLS['mirage-step'].desc).toContain('速度提升 30%');
    expect(SKILLS.ward.desc).toContain('提升 30%');
  });
});
