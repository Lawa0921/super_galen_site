import { describe, it, expect, vi } from 'vitest';
import { Game, type MoveResult } from './game';
import { SAVE_KEY, saveGame } from './save';
import { newGame } from './state';
import { constRng, memoryStorage } from './testing';
import { mulberry32 } from './rng';
import { validPortals } from './portals';
import { DELTA, posKey, tileAt, type Dir } from './map';
import { floorOf, type Portal } from './dungeon/run';
import { capacity, carried, weightOf } from '../data/weights';
import type { Pos } from './types';
import { ENEMIES } from '../data/enemies';
import { CHARACTERS } from '../data/characters';
import { SETS } from '../data/gear';
import { activeIds } from './party';
import { BAG_SIZE } from './loot/bag';
import { chestHasGear, GEAR_CHANCE, RARE_MATERIALS, rollBossGear } from './loot/drops';
import { itemLevel, itemWeight, rollItem } from './loot/item';
import type { ItemInstance } from './types';

// Wrapped so a test can see what the game asked the boss roll for; it still rolls for real.
vi.mock('./loot/drops', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./loot/drops')>();
  return { ...mod, rollBossGear: vi.fn(mod.rollBossGear) };
});

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
/** Step onto the stairs (which only asks) and accept going down. */
const downstairs = (g: Game, at: Pos): MoveResult | null => {
  expect(stepOnto(g, at).kind).toBe('stairs');
  return g.descend();
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
/** An open floor cell of the current floor that passes `ok`, turned into `tile`. */
const plantAt = (g: Game, tile: 'chest' | 'elite' | 'vault', ok: (at: Pos) => boolean = () => true): Pos => {
  const m = g.map();
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    if (m.tiles[y][x] !== 'floor' || (x === g.pos.x && y === g.pos.y) || !ok({ x, y })) continue;
    m.tiles[y][x] = tile;
    if (tile === 'vault') floorOf(g.run!, g.floor).contents.push({ kind: 'vault', at: { x, y }, room: 0 });
    return { x, y };
  }
  throw new Error(`no cell for ${tile}`);
};
/** A chest of this floor whose gear roll is `gear`; when the floor has none, one is put on an open cell that qualifies. */
const chestWhere = (g: Game, gear: boolean): Pos => {
  const has = (at: Pos) => chestHasGear(g.run!, g.floor, at) === gear;
  return floorOf(g.run!, g.floor).contents.find((c) => c.kind === 'chest' && has(c.at))?.at ?? plantAt(g, 'chest', has);
};
/** A chest without gear: its materials are all it gives. */
const plainChest = (g: Game): Pos => chestWhere(g, false);
const gearItem = (uid: number, over: Partial<ItemInstance> = {}): ItemInstance =>
  ({ ...rollItem(mulberry32(uid), { uid, ilvl: 1, rarity: 'magic', base: over.base ?? 'iron-sword' }), ...over });
const killAll = (g: Game) => { for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; } return g.submitRound({})!.end!; };

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
    const chest = plainChest(g);
    expect(stepOnto(g, chest)).toEqual({ kind: 'chest', item: 'old-coin', qty: 2 });
    expect(g.run!.loot.items['old-coin']).toBe(2);
    expect(g.run!.opened.has(`1:${posKey(chest)}`)).toBe(true);
    expect(stepOnto(g, chest)).toEqual({ kind: 'moved' });
    expect(g.run!.loot.items['old-coin']).toBe(2);
  });
  it('a chest gives the terrain loot times the run condition drop rate', () => {
    const g = new Game(calm(), null);
    g.depart({ region: 'mainline', condition: 'bounty' }, 1);
    expect(stepOnto(g, plainChest(g))).toEqual({ kind: 'chest', item: 'old-coin', qty: 3 });   // 2 x 1.5
  });
  it('stairs go one deeper and never back', () => {
    const g = new Game(calm(), null);
    g.depart(MAIN, 1);
    expect(downstairs(g, g.map().down!)).toEqual({ kind: 'floor', floor: 2 });
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
    for (const d of [2, 3, 4, 5]) expect(downstairs(g, g.map().down!)).toEqual({ kind: 'floor', floor: d });
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
    expect([g.state.gold, g.run!.loot.gold]).toEqual([gold, r.end!.gold]);
    const sc = g.state.party.roster.scarlet; // a floor-1 fight gives < 60 exp, so at most one level-up (15 exp)
    expect(sc.exp + (sc.level - 1) * 15).toBe(r.end!.exp);
  });
  it('keeps fighting while the outcome is open', () => {
    const g = startBattle();
    const r = g.submitRound({})!;
    expect(r.end).toBeNull();
    expect(g.phase).toBe('battle');
  });
  it('a wipe keeps levels, drops the run pack and a quarter of the gold, and does not reload the save', () => {
    const storage = memoryStorage();
    saveGame(storage, { ...newGame(), gold: 999 });
    const g = startBattle(1, storage);
    g.state.gold = 200;
    g.state.party.roster.scarlet.level = 4;
    g.run!.loot.items['moss'] = 3;
    g.run!.loot.gold = 80;
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    const r = g.submitRound({})!;
    expect(r.end!.outcome).toBe('lose');
    expect([g.phase, g.notice, g.state.gold, g.state.party.roster.scarlet.level]).toEqual(['town', 'wipe', 150, 4]);
    expect(g.state.inventory['moss']).toBeUndefined();
    expect(g.run).toBeNull();
  });
  it('portals are rerolled on return and kept across a save and reload', () => {
    const storage = memoryStorage();
    const g = new Game(mulberry32(5), storage);
    expect(validPortals(g.state.dungeon.portals)).toBe(true);
    const seen = new Set([JSON.stringify(g.state.dungeon.portals)]);
    g.state.inventory['return-lamp'] = 20;
    g.state.dungeon.reached.mainline = 3;
    for (let i = 0; i < 8; i++) {   // lamp return
      expect(g.depart(g.state.dungeon.portals[0], 1)).toEqual({ ok: true });
      expect(g.useReturnLamp()).toBe(true);
      seen.add(JSON.stringify(g.state.dungeon.portals));
      expect(validPortals(g.state.dungeon.portals)).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(1);
    // entrance return rerolls too
    const beforeEntrance = JSON.stringify(g.state.dungeon.portals);
    g.depart(g.state.dungeon.portals[0], 1);
    expect(g.returnToTown()).toBe(true);
    expect(JSON.stringify(g.state.dungeon.portals)).not.toBe(beforeEntrance);
    // kept across a save and reload
    saveGame(storage, g.state);
    const h = Game.boot(mulberry32(99), storage);
    expect(h.phase).toBe('town');
    expect(h.state.dungeon.portals).toEqual(g.state.dungeon.portals);
  });
  it('a wipe rerolls the portals too', () => {
    const g = startBattle();
    const before = JSON.stringify(g.state.dungeon.portals);
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    g.submitRound({});
    expect(g.phase).toBe('town');
    expect(validPortals(g.state.dungeon.portals)).toBe(true);
    expect(JSON.stringify(g.state.dungeon.portals)).not.toBe(before);
  });
  it('a wipe without a save keeps the state too (no reset to 150)', () => {
    const g = startBattle();
    g.state.gold = 5;
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    g.submitRound({});
    expect([g.phase, g.state.gold]).toEqual(['town', 3]);
  });
  it('departing again after a wipe starts with an empty pack and charges no second penalty', () => {
    const g = startBattle();
    g.state.gold = 200;
    g.run!.loot.items['moss'] = 3;
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    g.submitRound({});
    expect(g.state.gold).toBe(150);
    expect(Object.values(g.state.party.roster).every((m) => m.hp >= 1)).toBe(true);   // the fallen come home with 1 HP
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect([g.run!.loot, g.state.gold]).toEqual([{ items: {}, gold: 0, gear: [] }, 150]);
    expect(g.returnToTown()).toBe(true);
    expect(g.state.gold).toBe(150);
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
    expect(downstairs(g, m.down!)).toEqual({ kind: 'floor', floor: 4 });
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
    expect(downstairs(g, at)).toEqual({ kind: 'floor', floor: 6 });
  });
  it('the story boss on mainline depth 3 is the plain 燈喰之獸', () => {
    const g = inMap(3);
    stepOnto(g, g.map().boss!);
    const b = g.battle!.enemies[0];
    expect([b.name, b.max, b.tint]).toEqual(['燈喰之獸', ENEMIES.lanterneater.stats, undefined]);
  });
  it('a region boss is the 燈喰之獸 grown by depth and region', () => {
    const g = new Game(calm(), null);
    g.state.dungeon.reached.blaze = 5;
    g.depart({ region: 'blaze', condition: 'plain' }, 5);
    stepOnto(g, g.map().boss!);
    const b = g.battle!.enemies[0];
    expect([b.name, b.tint, b.boss, b.resist, b.weak]).toEqual(['深層・熾焰・燈喰之獸', 'fire', true, ['fire'], ['ice']]);
    expect(b.max.hp).toBeGreaterThan(ENEMIES.lanterneater.stats.hp);
  });
  it('the run condition reaches the fight: 兇暴 enemies hit harder', () => {
    const g = new Game(calm(), null);
    g.depart({ region: 'mainline', condition: 'fierce' }, 1);
    g.encounter = 999;
    const open = DIRS.find((d) => tileAt(g.map(), { x: g.pos.x + DELTA[d].x, y: g.pos.y + DELTA[d].y }) === 'floor')!;
    expect(g.move(open)).toEqual({ kind: 'battle' });
    for (const e of g.battle!.enemies) expect(e.max.atk, e.defId).toBe(Math.round(ENEMIES[e.defId].stats.atk * 1.2));
  });
  it('encounters in a region are its variants, and deep mainline foes are 深層', () => {
    const fight = (region: Portal['region'], depth: number) => {
      const g = new Game(calm(), null);
      g.state.dungeon.reached[region] = depth;
      g.depart({ region, condition: 'plain' }, depth);
      g.encounter = 999;
      const open = DIRS.find((d) => tileAt(g.map(), { x: g.pos.x + DELTA[d].x, y: g.pos.y + DELTA[d].y }) === 'floor')!;
      expect(g.move(open)).toEqual({ kind: 'battle' });
      return g.battle!.enemies;
    };
    const storm = fight('storm', 1);
    expect(storm.every((e) => e.name.startsWith('雷鳴・') && e.tint === 'thunder')).toBe(true);
    expect(fight('mainline', 4).every((e) => e.name.startsWith('深層・') && e.tint === undefined)).toBe(true);
    expect(fight('mainline', 1).every((e) => !e.name.includes('・'))).toBe(true);
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

describe('run pack', () => {
  it('a full chest keeps its roll and does not touch the rng when stepped on again', () => {
    let calls = 0;
    const g = new Game(() => { calls++; return 0.99; }, null);
    g.state.dungeon.reached.mainline = 3;
    g.depart(MAIN, 1);
    g.run!.loot.items['star-stone'] = Math.floor((capacity(g.state.party) - carried(g.state, g.run!)) * 2);
    const chest = plainChest(g);
    const first = stepOnto(g, chest);
    expect(first.kind).toBe('full');
    const after = calls;
    expect(stepOnto(g, chest)).toEqual(first);
    expect(calls).toBe(after);   // a chest tile never rolls twice
    expect(g.run!.rolls[`chest:1:${posKey(chest)}`]).toEqual({ item: 'old-coin', qty: 2 });
  });
  it('clearing the game banks the run pack', () => {
    const g = inMap(3);
    g.run!.loot.items.moss = 2;
    stepOnto(g, g.map().boss!);
    for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; }
    g.submitRound({});
    expect(g.phase).toBe('clear');
    g.restartAfterClear();
    expect([g.phase, g.run, g.notice, g.state.inventory.moss]).toEqual(['town', null, 'banked', 2]);
    expect(g.banked!.items.moss).toBe(2);
  });
  it('the lamp flags its use on the banked report', () => {
    const g = inMap(1);
    g.run!.loot.items.moss = 1;
    g.state.inventory['return-lamp'] = 1;
    g.useReturnLamp();
    expect(g.banked!.viaLamp).toBe(true);
    const h = inMap(1);
    h.run!.loot.items.moss = 1;
    h.returnToTown();
    expect(h.banked!.viaLamp).toBe(false);
  });
  it('discard only works on the map', () => {
    const g = inMap(1);
    g.run!.loot.items.moss = 3;
    g.phase = 'battle';
    expect(g.discard('moss', 1)).toBe(0);
    g.phase = 'map';
    expect(g.discard('moss', 1)).toBe(1);
  });
  it('battle drops that partly fit are split between the pack and BattleEnd.left', () => {
    let checked = 0;
    for (let seed = 1; seed <= 60 && !checked; seed++) {
      const g = new Game(mulberry32(seed), null);
      g.depart(MAIN, 1);
      g.encounter = 99;
      g.move('right');
      g.run!.loot.items['star-stone'] = Math.floor((capacity(g.state.party) - carried(g.state, g.run!)) * 2) - 1;   // room for one 0.5 drop
      for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; }
      const end = g.submitRound({})!.end!;
      const taken = Object.values(end.drops).reduce((a, b) => a + b, 0);
      const left = Object.values(end.left).reduce((a, b) => a + b, 0);
      if (taken + left < 2) continue;
      checked++;
      expect(taken).toBe(1);   // end.drops lists only what went into the pack
      for (const [id, n] of Object.entries(end.drops)) expect(g.run!.loot.items[id]).toBe(n);
    }
    expect(checked).toBe(1);
  });
  it('loot waits in the run pack and is banked on return', () => {
    const g = inMap(1);
    const chest = plainChest(g);
    stepOnto(g, chest);
    g.run!.loot.gold = 30;
    expect([g.run!.loot.items['old-coin'], g.state.inventory['old-coin'], g.state.gold]).toEqual([2, undefined, 150]);
    stepOnto(g, g.map().entrance);
    expect(g.returnToTown()).toBe(true);
    expect([g.state.inventory['old-coin'], g.state.gold, g.notice]).toEqual([2, 180, 'banked']);
    expect(g.banked).toEqual({ items: { 'old-coin': 2 }, gold: 30, viaLamp: false, gear: [], overflow: [] });
  });
  it('the return lamp banks the pack too', () => {
    const g = inMap(1);
    g.run!.loot.items.moss = 2;
    g.state.inventory['return-lamp'] = 1;
    expect(g.useReturnLamp()).toBe(true);
    expect([g.state.inventory.moss, g.notice]).toEqual([2, 'banked']);
  });
  it('consumables from a chest go straight to the inventory', () => {
    const g = new Game(calm(), null);
    g.state.dungeon.reached.mainline = 3;
    g.depart(MAIN, 2);
    const chest = plainChest(g);
    expect(stepOnto(g, chest)).toEqual({ kind: 'chest', item: 'ether', qty: 2 });
    expect([g.state.inventory.ether, g.run!.loot.items.ether]).toEqual([2, undefined]);
  });
  it('picking up past the weight limit reports full and keeps the item on the ground; discarding makes room', () => {
    const g = inMap(1);
    const cap = capacity(g.state.party);
    g.run!.loot.items['star-stone'] = Math.floor((cap - carried(g.state, g.run!)) * 2) - 1;   // 0.5 each: room for under 1 more
    const chest = plainChest(g);
    const before = { ...g.run!.loot.items };

    const full = stepOnto(g, chest);
    expect(full).toMatchObject({ kind: 'full', item: 'old-coin', qty: 2 });
    expect((full as { need: number }).need).toBeCloseTo(1.5);   // 2 weight wanted, 0.5 of room
    expect(g.run!.loot.items).toEqual(before);
    expect(g.run!.opened.has(`1:${posKey(chest)}`)).toBe(false);
    expect(g.discard('star-stone', 10)).toBe(10);
    expect(stepOnto(g, chest)).toEqual({ kind: 'chest', item: 'old-coin', qty: 2 });
    expect(g.run!.loot.items['old-coin']).toBe(2);
  });
  it('discard takes from the run pack first, then consumables, and never more than held', () => {
    const g = inMap(1);
    g.run!.loot.items.potion = 1;
    g.state.inventory.potion = 2;
    expect(g.discard('potion', 2)).toBe(2);
    expect([g.run!.loot.items.potion, g.state.inventory.potion]).toEqual([undefined, 1]);
    expect(g.discard('potion', 5)).toBe(1);
    expect(g.discard('nothing', 1)).toBe(0);
  });
  it('carried weight counts the consumables brought along and the run pack, gear at its item weight', () => {
    const g = inMap(1);
    g.state.inventory = { potion: 3, moss: 10 };   // stored materials stay home
    g.run!.loot.items = { 'old-coin': 2, moss: 4 };
    const sword = gearItem(901, { base: 'iron-sword' });
    const robe = gearItem(902, { base: 'cloth-robe' });
    g.run!.loot.gear = [sword, robe];
    g.state.party.roster.scarlet.equip.body = gearItem(903, { base: 'cloth-robe' });   // worn gear weighs nothing
    expect([itemWeight(sword), itemWeight(robe)]).toEqual([6, 8]);
    expect(carried(g.state, g.run!)).toBe(3 + 2 + 2 + 6 + 8);
    expect(weightOf('moss')).toBe(0.5);
    expect(weightOf('hunter-bow')).toBe(1);   // a gear base id is never a carried unit
    expect(capacity(g.state.party)).toBeGreaterThan(40);
  });
  it('battle drops with room all go into the pack and are all reported', () => {
    const g = new Game(mulberry32(1), null);
    g.depart(MAIN, 1);
    g.encounter = 99;
    g.move('right');
    for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; }
    const end = g.submitRound({})!.end!;
    expect(Object.keys(end.drops).length).toBeGreaterThan(0);
    expect(end.left).toEqual({});
    expect(g.run!.loot.items).toEqual(end.drops);
  });
  it('battle drops past the limit are left behind and reported', () => {
    const g = new Game(mulberry32(1), null);
    g.depart(MAIN, 1);
    g.encounter = 99;
    g.move('right');
    g.run!.loot.items['star-stone'] = Math.floor(capacity(g.state.party) * 2);   // exactly full
    for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; }
    const end = g.submitRound({})!.end!;
    const left = Object.values(end.left).reduce((a, b) => a + b, 0);
    expect(left).toBeGreaterThan(0);
    expect(end.drops).toEqual({});   // nothing was taken, so nothing is reported as obtained
    expect(Object.keys(g.run!.loot.items)).toEqual(['star-stone']);
  });
});

describe('fog', () => {
  it('a fog run sees only the cell the party stands on', () => {
    const g = new Game(calm(), null);
    g.depart({ region: 'mainline', condition: 'fog' }, 1);
    const start = { ...g.pos };
    expect(g.run!.explored[1]).toEqual([posKey(start)]);
    const dir = DIRS.find((d) => tileAt(g.map(), { x: start.x + DELTA[d].x, y: start.y + DELTA[d].y }) === 'floor')!;
    expect(g.move(dir).kind).toBe('moved');
    expect([...g.run!.explored[1]].sort()).toEqual([posKey(start), posKey(g.pos)].sort());
  });
  it('a clear run still sees the cells around the party', () => {
    const g = inMap(1);
    expect(g.run!.explored[1].length).toBeGreaterThan(1);
  });
});
describe('battle drops by region and condition', () => {
  /** Win one ordinary fight at depth 1 through `portal` and return every material it dropped (taken or left). */
  const fightOnce = (seed: number, portal: Portal): Record<string, number> => {
    const g = new Game(mulberry32(seed), null);
    g.depart(portal, 1);
    g.encounter = 99;
    const dir = DIRS.find((d) => tileAt(g.map(), { x: g.pos.x + DELTA[d].x, y: g.pos.y + DELTA[d].y }) === 'floor')!;
    expect(g.move(dir).kind).toBe('battle');
    for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; }
    const end = g.submitRound({})!.end!;
    const all = { ...end.drops };
    for (const [id, n] of Object.entries(end.left)) all[id] = (all[id] ?? 0) + n;
    return all;
  };
  const total = (portal: Portal, seeds: number) => {
    const sum: Record<string, number> = {};
    for (let seed = 1; seed <= seeds; seed++) for (const [id, n] of Object.entries(fightOnce(seed, portal))) sum[id] = (sum[id] ?? 0) + n;
    return sum;
  };
  it('a regional run drops its region material', () => {
    expect(total({ region: 'frost', condition: 'plain' }, 60)['frost-heart'] ?? 0).toBeGreaterThan(0);
    expect(total({ region: 'mire', condition: 'plain' }, 60)['mire-gland'] ?? 0).toBeGreaterThan(0);
  });
  it('the mainline never drops a region material', () => {
    const got = total(MAIN, 60);
    for (const m of ['blaze-core', 'frost-heart', 'storm-stone', 'mire-gland', 'shade-crystal', 'iron-shard']) expect(got[m] ?? 0, m).toBe(0);
  });
  it('豐收 brings measurably more battle materials than 平穩 over the same seeds', () => {
    const count = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);
    const plain = count(total({ region: 'mainline', condition: 'plain' }, 80));
    const bounty = count(total({ region: 'mainline', condition: 'bounty' }, 80));
    expect(plain).toBeGreaterThan(0);
    expect(bounty).toBeGreaterThan(plain * 1.25);
  });
});

describe('stairs ask before going down', () => {
  it('stepping on the stairs asks with the next depth and its suggested level, and does not go down yet', () => {
    const g = new Game(calm(), null);
    g.depart(MAIN, 1);
    const at = g.map().down!;
    expect(stepOnto(g, at)).toEqual({ kind: 'stairs', floor: 2, level: 6, warn: true });   // a fresh Lv 1 party
    expect([g.floor, g.pos, g.state.dungeon.reached.mainline]).toEqual([1, at, 1]);
  });
  it('no warning once the top party level reaches the suggestion', () => {
    const g = new Game(calm(), null);
    g.depart(MAIN, 1);
    g.state.party.roster[g.state.party.recruited[0]].level = 6;
    expect(stepOnto(g, g.map().down!)).toEqual({ kind: 'stairs', floor: 2, level: 6, warn: false });
  });
  it('descend goes down only from the stairs', () => {
    const g = new Game(calm(), null);
    g.depart(MAIN, 1);
    expect(g.descend()).toBeNull();   // standing on the entrance
    stepOnto(g, g.map().down!);
    expect(g.descend()).toEqual({ kind: 'floor', floor: 2 });
    expect([g.floor, g.pos]).toEqual([2, g.map().entrance]);
  });
  it('declining keeps the party on the stairs; stepping off and back asks again', () => {
    const g = new Game(calm(), null);
    g.depart(MAIN, 1);
    const at = g.map().down!;
    stepOnto(g, at);
    const off = DIRS.find((d) => tileAt(g.map(), { x: at.x + DELTA[d].x, y: at.y + DELTA[d].y }) !== 'wall')!;
    const back = ({ up: 'down', down: 'up', left: 'right', right: 'left' } as const)[off];
    g.move(off);
    expect([g.floor, g.pos]).toEqual([1, { x: at.x + DELTA[off].x, y: at.y + DELTA[off].y }]);
    expect(g.move(back).kind).toBe('stairs');
    expect(g.pos).toEqual(at);
  });
  it('a beaten region boss leaves stairs that ask the same way', () => {
    const g = new Game(calm(), null);
    g.state.dungeon.reached.iron = 5;
    g.depart({ region: 'iron', condition: 'plain' }, 5);
    const at = g.map().boss!;
    stepOnto(g, at);
    for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; }
    g.submitRound({});
    expect(stepOnto(g, at)).toMatchObject({ kind: 'stairs', floor: 6, level: 22 });
    expect(g.floor).toBe(5);
  });
});

describe('dungeon gear', () => {
  const packed = (g: Game) => g.run!.loot.gear.map((it) => it.uid);
  const rareCount = (r: Record<string, number>) => RARE_MATERIALS.reduce((n, m) => n + (r[m] ?? 0), 0);

  it('an elite always drops magic-or-better gear and one rare material', () => {
    const g = inMap(1);
    stepOnto(g, plantAt(g, 'elite'));
    expect(g.battle!.enemies[0].tint).toBe('elite');
    const end = killAll(g);
    expect(end.outcome).toBe('win');
    expect(end.gear).toHaveLength(1);
    expect(end.gear[0].rarity).not.toBe('common');
    expect(end.gear[0].ilvl).toBe(itemLevel(1, 'elite'));
    expect(end.gearLeft).toEqual([]);
    expect(packed(g)).toEqual([end.gear[0].uid]);
    expect(rareCount(end.drops)).toBe(1);
    expect(rareCount(g.run!.loot.items)).toBe(1);
  });

  it('a boss drops rare-or-better; the same region and depth again passes bossRepeat', () => {
    const spy = vi.mocked(rollBossGear);
    spy.mockClear();
    const g = new Game(calm(), null);
    g.state.dungeon.reached.iron = 5;
    const beat = () => {
      expect(g.depart({ region: 'iron', condition: 'plain' }, 5)).toEqual({ ok: true });
      stepOnto(g, g.map().boss!);
      return killAll(g);
    };
    const end = beat();
    expect(end.gear).toHaveLength(2);
    expect(['common', 'magic']).not.toContain(end.gear[0].rarity);
    expect(end.gear.map((it) => it.ilvl)).toEqual([itemLevel(5, 'boss'), itemLevel(5, 'boss')]);
    expect(packed(g)).toEqual(end.gear.map((it) => it.uid));
    expect(spy.mock.calls[0][1]).toMatchObject({ bossRepeat: false, depth: 5, region: 'iron' });
    expect(g.state.dungeon.bossKills['iron:5']).toBe(1);
    g.state.inventory['return-lamp'] = 1;
    expect(g.useReturnLamp()).toBe(true);
    beat();
    expect(spy.mock.calls[1][1]).toMatchObject({ bossRepeat: true });
    expect(g.state.dungeon.bossKills['iron:5']).toBe(2);
  });

  it('the mainline story boss counts as a boss kill and drops boss gear', () => {
    const g = inMap(3);
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    expect(g.phase).toBe('clear');
    expect(end.gear).toHaveLength(2);
    expect(g.state.dungeon.bossKills['mainline:3']).toBe(1);
  });

  it('ordinary battles roll gear per monster at the monster chance, from the loot rng', () => {
    let pieces = 0; let monsters = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const g = new Game(mulberry32(seed), null);
      g.depart(MAIN, 1);
      g.encounter = 99;
      g.move('right');
      const n = g.battle!.enemies.length;
      const draws = g.run!.lootDraws;
      const end = killAll(g);
      expect(g.run!.lootDraws - draws).toBe(n);   // one loot draw per monster
      for (const it of end.gear) expect(it.ilvl).toBe(itemLevel(1, 'monster'));
      expect(packed(g)).toEqual(end.gear.map((it) => it.uid));
      monsters += n;
      pieces += end.gear.length;
    }
    expect(pieces / monsters).toBeGreaterThan(GEAR_CHANCE.monster - 0.04);
    expect(pieces / monsters).toBeLessThan(GEAR_CHANCE.monster + 0.04);
  });

  it('a chest with gear gives its materials and the item; weight counts both', () => {
    const g = inMap(1);
    const chest = chestWhere(g, true);
    const room = () => capacity(g.state.party) - carried(g.state, g.run!);
    g.run!.loot.items['star-stone'] = Math.floor(room() * 2);   // full to within half a unit
    const full = stepOnto(g, chest) as Extract<MoveResult, { kind: 'full' }>;
    expect(full).toMatchObject({ kind: 'full', item: 'old-coin', qty: 2 });
    const gear = full.gear!;
    expect(gear.ilvl).toBe(itemLevel(1, 'chest'));
    const want = 2 * weightOf('old-coin') + itemWeight(gear);
    expect(full.need).toBeCloseTo(want - room());
    // Room for the coins alone is not enough: the gear weighs too.
    g.run!.loot.items['star-stone'] -= Math.ceil((2 * weightOf('old-coin') - room()) * 2);
    expect(room()).toBeGreaterThanOrEqual(2 * weightOf('old-coin'));
    expect(room()).toBeLessThan(want);
    expect(stepOnto(g, chest)).toMatchObject({ kind: 'full', gear });   // the same roll, kept
    g.run!.loot.items['star-stone'] -= Math.ceil((want - room()) * 2);
    expect(stepOnto(g, chest)).toEqual({ kind: 'chest', item: 'old-coin', qty: 2, gear });
    expect(g.run!.loot.items['old-coin']).toBe(2);
    expect(g.run!.loot.gear).toEqual([gear]);
    expect(g.run!.gearRolls[`chest:1:${posKey(chest)}`]).toEqual(gear);
  });

  it('a vault triples materials only and adds a rare material and a rare-or-better item', () => {
    const g = inMap(1);
    const at = plantAt(g, 'vault');
    g.run!.keys.add(1);
    stepOnto(g, at);
    const r = g.openVault(at) as Extract<MoveResult, { kind: 'vault' }>;
    expect(r.kind).toBe('vault');
    expect(r.loot['old-coin']).toBe(2 * 3);   // a depth 1 chest gives 2 old coins
    expect(rareCount(r.loot)).toBe(1);
    expect(Object.keys(r.loot)).toHaveLength(2);
    expect(r.gear).toHaveLength(1);
    expect(['common', 'magic']).not.toContain(r.gear[0].rarity);
    expect(r.gear[0].ilvl).toBe(itemLevel(1, 'vault'));
    expect(packed(g)).toEqual([r.gear[0].uid]);
    expect(rareCount(g.run!.loot.items)).toBe(1);
  });

  it('gear waits in the run pack and is banked, specials and sets into the codex', () => {
    const g = inMap(1);
    const set = Object.values(SETS)[0];
    const special = gearItem(901, { special: 'lg-noel', rarity: 'legendary' });
    const piece = gearItem(902, { special: set.pieces[0], rarity: 'set' });
    const plain = gearItem(903);
    g.state.codex = ['lg-noel'];
    g.run!.loot.gear = [special, piece, plain];
    expect(g.state.bag).toEqual([]);
    stepOnto(g, g.map().entrance);
    expect(g.returnToTown()).toBe(true);
    expect(g.state.bag).toEqual([special, piece, plain]);
    expect(g.state.codex).toEqual(['lg-noel', set.pieces[0], set.id]);
    expect(g.banked).toMatchObject({ gear: [special, piece, plain], overflow: [] });
    expect(g.notice).toBe('banked');
  });

  it('a gear-only run still banks', () => {
    const g = inMap(1);
    const it = gearItem(901);
    g.run!.loot.gear = [it];
    g.state.inventory['return-lamp'] = 1;
    expect(g.useReturnLamp()).toBe(true);
    expect([g.notice, g.state.bag]).toEqual(['banked', [it]]);
    expect(g.banked).toEqual({ items: {}, gold: 0, viaLamp: true, gear: [it], overflow: [] });
  });

  it('banking past 60 bag slots keeps the first ones and reports the rest', () => {
    const g = inMap(1);
    g.state.bag = Array.from({ length: BAG_SIZE - 1 }, (_, i) => gearItem(1000 + i));
    const a = gearItem(901); const b = gearItem(902);
    g.run!.loot.gear = [a, b];
    stepOnto(g, g.map().entrance);
    g.returnToTown();
    expect(g.state.bag).toHaveLength(BAG_SIZE);
    expect(g.state.bag[BAG_SIZE - 1]).toEqual(a);
    expect(g.banked).toMatchObject({ gear: [a], overflow: [b] });
  });

  it('a wipe loses run gear and leaves the codex untouched', () => {
    const g = inMap(1, mulberry32(1));
    g.state.codex = ['lg-noel'];
    g.state.bag = [gearItem(800)];
    g.run!.loot.gear = [gearItem(901, { special: 'lg-liz', rarity: 'legendary' })];
    g.encounter = 99;
    expect(g.move('right')).toEqual({ kind: 'battle' });
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    expect(g.submitRound({})!.end!).toMatchObject({ outcome: 'lose', gear: [], gearLeft: [] });
    expect([g.run, g.notice, g.banked]).toEqual([null, 'wipe', null]);
    expect(g.state.bag.map((it) => it.uid)).toEqual([800]);
    expect(g.state.codex).toEqual(['lg-noel']);
  });

  it('a full bag (60 with the run pack) keeps the chest shut and reports full with bag: true; discarding makes room', () => {
    const g = inMap(1);
    const chest = chestWhere(g, true);
    g.state.bag = Array.from({ length: BAG_SIZE - 1 }, (_, i) => gearItem(1000 + i));
    const carriedOne = gearItem(901);
    g.run!.loot.gear = [carriedOne];
    const r = stepOnto(g, chest);
    expect(r).toMatchObject({ kind: 'full', item: 'old-coin', qty: 2, bag: true });
    expect((r as { gear?: ItemInstance }).gear).toBeDefined();
    expect(g.run!.opened.has(`1:${posKey(chest)}`)).toBe(false);
    expect(g.run!.loot.items['old-coin']).toBeUndefined();
    expect(g.discardGear(12345)).toBe(false);
    expect(g.discardGear(carriedOne.uid)).toBe(true);
    expect(g.run!.loot.gear).toEqual([]);
    const opened = stepOnto(g, chest);
    expect(opened).toMatchObject({ kind: 'chest', item: 'old-coin', qty: 2 });
    expect(g.run!.loot.gear).toEqual([(opened as { gear: ItemInstance }).gear]);
  });

  it('discardGear only works on the map', () => {
    const g = inMap(1);
    const it = gearItem(901);
    g.run!.loot.gear = [it];
    g.phase = 'battle';
    expect(g.discardGear(it.uid)).toBe(false);
    g.phase = 'map';
    expect(g.discardGear(it.uid)).toBe(true);
  });

  it('picked-up gear follows the auto-junk setting', () => {
    const g = inMap(1);
    g.state.autoJunk = 'magic';
    stepOnto(g, plantAt(g, 'elite'));
    const end = killAll(g);
    const it = g.run!.loot.gear[0];
    expect(it.uid).toBe(end.gear[0].uid);
    expect(it.junk).toBe(it.rarity === 'magic' ? true : undefined);
  });

  it('Game.mintUid hands out the next uid', () => {
    const g = new Game(calm(), null);
    const n = g.state.nextUid;
    expect([g.mintUid(), g.mintUid(), g.state.nextUid]).toEqual([n, n + 1, n + 2]);
  });

  it('capacity rises by 5 when a member wears str +10', () => {
    const g = new Game(calm(), null);
    const id = activeIds(g.state.party).find((x) => CHARACTERS[x].affinity === 'str')!;   // str turns into 1.5x atk here
    const before = capacity(g.state.party);
    g.state.party.roster[id].equip.ring1 = { uid: 900, base: 'copper-ring', rarity: 'magic', ilvl: 1, affixes: [{ key: 'str', value: 10 }], enhance: 0 };
    expect(capacity(g.state.party)).toBeCloseTo(before + 5);
  });

  it('gear randomness does not touch game.rng', () => {
    const play = (gear: boolean) => {
      const g = inMap(1, mulberry32(77));
      const before = g.rng();
      const r = stepOnto(g, chestWhere(g, gear));
      return { before, after: g.rng(), r, draws: g.run!.lootDraws };
    };
    const withGear = play(true);
    const control = play(false);
    expect(withGear.r).toMatchObject({ kind: 'chest' });
    expect((withGear.r as { gear?: ItemInstance }).gear).toBeDefined();
    expect(withGear.draws).toBeGreaterThan(0);
    expect(control.draws).toBe(0);
    expect([withGear.before, withGear.after]).toEqual([control.before, control.after]);
  });

  it('a chest with gear rolls the same item from the same seed', () => {
    const roll = () => {
      const g = inMap(1, mulberry32(77));
      return stepOnto(g, chestWhere(g, true));
    };
    expect(roll()).toEqual(roll());
  });

  it('the merchant checks bag room for gear and weight for everything else', () => {
    const g = inMap(1);
    const at = { ...g.pos };
    floorOf(g.run!, g.floor).contents.push({ kind: 'merchant', at, room: 0, stock: ['iron-sword', 'potion'] });
    g.state.gold = 9999;
    g.run!.loot.items['star-stone'] = Math.ceil((capacity(g.state.party) - carried(g.state, g.run!)) * 2) + 2;   // over the limit
    expect(g.buy(at, 'potion')).toEqual({ ok: false, reason: 'full' });
    expect(g.buy(at, 'iron-sword').ok).toBe(true);   // gear goes to the bag, which has room
    expect(g.state.bag.map((it) => it.base)).toEqual(['iron-sword']);
    g.state.bag = Array.from({ length: BAG_SIZE - 1 }, (_, i) => gearItem(1000 + i));
    g.run!.loot.gear = [gearItem(901)];
    g.run!.loot.items = {};
    expect(g.buy(at, 'iron-sword')).toEqual({ ok: false, reason: 'full' });   // 59 in the bag and 1 in the run pack
  });
});
