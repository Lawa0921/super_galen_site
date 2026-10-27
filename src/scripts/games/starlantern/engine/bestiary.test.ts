import { describe, expect, it, vi } from 'vitest';
import { ENEMIES } from '../data/enemies';
import { Game } from './game';
import { mulberry32, type Rng } from './rng';
import type { Portal } from './dungeon/run';
import type { CharacterId } from './types';
import { GEAR_CHANCE } from './loot/drops';
import { noteFelled, noteInscribed, noteSeen } from './bestiary';
import { withRosterLive } from './testing';

// Wrapped so a test can switch the bookkeeping off and compare the draws; it still records for real.
vi.mock('./bestiary', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./bestiary')>();
  return { ...mod, noteSeen: vi.fn(mod.noteSeen), noteFelled: vi.fn(mod.noteFelled), noteInscribed: vi.fn(mod.noteInscribed) };
});

const LINEUP: CharacterId[] = ['hero', 'chizuru', 'liz', 'noel', 'selene'];
const MAIN: Portal = { region: 'mainline', condition: 'plain' };

/** A game on depth 1 of `portal` (a fresh one on `seed`), in a fight against `ids`; `rng` counts game.rng's draws. */
function fight(ids: string[], seed = 1, portal: Portal = MAIN, g?: Game) {
  const counter = { n: 0 };
  const base = mulberry32(seed);
  const rng: Rng = () => { counter.n++; return base(); };
  const game = g ?? new Game(rng, null, undefined, 0, LINEUP);
  if (!g) {
    game.state.dungeon.reached[portal.region] = 5;
    expect(game.depart(portal, 1)).toEqual({ ok: true });
  }
  (game as unknown as { startBattle: (e: string[], b: boolean) => void }).startBattle(ids, false);
  return { g: game, counter };
}
const killAll = (g: Game) => { for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; } return g.submitRound({})!.end!; };
const defendAll = (g: Game) => Object.fromEntries(g.battle!.party.filter((c) => c.alive).map((c) => [c.key, { kind: 'defend' as const }]));

describe('the bestiary remembers what was seen and felled (roster plan Task C3)', () => {
  it('seen counts a species once a fight, regions alike', () => {
    const { g } = fight(['slime', 'slime', 'bat']);
    expect(g.state.bestiary).toEqual({ slime: { seen: 1, felled: 0 }, bat: { seen: 1, felled: 0 } });
    killAll(g);
    expect(g.state.bestiary).toEqual({ slime: { seen: 1, felled: 2 }, bat: { seen: 1, felled: 1 } });
    // The same kind met in a region (its tinted variant) is the same entry.
    const blaze = fight(['slime'], 2, { region: 'blaze', condition: 'plain' });
    blaze.g.state.bestiary = structuredClone(g.state.bestiary);
    (blaze.g as unknown as { startBattle: (e: string[], b: boolean) => void }).startBattle(['slime'], false);
    expect(blaze.g.battle!.enemies[0].defId).toBe('slime');
    expect(blaze.g.state.bestiary!.slime.seen).toBe(2);
  });

  it('a summon is seen, a decoy is not', () => {
    const was = ENEMIES.slime;
    try {
      (ENEMIES as Record<string, typeof was>).slime = { ...was, skills: [{ name: '呼喚', chance: 1, target: 'self', effects: [{ kind: 'summon', id: 'bat', max: 1 }] }] };
      const { g } = fight(['slime']);
      expect(g.state.bestiary).toEqual({ slime: { seen: 1, felled: 0 } });
      for (let i = 0; i < 4 && !g.battle!.enemies.some((e) => e.defId === 'bat'); i++) g.submitRound(defendAll(g));
      expect(g.battle!.enemies.some((e) => e.defId === 'bat' && e.summoned)).toBe(true);
      // Seen as it joins, once however many rounds follow.
      expect(g.state.bestiary!.bat).toEqual({ seen: 1, felled: 0 });
      g.submitRound(defendAll(g));
      expect(g.state.bestiary!.bat.seen).toBe(1);
      // Felled with the rest: the summoned count too.
      killAll(g);
      expect(g.state.bestiary!.bat.felled).toBeGreaterThanOrEqual(1);
    } finally {
      (ENEMIES as Record<string, typeof was>).slime = was;
    }
    withRosterLive(['mirage-dancer'], () => {
      const { g } = fight(['mirage-dancer']);
      expect(g.battle!.enemies.filter((e) => e.decoyOf)).toHaveLength(1);
      killAll(g);
      // Its phantom is neither another sighting nor another kill.
      expect(g.state.bestiary).toEqual({ 'mirage-dancer': { seen: 1, felled: 1 } });
    });
  });

  it('felled counts every foe beaten, and only on a win', () => {
    const { g } = fight(['slime', 'bat', 'wolf']);
    // Run away: seen, never felled.
    for (let i = 0; i < 40 && g.battle; i++) {
      for (const e of g.battle.enemies) e.sleep = 9;
      g.submitRound({ hero: { kind: 'escape' } });
    }
    expect(g.phase).toBe('map');
    expect(g.state.bestiary).toEqual({ slime: { seen: 1, felled: 0 }, bat: { seen: 1, felled: 0 }, wolf: { seen: 1, felled: 0 } });
    fight(['slime', 'bat'], 1, MAIN, g);
    killAll(g);
    expect(g.state.bestiary).toEqual({ slime: { seen: 2, felled: 1 }, bat: { seen: 2, felled: 1 }, wolf: { seen: 1, felled: 0 } });
  });

  it('the bestiary draws nothing', async () => {
    const real = await vi.importActual<typeof import('./bestiary')>('./bestiary');
    const seen = vi.mocked(noteSeen), felled = vi.mocked(noteFelled), inscribed = vi.mocked(noteInscribed);
    // The same fight, with the bookkeeping and without: game.rng and every run stream draw the same.
    const run = (on: boolean) => {
      if (!on) for (const f of [seen, felled, inscribed]) f.mockImplementation(() => undefined);
      const saved = GEAR_CHANCE.monster;
      try {
        GEAR_CHANCE.monster = 1;
        return withRosterLive(['paper-moth'], () => {
          const { g, counter } = fight(['paper-moth', 'slime', 'bat'], 3);
          g.state.runesOpen = true;
          const r = g.run!;
          const at = { game: counter.n, loot: r.lootDraws, rune: r.runeDraws, memory: r.memoryDraws, trophy: r.trophyDraws };
          g.submitRound(defendAll(g));
          killAll(g);
          return { draws: { game: counter.n - at.game, loot: r.lootDraws - at.loot, rune: r.runeDraws - at.rune, memory: r.memoryDraws - at.memory, trophy: r.trophyDraws - at.trophy }, kept: g.state.bestiary };
        });
      } finally {
        GEAR_CHANCE.monster = saved;
        seen.mockImplementation(real.noteSeen);
        felled.mockImplementation(real.noteFelled);
        inscribed.mockImplementation(real.noteInscribed);
      }
    };
    const on = run(true), off = run(false);
    expect(on.kept).toMatchObject({ 'paper-moth': { seen: 1, felled: 1 }, slime: { seen: 1, felled: 1 }, bat: { seen: 1, felled: 1 } });
    expect(off.kept).toBeUndefined();
    expect(on.draws).toEqual(off.draws);
    expect(on.draws.loot).toBe(3);
    expect(on.draws.trophy).toBe(1);
  });
});
