import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AFFIX_IDS } from '../data/affixes';
import { createBattle } from './battle';
import { mix } from './loot/drops';
import { mulberry32 } from './rng';
import { partyAt } from './sim';
import { AFFIX_SALT, affixRng, rollAffixes, rollCrowdAffix } from './tiers';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Every non-test .ts file under engine/ and data/, as text. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__fixtures__' ? [] : sources(p);
    return /\.ts$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
  });
}

describe('affixes are drawn by the spot (difficulty plan Task 3)', () => {
  it('affixes are keyed by the spot', () => {
    const at = { x: 4, y: 7 };
    const a = rollAffixes(1234, 10, 1, at);
    expect(a).toEqual(['swift']);
    expect(AFFIX_IDS).toContain(a[0]);
    // The same seed, depth and spot: the same, however often asked.
    for (let i = 0; i < 5; i++) expect(rollAffixes(1234, 10, 1, at)).toEqual(a);
    expect(rollAffixes(1234, 10, 2, at)[0]).toBe(a[0]);
    // The stream is mix(mix(mix(seed ^ AFFIX_SALT, depth), x), y), like a spot's rune; the boss's mix(seed ^ AFFIX_SALT, depth).
    expect(affixRng(1234, 10, at)()).toBe(mulberry32(mix(mix(mix(1234 ^ AFFIX_SALT, 10), 4), 7))());
    expect(affixRng(1234, 10)()).toBe(mulberry32(mix(1234 ^ AFFIX_SALT, 10))());
    // Another spot, another depth, another seed: written down from the seed.
    expect([rollAffixes(1234, 10, 1, { x: 5, y: 7 }), rollAffixes(1234, 11, 1, at), rollAffixes(99, 10, 1, at)]).toEqual(OTHER_SPOTS);
    for (const o of OTHER_SPOTS) expect(o).not.toEqual(a);
    // The boss reads the depth alone.
    expect(rollAffixes(1234, 10, 2)).toEqual(rollAffixes(1234, 10, 2));
    // Two are always two different ones; none is none.
    for (let seed = 0; seed < 200; seed++) {
      const two = rollAffixes(seed, 25, 2, { x: seed % 9, y: seed % 7 });
      expect(two).toHaveLength(2);
      expect(new Set(two).size).toBe(2);
    }
    expect(rollAffixes(1234, 10, 0, at)).toEqual([]);
  });

  it('rollAffixes has no counter', () => {
    // An elite at a spot: its affixes, then a fight (the battle draws from its own rng), then the same spot again. The
    // game flow (flee, step back on; save and reload) is difficulty plan Task 6a's test.
    const at = { x: 3, y: 2 };
    const first = rollAffixes(777, 12, 2, at);
    const party = partyAt(42, {}, 12);
    const fight = () => createBattle({ party, enemyIds: ['wolf', 'bat'], inventory: {}, revealed: {}, scale: { depth: 12, region: 'mainline', elite: 'wolf', difficulty: 'hell', affixes: rollAffixes(777, 12, 2, at) } });
    const a = fight();
    // Other streams draw in between (the run's rng, loot): nothing moves the spot's draw, which has no counter.
    const other = mulberry32(777);
    for (let i = 0; i < 50; i++) other();
    const again = rollAffixes(777, 12, 2, at);
    expect(again).toEqual(first);
    expect(fight().enemies.map((e) => e.affixes)).toEqual(a.enemies.map((e) => e.affixes));
    expect(a.enemies[0].affixes).toEqual(first);
  });

  it('an excluded pair never meets (controller ruling 2026-10-23)', () => {
    const ex = [['tough', 'swift']] as const;
    let met = 0;
    for (let seed = 0; seed < 300; seed++) {
      const at = { x: seed % 9, y: seed % 7 };
      const two = rollAffixes(seed, 25, 2, at, ex);
      expect(two).toHaveLength(2);
      expect(two.includes('tough') && two.includes('swift'), `${seed}`).toBe(false);
      // The first affix is the same draw; nothing is excluded by default, as before.
      expect(two[0]).toBe(rollAffixes(seed, 25, 2, at)[0]);
      expect(rollAffixes(seed, 25, 2, at, [])).toEqual(rollAffixes(seed, 25, 2, at));
      const plain = rollAffixes(seed, 25, 2, at);
      if (plain.includes('tough') && plain.includes('swift')) met++;
    }
    expect(met).toBeGreaterThan(0);
  });

  it('the salt is unused', () => {
    const hex = `0x${AFFIX_SALT.toString(16)}`;
    expect(hex).toBe('0xbb67ae85');
    const users = [...sources(HERE), ...sources(join(HERE, '..', 'data'))].filter((p) => readFileSync(p, 'utf8').toLowerCase().includes(hex));
    expect(users.map((p) => p.split(sep).join('/').split('/starlantern/')[1])).toEqual(['engine/tiers.ts']);
  });
});

describe('a Hell crowd may wear one affix (controller ruling 2026-10-23)', () => {
  it('a crowd affix is keyed by the spot', () => {
    const at = { x: 4, y: 7 };
    const a = rollCrowdAffix(1234, 20, at, 1)!;
    expect(a).toBeDefined();
    expect(AFFIX_IDS).toContain(a.id);
    expect(a.pick).toBeGreaterThanOrEqual(0);
    expect(a.pick).toBeLessThan(1);
    // The affix stream of the spot (as an elite's): the chance, then the pick, then the affix.
    const r = affixRng(1234, 20, at);
    r();
    expect(a.pick).toBe(r());
    expect(a.id).toBe(AFFIX_IDS[Math.floor(r() * AFFIX_IDS.length)]);
    for (let i = 0; i < 5; i++) expect(rollCrowdAffix(1234, 20, at, 1)).toEqual(a);
    // No chance, no affix; the same spot keeps its draw at any chance it clears.
    expect(rollCrowdAffix(1234, 20, at, 0)).toBeUndefined();
    let n = 0;
    for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) {
      const c = rollCrowdAffix(55, 25, { x, y }, 0.5);
      if (c) { n++; expect(rollCrowdAffix(55, 25, { x, y }, 0.9)).toEqual(c); }
    }
    expect(n).toBeGreaterThan(160);
    expect(n).toBeLessThan(240);
  });

  it('a crowd affix has no counter: fleeing and coming back meets it again', () => {
    // The game flow (flee, step back on; save and reload) is difficulty plan Task 6a's test (its pending note).
    const at = { x: 6, y: 1 };
    const first = rollCrowdAffix(777, 22, at, 0.5);
    const party = partyAt(50, {}, 22);
    const fight = () => createBattle({ party, enemyIds: ['wolf', 'bat', 'bat'], inventory: {}, revealed: {}, scale: { depth: 22, region: 'mainline', difficulty: 'hell', crowdAffix: rollCrowdAffix(777, 22, at, 1) } });
    const a = fight();
    const other = mulberry32(777);
    for (let i = 0; i < 50; i++) other();
    expect(rollCrowdAffix(777, 22, at, 0.5)).toEqual(first);
    expect(fight().enemies.map((e) => e.affixes)).toEqual(a.enemies.map((e) => e.affixes));
  });

  it('a crowd affix goes on the picked foe on Hell only; Normal and Nightmare apply nothing', () => {
    const party = partyAt(50, {}, 20);
    const crowdAffix = { pick: 0.6, id: 'tough' as const };
    const fight = (difficulty?: 'normal' | 'nightmare' | 'hell', more: object = {}, boss = false, ids = ['wolf', 'bat']) =>
      createBattle({ party, enemyIds: ids, boss, inventory: {}, revealed: {}, scale: { depth: 20, region: 'mainline', ...(difficulty ? { difficulty } : {}), ...more } });
    // Hell: floor(0.6 x 2) = the second foe, tougher than without it; the first untouched.
    const hell = fight('hell', { crowdAffix });
    const plain = fight('hell');
    expect(hell.enemies.map((e) => e.affixes)).toEqual([undefined, ['tough']]);
    expect(hell.enemies[1].max.hp).toBeGreaterThan(plain.enemies[1].max.hp);
    expect(hell.enemies[0]).toEqual(plain.enemies[0]);
    // Normal, no difficulty and Nightmare: the very fight without it.
    for (const d of [undefined, 'normal', 'nightmare'] as const) {
      expect(JSON.stringify(fight(d, { crowdAffix })), String(d)).toBe(JSON.stringify(fight(d)));
    }
    // Not on an elite's fight, nor on a boss fight.
    expect(fight('hell', { crowdAffix, elite: 'wolf', affixes: ['swift', 'rend'] }).enemies.map((e) => e.affixes)).toEqual([['swift', 'rend'], undefined]);
    expect(fight('hell', { crowdAffix }, true, ['lanterneater']).enemies.map((e) => e.affixes)).toEqual([undefined]);
  });
});

/** rollAffixes(1234, 10, 1) at (5, 7), at depth 11 at (4, 7), and with seed 99 at (4, 7): written down from the first run. */
const OTHER_SPOTS: string[][] = [['frostbind'], ['rend'], ['thunder']];
