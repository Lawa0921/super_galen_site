import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AFFIX_IDS } from '../data/affixes';
import { createBattle } from './battle';
import { mix } from './loot/drops';
import { mulberry32 } from './rng';
import { partyAt } from './sim';
import { AFFIX_SALT, affixRng, rollAffixes } from './tiers';

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

  it('the salt is unused', () => {
    const hex = `0x${AFFIX_SALT.toString(16)}`;
    expect(hex).toBe('0xbb67ae85');
    const users = [...sources(HERE), ...sources(join(HERE, '..', 'data'))].filter((p) => readFileSync(p, 'utf8').toLowerCase().includes(hex));
    expect(users.map((p) => p.split(sep).join('/').split('/starlantern/')[1])).toEqual(['engine/tiers.ts']);
  });
});

/** rollAffixes(1234, 10, 1) at (5, 7), at depth 11 at (4, 7), and with seed 99 at (4, 7): written down from the first run. */
const OTHER_SPOTS: string[][] = [['frostbind'], ['rend'], ['thunder']];
