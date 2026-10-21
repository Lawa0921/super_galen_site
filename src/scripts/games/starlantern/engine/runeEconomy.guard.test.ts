import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RUNE_DROP } from '../data/runeEconomy';
import type { RuneRef } from '../data/runes';
import { Game } from './game';
import { DELTA, tileAt, type Dir } from './map';
import { LEGACY_LINEUP, STANDARD_LINEUP } from './party';
import { mulberry32 } from './rng';
import { buyRune, fuseRunes, sellRunes } from './runeTrade';
import { newGame, type GameState } from './state';
import type { Pos } from './types';

/**
 * Plan 8f Task 6: the rune economy stays out of the balance sim, draws only from its own stream, repeats itself on the
 * same seed, and pays no money loop.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string) => readFileSync(join(HERE, rel), 'utf8');
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

describe('rune economy guards (plan 8f Task 6)', () => {
  it('the sim never meets a rune drop', () => {
    const files = ['sim.ts', 'parity.ts', ...readdirSync(HERE).filter((f) => /^balance.*\.test\.ts$/.test(f))];
    expect(files.length).toBeGreaterThan(4);
    for (const f of files) {
      const text = source(f);
      for (const name of ['runeRng', 'spotRuneRng', 'rollRune', 'grantRune', 'runesOpen']) expect(text.includes(name), `${f} names ${name}`).toBe(false);
    }
  });

  it('only the rune stream draws for runes', () => {
    for (const f of ['loot/runes.ts', 'runeTrade.ts']) {
      const text = source(f);
      for (const name of ['lootRng', 'memoryRng', 'game.rng', 'this.rng', 'Math.random', 'forgeRng']) expect(text.includes(name), `${f} names ${name}`).toBe(false);
    }
    // Every rollRune call in the game rolls on a variable that the same method built from runeRng or spotRuneRng.
    const game = source('game.ts');
    const calls = [...game.matchAll(/rollRune\((\w+),/g)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) {
      const before = game.slice(0, c.index);
      const method = before.lastIndexOf('\n  private ');
      expect(method, 'rollRune inside a private method').toBeGreaterThan(0);
      const body = before.slice(method);
      expect(body, `rollRune(${c[1]}, …) at ${c.index}`).toMatch(new RegExp(`const ${c[1]} = (runeRng|spotRuneRng)\\(`));
    }
    expect(game).not.toMatch(/rollRune\((this\.rng|lootRng|memoryRng)/);
  });

  it('a long run is the same run twice', () => {
    const saved = { ...RUNE_DROP };
    Object.assign(RUNE_DROP, { monster: 0.5, chest: 1, vault: 1, elite: 1 });
    try {
      const play = () => {
        const g = new Game(mulberry32(2026), null, undefined, 0, LEGACY_LINEUP);
        g.state.dungeon.reached.iron = 5;
        g.state.runesOpen = true;
        expect(g.depart({ region: 'iron', condition: 'plain' }, 5)).toEqual({ ok: true });
        const kill = () => { for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; } return g.submitRound({})!.end!; };
        const found: (RuneRef[] | undefined)[] = [];
        for (let fights = 0, tries = 0; fights < 10 && tries < 40; tries++) {
          g.encounter = 99;
          const dir = DIRS[tries % 4];
          if (g.move(dir).kind === 'battle') { found.push(kill().runes); fights++; }
          if (g.phase !== 'map') break;
        }
        // Two chests beside the party, then the boss.
        for (let n = 0; n < 2; n++) {
          const at = DIRS.map((d) => ({ d, p: { x: g.pos.x + DELTA[d].x, y: g.pos.y + DELTA[d].y } as Pos })).find(({ p }) => tileAt(g.map(), p) === 'floor')!;
          g.map().tiles[at.p.y][at.p.x] = 'chest';
          g.move(at.d);
        }
        const boss = g.map().boss!;
        const near = DIRS.map((d) => ({ d, p: { x: boss.x - DELTA[d].x, y: boss.y - DELTA[d].y } })).find(({ p }) => tileAt(g.map(), p) !== 'wall')!;
        g.pos = near.p;
        expect(g.move(near.d)).toEqual({ kind: 'boss' });
        found.push(kill().runes);
        return { found, runes: g.state.runes, gold: g.state.gold, draws: g.run!.runeDraws };
      };
      const a = play();
      const b = play();
      expect(a.found.length).toBeGreaterThanOrEqual(5);
      expect(Object.keys(a.runes ?? {}).length).toBeGreaterThan(0);
      expect(b).toEqual(a);
      expect(a.draws).toBe(a.found.length);
    } finally {
      Object.assign(RUNE_DROP, saved);
    }
  });

  it('the economy has no loop', () => {
    const spread: RuneRef = { id: 'spread', tier: 'common' };
    let s: GameState = { ...newGame(undefined, 0, STANDARD_LINEUP), gold: 1000, runesOpen: true };
    s = { ...s, inventory: { ...s.inventory, 'essence-common': 1 } };
    const start = s.gold;
    const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
    s = ok(buyRune(s, spread, 3)).state;
    s = ok(fuseRunes(s, spread)).state;
    s = ok(sellRunes(s, { id: 'spread', tier: 'magic' }, 1)).state;
    expect(s.runes).toEqual({});
    expect(s.gold).toBeLessThan(start);
    expect(s.gold).toBe(start - 300 - 30 + 60);
  });
});
