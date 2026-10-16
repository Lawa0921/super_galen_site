import { describe, expect, it } from 'vitest';
import { FLOORS } from '../data/floors';
import { SLOTS, expToNext } from './party';
import { avgExp, depthPace, fightsToLevel, groupExp, kitParty, simBattle, winRate } from './sim';
import { REGIONS, type RegionId } from '../data/regions';
import type { BattleScale } from './battle';
import { ALTAR_STAT_CAP_PCT } from './events';
import { depthLevel, encounterTable } from './scaling';

const groups = (f: number) => FLOORS[f - 1].encounters;

describe('balance', () => {
  it('1. no floor-1 fight levels anyone up on its own', () => {
    for (const g of groups(1)) expect(groupExp(g), g.join('+')).toBeLessThan(expToNext(1));
  });

  it('2-3. levelling pace per floor', () => {
    expect(fightsToLevel(avgExp(1), 1, 5)).toBeGreaterThanOrEqual(10);
    expect(fightsToLevel(avgExp(1), 1, 5)).toBeLessThanOrEqual(18);
    for (const [f, a, b] of [[2, 5, 8], [3, 8, 11]] as const) {
      const n = fightsToLevel(avgExp(f), a, b);
      expect(n, `floor ${f}`).toBeGreaterThanOrEqual(10);
      expect(n, `floor ${f}`).toBeLessThanOrEqual(18);
    }
  });

  it('4. a party at the recommended level wins reliably without trivialising', () => {
    for (const [f, lv] of [[1, 2], [2, 6], [3, 9]] as const) {
      const r = winRate(lv, groups(f), false);
      expect(r.rate, `floor ${f}`).toBeGreaterThanOrEqual(0.85);
      expect(r.hpLoss, `floor ${f}`).toBeGreaterThanOrEqual(0.1);
      expect(r.hpLoss, `floor ${f}`).toBeLessThanOrEqual(0.45);
    }
  });

  it('5. under-levelled parties are at risk on floor 3', () => {
    expect(winRate(4, groups(3), false).rate).toBeLessThanOrEqual(0.6);
  });

  it('6. the boss is a real fight', () => {
    // 120 fights: at 40 the seed noise alone (about ±7%) can cross the band.
    const lo = winRate(11, [['lanterneater']], true, 120).rate;
    expect(lo).toBeGreaterThanOrEqual(0.3);
    expect(lo).toBeLessThanOrEqual(0.85);
    expect(winRate(13, [['lanterneater']], true).rate).toBeGreaterThanOrEqual(0.7);
  });

  it('7. same depth level, same odds', () => {
    const band = (r: { rate: number; hpLoss: number }, label: string) => {
      expect(r.rate, label).toBeGreaterThanOrEqual(0.85);
      expect(r.hpLoss, label).toBeGreaterThanOrEqual(0.1);
      expect(r.hpLoss, label).toBeLessThanOrEqual(0.45);
    };
    const pace = (gs: string[][], scale: BattleScale, lv: number, label: string) => {
      const n = fightsToLevel(gs.reduce((t, g) => t + groupExp(g, scale), 0) / gs.length, lv, lv + 4);
      expect(n, label).toBeGreaterThanOrEqual(10);
      expect(n, label).toBeLessThanOrEqual(18);
    };
    for (const d of [4, 6, 8, 10]) {
      const lv = depthLevel(d);
      for (const region of Object.keys(REGIONS) as RegionId[]) {
        const scale = { depth: d, region };
        const gs = encounterTable(region, d);
        const label = `${region} depth ${d}`;
        band(winRate(lv, gs, false, region === 'mainline' ? 40 : 20, scale), label);
        pace(gs, scale, lv, label);
      }
    }
    for (const d of [2, 3]) band(winRate(depthLevel(d), encounterTable('blaze', d), false, 20, { depth: d, region: 'blaze' }), `blaze depth ${d}`);
  }, 120_000);

  it('8. a party at the depth level beats an elite of that depth', () => {
    for (const d of [2, 4, 8]) for (const g of encounterTable('mainline', d)) {
      const r = winRate(depthLevel(d), [g], false, 40, { depth: d, region: 'mainline', elite: g[0] });
      expect(r.rate, `elite ${g.join('+')} at depth ${d}`).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('9. a party with the altar cap reached on every stat is not trivialised below the band', () => {
    const stacked = (['atk', 'def', 'mag', 'res', 'spd'] as const).map((stat) => ({ stat, pct: ALTAR_STAT_CAP_PCT }));
    for (const d of [4, 8]) {
      const scale = { depth: d, region: 'mainline' as const };
      const r = winRate(depthLevel(d), encounterTable('mainline', d), false, 40, scale, stacked);
      expect(r.rate, `depth ${d}`).toBeGreaterThanOrEqual(0.85);
      expect(r.hpLoss, `depth ${d}`).toBeGreaterThanOrEqual(0.1);
    }
  });

  it('10. random gear in expectation keeps the bands', () => {
    // The kit is really worn: every slot of every member, uids from 1.
    const kit = kitParty(depthLevel(4), 4, 1);
    const worn = Object.values(kit.roster).flatMap((m) => SLOTS.map((s) => m.equip[s]));
    expect(worn.every((it) => !!it)).toBe(true);
    expect(worn.map((it) => it!.uid)).toEqual(worn.map((_, i) => i + 1));
    for (const d of [4, 6, 8, 10]) for (const region of ['mainline', 'blaze'] as const) {
      const scale = { depth: d, region };
      const gs = encounterTable(region, d);
      let rate = 0, hpLoss = 0;
      for (let kitSeed = 1; kitSeed <= 5; kitSeed++) {
        const r = winRate(depthLevel(d), gs, false, 8, scale, undefined, kitSeed);
        rate += r.rate / 5;
        hpLoss += r.hpLoss / 5;
      }
      const label = `${region} depth ${d} with gear`;
      expect(rate, label).toBeGreaterThanOrEqual(0.85);
      expect(hpLoss, label).toBeGreaterThanOrEqual(0.1);
      expect(hpLoss, label).toBeLessThanOrEqual(0.45);
    }
  }, 120_000);

  it('11. a full rare kit does not one-round a boss', () => {
    for (const d of [5, 10]) for (let seed = 1; seed <= 20; seed++) {
      const r = simBattle(kitParty(depthLevel(d), d, seed, 'rare'), ['lanterneater'], true, seed, { depth: d, region: 'mainline' });
      expect(r.rounds, `depth ${d} seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("12. one clear of a depth lands near the next depth's level", () => {
    for (const d of [1, 2, 3, 4, 5, 6, 8, 10]) {
      const next = depthLevel(d + 1);
      const rooms = depthPace(d, 'rooms');
      expect(rooms, `depth ${d} rooms`).toBeGreaterThanOrEqual(next - 1);
      expect(rooms, `depth ${d} rooms`).toBeLessThanOrEqual(next + 1);
      const direct = depthPace(d, 'direct');
      expect(direct, `depth ${d} direct`).toBeGreaterThanOrEqual(next - 2);
      expect(direct, `depth ${d} direct`).toBeLessThanOrEqual(next + 1);
    }
  });
});
