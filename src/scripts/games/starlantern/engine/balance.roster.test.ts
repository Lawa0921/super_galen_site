/**
 * Band 22, the monster roster against the lantern-eater and its own kin (roster plan B12, spec §9.3; the thresholds are the
 * bands' they copy, none of their helpers imported, as balance.bond.test.ts does). 22e is withdrawn (ruling 4); 22j is the
 * higher difficulties' (engine/tierBands.roster.test.ts). The roster's fights are measured with every roster id live
 * (summons call only live foes, and the old foes' deep traits come with a roster table); 22c and 22d measure the tables as
 * the live set has them (nothing live: the legacy tables, which must already be green), and report the full roster's.
 * Opt-in, so the full suite keeps its speed:
 *
 *   ROSTER_BANDS=1 BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.roster.test.ts --testTimeout=300000
 *
 * Report lines start with `[roster]` (the sim gate's grep does not take them). 22g only reports.
 */
import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../data/enemies';
import { ENHANCE_MAX, expectedEnhance } from '../data/forge';
import { SPECIALS } from '../data/gear';
import { LEGACY_ENEMY_IDS, REGION_BOSSES, TREASURE, bandOf, bossFor, wardenFor, wardenGroup } from '../data/monsters';
import type { RegionId } from '../data/regions';
import { createBattle, resolveRound } from './battle';
import { choose } from './choose';
import { rollItem } from './loot/item';
import { MAX_LEVEL, SLOTS, statsOf } from './party';
import { mulberry32 } from './rng';
import { depthLevel, encounterTable } from './scaling';
import { ODD_LINEUPS, kitParty, simBattle, winRate, type Lineup } from './sim';
import { withRosterLive } from './testing';
import type { AnyStat, CharacterId, EnemyDef, Party, Slot } from './types';

const on = process.env.ROSTER_BANDS === '1';
const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const ex = report ? expect.soft : expect;
const say = (line: string) => { if (report) console.info(`[roster] ${line}`); };
const f3 = (x: number) => x.toFixed(3);
const sayRun = (label: string, r: { rate?: number; hpLoss?: number; rounds?: number }) =>
  say(`${label}${r.rate === undefined ? '' : ` rate=${f3(r.rate)}`}${r.hpLoss === undefined ? '' : ` hpLoss=${f3(r.hpLoss)}`}${r.rounds === undefined ? '' : ` rounds=${r.rounds.toFixed(2)}`}`);

const LANDS = Object.keys(REGION_BOSSES) as Exclude<RegionId, 'mainline'>[];
const ROSTER = Object.keys(ENEMIES).filter((id) => !LEGACY_ENEMY_IDS.includes(id));
const allLive = <T>(f: () => T): T => withRosterLive(ROSTER, f);
const levelAt = (d: number) => Math.min(MAX_LEVEL, depthLevel(d));
/** As band 19a: the standard five with the memory expectation, a monster kit of the depth at its expected enhance. */
const EXPECT: Lineup = { expect: true };
const KITS = 3;

/** The expected party's mean over KITS kits of `seeds` fights a group (band 19a's measure, fewer kits). */
function expected(d: number, region: RegionId, groups: string[][], seeds = 8, lineup: Lineup = EXPECT): { rate: number; hpLoss: number } {
  let rate = 0, hpLoss = 0;
  for (let kit = 1; kit <= KITS; kit++) {
    const r = winRate(levelAt(d), groups, false, seeds, { depth: d, region }, undefined, kit, 'skill', expectedEnhance(d), lineup);
    rate += r.rate / KITS;
    hpLoss += r.hpLoss / KITS;
  }
  return { rate, hpLoss };
}

/** Spec §5.1's archetype of a roster species, read off its gold (std and support share 21: support has more mag than atk). */
type Arch = 'swarm' | 'std' | 'heavy' | 'caster' | 'support';
function archOf(d: EnemyDef): Arch {
  if (d.gold === 11) return 'swarm';
  if (d.gold === 31) return 'heavy';
  if (d.gold === 29) return 'caster';
  return d.stats.mag > d.stats.atk ? 'support' : 'std';
}
/** The old foe of each archetype's shape, the reference group of 22a (swarms of three, the rest pairs). */
const REFERENCE: Record<Arch, string> = { swarm: 'bat', std: 'lizard', heavy: 'golem', caster: 'shade', support: 'wisp' };
const PAIRED = new Set(['mist-twin', 'ice-komainu']);
const groupOf = (id: string, arch: Arch) => (arch === 'swarm' && !PAIRED.has(id) ? [id, id, id] : [id, id]);

/** Where an ordinary species is first met: its band's first depth on the main road, depth 4 in its home region. */
function firstMet(d: EnemyDef): { depth: number; region: RegionId } {
  if (d.home) return { depth: 4, region: d.home };
  let depth = 4;
  while (bandOf(depth) !== d.band) depth++;
  return { depth, region: 'mainline' };
}

/** The boss of a boss group (its parts lead the line: data/monsters.ts bossFor). */
const bossOf = (group: string[]): string => group.find((id) => ENEMIES[id].boss) ?? group[0];
const ORDINARY = ROSTER.filter((id) => !ENEMIES[id].boss && !ENEMIES[id].rank && !TREASURE.has(id));

describe.skipIf(!on)('band 22: the roster against the lantern-eater and its own kin (roster plan B12)', () => {
  const refs = new Map<string, { rate: number; hpLoss: number }>();
  /** A reference group as the legacy roster meets it (nothing live, so no deep trait). */
  const reference = (arch: Arch, depth: number, region: RegionId) => {
    const key = `${arch} ${depth} ${region}`;
    let r = refs.get(key);
    if (!r) {
      const id = REFERENCE[arch];
      r = expected(depth, region, [arch === 'swarm' ? [id, id, id] : [id, id]]);
      refs.set(key, r);
      sayRun(`22a reference ${arch} (${id}) ${region} d${depth}`, r);
    }
    return r;
  };
  const parity = (ids: string[]) => {
    for (const id of ids) {
      const d = ENEMIES[id];
      const arch = archOf(d);
      const { depth, region } = firstMet(d);
      const ref = reference(arch, depth, region);
      const r = allLive(() => expected(depth, region, [groupOf(id, arch)]));
      const label = `22a ${id} (${arch}) ${region} d${depth}`;
      sayRun(label, { ...r, rounds: undefined });
      say(`${label} hpLoss-ref=${f3(r.hpLoss - ref.hpLoss)}`);
      ex(r.rate, label).toBeGreaterThanOrEqual(0.85);
      ex(r.hpLoss, label).toBeGreaterThanOrEqual(0.1);
      ex(r.hpLoss, label).toBeLessThanOrEqual(0.45);
      ex(Math.abs(r.hpLoss - ref.hpLoss), `${label} against ${REFERENCE[arch]}`).toBeLessThanOrEqual(0.08);
    }
  };

  it('22a species parity: the main road', () => parity(ORDINARY.filter((id) => !ENEMIES[id].home)), 600_000);
  it('22a species parity: the regions', () => parity(ORDINARY.filter((id) => !!ENEMIES[id].home)), 600_000);

  /** Every new boss and the depths it is met at (≤ 50): bossFor with everything live, the lantern-eater's cells left out. */
  const bossCells = (): { region: RegionId; depth: number; group: string[] }[] => allLive(() => {
    const out: { region: RegionId; depth: number; group: string[] }[] = [];
    for (const region of ['mainline', ...LANDS] as RegionId[]) for (let depth = 5; depth <= 50; depth += 5) {
      const group = bossFor(region, depth);
      if (group[0] !== 'lanterneater') out.push({ region, depth, group });
    }
    return out;
  });
  const bossFight = (party: Party, group: string[], seed: number, depth: number, region: RegionId) =>
    simBattle(party, group, true, seed, { depth, region });
  const bossRate = (group: string[], depth: number, region: RegionId, seeds: number, lineup: Lineup = EXPECT) => {
    let wins = 0, rounds = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const r = bossFight(kitParty(levelAt(depth), depth, seed, undefined, expectedEnhance(depth), lineup), group, seed, depth, region);
      if (r.outcome === 'win') wins++;
      rounds += r.rounds;
    }
    return { rate: wins / seeds, rounds: rounds / seeds };
  };

  const bossParity = (regions: RegionId[]) => {
    for (const c of bossCells().filter((x) => regions.includes(x.region))) {
      const boss = allLive(() => bossRate(c.group, c.depth, c.region, 16));
      const eater = bossRate(['lanterneater'], c.depth, c.region, 16);
      const label = `22b ${bossOf(c.group)} ${c.region} d${c.depth}`;
      sayRun(label, boss);
      sayRun(`${label} lanterneater`, eater);
      ex(Math.abs(boss.rate - eater.rate), label).toBeLessThanOrEqual(0.1);
    }
  };
  it('22b boss parity: the main road', () => bossParity(['mainline']), 600_000);
  it('22b boss parity: blaze, frost, storm', () => bossParity(['blaze', 'frost', 'storm']), 900_000);
  it('22b boss parity: mire, shade, iron', () => bossParity(['mire', 'shade', 'iron']), 900_000);

  it('22b bands 11, 14 and 16 at each new boss\'s first depth', () => {
    const first = new Map<string, { region: RegionId; depth: number; group: string[] }>();
    for (const c of bossCells()) if (!first.has(bossOf(c.group))) first.set(bossOf(c.group), c);
    for (const c of first.values()) allLive(() => {
      const label = `22b ${bossOf(c.group)} ${c.region} d${c.depth}`;
      let rare = 0, maxed = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const r = bossFight(kitParty(levelAt(c.depth), c.depth, seed, 'rare', expectedEnhance(c.depth)), c.group, seed, c.depth, c.region);
        ex(r.rounds, `11 ${label} seed ${seed}`).toBeGreaterThanOrEqual(3);
        rare += r.rounds;
        const m = bossFight(kitParty(levelAt(c.depth), c.depth, seed, 'rare', ENHANCE_MAX), c.group, seed, c.depth, c.region);
        ex(m.rounds, `14 ${label} seed ${seed} +${ENHANCE_MAX}`).toBeGreaterThanOrEqual(2);
        maxed += m.rounds;
      }
      sayRun(`${label} 11 rare`, { rounds: rare / 8 });
      sayRun(`${label} 14 +${ENHANCE_MAX}`, { rounds: maxed / 8 });
      // 16: benching never helps (two, three, four members at most the full party + 0.05, the same seeds and kits).
      const full = bossRate(c.group, c.depth, c.region, 20);
      for (const [name, ids] of [['two', ['hero', 'chizuru']], ['three', ['hero', 'rin', 'chizuru']], ['four', ['hero', 'rin', 'chizuru', 'noel']]] as const) {
        const r = bossRate(c.group, c.depth, c.region, 20, { ...EXPECT, ids: [...ids] as CharacterId[] });
        sayRun(`${label} 16 ${name}`, r);
        ex(r.rate, `16 ${label} ${name} vs full ${f3(full.rate)}`).toBeLessThanOrEqual(full.rate + 0.05);
      }
    });
  }, 900_000);

  it('22c the regions deep: the expected party wins >= .85 and loses 10-45% at depths 15 and 25', () => {
    for (const region of LANDS) for (const d of [15, 25]) {
      const r = expected(d, region, encounterTable(region, d));
      const label = `22c ${region} d${d}`;
      sayRun(label, r);
      ex(r.rate, label).toBeGreaterThanOrEqual(0.85);
      ex(r.hpLoss, label).toBeGreaterThanOrEqual(0.1);
      ex(r.hpLoss, label).toBeLessThanOrEqual(0.45);
      // What the full roster's table gives (reported; it is asserted once the region's natives go live, plan L).
      sayRun(`${label} all live (report)`, allLive(() => expected(d, region, encounterTable(region, d))));
    }
  }, 900_000);

  /** 22d's party (ruling of this task): band 18a's lopsided lineups on their fill build, with band 19a's kit and memories. */
  const odd = (name: keyof typeof ODD_LINEUPS): Lineup => {
    const l = ODD_LINEUPS[name];
    return { ids: l.ids, heroBuild: l.fill, heroRow: l.heroRow, armHero: true, expect: true };
  };
  const ODD_CELLS: [keyof typeof ODD_LINEUPS, RegionId, number][] = [
    ...(Object.keys(ODD_LINEUPS) as (keyof typeof ODD_LINEUPS)[]).flatMap((n) => [12, 20, 35].map((d) => [n, 'mainline', d] as [keyof typeof ODD_LINEUPS, RegionId, number])),
    ['allPhys', 'iron', 12], ['allPhys', 'mire', 12], ['allMagic', 'storm', 12],
  ];
  it('22d lopsided lineups deep: wins >= .85 and loses 10-45%', () => {
    for (const [name, region, d] of ODD_CELLS) {
      const r = expected(d, region, encounterTable(region, d), 8, odd(name));
      const label = `22d ${name} ${region} d${d}`;
      sayRun(label, r);
      ex(r.rate, label).toBeGreaterThanOrEqual(0.85);
      ex(r.hpLoss, label).toBeGreaterThanOrEqual(0.1);
      ex(r.hpLoss, label).toBeLessThanOrEqual(0.45);
      sayRun(`${label} all live (report)`, allLive(() => expected(d, region, encounterTable(region, d), 8, odd(name))));
    }
  }, 900_000);

  it('22f lopsided lineups against the bosses with calls, parts, forget, TP thieves, stalls and swallows', () => {
    const CODES = (d: EnemyDef) => [...d.skills, ...(d.stages ?? []).flatMap((s) => s.skills)].flatMap((k) => k.effects)
      .some((e) => e.kind === 'summon' || e.kind === 'delay' || e.kind === 'engulf' || (e.kind === 'inflict' && e.status === 'forget') || (e.kind === 'damage' && !!e.tpDrain)) || !!d.parts;
    const first = new Map<string, { region: RegionId; depth: number; group: string[] }>();
    for (const c of bossCells()) if (!first.has(bossOf(c.group)) && CODES(ENEMIES[bossOf(c.group)])) first.set(bossOf(c.group), c);
    for (const c of first.values()) for (const name of Object.keys(ODD_LINEUPS) as (keyof typeof ODD_LINEUPS)[]) {
      const boss = allLive(() => bossRate(c.group, c.depth, c.region, 10, odd(name)));
      const eater = bossRate(['lanterneater'], c.depth, c.region, 10, odd(name));
      const label = `22f ${bossOf(c.group)} ${c.region} d${c.depth} ${name}`;
      sayRun(label, boss);
      sayRun(`${label} lanterneater`, eater);
      ex(boss.rate, label).toBeGreaterThanOrEqual(eater.rate - 0.1);
    }
  }, 900_000);

  it('22g treasure foes: how often the expected party fells one before it runs (report only)', () => {
    for (const [id, d] of [['hoarder', 4], ['hoarder', 9], ['gilded-hoarder', 25], ['gilded-hoarder', 30]] as const) allLive(() => {
      let felled = 0;
      const n = 30;
      for (let seed = 1; seed <= n; seed++) {
        const party = kitParty(levelAt(d), d, seed, undefined, expectedEnhance(d), EXPECT);
        const rng = mulberry32(seed * 7919);
        let s = createBattle({ party, enemyIds: [id], inventory: {}, revealed: {}, scale: { depth: d, region: 'mainline' } });
        for (let k = 0; k < 60 && s.outcome === 'ongoing'; k++) s = resolveRound(s, choose(s, party), rng);
        if (s.enemies.some((e) => !e.alive && !e.left)) felled++;
      }
      say(`22g ${id} mainline d${d} felled=${f3(felled / n)} (proposed 0.50-0.70)`);
    });
  }, 300_000);

  /** 22h's six strongest own uniques: a slot each, the one whose fixed keys strike hardest (fixed order on ties). */
  const STRIKE: AnyStat[] = ['atk', 'mag', 'str', 'int', 'agi', 'crit', 'critDmg', 'multi', 'fireDmg', 'iceDmg', 'thunderDmg', 'eliteDmg', 'vuln'];
  const CEILING_SLOTS: Slot[] = ['weapon', 'hands', 'head', 'neck', 'ring1', 'feet'];
  const ceilingParty = (d: number, seed: number): Party => {
    const p = kitParty(levelAt(d), d, seed, 'rare', ENHANCE_MAX);
    const owned = Object.values(SPECIALS).filter((sp) => sp.owner);
    let uid = 9000;
    for (const id of Object.keys(p.roster) as CharacterId[]) {
      const m = { ...p.roster[id], equip: { ...p.roster[id].equip } };
      for (const s of CEILING_SLOTS) {
        const slot = s === 'ring1' ? 'ring' : s;
        const best = owned.filter((sp) => sp.slot === slot).sort((a, b) => (b.fixed ?? []).filter((k) => STRIKE.includes(k)).length - (a.fixed ?? []).filter((k) => STRIKE.includes(k)).length)[0];
        if (!best) continue;
        const it = rollItem(mulberry32(uid), { uid: uid++, ilvl: m.equip[s]!.ilvl, rarity: best.rarity, special: best.id });
        m.equip[s] = { ...it, affixes: it.affixes.map((a) => ({ ...a })), enhance: ENHANCE_MAX };
      }
      const st = statsOf(m);
      p.roster[id] = { ...m, hp: st.hp, tp: st.tp };
    }
    return p;
  };
  it('22h the own-unique ceiling: no boss falls in one round, no table loses under 10%', () => {
    expect(SLOTS).toContain('ring1');
    for (const d of [10, 20]) allLive(() => {
      for (const group of [['lanterneater'], bossFor('mainline', d)]) {
        let rounds = 0;
        for (let seed = 1; seed <= 10; seed++) {
          const r = bossFight(ceilingParty(d, seed), group, seed, d, 'mainline');
          ex(r.rounds, `22h ${bossOf(group)} d${d} seed ${seed}`).toBeGreaterThanOrEqual(2);
          rounds += r.rounds;
        }
        sayRun(`22h ${bossOf(group)} d${d} ceiling`, { rounds: rounds / 10 });
      }
      let loss = 0, n = 0;
      for (const g of encounterTable('mainline', d)) for (let seed = 1; seed <= 4; seed++) {
        loss += simBattle(ceilingParty(d, seed), g, false, seed * 7919, { depth: d, region: 'mainline' }).hpLoss;
        n++;
      }
      sayRun(`22h mainline table d${d} ceiling`, { hpLoss: loss / n });
      // The same kit without the uniques (report): what the rare +ENHANCE_MAX kit alone leaves of the table.
      let plain = 0;
      for (const g of encounterTable('mainline', d)) for (let seed = 1; seed <= 4; seed++) {
        plain += simBattle(kitParty(levelAt(d), d, seed, 'rare', ENHANCE_MAX), g, false, seed * 7919, { depth: d, region: 'mainline' }).hpLoss;
      }
      sayRun(`22h mainline table d${d} rare +${ENHANCE_MAX} without uniques (report)`, { hpLoss: plain / n });
      ex(loss / n, `22h table d${d}`).toBeGreaterThanOrEqual(0.1);
    });
  }, 600_000);

  it('22i wardens: each at its first two depths wins >= .6, and a rare kit never fells one in under two rounds', () => {
    const cells: { id: string; region: RegionId; depth: number }[] = [];
    allLive(() => {
      for (const region of ['mainline', ...LANDS] as RegionId[]) for (let depth = 8; depth <= 60; depth += 5) {
        const id = wardenFor(region, depth);
        if (id && cells.filter((c) => c.id === id && c.region === region).length < 2) cells.push({ id, region, depth });
      }
    });
    expect(new Set(cells.map((c) => c.id)).size).toBe(11);
    for (const c of cells) allLive(() => {
      const group = wardenGroup(c.id);
      const scale = { depth: c.depth, region: c.region, elite: group[0] };
      let wins = 0;
      for (let kit = 1; kit <= KITS; kit++) for (let seed = 1; seed <= 6; seed++) {
        const r = simBattle(kitParty(levelAt(c.depth), c.depth, kit, undefined, expectedEnhance(c.depth), EXPECT), group, false, seed * 7919, scale);
        if (r.outcome === 'win') wins++;
      }
      const rate = wins / (KITS * 6);
      let rounds = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const r = simBattle(kitParty(levelAt(c.depth), c.depth, seed, 'rare', ENHANCE_MAX), group, false, seed * 7919, scale);
        ex(r.rounds, `22i ${c.id} d${c.depth} seed ${seed} +${ENHANCE_MAX}`).toBeGreaterThanOrEqual(2);
        rounds += r.rounds;
      }
      const label = `22i ${c.id} ${c.region} d${c.depth}`;
      sayRun(label, { rate, rounds: rounds / 6 });
      ex(rate, label).toBeGreaterThanOrEqual(0.6);
    });
  }, 900_000);
});
