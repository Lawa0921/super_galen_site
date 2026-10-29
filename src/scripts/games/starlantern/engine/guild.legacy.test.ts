import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game, type MoveResult } from './game';
import { mulberry32 } from './rng';
import { DELTA, posKey, tileAt, type Dir } from './map';
import type { Portal } from './dungeon/run';
import { statsOf } from './party';
import { saveGame, SAVE_KEY } from './save';
import { sell } from './town';
import { memoryStorage } from './testing';
import type { GameState } from './state';
import type { Pos } from './types';

/**
 * Guild quests plan Task A0 (ruling 15): the town as it was before the guild board. A seeded `Game` plays a fixed script
 * through its public methods: a new game, the main road from depth 1 down to the depth-3 boss and the act-one clear, home,
 * a night at the inn, one material sold (put in the stock by the test), a townsfolk fragment given back (put in the stock by the test), a region from
 * depth 1 down to depth 2, the return lamp home, and the guild opened. After every step the save text is hashed (SHA-256).
 * The guild board must leave every hash as it is: `GUILD_RECORD=1` writes the fixture, otherwise the script must equal it,
 * and a missing fixture fails. No task of the guild plan records it again.
 * Every floor the script stands on is at most depth 3 (the first band, the old table), so no roster go-live wave reaches it
 * (review L5).
 */
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'guild', 'town.before.json');
const SEED = 0x6b1d;
const MAIN: Portal = { region: 'mainline', condition: 'plain' };
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const LEVEL = 30;

/** Copied from storyL.dive.test.ts: stand on an open cell next to `at` and step onto it. */
const stepOnto = (g: Game, at: Pos): MoveResult => {
  for (const dir of DIRS) {
    const from = { x: at.x - DELTA[dir].x, y: at.y - DELTA[dir].y };
    if (tileAt(g.map(), from) !== 'wall') { g.pos = from; return g.move(dir); }
  }
  throw new Error(`no way onto ${posKey(at)}`);
};

/** The phase as it is now (a plain read stays narrowed across the call that moves it). */
const phaseOf = (g: Game): Game['phase'] => g.phase;

/** The save text of `s`, as `saveGame` writes it; `strip` leaves the guild board out (ruling 15's third case). */
function saveText(s: GameState, strip: boolean): string {
  const mem = memoryStorage();
  const { guild: _guild, ...rest } = s as GameState & { guild?: unknown };
  expect(saveGame(mem, (strip ? rest : s) as GameState)).toBe(true);
  return mem.getItem(SAVE_KEY)!;
}

interface TownRun {
  steps: { step: string; sha: string }[];
  /** The depth the party stood on after each departure and each floor change. */
  depths: number[];
  /** `state.guild` after each step (undefined while there is none). */
  guilds: unknown[];
}

/**
 * The script. `strip`: each step's text leaves `guild` out. `openGuild`: what opening the guild does, after the town
 * methods the script calls (nothing before the board exists).
 */
function townScript(opts: { strip?: boolean; openGuild?: (g: Game) => void } = {}): TownRun {
  const steps: TownRun['steps'] = [];
  const depths: number[] = [];
  const guilds: unknown[] = [];
  const g = Game.fresh(mulberry32(SEED), memoryStorage());
  const note = (step: string) => {
    steps.push({ step, sha: createHash('sha256').update(saveText(g.state, !!opts.strip)).digest('hex') });
    guilds.push((g.state as GameState & { guild?: unknown }).guild);
  };
  /** Fights the battle out one round at a time: everyone standing attacks the first foe standing. */
  const fight = () => {
    expect(g.phase).toBe('battle');
    for (let i = 0; i < 500 && g.phase === 'battle'; i++) {
      const b = g.battle!;
      const foe = b.enemies.find((e) => e.alive)!.key;
      g.submitRound(Object.fromEntries(b.party.filter((c) => c.alive).map((c) => [c.key, { kind: 'attack' as const, target: foe }])));
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
  /** Down the stairs of this floor. */
  const down = () => {
    expect(stepOnto(g, g.map().down!).kind).toBe('stairs');
    const r = g.descend();
    expect(r?.kind).toBe('floor');
    depths.push(g.floor);
  };

  note('new game');
  // A level-1 pair cannot beat the depth-3 boss, so the pair sets out at LEVEL (as the story L dive does).
  for (const id of g.state.party.recruited) g.state.party.roster[id].level = LEVEL;
  heal();
  expect(g.depart(MAIN, 1)).toEqual({ ok: true });
  depths.push(g.floor);
  note('depart the main road');
  down();
  note('main road depth 2');
  down();
  note('main road depth 3');
  heal();
  expect(stepOnto(g, g.map().boss!).kind).toBe('boss');
  fight();
  expect(phaseOf(g)).toBe('clear');
  expect(g.state.story.act1Cleared).toBe(true);
  note('the depth-3 boss');
  g.restartAfterClear();
  expect(phaseOf(g)).toBe('town');
  note('home after the act-one clear');
  expect(g.rest().ok).toBe(true);
  note('a night at the inn');
  g.state.inventory.moss = (g.state.inventory.moss ?? 0) + 2;   // the story boss pays no material: the test puts two in the stock
  expect(g.apply(sell(g.state, 'moss', 1)).ok).toBe(true);
  note('sold one moss');
  g.state.inventory['tf-orik'] = 1;
  expect(g.returnFragment('orik').ok).toBe(true);
  note('the orik fragment given back');
  const region = g.state.dungeon.portals.find((p) => p.region !== 'mainline')!;
  heal();
  expect(g.depart(region, 1)).toEqual({ ok: true });
  depths.push(g.floor);
  note(`depart ${region.region}`);
  down();
  note(`${region.region} depth 2`);
  expect(g.useReturnLamp()).toBe(true);
  expect(phaseOf(g)).toBe('town');
  note('the return lamp home');
  opts.openGuild?.(g);
  note('the guild opened');
  return { steps, depths, guilds };
}

describe('the guild board leaves the town as it was (guild quests plan Task A0)', () => {
  it('the town as it was before the guild board', () => {
    const now = townScript();
    if (process.env.GUILD_RECORD === '1') {
      if (!existsSync(dirname(FIXTURE))) mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, `${JSON.stringify(now.steps, null, 2)}\n`);
    }
    expect(existsSync(FIXTURE), 'the town fixture is recorded (GUILD_RECORD=1)').toBe(true);
    expect(now.steps).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')));
    expect(now.guilds.every((x) => x === undefined)).toBe(true);
  });

  it('the script stays in the first band', () => {
    const { depths } = townScript();
    expect(depths.length).toBeGreaterThanOrEqual(5);
    for (const d of depths) expect(d).toBeLessThanOrEqual(3);
  });
});
