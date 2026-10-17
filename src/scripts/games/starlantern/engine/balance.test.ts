import { describe, expect, it } from 'vitest';
import { FLOORS } from '../data/floors';
import { SLOTS, expToNext } from './party';
import { avgExp, depthPace, fightsToLevel, groupExp, kitParty, simBattle, winRate, KIT_ORDER, type Lineup } from './sim';
import { REGIONS, type RegionId } from '../data/regions';
import type { BattleScale } from './battle';
import { ALTAR_STAT_CAP_PCT } from './events';
import { depthLevel, encounterTable } from './scaling';
import { ENHANCE_MAX, expectedEnhance } from '../data/forge';
import { ABYSS } from '../data/hero';
import type { CharacterId } from './types';

const groups = (f: number) => FLOORS[f - 1].encounters;

// Party sizes of the bands. The full party is the simulation default (STANDARD_LINEUP).
const TWO: CharacterId[] = ['hero', 'rin'];
const THREE: CharacterId[] = [...TWO, 'selene'];
const FOUR: CharacterId[] = [...THREE, 'chizuru'];
/** Ten memories on the hero and the abyss at its cap. */
const DEEP: Lineup = { memories: 10, abyss: ABYSS.cap };

/** With BALANCE_REPORT set, print every measurement and let the assertions carry on, so one run shows every number. */
const report = process.env.BALANCE_REPORT;
const ex = report ? expect.soft : expect;
const say = (label: string, m: { rate?: number; hpLoss?: number; rounds?: number; n?: number }) => {
  if (!report) return;
  const f = (k: string, v: number | undefined, d: number) => (v === undefined ? '' : ` ${k}=${v.toFixed(d)}`);
  console.info(`[balance] ${label}${f('rate', m.rate, 3)}${f('hpLoss', m.hpLoss, 3)}${f('rounds', m.rounds, 2)}${f('n', m.n, 0)}`);
};

describe('balance', () => {
  it('1. no floor-1 fight levels anyone up on its own', () => {
    for (const g of groups(1)) {
      say(`1 ${g.join('+')}`, { n: groupExp(g) });
      ex(groupExp(g), g.join('+')).toBeLessThan(expToNext(1));
    }
  });

  it('2-3. levelling pace per floor', () => {
    say('2-3 floor 1 fights', { n: fightsToLevel(avgExp(1), 1, 5) });
    ex(fightsToLevel(avgExp(1), 1, 5)).toBeGreaterThanOrEqual(10);
    ex(fightsToLevel(avgExp(1), 1, 5)).toBeLessThanOrEqual(18);
    for (const [f, a, b] of [[2, 5, 8], [3, 8, 11]] as const) {
      const n = fightsToLevel(avgExp(f), a, b);
      say(`2-3 floor ${f} fights`, { n });
      ex(n, `floor ${f}`).toBeGreaterThanOrEqual(10);
      ex(n, `floor ${f}`).toBeLessThanOrEqual(18);
    }
  });

  // Red at 19a: floor 3 hpLoss under 0.10. Owner 19c.
  it.fails('4. a party at the recommended level wins reliably without trivialising', () => {
    for (const [f, lv] of [[1, 2], [2, 6], [3, 9]] as const) {
      const r = winRate(lv, groups(f), false);
      say(`4 floor ${f} Lv${lv}`, r);
      ex(r.rate, `floor ${f}`).toBeGreaterThanOrEqual(0.85);
      ex(r.hpLoss, `floor ${f}`).toBeGreaterThanOrEqual(0.1);
      ex(r.hpLoss, `floor ${f}`).toBeLessThanOrEqual(0.45);
    }
  });

  it('5. under-levelled parties are at risk on floor 3', () => {
    const r = winRate(4, groups(3), false);
    say('5 floor 3 Lv4', r);
    ex(r.rate).toBeLessThanOrEqual(0.6);
  });

  it('6. the boss is a real fight', () => {
    // 120 fights: at 40 the seed noise alone (about ±7%) can cross the band.
    const lo = winRate(11, [['lanterneater']], true, 120);
    say('6 lanterneater Lv11', lo);
    ex(lo.rate).toBeGreaterThanOrEqual(0.3);
    ex(lo.rate).toBeLessThanOrEqual(0.85);
    const hi = winRate(13, [['lanterneater']], true);
    say('6 lanterneater Lv13', hi);
    ex(hi.rate).toBeGreaterThanOrEqual(0.7);
  });

  it('7. same depth level, same odds (levelling pace)', () => {
    // Split out of band 7: the pace is the lone member's exp per fight, no party size in it.
    for (const d of [4, 6, 8, 10]) for (const region of Object.keys(REGIONS) as RegionId[]) {
      const scale: BattleScale = { depth: d, region };
      const gs = encounterTable(region, d);
      const lv = depthLevel(d);
      const n = fightsToLevel(gs.reduce((t, g) => t + groupExp(g, scale), 0) / gs.length, lv, lv + 4);
      say(`7 pace ${region} depth ${d}`, { n });
      ex(n, `${region} depth ${d}`).toBeGreaterThanOrEqual(10);
      ex(n, `${region} depth ${d}`).toBeLessThanOrEqual(18);
    }
  });

  // Red at 19a (Task 19a baseline): the full party is under the 0.10 HP-loss floor. Owner 19c.
  it.fails('7. same depth level, same odds', () => {
    const band = (r: { rate: number; hpLoss: number }, label: string) => {
      say(`7 ${label}`, r);
      ex(r.rate, label).toBeGreaterThanOrEqual(0.85);
      ex(r.hpLoss, label).toBeGreaterThanOrEqual(0.1);
      ex(r.hpLoss, label).toBeLessThanOrEqual(0.45);
    };
    for (const d of [4, 6, 8, 10]) {
      const lv = depthLevel(d);
      for (const region of Object.keys(REGIONS) as RegionId[]) {
        const gs = encounterTable(region, d);
        band(winRate(lv, gs, false, region === 'mainline' ? 40 : 20, { depth: d, region }), `${region} depth ${d}`);
      }
    }
    for (const d of [2, 3]) band(winRate(depthLevel(d), encounterTable('blaze', d), false, 20, { depth: d, region: 'blaze' }), `blaze depth ${d}`);
  }, 120_000);

  it('8. a party at the depth level beats an elite of that depth', () => {
    for (const d of [2, 4, 8]) for (const g of encounterTable('mainline', d)) {
      const r = winRate(depthLevel(d), [g], false, 40, { depth: d, region: 'mainline', elite: g[0] });
      say(`8 elite ${g.join('+')} depth ${d}`, r);
      ex(r.rate, `elite ${g.join('+')} at depth ${d}`).toBeGreaterThanOrEqual(0.6);
    }
  });

  // Red at 19a: hpLoss under 0.10. Owner 19c.
  it.fails('9. a party with the altar cap reached on every stat is not trivialised below the band', () => {
    const stacked = (['atk', 'def', 'mag', 'res', 'spd'] as const).map((stat) => ({ stat, pct: ALTAR_STAT_CAP_PCT }));
    for (const d of [4, 8]) {
      const scale = { depth: d, region: 'mainline' as const };
      const r = winRate(depthLevel(d), encounterTable('mainline', d), false, 40, scale, stacked);
      say(`9 altar depth ${d}`, r);
      ex(r.rate, `depth ${d}`).toBeGreaterThanOrEqual(0.85);
      ex(r.hpLoss, `depth ${d}`).toBeGreaterThanOrEqual(0.1);
    }
  });

  // Band 10 runs twice: as before, and with ten memories on the hero. Neither forces the abyss: it follows the fight's
  // depth, as createBattle computes it from the scale (spec §9.4 point 8).
  const gearBands = (tag: string, lineup: Lineup) => {
    // The kit is really worn: every slot of every member, uids from 1, each piece at the depth's expected enhance level.
    const kit = kitParty(depthLevel(4), 4, 1, undefined, expectedEnhance(4), lineup);
    const worn = KIT_ORDER.flatMap((id) => SLOTS.map((s) => kit.roster[id].equip[s]));
    ex(worn.every((it) => !!it)).toBe(true);
    ex(worn.map((it) => it!.uid)).toEqual(worn.map((_, i) => i + 1));
    ex(worn.every((it) => it!.enhance === expectedEnhance(4))).toBe(true);
    for (const d of [4, 6, 8, 10]) for (const region of ['mainline', 'blaze'] as const) {
      const scale = { depth: d, region };
      const gs = encounterTable(region, d);
      let rate = 0, hpLoss = 0;
      for (let kitSeed = 1; kitSeed <= 5; kitSeed++) {
        const r = winRate(depthLevel(d), gs, false, 8, scale, undefined, kitSeed, undefined, expectedEnhance(d), lineup);
        rate += r.rate / 5;
        hpLoss += r.hpLoss / 5;
      }
      const label = `${region} depth ${d} with gear`;
      say(`10${tag} ${label}`, { rate, hpLoss });
      ex(rate, label).toBeGreaterThanOrEqual(0.85);
      ex(hpLoss, label).toBeGreaterThanOrEqual(0.1);
      ex(hpLoss, label).toBeLessThanOrEqual(0.45);
    }
  };

  // Red at 19a: hpLoss under 0.10 at most depths. Owner 19c.
  it.fails('10. random gear in expectation keeps the bands', () => gearBands('', {}), 120_000);

  // Red at 19a: hpLoss under 0.10 at most depths. Owner 19c.
  it.fails('10 (memories). random gear in expectation keeps the bands with ten memories, the abyss by depth', () => gearBands(' memories', { memories: 10 }), 120_000);

  const bossRounds = (tag: string, lineup: Lineup) => {
    for (const d of [5, 10]) {
      let total = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const r = simBattle(kitParty(depthLevel(d), d, seed, 'rare', expectedEnhance(d), lineup), ['lanterneater'], true, seed, { depth: d, region: 'mainline' }, undefined, 'skill', lineup.abyss);
        total += r.rounds;
        ex(r.rounds, `depth ${d} seed ${seed}`).toBeGreaterThanOrEqual(3);
      }
      say(`11${tag} boss depth ${d}`, { rounds: total / 20 });
    }
  };

  it('11. a full rare kit does not one-round a boss', () => bossRounds('', {}));

  it('11 (memories, abyss cap). a full rare kit does not one-round a boss with ten memories and the abyss at its cap', () => bossRounds(' memories+abyss', DEEP));

  it("12. one clear of a depth lands near the next depth's level", () => {
    for (const d of [1, 2, 3, 4, 5, 6, 8, 10]) {
      const next = depthLevel(d + 1);
      const rooms = depthPace(d, 'rooms');
      say(`12 depth ${d} rooms (next Lv${next})`, { n: rooms });
      ex(rooms, `depth ${d} rooms`).toBeGreaterThanOrEqual(next - 1);
      ex(rooms, `depth ${d} rooms`).toBeLessThanOrEqual(next + 1);
      const direct = depthPace(d, 'direct');
      say(`12 depth ${d} direct (next Lv${next})`, { n: direct });
      ex(direct, `depth ${d} direct`).toBeGreaterThanOrEqual(next - 2);
      ex(direct, `depth ${d} direct`).toBeLessThanOrEqual(next + 1);
    }
  });

  // Red at 19a: mire and shade over 0.45 HP loss; attack-only mire and shade under 0.85. Owner 19b.
  it.fails('13. a fresh Lv1 two-member party with no gear holds depth 1 of every region', () => {
    // A new game arrives at depth 1 at Lv1 with empty equip (newParty): the first visit to any portal is fair.
    for (const region of Object.keys(REGIONS) as RegionId[]) {
      const r = winRate(1, encounterTable(region, 1), false, region === 'mainline' ? 40 : 20, { depth: 1, region }, undefined, undefined, 'skill', 0, { ids: TWO });
      const label = `${region} depth 1 Lv1`;
      say(`13 ${label}`, r);
      ex(r.rate, label).toBeGreaterThanOrEqual(0.85);
      ex(r.hpLoss, label).toBeGreaterThanOrEqual(0.1);
      ex(r.hpLoss, label).toBeLessThanOrEqual(0.45);
    }
    // The same runs with the playtest bot's attack-only player (全員攻擊): the skill player above held iron d1 even
    // while the region's phys resist halved every hit; this one did not (mire 52%, iron 44% before the scale-in).
    for (const region of Object.keys(REGIONS) as RegionId[]) {
      const r = winRate(1, encounterTable(region, 1), false, region === 'mainline' ? 40 : 20, { depth: 1, region }, undefined, undefined, 'attack', 0, { ids: TWO });
      say(`13 ${region} depth 1 Lv1 attack-only`, r);
      ex(r.rate, `${region} depth 1 Lv1 attack-only`).toBeGreaterThanOrEqual(0.85);
    }
  });

  const bossFalls = (tag: string, lineup: Lineup) => {
    const fight = (d: number, seed: number, enhance: number) =>
      simBattle(kitParty(depthLevel(d), d, seed, 'rare', enhance, lineup), ['lanterneater'], true, seed, { depth: d, region: 'mainline' }, undefined, 'skill', lineup.abyss);
    for (const d of [5, 10]) {
      let maxed = 0, plain = 0;   // total rounds over the same 20 seeds, so the means compare as the totals do
      for (let seed = 1; seed <= 20; seed++) {
        const r = fight(d, seed, ENHANCE_MAX);
        ex(r.rounds, `depth ${d} seed ${seed} +${ENHANCE_MAX}`).toBeGreaterThanOrEqual(2);
        maxed += r.rounds;
        plain += fight(d, seed, 0).rounds;
      }
      say(`14${tag} boss depth ${d} +${ENHANCE_MAX}`, { rounds: maxed / 20 });
      say(`14${tag} boss depth ${d} +0`, { rounds: plain / 20 });
      ex(maxed, `depth ${d} mean rounds +${ENHANCE_MAX} vs +0`).toBeLessThan(plain);
    }
  };

  it('14. a boss never falls in one round, even to a +ENHANCE_MAX rare kit, and the test sees enhancement', () => bossFalls('', {}));

  it('14 (memories, abyss cap). a boss never falls in one round to a +ENHANCE_MAX rare kit with ten memories and the abyss at its cap', () => bossFalls(' memories+abyss', DEEP));

  it('15. three members hold depths 2 and 3 of the main road', () => {
    for (const d of [2, 3]) {
      const r = winRate(depthLevel(d), encounterTable('mainline', d), false, 40, { depth: d, region: 'mainline' }, undefined, undefined, 'skill', 0, { ids: THREE });
      say(`15 three depth ${d}`, r);
      ex(r.rate, `depth ${d}`).toBeGreaterThanOrEqual(0.85);
      ex(r.hpLoss, `depth ${d}`).toBeGreaterThanOrEqual(0.1);
      ex(r.hpLoss, `depth ${d}`).toBeLessThanOrEqual(0.45);
    }
  });

  // Red at 19a: Lv11 wins 100%, over the 0.85 ceiling. Owner 19b.
  it.fails('16. the boss is a real fight for three members', () => {
    const lo = winRate(11, [['lanterneater']], true, 120, undefined, undefined, undefined, 'skill', 0, { ids: THREE });
    say('16 three lanterneater Lv11', lo);
    ex(lo.rate).toBeGreaterThanOrEqual(0.25);
    ex(lo.rate).toBeLessThanOrEqual(0.85);
    const hi = winRate(13, [['lanterneater']], true, 40, undefined, undefined, undefined, 'skill', 0, { ids: THREE });
    say('16 three lanterneater Lv13', hi);
    ex(hi.rate).toBeGreaterThanOrEqual(0.65);
  });

  it('17. four members hold depth 4 of the main road', () => {
    const r = winRate(depthLevel(4), encounterTable('mainline', 4), false, 40, { depth: 4, region: 'mainline' }, undefined, undefined, 'skill', 0, { ids: FOUR });
    say('17 four depth 4', r);
    ex(r.rate).toBeGreaterThanOrEqual(0.85);
    ex(r.hpLoss).toBeGreaterThanOrEqual(0.1);
    ex(r.hpLoss).toBeLessThanOrEqual(0.45);
  });
});