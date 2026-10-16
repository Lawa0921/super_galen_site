import { describe, it, expect } from 'vitest';
import { Game, type MoveResult } from './game';
import { SAVE_KEY, saveGame } from './save';
import { newGame } from './state';
import { constRng, memoryStorage } from './testing';
import { mulberry32 } from './rng';
import { DELTA, posKey, tileAt, type Dir } from './map';
import { floorOf, type Portal } from './dungeon/run';
import type { Pos } from './types';

const calm = () => constRng(0.99); // step gain 12 on floor 1, never rolls an early encounter
const MAIN: Portal = { region: 'mainline', condition: 'plain' };
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const inMap = (floor = 1, rng = calm(), storage = memoryStorage()) => {
  const g = new Game(rng, storage);
  g.state.dungeon.reached.mainline = 3;
  expect(g.depart(MAIN, floor)).toEqual({ ok: true });
  return g;
};
/** Stand on an open cell next to `at` and step onto it. */
const stepOnto = (g: Game, at: Pos): MoveResult => {
  for (const dir of DIRS) {
    const from = { x: at.x - DELTA[dir].x, y: at.y - DELTA[dir].y };
    if (tileAt(g.map(), from) !== 'wall') { g.pos = from; return g.move(dir); }
  }
  throw new Error(`no way onto ${posKey(at)}`);
};
/** Stand on an open cell with a wall in some direction; returns that direction. */
const nextToWall = (g: Game, prefer: Dir[] = DIRS): Dir => {
  const m = g.map();
  for (const dir of prefer) for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    if (m.tiles[y][x] === 'wall' || tileAt(m, { x: x + DELTA[dir].x, y: y + DELTA[dir].y }) !== 'wall') continue;
    g.pos = { x, y };
    return dir;
  }
  throw new Error('no wall');
};
const contentOf = (g: Game, kind: string) => floorOf(g.run!, g.floor).contents.find((c) => c.kind === kind);

describe('boot', () => {
  it('starts a new game in town on an empty slot', () => {
    const g = Game.boot(calm(), memoryStorage());
    expect([g.phase, g.notice, g.state.gold]).toEqual(['town', null, 150]);
  });
  it('flags a reset when the save is unreadable', () => {
    const g = Game.boot(calm(), memoryStorage({ [SAVE_KEY]: '{bad' }));
    expect([g.phase, g.notice]).toEqual(['town', 'save-reset']);
  });
  it('works without storage', () => {
    expect(Game.boot(calm(), null).phase).toBe('town');
  });
  it('a fresh game replaces the save at once, so a wipe before the first rest returns to the fresh start', () => {
    const storage = memoryStorage();
    const old = Game.boot(calm(), storage);
    old.state.gold = 9999;
    old.rest();
    const g = Game.fresh(calm(), storage);
    expect(g.state.gold).toBe(150);
    expect(Game.boot(calm(), storage).state.gold).toBe(150);
  });
});

describe('departing', () => {
  it('turns to face the move direction even when blocked, and faces down on departure', () => {
    const g = new Game(calm(), null);
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.facing).toBe('down');
    nextToWall(g, ['up']);
    expect(g.move('up')).toEqual({ kind: 'blocked' });
    expect(g.facing).toBe('up');
    g.move('right');
    expect(g.facing).toBe('right');
  });
  it('enters a reached floor at its entrance and reveals around it', () => {
    const g = inMap(1);
    const e = g.map().entrance;
    expect([g.phase, g.pos]).toEqual(['map', e]);
    expect(g.run!.explored[1]).toContain(posKey({ x: e.x + 1, y: e.y + 1 }));
    expect(g.onEntrance()).toBe(true);
  });
  it('refuses unreached floors and a downed party', () => {
    const g = new Game(calm(), null);
    expect(g.depart(MAIN, 2)).toEqual({ ok: false, reason: 'locked' });
    for (const id of ['scarlet', 'chizuru', 'liz', 'noel', 'selene'] as const) g.state.party.roster[id].hp = 0;
    expect(g.depart(MAIN, 1)).toEqual({ ok: false, reason: 'party-down' });
    expect(g.phase).toBe('town');
    expect(g.run).toBeNull();
  });
  it('departing twice gives different floors', () => {
    const g = new Game(mulberry32(3), null);
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    const first = g.run!;
    const tiles = g.map().tiles;
    expect(g.returnToTown()).toBe(true);
    expect(g.run).toBeNull();
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.run!.seed).not.toBe(first.seed);
    expect(g.map().tiles).not.toEqual(tiles);
    expect(Object.keys(g.run!.explored)).toEqual(['1']);   // a new run remembers nothing of the last one
  });
  it('start depth cannot exceed the region\'s deepest reached, and must be 1 or a multiple of 5', () => {
    const g = new Game(calm(), null);
    const blaze: Portal = { region: 'blaze', condition: 'plain' };
    g.state.dungeon.reached.blaze = 12;
    const tryAt = (p: Portal, d: number) => {
      const r = g.depart(p, d);
      if (r.ok) { expect([g.floor, g.run!.startDepth, g.run!.region]).toEqual([d, d, p.region]); g.returnToTown(); }
      return r.ok;
    };
    expect([1, 5, 10].map((d) => tryAt(blaze, d))).toEqual([true, true, true]);
    expect([0, 2, 3, 15, 7].map((d) => tryAt(blaze, d))).toEqual([false, false, false, false, false]);
    expect(g.depart(blaze, 15)).toEqual({ ok: false, reason: 'locked' });
    expect(tryAt({ region: 'frost', condition: 'plain' }, 5)).toBe(false);   // frost was never reached past 1
    expect(tryAt(MAIN, 2)).toBe(false);
    g.state.dungeon.reached.mainline = 3;
    expect([1, 2, 3, 4].map((d) => tryAt(MAIN, d))).toEqual([true, true, true, false]);   // the mainline keeps its shortcuts
  });
});

describe('moving', () => {
  it('ignores movement outside the map phase', () => {
    expect(new Game(calm(), null).move('right')).toEqual({ kind: 'ignored' });
  });
  it('is blocked by walls without filling the gauge', () => {
    const g = inMap(1);
    expect(g.move(nextToWall(g))).toEqual({ kind: 'blocked' });
    expect(g.encounter).toBe(0);
  });
  it('fills the gauge on floor tiles and starts a battle at the cap', () => {
    const g = inMap(1);
    expect(g.move('right')).toEqual({ kind: 'moved' });
    expect(g.encounter).toBe(12);
    g.encounter = 99;
    const open = DIRS.find((d) => tileAt(g.map(), { x: g.pos.x + DELTA[d].x, y: g.pos.y + DELTA[d].y }) === 'floor')!;
    expect(g.move(open)).toEqual({ kind: 'battle' });
    expect(g.phase).toBe('battle');
    expect(g.battle!.enemies.every((e) => e.defId !== 'lanterneater')).toBe(true);
    expect(g.move('right')).toEqual({ kind: 'ignored' });
  });
  it('opens a chest once', () => {
    const g = inMap(1);
    const chest = contentOf(g, 'chest')!.at;
    expect(stepOnto(g, chest)).toEqual({ kind: 'chest', item: 'old-coin', qty: 2 });
    expect(g.state.inventory['old-coin']).toBe(2);
    expect(g.run!.opened.has(`1:${posKey(chest)}`)).toBe(true);
    expect(stepOnto(g, chest)).toEqual({ kind: 'moved' });
    expect(g.state.inventory['old-coin']).toBe(2);
  });
  it('a chest gives the terrain loot times the run condition drop rate', () => {
    const g = new Game(calm(), null);
    g.depart({ region: 'mainline', condition: 'bounty' }, 1);
    expect(stepOnto(g, contentOf(g, 'chest')!.at)).toEqual({ kind: 'chest', item: 'old-coin', qty: 3 });   // 2 x 1.5
  });
  it('stairs go one deeper and never back', () => {
    const g = new Game(calm(), null);
    g.depart(MAIN, 1);
    expect(stepOnto(g, g.map().down!)).toEqual({ kind: 'floor', floor: 2 });
    expect([g.floor, g.pos, g.state.dungeon.reached.mainline]).toEqual([2, g.map().entrance, 2]);
    const m = g.map();
    expect(m.up).toBeNull();
    expect(m.tiles.flat()).not.toContain('up');
    expect(stepOnto(g, m.entrance)).toEqual({ kind: 'entrance' });   // the way in is the way home, not back up
    expect(g.floor).toBe(2);
  });
  it('a random region keeps going past depth 3', () => {
    const g = new Game(calm(), null);
    g.depart({ region: 'storm', condition: 'plain' }, 1);
    for (const d of [2, 3, 4, 5]) expect(stepOnto(g, g.map().down!)).toEqual({ kind: 'floor', floor: d });
    expect(g.state.dungeon.reached.storm).toBe(5);
    expect(g.map().boss).not.toBeNull();
    expect(g.map().down).toBeNull();
    expect(g.run!.floors.has(4)).toBe(true);
  });
  it('halves the gauge gain with stealth', () => {
    const g = inMap(1);
    g.state.party.roster.liz.level = 2;
    g.move('right');
    expect(g.encounter).toBe(6);
  });
});

describe('returning to town', () => {
  it('only from the entrance tile', () => {
    const g = inMap(1);
    g.move('right');
    expect(g.returnToTown()).toBe(false);
    g.move('left');
    expect(g.returnToTown()).toBe(true);
    expect([g.phase, g.encounter]).toEqual(['town', 0]);
  });
  it('anywhere with a return lamp, which is consumed', () => {
    const g = inMap(1);
    g.move('right');
    expect(g.useReturnLamp()).toBe(true);
    expect([g.phase, g.state.inventory['return-lamp'] ?? 0]).toEqual(['town', 0]);
    g.depart(MAIN, 1);
    expect(g.useReturnLamp()).toBe(false);
  });
});

describe('battles', () => {
  const startBattle = (seed = 1, storage = memoryStorage()) => {
    const g = inMap(1, mulberry32(seed), storage);
    g.encounter = 99;
    expect(g.move('right')).toEqual({ kind: 'battle' });
    return g;
  };
  it('pays out on victory and returns to the map', () => {
    const g = startBattle();
    for (const e of g.battle!.enemies) e.hp = 1;
    const gold = g.state.gold;
    const actions = Object.fromEntries(g.battle!.party.map((c) => [c.key, { kind: 'attack' as const, target: 'e0' }]));
    const r = g.submitRound(actions)!;
    expect(r.end!.outcome).toBe('win');
    expect(g.phase).toBe('map');
    expect(g.battle).toBeNull();
    expect(g.state.gold).toBe(gold + r.end!.gold);
    const sc = g.state.party.roster.scarlet; // a floor-1 fight gives < 60 exp, so at most one level-up (15 exp)
    expect(sc.exp + (sc.level - 1) * 15).toBe(r.end!.exp);
  });
  it('keeps fighting while the outcome is open', () => {
    const g = startBattle();
    const r = g.submitRound({})!;
    expect(r.end).toBeNull();
    expect(g.phase).toBe('battle');
  });
  it('reloads the inn save on a wipe', () => {
    const storage = memoryStorage();
    saveGame(storage, { ...newGame(), gold: 999 });
    const g = startBattle(1, storage);
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    const r = g.submitRound({})!;
    expect(r.end!.outcome).toBe('lose');
    expect([g.phase, g.notice, g.state.gold]).toEqual(['town', 'wipe', 999]);
    expect(g.run).toBeNull();
  });
  it('starts over when wiping without a save', () => {
    const g = startBattle();
    g.state.gold = 5;
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    g.submitRound({});
    expect([g.phase, g.state.gold]).toEqual(['town', 150]);
  });
  it('the mainline boss is on depth 3 and its defeat clears the game', () => {
    const g = inMap(3);
    expect(g.map().boss).not.toBeNull();
    const at = g.map().boss!;
    expect(stepOnto(g, at)).toEqual({ kind: 'boss' });
    expect(g.battle!.boss).toBe(true);
    for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; }
    expect(g.submitRound({})!.end!.outcome).toBe('win');
    expect([g.phase, g.state.dungeon.bossDefeated]).toEqual(['clear', true]);
    expect(g.map().down).toEqual(at);   // the beaten boss leaves stairs down
    expect(tileAt(g.map(), at)).toBe('down');
    g.restartAfterClear();
    expect(g.phase).toBe('town');
    expect(g.run).toBeNull();
  });
  it('once the story boss is beaten, the mainline goes on past depth 3', () => {
    const g = inMap(3);
    g.returnToTown();
    g.state.dungeon.bossDefeated = true;
    g.depart(MAIN, 3);
    const m = g.map();
    expect([m.boss, m.tiles.flat().includes('boss')]).toEqual([null, false]);
    expect(m.down).not.toBeNull();
    expect(stepOnto(g, m.down!)).toEqual({ kind: 'floor', floor: 4 });
    expect([g.floor, g.state.dungeon.reached.mainline, g.phase]).toEqual([4, 4, 'map']);
    expect(g.map().down).not.toBeNull();
  });
  it('a region boss opens the stairs down instead of clearing the game', () => {
    const g = new Game(calm(), null);
    g.state.dungeon.reached.iron = 5;
    g.depart({ region: 'iron', condition: 'plain' }, 5);
    const at = g.map().boss!;
    expect(stepOnto(g, at)).toEqual({ kind: 'boss' });
    for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; }
    expect(g.submitRound({})!.end!.outcome).toBe('win');
    expect([g.phase, g.state.dungeon.bossDefeated]).toEqual(['map', false]);
    expect(g.map().down).toEqual(at);
    expect(stepOnto(g, at)).toEqual({ kind: 'floor', floor: 6 });
  });
});

describe('inn', () => {
  it('saves after resting', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage);
    expect(g.rest().ok).toBe(true);
    expect(g.notice).toBe('saved');
    expect(storage.map.has(SAVE_KEY)).toBe(true);
  });
  it('reports a failed save without losing the rest', () => {
    const g = new Game(calm(), { getItem: () => null, setItem: () => { throw new Error('full'); } });
    expect(g.rest().ok).toBe(true);
    expect([g.notice, g.state.gold]).toEqual(['save-failed', 130]);
  });
  it('does not save when the rest is refused', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage);
    g.state.gold = 0;
    expect(g.rest()).toEqual({ ok: false, reason: 'gold' });
    expect(storage.map.has(SAVE_KEY)).toBe(false);
  });
});
