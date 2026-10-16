import { describe, it, expect } from 'vitest';
import { CHARACTERS } from '../data/characters';
import { armorReduction, capSheet, CAPS, compensation, convertPrimary, emptySheet, enemySecondary, evadeChance, naturalPrimary, SECONDARY_KEYS, STAT_CATEGORIES } from './stats';
import { depthLevel } from './levels';
import { depthLevel as viaScaling } from './scaling';
import type { AnyStat, SecondaryKey } from './types';

describe('stats model', () => {
  it('depthLevel lives in levels.ts and scaling re-exports it', () => {
    expect(depthLevel(1)).toBe(2);
    expect(depthLevel(10)).toBe(38);
    expect(viaScaling).toBe(depthLevel);
  });

  it('natural primaries mirror the old stats and do not convert', () => {
    expect(naturalPrimary(CHARACTERS.scarlet, 1)).toEqual({ str: 13, int: 6, agi: 7, wil: 7 });
    expect(naturalPrimary(CHARACTERS.scarlet, 3)).toEqual({ str: 17, int: 8, agi: 9, wil: 9 });
  });

  it('primaries from gear convert, the affinity at 1.5x', () => {
    expect(convertPrimary({ str: 10 }, 'str')).toEqual({ atk: 15, armor: 30 });
    expect(convertPrimary({ str: 10 }, 'int')).toEqual({ atk: 10, armor: 20 });
    expect(convertPrimary({ int: 2 }, 'int')).toEqual({ mag: 3, fireRes: 1.5, iceRes: 1.5, thunderRes: 1.5 });
    expect(convertPrimary({ agi: 10 }, 'agi')).toEqual({ crit: 3, spd: 7.5 });
    expect(convertPrimary({ wil: 4 }, 'wil')).toEqual({ tp: 6, heal: 6 });
    expect(convertPrimary({}, 'str')).toEqual({});
  });

  it('armor and evasion have diminishing returns and caps', () => {
    expect(armorReduction(100, 2)).toBe(0.5);
    expect(armorReduction(1e9, 2)).toBe(0.75);
    expect(evadeChance(1e9, 2)).toBe(0.5);
    const v = [0, 100, 200, 400].map((a) => armorReduction(a, 2));
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1]);
    expect(v[2] - v[1]).toBeLessThan(v[1] - v[0]);
    expect(v[3] - v[2]).toBeLessThan(v[2] - v[1]);
    const e = [0, 100, 200, 400].map((a) => evadeChance(a, 20));
    for (let i = 1; i < e.length; i++) expect(e[i]).toBeGreaterThan(e[i - 1]);
    expect(armorReduction(-5, 2)).toBe(0);
  });

  it('enemy secondaries are zero at home and grow with depth level', () => {
    const home = enemySecondary(2, 2, null);
    for (const k of Object.keys(home) as SecondaryKey[]) expect(home[k] ?? 0).toBe(0);
    expect(enemySecondary(38, 2, null).crit).toBe(9);
    expect(enemySecondary(500, 2, 'evasive').crit).toBe(20);
    expect(enemySecondary(500, 2, 'evasive').evasion).toBe(17);
    expect(enemySecondary(500, 2, null).fireRes).toBe(30);
    expect(enemySecondary(1, 2, null).crit ?? 0).toBe(0);
  });

  it('compensation keeps finite multipliers at the caps', () => {
    expect(compensation({})).toEqual({});
    const c = compensation({ crit: 20, evasion: 17, fireRes: 30, iceRes: 30, thunderRes: 30 });
    expect(c.atk).toBeCloseTo(1 / 1.1, 10);
    expect(c.mag).toBeCloseTo(1 / 1.1, 10);
    expect(c.hp).toBeCloseTo((1 - 0.17) * (1 - 0.09), 10);
    const big = compensation({ crit: 1e6, evasion: 1e6, fireRes: 1e6 });
    for (const v of Object.values(big)) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThan(0); }
  });

  it('capSheet holds every cap and stays finite at 1e6', () => {
    const s = emptySheet();
    for (const k of Object.keys(s) as AnyStat[]) s[k] = 1e6;
    const out = capSheet(s);
    for (const [k, cap] of Object.entries(CAPS) as [SecondaryKey, number][]) expect(out[k]).toBe(cap);
    for (const v of Object.values(out)) expect(Number.isFinite(v)).toBe(true);
    expect(out.atk).toBe(1e6);
  });

  it('keys are complete and categorised once', () => {
    expect(SECONDARY_KEYS).toHaveLength(25);
    expect(Object.keys(emptySheet())).toHaveLength(36);
    const all = STAT_CATEGORIES.flatMap((c) => c.keys);
    expect(all).toHaveLength(36);
    expect(new Set(all).size).toBe(36);
  });
});
