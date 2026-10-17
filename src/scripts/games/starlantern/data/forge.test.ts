import { describe, expect, it } from 'vitest';
import { GEAR_SLOTS } from './gear';
import {
  BASE_RECIPES, CONSUMABLE_RECIPES, DISMANTLE, ENHANCE_COST, ENHANCE_MAX, ENHANCE_SUCCESS, ESSENCE_IDS, ESSENCE_OF,
  expectedEnhance, REGION_AFFIX_GROUP,
} from './forge';
import { ITEMS } from './items';
import { MATERIALS } from './materials';
import { REGIONS } from './regions';
import type { Rarity } from '../engine/types';

const RARITIES: Rarity[] = ['common', 'magic', 'rare', 'legendary', 'unique', 'set'];
const top = (t: number) => Math.max(...Object.keys(ENHANCE_COST[t - 1].mats).filter((m) => ESSENCE_IDS.includes(m)).map((m) => ESSENCE_IDS.indexOf(m)));
const essenceMix = (t: number) => Object.keys(ENHANCE_COST[t - 1].mats).filter((m) => ESSENCE_IDS.includes(m)).sort().join(',');
const tiers = Array.from({ length: ENHANCE_MAX }, (_, i) => i + 1);

describe('forge tables', () => {
  it('essences cover every rarity and dismantling yields only essences', () => {
    for (const r of RARITIES) {
      expect(ESSENCE_IDS).toContain(ESSENCE_OF[r]);
      expect(Object.keys(DISMANTLE[r]).length).toBeGreaterThan(0);
      for (const [m, q] of Object.entries(DISMANTLE[r])) {
        expect(ESSENCE_IDS).toContain(m);
        expect(MATERIALS[m].kind).toBe('essence');
        expect(q).toBeGreaterThan(0);
      }
    }
    for (const id of ESSENCE_IDS) expect(MATERIALS[id].kind).toBe('essence');
  });

  it('enhance tables have ENHANCE_MAX rows; success is 1 up to +5, below 1 from +6, never rising', () => {
    expect(ENHANCE_COST).toHaveLength(ENHANCE_MAX);
    expect(ENHANCE_SUCCESS).toHaveLength(ENHANCE_MAX);
    expect(ENHANCE_SUCCESS[4]).toBe(1);
    expect(ENHANCE_SUCCESS[5]).toBeLessThan(1);
    for (let i = 1; i < ENHANCE_MAX; i++) expect(ENHANCE_SUCCESS[i]).toBeLessThanOrEqual(ENHANCE_SUCCESS[i - 1]);
  });

  it('each enhance tier asks for a different essence mix and +8 and above need a rare material', () => {
    const tops = tiers.map(top);
    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeGreaterThanOrEqual(tops[i - 1]);
    expect(new Set(tops).size).toBe(ESSENCE_IDS.length);
    for (const t of tiers.slice(1)) if (top(t) !== top(t - 1)) expect(essenceMix(t)).not.toBe(essenceMix(t - 1));
    const usesRare = (t: number) => Object.keys(ENHANCE_COST[t - 1].mats).some((m) => MATERIALS[m].kind === 'rare');
    for (const t of tiers) expect(usesRare(t)).toBe(t >= 8);
  });

  it('region affix groups are disjoint affix keys, one per region material', () => {
    const mats = Object.values(REGIONS).map((r) => r.material).filter((m): m is string => m !== null);
    expect(Object.keys(REGION_AFFIX_GROUP).sort()).toEqual([...mats].sort());
    const all = Object.values(REGION_AFFIX_GROUP).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const g of Object.values(REGION_AFFIX_GROUP)) expect(g.length).toBeGreaterThan(0);
  });

  it('crafting a consumable is cheaper than buying it', () => {
    for (const [id, c] of Object.entries(CONSUMABLE_RECIPES)) {
      expect(ITEMS[id]).toBeDefined();
      const cost = c.gold + Object.entries(c.mats).reduce((s, [m, q]) => s + MATERIALS[m].price * q, 0);
      expect(cost).toBeLessThan(ITEMS[id].price);
    }
  });

  it('every gear slot has a base recipe of monster materials', () => {
    for (const slot of GEAR_SLOTS) {
      const r = BASE_RECIPES[slot];
      expect(Object.keys(r).length).toBeGreaterThan(0);
      for (const m of Object.keys(r)) expect(MATERIALS[m].kind).toBe('monster');
    }
  });

  it('expectedEnhance grows with depth and stops at ENHANCE_MAX', () => {
    expect(expectedEnhance(0)).toBe(0);
    expect(expectedEnhance(2)).toBeGreaterThan(expectedEnhance(1));
    expect(expectedEnhance(1000)).toBe(ENHANCE_MAX);
    for (let d = 1; d < 40; d++) expect(expectedEnhance(d)).toBeGreaterThanOrEqual(expectedEnhance(d - 1));
  });
});
