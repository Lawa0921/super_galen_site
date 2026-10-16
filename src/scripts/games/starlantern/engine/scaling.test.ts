import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '../data/conditions';
import { ENEMIES } from '../data/enemies';
import { FLOORS } from '../data/floors';
import { REGIONS, type RegionId } from '../data/regions';
import { createBattle, intentLabel, planEnemies, rewards } from './battle';
import { newParty } from './party';
import { mulberry32 } from './rng';
import { NORMAL_ENEMIES, REGION_DROP_CHANCE, depthLevel, encounterGroup, scaleEnemy } from './scaling';
import { constRng } from './testing';

const MAIN = REGIONS.mainline;
const wolf = ENEMIES.wolf;

describe('depthLevel', () => {
  it('is 2 + 4 x (depth - 1)', () => {
    expect([1, 2, 3, 4, 10].map(depthLevel)).toEqual([2, 6, 10, 14, 38]);
  });
});

describe('scaleEnemy', () => {
  it('depth 1 mainline enemies are unchanged', () => {
    for (const def of Object.values(ENEMIES)) {
      const { sec, ...rest } = scaleEnemy(def, 1, MAIN, false);
      expect(rest, def.id).toEqual(def);
      expect(Object.values(sec ?? { missing: 1 }).every((v) => v === 0), `${def.id} sec`).toBe(true);
    }
    const plain = createBattle({ party: newParty(), enemyIds: ['slime', 'slime', 'wolf'], inventory: {}, revealed: {} });
    const scaled = createBattle({ party: newParty(), enemyIds: ['slime', 'slime', 'wolf'], inventory: {}, revealed: {}, scale: { depth: 1, region: 'mainline' } });
    expect(scaled.enemies).toEqual(plain.enemies);
  });

  it('the first mainline cycle keeps every monster at home strength and reward', () => {
    for (const d of [1, 2, 3]) for (const g of FLOORS[d - 1].encounters) for (const id of g) {
      const e = scaleEnemy(ENEMIES[id], d, MAIN, false);
      expect([e.stats, e.exp, e.gold], `${id} at ${d}`).toEqual([ENEMIES[id].stats, ENEMIES[id].exp, ENEMIES[id].gold]);
    }
  });

  it('a regional monster can also drop its region material; a mainline one cannot', () => {
    const frost = scaleEnemy(wolf, 1, REGIONS.frost, false);
    expect(frost.drops).toEqual([...wolf.drops, { mat: 'frost-heart', chance: REGION_DROP_CHANCE }]);
    expect(REGION_DROP_CHANCE).toBeGreaterThanOrEqual(0.1);
    expect(REGION_DROP_CHANCE).toBeLessThanOrEqual(0.2);
    expect(scaleEnemy(wolf, 4, MAIN, false).drops).toEqual(wolf.drops);
  });

  it('does not change the definition it was given', () => {
    const before = structuredClone(wolf);
    scaleEnemy(wolf, 9, REGIONS.blaze, true);
    expect(wolf).toEqual(before);
  });

  it('deeper is stronger, monotonic, and stays finite at depth 50', () => {
    for (const id of [...NORMAL_ENEMIES, 'lanterneater']) {
      let prev = scaleEnemy(ENEMIES[id], 1, REGIONS.storm, false);
      for (let d = 2; d <= 50; d++) {
        const cur = scaleEnemy(ENEMIES[id], d, REGIONS.storm, false);
        for (const k of ['hp', 'atk', 'def', 'mag', 'res'] as const) expect(cur.stats[k], `${id} ${k} at ${d}`).toBeGreaterThanOrEqual(prev.stats[k]);
        expect(cur.exp, `${id} exp at ${d}`).toBeGreaterThanOrEqual(prev.exp);
        if (d >= 4) expect(cur.stats.hp, `${id} hp at ${d}`).toBeGreaterThan(prev.stats.hp);
        prev = cur;
      }
      expect(Number.isFinite(prev.stats.hp)).toBe(true);
      expect(prev.stats.hp).toBeLessThan(1e7);
      expect(Number.isInteger(prev.stats.hp) && Number.isInteger(prev.exp) && Number.isInteger(prev.gold)).toBe(true);
    }
  });

  it('deep enemies are named 深層 from depth 4', () => {
    expect(scaleEnemy(wolf, 3, MAIN, false).name).toBe('荊棘狼');
    expect(scaleEnemy(wolf, 4, MAIN, false).name).toBe('深層・荊棘狼');
    expect(scaleEnemy(wolf, 4, REGIONS.blaze, false).name).toBe('深層・熾焰・荊棘狼');
  });

  it('a blaze wolf resists fire, is weak to ice, and knows 烈焰吐息', () => {
    const w = scaleEnemy(wolf, 1, REGIONS.blaze, false);
    expect(w.name).toBe('熾焰・荊棘狼');
    expect([w.resist, w.weak]).toEqual([['fire'], ['ice']]);
    expect(w.skills.map((s) => s.name)).toEqual(['咆哮', '烈焰吐息']);
  });

  it('each region prefixes its name', () => {
    const names = (['blaze', 'frost', 'storm', 'mire', 'shade', 'iron'] as RegionId[]).map((r) => scaleEnemy(ENEMIES.lanterneater, 5, REGIONS[r], false).name);
    expect(names).toEqual(['深層・熾焰・燈喰之獸', '深層・霜凍・燈喰之獸', '深層・雷鳴・燈喰之獸', '深層・腐毒・燈喰之獸', '深層・暗影・燈喰之獸', '深層・鋼鐵・燈喰之獸']);
  });

  it('a depth 10 wolf has crit 9 and compensated hp', () => {
    // scaleEnemy(wolf, 10, mainline) before enemy secondaries: hp 718, atk 218, mag 50 (level 38, home 2: 36 over).
    const w = scaleEnemy(wolf, 10, MAIN, false);
    expect(w.sec).toMatchObject({ crit: 9, evasion: 7.2, fireRes: 18, iceRes: 18, thunderRes: 18 });
    expect(w.stats.hp).toBe(Math.round(718 * (1 - 0.072) * (1 - 0.3 * 0.18)));
    expect(w.stats.atk).toBe(Math.round(218 / (1 + 0.09 * 0.5)));
    expect(w.stats.mag).toBe(Math.round(50 / (1 + 0.09 * 0.5)));
  });

  it('shade monsters gain evasion and crit instead of the old speed stand-in', () => {
    const w = scaleEnemy(wolf, 1, REGIONS.shade, false);
    const base = wolf.stats;
    expect(w.stats.spd).toBe(base.spd);
    expect(w.sec).toMatchObject({ crit: 5, evasion: 5 });
    expect(w.stats.hp).toBe(Math.round(base.hp * 0.95));
    expect(w.stats.atk).toBe(Math.round(base.atk / 1.025));
    // other regions gain nothing at home depth
    expect(Object.values(scaleEnemy(wolf, 1, REGIONS.storm, false).sec!).every((v) => v === 0)).toBe(true);
  });

  it('region traits shape the stats: mire tough, storm fast, iron armoured but slower to hurt', () => {
    const at = (r: RegionId) => scaleEnemy(wolf, 1, REGIONS[r], false).stats;
    const base = wolf.stats;
    expect(at('mire').hp).toBe(Math.round(base.hp * 1.3));
    expect(at('storm').spd).toBe(Math.round(base.spd * 1.3));
    expect([at('iron').def, at('iron').atk]).toEqual([Math.round(base.def * 1.4), Math.round(base.atk * 0.9)]);
    expect(at('blaze')).toEqual(base);
    expect(at('frost')).toEqual(base);
  });

  it('an elite is marked and gives triple exp', () => {
    const e = scaleEnemy(wolf, 1, MAIN, true);
    expect(e.name).toBe('★荊棘狼');
    expect([e.exp, e.gold]).toEqual([wolf.exp * 3, wolf.gold * 3]);
    expect([e.stats.hp, e.stats.atk]).toEqual([Math.round(wolf.stats.hp * 2.2), Math.round(wolf.stats.atk * 1.3)]);
    expect(scaleEnemy(wolf, 4, REGIONS.blaze, true).name).toBe('★深層・熾焰・荊棘狼');
  });

  it('rewards rise with depth', () => {
    expect(scaleEnemy(wolf, 4, MAIN, false).exp).toBeGreaterThan(wolf.exp);
    expect(scaleEnemy(wolf, 10, MAIN, false).gold).toBeGreaterThan(scaleEnemy(wolf, 4, MAIN, false).gold);
  });

  it('grows a monster from its home level: unchanged at or above home, lifted below it', () => {
    const golem = ENEMIES.golem;
    for (const d of [1, 2, 3]) expect(scaleEnemy(golem, d, MAIN, false).stats, `golem at ${d}`).toEqual(golem.stats);
    const slime3 = scaleEnemy(ENEMIES.slime, 3, REGIONS.frost, false);
    expect(slime3.stats.hp).toBeGreaterThan(ENEMIES.slime.stats.hp * 2);
    expect(slime3.exp).toBeGreaterThan(ENEMIES.slime.exp);
    // the same depth lifts a shallow monster more than a deep one
    const lift = (id: string) => scaleEnemy(ENEMIES[id], 6, MAIN, false).stats.atk / ENEMIES[id].stats.atk;
    expect(lift('slime')).toBeGreaterThan(lift('golem'));
  });

  it('run conditions: 兇暴 hits 20% harder and gives 30% more exp, 星落 gives 50% more gold, 平穩 changes nothing', () => {
    for (const d of [1, 6]) {
      const plain = scaleEnemy(wolf, d, REGIONS.blaze, false);
      expect(scaleEnemy(wolf, d, REGIONS.blaze, false, CONDITIONS.plain)).toEqual(plain);
      const fierce = scaleEnemy(wolf, d, REGIONS.blaze, false, CONDITIONS.fierce);
      expect([fierce.stats.atk, fierce.stats.mag, fierce.stats.hp]).toEqual([Math.round(plain.stats.atk * 1.2), Math.round(plain.stats.mag * 1.2), plain.stats.hp]);
      expect(fierce.gold).toBe(plain.gold);
      expect(Math.abs(fierce.exp - plain.exp * 1.3), `exp at ${d}`).toBeLessThanOrEqual(1);   // rounded once, from the unrounded value
      const star = scaleEnemy(wolf, d, REGIONS.blaze, false, CONDITIONS.starfall);
      expect([star.exp, star.stats]).toEqual([plain.exp, plain.stats]);
      expect(Math.abs(star.gold - plain.gold * 1.5), `gold at ${d}`).toBeLessThanOrEqual(1);
    }
  });
});

describe('createBattle with scale', () => {
  const battle = (enemyIds: string[], scale: Parameters<typeof createBattle>[0]['scale']) =>
    createBattle({ party: newParty(), enemyIds, inventory: {}, revealed: {}, scale });

  it('regional variants carry the scaled numbers, the region element as tint, and letters on duplicates', () => {
    const s = battle(['wolf', 'wolf'], { depth: 6, region: 'blaze' });
    const w = scaleEnemy(wolf, 6, REGIONS.blaze, false);
    expect(s.enemies.map((e) => e.name)).toEqual([`${w.name} A`, `${w.name} B`]);
    expect(s.enemies[0].max).toEqual(w.stats);
    expect([s.enemies[0].hp, s.enemies[0].resist, s.enemies[0].weak, s.enemies[0].tint]).toEqual([w.stats.hp, ['fire'], ['ice'], 'fire']);
  });

  it('carries the run condition into the fight', () => {
    const s = battle(['wolf'], { depth: 1, region: 'mainline', condition: 'fierce' });
    expect(s.enemies[0].max.atk).toBe(Math.round(wolf.stats.atk * 1.2));
    for (const e of s.enemies) { e.alive = false; e.hp = 0; }
    expect(rewards(s, constRng(0.99), false).exp).toBe(Math.round(wolf.exp * 1.3));
  });

  it('element-less regions tint phys; mainline enemies are not tinted', () => {
    for (const r of ['mire', 'shade', 'iron'] as RegionId[]) expect(battle(['bat'], { depth: 1, region: r }).enemies[0].tint).toBe('phys');
    expect(battle(['bat'], { depth: 7, region: 'mainline' }).enemies[0].tint).toBeUndefined();
  });

  it('the elite is the first enemy of the given id: starred, tinted elite, worth triple', () => {
    const s = battle(['bat', 'wolf', 'wolf'], { depth: 1, region: 'mainline', elite: 'wolf' });
    expect(s.enemies.map((e) => [e.name, e.tint ?? null])).toEqual([['遺跡蝙蝠', null], ['★荊棘狼 A', 'elite'], ['荊棘狼 B', null]]);
    for (const e of s.enemies) { e.alive = false; e.hp = 0; }
    expect(rewards(s, constRng(0.99), false)).toMatchObject({ exp: ENEMIES.bat.exp + wolf.exp * 3 + wolf.exp, gold: ENEMIES.bat.gold + wolf.gold * 3 + wolf.gold });
  });

  it('a regional enemy announces and uses its regional skill', () => {
    const s = battle(['wolf'], { depth: 1, region: 'blaze' });
    planEnemies(s, constRng(0.25));   // 咆哮 (0.2) misses, 烈焰吐息 (0.3) is chosen
    expect(s.intents!.e0).toMatchObject({ kind: 'enemy-skill', index: 1 });
    expect(intentLabel(s, 'e0')).toMatch(/^烈焰吐息（整排）/);
  });
});

describe('encounterGroup', () => {
  it('the mainline draws from the terrain table of the depth', () => {
    const rng = mulberry32(5);
    for (const d of [1, 2, 3, 4, 8]) {
      const table = FLOORS[((d - 1) % 3)].encounters.map((g) => g.join('+'));
      for (let i = 0; i < 30; i++) expect(table).toContain(encounterGroup('mainline', d, rng).join('+'));
    }
  });

  it('random regions draw 1-3 of every ordinary monster, never the boss, the same for the same seed', () => {
    const seen = new Set<string>();
    const sizes = new Set<number>();
    const rng = mulberry32(11);
    for (let i = 0; i < 400; i++) {
      const g = encounterGroup('frost', 6, rng);
      sizes.add(g.length);
      for (const id of g) { expect(NORMAL_ENEMIES).toContain(id); seen.add(id); }
    }
    expect([...sizes].sort()).toEqual([1, 2, 3]);
    expect([...seen].sort()).toEqual([...NORMAL_ENEMIES].sort());
    expect(NORMAL_ENEMIES).toHaveLength(8);   // the spec says nine, counting the boss; the boss is not a random foe
    const a = mulberry32(3), b = mulberry32(3);
    for (let i = 0; i < 20; i++) expect(encounterGroup('iron', 4, a)).toEqual(encounterGroup('iron', 4, b));
  });

  it('a random region does not send third-floor monsters at a depth-1 party', () => {
    const rng = mulberry32(17);
    for (let i = 0; i < 200; i++) {
      for (const id of encounterGroup('blaze', 1, rng)) expect(ENEMIES[id].floor, id).toBe(1);
      for (const id of encounterGroup('blaze', 2, rng)) expect(ENEMIES[id].floor, id).toBeLessThanOrEqual(2);
    }
  });
});
