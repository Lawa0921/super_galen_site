import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Gathering plan Task A3 (spec §5.5, §11 item 7): gathering draws nothing, and the points draw only from the stream the
 * caller hands them. Read as text, as engine/guild.guard.test.ts reads its files.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string) => readFileSync(join(HERE, rel), 'utf8');

/** Every stream of the game, by the name that builds or holds it. */
const STREAMS = ['this.rng', 'lootRng', 'memoryRng', 'trophyRng', 'runeRng', 'spotRuneRng', 'forgeRng', 'absorbRng', 'affixRng', 'mulberry32(', 'Math.random', 'Date'];

describe('gathering guards (gathering plan Task A3)', () => {
  it('the gathering rules draw nothing', () => {
    // Task A4 adds the forge's tools
    for (const file of ['gather.ts', 'forge/gatherTools.ts']) {
      const text = source(file);
      for (const name of STREAMS) expect(text.includes(name), `engine/${file} names ${name}`).toBe(false);
    }
  });

  it('the points draw only from the stream handed to them', () => {
    const text = source('dungeon/gather.ts');
    for (const name of ['mulberry32(', 'Math.random', 'Date']) expect(text.includes(name), `engine/dungeon/gather.ts names ${name}`).toBe(false);
    // the one stream: built once, in floorOf's last line
    const run = source('dungeon/run.ts');
    expect(run.match(/GATHER_SALT/g)).toHaveLength(2);   // its import and its one use
    expect(run).toContain('if (run.gather) placeGather(f, g, mulberry32(seed ^ GATHER_SALT), run.region, depth);');
    expect(run.match(/mulberry32\(seed \^ GATHER_SALT\)/g)).toHaveLength(1);
  });
});
