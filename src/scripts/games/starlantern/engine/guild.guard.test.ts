import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guild quests plan Task A3 (spec §9.2): the board's rules draw only from the board's own stream, and only one place in
 * them builds it. Read as text, as engine/runeEconomy.guard.test.ts reads its files.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string) => readFileSync(join(HERE, rel), 'utf8');

describe('guild board guards (guild quests plan Task A3)', () => {
  it('only the board stream draws', () => {
    const text = source('guild.ts');
    for (const name of ['this.rng', 'game.rng', 'lootRng', 'memoryRng', 'trophyRng', 'runeRng', 'spotRuneRng', 'forgeRng', 'absorbRng', 'affixRng', 'Math.random', 'Date']) {
      expect(text.includes(name), `engine/guild.ts names ${name}`).toBe(false);
    }
  });

  it('one stream, built in guildRng', () => {
    const text = source('guild.ts');
    const calls = [...text.matchAll(/mulberry32\(/g)];
    expect(calls).toHaveLength(1);
    const at = calls[0].index!;
    const fn = text.lastIndexOf('export function guildRng(', at);
    expect(fn, 'mulberry32 inside guildRng').toBeGreaterThan(0);
    const body = text.slice(fn, text.indexOf('\n}\n', fn));
    expect(fn + body.length, 'still inside its body').toBeGreaterThan(at);
    expect(body).toContain('mulberry32(mix(s.forgeSalt ^ GUILD_SALT, day))');
  });
});
