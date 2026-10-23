/**
 * The difficulty bands' measurements (difficulty plan Task 0): who a cell fields and how a cell is measured. Small and
 * quick; the bands themselves are opt-in (tierBands.{baseline,nightmare,hell}.test.ts, BANDS=1).
 */
import { describe, expect, it } from 'vitest';
import { BUILDS, buildOf } from '../data/builds';
import { STANDARD_LINEUP } from './party';
import { ODD_LINEUPS } from './sim';
import { depthLevel, encounterTable } from './scaling';
import { MAX_LEVEL } from './party';
import { rollCrowdAffix } from './tiers';
import { TIERS } from '../data/difficulty';
import { CURVE, cellCrowdAffix, BASELINE_DEPTHS, BASELINE_TIERS, FEASIBLE, TIER_BANDS, bandCells, bandMisses, baselineLine, frozenMisses, hasTriggerOrLasting, hellReportCells, measureCell, SHALLOW_HELL_BARE, shallowHellMisses, nightmareTwins, normalTwin, pullsApart, roadCell, tierLineup, TIER_SEEDS, withTrigger, type BandId, type BandRun, type TierCell, type TierRun } from './tierBands';
import { AFFIX_IDS } from '../data/affixes';
import { CHARACTER_IDS } from '../data/characters';
import { ENHANCE_MAX } from '../data/forge';
import type { CharacterId } from './types';

describe('difficulty band measurements (difficulty plan Task 0)', () => {
  it('tierLineup picks each member\'s build for the cell', () => {
    expect(TIER_SEEDS).toBe(40);
    const l = tierLineup(38, 'crowd', 'magic');
    expect(l.runeTier).toBe('magic');
    expect(l.ids).toEqual(STANDARD_LINEUP);
    const build = l.build!;
    // 暴走流星 is suggested from Lv 40: at Lv 38 Noel wears the next build that qualifies.
    expect(buildOf('noel', 'meteor')!.minLevel).toBe(40);
    expect(build.noel).toBeDefined();
    expect(build.noel).not.toBe('meteor');
    expect(build.noel).toBe(BUILDS.noel.find((b) => b.key !== 'standard' && (b.minLevel ?? 0) <= 38)!.key);
    for (const id of STANDARD_LINEUP) {
      const key = build[id];
      expect(key, id).toBeDefined();
      const worn = buildOf(id, key!)!;
      expect(worn.key, id).not.toBe('standard');
      expect((worn.minLevel ?? 0) <= 38, id).toBe(true);
      const hasCrowd = BUILDS[id].some((b) => b.scenario === 'crowd' && (b.minLevel ?? 0) <= 38);
      if (hasCrowd) expect(worn.scenario, id).toBe('crowd');
    }
    expect(l.heroBuild).toBe(buildOf('hero', build.hero!)!.hero);
    // An elite cell is fought as a crowd; a boss cell picks the boss builds.
    expect(tierLineup(38, 'elite', 'magic')).toEqual(l);
    const boss = tierLineup(50, 'boss', 'rare');
    expect(boss.runeTier).toBe('rare');
    for (const id of STANDARD_LINEUP) {
      const has = BUILDS[id].some((b) => b.scenario === 'boss');
      if (has) expect(buildOf(id, boss.build![id]!)!.scenario, id).toBe('boss');
    }
    // A hero fill: the hero wears the build whose `hero` is the fill.
    const ids: CharacterId[] = ['hero', 'rin', 'scarlet', 'chizuru', 'safira'];
    const fill = tierLineup(50, 'crowd', 'magic', ids, 'healer');
    expect(fill.ids).toEqual(ids);
    expect(buildOf('hero', fill.build!.hero!)!.hero).toBe('healer');
    expect(fill.heroBuild).toBe('healer');
    // Every fill of the odd lineups resolves at every level a cell is measured at (Lv 38 and the cap); none throws.
    for (const [k, odd] of Object.entries(ODD_LINEUPS)) for (const level of [38, 50]) for (const kind of ['crowd', 'boss'] as const) {
      const l = tierLineup(level, kind, 'magic', odd.ids, odd.fill);
      expect(l.heroBuild, `${k} Lv${level} ${kind}`).toBe(odd.fill);
    }
    // A fill the hero has no build for throws (the balanced hero's only rune build is 殘響, which is no fill).
    expect(() => tierLineup(50, 'crowd', 'magic', ['hero'], 'tank-x' as never)).toThrow(/no rune build for the fill/);
    // Bare: the default, no build and no runes.
    const bare = tierLineup(38, 'crowd', 'bare');
    expect(bare.build).toBeUndefined();
    expect(bare.runeTier).toBeUndefined();
    expect(bare.heroBuild).toBeUndefined();
  });

  it('measureCell is deterministic and counts the cap as a loss', () => {
    const groups = encounterTable('mainline', 3);
    const cell = { depth: 3, region: 'mainline' as const, kind: 'crowd' as const, groups, lineup: tierLineup(10, 'crowd', 'magic'), seeds: 2 };
    const a = measureCell(cell);
    expect(measureCell(cell)).toEqual(a);
    expect(a.fights).toBe(groups.length * 2);
    expect(a.rate).toBeGreaterThan(0);
    expect(a.rounds).toBeGreaterThan(0);
    expect(a.minRounds).toBeGreaterThan(0);
    expect(a.minRounds).toBeLessThanOrEqual(a.rounds);
    expect(a.partyFrozen).toBe(0);
    // A fight that reaches the 60-round cap is lost: a lone healer hero cannot fell two Lantern-eaters, nor they him.
    const stall = measureCell({ depth: 5, region: 'mainline', kind: 'crowd', groups: [['lanterneater', 'lanterneater']], lineup: { ids: ['hero'], heroBuild: 'healer' }, seeds: 2, enhance: 0 });
    expect(stall.fights).toBe(2);
    expect(stall.minRounds).toBe(60);
    expect(stall.hpLoss).toBeLessThan(1);
    expect(stall.rate).toBe(0);
  });

  it('a road cell is the floor\'s groups or its Lantern-eater, the cell\'s lineup at the depth\'s level', () => {
    expect(BASELINE_DEPTHS).toEqual([10, 15, 20, 25, 30]);
    expect(BASELINE_TIERS).toEqual(['bare', 'magic', 'rare']);
    expect(roadCell(10, 'boss', 'magic')).toEqual({ depth: 10, region: 'mainline', kind: 'boss', groups: [['lanterneater']], lineup: tierLineup(38, 'boss', 'magic') });
    // Past Lv 50 the level holds at the cap.
    expect(roadCell(20, 'crowd', 'bare')).toEqual({ depth: 20, region: 'mainline', kind: 'crowd', groups: encounterTable('mainline', 20), lineup: tierLineup(50, 'crowd', 'bare') });
    expect(roadCell(20, 'crowd', 'rare', 'nightmare').difficulty).toBe('nightmare');
    expect(baselineLine(10, 'magic', 'boss', { rate: 0.95, hpLoss: 0.1234, rounds: 7.125, minRounds: 5, partyFrozen: 0, fights: 40 }))
      .toBe('d10 magic boss rate 0.950 loss 0.123 rounds 7.13 min 5');
  });

  it('the feasibility gate: at a boss magic pulls apart from bare by HP lost and by rounds; a crowd is reported', () => {
    // Controller ruling on Task 0b: the gate holds at the bosses (both thresholds); Normal crowds are reported only.
    expect(FEASIBLE).toEqual({ depths: [10, 15, 20, 25], lossGap: 0.10, roundsRatio: 0.8, gated: ['boss'] });
    const run = (hpLoss: number, rounds: number): TierRun => ({ rate: 1, hpLoss, rounds, minRounds: 1, partyFrozen: 0, fights: 1 });
    expect(pullsApart(run(0.31, 10), run(0.20, 8))).toBe(true);
    // Either threshold alone is not enough.
    expect(pullsApart(run(0.31, 10), run(0.20, 10))).toBe(false);
    expect(pullsApart(run(0.30, 10), run(0.21, 8))).toBe(false);
    expect(pullsApart(run(0.30, 10), run(0.21, 8.1))).toBe(false);
    expect(pullsApart(run(0.12, 3.35), run(0.12, 2.82))).toBe(false);
  });

  it('the band cells are as the spec lists', () => {
    const groups = (d: number) => encounterTable('mainline', d).length;
    const pair = (a: readonly unknown[] | undefined) => a?.length;
    const shape = (cs: TierCell[]) => cs.map((c) => `${c.kind}/${c.difficulty}/${c.lineup.runeTier ?? 'bare'}`);
    // N1: every group of the main road at 10/15/20/25, one a cell, a crowd, magic.
    const n1 = bandCells('N1');
    expect(n1.length).toBe(15);
    expect(n1.length).toBe([10, 15, 20, 25].reduce((a, d) => a + groups(d), 0));
    expect(new Set(shape(n1))).toEqual(new Set(['crowd/nightmare/magic']));
    expect(n1.every((c) => c.groups.length === 1 && c.region === 'mainline' && !c.affixes)).toBe(true);
    // N2: every group at 10 and 20, its first foe an elite, x each affix alone.
    const n2 = bandCells('N2');
    expect(n2.length).toBe(48);
    expect(n2.length).toBe((groups(10) + groups(20)) * AFFIX_IDS.length);
    expect(new Set(shape(n2))).toEqual(new Set(['elite/nightmare/magic']));
    expect(n2.every((c) => pair(c.affixes) === 1)).toBe(true);
    // N3: the Lantern-eater at 10/15/20/25 x each affix (d15 added by the controller ruling of 2026-10-23).
    const n3 = bandCells('N3');
    expect(n3.length).toBe(24);
    expect(new Set(shape(n3))).toEqual(new Set(['boss/nightmare/magic']));
    expect(n3.every((c) => pair(c.affixes) === 1 && c.groups[0][0] === 'lanterneater')).toBe(true);
    // N4: N1 and N3, bare.
    const n4 = bandCells('N4');
    expect(n4.length).toBe(39);
    expect(n4.every((c) => !c.lineup.build && !c.lineup.runeTier && c.difficulty === 'nightmare')).toBe(true);
    expect(n4.map((c) => ({ ...c, lineup: undefined }))).toEqual([...n1, ...n3].map((c) => ({ ...c, lineup: undefined, label: c.label!.replace('magic', 'bare') })));
    // N5: each odd lineup in each of its regions at 15, the hero on the fill's build, its row as the table has it.
    const n5 = bandCells('N5');
    expect(n5.length).toBe(Object.values(ODD_LINEUPS).reduce((a, o) => a + o.regions.length, 0));
    expect(n5.length).toBe(5);
    let i = 0;
    for (const odd of Object.values(ODD_LINEUPS)) for (const region of odd.regions) {
      const c = n5[i++];
      expect([c.depth, c.region, c.kind, c.difficulty, c.lineup.runeTier]).toEqual([15, region, 'crowd', 'nightmare', 'magic']);
      expect(c.groups).toEqual(encounterTable(region, 15));
      expect(c.lineup.ids).toEqual(odd.ids);
      expect(c.lineup.heroBuild).toBe(odd.fill);
      expect(c.lineup.heroRow).toBe(odd.heroRow);
    }
    // N6: the five regions with a rider at 10 and 20, every group of the floor.
    const n6 = bandCells('N6');
    expect(n6.map((c) => `${c.region}${c.depth}`)).toEqual(['blaze10', 'blaze20', 'frost10', 'frost20', 'storm10', 'storm20', 'shade10', 'shade20', 'iron10', 'iron20']);
    expect(n6.every((c) => c.kind === 'crowd' && c.lineup.runeTier === 'magic' && c.groups.length === encounterTable(c.region, c.depth).length)).toBe(true);
    // H1: every group of the main road at 20/25/30, rare, with a trigger or a lasting rune in the party.
    const h1 = bandCells('H1');
    expect(h1.length).toBe(11);
    expect(new Set(shape(h1))).toEqual(new Set(['crowd/hell/rare']));
    for (const c of h1) expect(hasTriggerOrLasting(c.lineup, 50), c.label).toBe(true);
    // H2: the Lantern-eater at 25/30 x the 15 pairs of affixes, ten seeds each; the party has a trigger or 常駐 combo
    // (controller ruling 2026-10-23): ruling 12's boss lineup has none, so Chizuru wears 穩守.
    const h2 = bandCells('H2');
    expect(hasTriggerOrLasting(tierLineup(50, 'boss', 'rare'), 50)).toBe(false);
    for (const c of h2) {
      expect(hasTriggerOrLasting(c.lineup, 50), c.label).toBe(true);
      expect(c.lineup).toEqual(withTrigger(tierLineup(50, 'boss', 'rare'), 50));
    }
    expect(h2[0].lineup.build!.chizuru).toBe('steady');
    expect({ ...h2[0].lineup.build, chizuru: undefined }).toEqual({ ...tierLineup(50, 'boss', 'rare').build, chizuru: undefined });
    expect(h2.length).toBe(28);
    expect(new Set(shape(h2))).toEqual(new Set(['boss/hell/rare']));
    expect(h2.every((c) => pair(c.affixes) === 2 && c.affixes![0] !== c.affixes![1] && c.seeds === 10)).toBe(true);
    // 15 pairs but 堅韌 with 迅捷 (AFFIX_EXCLUDE).
    expect(new Set(h2.map((c) => c.affixes!.join('+'))).size).toBe(14);
    expect(h2.some((c) => c.affixes!.includes('tough') && c.affixes!.includes('swift'))).toBe(false);
    // H3: H1 and H2 at magic, then again bare.
    const h3 = bandCells('H3');
    expect(h3.length).toBe(78);
    expect(h3.slice(0, 39).every((c) => c.lineup.runeTier === 'magic')).toBe(true);
    expect(h3.slice(39).every((c) => !c.lineup.runeTier && !c.lineup.build)).toBe(true);
    // H4: every rune build of every member in turn at the epic tier, rare kits at +ENHANCE_MAX, the bosses of H2, ten seeds.
    const h4 = bandCells('H4');
    const runeBuilds = CHARACTER_IDS.reduce((a, id) => a + BUILDS[id].filter((b) => b.key !== 'standard').length, 0);
    expect(runeBuilds).toBe(23);
    expect(h4.length).toBe(644);
    expect(h4.length).toBe(runeBuilds * 28);
    expect(h4.every((c) => c.kind === 'boss' && c.difficulty === 'hell' && c.lineup.runeTier === 'epic' && c.rarity === 'rare' && c.enhance === ENHANCE_MAX && c.seeds === 10)).toBe(true);
    // HE (controller ruling 2026-10-23): every group at 20 and 25, its first foe an elite with each pair, rare, ten seeds.
    const he = bandCells('HE');
    expect(he.length).toBe((groups(20) + groups(25)) * 14);
    expect(new Set(shape(he))).toEqual(new Set(['elite/hell/rare']));
    expect(he.every((c) => pair(c.affixes) === 2 && c.seeds === 10 && c.groups.length === 1)).toBe(true);
    // Hell below d25, reachable (depths are shared) but under no band (T4-T5 review): reported only. The d15 crowds as H1
    // builds them, the d15 and d20 bosses as H2 does; no BandId, so no assertion reads them.
    const hr = hellReportCells();
    expect(hr.filter((c) => c.kind === 'crowd').map((c) => c.label)).toEqual(encounterTable('mainline', 15).map((g, i) => `d15 crowd g${i} ${g.join('+')} rare`));
    // Each boss also with the bare default (controller, after Task 6a: Hell should still punish it at shallow depths).
    for (const d of [15, 20]) {
      const lv = Math.min(MAX_LEVEL, depthLevel(d));
      for (const [tier, lineup] of [['rare', withTrigger(tierLineup(lv, 'boss', 'rare'), lv)], ['bare', tierLineup(lv, 'boss', 'bare')]] as const) {
        const bosses = hr.filter((c) => c.kind === 'boss' && c.depth === d && (c.lineup.runeTier ?? 'bare') === tier);
        expect(bosses.length, `d${d} ${tier}`).toBe(14);
        expect(new Set(bosses.map((c) => c.affixes!.join('+'))).size).toBe(14);
        for (const c of bosses) {
          expect([c.seeds, pair(c.affixes), c.label!.endsWith(` ${tier}`)], c.label).toEqual([10, 2, true]);
          expect(c.lineup, c.label).toEqual(lineup);
        }
      }
    }
    expect(hr.length).toBe(groups(15) + 56);
    expect(new Set(shape(hr))).toEqual(new Set(['crowd/hell/rare', 'boss/hell/rare', 'boss/hell/bare']));
  });

  it('Hell crowd cells meet the crowd affix as the game draws it; twins and other tiers do not', () => {
    // A Hell crowd cell's fight k of group gi draws the crowd affix of spot (gi, k) from seed k x 7919, at Hell's chance;
    // about half the fights meet one. Nightmare, Normal, an elite and a boss never.
    const cell = bandCells('H1').find((c) => c.depth === 20)!;
    let met = 0;
    for (let k = 1; k <= 40; k++) {
      const a = cellCrowdAffix(cell, 0, k);
      expect(a, `k ${k}`).toEqual(rollCrowdAffix(k * 7919, 20, { x: 0, y: k }, TIERS.hell.crowdAffixChance));
      if (a) met++;
      expect(cellCrowdAffix({ ...cell, difficulty: 'nightmare' }, 0, k)).toBeUndefined();
      expect(cellCrowdAffix(normalTwin(cell), 0, k)).toBeUndefined();
      expect(cellCrowdAffix(bandCells('HE')[0], 0, k)).toBeUndefined();
      expect(cellCrowdAffix(bandCells('H2')[0], 0, k)).toBeUndefined();
    }
    expect(met).toBeGreaterThan(10);
    expect(met).toBeLessThan(30);
    // Nightmare twins: a crowd as it is at Nightmare; a pair as its two single-affix Nightmare cells.
    expect(nightmareTwins(cell)).toEqual([{ ...normalTwin(cell), label: undefined, difficulty: 'nightmare' }].map(({ label: _l, ...c }) => c));
    const boss = bandCells('H2')[0];
    expect(nightmareTwins(boss).map((c) => [c.difficulty, c.affixes])).toEqual(boss.affixes!.map((a) => ['nightmare', [a]]));
  });

  it('a trigger or a lasting rune is read from the runes a build sockets at the level', () => {
    // Chizuru's 穩守 sockets 常駐 on 結界; 斯嘉蕾's 反擊 an on-struck trigger; 席菈's 滿月 neither.
    expect(hasTriggerOrLasting({ ids: ['chizuru'], build: { chizuru: 'steady' }, runeTier: 'rare' }, 50)).toBe(true);
    expect(hasTriggerOrLasting({ ids: ['scarlet'], build: { scarlet: 'riposte' }, runeTier: 'rare' }, 50)).toBe(true);
    expect(hasTriggerOrLasting({ ids: ['selene'], build: { selene: 'fullmoon' }, runeTier: 'rare' }, 50)).toBe(false);
    expect(hasTriggerOrLasting({ ids: ['chizuru'] }, 50)).toBe(false);
  });

  it('a twin is the same cell on Normal', () => {
    for (const c of [bandCells('N2')[0], bandCells('H2')[3], bandCells('N5')[0], bandCells('H4')[0]]) {
      const t = normalTwin(c);
      expect(t.difficulty).toBeUndefined();
      expect(t.affixes).toBeUndefined();
      expect({ ...t, difficulty: c.difficulty, affixes: c.affixes }).toEqual(c);
    }
  });
});

describe('difficulty band thresholds (difficulty plan Task 5b, controller ruling 2026-10-23)', () => {
  const run = (rate: number, hpLoss: number, rounds = 5, minRounds = 3, partyFrozen = 0): TierRun => ({ rate, hpLoss, rounds, minRounds, partyFrozen, fights: 40 });
  /** Every cell of `band` with the run `f` gives it; twins with `twinLoss`, Nightmare twins with `nmLoss`. */
  const fill = (band: BandId, f: (c: TierCell) => TierRun, twinLoss = 0.1, nmLoss = 0.1): BandRun[] =>
    bandCells(band).map((cell) => ({ cell, run: f(cell), twin: run(1, twinLoss), nightmare: run(1, nmLoss) }));
  const only = (band: BandId, runs: BandRun[]) => (b: BandId) => { if (b !== band) throw new Error(b); return runs; };

  it('the thresholds are the ruling\'s', () => {
    expect(TIER_BANDS).toEqual({
      N1: { depths: [10, 15, 20, 25], rate: 0.90 }, N2: { rate: 0.80, belowMean: 0.15 }, N3: { depths: [15, 20, 25], rate: 0.80 },
      N4: { depths: [15, 20, 25], bareRate: 0.70, belowMagic: 0.20 }, N5: { rate: 0.75 }, N6: { rate: 0.80 },
      H1: { depths: [20, 25], rate: 0.85 }, H2: { depths: [25], rate: 0.75 }, H3: { depths: [25], bareRate: 0.40 },
      H4: { minRounds: 3 }, HE: { depths: [20, 25], rate: 0.75, pairFloor: 0.40 },
    });
  });

  it('N1 and N3 pool a depth: the rate, and HP lost above the Normal twin\'s', () => {
    expect(bandMisses('N1', only('N1', fill('N1', () => run(0.9, 0.11))))).toEqual([]);
    // One group of d15 at .5 pulls its depth's pool (three groups) under .90; a twin at the same loss is not harder.
    const n1 = bandMisses('N1', only('N1', fill('N1', (c) => run(c.depth === 15 && c.groups[0].length === 1 && c.groups[0][0] === 'golem' ? 0.5 : 1, c.depth === 25 ? 0.1 : 0.2))));
    expect(n1).toEqual(['N1 d15: rate 0.833 < 0.9', 'N1 d25: loss 0.100 not above the normal twin\'s 0.100', 'N1 d25: the loss over the normal twin 0.000 drops more than 0.03 under d10\'s 0.100']);
    // N3: d10 is reported only; a weak affix pulls its depth.
    expect(bandMisses('N3', only('N3', fill('N3', (c) => run(c.depth === 10 ? 0 : 0.8, 0.3))))).toEqual([]);
    expect(bandMisses('N3', only('N3', fill('N3', (c) => run(c.depth === 20 && c.affixes![0] === 'swift' ? 0 : 0.9, 0.3))))).toEqual(['N3 d20: rate 0.750 < 0.8']);
  });

  it('the curve: a tier\'s loss over the Normal twin never drops by more than .03 as the depth rises', () => {
    expect(CURVE).toEqual({ slack: 0.03, N1: [10, 15, 20, 25], N3: [10, 15, 20, 25], H1: [20, 25] });
    // Deltas over the twin (twin loss .1): N1 .05, .10, .08, .12 holds (.08 is .02 under .10); .05 at d20 does not.
    const n1 = (lossAt: Record<number, number>) => fill('N1', (c) => run(1, lossAt[c.depth]), 0.1);
    expect(bandMisses('N1', only('N1', n1({ 10: 0.15, 15: 0.2, 20: 0.18, 25: 0.22 })))).toEqual([]);
    expect(bandMisses('N1', only('N1', n1({ 10: 0.15, 15: 0.2, 20: 0.15, 25: 0.22 })))).toEqual(['N1 d20: the loss over the normal twin 0.050 drops more than 0.03 under d15\'s 0.100']);
    // Against the highest of every shallower depth, not only the one before (T4-T5 review): .10, .08, .06, .06 slides by
    // .02 a step, yet d20 and d25 sit .04 under d10.
    expect(bandMisses('N1', only('N1', n1({ 10: 0.2, 15: 0.18, 20: 0.16, 25: 0.16 })))).toEqual([
      'N1 d20: the loss over the normal twin 0.060 drops more than 0.03 under d10\'s 0.100',
      'N1 d25: the loss over the normal twin 0.060 drops more than 0.03 under d10\'s 0.100',
    ]);
    // N3 reads d10 for the curve though its rate is not held there; H1 its d20 and d25 only (d30 reported).
    const n3 = fill('N3', (c) => run(c.depth === 10 ? 0 : 0.9, c.depth === 10 ? 0.5 : 0.3), 0.1);
    expect(bandMisses('N3', only('N3', n3))).toEqual([15, 20, 25].map((d) => `N3 d${d}: the loss over the normal twin 0.200 drops more than 0.03 under d10's 0.400`));
    const h1 = fill('H1', (c) => run(0.9, c.depth === 30 ? 0.11 : c.depth === 20 ? 0.4 : 0.36), 0.1, 0.05);
    expect(bandMisses('H1', only('H1', h1))).toEqual(['H1 d25: the loss over the normal twin 0.260 drops more than 0.03 under d20\'s 0.300']);
  });

  it('N4: the bare boss pooled at most .70 and .20 under magic, from d15', () => {
    const n3 = fill('N3', () => run(0.9, 0.3));
    const with4 = (bare: (c: TierCell) => number) => { const n4 = fill('N4', (c) => run(bare(c), 0.8)); return (b: BandId) => (b === 'N3' ? n3 : n4); };
    // The crowds and d10 are reported only.
    expect(bandMisses('N4', with4((c) => (c.kind === 'crowd' || c.depth === 10 ? 1 : 0.7)))).toEqual([]);
    expect(bandMisses('N4', with4((c) => (c.kind === 'boss' && c.depth === 15 ? 0.75 : 0.5)))).toEqual(['N4 d15: bare rate 0.750 > 0.7', 'N4 d15: bare rate 0.750 not 0.2 under magic\'s 0.900']);
    // No bare boss fight measured at a depth is a miss, not a pass (T4-T5 review).
    const crowdsOnly = fill('N4', () => run(0, 0.8)).filter((m) => m.cell.kind === 'crowd' || m.cell.depth !== 20);
    expect(bandMisses('N4', (b) => (b === 'N3' ? n3 : crowdsOnly))).toEqual(['N4 d20: no bare boss fight measured']);
  });

  it('H1 and H2 pool a depth against the Nightmare twins; d30 is reported only', () => {
    expect(bandMisses('H1', only('H1', fill('H1', (c) => run(c.depth === 30 ? 0 : 0.85, 0.3), 0.1, 0.2)))).toEqual([]);
    expect(bandMisses('H1', only('H1', fill('H1', () => run(0.9, 0.3), 0.1, 0.3)))).toEqual(['H1 d20: loss 0.300 not above the nightmare twin\'s 0.300', 'H1 d25: loss 0.300 not above the nightmare twin\'s 0.300']);
    expect(bandMisses('H2', only('H2', fill('H2', (c) => run(c.depth === 30 ? 0 : 0.75, 0.6), 0.1, 0.5)))).toEqual([]);
    expect(bandMisses('H2', only('H2', fill('H2', () => run(0.7, 0.6), 0.1, 0.5)))).toEqual(['H2 d25: rate 0.700 < 0.75']);
  });

  it('H3: the bare boss at d25 pooled at most .40; magic and crowds reported only', () => {
    expect(bandMisses('H3', only('H3', fill('H3', (c) => run(c.lineup.runeTier || c.kind === 'crowd' || c.depth === 30 ? 1 : 0.4, 0.9))))).toEqual([]);
    expect(bandMisses('H3', only('H3', fill('H3', (c) => run(c.lineup.runeTier ? 0 : 0.41, 0.9))))).toEqual(['H3 d25: bare boss rate 0.410 > 0.4']);
    // No bare boss fight measured is a miss, not a pass (T4-T5 review).
    const noBare = fill('H3', () => run(0, 0.9)).filter((m) => m.cell.lineup.runeTier || m.cell.kind === 'crowd');
    expect(bandMisses('H3', only('H3', noBare))).toEqual(['H3 d25: no bare boss fight measured']);
  });

  it('shallow Hell: the bare boss at d15 and d20 pooled at most .40; rare and crowds reported only (controller ruling)', () => {
    expect(SHALLOW_HELL_BARE).toEqual({ depths: [15, 20], bareRate: 0.40 });
    const hr = (rate: (c: TierCell) => number): BandRun[] => hellReportCells().map((cell) => ({ cell, run: run(rate(cell), 0.9), twin: run(1, 0.1), nightmare: run(1, 0.2) }));
    const bare = (c: TierCell) => c.kind === 'boss' && !c.lineup.runeTier;
    expect(shallowHellMisses(hr((c) => (bare(c) ? 0.4 : 0)))).toEqual([]);
    expect(shallowHellMisses(hr((c) => (bare(c) && c.depth === 20 ? 0.45 : bare(c) ? 0.3 : 1)))).toEqual(['HR d20: bare boss rate 0.450 > 0.4']);
    expect(shallowHellMisses(hr(() => 1).filter((m) => !bare(m.cell) || m.cell.depth !== 15))).toEqual(['HR d15: no bare boss fight measured', 'HR d20: bare boss rate 1.000 > 0.4']);
  });

  it('HE: a depth pooled at .75, and no pair under .40', () => {
    expect(bandMisses('HE', only('HE', fill('HE', () => run(0.75, 0.5))))).toEqual([]);
    // The wolf elite at 0 with one pair: that pair pools .75 x 3 / 4 = .5625, above the floor; at 0 in every group, below it.
    const wolf = (c: TierCell) => c.groups[0].length === 1 && c.groups[0][0] === 'wolf';
    expect(bandMisses('HE', only('HE', fill('HE', (c) => run(wolf(c) && c.affixes!.join('+') === 'scorch+frostbind' ? 0 : 0.8, 0.5))))).toEqual([]);
    expect(bandMisses('HE', only('HE', fill('HE', (c) => run(c.depth === 20 && c.affixes!.join('+') === 'rend+swift' ? 0.3 : 0.8, 0.5)))))
      .toEqual(['HE d20 [rend+swift]: rate 0.300 < 0.4']);
    expect(bandMisses('HE', only('HE', fill('HE', (c) => run(c.depth === 25 ? 0.7 : 0.9, 0.5))))).toEqual(['HE d25: rate 0.700 < 0.75']);
  });

  it('N2, N5, N6 as before; H4 three rounds; HX no frozen round', () => {
    expect(bandMisses('N2', only('N2', fill('N2', () => run(0.9, 0.3))))).toEqual([]);
    expect(bandMisses('N2', only('N2', fill('N2', (c) => run(c.affixes![0] === 'swift' ? 0.8 : 1, 0.3)))))
      .toEqual(['N2 d10 [swift]: rate 0.800 below the mean 0.967 by more than 0.15', 'N2 d20 [swift]: rate 0.800 below the mean 0.967 by more than 0.15']);
    expect(bandMisses('N5', only('N5', fill('N5', () => run(0.75, 0.9))))).toEqual([]);
    expect(bandMisses('N6', only('N6', fill('N6', (c) => run(c.region === 'iron' ? 0.79 : 1, 0.1)))).length).toBe(2);
    const h4 = fill('H4', () => run(1, 0.1, 9, 3));
    expect(bandMisses('H4', only('H4', h4))).toEqual([]);
    h4[0] = { ...h4[0], run: run(1, 0.1, 9, 2) };
    expect(bandMisses('H4', only('H4', h4))).toEqual([`H4 ${bandCells('H4')[0].label}: a fight of 2 rounds < 3`]);
    expect(frozenMisses('N1', fill('N1', () => run(1, 0.1)))).toEqual([]);
    expect(frozenMisses('N1', fill('N1', () => run(1, 0.1, 3, 3, 1))).length).toBe(15);
  });
});
