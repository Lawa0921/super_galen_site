/**
 * Band 21, 「心契不碾壓」 (bond plan Task 4; spec §5.3, §0 D15, D16): every companion at a maxed bond (心契, `Lineup.bond`
 * 'max') crushes nothing. The same cells and the same thresholds as the bands they copy, rewritten here (no helper of a
 * frozen file is imported): 21a band 4, 21b band 10 with the memory expectation (its one per-cell floor included), 21c
 * bands 11 and 14 with ten memories and the abyss at its cap, 21d band 18d; 21e (with BANDS=1 too) Nightmare N4, Hell H3
 * and shallow Hell's "no runes, no boss" under a maxed bond. A red here may only lower BOND_PCT. 21p is the pace reference
 * of spec §12.2.1 (arithmetic, no fights). Opt-in, so the full suite keeps its speed:
 *
 *   BOND_BANDS=1 BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.bond.test.ts --testTimeout=300000
 *   BOND_BANDS=1 BANDS=1 BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.bond.test.ts --testTimeout=3000000
 *
 * Report lines start with `[bond]` (the sim gate's grep does not take them).
 */
import { describe, expect, it } from 'vitest';
import { FLOORS } from '../data/floors';
import { ENHANCE_MAX, expectedEnhance } from '../data/forge';
import { ABYSS, type HeroBuild } from '../data/hero';
import type { RegionId } from '../data/regions';
import { BOND_CAP, BOND_RUN_CAP, BOND_TIER_AT, COMPANIONS, FIELD_POINTS, GIFT_TASTE, type Companion } from '../data/story/bond';
import { SLOTS, STANDARD_LINEUP, newMember, statsOf } from './party';
import { KIT_ORDER, ODD_LINEUPS, kitParty, partyAt, simBattle, winRate, type Lineup } from './sim';
import { depthLevel, encounterTable } from './scaling';
import { memoryPace } from './story/expect';
import { bondPoints, bondTier, giftPoints } from './story/bond';
import { withBondScale } from './testing';
import {
  bandMisses, hellReportCells, measureBand, measureCells, pooledLines, shallowHellMisses, withLineup, type BandId, type BandRun,
} from './tierBands';
import type { CharacterId, Member, Row } from './types';

const on = process.env.BOND_BANDS === '1';
const bands = process.env.BANDS === '1';
const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const ex = report ? expect.soft : expect;
const say = (line: string) => { if (report) console.info(`[bond] ${line}`); };
const f3 = (x: number) => x.toFixed(3);
const sayRun = (label: string, r: { rate?: number; hpLoss?: number; rounds?: number }) =>
  say(`${label}${r.rate === undefined ? '' : ` rate=${f3(r.rate)}`}${r.hpLoss === undefined ? '' : ` hpLoss=${f3(r.hpLoss)}`}${r.rounds === undefined ? '' : ` rounds=${r.rounds.toFixed(2)}`}`);

/** Every companion at 心契. */
const MAX: Lineup = { bond: 'max' };
const groups = (f: number) => FLOORS[f - 1].encounters;
/** As balance.test.ts: the hero build whose abyss capstone the sim casts, ten memories and the abyss at its cap. */
const MEMORIES_BUILD: HeroBuild = 'balanced';
const DEEP: Lineup = { memories: 10, abyss: ABYSS.cap, heroBuild: MEMORIES_BUILD };
/** As balance.test.ts band 10 (記憶期望): its one per-cell floor, no new one. */
const MEMORY_GEAR_FLOOR: Partial<Record<string, number>> = { 'mainline 8': 0.094 };

describe.skipIf(!on)('band 21: a maxed bond crushes nothing (bond plan Task 4)', () => {
  it('21 measures something: a maxed bond changes her numbers and a fight', () => {
    const lv = depthLevel(10);
    const plain = partyAt(lv, {}, 10), maxed = partyAt(lv, MAX, 10);
    const moved = STANDARD_LINEUP.filter((id) => id !== 'hero' && statsOf(maxed.roster[id]).hp !== statsOf(plain.roster[id]).hp);
    expect(moved.length).toBeGreaterThan(0);
    expect(statsOf(maxed.roster.hero)).toEqual(statsOf(plain.roster.hero));
    const fight = (l: Lineup) => {
      const out: { outcome: string; rounds: number; hpLoss: number }[] = [];
      for (let seed = 1; seed <= 5; seed++) out.push(simBattle(kitParty(lv, 10, seed, 'rare', expectedEnhance(10), l), ['lanterneater'], true, seed, { depth: 10, region: 'mainline' }));
      return out;
    };
    expect(fight(MAX)).not.toEqual(fight({}));
    // Off (scale 0), the maxed party is the plain one.
    expect(withBondScale(0, () => fight(MAX))).toEqual(fight({}));
  }, 300_000);

  it('21a (band 4). a maxed bond at the recommended level still loses 10-45% HP and wins >= .85', () => {
    for (const [f, lv] of [[1, 2], [2, 6], [3, 9]] as const) {
      const r = winRate(lv, groups(f), false, 40, undefined, undefined, undefined, 'skill', 0, MAX);
      sayRun(`21a floor ${f} Lv${lv}`, r);
      ex(r.rate, `floor ${f}`).toBeGreaterThanOrEqual(0.85);
      ex(r.hpLoss, `floor ${f}`).toBeGreaterThanOrEqual(0.1);
      ex(r.hpLoss, `floor ${f}`).toBeLessThanOrEqual(0.45);
    }
  }, 300_000);

  it('21b (band 10, 記憶期望). random gear and the memory expectation with a maxed bond keep the band', () => {
    const lineup: Lineup = { expect: true, heroBuild: MEMORIES_BUILD, ...MAX };
    const kit = kitParty(depthLevel(4), 4, 1, undefined, expectedEnhance(4), lineup);
    expect(KIT_ORDER.flatMap((id) => SLOTS.map((s) => kit.roster[id].equip[s])).every((it) => !!it)).toBe(true);
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
      sayRun(`21b ${label}`, { rate, hpLoss });
      ex(rate, label).toBeGreaterThanOrEqual(0.85);
      ex(hpLoss, label).toBeGreaterThanOrEqual(MEMORY_GEAR_FLOOR[`${region} ${d}`] ?? 0.1);
      ex(hpLoss, label).toBeLessThanOrEqual(0.45);
    }
  }, 300_000);

  it('21c (bands 11 and 14, memories and the abyss at its cap). a maxed bond never one-rounds a boss', () => {
    const lineup: Lineup = { ...DEEP, ...MAX };
    const fight = (d: number, seed: number, enhance: number) =>
      simBattle(kitParty(depthLevel(d), d, seed, 'rare', enhance, lineup), ['lanterneater'], true, seed, { depth: d, region: 'mainline' }, undefined, 'skill', lineup.abyss);
    for (const d of [5, 10]) {
      let rare = 0, maxed = 0, plain = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const r = fight(d, seed, expectedEnhance(d));
        ex(r.rounds, `11 depth ${d} seed ${seed}`).toBeGreaterThanOrEqual(3);
        rare += r.rounds;
        const m = fight(d, seed, ENHANCE_MAX);
        ex(m.rounds, `14 depth ${d} seed ${seed} +${ENHANCE_MAX}`).toBeGreaterThanOrEqual(2);
        maxed += m.rounds;
        plain += fight(d, seed, 0).rounds;
      }
      sayRun(`21c 11 boss depth ${d}`, { rounds: rare / 20 });
      sayRun(`21c 14 boss depth ${d} +${ENHANCE_MAX}`, { rounds: maxed / 20 });
      sayRun(`21c 14 boss depth ${d} +0`, { rounds: plain / 20 });
      ex(maxed, `14 depth ${d} mean rounds +${ENHANCE_MAX} vs +0`).toBeLessThan(plain);
    }
  }, 300_000);

  it('21d (band 18d). no cell of the lineup matrix loses under 10% HP with a maxed bond', () => {
    const builds: HeroBuild[] = ['balanced', 'sword', 'mage', 'healer', 'tank'];
    const lineups: Record<string, { ids: CharacterId[]; heroRow?: Row; regions: RegionId[] }> = {
      ...ODD_LINEUPS, standard: { ids: STANDARD_LINEUP, regions: ['mainline'] },
    };
    let cells = 0;
    for (const [name, l] of Object.entries(lineups)) for (const build of builds) for (const depth of [4, 8]) for (const region of l.regions) {
      const r = winRate(depthLevel(depth), encounterTable(region, depth), false, 20, { depth, region }, undefined, undefined, 'skill', 0,
        { ids: l.ids, heroBuild: build, heroRow: l.heroRow, armHero: true, ...MAX });
      cells++;
      const label = `${name} ${build} depth ${depth} ${region}`;
      sayRun(`21d ${label}`, r);
      ex(r.hpLoss, label).toBeGreaterThanOrEqual(0.1);
    }
    expect(cells).toBe(60);
  }, 600_000);

  it.skipIf(!bands)('21e Nightmare N4, Hell H3 and shallow Hell: no runes, still no boss, with a maxed bond', () => {
    const maxed = (b: BandId) => measureBand(b, MAX);
    const shallow = (): BandRun[] => measureCells(withLineup(hellReportCells(), MAX), true);
    // The bond switched off first: the maxed lineups must measure what the plain bands do, so neither cache leaks.
    const off = withBondScale(0, () => ({
      n4: pooledLines('N4', maxed), h3: pooledLines('H3', maxed), hr: shallow().map((m) => [m.run, m.twin, m.nightmare]),
    }));
    expect(off.n4).toEqual(pooledLines('N4', measureBand));
    expect(off.h3).toEqual(pooledLines('H3', measureBand));
    expect(off.hr).toEqual(measureCells(hellReportCells(), true).map((m) => [m.run, m.twin, m.nightmare]));
    // N4 reads N3's runs too (its "under magic by .20"); both are measured with every companion at 心契.
    const n4 = bandMisses('N4', maxed);
    const h3 = bandMisses('H3', maxed);
    const hr = shallowHellMisses(shallow());
    for (const line of [...pooledLines('N4', maxed), ...pooledLines('H3', maxed)]) say(`21e ${line}`);
    for (const line of [...n4, ...h3, ...hr]) say(`21e miss ${line}`);
    ex(n4, 'N4').toEqual([]);
    ex(h3, 'H3').toEqual([]);
    ex(hr, 'shallow Hell').toEqual([]);
  }, 3_000_000);

  it('21p the pace reference (spec §12.2.1): who is where by depth 30', () => {
    // The main road from depth 1 to 30, five floors a dive (one day each), Rin, Selene, Chizuru and Noel along: a floor
    // each, the boss of every fifth, under the dive's cap. Each day every companion takes one gift, her first liked
    // material. Her pieces held are the ones memoryPace drops by depth 30. No talk (it waits on the bond scenes).
    const along: Companion[] = ['rin', 'selene', 'chizuru', 'noel'];
    const dives = 30 / 5;
    const m: Record<Companion, Member> = Object.fromEntries(COMPANIONS.map((c) => [c, {
      ...newMember(c), memories: memoryPace(c).filter((d) => d <= 30).length, bond: { talk: 0, field: 0, gifts: {} },
    }])) as Record<Companion, Member>;
    for (let day = 1; day <= dives; day++) {
      for (const c of along) {
        const earned = Math.min(BOND_RUN_CAP, 5 * FIELD_POINTS.floor + FIELD_POINTS.strong);
        m[c].bond!.field = Math.min(BOND_CAP.field, m[c].bond!.field + earned);
      }
      for (const c of COMPANIONS) {
        const mat = GIFT_TASTE[c].liked[0];
        m[c].bond!.gifts[mat] = (m[c].bond!.gifts[mat] ?? 0) + 1;
      }
    }
    for (const c of COMPANIONS) say(`21p ${c} points=${bondPoints(m[c])} tier=${bondTier(m[c])} pieces=${m[c].memories} field=${m[c].bond!.field} gifts=${giftPoints(m[c])}`);
    for (const c of along) ex(bondTier(m[c]), `${c} along`).toBeGreaterThanOrEqual(3);
    for (const c of COMPANIONS.filter((x) => !along.includes(x))) {
      ex(bondTier(m[c]), `${c} left home`).toBeGreaterThanOrEqual(1);
      ex(bondTier(m[c]), `${c} left home`).toBeLessThanOrEqual(3);
    }
    // No one reaches 心契 on one source alone (the record split back into its sources).
    for (const c of COMPANIONS) {
      const only = (part: Partial<{ memories: number; field: number; gifts: Member['bond'] }>) => bondPoints({
        id: c, memories: part.memories ?? 0, bond: { talk: 0, field: part.field ?? 0, gifts: part.gifts?.gifts ?? {} },
      });
      for (const p of [only({ memories: m[c].memories }), only({ field: m[c].bond!.field }), only({ gifts: m[c].bond })]) ex(p, c).toBeLessThan(BOND_TIER_AT[4]);
    }
  });
});
