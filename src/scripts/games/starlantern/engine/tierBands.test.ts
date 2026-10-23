/**
 * The difficulty bands' measurements (difficulty plan Task 0): who a cell fields and how a cell is measured. Small and
 * quick; the bands themselves are opt-in (tierBands.{baseline,nightmare,hell}.test.ts, BANDS=1).
 */
import { describe, expect, it } from 'vitest';
import { BUILDS, buildOf } from '../data/builds';
import { STANDARD_LINEUP } from './party';
import { ODD_LINEUPS } from './sim';
import { encounterTable } from './scaling';
import { BASELINE_DEPTHS, BASELINE_TIERS, FEASIBLE, bandCells, baselineLine, hasTriggerOrLasting, measureCell, normalTwin, pullsApart, roadCell, tierLineup, TIER_SEEDS, type TierCell, type TierRun } from './tierBands';
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
    // N3: the Lantern-eater at 10/20/25 x each affix.
    const n3 = bandCells('N3');
    expect(n3.length).toBe(18);
    expect(new Set(shape(n3))).toEqual(new Set(['boss/nightmare/magic']));
    expect(n3.every((c) => pair(c.affixes) === 1 && c.groups[0][0] === 'lanterneater')).toBe(true);
    // N4: N1 and N3, bare.
    const n4 = bandCells('N4');
    expect(n4.length).toBe(33);
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
    // H2: the Lantern-eater at 25/30 x the 15 pairs of affixes, ten seeds each.
    const h2 = bandCells('H2');
    expect(h2.length).toBe(30);
    expect(new Set(shape(h2))).toEqual(new Set(['boss/hell/rare']));
    expect(h2.every((c) => pair(c.affixes) === 2 && c.affixes![0] !== c.affixes![1] && c.seeds === 10)).toBe(true);
    expect(new Set(h2.map((c) => c.affixes!.join('+'))).size).toBe(15);
    // H3: H1 and H2 at magic, then again bare.
    const h3 = bandCells('H3');
    expect(h3.length).toBe(82);
    expect(h3.slice(0, 41).every((c) => c.lineup.runeTier === 'magic')).toBe(true);
    expect(h3.slice(41).every((c) => !c.lineup.runeTier && !c.lineup.build)).toBe(true);
    // H4: every rune build of every member in turn at the epic tier, rare kits at +ENHANCE_MAX, the bosses of H2, ten seeds.
    const h4 = bandCells('H4');
    const runeBuilds = CHARACTER_IDS.reduce((a, id) => a + BUILDS[id].filter((b) => b.key !== 'standard').length, 0);
    expect(runeBuilds).toBe(23);
    expect(h4.length).toBe(690);
    expect(h4.length).toBe(runeBuilds * 30);
    expect(h4.every((c) => c.kind === 'boss' && c.difficulty === 'hell' && c.lineup.runeTier === 'epic' && c.rarity === 'rare' && c.enhance === ENHANCE_MAX && c.seeds === 10)).toBe(true);
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
