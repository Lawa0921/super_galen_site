import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game, type MoveResult } from './game';
import { mulberry32 } from './rng';
import { DELTA, posKey, tileAt, type Dir } from './map';
import { floorOf, type Portal } from './dungeon/run';
import { memoriesOf } from './progression';
import { statsOf } from './party';
import { CHARACTER_IDS } from '../data/characters';
import { withBondScale, withRosterOnly } from './testing';
import type { Pos } from './types';

/**
 * Story L plan ruling 8 (review fix 9): the sim gate never builds a `Game`, so the pickup path is pinned here instead. A
 * seeded `Game` dives the main road from depth 1 to depth 6 through the public API: on each floor it takes an ownerless
 * glimmer, beats a planted elite round by round (no `killAll`, so the battle log really runs), beats the boss where a floor
 * has no stairs yet, and goes down; a wipe or the act-one clear sends it home and it sets out from depth 1 again. The pair
 * is raised to LEVEL and healed on each floor so the dive gets there; the seed fixes everything else. What the fights and the pickups decide is recorded: everyone's memories, Rin's oath, each
 * run's memory draws, the pity, and a SHA-256 of every round's battle log. Story L only moves when memories play, so none of
 * it may change. `STORY_L_RECORD=1` writes the fixture; otherwise the dive must equal it.
 */
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'story-l', 'dive.json');
const MAIN: Portal = { region: 'mainline', condition: 'plain' };
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const TARGET = 6;
const LEVEL = 30;

/** Copied from game.test.ts: stand on an open cell next to `at` and step onto it. */
const stepOnto = (g: Game, at: Pos): MoveResult => {
  for (const dir of DIRS) {
    const from = { x: at.x - DELTA[dir].x, y: at.y - DELTA[dir].y };
    if (tileAt(g.map(), from) !== 'wall') { g.pos = from; return g.move(dir); }
  }
  throw new Error(`no way onto ${posKey(at)}`);
};
/** Copied from game.test.ts: step onto the stairs (which only asks) and accept going down. */
const downstairs = (g: Game, at: Pos): MoveResult | null => {
  expect(stepOnto(g, at).kind).toBe('stairs');
  return g.descend();
};
/** Copied from game.test.ts: a glimmer with no owner on the first open cell, as the floor would have made it. */
const plantGlimmer = (g: Game): Pos => {
  const m = g.map();
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    if (m.tiles[y][x] !== 'floor' || (x === g.pos.x && y === g.pos.y)) continue;
    m.tiles[y][x] = 'glimmer';
    floorOf(g.run!, g.floor).contents.push({ kind: 'glimmer', at: { x, y }, room: 0 });
    return { x, y };
  }
  throw new Error('no cell for a glimmer');
};
/** Copied from game.test.ts (`plantAt`): an open floor cell turned into an elite. */
const plantElite = (g: Game): Pos => {
  const m = g.map();
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    if (m.tiles[y][x] !== 'floor' || (x === g.pos.x && y === g.pos.y)) continue;
    m.tiles[y][x] = 'elite';
    return { x, y };
  }
  throw new Error('no cell for an elite');
};

/** The phase as it is now (a plain read stays narrowed across the fight that moves it). */
const phaseOf = (g: Game): Game['phase'] => g.phase;

function dive() {
  const g = Game.fresh(mulberry32(0x5eed), null);
  const hash = createHash('sha256');
  const draws: number[] = [];
  const trail: string[] = [];
  let fights = 0;
  let rounds = 0;
  /**
   * Fights the battle out one round at a time: everyone standing attacks the first foe standing (an empty order list leaves
   * the party idle, and it is wiped on the first elite).
   */
  const fight = () => {
    expect(g.phase).toBe('battle');
    fights++;
    for (let i = 0; i < 500 && g.phase === 'battle'; i++) {
      const b = g.battle!;
      const foe = b.enemies.find((e) => e.alive)!.key;
      const r = g.submitRound(Object.fromEntries(b.party.filter((c) => c.alive).map((c) => [c.key, { kind: 'attack' as const, target: foe }])))!;
      rounds++;
      hash.update(JSON.stringify(r.battle.log));
      hash.update('\n');
    }
    expect(g.phase).not.toBe('battle');
  };
  /** Everyone back to full, as a night at the inn would leave them. */
  const heal = () => {
    for (const id of g.state.party.recruited) {
      const m = g.state.party.roster[id];
      const st = statsOf(m);
      m.hp = st.hp;
      m.tp = st.tp;
    }
  };
  /** Leaves town healed for depth 1. */
  const setOut = () => { heal(); expect(g.depart(MAIN, 1)).toEqual({ ok: true }); };
  // A level-1 pair cannot beat an elite (they are wiped in three rounds), so the pair starts the dive at LEVEL.
  for (const id of g.state.party.recruited) g.state.party.roster[id].level = LEVEL;
  setOut();
  for (let guard = 0; guard < 20 && !(g.phase === 'map' && g.floor === TARGET); guard++) {
    expect(g.phase).toBe('map');
    const floor = g.floor;
    heal();   // a fountain, or a potion between floors: the dive pins pickups and fights, not attrition
    stepOnto(g, plantGlimmer(g));
    stepOnto(g, plantElite(g));
    fight();
    trail.push(`${floor}:${g.phase}`);
    if (g.phase === 'town') { draws.push(0); setOut(); continue; }
    let down = g.map().down;
    if (!down) {
      heal();
      stepOnto(g, g.map().boss!);
      fight();
      const after = phaseOf(g);   // read afresh: the fight moved it
      trail.push(`${floor}:boss:${after}`);
      if (after === 'town') { draws.push(0); setOut(); continue; }
      if (after === 'clear') {
        draws.push(g.run!.memoryDraws);
        g.restartAfterClear();
        setOut();
        continue;
      }
      down = g.map().down!;
    }
    downstairs(g, down);
  }
  expect({ phase: g.phase, floor: g.floor }, trail.join(' ')).toEqual({ phase: 'map', floor: TARGET });
  draws.push(g.run!.memoryDraws);
  const roster = g.state.party.roster;
  return {
    memories: Object.fromEntries(CHARACTER_IDS.filter((id) => roster[id]).map((id) => [id, memoriesOf(roster[id])])),
    oath: roster.rin?.oath ?? null,
    memoryDraws: draws,
    pity: g.state.story.pity,
    trail,
    fights,
    rounds,
    battleLog: hash.digest('hex'),
  };
}

describe('story L: the seeded dive (Task 0)', () => {
  it('a seeded dive is what it was before story L', () => {
    // Bond plan ruling 5: this pins the pickup path; the bond's battle bonus is band 21's to measure, so it is off here.
    // L1b: measures the game as it was with nothing live.
    const now = withRosterOnly([], () => withBondScale(0, dive));
    if (process.env.STORY_L_RECORD === '1') {
      if (!existsSync(dirname(FIXTURE))) mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, `${JSON.stringify(now, null, 2)}\n`);
    }
    expect(now).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')));
  });
});
