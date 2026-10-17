import { describe, it, expect, vi } from 'vitest';
import { Game, type MoveResult } from './game';
import { SAVE_KEY, loadGame, saveGame } from './save';
import { newGame, START_ITEMS } from './state';
import { constRng, memoryStorage, plainItem } from './testing';
import { mulberry32 } from './rng';
import { rollPortals, validPortals } from './portals';
import { DELTA, posKey, tileAt, type Dir } from './map';
import { floorOf, type Portal } from './dungeon/run';
import { capacity, carried, weightOf } from '../data/weights';
import type { CharacterId, ItemInstance, Pos } from './types';
import { ENEMIES } from '../data/enemies';
import { CHARACTERS } from '../data/characters';
import { SETS } from '../data/gear';
import { activeIds, expToNext, gainExp, MAX_LEVEL, meet, newMember, rowOfCell, LEGACY_LINEUP, START_LINEUP } from './party';
import { depthClearExp, empower, encounterGroup, groupCap } from './scaling';
import { favouredRegions } from '../data/meetings';
import { MAX_ACTIVE } from './formation';
import { ABYSS, ABYSS_UNLOCK } from '../data/hero';
import { CONDITIONS } from '../data/conditions';
import { BAG_SIZE } from './loot/bag';
import { MAX_ILVL, MAX_REACHED } from './levels';
import { chestHasGear, GEAR_CHANCE, RARE_MATERIALS, rollBossGear } from './loot/drops';
import { itemLevel, itemWeight, rollItem } from './loot/item';
import { MATERIALS } from '../data/materials';
import { buy } from './town';
import { memoriesOf } from './progression';
import { PERKS, SHARD_PRICE, FRAGMENT_WEIGHT, SHARD_DROP, SHARD_IDS, TOWN_DROP } from '../data/story/fragments';
import { fragmentItem } from './story/fragments';

vi.mock('./portals', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./portals')>();
  return { ...mod, rollPortals: vi.fn(mod.rollPortals) };
});

// Wrapped so a test can see what the game asked the boss roll for; it still rolls for real.
vi.mock('./loot/drops', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./loot/drops')>();
  return { ...mod, rollBossGear: vi.fn(mod.rollBossGear) };
});

/** The legacy five with the hero in Scarlet's place: a save needs the hero on the field. */
const HERO_LINEUP: CharacterId[] = ['hero', 'chizuru', 'liz', 'noel', 'selene'];
const calm = () => constRng(0.99); // step gain 12 on floor 1, never rolls an early encounter
const MAIN: Portal = { region: 'mainline', condition: 'plain' };
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const inMap = (floor = 1, rng = calm(), storage = memoryStorage()) => {
  const g = new Game(rng, storage, undefined, 0, HERO_LINEUP);
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
  it('a fresh game starts with two and carries START_ITEMS', () => {
    const g = Game.fresh(calm(), memoryStorage());
    expect(g.state.party.recruited).toEqual(START_LINEUP);
    expect(g.state.inventory).toEqual(START_ITEMS);
    expect(START_ITEMS.potion).toBe(5);
    expect(Game.boot(calm(), memoryStorage()).state.party.recruited).toEqual(START_LINEUP);
    expect(new Game(calm(), null).state.party.recruited).toEqual(START_LINEUP);
    expect(new Game(calm(), null, undefined, 0, START_LINEUP).state.party.recruited).toEqual(START_LINEUP);
  });
  it('starts a new game in town on an empty slot', () => {
    const g = Game.boot(calm(), memoryStorage());
    expect([g.phase, g.notice, g.state.gold]).toEqual(['town', null, 150]);
  });
  it('flags a reset when the save is unreadable', () => {
    const g = Game.boot(calm(), memoryStorage({ [SAVE_KEY]: '{bad' }));
    expect([g.phase, g.notice]).toEqual(['town', 'save-reset']);
    expect(g.state.party.recruited).toEqual(START_LINEUP);   // the reset game is the two-person start
    expect(activeIds(g.state.party)).toEqual(START_LINEUP);
  });
  it('works without storage', () => {
    const g = Game.boot(calm(), null);
    expect(g.phase).toBe('town');
    expect(g.state.party.recruited).toEqual(START_LINEUP);
    expect(activeIds(g.state.party)).toEqual(START_LINEUP);
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
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
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
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    expect(g.depart(MAIN, 2)).toEqual({ ok: false, reason: 'locked' });
    for (const id of ['scarlet', 'chizuru', 'liz', 'noel', 'selene'] as const) g.state.party.roster[id].hp = 0;
    expect(g.depart(MAIN, 1)).toEqual({ ok: false, reason: 'party-down' });
    expect(g.phase).toBe('town');
    expect(g.run).toBeNull();
  });
  it('departing twice gives different floors', () => {
    const g = new Game(mulberry32(3), null, undefined, 0, LEGACY_LINEUP);
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
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
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
    expect(new Game(calm(), null, undefined, 0, LEGACY_LINEUP).move('right')).toEqual({ kind: 'ignored' });
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
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.depart({ region: 'mainline', condition: 'bounty' }, 1);
    expect(stepOnto(g, plainChest(g))).toEqual({ kind: 'chest', item: 'old-coin', qty: 3 });   // 2 x 1.5
  });
  it('descending past MAX_REACHED keeps reached capped, pays no exp, and the save still loads', () => {
    const st = memoryStorage();
    const g = new Game(calm(), st, undefined, 0, HERO_LINEUP);
    g.state.dungeon.reached.mainline = MAX_REACHED;
    expect(g.depart(MAIN, MAX_REACHED)).toEqual({ ok: true });
    const exp = JSON.stringify(g.state.party);
    g.floor = MAX_REACHED + 1;   // the boss floor at the cap has no stairs; floors below the cap are covered above
    expect(downstairs(g, g.map().down!)).toMatchObject({ kind: 'floor', floor: MAX_REACHED + 2 });
    expect(g.state.dungeon.reached.mainline).toBe(MAX_REACHED);
    expect(JSON.stringify(g.state.party)).toBe(exp);
    expect(downstairs(g, g.map().down!)).toMatchObject({ kind: 'floor', floor: MAX_REACHED + 3 });
    expect(g.state.dungeon.reached.mainline).toBe(MAX_REACHED);
    expect(saveGame(st, g.state)).toBe(true);
    expect(loadGame(st).status).toBe('ok');
  });
  it('stairs go one deeper and never back', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.depart(MAIN, 1);
    expect(downstairs(g, g.map().down!)).toMatchObject({ kind: 'floor', floor: 2 });
    expect([g.floor, g.pos, g.state.dungeon.reached.mainline]).toEqual([2, g.map().entrance, 2]);
    const m = g.map();
    expect(m.up).toBeNull();
    expect(m.tiles.flat()).not.toContain('up');
    expect(stepOnto(g, m.entrance)).toEqual({ kind: 'entrance' });   // the way in is the way home, not back up
    expect(g.floor).toBe(2);
  });
  it('a random region keeps going past depth 3', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.depart({ region: 'storm', condition: 'plain' }, 1);
    for (const d of [2, 3, 4, 5]) expect(downstairs(g, g.map().down!)).toMatchObject({ kind: 'floor', floor: d });
    expect(g.state.dungeon.reached.storm).toBe(5);
    expect(g.map().boss).not.toBeNull();
    expect(g.map().down).toBeNull();
    expect(g.run!.floors.has(4)).toBe(true);
  });
  it('halves the gauge gain with stealth', () => {
    const g = inMap(1);
    g.state.party.roster.liz.tree = { 'twin-slash': 1, stealth: 1 };
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
    const sc = g.state.party.roster.hero; // a floor-1 fight gives < 60 exp, so at most one level-up (15 exp)
    expect(sc.exp + (sc.level - 1) * 15).toBe(r.end!.exp);
  });
  it("a fight carries its floor's abyss bonus, which grows with the depth", () => {
    expect(startBattle().battle!.abyss).toBe(ABYSS.perDepth * 1);
    const deep = inMap(2, mulberry32(1));
    deep.encounter = 99;
    expect(deep.move('right')).toEqual({ kind: 'battle' });
    expect(deep.battle!.abyss).toBe(ABYSS.perDepth * 2);
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
    const g = new Game(mulberry32(5), storage, undefined, 0, HERO_LINEUP);
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
  it('the mainline boss is on depth 3 and its defeat ends Act 1', () => {
    const g = inMap(3);
    expect(g.map().boss).not.toBeNull();
    const at = g.map().boss!;
    expect(stepOnto(g, at)).toEqual({ kind: 'boss' });
    expect(g.battle!.boss).toBe(true);
    for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; }
    expect(g.submitRound({})!.end!.outcome).toBe('win');
    expect([g.phase, g.state.story.act1Cleared, g.cleared]).toEqual(['clear', true, 'act1']);
    expect(g.map().down).toEqual(at);   // the beaten boss leaves stairs down
    expect(tileAt(g.map(), at)).toBe('down');
    g.restartAfterClear();
    expect(g.phase).toBe('town');
    expect(g.run).toBeNull();
  });
  it('once the story boss is beaten, the mainline goes on past depth 3', () => {
    const g = inMap(3);
    g.returnToTown();
    g.state.story.act1Cleared = true;
    g.depart(MAIN, 3);
    const m = g.map();
    expect([m.boss, m.tiles.flat().includes('boss')]).toEqual([null, false]);
    expect(m.down).not.toBeNull();
    expect(downstairs(g, m.down!)).toMatchObject({ kind: 'floor', floor: 4 });
    expect([g.floor, g.state.dungeon.reached.mainline, g.phase]).toEqual([4, 4, 'map']);
    expect(g.map().down).not.toBeNull();
  });
  it('beating the depth-3 boss ends Act 1', () => {
    const g = inMap(3);
    stepOnto(g, g.map().boss!);
    for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; }
    g.submitRound({});
    expect(g.state.story.act1Cleared).toBe(true);
    expect(g.phase).toBe('clear');
    expect(g.cleared).toBe('act1');
    expect('bossDefeated' in g.state.dungeon).toBe(false);
    expect(g.state.story.queue).toContain('act1-after');
    g.restartAfterClear();
    expect(g.cleared).toBeNull();
  });
  it('after Act 1 the third floor holds stairs', () => {
    const g = inMap(3);
    g.returnToTown();
    g.state.story.act1Cleared = true;
    g.depart(MAIN, 3);
    expect(g.map().boss).toBeNull();
    expect(g.map().down).not.toBeNull();
  });
  it('a new game queues the prologue', () => {
    expect(new Game(calm(), null).state.story.queue).toEqual(['prologue']);
    expect(newGame().story).toEqual({ act1Cleared: false, finaleCleared: false, seen: [], fresh: [], queue: ['prologue'], nodes: [], pity: {}, returned: [], fed: false });
  });
  it('a region boss opens the stairs down instead of clearing the game', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.state.dungeon.reached.iron = 5;
    g.depart({ region: 'iron', condition: 'plain' }, 5);
    const at = g.map().boss!;
    expect(stepOnto(g, at)).toEqual({ kind: 'boss' });
    for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; }
    expect(g.submitRound({})!.end!.outcome).toBe('win');
    expect([g.phase, g.state.story.act1Cleared]).toEqual(['map', false]);
    expect(g.map().down).toEqual(at);
    expect(downstairs(g, at)).toMatchObject({ kind: 'floor', floor: 6 });
  });
  it('the story boss on mainline depth 3 is the plain 燈喰之獸', () => {
    const g = inMap(3);
    stepOnto(g, g.map().boss!);
    const b = g.battle!.enemies[0];
    // Not grown by depth or region; only ENEMY_POWER at its level applies.
    expect([b.name, b.max, b.tint]).toEqual(['燈喰之獸', empower(ENEMIES.lanterneater, b.level).stats, undefined]);
  });
  it('a region boss is the 燈喰之獸 grown by depth and region', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.state.dungeon.reached.blaze = 5;
    g.depart({ region: 'blaze', condition: 'plain' }, 5);
    stepOnto(g, g.map().boss!);
    const b = g.battle!.enemies[0];
    expect([b.name, b.tint, b.boss, b.resist, b.weak]).toEqual(['深層・熾焰・燈喰之獸', 'fire', true, ['fire'], ['ice']]);
    expect(b.max.hp).toBeGreaterThan(ENEMIES.lanterneater.stats.hp);
  });
  it('the run condition reaches the fight: 兇暴 enemies hit harder', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.depart({ region: 'mainline', condition: 'fierce' }, 1);
    g.encounter = 999;
    const open = DIRS.find((d) => tileAt(g.map(), { x: g.pos.x + DELTA[d].x, y: g.pos.y + DELTA[d].y }) === 'floor')!;
    expect(g.move(open)).toEqual({ kind: 'battle' });
    for (const e of g.battle!.enemies) expect(e.max.atk, e.defId).toBe(Math.round(ENEMIES[e.defId].stats.atk * 1.2));
  });
  it('encounters in a region are its variants, and deep mainline foes are 深層', () => {
    const fight = (region: Portal['region'], depth: number) => {
      const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
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
    const g = new Game(calm(), storage, undefined, 0, HERO_LINEUP);
    expect(g.rest().ok).toBe(true);
    expect(g.notice).toBe('saved');
    expect(storage.map.has(SAVE_KEY)).toBe(true);
  });
  it('reports a failed save without losing the rest', () => {
    const g = new Game(calm(), { getItem: () => null, setItem: () => { throw new Error('full'); } }, undefined, 0, HERO_LINEUP);
    expect(g.rest().ok).toBe(true);
    expect([g.notice, g.state.gold]).toEqual(['save-failed', 130]);
  });
  it('refuses to rest outside town, and saves nothing', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, HERO_LINEUP);
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    const gold = g.state.gold;
    expect(g.rest()).toEqual({ ok: false, reason: 'invalid' });
    expect([g.state.gold, g.notice, storage.map.has(SAVE_KEY)]).toEqual([gold, null, false]);
  });
  it('does not save when the rest is refused', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, HERO_LINEUP);
    g.state.gold = 0;
    expect(g.rest()).toEqual({ ok: false, reason: 'gold' });
    expect(storage.map.has(SAVE_KEY)).toBe(false);
  });
});

describe('run pack', () => {
  it('a full chest keeps its roll and does not touch the rng when stepped on again', () => {
    let calls = 0;
    const g = new Game(() => { calls++; return 0.99; }, null, undefined, 0, LEGACY_LINEUP);
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
      const g = new Game(mulberry32(seed), null, undefined, 0, LEGACY_LINEUP);
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
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
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
    const g = new Game(mulberry32(1), null, undefined, 0, LEGACY_LINEUP);
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
    const g = new Game(mulberry32(1), null, undefined, 0, LEGACY_LINEUP);
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
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
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
    const g = new Game(mulberry32(seed), null, undefined, 0, LEGACY_LINEUP);
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
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.depart(MAIN, 1);
    const at = g.map().down!;
    expect(stepOnto(g, at)).toEqual({ kind: 'stairs', floor: 2, level: 6, warn: true, rescue: false });   // a fresh Lv 1 party
    expect([g.floor, g.pos, g.state.dungeon.reached.mainline]).toEqual([1, at, 1]);
  });
  it('no warning once the top party level reaches the suggestion', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.depart(MAIN, 1);
    g.state.party.roster[g.state.party.recruited[0]].level = 6;
    expect(stepOnto(g, g.map().down!)).toEqual({ kind: 'stairs', floor: 2, level: 6, warn: false, rescue: false });
  });
  it('descend goes down only from the stairs', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.depart(MAIN, 1);
    expect(g.descend()).toBeNull();   // standing on the entrance
    stepOnto(g, g.map().down!);
    expect(g.descend()).toMatchObject({ kind: 'floor', floor: 2 });
    expect([g.floor, g.pos]).toEqual([2, g.map().entrance]);
  });
  it('declining keeps the party on the stairs; stepping off and back asks again', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
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
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
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
    expect(end.gear.length).toBeGreaterThanOrEqual(1);   // the elite piece first, then whatever the escorts dropped
    expect(end.gear[0].rarity).not.toBe('common');
    expect(end.gear[0].ilvl).toBe(itemLevel(1, 'elite'));
    for (const it of end.gear.slice(1)) expect(it.ilvl).toBe(itemLevel(1, 'monster'));
    expect(end.gearLeft).toEqual([]);
    expect(packed(g)).toEqual(end.gear.map((it) => it.uid));
    expect(rareCount(end.drops)).toBe(1);
    expect(rareCount(g.run!.loot.items)).toBe(1);
  });

  it('in an elite fight each escort still rolls monster gear on its own loot draw', () => {
    let escorts = 0; let escortPieces = 0; let fights = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      const g = inMap(1, mulberry32(seed));
      stepOnto(g, plantAt(g, 'elite'));
      const n = g.battle!.enemies.length;
      if (n < 2) continue;
      fights++;
      const draws = g.run!.lootDraws;
      const end = killAll(g);
      expect(g.run!.lootDraws - draws).toBe(1 + (n - 1));   // one for the elite piece and rare material, one per escort
      expect(end.gear[0].ilvl).toBe(itemLevel(1, 'elite'));
      escorts += n - 1;
      escortPieces += end.gear.filter((it) => it.ilvl === itemLevel(1, 'monster')).length;
    }
    expect(escorts).toBeGreaterThan(400);
    expect(escortPieces / escorts).toBeGreaterThan(GEAR_CHANCE.monster - 0.04);
    expect(escortPieces / escorts).toBeLessThan(GEAR_CHANCE.monster + 0.04);
  });

  it('a boss drops rare-or-better; the same region and depth again passes bossRepeat', () => {
    const spy = vi.mocked(rollBossGear);
    spy.mockClear();
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
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
      const g = new Game(mulberry32(seed), null, undefined, 0, LEGACY_LINEUP);
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
    // Room for the coins alone: the chest opens and pays them, and the gear (too heavy) waits in it.
    g.run!.loot.items['star-stone'] -= Math.ceil((2 * weightOf('old-coin') - room()) * 2);
    expect(room()).toBeGreaterThanOrEqual(2 * weightOf('old-coin'));
    expect(room()).toBeLessThan(want);
    const opened = stepOnto(g, chest) as Extract<MoveResult, { kind: 'chest' }>;
    expect(opened).toMatchObject({ kind: 'chest', item: 'old-coin', qty: 2, waiting: { kind: 'full', gear } });   // the same roll, kept
    expect(opened.gear).toBeUndefined();
    expect(opened.waiting!.bag).toBeUndefined();
    expect(opened.waiting!.need).toBeCloseTo(itemWeight(gear) - room());
    expect(g.run!.loot.items['old-coin']).toBe(2);
    expect(g.run!.loot.gear).toEqual([]);
    g.run!.loot.items['star-stone'] -= Math.ceil((itemWeight(gear) - room()) * 2);
    expect(stepOnto(g, chest)).toEqual({ kind: 'pickup', gear });
    expect(g.run!.loot.items['old-coin']).toBe(2);   // paid once
    expect(g.run!.loot.gear).toEqual([gear]);
    expect(g.run!.gearRolls[`chest:1:${posKey(chest)}`]).toEqual(gear);
    expect(stepOnto(g, chest)).toEqual({ kind: 'moved' });   // nothing left in it
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

  it('a full bag (60 with the run pack) still opens a gear chest and pays its materials; the gear waits in it until a discard', () => {
    const g = inMap(1);
    const chest = chestWhere(g, true);
    g.state.bag = Array.from({ length: BAG_SIZE - 1 }, (_, i) => gearItem(1000 + i));
    const carriedOne = gearItem(901);
    g.run!.loot.gear = [carriedOne];
    const r = stepOnto(g, chest) as Extract<MoveResult, { kind: 'chest' }>;
    expect(r).toMatchObject({ kind: 'chest', item: 'old-coin', qty: 2, waiting: { kind: 'full', need: 0, bag: true } });
    expect(r.gear).toBeUndefined();
    const gear = r.waiting!.gear!;
    expect(gear).toEqual(g.run!.gearRolls[`chest:1:${posKey(chest)}`]);
    expect(g.run!.opened.has(`1:${posKey(chest)}`)).toBe(true);
    expect(g.run!.loot.items['old-coin']).toBe(2);   // the materials are paid at once
    expect(g.run!.loot.gear).toEqual([carriedOne]);
    expect(g.run!.waiting[`1:${posKey(chest)}`]).toEqual(g.run!.gearRolls[`chest:1:${posKey(chest)}`]);   // the map marks this
    // Still full: the gear is still waiting there, the materials are not paid again.
    expect(g.pickUpHere()).toMatchObject({ kind: 'full', need: 0, bag: true, gear });
    expect(stepOnto(g, chest)).toMatchObject({ kind: 'full', bag: true, gear });
    expect(g.run!.loot.items['old-coin']).toBe(2);
    expect(g.discardGear(12345)).toBe(false);
    expect(g.discardGear(carriedOne.uid)).toBe(true);
    expect(g.pickUpHere()).toEqual({ kind: 'pickup', gear });
    expect(g.run!.loot.gear).toEqual([gear]);
    expect(g.run!.loot.items['old-coin']).toBe(2);
    expect(g.run!.waiting).toEqual({});
    expect(g.pickUpHere()).toBeNull();   // taken: nothing waits here any more
  });

  it('a full bag still opens the vault: all its materials and the rare material are paid, the gear waits on the vault tile', () => {
    const g = inMap(1);
    const at = plantAt(g, 'vault');
    g.run!.keys.add(1);
    g.state.bag = Array.from({ length: BAG_SIZE }, (_, i) => gearItem(1000 + i));
    expect(stepOnto(g, at).kind).toBe('event');
    const r = g.openVault(at) as Extract<MoveResult, { kind: 'vault' }>;
    expect(r).toMatchObject({ kind: 'vault', gear: [], waiting: { kind: 'full', need: 0, bag: true } });
    expect(r.loot['old-coin']).toBe(2 * 3);
    expect(rareCount(r.loot)).toBe(1);
    expect(rareCount(g.run!.loot.items)).toBe(1);
    expect(g.run!.loot.items['old-coin']).toBe(6);
    const gear = r.waiting!.gear!;
    expect(['common', 'magic']).not.toContain(gear.rarity);
    expect(g.openVault(at)).toBeNull();   // it never pays twice
    expect(tileAt(g.map(), at)).toBe('vault');   // the gear still waits there
    expect(g.pickUpHere()).toMatchObject({ kind: 'full', bag: true, gear });
    // Walking off and back onto the vault offers the waiting gear, not the vault window.
    expect(stepOnto(g, at)).toMatchObject({ kind: 'full', bag: true, gear });
    g.state.bag.pop();   // one slot freed
    expect(g.pickUpHere()).toEqual({ kind: 'pickup', gear });
    expect(g.run!.loot.gear).toEqual([gear]);
    expect(tileAt(g.map(), at)).toBe('floor');
    expect(rareCount(g.run!.loot.items)).toBe(1);
    expect(g.run!.loot.items['old-coin']).toBe(6);
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
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200 && seen.size < 2; seed++) {
      const g = inMap(1, mulberry32(seed));
      g.state.autoJunk = 'magic';
      stepOnto(g, plantAt(g, 'elite'));
      const end = killAll(g);
      const it = g.run!.loot.gear[0];
      expect(it.uid).toBe(end.gear[0].uid);
      const junked = it.rarity === 'common' || it.rarity === 'magic';
      expect(it.junk).toBe(junked ? true : undefined);
      seen.add(junked ? 'junk' : 'kept');
    }
    expect([...seen].sort()).toEqual(['junk', 'kept']);   // both branches really ran
  });

  it('the gear in a full result already carries its auto-junk mark', () => {
    let checked = 0;
    for (let seed = 1; seed <= 200 && !checked; seed++) {
      const g = inMap(1, mulberry32(seed));
      g.state.autoJunk = 'magic';
      const chest = chestWhere(g, true);
      g.state.bag = Array.from({ length: BAG_SIZE }, (_, i) => gearItem(1000 + i));
      const full = (stepOnto(g, chest) as Extract<MoveResult, { kind: 'chest' }>).waiting!;
      expect(full).toMatchObject({ kind: 'full', bag: true });
      if (full.gear!.rarity !== 'common' && full.gear!.rarity !== 'magic') continue;
      checked++;
      expect(full.gear!.junk).toBe(true);
      g.state.bag = [];
      const r = stepOnto(g, chest) as Extract<MoveResult, { kind: 'pickup' }>;
      expect(r.gear).toEqual(full.gear);   // shown exactly as it is picked up
    }
    expect(checked).toBe(1);
  });

  it('Game.mintUid hands out the next uid', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    const n = g.state.nextUid;
    expect([g.mintUid(), g.mintUid(), g.state.nextUid]).toEqual([n, n + 1, n + 2]);
  });

  it('capacity rises by 5 when a member wears str +10', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
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

  it('merchant gear goes into the run pack and needs both carry weight and a bag slot, like chest gear', () => {
    const g = inMap(1);
    const at = { ...g.pos };
    floorOf(g.run!, g.floor).contents.push({ kind: 'merchant', at, room: 0, stock: ['iron-sword', 'potion'] });
    g.state.gold = 9999;
    const room = () => capacity(g.state.party) - carried(g.state, g.run!);
    g.run!.loot.items['star-stone'] = Math.ceil(room() * 2) + 2;   // over the limit
    expect(g.buy(at, 'potion')).toEqual({ ok: false, reason: 'full' });
    expect(g.buy(at, 'iron-sword')).toEqual({ ok: false, reason: 'full' });   // gear weighs too
    g.run!.loot.items = {};
    const gold = g.state.gold;
    expect(g.buy(at, 'iron-sword').ok).toBe(true);
    expect(g.state.gold).toBe(gold - 40);
    expect(g.state.bag).toEqual([]);   // not straight into the town bag
    expect(g.run!.loot.gear.map((it) => it.base)).toEqual(['iron-sword']);
    expect(carried(g.state, g.run!)).toBe(carried(g.state, null) + itemWeight(g.run!.loot.gear[0]));
    g.state.bag = Array.from({ length: BAG_SIZE - 1 }, (_, i) => gearItem(1000 + i));
    expect(g.buy(at, 'iron-sword')).toEqual({ ok: false, reason: 'full' });   // 59 in the bag and 1 in the run pack
    expect(g.run!.loot.gear).toHaveLength(1);
  });

  it('gear the player pays for is never marked as junk', () => {
    const g = inMap(1);
    const at = { ...g.pos };
    floorOf(g.run!, g.floor).contents.push({ kind: 'merchant', at, room: 0, stock: ['iron-sword'] });
    g.state.gold = 9999;
    g.state.autoJunk = 'common';
    expect(g.buy(at, 'iron-sword').ok).toBe(true);
    expect(g.run!.loot.gear).toHaveLength(1);
    expect(g.run!.loot.gear[0].rarity).toBe('common');
    expect(g.run!.loot.gear[0].junk).toBeUndefined();
  });

  it('merchant gear is lost on a wipe like any other run loot', () => {
    const g = inMap(1, mulberry32(1));
    const at = { ...g.pos };
    floorOf(g.run!, g.floor).contents.push({ kind: 'merchant', at, room: 0, stock: ['iron-sword'] });
    g.state.gold = 9999;
    expect(g.buy(at, 'iron-sword').ok).toBe(true);
    g.encounter = 99;
    expect(g.move('right')).toEqual({ kind: 'battle' });
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    expect(g.submitRound({})!.end!.outcome).toBe('lose');
    expect([g.run, g.state.bag]).toEqual([null, []]);
  });
});

describe('depth-clear exp', () => {
  it('descending pays the depth-clear exp: full to the standing, half to the bench, none to the downed', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.state.party = meet(g.state.party, 'sylvie', 1);
    g.depart(MAIN, 1);
    const p = g.state.party;
    expect(activeIds(p)).not.toContain('sylvie');
    p.roster.selene.hp = 0;
    const r = downstairs(g, g.map().down!);
    if (r?.kind !== 'floor' || !r.clear) throw new Error('no clear');
    const exp = depthClearExp(1);
    expect(r.clear.exp).toBe(exp);
    const q = g.state.party.roster;
    expect(q.scarlet.level).toBeGreaterThan(1);
    expect(r.clear.levelUps.map((u) => u.id)).toContain('scarlet');
    expect(r.clear.levelUps.every((u) => u.levels > 0)).toBe(true);
    const bench = gainExp(newMember('sylvie'), Math.floor(exp / 2)).member;   // half the clear exp, from Lv1 with 0 exp
    expect([q.sylvie.level, q.sylvie.exp]).toEqual([bench.level, bench.exp]);
    expect([q.selene.level, q.selene.exp]).toEqual([1, 0]);
  });

  it('the fierce condition multiplies the clear exp', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.depart({ region: 'mainline', condition: 'fierce' }, 1);
    const r = downstairs(g, g.map().down!);
    if (r?.kind !== 'floor' || !r.clear) throw new Error('no clear');
    expect(r.clear.exp).toBe(Math.round(depthClearExp(1) * CONDITIONS.fierce.expMul));
  });

  it('descending at Lv50 grants nothing, reports no clear and does not throw', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.depart(MAIN, 1);
    for (const id of g.state.party.recruited) g.state.party.roster[id].level = MAX_LEVEL;
    const r = downstairs(g, g.map().down!);
    expect(r).toEqual({ kind: 'floor', floor: 2 });
    for (const id of g.state.party.recruited) expect([id, g.state.party.roster[id].level, g.state.party.roster[id].exp]).toEqual([id, MAX_LEVEL, 0]);
  });

  it('reports no clear when every active member is down and nobody waits on the bench', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.depart(MAIN, 1);
    expect(stepOnto(g, g.map().down!).kind).toBe('stairs');
    for (const id of g.state.party.recruited) g.state.party.roster[id].hp = 0;
    expect(g.descend()).toEqual({ kind: 'floor', floor: 2 });
    for (const id of g.state.party.recruited) expect([id, g.state.party.roster[id].exp]).toEqual([id, 0]);
  });

  it('a second run through a depth already cleared gets no grant', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.depart(MAIN, 1);
    const first = downstairs(g, g.map().down!);
    expect(first?.kind === 'floor' && first.clear?.exp).toBe(depthClearExp(1));
    expect(g.returnToTown()).toBe(true);
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    const before = structuredClone(g.state.party.roster);
    expect(downstairs(g, g.map().down!)).toEqual({ kind: 'floor', floor: 2 });
    expect(g.state.party.roster).toEqual(before);
  });

  it("another region's first clear of the same depth does get the grant", () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.depart(MAIN, 1);
    downstairs(g, g.map().down!);
    expect(g.returnToTown()).toBe(true);
    expect(g.depart({ region: 'storm', condition: 'plain' }, 1)).toEqual({ ok: true });
    const r = downstairs(g, g.map().down!);
    expect(r?.kind === 'floor' && r.clear?.exp).toBe(depthClearExp(1));
  });

  it('the grant follows the saved reached depth: a depth above it pays nothing, and the depth stays reached', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.state.dungeon.reached.mainline = 5;
    g.depart(MAIN, 1);
    expect(downstairs(g, g.map().down!)).toEqual({ kind: 'floor', floor: 2 });
    expect(g.state.dungeon.reached.mainline).toBe(5);
  });
});

describe('respec', () => {
  const spend = (g: Game) => { g.state.party.roster.hero.talents = { 'hero-t01': 1 }; };
  it('saves the respec: a reload keeps the reset build and the gold taken', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, HERO_LINEUP);
    spend(g);
    const gold = g.state.gold;
    expect(g.respec('hero').ok).toBe(true);
    expect(g.notice).toBe('saved');
    const back = Game.boot(calm(), storage);
    expect(back.state.party.roster.hero.talents).toEqual({});
    expect(back.state.gold).toBe(gold - 25);
  });
  it('is refused outside town and then changes nothing', () => {
    const g = inMap();
    spend(g);
    const gold = g.state.gold;
    expect(g.respec('hero')).toEqual({ ok: false, reason: 'invalid' });
    expect(g.state.gold).toBe(gold);
    expect(g.state.party.roster.hero.talents).toEqual({ 'hero-t01': 1 });
  });
});

describe('recall', () => {
  /** Town, the hero's five on the field, and Bobby and Sylvie met and waiting. */
  const waiting = (lineup: CharacterId[] = HERO_LINEUP) => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, lineup);
    g.state.party = meet(meet(g.state.party, 'bobby', 1), 'sylvie', 1);
    return { g, storage };
  };
  const saved = (storage: ReturnType<typeof memoryStorage>) => { const r = loadGame(storage); return r.status === 'ok' ? r.state.party : null; };
  it('recall fills an empty cell and saves', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, START_LINEUP);
    g.state.party = meet(g.state.party, 'bobby', 1);
    g.state.party = { ...g.state.party, grid: g.state.party.grid.map((c) => (c === 'bobby' ? null : c)) };
    expect(g.recall('bobby', 'hero')).toEqual({ ok: true });   // room on the field: `out` is ignored
    expect(g.state.party.grid.filter((c) => c).length).toBe(3);
    expect(g.state.party.grid[g.state.party.grid.indexOf('bobby')]).toBe('bobby');
    expect(rowOfCell(g.state.party.grid.indexOf('bobby'))).toBe(CHARACTERS.bobby.row);   // she takes her own row
    expect(g.notice).toBeNull();
    expect(g.state.party.grid).toContain('hero');
    expect(saved(storage)!.grid).toEqual(g.state.party.grid);
  });
  it('a full field takes the one who steps out, in her cell', () => {
    const { g, storage } = waiting();
    const cell = g.state.party.grid.indexOf('liz');
    expect(g.recall('bobby', 'liz')).toEqual({ ok: true });
    expect(g.state.party.grid[cell]).toBe('bobby');
    expect(g.state.party.grid).not.toContain('liz');
    expect(g.state.party.recruited).toContain('liz');   // she is on the bench, not gone
    expect(g.notice).toBeNull();
    expect(saved(storage)!.grid).toEqual(g.state.party.grid);
  });
  it('a full field needs someone to step out, never the hero', () => {
    const { g, storage } = waiting();
    g.recall('bobby', 'liz'); // seeds a save
    const before = JSON.stringify(g.state.party);
    const stored = storage.map.get(SAVE_KEY);
    expect(g.recall('sylvie')).toEqual({ ok: false, reason: 'invalid' });
    expect(g.recall('sylvie', 'hero')).toEqual({ ok: false, reason: 'invalid' });
    expect(g.recall('sylvie', 'liz')).toEqual({ ok: false, reason: 'invalid' });   // liz is on the bench now
    expect(JSON.stringify(g.state.party)).toBe(before);
    expect(storage.map.get(SAVE_KEY)).toBe(stored);
  });
  it('recall refuses the unmet, the hero and whoever is already on the field', () => {
    const { g } = waiting();
    const before = JSON.stringify(g.state.party);
    expect(g.recall('safira', 'liz')).toEqual({ ok: false, reason: 'invalid' });
    expect(g.recall('hero', 'liz')).toEqual({ ok: false, reason: 'invalid' });
    expect(g.recall('noel', 'liz')).toEqual({ ok: false, reason: 'invalid' });
    expect(JSON.stringify(g.state.party)).toBe(before);
  });
  it('recall works only in town', () => {
    const g = inMap(1);
    g.state.party = meet(g.state.party, 'bobby', 1);
    const before = JSON.stringify(g.state.party);
    expect(g.recall('bobby', 'liz')).toEqual({ ok: false, reason: 'invalid' });
    expect(JSON.stringify(g.state.party)).toBe(before);
  });
  it('reports a failed save without losing the change', () => {
    const g = new Game(calm(), { getItem: () => null, setItem: () => { throw new Error('full'); } }, undefined, 0, HERO_LINEUP);
    g.state.party = meet(g.state.party, 'bobby', 1);
    expect(g.recall('bobby', 'liz')).toEqual({ ok: true });
    expect(g.notice).toBe('save-failed');
    expect(g.state.party.grid).toContain('bobby');
  });
});

describe('setFormation', () => {
  const swapIn = (g: Game) => {
    g.state.party = meet(g.state.party, 'bobby', 1);
    return g.state.party.grid;
  };
  it('saves in town: the stored grid is the new one', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, START_LINEUP);
    const grid = [...swapIn(g)];
    const h = grid.indexOf('hero');
    const to = (h + 4) % 9;
    grid[to] = grid[h]; grid[h] = null;
    expect(g.setFormation(grid)).toEqual({ ok: true });
    expect(g.state.party.grid).toEqual(grid);
    const r = loadGame(storage);
    expect(r.status === 'ok' && r.state.party.grid).toEqual(grid);
  });
  it('a hero-less formation changes and saves nothing, and says why', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, START_LINEUP);
    const before = [...g.state.party.grid];
    const off = before.map((c) => (c === 'hero' ? null : c));
    expect(g.setFormation(off)).toEqual({ ok: false, reason: 'no-hero' });
    expect(g.state.party.grid).toEqual(before);
    expect(g.notice).toBeNull();
    expect(storage.map.has(SAVE_KEY)).toBe(false);
  });
  it('reports a failed save without losing the formation', () => {
    const g = new Game(calm(), { getItem: () => null, setItem: () => { throw new Error('full'); } }, undefined, 0, START_LINEUP);
    const grid = [...g.state.party.grid];
    const h = grid.indexOf('hero');
    const to = (h + 4) % 9;
    grid[to] = grid[h]; grid[h] = null;
    expect(g.setFormation(grid)).toEqual({ ok: true });
    expect([g.notice, g.state.party.grid]).toEqual(['save-failed', grid]);
  });
  it('in the labyrinth it counts at once but is not saved mid-run', () => {
    const storage = memoryStorage();
    const g = inMap(1, calm(), storage);
    const grid = [...g.state.party.grid];
    const h = grid.indexOf('hero');
    grid[h] = null; grid[4] = 'hero';
    expect(g.setFormation(grid)).toEqual({ ok: true });
    expect(g.state.party.grid).toEqual(grid);
    expect([g.notice, storage.map.has(SAVE_KEY)]).toEqual([null, false]);
  });
  it('is invalid outside town and the labyrinth', () => {
    const g = new Game(calm(), null, undefined, 0, START_LINEUP);
    g.phase = 'battle';
    expect(g.setFormation([...g.state.party.grid])).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('spending a skill point', () => {
  const lv2 = (g: Game) => { g.state.party.roster.noel = { ...g.state.party.roster.noel, level: 2 }; };
  it("raiseNode reads the hero's memories and the save loads back", () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, HERO_LINEUP);
    const tree = { 'hero-slash': 5, 'hero-sword-up': 5, 'hero-cleave': 5, 'hero-sunder': 5 };
    g.state.party.roster.hero = { ...g.state.party.roster.hero, level: 50, memories: ABYSS_UNLOCK[0] - 1, tree };
    expect(g.raiseNode('hero', 'abyss-sword')).toEqual({ ok: false, reason: 'abyss' });
    g.state.party.roster.hero = { ...g.state.party.roster.hero, memories: ABYSS_UNLOCK[0] };
    expect(g.raiseNode('hero', 'abyss-sword')).toEqual({ ok: true });
    expect(g.state.party.roster.hero.tree['abyss-sword']).toBe(1);
    const back = Game.boot(calm(), storage);
    expect(back.notice).toBeNull();
    expect(back.state.party.roster.hero.tree['abyss-sword']).toBe(1);
  });
  it('saves the spend in town: a reload keeps the new rank', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, HERO_LINEUP);
    lv2(g);
    expect(g.raiseNode('noel', 'ice-star')).toEqual({ ok: true });
    expect(g.state.party.roster.noel.tree).toEqual({ 'fire-star': 1, 'ice-star': 1 });
    const back = Game.boot(calm(), storage);
    expect(back.notice).toBeNull();
    expect(back.state.party.roster.noel.tree).toEqual({ 'fire-star': 1, 'ice-star': 1 });
  });
  it('reports a failed save without losing the spend', () => {
    const g = new Game(calm(), { getItem: () => null, setItem: () => { throw new Error('full'); } }, undefined, 0, HERO_LINEUP);
    lv2(g);
    expect(g.raiseNode('noel', 'ice-star')).toEqual({ ok: true });
    expect([g.notice, g.state.party.roster.noel.tree['ice-star']]).toEqual(['save-failed', 1]);
  });
  it('a refused spend changes and saves nothing, and says why', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, HERO_LINEUP);
    expect(g.raiseNode('noel', 'ice-star')).toEqual({ ok: false, reason: 'points' });   // Lv1: no point yet
    lv2(g);
    expect(g.raiseNode('noel', 'flame-wave')).toEqual({ ok: false, reason: 'req' });
    expect(g.raiseNode('sylvie', 'aimed-shot')).toEqual({ ok: false, reason: 'invalid' });   // not recruited
    expect(g.state.party.roster.noel.tree).toEqual({ 'fire-star': 1 });
    expect(storage.map.has(SAVE_KEY)).toBe(false);
  });
  it('in the labyrinth the spend counts at once but is not saved mid-run', () => {
    const storage = memoryStorage();
    const g = inMap(1, calm(), storage);
    lv2(g);
    expect(g.raiseNode('noel', 'ice-star')).toEqual({ ok: true });
    expect(g.state.party.roster.noel.tree['ice-star']).toBe(1);
    expect([g.notice, storage.map.has(SAVE_KEY)]).toEqual([null, false]);
  });
});

describe('spending a talent point', () => {
  const lv6 = (g: Game) => { g.state.party.roster.noel = { ...g.state.party.roster.noel, level: 6 }; };
  it('saves the spend in town: a reload keeps the new rank', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, HERO_LINEUP);
    lv6(g);
    expect(g.raiseTalent('noel', 'noel-t00')).toEqual({ ok: true });
    expect(g.state.party.roster.noel.talents).toEqual({ 'noel-t00': 1 });
    const back = Game.boot(calm(), storage);
    expect(back.notice).toBeNull();
    expect(back.state.party.roster.noel.talents).toEqual({ 'noel-t00': 1 });
  });
  it('reports a failed save without losing the spend', () => {
    const g = new Game(calm(), { getItem: () => null, setItem: () => { throw new Error('full'); } }, undefined, 0, HERO_LINEUP);
    lv6(g);
    expect(g.raiseTalent('noel', 'noel-t00')).toEqual({ ok: true });
    expect([g.notice, g.state.party.roster.noel.talents['noel-t00']]).toEqual(['save-failed', 1]);
  });
  it('a refused spend changes and saves nothing, and says why', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, HERO_LINEUP);
    expect(g.raiseTalent('noel', 'noel-t00')).toEqual({ ok: false, reason: 'points' });   // Lv1: no talent point yet
    lv6(g);
    expect(g.raiseTalent('noel', 'noel-t10')).toEqual({ ok: false, reason: 'adjacent' });
    expect(g.raiseTalent('sylvie', 'sylvie-t00')).toEqual({ ok: false, reason: 'invalid' });   // not recruited
    expect(g.state.party.roster.noel.talents).toEqual({});
    expect(storage.map.has(SAVE_KEY)).toBe(false);
  });
  it('in the labyrinth the spend counts at once but is not saved mid-run', () => {
    const storage = memoryStorage();
    const g = inMap(1, calm(), storage);
    lv6(g);
    expect(g.raiseTalent('noel', 'noel-t00')).toEqual({ ok: true });
    expect(g.state.party.roster.noel.talents['noel-t00']).toBe(1);
    expect([g.notice, storage.map.has(SAVE_KEY)]).toEqual([null, false]);
  });
  it('is refused in battle', () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    lv6(g);
    g.phase = 'battle';
    expect(g.raiseTalent('noel', 'noel-t00')).toEqual({ ok: false, reason: 'invalid' });
    expect(g.state.party.roster.noel.talents).toEqual({});
  });
});

describe('forge actions', () => {
  const item = (uid: number, over: Partial<ItemInstance> = {}): ItemInstance => ({
    ...plainItem('moss-charm', uid), rarity: 'rare', ilvl: 20,
    affixes: [{ key: 'str', value: 5 }, { key: 'hp', value: 30 }, { key: 'spd', value: 2 }], ...over,
  });
  const stocked = (storage = memoryStorage()) => {
    const g = new Game(calm(), storage, undefined, 0, HERO_LINEUP);
    g.state.gold = 1_000_000;
    g.state.bag = [item(1), item(2, { rarity: 'common', affixes: [] }), item(3, { rarity: 'common', affixes: [] }), item(4, { rarity: 'common', affixes: [] })];
    g.state.nextUid = 100;
    g.state.inventory = Object.fromEntries(Object.keys(MATERIALS).map((m) => [m, 500]));
    g.state.inventory.potion = 1;
    return g;
  };
  const calls: [string, (g: Game) => unknown][] = [
    ['dismantle', (g) => g.dismantle([4])],
    ['enhance', (g) => g.enhance(1)],
    ['reroll', (g) => g.reroll(1, 1, { swap: false })],
    ['fuse', (g) => g.fuse([2, 3, 4])],
    ['craftItem', (g) => g.craftItem('potion', 1)],
    ['craftBase', (g) => g.craftBase('weapon')],
    ['craftSet', (g) => g.craftSet('set-blaze-weapon')],
  ];
  it.each(calls)('%s saves at once in town', (_n, act) => {
    const storage = memoryStorage();
    const g = stocked(storage);
    const r = act(g) as { ok: boolean };
    expect(r.ok).toBe(true);
    expect(g.notice).toBe('saved');
    const back = loadGame(storage);
    expect(back.status === 'ok' && back.state).toEqual(g.state);
  });
  it.each(calls)('%s is refused in the labyrinth with phase and changes nothing', (_n, act) => {
    const storage = memoryStorage();
    const g = stocked(storage);
    g.state.dungeon.reached.mainline = 3;
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    const before = structuredClone(g.state);
    const keys = [...storage.map.keys()];
    expect(act(g)).toEqual({ ok: false, reason: 'phase' });
    expect(g.state).toEqual(before);
    expect(g.state.forgeDraws).toBe(before.forgeDraws);
    expect([...storage.map.keys()]).toEqual(keys);
  });
  it('an enhance that cannot fail draws nothing; the step to +6 draws once and survives a reload', () => {
    const storage = memoryStorage();
    const g = stocked(storage);
    g.state.bag[0].enhance = 0;
    expect(g.enhance(1).ok).toBe(true);
    expect(g.state.forgeDraws).toBe(0);
    g.state.bag[0].enhance = 5;
    const r = g.enhance(1);
    expect(r.ok).toBe(true);
    expect(g.state.forgeDraws).toBe(1);
    const level = g.state.bag[0].enhance;
    const back = Game.boot(calm(), storage);
    expect(back.state.forgeDraws).toBe(1);
    expect(back.state.bag[0].enhance).toBe(level);
    expect(back.enhance(1).ok).toBe(true);
    expect(back.state.forgeDraws).toBe(2);
  });
  it('after a failed save, a reload plus a shop buy draws the same enhance outcome (the seed ignores nextUid)', () => {
    const outcomes = (buyFirst: boolean) => {
      const out: boolean[] = [];
      for (let d = 0; d < 24; d++) {
        const storage = memoryStorage();
        const g = stocked(storage);
        g.state.bag[0].enhance = 8;
        g.state.forgeDraws = d;
        expect(saveGame(storage, g.state)).toBe(true);
        const failing = { getItem: (k: string) => storage.getItem(k), setItem: () => { throw new Error('full'); } };
        const first = new Game(calm(), failing, structuredClone(g.state));
        const r1 = first.enhance(1);
        expect(first.notice).toBe('save-failed');
        const back = Game.boot(calm(), storage);
        expect(back.state.forgeDraws).toBe(d);
        if (buyFirst) {
          const uid = back.state.nextUid;
          expect(back.apply(buy(back.state, 'cloth-robe')).ok).toBe(true);
          expect(back.state.nextUid).toBe(uid + 1);
        }
        const r2 = back.enhance(1);
        expect(r1.ok && r2.ok).toBe(true);
        if (r1.ok && r2.ok) expect(r2.out, `forgeDraws ${d}`).toEqual(r1.out);
        if (r1.ok) out.push(r1.out.success);
      }
      return out;
    };
    expect(outcomes(false)).toEqual(outcomes(true));
    expect(new Set(outcomes(true)).size).toBe(2);
  });
  it('a new game takes the forge salt it is given (boot without a save, and fresh); a loaded game keeps its own', () => {
    expect(new Game(calm(), null, undefined, 77).state.forgeSalt).toBe(77);
    const storage = memoryStorage();
    expect(Game.boot(calm(), storage, 78).state.forgeSalt).toBe(78);
    expect(Game.fresh(calm(), storage, 79).state.forgeSalt).toBe(79);
    expect(Game.boot(calm(), storage, 80).state.forgeSalt).toBe(79);
  });
  it('a failed save leaves the save-failed notice and keeps the result', () => {
    const g = stocked();
    const bad = new Game(calm(), { getItem: () => null, setItem: () => { throw new Error('full'); } }, g.state);
    expect(bad.enhance(1).ok).toBe(true);
    expect([bad.notice, bad.state.bag[0].enhance]).toEqual(['save-failed', 1]);
  });
  it('a refused action (not enough gold) changes and saves nothing', () => {
    const storage = memoryStorage();
    const g = stocked(storage);
    g.state.gold = 0;
    expect(g.enhance(1)).toEqual({ ok: false, reason: 'gold' });
    expect([g.notice, storage.map.size]).toEqual([null, 0]);
  });
});

describe('rescues on a run', () => {
  const twoStart = () => {
    const g = new Game(calm(), memoryStorage(), undefined, 0, ['hero', 'rin']);
    g.state.dungeon.reached.mainline = 3;
    return g;
  };
  it('a run carries the rescues of the companions not yet met', () => {
    const g = twoStart();
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.run!.rescues).toEqual({ 2: 'selene', 6: 'bobby' });
    expect(g.returnToTown()).toBe(true);
    g.state.party = meet(g.state.party, 'selene', 1);
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.run!.rescues).toEqual({ 6: 'bobby' });
  });
  it("a met companion's room never comes back", () => {
    const g = twoStart();
    g.state.party = meet(g.state.party, 'selene', 1);
    g.depart(MAIN, 1);
    expect(floorOf(g.run!, 2).contents.some((c) => c.kind === 'rescue')).toBe(false);
  });
  it('a region without a waiting companion has no rescues', () => {
    const g = twoStart();
    g.state.dungeon.reached.frost = 1;
    expect(g.depart({ region: 'frost', condition: 'plain' }, 1)).toEqual({ ok: true });
    expect(g.run!.rescues).toEqual({ 3: 'chizuru' });
  });
  it('the gates after a trip home are rolled with the unmet regions favoured', () => {
    const g = twoStart();
    const rolled = vi.mocked(rollPortals);
    const favouredOf = (call: number) => rolled.mock.calls[call][1];
    expect(favouredRegions(g.state.party.recruited).length).toBeGreaterThan(0);
    // newGame
    expect(favouredOf(rolled.mock.calls.length - 1)).toEqual(favouredRegions(['hero', 'rin']));
    // toTown
    g.depart(MAIN, 1);
    rolled.mockClear();
    g.returnToTown();
    expect(rolled).toHaveBeenCalledTimes(1);
    expect(favouredOf(0)).toEqual(favouredRegions(g.state.party.recruited));
    // wipe
    g.depart(MAIN, 1);
    g.encounter = 99;
    g.move('right');
    rolled.mockClear();
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    g.submitRound({});
    expect(g.phase).toBe('town');
    expect(rolled).toHaveBeenCalledTimes(1);
    expect(favouredOf(0)).toEqual(favouredRegions(g.state.party.recruited));
    expect(validPortals(g.state.dungeon.portals)).toBe(true);
  });
});

describe('rescue fights', () => {
  const lineup: CharacterId[] = ['hero', 'rin'];
  const rescueRun = (start: CharacterId[] = lineup) => {
    const g = new Game(calm(), memoryStorage(), undefined, 0, start);
    g.state.dungeon.reached.mainline = 3;
    expect(g.depart(MAIN, 2)).toEqual({ ok: true });
    const c = floorOf(g.run!, 2).contents.find((x) => x.kind === 'rescue')!;
    return { g, at: c.at };
  };
  it('stepping into a rescue room starts a fight with one extra enemy', () => {
    const { g, at } = rescueRun();
    expect(stepOnto(g, at)).toEqual({ kind: 'rescue', who: 'selene' });
    expect(g.phase).toBe('battle');
    const group = encounterGroup('mainline', 2, calm());
    const n = activeIds(g.state.party).length;
    expect(g.battle!.enemies).toHaveLength(Math.min(group.length, groupCap(n, 2)) + 1);
    expect(g.battle!.boss).toBe(false);
  });
  it('winning the rescue meets her at the join level, on the field while there is room', () => {
    const { g, at } = rescueRun();
    g.state.party.roster.hero.level = 10;   // average 8 of the field, above the depth's 4 and under the best, so the level is not Lv1 by default
    g.state.party.roster.rin.level = 6;
    stepOnto(g, at);
    const end = killAll(g);
    expect(end.outcome).toBe('win');
    expect(end.levelUps).toEqual([]);   // nobody levelled, so the join level is the plain average
    expect(end.met).toEqual({ id: 'selene', level: 8, benched: false });
    expect(g.state.party.roster.selene.level).toBe(8);
    expect(g.state.party.recruited).toContain('selene');
    expect(activeIds(g.state.party)).toContain('selene');
    expect(end.levelUps.some((l) => l.id === 'selene')).toBe(false);
    expect(tileAt(g.map(), at)).toBe('floor');
    expect(g.phase).toBe('map');
  });
  it('she joins after the exp is shared, at the level the party has by then', () => {
    const { g, at } = rescueRun();
    for (const id of ['hero', 'rin'] as const) {
      g.state.party.roster[id].level = 5;
      g.state.party.roster[id].exp = expToNext(5) - 1;   // any exp tips both over to Lv6
    }
    stepOnto(g, at);
    const end = killAll(g);
    expect(end.levelUps.map((u) => u.id).sort()).toEqual(['hero', 'rin']);
    expect(g.state.party.roster.hero.level).toBe(6);
    expect(end.met).toMatchObject({ id: 'selene', level: 6 });   // 5 had she joined before the exp
  });
  it('winning takes the room off the floor, so no rescue marker stays after she joins', () => {
    const { g, at } = rescueRun();
    stepOnto(g, at);
    g.run!.explored[g.floor] = [`${at.x},${at.y}`];
    killAll(g);
    expect(floorOf(g.run!, 2).contents.some((c) => c.kind === 'rescue')).toBe(false);
    expect(tileAt(g.map(), at)).toBe('floor');
  });
  it('the stairs warn while the rescue on the floor still waits, and stop once she is met or the room is gone', () => {
    const { g, at } = rescueRun();
    const down = g.map().down!;
    const r = stepOnto(g, down);
    expect(r).toMatchObject({ kind: 'stairs', floor: 3, rescue: true });
    expect(g.descend()).toMatchObject({ kind: 'floor', floor: 3 });   // a warning only: she can be left behind
    const again = rescueRun();
    again.g.state.party = meet(again.g.state.party, 'selene', 3);
    expect(stepOnto(again.g, again.g.map().down!)).toMatchObject({ kind: 'stairs', rescue: false });
    const gone = rescueRun();
    const floor = floorOf(gone.g.run!, 2);
    floor.contents = floor.contents.filter((c) => c.kind !== 'rescue');
    expect(stepOnto(gone.g, gone.g.map().down!)).toMatchObject({ kind: 'stairs', rescue: false });
  });
  it('stepping back onto her room after the win starts nothing', () => {
    const { g, at } = rescueRun();
    stepOnto(g, at);
    killAll(g);
    expect(g.state.party.recruited).toContain('selene');
    const again = stepOnto(g, at);
    expect(again.kind).not.toBe('rescue');
    expect(g.phase).toBe('map');
  });
  it('a rescue tile with no room behind it is just a step', () => {
    const { g, at } = rescueRun();
    const floor = floorOf(g.run!, 2);
    floor.contents = floor.contents.filter((c) => c.kind !== 'rescue');
    expect(tileAt(g.map(), at)).toBe('rescue');
    expect(stepOnto(g, at).kind).not.toBe('rescue');
    expect(g.phase).toBe('map');
  });
  it('fleeing keeps the rescue marker on the map', () => {
    const { g, at } = rescueRun();
    stepOnto(g, at);
    g.run!.explored[g.floor] = [`${at.x},${at.y}`];
    (g as { rng: unknown }).rng = constRng(0);
    expect(g.submitRound({ hero: { kind: 'escape' } })!.end!.outcome).toBe('fled');
    expect(tileAt(g.map(), at)).toBe('rescue');
  });
  it('a full party benches her', () => {
    const { g, at } = rescueRun(['hero', 'rin', 'chizuru', 'liz', 'noel']);
    expect(activeIds(g.state.party)).toHaveLength(MAX_ACTIVE);
    stepOnto(g, at);
    const end = killAll(g);
    expect(end.met).toMatchObject({ id: 'selene', benched: true });
    expect(g.state.party.recruited).toContain('selene');
    expect(activeIds(g.state.party)).not.toContain('selene');
  });
  it('fleeing leaves her unmet and the room in place', () => {
    const { g, at } = rescueRun();
    stepOnto(g, at);
    (g as { rng: unknown }).rng = constRng(0);   // the escape roll always succeeds
    const end = g.submitRound({ hero: { kind: 'escape' } })!.end!;
    expect(end.outcome).toBe('fled');
    expect(end.met).toBeUndefined();
    expect(g.state.party.recruited).not.toContain('selene');
    expect(tileAt(g.map(), at)).toBe('rescue');
    expect(g.phase).toBe('map');
  });
  it('wiping leaves her unmet and the room in place on the next trip', () => {
    const { g, at } = rescueRun();
    stepOnto(g, at);
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    const end = g.submitRound({})!.end!;
    expect(end.outcome).toBe('lose');
    expect(end.met).toBeUndefined();
    expect(g.state.party.recruited).not.toContain('selene');
    expect(g.depart(MAIN, 2)).toEqual({ ok: true });
    const again = floorOf(g.run!, 2).contents.find((x) => x.kind === 'rescue');
    expect(again?.who).toBe('selene');
    expect(tileAt(g.map(), again!.at)).toBe('rescue');
  });
  it('a wipe later in the same run keeps her met, and the town save loads valid', () => {
    const { g, at } = rescueRun();
    const st = memoryStorage();
    stepOnto(g, at);
    expect(killAll(g).met).toMatchObject({ id: 'selene' });
    (g as unknown as { startBattle: (e: string[], b: boolean) => void }).startBattle(encounterGroup('mainline', 2, calm()), false);
    expect(g.phase).toBe('battle');
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    expect(g.submitRound({})!.end!.outcome).toBe('lose');
    expect(g.phase).toBe('town');
    expect(g.state.party.recruited).toContain('selene');
    expect(activeIds(g.state.party)).toContain('selene');
    expect(saveGame(st, g.state)).toBe(true);
    const back = loadGame(st);
    expect(back.status).toBe('ok');
    if (back.status === 'ok') expect(back.state.party.recruited).toContain('selene');
  });
  it('a failed escape does not lose the fight: a later win still meets her', () => {
    const { g, at } = rescueRun();
    stepOnto(g, at);
    g.submitRound({ hero: { kind: 'escape' } });   // calm rng: the escape fails, the fight goes on
    expect(g.phase).toBe('battle');
    expect(killAll(g).met).toMatchObject({ id: 'selene' });
  });
});

describe('glimmers and memory pieces', () => {
  const duo: CharacterId[] = ['hero', 'rin'];
  const run = (start: CharacterId[], depth: number, tweak: (g: Game) => void = () => {}) => {
    const g = new Game(calm(), memoryStorage(), undefined, 0, start);
    g.state.dungeon.reached.mainline = Math.max(3, depth);
    tweak(g);
    expect(g.depart(MAIN, depth)).toEqual({ ok: true });
    return g;
  };
  const finished = (g: Game, ...ids: CharacterId[]) => { for (const id of ids) g.state.party.roster[id].memories = 99; };
  /** A glimmer on an open cell, as the floor would have made it. */
  const plantGlimmer = (g: Game, owner?: CharacterId): Pos => {
    const m = g.map();
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      if (m.tiles[y][x] !== 'floor' || (x === g.pos.x && y === g.pos.y)) continue;
      m.tiles[y][x] = 'glimmer';
      floorOf(g.run!, g.floor).contents.push({ kind: 'glimmer', at: { x, y }, room: 0, ...(owner ? { owner } : {}) });
      return { x, y };
    }
    throw new Error('no cell for a glimmer');
  };

  it("the first trip down the main road finds Rin's first memory", () => {
    const g = Game.fresh(calm(), memoryStorage());
    g.state.dungeon.reached.mainline = 3;
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    const c = floorOf(g.run!, 1).contents.find((x) => x.kind === 'glimmer' && x.owner === 'rin')!;
    expect(c).toBeDefined();
    const r = stepOnto(g, c.at);
    expect(r).toEqual({ kind: 'glimmer', gained: [{ kind: 'piece', id: 'rin', n: 1, play: true }] });
    expect(memoriesOf(g.state.party.roster.rin)).toBe(1);
    expect(tileAt(g.map(), c.at)).toBe('floor');
    expect(floorOf(g.run!, 1).contents.some((x) => x.kind === 'glimmer' && x.owner === 'rin')).toBe(false);
    expect(g.run!.dropped[1]).toEqual(['rin']);
    expect(g.run!.played).toEqual([1]);
    expect(g.pending).toEqual(['mem:rin:1']);
    expect(g.run!.memoryDraws).toBe(1);
  });

  it('a glimmer with no piece for anyone leaves a shard and fades', () => {
    const g = run(['hero'], 1);
    const at = plantGlimmer(g);
    expect(stepOnto(g, at)).toEqual({ kind: 'glimmer', gained: [{ kind: 'shard', grade: expect.any(String) }] });
    expect(tileAt(g.map(), at)).toBe('floor');
    expect(g.pending).toEqual([]);
    expect(g.run!.dropped[1] ?? []).toEqual([]);
  });

  it('a main-road boss pays the next piece of a story chain', () => {
    const g = run(duo, 5, (x) => finished(x, 'rin'));
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    expect(end.fragments!.filter((f) => f.kind === 'piece')).toEqual([{ kind: 'piece', id: 'hero', n: 1, play: true }]);
    expect(memoriesOf(g.state.party.roster.hero)).toBe(1);
    expect(g.run!.dropped[5]).toEqual(['hero']);
  });

  it('a fight that pays no memory piece lists none', () => {
    const g = run(['hero'], 1);
    stepOnto(g, plantAt(g, 'elite'));
    const end = killAll(g);
    expect((end.fragments ?? []).filter((f) => f.kind === 'piece')).toEqual([]);
  });

  it('the second memory on a floor waits in the handbook', () => {
    const g = run(duo, 5);
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    expect(end.fragments!.filter((f) => f.kind === 'piece')).toEqual([{ kind: 'piece', id: 'rin', n: 1, play: true }]);
    const r = stepOnto(g, plantGlimmer(g, 'rin'));
    expect(r).toEqual({ kind: 'glimmer', gained: [{ kind: 'piece', id: 'rin', n: 2, play: false }] });
    expect(g.state.story.fresh).toContain('mem:rin:2');
    expect(g.state.story.seen).toContain('mem:rin:2');
    expect(g.pending).toEqual(['mem:rin:1']);
  });

  it('descending raises the pity of the chains that found nothing', () => {
    const g = run(duo, 4);
    expect(downstairs(g, g.map().down!)).toMatchObject({ kind: 'floor', floor: 5 });
    expect(g.state.story.pity).toEqual({ hero: 1, rin: 1 });
  });

  it('descending resets the chain that dropped and keeps no pity above the save bound', () => {
    const g = run(duo, 4);
    g.state.story.pity = { rin: 2, hero: 999 };
    stepOnto(g, plantGlimmer(g, 'rin'));
    downstairs(g, g.map().down!);
    expect(g.state.story.pity).toEqual({ rin: 0, hero: 999 });
  });

  it('a wipe keeps the memories found', () => {
    const g = run(duo, 1);
    const c = floorOf(g.run!, 1).contents.find((x) => x.kind === 'glimmer' && x.owner === 'rin')!;
    g.state.story.pity = { hero: 2, rin: 2 };
    stepOnto(g, c.at);
    g.pos = { ...g.map().entrance };
    g.encounter = 99;
    g.move('right');
    expect(g.phase).toBe('battle');
    for (const m of g.battle!.party) { m.hp = 0; m.alive = false; }
    g.submitRound({});
    expect(g.phase).toBe('town');
    expect(memoriesOf(g.state.party.roster.rin)).toBe(1);
    expect(g.state.story.pity).toEqual({ hero: 2, rin: 0 });   // the piece she gave reset her count, the floor was never cleared so hero's did not grow
  });

  it('a return lamp keeps the reset of the chain that dropped', () => {
    const g = run(duo, 1);
    g.state.story.pity = { rin: 2, hero: 1 };
    stepOnto(g, floorOf(g.run!, 1).contents.find((x) => x.kind === 'glimmer' && x.owner === 'rin')!.at);
    g.state.inventory['return-lamp'] = 1;
    expect(g.useReturnLamp()).toBe(true);
    expect(g.state.story.pity).toEqual({ rin: 0, hero: 1 });
  });

  it('scenes waiting to play do not outlive the run', () => {
    const g = run(duo, 1);
    stepOnto(g, floorOf(g.run!, 1).contents.find((x) => x.kind === 'glimmer' && x.owner === 'rin')!.at);
    expect(g.pending).toEqual(['mem:rin:1']);
    g.state.inventory['return-lamp'] = 1;
    g.useReturnLamp();
    expect(g.pending).toEqual([]);
    const h = run(duo, 1);
    h.pending.push('mem:rin:1');
    h.pos = { ...h.map().entrance };
    h.encounter = 99;
    h.move('right');
    for (const m of h.battle!.party) { m.hp = 0; m.alive = false; }
    h.submitRound({});
    expect(h.pending).toEqual([]);
    h.pending.push('mem:rin:1');
    h.state.dungeon.reached.mainline = 3;
    expect(h.depart(MAIN, 1)).toEqual({ ok: true });
    expect(h.pending).toEqual([]);
  });

  it("the depth-25 boss queues the hero's top-up memories", () => {
    const g = run(duo, 25, (x) => { x.state.party.roster.hero.memories = 5; });
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    expect(memoriesOf(g.state.party.roster.hero)).toBe(9);
    expect(end.fragments!.filter((f) => f.kind === 'piece' && f.id === 'hero').map((f) => f.kind === 'piece' && [f.n, f.play])).toEqual([[6, false], [7, false], [8, false], [9, false]]);
    expect(g.state.story.queue.filter((id) => id.startsWith('mem:'))).toEqual(['mem:hero:6', 'mem:hero:7', 'mem:hero:8', 'mem:hero:9']);
    expect(g.state.story.seen.some((id) => id.startsWith('mem:hero'))).toBe(false);
    expect(g.pending).toEqual([]);
  });

  it('a single hero piece owed at depth 25 is queued too', () => {
    const g = run(duo, 25, (x) => { x.state.party.roster.hero.memories = 8; });
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    expect(end.fragments!.filter((f) => f.kind === 'piece')).toEqual([{ kind: 'piece', id: 'hero', n: 9, play: false }]);
    expect(g.state.story.queue).toContain('mem:hero:9');
    expect(g.state.story.seen).not.toContain('mem:hero:9');
    expect(g.pending).toEqual([]);
  });

  it("the depth-3 story boss pays Rin's second piece", () => {
    const g = run(duo, 3, (x) => { x.state.party.roster.rin.memories = 1; });
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    expect(end.fragments!.filter((f) => f.kind === 'piece')).toEqual([{ kind: 'piece', id: 'rin', n: 2, play: true }]);
    expect(memoriesOf(g.state.party.roster.rin)).toBe(2);
    expect(g.phase).toBe('clear');
  });

  it('two elite fights pay the gear recorded before the memory rng existed', () => {
    const g = run(duo, 1);
    const seen: string[][] = [];
    for (let i = 0; i < 2; i++) {
      stepOnto(g, plantAt(g, 'elite'));
      seen.push(killAll(g).gear.map((it) => `${it.base}/${it.rarity}/${it.ilvl}/${it.affixes.map((a) => `${a.key}${a.value}`).join(',')}`));
    }
    // Recorded at 6937fcaf, before any memory drop existed: the second fight moves if memory drops ever share the loot stream.
    expect(seen).toEqual([['wooden-buckler/magic/4/hp8,res1', 'copper-ring/common/2/'], ['bat-earring/magic/4/heal3']]);
  });

  it('memory draws leave the loot rolls alone', () => {
    const fight = (tweak: (x: Game) => void) => {
      const g = run(duo, 1, tweak);
      stepOnto(g, plantAt(g, 'elite'));
      const draws = g.run!.lootDraws;
      const end = killAll(g);
      return { g, end, lootDraws: g.run!.lootDraws - draws };
    };
    const open = fight(() => {});
    const shut = fight((x) => finished(x, 'rin'));
    expect(open.g.run!.memoryDraws).toBe(1);
    expect(open.end.gear).toEqual(shut.end.gear);
    expect(open.end.drops).toEqual(shut.end.drops);
    expect(open.lootDraws).toBe(shut.lootDraws);
  });
});

describe('fragments as run loot', () => {
  const duo: CharacterId[] = ['hero', 'rin'];
  const SHARDS = Object.values(SHARD_IDS);
  const shardsIn = (items: Record<string, number>) => SHARDS.reduce((n, id) => n + (items[id] ?? 0), 0);
  const run = (start: CharacterId[], depth: number) => {
    const g = new Game(calm(), memoryStorage(), undefined, 0, start);
    g.state.dungeon.reached.mainline = Math.max(3, depth);
    expect(g.depart(MAIN, depth)).toEqual({ ok: true });
    return g;
  };
  /** Fills the run pack with plain stuff until `room` weight is left. */
  const fillTo = (g: Game, room: number) => { g.run!.loot.items.stuff = capacity(g.state.party) - carried(g.state, g.run) - room; };
  /** A glimmer on the first open cell, or on `cell` itself (opened up, with its left neighbour) when given. */
  const plantGlimmer = (g: Game, owner?: CharacterId, cell?: Pos): Pos => {
    const m = g.map();
    const put = ({ x, y }: Pos) => {
      m.tiles[y][x] = 'glimmer';
      floorOf(g.run!, g.floor).contents.push({ kind: 'glimmer', at: { x, y }, room: 0, ...(owner ? { owner } : {}) });
      return { x, y };
    };
    if (cell) {
      for (const p of [cell, { x: cell.x - 1, y: cell.y }]) if (m.tiles[p.y][p.x] === 'wall') m.tiles[p.y][p.x] = 'floor';
      return put(cell);
    }
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      if (m.tiles[y][x] === 'floor' && !(x === g.pos.x && y === g.pos.y)) return put({ x, y });
    }
    throw new Error('no cell for a glimmer');
  };
  const withDrops = (over: { shard?: number; town?: number }, body: () => void) => {
    const saved = { s: { ...SHARD_DROP }, t: { ...TOWN_DROP } };
    try {
      for (const k of ['chest', 'vault', 'elite'] as const) { SHARD_DROP[k] = over.shard ?? SHARD_DROP[k]; TOWN_DROP[k] = over.town ?? TOWN_DROP[k]; }
      body();
    } finally { Object.assign(SHARD_DROP, saved.s); Object.assign(TOWN_DROP, saved.t); }
  };

  it('fragments ride in the run pack and are lost on a wipe', () => {
    const g = run(duo, 5);
    const before = carried(g.state, g.run);
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    expect(end.fragments!.some((f) => f.kind === 'shard')).toBe(true);
    expect(shardsIn(g.run!.loot.items)).toBeGreaterThanOrEqual(1);
    expect(carried(g.state, g.run)).toBeGreaterThanOrEqual(before + FRAGMENT_WEIGHT);
    expect(shardsIn(g.state.inventory)).toBe(0);
    g.pos = { ...g.map().entrance };
    g.encounter = 99;
    g.move('right');
    for (const m of g.battle!.party) { m.hp = 0; m.alive = false; }
    g.submitRound({});
    expect(g.phase).toBe('town');
    expect(shardsIn(g.state.inventory)).toBe(0);
  });

  it('a full pack leaves the shard behind', () => {
    const g = run(duo, 5);
    for (const m of Object.values(g.state.party.roster)) m.level = MAX_LEVEL;   // no level-up mid-fight to widen the pack
    fillTo(g, FRAGMENT_WEIGHT / 2);
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    expect(shardsIn(end.left)).toBe(1);
    expect(shardsIn(g.run!.loot.items)).toBe(0);
    expect(end.fragments!.filter((f) => f.kind === 'shard')).toHaveLength(1);
  });

  /** Depth 7 can roll dim or clear, so a re-roll could change the grade; the hero's chain is spent so nothing else is found. */
  const emptyGlimmerRun = () => {
    const g = run(['hero'], 7);
    g.state.party.roster.hero.memories = 99;
    return g;
  };

  it('an empty glimmer gives a shard, or waits when the pack is full', () => {
    const g = emptyGlimmerRun();
    const at = plantGlimmer(g);
    fillTo(g, FRAGMENT_WEIGHT / 2);
    const full = stepOnto(g, at);
    expect(full).toMatchObject({ kind: 'full', qty: 1 });
    if (full.kind !== 'full') throw new Error('expected full');
    expect(SHARDS).toContain(full.item);
    expect(full.need).toBeGreaterThan(0);
    expect(tileAt(g.map(), at)).toBe('glimmer');
    expect(g.run!.rolls[`frag:glimmer:${g.floor}:${posKey(at)}`].frags).toEqual([full.item]);   // the roll is kept
    const draws = g.run!.memoryDraws;
    expect(g.discard('stuff', 5)).toBe(5);
    const got = stepOnto(g, at);
    expect(g.run!.memoryDraws).toBe(draws);   // the second visit rolls nothing new
    expect(got.kind).toBe('glimmer');
    if (got.kind !== 'glimmer') throw new Error('expected glimmer');
    expect(got.gained).toHaveLength(1);
    expect(got.gained[0]).toMatchObject({ kind: 'shard' });
    expect(fragmentItem(got.gained[0])).toBe(full.item);
    expect(g.run!.loot.items[full.item!]).toBe(1);
    expect(tileAt(g.map(), at)).toBe('floor');
  });

  it('a full glimmer is taken by pickUpHere once room is made', () => {
    const g = emptyGlimmerRun();
    const at = plantGlimmer(g);
    fillTo(g, FRAGMENT_WEIGHT / 2);
    const full = stepOnto(g, at);
    if (full.kind !== 'full') throw new Error('expected full');
    expect(g.pickUpHere()).toMatchObject({ kind: 'full', item: full.item });   // still no room
    expect(g.discard('stuff', 5)).toBe(5);
    const got = g.pickUpHere();
    expect(got).toMatchObject({ kind: 'glimmer', gained: [{ kind: 'shard' }] });
    expect(g.run!.loot.items[full.item!]).toBe(1);
    expect(tileAt(g.map(), at)).toBe('floor');
    expect(g.pickUpHere()).toBeNull();
  });

  it('glimmers at the same cell on two floors keep their own rolls', () => {
    const g = run(duo, 6);
    g.state.party.roster.hero.memories = 99;
    g.state.party.roster.rin.memories = 99;
    const at = plantGlimmer(g);
    fillTo(g, FRAGMENT_WEIGHT / 2);
    const full = stepOnto(g, at);
    expect(full.kind).toBe('full');
    expect(downstairs(g, g.map().down!)).toMatchObject({ kind: 'floor', floor: 7 });
    g.state.party.roster.rin.memories = 0;
    plantGlimmer(g, 'rin', at);
    expect(stepOnto(g, at)).toMatchObject({ kind: 'glimmer', gained: [{ kind: 'piece', id: 'rin' }] });   // not floor 6's waiting shard
    expect(g.run!.rolls[`frag:glimmer:6:${posKey(at)}`]).toBeDefined();
  });

  it('a shut chest names the fragments it holds back', () => {
    withDrops({ shard: 1, town: 0 }, () => {
      const g = run(duo, 8);
      fillTo(g, 0.1);
      const r = stepOnto(g, plainChest(g));
      expect(r).toMatchObject({ kind: 'full' });
      if (r.kind !== 'full') throw new Error('expected full');
      expect(r.fragments).toHaveLength(1);
      expect(SHARDS).toContain(r.fragments![0]);
    });
  });

  it('a memory piece weighs nothing', () => {
    const g = run(duo, 1);
    const c = floorOf(g.run!, 1).contents.find((x) => x.kind === 'glimmer' && x.owner === 'rin')!;
    const before = carried(g.state, g.run);
    expect(stepOnto(g, c.at)).toMatchObject({ kind: 'glimmer', gained: [{ kind: 'piece' }] });
    expect(carried(g.state, g.run)).toBe(before);
  });

  it('a fragment left in a shut chest is not dropped a second time', () => {
    withDrops({ shard: 0, town: 1 }, () => {
      const g = run(duo, 8);
      fillTo(g, 0.1);
      const first = plainChest(g);
      expect(stepOnto(g, first).kind).toBe('full');
      const memo = g.run!.rolls[`frag:${g.floor}:${posKey(first)}`];
      expect(memo.frags).toHaveLength(1);
      const second = plantAt(g, 'chest', (at) => posKey(at) !== posKey(first) && !chestHasGear(g.run!, g.floor, at));
      expect(stepOnto(g, second).kind).toBe('full');
      const other = g.run!.rolls[`frag:${g.floor}:${posKey(second)}`];
      expect(other.frags).toHaveLength(1);
      expect(other.frags![0]).not.toBe(memo.frags![0]);
    });
  });

  it('a chest that was too heavy rolls the same fragments when the party comes back', () => {
    withDrops({ shard: 1, town: 1 }, () => {
      const g = run(duo, 8);
      fillTo(g, 0.1);
      const at = plainChest(g);
      expect(stepOnto(g, at).kind).toBe('full');
      const memo = [...g.run!.rolls[`frag:${g.floor}:${posKey(at)}`].frags!];
      expect(memo).toHaveLength(2);
      expect(g.discard('stuff', 10)).toBe(10);
      const r = g.pickUpHere()!;
      expect(r.kind).toBe('chest');
      if (r.kind !== 'chest') throw new Error('expected chest');
      expect(r.fragments!.map(fragmentItem)).toEqual(memo);
      for (const id of memo) expect(g.run!.loot.items[id]).toBe(1);
    });
  });

  it('a vault pays its fragments with the rest of its loot', () => {
    withDrops({ shard: 1, town: 0 }, () => {
      const g = run(duo, 8);
      g.run!.keys.add(g.floor);
      const at = plantAt(g, 'vault');
      expect(stepOnto(g, at).kind).toBe('event');
      const open = g.openVault(at)!;
      expect(open.kind).toBe('vault');
      if (open.kind !== 'vault') throw new Error('expected vault');
      expect(open.fragments).toHaveLength(1);
      expect(shardsIn(g.run!.loot.items)).toBe(1);
      expect(shardsIn(open.loot)).toBe(1);
    });
  });

  it('fragments come home with the run', () => {
    const g = run(duo, 5);
    stepOnto(g, g.map().boss!);
    killAll(g);
    const held = shardsIn(g.run!.loot.items);
    expect(held).toBeGreaterThanOrEqual(1);
    g.state.inventory['return-lamp'] = 1;
    expect(g.useReturnLamp()).toBe(true);
    expect(shardsIn(g.state.inventory)).toBe(held);
    expect(shardsIn(g.banked!.items)).toBe(held);
  });
});

describe('the fragment exchange in the game', () => {
  const stocked = () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, START_LINEUP);
    g.state.party = meet(g.state.party, 'bobby', 1);
    g.state.inventory[SHARD_IDS.dim] = 3;
    return { g, storage };
  };
  const savedState = (storage: ReturnType<typeof memoryStorage>) => { const r = loadGame(storage); return r.status === 'ok' ? r.state : null; };
  it('selling and absorbing work only in town and save at once', () => {
    const { g, storage } = stocked();
    const gold = g.state.gold;
    expect(g.sellShards('dim', 1)).toMatchObject({ ok: true });
    expect(g.notice).toBeNull();
    expect(g.state.gold).toBe(gold + SHARD_PRICE.dim);
    expect(savedState(storage)!.gold).toBe(g.state.gold);
    const a = g.absorb('bobby', 'dim');
    expect(a.ok).toBe(true);
    expect(g.state.party.roster.bobby.absorbed).toHaveLength(1);
    expect(savedState(storage)!.party.roster.bobby.absorbed).toEqual(g.state.party.roster.bobby.absorbed);
    expect(savedState(storage)!.inventory[SHARD_IDS.dim]).toBe(1);
    // a refused call leaves state and save alone
    const stored = storage.map.get(SAVE_KEY);
    expect(g.sellShards('dim', 5)).toEqual({ ok: false, reason: 'stock' });
    expect(g.absorb('sylvie', 'dim')).toEqual({ ok: false, reason: 'invalid' });
    expect(storage.map.get(SAVE_KEY)).toBe(stored);
  });
  it('neither works away from town', () => {
    const { g } = stocked();
    g.phase = 'map';
    const before = JSON.stringify(g.state);
    expect(g.sellShards('dim', 1)).toEqual({ ok: false, reason: 'invalid' });
    expect(g.absorb('bobby', 'dim')).toEqual({ ok: false, reason: 'invalid' });
    expect(JSON.stringify(g.state)).toBe(before);
  });
  it('a failed save sets the notice', () => {
    const g = new Game(calm(), null, undefined, 0, START_LINEUP);
    g.state.party = meet(g.state.party, 'bobby', 1);
    g.state.inventory[SHARD_IDS.dim] = 2;
    expect(g.sellShards('dim', 1).ok).toBe(true);
    expect(g.notice).toBe('save-failed');
    g.notice = null;
    expect(g.absorb('bobby', 'dim').ok).toBe(true);
    expect(g.notice).toBe('save-failed');
  });
});

describe('townsfolk fragments at home', () => {
  const savedState = (storage: ReturnType<typeof memoryStorage>) => { const r = loadGame(storage); return r.status === 'ok' ? r.state : null; };
  const held = (storage: ReturnType<typeof memoryStorage> | null = memoryStorage(), id = 'orik') => {
    const g = new Game(calm(), storage, undefined, 0, START_LINEUP);
    g.state.inventory[`tf-${id}`] = 1;
    return g;
  };

  it('returnFragment works only in town and saves at once', () => {
    const storage = memoryStorage();
    const g = held(storage);
    const gold = g.state.gold;
    expect(g.returnFragment('orik').ok).toBe(true);
    expect(g.state.gold).toBe(gold + 300);
    expect(g.pending).toContain('town:orik');
    expect(savedState(storage)!.story.returned).toEqual(['orik']);
    expect(savedState(storage)!.inventory['tf-orik']).toBeUndefined();
    const stored = storage.map.get(SAVE_KEY);
    expect(g.returnFragment('orik')).toEqual({ ok: false, reason: 'invalid' });
    expect(g.state.gold).toBe(gold + 300);
    expect(storage.map.get(SAVE_KEY)).toBe(stored);
    const h = held();
    h.phase = 'map';
    const before = JSON.stringify(h.state);
    expect(h.returnFragment('orik')).toEqual({ ok: false, reason: 'invalid' });
    expect(JSON.stringify(h.state)).toBe(before);
    expect(h.pending).toEqual([]);
  });

  it('a failed save sets the notice, and the reward still cannot be claimed twice', () => {
    const g = held(null);
    expect(g.returnFragment('orik').ok).toBe(true);
    expect(g.notice).toBe('save-failed');
    const gold = g.state.gold;
    expect(g.returnFragment('orik')).toEqual({ ok: false, reason: 'invalid' });
    expect(g.state.gold).toBe(gold);
  });

  it('a fed party sets out with the meal and is hungry again', () => {
    const g = new Game(calm(), null, undefined, 0, HERO_LINEUP);
    g.state.story.returned.push('marta');
    expect(g.rest().ok).toBe(true);
    expect(g.state.story.fed).toBe(true);
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.run!.altarBuffs).toContainEqual(PERKS.meal);
    expect(g.state.story.fed).toBe(false);
    const hungry = new Game(calm(), null, undefined, 0, HERO_LINEUP);
    hungry.state.story.returned.push('marta');
    expect(hungry.depart(MAIN, 1)).toEqual({ ok: true });
    expect(hungry.run!.altarBuffs).toEqual([]);
  });

  it('Glen rerolls the portals once per arrival', () => {
    const storage = memoryStorage();
    const g = new Game(mulberry32(3), storage, undefined, 0, HERO_LINEUP);
    expect(g.rerollPortals()).toBe(false);
    g.state.story.returned.push('glen');
    expect(g.rerollPortals()).toBe(true);
    expect(validPortals(g.state.dungeon.portals)).toBe(true);
    expect(savedState(storage)!.dungeon.portals).toEqual(g.state.dungeon.portals);
    expect(g.rerollPortals()).toBe(false);
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.rerollPortals()).toBe(false);
    expect(g.returnToTown()).toBe(true);
    expect(g.rerollPortals()).toBe(true);
    saveGame(storage, g.state);
    const h = Game.boot(mulberry32(4), storage);
    expect(h.rerollPortals()).toBe(false);
    const stored = storage.map.get(SAVE_KEY);
    expect(h.rerollPortals()).toBe(false);
    expect(storage.map.get(SAVE_KEY)).toBe(stored);
  });
});
