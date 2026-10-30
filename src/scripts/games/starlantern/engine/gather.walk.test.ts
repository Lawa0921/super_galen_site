import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Game, type MoveResult } from './game';
import { mulberry32 } from './rng';
import { DELTA, posKey, tileAt, type Dir, type FloorMap } from './map';
import { floorOf, type Portal } from './dungeon/run';
import { statsOf } from './party';
import { withGatherLive, withRosterOnly } from './testing';
import type { Pos } from './types';

/**
 * Gathering plan ruling 16 (review H1, spec §5.5 item 3): walking over a point is walking. A seeded game, gathering held
 * open, walks a main-road stretch and a region's across three floors each: on every floor it goes by `move()` to each point
 * in turn (a breadth-first path over anything but walls and the cells that start a set fight: a boss, an elite, a warden, a
 * rescue room; the random encounters on the way are what is compared), then to the stairs and down. Every rng draw, every
 * battle's floor and cell, and a SHA-256 of every round's battle log are kept. Then the same seed walks the same steps
 * again, but each floor's points are turned back to plain floor before its first step: the two walks must be the same
 * in every draw. Nothing is recorded; the first walk must really have stepped on at least three points. The foes are the
 * old table's (`withRosterOnly([])`, as the story L dive), so a random encounter never wipes the pair mid-walk.
 */
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
/** The pair at the highest level and healed after every fight (it draws nothing), so a random encounter never ends the walk. */
const LEVEL = 50;
const FLOORS = 3;

interface Stretch { portal: Portal; start: number; reached: number }
const STRETCHES: Stretch[] = [
  { portal: { region: 'mainline', condition: 'plain' }, start: 6, reached: 10 },
  { portal: { region: 'iron', condition: 'plain' }, start: 1, reached: 1 },
];

/** Cells a path keeps off (the target aside): walls, and the cells that start a set fight, so the walk is not wiped by one. */
const OFF = new Set(['wall', 'boss', 'elite', 'warden', 'rescue']);

/** The steps from `from` to `to`, over any cell but those in OFF (the target aside); null when there is no way. */
function path(m: FloorMap, from: Pos, to: Pos): Dir[] | null {
  const prev = new Map<string, { at: Pos; dir: Dir } | null>([[posKey(from), null]]);
  const queue: Pos[] = [from];
  while (queue.length) {
    const at = queue.shift()!;
    if (at.x === to.x && at.y === to.y) break;
    for (const dir of DIRS) {
      const next = { x: at.x + DELTA[dir].x, y: at.y + DELTA[dir].y };
      const t = tileAt(m, next);
      const isTarget = next.x === to.x && next.y === to.y;
      if (t === 'wall' || (OFF.has(t) && !isTarget) || prev.has(posKey(next))) continue;
      prev.set(posKey(next), { at, dir });
      queue.push(next);
    }
  }
  if (!prev.has(posKey(to))) return null;
  const dirs: Dir[] = [];
  for (let p = prev.get(posKey(to)); p; p = prev.get(posKey(p.at))) dirs.unshift(p.dir);
  return dirs;
}

interface Walk {
  draws: number;
  battles: string[];
  battleLog: string;
  trail: string[];
  /** The steps taken on each floor (`depth:dirs`), for the second walk to take again. */
  routes: Record<string, Dir[]>;
  /** Points stepped on (first walk only). */
  stepped: number;
}

/**
 * One walk of `s` from `seed`. Without `routes` it finds its way (and records it); with `routes` it takes those steps and
 * turns every point of each floor back to plain floor before the floor's first step.
 */
function walk(seed: number, s: Stretch, routes?: Record<string, Dir[]>): Walk {
  let draws = 0;
  const base = mulberry32(seed);
  const g = Game.fresh(() => { draws++; return base(); }, null);
  const hash = createHash('sha256');
  const battles: string[] = [];
  const trail: string[] = [];
  const taken: Record<string, Dir[]> = {};
  let stepped = 0;
  for (const id of g.state.party.recruited) g.state.party.roster[id].level = LEVEL;
  const heal = () => {
    for (const id of g.state.party.recruited) {
      const m = g.state.party.roster[id];
      const st = statsOf(m);
      m.hp = st.hp;
      m.tp = st.tp;
    }
  };
  heal();
  g.state.dungeon.reached[s.portal.region] = s.reached;
  expect(g.depart(s.portal, s.start)).toEqual({ ok: true });
  expect(g.run!.gather).toBe(true);
  /** Fights the battle out (as the story L dive): everyone standing attacks the first foe standing. */
  const fight = () => {
    for (let i = 0; i < 500 && g.phase === 'battle'; i++) {
      const b = g.battle!;
      const foe = b.enemies.find((e) => e.alive)!.key;
      const r = g.submitRound(Object.fromEntries(b.party.filter((c) => c.alive).map((c) => [c.key, { kind: 'attack' as const, target: foe }])))!;
      hash.update(JSON.stringify(r.battle.log));
      hash.update('\n');
    }
    expect(g.phase).not.toBe('battle');
  };
  /** One step; a battle is fought out. False when the walk ended (a wipe). */
  const stepTo = (dir: Dir, key: string): boolean => {
    const before = g.pos;
    const next = { x: before.x + DELTA[dir].x, y: before.y + DELTA[dir].y };
    if (!routes && tileAt(g.map(), next) === 'gather') stepped++;
    const r: MoveResult = g.move(dir);
    (taken[key] ??= []).push(dir);
    if (r.kind === 'battle' || r.kind === 'boss' || r.kind === 'rescue') {
      battles.push(`${g.floor}:${posKey(g.pos)}:${r.kind}`);
      fight();
      if ((g.phase as string) !== 'map') { trail.push(`${key}:${g.phase}`); return false; }
      heal();
    }
    return true;
  };
  for (let n = 0; n < FLOORS; n++) {
    const depth = g.floor;
    const key = `${n}:${depth}`;
    heal();
    if (routes) {
      // the second walk: this floor's points back to plain floor, before its first step
      const f = floorOf(g.run!, depth);
      for (const c of f.contents) if (c.kind === 'gather') f.map.tiles[c.at.y][c.at.x] = 'floor';
      f.contents = f.contents.filter((c) => c.kind !== 'gather');
      for (const dir of routes[key] ?? []) if (!stepTo(dir, key)) return { draws, battles, battleLog: hash.digest('hex'), trail, routes: taken, stepped };
    } else {
      const m = g.map();
      const goals = [...floorOf(g.run!, depth).contents.filter((c) => c.kind === 'gather').map((c) => c.at)];
      if (m.down) goals.push(m.down);
      for (const goal of goals) {
        const dirs = path(g.map(), g.pos, goal);
        if (!dirs) continue;
        for (const dir of dirs) if (!stepTo(dir, key)) return { draws, battles, battleLog: hash.digest('hex'), trail, routes: taken, stepped };
      }
    }
    trail.push(`${key}:at ${posKey(g.pos)} ${tileAt(g.map(), g.pos)}`);
    if (tileAt(g.map(), g.pos) !== 'down') break;
    const r = g.descend();
    trail.push(`${key}:${r?.kind === 'floor' ? 'descended' : r?.kind}`);
  }
  return { draws, battles, battleLog: hash.digest('hex'), trail, routes: taken, stepped };
}

describe('walking over points is walking (gathering plan ruling 16)', () => {
  it.each(STRETCHES)('$portal.region from depth $start', (s) => {
    const seed = 0x6a7e + s.start;
    const first = withRosterOnly([], () => withGatherLive(() => walk(seed, s), { open: true }));
    const second = withRosterOnly([], () => withGatherLive(() => walk(seed, s, first.routes), { open: true }));
    expect(first.stepped, first.trail.join(' ')).toBeGreaterThanOrEqual(3);
    // across three floors: down the stairs of each
    expect(first.trail.filter((t) => t.endsWith(':descended')), first.trail.join(' ')).toHaveLength(FLOORS);
    const { routes: _a, stepped: _b, ...one } = first;
    const { routes: _c, stepped: _d, ...two } = second;
    expect(two).toEqual(one);
    expect(second.routes).toEqual(first.routes);
  });
});
