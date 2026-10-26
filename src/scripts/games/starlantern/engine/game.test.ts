import { afterEach, describe, it, expect, vi } from 'vitest';
import { Game, type BattleEnd, type MoveResult } from './game';
import { STORY_FIGHT_ROUNDS, meetEnemy, type BattleState, type Difficulty } from './battle';
import { BACKUP_KEY, SAVE_KEY, V8_KEY, loadGame, saveGame } from './save';
import { SAVE_VERSION, newGame, START_ITEMS, type GameState } from './state';
import { constRng, memoryStorage, plainItem, version8Save, withNode } from './testing';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NODES, P, TREES, V } from '../data/trees';
import { mulberry32, type Rng } from './rng';
import { rollAffixes, rollCrowdAffix } from './tiers';
import { TIERS } from '../data/difficulty';
import { rollPortals, validPortals } from './portals';
import { DELTA, posKey, tileAt, type Dir } from './map';
import { floorOf, type Portal } from './dungeon/run';
import { capacity, carried, weightOf } from '../data/weights';
import type { CharacterId, ItemInstance, Pos } from './types';
import { ENEMIES } from '../data/enemies';
import { CHARACTERS } from '../data/characters';
import { handbook } from './story/handbook';
import { SETS } from '../data/gear';
import { activeIds, expToNext, gainExp, MAX_LEVEL, meet, memoryStats, newMember, rowOfCell, statsOf, LEGACY_LINEUP, START_LINEUP } from './party';
import { depthClearExp, empower, encounterGroup, groupCap } from './scaling';
import { favouredRegions } from '../data/meetings';
import { MAX_ACTIVE } from './formation';
import { ABYSS, ABYSS_UNLOCK } from '../data/hero';
import { CONDITIONS } from '../data/conditions';
import { BAG_SIZE } from './loot/bag';
import { MAX_ILVL, MAX_REACHED } from './levels';
import { BOSS_LEGENDARY, chestHasGear, GEAR_CHANCE, mix, RARE_MATERIALS, rollBossGear, STARLIT_CHANCE } from './loot/drops';
import { itemLevel, itemWeight, rollItem } from './loot/item';
import { MATERIALS } from '../data/materials';
import { buy, unequip } from './town';
import { defaultTalents, defaultTree, memoriesOf, skillPointsLeft, talentPointsLeft } from './progression';
import { buildTalents, buildTree } from './builds';
import { buildOf } from '../data/builds';
import { learnedSkills } from './progression';
import { TALENT_NODES } from '../data/talents';
import { PERKS, SHARD_PRICE, FRAGMENT_WEIGHT, SHARD_DROP, SHARD_IDS, TOWN_DROP, TOWN_FRAGMENTS } from '../data/story/fragments';
import { fragmentItem } from './story/fragments';
import type { FragmentGain } from './story/memories';
import { ACT_DEPTHS, ALONE, FINALE_BOSS, FINALE_DEPTH, HEAVY_MAJORS, isNightSlot, lineCap, memScene, REACTIONS, SEASON_SCENES, type SceneId } from '../data/story/scenes';
import { NIGHT_BEATS, STORY, type ScriptLine, flatLines } from '../data/story.zh-TW';
import { dawnMemory, planNight } from './story/nights';
import { linesOf } from '../ui2/story';
import { chainLength } from '../data/story/chains';
import { SKILLS } from '../data/skills';
import { RUNE_DROP, RUNE_SELL } from '../data/runeEconomy';
import type { RuneRef } from '../data/runes';
import { rollRune, RUNE_SALT, spotRuneRng } from './loot/runes';
import { depthLevel } from './levels';
import { SPRING_AFTER, dayOf, moonOf, tonightMoon } from './calendar';
import { orderNight } from './story/nights';
import { calendarOf } from './story/events';
import { MEMORY_PITY } from '../data/story/chains';
import { BOND_SWITCH, bondOf, bondPoints } from './story/bond';
import { GIFT_LINES, RIN_OATH, type GiftPools } from '../data/bond.zh-TW';
import { BOND_RUN_CAP, FIELD_POINTS } from '../data/story/bond';
import { BONDS_WRITTEN, ROMANCES_WRITTEN, TOGETHER_WRITTEN, sceneTime } from '../data/story/scenes';
import { today } from './story/bond';
import { withBondEarn, withBondScale } from './testing';
/**
 * Bond plan Task 17: the registries hold what is written now, so a test that registers its own puts back what was there
 * (`bondsBack`), registers a companion only once (`bondsAdd`), and gives a written scene back instead of deleting it.
 */
const BOND_BASE = [...BONDS_WRITTEN];
const bondsAdd = (...cs: (typeof BONDS_WRITTEN)[number][]): void => { for (const c of cs) if (!BONDS_WRITTEN.includes(c)) BONDS_WRITTEN.push(c); };
const bondsBack = (): void => { BONDS_WRITTEN.splice(0, BONDS_WRITTEN.length, ...BOND_BASE); };
// review 5: the after-story and romance registries go back to what is registered, not to empty
const regAdd = <T,>(reg: T[], ...xs: T[]): void => { for (const x of xs) if (!reg.includes(x)) reg.push(x); };
const ROMANCES_BASE = [...ROMANCES_WRITTEN];
const romancesBack = (): void => { ROMANCES_WRITTEN.splice(0, ROMANCES_WRITTEN.length, ...ROMANCES_BASE); };
const TOGETHER_BASE = TOGETHER_WRITTEN.value;

vi.mock('./portals', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./portals')>();
  return { ...mod, rollPortals: vi.fn(mod.rollPortals) };
});

// Wrapped so a test can see what the game asked the boss roll for; it still rolls for real.
vi.mock('./loot/drops', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./loot/drops')>();
  return { ...mod, rollBossGear: vi.fn(mod.rollBossGear) };
});

// Wrapped so a test can see what a rune was rolled with (difficulty plan Task 6a-prime); it still rolls for real.
vi.mock('./loot/runes', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./loot/runes')>();
  return { ...mod, rollRune: vi.fn(mod.rollRune) };
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

  // Story depth Task 3 (plan rulings 6, 7): the lone morning plays on a departure, once its time has come.
  describe('the lone morning at the gate (story depth Task 3)', () => {
    const ready = (prep: (g: Game) => void = () => {}) => {
      const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
      Object.assign(g.state.party.roster.rin, { memories: chainLength('rin'), oath: true });
      g.state.story.seen.push('rin-reveal', 'rin-confess', 'mem:hero:9', 'bellkeeper-arrives');
      g.state.story.queue = ['hero-alone'];
      prep(g);
      return g;
    };

    it('departing with the lone morning queued: departScenes names it, and it is due', () => {
      const g = ready();
      expect(g.departScenes()).toEqual(['hero-alone']);
      expect(g.sceneDone('hero-alone', 'played')).toBe(true);
      expect(g.departScenes()).toEqual([]);
      expect(g.state.story.seen).toContain('hero-alone');
      expect(g.state.story.queue).not.toContain('hero-alone');
      expect(g.sceneDone('hero-alone', 'played')).toBe(false);   // not due twice
    });

    it('the lone morning waits for the ninth piece and the keeper', () => {
      const drop = (g: Game, id: SceneId) => { g.state.story.seen = g.state.story.seen.filter((x) => x !== id); };
      const nine = ready((g) => { drop(g, 'mem:hero:9'); g.state.story.queue.push('mem:hero:9'); });
      expect(nine.departScenes()).toEqual([]);
      expect(nine.sceneDone('hero-alone', 'played')).toBe(false);
      const keeper = ready((g) => { drop(g, 'bellkeeper-arrives'); g.state.story.queue.push('bellkeeper-arrives'); });
      expect(keeper.departScenes()).toEqual([]);
      const alone = ready((g) => { g.state.story.queue.push('rin-confess'); });
      expect(alone.departScenes()).toEqual([]);
      expect(ready().departScenes()).toEqual(['hero-alone']);
      const out = ready();
      expect(out.depart(MAIN, 1)).toEqual({ ok: true });
      expect(out.departScenes()).toEqual([]);   // only in town
    });

    it('a refused departure keeps the lone morning waiting', () => {
      const g = ready((x) => { for (const id of activeIds(x.state.party)) x.state.party.roster[id].hp = 0; });
      expect(g.departCheck(MAIN, 1)).toBe('party-down');
      expect(g.departScenes()).toEqual(['hero-alone']);
      expect(g.state.story.queue).toContain('hero-alone');
      const ok = ready();
      expect(ok.departCheck(MAIN, 2)).toBe('locked');
      expect(ok.departCheck(MAIN, 1)).toBeNull();
      expect(ok.state.story.queue).toContain('hero-alone');   // asking changes nothing
      expect(ok.phase).toBe('town');
    });
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
  // Bond plan Task 5: this pins the whole party across the stairs; the floor's field point is the bond tests' to check.
  it('descending past MAX_REACHED keeps reached capped, pays no exp, and the save still loads', () => withBondEarn(false, () => {
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
  }));
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
  it("every roll offers the guild's lead region: lamp, entrance, wipe and Glen's reroll (6c Task 16)", () => {
    // The hero's lineup has met Chizuru, Liz, Noel and Selene; past the prologue, the lead is Safira in the blaze.
    const g = new Game(mulberry32(5), memoryStorage(), undefined, 0, HERO_LINEUP);
    g.state.dungeon.reached.mainline = 3;
    g.state.inventory['return-lamp'] = 40;
    const regions = () => g.state.dungeon.portals.map((p) => p.region);
    for (let i = 0; i < 20; i++) {
      expect(g.depart(MAIN, 1)).toEqual({ ok: true });
      expect(g.useReturnLamp()).toBe(true);
      expect(regions(), `return ${i}`).toContain('blaze');
      expect(vi.mocked(rollPortals)).toHaveBeenLastCalledWith(g.rng, expect.any(Array), 'blaze');
    }
    g.depart(MAIN, 1);
    expect(g.returnToTown()).toBe(true);
    expect(regions()).toContain('blaze');
    g.state.story.returned.push('glen');
    expect(g.rerollPortals()).toBe(true);
    expect(regions()).toContain('blaze');
    // Safira met: the lead moves on to Sylvie in the mire, and the next roll offers it.
    g.state.party = meet(g.state.party, 'safira', 1);
    g.depart(MAIN, 1);
    expect(g.useReturnLamp()).toBe(true);
    expect(regions()).toContain('mire');
  });
  it('a save made before the leads loads exactly as saved, and its next roll offers the lead (6c Task 16)', () => {
    // Loading never rewrites the save (the game in play is the stored save); the guarantee comes with the next roll.
    const storage = memoryStorage();
    const g = new Game(mulberry32(5), storage, undefined, 0, HERO_LINEUP);
    g.state.dungeon.reached.mainline = 3;
    g.state.inventory['return-lamp'] = 2;
    g.state.dungeon.portals = [MAIN, { region: 'frost', condition: 'plain' }, { region: 'storm', condition: 'fog' }];
    saveGame(storage, g.state);
    const h = Game.boot(mulberry32(7), storage);
    expect(h.state.dungeon.portals).toEqual(g.state.dungeon.portals);
    expect(h.depart(MAIN, 1)).toEqual({ ok: true });
    expect(h.useReturnLamp()).toBe(true);
    expect(h.state.dungeon.portals.map((p) => p.region)).toContain('blaze');
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
  it('a new game queues the prologue, then the inn night', () => {
    expect(new Game(calm(), null).state.story.queue).toEqual(['prologue', 'prologue-inn']);
    expect(newGame().story).toEqual({ act1Cleared: false, finaleCleared: false, seen: [], fresh: [], queue: ['prologue', 'prologue-inn'], nodes: [], pity: {}, returned: [], fed: false });
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

  it('labyrinth drops carry the run seed for the starlit stream', () => {
    const spy = vi.mocked(rollBossGear);
    spy.mockClear();
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.state.dungeon.reached.iron = 5;
    expect(g.depart({ region: 'iron', condition: 'plain' }, 5)).toEqual({ ok: true });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(typeof g.run!.seed).toBe('number');
    expect(spy.mock.calls.at(-1)![1]).toMatchObject({ seed: g.run!.seed });
  });

  it('a starlit boss drop takes no draw from game.rng, lootRng or memoryRng', () => {
    const counted = () => { const r = { draws: 0, rng: () => { r.draws++; return 0.99; } }; return r; };
    const fight = (starlit: boolean) => {
      const saved = { first: BOSS_LEGENDARY.first, boss: { ...STARLIT_CHANCE.boss } };
      try {
        BOSS_LEGENDARY.first = 1;
        STARLIT_CHANCE.boss = starlit ? { base: 1, perDepth: 0, cap: 1 } : { base: 0, perDepth: 0, cap: 0 };
        const r = counted();
        const g = new Game(r.rng, null, undefined, 0, LEGACY_LINEUP);
        g.state.dungeon.reached.iron = 5;
        expect(g.depart({ region: 'iron', condition: 'plain' }, 5)).toEqual({ ok: true });
        const run = g.run!;
        const at = { draws: r.draws, loot: run.lootDraws, memory: run.memoryDraws };
        stepOnto(g, g.map().boss!);
        const end = killAll(g);
        return { end, draws: r.draws - at.draws, loot: run.lootDraws - at.loot, memory: run.memoryDraws - at.memory };
      } finally {
        BOSS_LEGENDARY.first = saved.first;
        STARLIT_CHANCE.boss = saved.boss;
      }
    };
    const lit = fight(true);
    const plain = fight(false);
    expect(lit.end.gear[0].starlit).toBe(true);
    expect(plain.end.gear[0].starlit).toBeUndefined();
    expect(lit.end.gear[0].special).toBe(plain.end.gear[0].special);
    expect({ draws: lit.draws, loot: lit.loot, memory: lit.memory }).toEqual({ draws: plain.draws, loot: plain.loot, memory: plain.memory });
    expect(lit.loot).toBeGreaterThan(0);
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

  // Bond plan Task 5: the whole roster is pinned across the stairs; the floor's field point is the bond tests' to check.
  it('a second run through a depth already cleared gets no grant', () => withBondEarn(false, () => {
    const g = new Game(calm(), null, undefined, 0, LEGACY_LINEUP);
    g.depart(MAIN, 1);
    const first = downstairs(g, g.map().down!);
    expect(first?.kind === 'floor' && first.clear?.exp).toBe(depthClearExp(1));
    expect(g.returnToTown()).toBe(true);
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    const before = structuredClone(g.state.party.roster);
    expect(downstairs(g, g.map().down!)).toEqual({ kind: 'floor', floor: 2 });
    expect(g.state.party.roster).toEqual(before);
  }));

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

describe('apply and follow a build (plan 8h Task 6)', () => {
  const townGame = (storage = memoryStorage()) => {
    const g = new Game(calm(), storage, undefined, 0, HERO_LINEUP);
    const noel = g.state.party.roster.noel;
    g.state.party.roster.noel = { ...noel, level: 35, tree: defaultTree('noel', 35), talents: defaultTalents('noel', 35) };
    g.state.gold = 5000;
    return g;
  };

  it('apply is town only, saved at once, and says what it costs first', () => {
    const storage = memoryStorage();
    const g = townGame(storage);
    const want = g.canApplyBuild('noel', 'meteor');
    expect(want).toEqual({ cost: 25 * 35, changes: true, moves: true, strips: false, reason: null });
    const r = g.applyBuild('noel', 'meteor');
    expect(r.ok).toBe(true);
    expect(g.notice).toBe('saved');
    expect(Game.boot(calm(), storage).state.party.roster.noel.build).toBe('meteor');
    // Again: nothing changes, nothing to pay.
    expect(g.canApplyBuild('noel', 'meteor')).toEqual({ cost: 0, changes: false, moves: false, strips: false, reason: null });
    expect(g.canApplyBuild('noel', 'nope').reason).toBe('invalid');
    const map = inMap();
    expect(map.applyBuild('noel', 'meteor')).toEqual({ ok: false, reason: 'invalid' });
    expect(map.canApplyBuild('noel', 'meteor').reason).toBe('invalid');
  });

  it('a manual point ends following', () => {
    const ends = (act: (g: Game) => boolean) => {
      const g = townGame();
      expect(g.applyBuild('noel', 'meteor').ok).toBe(true);
      g.notice = null;
      expect(act(g)).toBe(true);
      expect(g.state.party.roster.noel).not.toHaveProperty('build');
      expect(g.followEnded).toEqual(['noel']);
    };
    ends((g) => g.respec('noel').ok);
    ends((g) => g.swapVariant('noel', 'noel-star-heavy').ok);
    // Ten more levels of points, not yet spent (a level-up she would follow is not what this tests).
    ends((g) => { g.state.party.roster.noel.level = 45; return Object.keys(NODES).some((n) => NODES[n].owner === 'noel' && g.raiseNode('noel', n).ok); });
    ends((g) => { g.state.party.roster.noel.level = 45; return Object.keys(TALENT_NODES).some((n) => TALENT_NODES[n].owner === 'noel' && g.raiseTalent('noel', n).ok); });
    // Several end before the town speaks: every one is queued, and a later notice ('banked') does not drop them.
    const many = townGame();
    many.state.party.roster.liz = { ...many.state.party.roster.liz, level: 35, tree: defaultTree('liz', 35), talents: defaultTalents('liz', 35) };
    expect(many.applyBuild('noel', 'meteor').ok && many.applyBuild('liz', 'bleed').ok).toBe(true);
    many.respec('noel');
    many.respec('liz');
    many.notice = 'banked';
    expect(many.followEnded).toEqual(['noel', 'liz']);
    // Stopping by hand.
    const g = townGame();
    g.applyBuild('noel', 'meteor');
    g.stopFollowing('noel');
    expect(g.state.party.roster.noel).not.toHaveProperty('build');
    // A refused spend ends nothing.
    const h = townGame();
    h.applyBuild('noel', 'meteor');
    expect(h.raiseNode('noel', 'nope').ok).toBe(false);
    expect(h.state.party.roster.noel.build).toBe('meteor');
  });

  it('a won fight levels a follower up on her build, and a benched one too', () => {
    const g = inMap(1);
    // Noel follows 冰雷循環 at Lv19, a hair from Lv20; Rin, on the bench, follows 千針毒 the same way.
    const set = (id: CharacterId, key: string) => {
      const m = g.state.party.roster[id];
      g.state.party.roster[id] = { ...m, level: 19, exp: expToNext(19) - 1, tree: buildTree(id, 19, buildOf(id, key)!), talents: buildTalents(id, 19, buildOf(id, key)!), build: key };
    };
    set('noel', 'cycle');
    if (!g.state.party.recruited.includes('rin')) g.state.party.recruited.push('rin');
    set('rin', 'venom');
    // 冰雷循環 suggests 雷之星彈 [蓄力, 感電, 雷鳴]: Lv20 opens its second slot, for 感電.
    g.state.runes = { 'jolt@magic': 1 };
    g.state.party.roster.noel.sockets = { 'ice-star': [{ id: 'charge', tier: 'magic' }] };
    const chizuru0 = structuredClone(g.state.party.roster.chizuru);
    stepOnto(g, plantAt(g, 'elite'));
    expect(killAll(g).outcome).toBe('win');
    const noel = g.state.party.roster.noel;
    expect(noel.level).toBe(20);
    expect(noel.tree).toEqual(buildTree('noel', 20, buildOf('noel', 'cycle')!));
    expect(noel.talents).toEqual(buildTalents('noel', 20, buildOf('noel', 'cycle')!));
    expect(noel.sockets?.['ice-star']).toEqual([{ id: 'charge', tier: 'magic' }]);   // what she wore stays
    expect(noel.sockets?.['thunder-star']).toEqual([null, { id: 'jolt', tier: 'magic' }]);   // slot 0 wants 蓄力: none in the bag
    expect(g.state.runes).toEqual({});
    // On the bench, at half the exp, she reaches Lv20 too, and spends it her build's way.
    const rin = g.state.party.roster.rin;
    expect(rin.level).toBe(20);
    expect(rin.tree).toEqual(buildTree('rin', 20, buildOf('rin', 'venom')!));
    // A member who follows nothing keeps her points as they were.
    const chizuru = g.state.party.roster.chizuru;
    expect(chizuru.build).toBeUndefined();
    expect([chizuru.tree, chizuru.talents]).toEqual([chizuru0.tree, chizuru0.talents]);
  });

  it('one fight that crosses many levels spends every point and fills every slot opened on the way (plan 8h)', () => {
    const g = inMap(1);
    // Lv19, one exp short of Lv35: the fight crosses sixteen levels and two rune-slot levels (20 and 35) at once.
    const toLv35 = Array.from({ length: 35 - 19 }, (_, i) => expToNext(19 + i)).reduce((a, b) => a + b, 0) - 1;
    const set = (id: CharacterId, key: string) => {
      const m = g.state.party.roster[id];
      g.state.party.roster[id] = { ...m, level: 19, exp: toLv35, tree: buildTree(id, 19, buildOf(id, key)!), talents: buildTalents(id, 19, buildOf(id, key)!), build: key };
    };
    set('noel', 'cycle');
    if (!g.state.party.recruited.includes('rin')) g.state.party.recruited.push('rin');
    set('rin', 'venom');
    const R = (id: RuneRef['id']): RuneRef => ({ id, tier: 'magic' });
    // 冰雷循環: 冰之星彈 [蓄力, 連擊], 雷之星彈 [蓄力, 感電, 雷鳴]; 千針毒: 千本針 [淬毒, 撕裂, 連擊].
    g.state.runes = { 'jolt@magic': 1, 'thunderclap@magic': 1, 'multistrike@magic': 2, 'tear@magic': 1 };
    g.state.party.roster.noel.sockets = { 'ice-star': [R('charge')] };
    stepOnto(g, plantAt(g, 'elite'));
    expect(killAll(g).outcome).toBe('win');
    for (const [id, key] of [['noel', 'cycle'], ['rin', 'venom']] as const) {
      const m = g.state.party.roster[id];
      expect(m.level, id).toBeGreaterThanOrEqual(35);
      expect(m.build, id).toBe(key);
      expect(m.tree, id).toEqual(buildTree(id, m.level, buildOf(id, key)!, memoriesOf(m)));
      expect(m.talents, id).toEqual(buildTalents(id, m.level, buildOf(id, key)!));
      // Every point of every level crossed is spent.
      expect(skillPointsLeft(m), id).toBe(0);
      expect(talentPointsLeft(m), id).toBe(0);
    }
    const noel = g.state.party.roster.noel;
    expect(noel.sockets?.['ice-star']).toEqual([R('charge'), R('multistrike')]);   // what she wore stays; slot 1 opened at 20
    // Slot 0 was open before the fight (and no 蓄力 in the bag): left alone. Slots 1 (Lv20) and 2 (Lv35) both filled.
    expect(noel.sockets?.['thunder-star']).toEqual([null, R('jolt'), R('thunderclap')]);
    // Benched, at half the exp, she crosses the same levels: slot 0 was open (she left it empty), 1 and 2 are new.
    expect(g.state.party.roster.rin.sockets?.['rin-storm']).toEqual([null, R('tear'), R('multistrike')]);
    expect(g.state.runes).toEqual({});
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
  it('with no storage at all a town formation says save-failed too', () => {
    const g = new Game(calm(), null, undefined, 0, START_LINEUP);
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
    const tree = { 'hero-slash': 5, 'hero-slash-twin': 5, 'hero-cleave': 5, 'hero-sunder': 5 };
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
  it('with no storage at all a town spend says save-failed too, like the other town actions', () => {
    const g = new Game(calm(), null, undefined, 0, HERO_LINEUP);
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

describe('changing a variant side (plan 8d Task 1)', () => {
  it('swapVariant works in town and the field, never in battle', () => {
    const b = V('test-star-b', 'fire-star', '測試星', [{ powerPct: 101 }, { powerPct: 102 }, { powerPct: 103 }], (m) => `測試用的另一個版本，威力 ${m.powerPct}%。`);
    const restore = withNode('noel', 0, 1, P(TREES.noel.branches[0].nodes[1], b));
    try {
      const a = TREES.noel.branches[0].nodes[1].id;
      const storage = memoryStorage();
      const g = new Game(calm(), storage, undefined, 0, HERO_LINEUP);
      const held = { 'fire-star': 1, [a]: 2, 'flame-wave': 1 };
      g.state.party.roster.noel = { ...g.state.party.roster.noel, level: 20, tree: held };
      g.phase = 'battle';
      expect(g.swapVariant('noel', 'test-star-b')).toEqual({ ok: false, reason: 'invalid' });
      expect(g.state.party.roster.noel.tree).toEqual(held);
      g.phase = 'town';
      expect(g.swapVariant('noel', a)).toEqual({ ok: false, reason: 'empty' });
      expect(g.swapVariant('noel', 'flame-wave')).toEqual({ ok: false, reason: 'unknown' });
      expect(g.swapVariant('sylvie', 'test-star-b')).toEqual({ ok: false, reason: 'invalid' });   // not recruited
      expect(storage.map.has(SAVE_KEY)).toBe(false);
      expect(g.swapVariant('noel', 'test-star-b')).toEqual({ ok: true });
      expect(g.state.party.roster.noel.tree).toEqual({ 'fire-star': 1, 'test-star-b': 2, 'flame-wave': 1 });
      expect(g.notice).toBeNull();
      const back = Game.boot(calm(), storage);
      expect(back.state.party.roster.noel.tree).toEqual({ 'fire-star': 1, 'test-star-b': 2, 'flame-wave': 1 });
      // In the labyrinth the change counts at once and waits for the next town save.
      const field = inMap(1, calm(), memoryStorage());
      field.state.party.roster.noel = { ...field.state.party.roster.noel, level: 20, tree: held };
      expect(field.swapVariant('noel', 'test-star-b')).toEqual({ ok: true });
      expect(field.state.party.roster.noel.tree['test-star-b']).toBe(2);
      // A failed town save says so and keeps the change.
      // canSwapVariant answers as swapVariant would, and changes nothing.
      const ask = new Game(calm(), memoryStorage(), undefined, 0, HERO_LINEUP);
      ask.state.party.roster.noel = { ...ask.state.party.roster.noel, level: 20, tree: held };
      expect(ask.canSwapVariant('noel', 'test-star-b')).toBeNull();
      expect(ask.canSwapVariant('noel', a)).toBe('empty');
      expect(ask.canSwapVariant('sylvie', 'test-star-b')).toBe('invalid');
      ask.phase = 'battle';
      expect(ask.canSwapVariant('noel', 'test-star-b')).toBe('invalid');
      expect(ask.state.party.roster.noel.tree).toEqual(held);
      const full = new Game(calm(), { getItem: () => null, setItem: () => { throw new Error('full'); } }, undefined, 0, HERO_LINEUP);
      full.state.party.roster.noel = { ...full.state.party.roster.noel, level: 20, tree: held };
      expect(full.swapVariant('noel', 'test-star-b')).toEqual({ ok: true });
      expect(full.notice).toBe('save-failed');
    } finally { restore(); }
  });
});

describe('moving runes (plan 8e Task 2)', () => {
  it('runes move in town and the field, never in battle', () => {
    const spread = { id: 'spread', tier: 'magic' } as const;
    const lv20 = (g: Game) => {
      g.state.party.roster.noel = { ...g.state.party.roster.noel, level: 20, tree: defaultTree('noel', 20) };
      g.state.runes = { 'spread@magic': 1 };
      return g;
    };
    const storage = memoryStorage();
    const g = lv20(new Game(calm(), storage, undefined, 0, HERO_LINEUP));
    g.phase = 'battle';
    expect(g.canSocketRune('noel', 'fire-star', 0, spread)).toBe('invalid');
    expect(g.socketRune('noel', 'fire-star', 0, spread)).toEqual({ ok: false, reason: 'invalid' });
    expect(g.unsocketRune('noel', 'fire-star', 0)).toEqual({ ok: false, reason: 'invalid' });
    expect(g.state.runes).toEqual({ 'spread@magic': 1 });
    g.phase = 'town';
    expect(g.canSocketRune('noel', 'fire-star', 2, spread)).toBe('slot');
    expect(g.canSocketRune('noel', 'fire-star', 0, spread)).toBeNull();
    expect(g.state.runes).toEqual({ 'spread@magic': 1 });
    expect(storage.map.has(SAVE_KEY)).toBe(false);
    expect(g.socketRune('noel', 'fire-star', 0, { id: 'focus', tier: 'magic' })).toEqual({ ok: false, reason: 'none' });
    expect(storage.map.has(SAVE_KEY)).toBe(false);
    expect(g.socketRune('noel', 'fire-star', 0, spread)).toEqual({ ok: true });
    expect(g.notice).toBeNull();
    expect(Game.boot(calm(), storage).state.party.roster.noel.sockets).toEqual({ 'fire-star': [spread] });
    expect(g.unsocketRune('noel', 'fire-star', 0)).toEqual({ ok: true });
    const back = Game.boot(calm(), storage).state;
    expect([back.runes, back.party.roster.noel.sockets]).toEqual([{ 'spread@magic': 1 }, undefined]);
    // In the labyrinth the move counts at once and waits for the next town save.
    const fieldStorage = memoryStorage();
    const field = inMap(1, calm(), fieldStorage);
    lv20(field);
    const saved = fieldStorage.map.get(SAVE_KEY);
    expect(field.socketRune('noel', 'fire-star', 0, spread)).toEqual({ ok: true });
    expect(field.state.party.roster.noel.sockets).toEqual({ 'fire-star': [spread] });
    expect([field.notice, fieldStorage.map.get(SAVE_KEY)]).toEqual([null, saved]);
    // A failed town save says so and keeps the move.
    const full = lv20(new Game(calm(), { getItem: () => null, setItem: () => { throw new Error('full'); } }, undefined, 0, HERO_LINEUP));
    expect(full.socketRune('noel', 'fire-star', 0, spread)).toEqual({ ok: true });
    expect([full.notice, full.state.runes]).toEqual(['save-failed', {}]);
  });
});

describe('moving a rune between members (plan 8g Task 1)', () => {
  const spread = { id: 'spread', tier: 'magic' } as const;
  /** Noel and Chizuru at Lv20 on their default builds, Noel's 火之星彈 holding 擴散. */
  const ready = (g: Game) => {
    g.state.party.roster.noel = { ...g.state.party.roster.noel, level: 20, tree: defaultTree('noel', 20), sockets: { 'fire-star': [spread] } };
    g.state.party.roster.chizuru = { ...g.state.party.roster.chizuru, level: 20, tree: defaultTree('chizuru', 20) };
    return g;
  };
  const from = { id: 'noel', skill: 'fire-star', slot: 0 } as const;
  const to = { id: 'chizuru', skill: 'pierce', slot: 0 } as const;
  const where = (s: GameState) => [s.party.roster.noel.sockets, s.party.roster.chizuru.sockets];

  it('runes move in the field and are saved at the next town save', () => {
    const storage = memoryStorage();
    const g = ready(inMap(1, calm(), storage));
    const saved = storage.map.get(SAVE_KEY);
    expect(g.canMoveRune(from, to)).toBeNull();
    expect(where(g.state)).toEqual([{ 'fire-star': [spread] }, undefined]);   // asking changes nothing
    expect(g.moveRune(from, to)).toEqual({ ok: true });
    expect(where(g.state)).toEqual([undefined, { pierce: [spread] }]);
    expect([g.notice, storage.map.get(SAVE_KEY)]).toEqual([null, saved]);
    expect(g.returnToTown()).toBe(true);
    expect(g.rest().ok).toBe(true);
    expect(where(Game.boot(calm(), storage).state)).toEqual([undefined, { pierce: [spread] }]);
    // In town a move is saved at once; a refusal says why and changes nothing.
    expect(g.moveRune(to, to)).toEqual({ ok: false, reason: 'invalid' });
    expect(g.canMoveRune(from, to)).toBe('empty');
    expect(g.moveRune(from, to)).toEqual({ ok: false, reason: 'empty' });
    g.notice = null;
    expect(g.moveRune(to, from)).toEqual({ ok: true });
    expect(g.notice).toBeNull();
    expect(where(Game.boot(calm(), storage).state)).toEqual([{ 'fire-star': [spread] }, undefined]);
    // A failed town save says so and keeps the move.
    const full = ready(new Game(calm(), { getItem: () => null, setItem: () => { throw new Error('full'); } }, undefined, 0, HERO_LINEUP));
    expect(full.moveRune(from, to)).toEqual({ ok: true });
    expect([full.notice, ...where(full.state)]).toEqual(['save-failed', undefined, { pierce: [spread] }]);
  });

  it('a battle refuses with invalid', () => {
    const g = ready(new Game(calm(), memoryStorage(), undefined, 0, HERO_LINEUP));
    g.phase = 'battle';
    expect(g.canMoveRune(from, to)).toBe('invalid');
    expect(g.moveRune(from, to)).toEqual({ ok: false, reason: 'invalid' });
    expect(where(g.state)).toEqual([{ 'fire-star': [spread] }, undefined]);
  });

  it('seeRuneTutorial saves in town, waits in the labyrinth', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, HERO_LINEUP);
    expect(g.state.runeTutorialSeen).toBeUndefined();
    g.seeRuneTutorial();
    expect([g.state.runeTutorialSeen, g.notice]).toEqual([true, null]);
    expect(Game.boot(calm(), storage).state.runeTutorialSeen).toBe(true);
    const fieldStorage = memoryStorage();
    const field = inMap(1, calm(), fieldStorage);
    const saved = fieldStorage.map.get(SAVE_KEY);
    field.seeRuneTutorial();
    expect(field.state.runeTutorialSeen).toBe(true);
    expect([field.notice, fieldStorage.map.get(SAVE_KEY)]).toEqual([null, saved]);
    expect(field.returnToTown()).toBe(true);
    expect(field.rest().ok).toBe(true);
    expect(Game.boot(calm(), fieldStorage).state.runeTutorialSeen).toBe(true);
    // A failed town save leaves its notice and keeps the flag.
    const full = new Game(calm(), { getItem: () => null, setItem: () => { throw new Error('full'); } }, undefined, 0, HERO_LINEUP);
    full.seeRuneTutorial();
    expect([full.notice, full.state.runeTutorialSeen]).toEqual(['save-failed', true]);
  });
});

describe('the tree rework on load (plan 8d Task 2)', () => {
  const fixture = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'roster-8b.json');
  const v8 = () => version8Save((JSON.parse(readFileSync(fixture, 'utf8')) as { trees: Record<string, { id: string }[][]> }).trees);

  it('booting a version 8 save writes the migrated game at once, the old text kept in its own key first', () => {
    const { raw } = v8();
    const storage = memoryStorage({ [SAVE_KEY]: raw });
    const g = Game.boot(calm(), storage);
    expect(storage.map.get(V8_KEY)).toBe(raw);
    const saved = JSON.parse(storage.map.get(SAVE_KEY)!);
    expect(saved.version).toBe(SAVE_VERSION);
    expect(saved).toEqual(JSON.parse(JSON.stringify(g.state)));
    // The next boot reads version 9: no second notice, no second free respec.
    const again = Game.boot(calm(), storage);
    expect(again.notice).toBeNull();
    expect(again.state).toEqual(g.state);
  });

  it('a version 8 save that does not migrate cleanly is never saved over', () => {
    const bad = JSON.parse(v8().raw);
    bad.gold = -1;
    const raw = JSON.stringify(bad);
    const storage = memoryStorage({ [SAVE_KEY]: raw });
    const g = Game.boot(calm(), storage);
    expect(g.notice).toBe('save-reset');
    expect(storage.map.get(SAVE_KEY)).toBe(raw);
    expect(storage.map.get(V8_KEY)).toBe(raw);
  });

  it('an old tab left open over the update cannot wipe the progress', () => {
    const { raw } = v8();
    const storage = memoryStorage({ [SAVE_KEY]: raw });
    // The new build migrates and saves; the player plays on.
    const g = Game.boot(calm(), storage);
    g.state.gold = 4321;
    expect(saveGame(storage, g.state)).toBe(true);
    const progress = storage.map.get(SAVE_KEY)!;
    // The old tab (plan 8c's build) reads version 9 as another version: it backs that text up, starts afresh and
    // saves its new game as version 8.
    storage.map.set(BACKUP_KEY, progress);
    storage.map.set(SAVE_KEY, JSON.stringify({ ...newGame(), version: 8 }));
    // The new build boots again: it migrates the old tab's game, and neither the version 8 text nor the progress is lost.
    const next = Game.boot(calm(), storage);
    expect(next.notice).toBe('tree-reworked');
    expect(storage.map.get(V8_KEY)).toBe(raw);
    expect(storage.map.get(BACKUP_KEY)).toBe(progress);
    expect(JSON.parse(storage.map.get(BACKUP_KEY)!).gold).toBe(4321);
  });

  it('a boot that replaces the one which migrated still owes the notice (the title boots once, 繼續 boots again)', () => {
    const storage = memoryStorage({ [SAVE_KEY]: v8().raw });
    const title = Game.boot(calm(), storage);
    expect(title.notice).toBe('tree-reworked');
    // The title's boot already saved version 9, so the next boot alone would say nothing.
    expect(Game.boot(calm(), storage).notice).toBeNull();
    const cont = Game.boot(calm(), storage, 0, title);
    expect(cont.notice).toBe('tree-reworked');
    // Once spoken it is not owed any more, and no other notice is carried over.
    cont.notice = null;
    expect(Game.boot(calm(), storage, 0, cont).notice).toBeNull();
    title.notice = 'saved';
    expect(Game.boot(calm(), storage, 0, title).notice).toBeNull();
  });

  it('booting a version 8 save says the tree was reworked', () => {
    const { raw } = v8();
    const storage = memoryStorage({ [SAVE_KEY]: raw });
    const g = Game.boot(calm(), storage);
    expect(g.notice).toBe('tree-reworked');
    expect(g.state.version).toBe(SAVE_VERSION);
    expect(g.state.party.roster.noel.freeRespec).toBe(true);
    // A version 9 save boots with no notice.
    saveGame(storage, g.state);
    expect(Game.boot(calm(), storage).notice).toBeNull();
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
  it('with no storage at all a town talent spend says save-failed too', () => {
    const g = new Game(calm(), null, undefined, 0, HERO_LINEUP);
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
    expect(r).toEqual({ kind: 'glimmer', gained: [{ kind: 'piece', id: 'rin', n: 1 }] });
    expect(memoriesOf(g.state.party.roster.rin)).toBe(1);
    expect(tileAt(g.map(), c.at)).toBe('floor');
    expect(floorOf(g.run!, 1).contents.some((x) => x.kind === 'glimmer' && x.owner === 'rin')).toBe(false);
    expect(g.run!.dropped[1]).toEqual(['rin']);
    expect(g.state.story.untold).toEqual(['mem:rin:1']);   // story L: told at night in town, not here
    expect(g.pending).toEqual([]);
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

  it('a glimmer tile with no content behind it is dropped, not left as a stuck marker', () => {
    const g = run(['hero'], 1);
    const at = plantGlimmer(g);
    floorOf(g.run!, 1).contents = floorOf(g.run!, 1).contents.filter((c) => c.kind !== 'glimmer');
    expect(tileAt(g.map(), at)).toBe('glimmer');
    expect(stepOnto(g, at).kind).not.toBe('glimmer');
    expect(tileAt(g.map(), at)).toBe('floor');
    expect(g.pending).toEqual([]);
  });

  it('a main-road boss pays the next piece of a story chain', () => {
    const g = run(duo, 5, (x) => finished(x, 'rin'));
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    expect(end.fragments!.filter((f) => f.kind === 'piece')).toEqual([{ kind: 'piece', id: 'hero', n: 1 }]);
    expect(memoriesOf(g.state.party.roster.hero)).toBe(1);
    expect(g.run!.dropped[5]).toEqual(['hero']);
  });

  it('a fight that pays no memory piece lists none', () => {
    const g = run(['hero'], 1);
    stepOnto(g, plantAt(g, 'elite'));
    const end = killAll(g);
    expect((end.fragments ?? []).filter((f) => f.kind === 'piece')).toEqual([]);
  });

  it('the second memory on a floor waits to be told too, after the first (story L)', () => {
    const g = run(duo, 5);
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    expect(end.fragments!.filter((f) => f.kind === 'piece')).toEqual([{ kind: 'piece', id: 'rin', n: 1 }]);
    const r = stepOnto(g, plantGlimmer(g, 'rin'));
    expect(r).toEqual({ kind: 'glimmer', gained: [{ kind: 'piece', id: 'rin', n: 2 }] });
    expect(g.state.story.fresh).not.toContain('mem:rin:2');
    expect(g.state.story.seen).not.toContain('mem:rin:2');
    expect(g.state.story.untold).toEqual(['mem:rin:1', 'mem:rin:2']);
    expect(g.pending).toEqual([]);
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

  it('scenes waiting to play do not outlive the run; an untold memory does (story L)', () => {
    const g = run(duo, 1);
    stepOnto(g, floorOf(g.run!, 1).contents.find((x) => x.kind === 'glimmer' && x.owner === 'rin')!.at);
    expect(g.pending).toEqual([]);
    expect(g.state.story.untold).toEqual(['mem:rin:1']);
    g.state.inventory['return-lamp'] = 1;
    g.useReturnLamp();
    expect(g.pending).toEqual([]);
    expect(g.state.story.untold).toEqual(['mem:rin:1']);   // it waits for the night
    const h = run(duo, 1);
    h.pending.push('town:orik');
    h.pos = { ...h.map().entrance };
    h.encounter = 99;
    h.move('right');
    for (const m of h.battle!.party) { m.hp = 0; m.alive = false; }
    h.submitRound({});
    expect(h.pending).toEqual([]);
    h.pending.push('town:orik');
    h.state.dungeon.reached.mainline = 3;
    expect(h.depart(MAIN, 1)).toEqual({ ok: true });
    expect(h.pending).toEqual([]);
  });

  it("the depth-25 boss's top-up memories wait untold (story L)", () => {
    const g = run(duo, 25, (x) => { x.state.party.roster.hero.memories = 5; });
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    expect(memoriesOf(g.state.party.roster.hero)).toBe(9);
    expect(end.fragments!.filter((f) => f.kind === 'piece' && f.id === 'hero').map((f) => f.kind === 'piece' && f.n)).toEqual([6, 7, 8, 9]);
    expect(g.state.story.queue.filter((id) => id.startsWith('mem:'))).toEqual([]);
    expect(g.state.story.untold).toEqual(['mem:hero:6', 'mem:hero:7', 'mem:hero:8', 'mem:hero:9']);
    expect(g.state.story.seen.some((id) => id.startsWith('mem:hero'))).toBe(false);
    expect(g.pending).toEqual([]);
  });

  it('a single hero piece owed at depth 25 waits untold too (story L)', () => {
    const g = run(duo, 25, (x) => { x.state.party.roster.hero.memories = 8; });
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    expect(end.fragments!.filter((f) => f.kind === 'piece')).toEqual([{ kind: 'piece', id: 'hero', n: 9 }]);
    expect(g.state.story.untold).toEqual(['mem:hero:9']);
    expect(g.state.story.queue).not.toContain('mem:hero:9');
    expect(g.state.story.seen).not.toContain('mem:hero:9');
    expect(g.pending).toEqual([]);
  });

  it("the depth-3 story boss pays Rin's second piece", () => {
    const g = run(duo, 3, (x) => { x.state.party.roster.rin.memories = 1; });
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    expect(end.fragments!.filter((f) => f.kind === 'piece')).toEqual([{ kind: 'piece', id: 'rin', n: 2 }]);
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
    const reward = TOWN_FRAGMENTS.find((f) => f.id === 'orik')!.reward.gold!;
    expect(g.returnFragment('orik').ok).toBe(true);
    expect(g.state.gold).toBe(gold + reward);
    expect(g.pending).toContain('town:orik');
    expect(savedState(storage)!.story.returned).toEqual(['orik']);
    expect(savedState(storage)!.inventory['tf-orik']).toBeUndefined();
    const stored = storage.map.get(SAVE_KEY);
    expect(g.returnFragment('orik')).toEqual({ ok: false, reason: 'invalid' });
    expect(g.state.gold).toBe(gold + reward);
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

  it("a returned fragment's scene survives a reload and is replayable once it has played", () => {
    const storage = memoryStorage();
    const g = held(storage);
    expect(g.returnFragment('orik').ok).toBe(true);
    expect(savedState(storage)!.story.queue).toContain('town:orik');   // saved with the return, not only held in memory
    const back = Game.boot(calm(), storage);   // the tab closed during the scene
    expect(back.arrival).toContain('town:orik');
    expect(handbook(back.state).town.find((t) => t.id === 'orik')!.scene).toBeNull();
    expect(back.sceneDone('town:orik', 'played')).toBe(true);
    expect(back.state.story.queue).not.toContain('town:orik');
    expect(handbook(back.state).town.find((t) => t.id === 'orik')!.scene).toMatchObject({ scene: 'town:orik' });
    expect(savedState(storage)!.story.seen).toContain('town:orik');
  });

  it("a returned fragment's scene plays exactly once on the guild path", () => {
    const g = held();
    expect(g.returnFragment('orik').ok).toBe(true);
    expect(g.pending.filter((s) => s === 'town:orik')).toHaveLength(1);
    expect(g.sceneDone('town:orik', 'played')).toBe(true);
    expect(g.sceneDone('town:orik', 'played')).toBe(false);
    expect(g.state.story.queue).not.toContain('town:orik');
    expect(g.state.story.seen.filter((s) => s === 'town:orik')).toHaveLength(1);
    expect(g.pending).toEqual([]);
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
    const before = JSON.stringify(g.state.dungeon.portals);
    expect(g.rerollPortals()).toBe(true);
    expect(validPortals(g.state.dungeon.portals)).toBe(true);
    expect(JSON.stringify(g.state.dungeon.portals)).not.toBe(before);   // a reroll that only set the flag would keep them
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

describe("Scarlet's story fight", () => {
  const scarletRun = () => {
    const g = new Game(calm(), memoryStorage(), undefined, 0, ['hero', 'rin']);
    g.state.dungeon.reached.iron = 8;
    expect(g.depart({ region: 'iron', condition: 'plain' }, 5)).toEqual({ ok: true });
    g.floor = 8;   // Scarlet's room is iron depth 8: go straight there
    const c = floorOf(g.run!, 8).contents.find((x) => x.kind === 'rescue')!;
    expect(c.who).toBe('scarlet');
    return { g, at: c.at };
  };
  const defend = { hero: { kind: 'defend' as const }, rin: { kind: 'defend' as const } };
  it("Scarlet's rescue is her story fight", () => {
    const { g, at } = scarletRun();
    expect(stepOnto(g, at)).toEqual({ kind: 'rescue', who: 'scarlet' });
    expect(g.battle!.survive).toBe(STORY_FIGHT_ROUNDS);
    expect(g.battle!.enemies[0].defId).toBe('scarlet-foe');
    // She is a person: her own name with no region prefix, and her own weakness and resistance.
    expect(g.battle!.enemies[0].name).toBe(CHARACTERS.scarlet.name);
    expect(g.battle!.enemies[0].weak).toEqual(ENEMIES['scarlet-foe'].weak);
    expect(g.battle!.enemies[0].resist).toEqual(ENEMIES['scarlet-foe'].resist);
    let end = null;
    for (let i = 0; i < STORY_FIGHT_ROUNDS; i++) {
      expect(end).toBeNull();
      end = g.submitRound(defend)!.end;
    }
    expect(end!.outcome).toBe('win');
    expect(end!.met).toMatchObject({ id: 'scarlet' });
    expect(g.state.party.recruited).toContain('scarlet');
    expect(g.state.party.roster.hero.hp).toBeGreaterThanOrEqual(1);
    expect(tileAt(g.map(), at)).toBe('floor');
  });
  it('a story-fight win rolls no gear for the escorts that were never beaten', () => {
    const { g, at } = scarletRun();
    stepOnto(g, at);
    expect(g.battle!.enemies.length).toBeGreaterThan(1);
    const draws = g.run!.lootDraws;
    let res = null;
    for (let i = 0; i < STORY_FIGHT_ROUNDS; i++) res = g.submitRound(defend)!;
    const end = res!.end;
    expect(end!.outcome).toBe('win');
    expect(res!.battle.enemies.slice(1).every((e) => e.alive)).toBe(true);
    expect(g.run!.lootDraws).toBe(draws);
    expect(end!.gear).toEqual([]);
  });
  it('another companion is still met by a plain rescue fight', () => {
    const g = new Game(calm(), memoryStorage(), undefined, 0, ['hero', 'rin']);
    g.state.dungeon.reached.mainline = 3;
    g.depart(MAIN, 2);
    const c = floorOf(g.run!, 2).contents.find((x) => x.kind === 'rescue')!;
    stepOnto(g, c.at);
    expect(g.battle!.survive).toBeUndefined();
    expect(g.battle!.enemies.some((e) => e.defId === 'scarlet-foe')).toBe(false);
  });
  it("fleeing Scarlet's fight leaves her waiting", () => {
    const { g, at } = scarletRun();
    stepOnto(g, at);
    (g as { rng: unknown }).rng = constRng(0);
    const end = g.submitRound({ hero: { kind: 'escape' } })!.end!;
    expect(end.outcome).toBe('fled');
    expect(end.met).toBeUndefined();
    expect(g.state.party.recruited).not.toContain('scarlet');
    expect(tileAt(g.map(), at)).toBe('rescue');
    expect(floorOf(g.run!, 8).contents.some((c) => c.kind === 'rescue')).toBe(true);
  });
});

describe('the arrival queue', () => {
  const duo: CharacterId[] = ['hero', 'rin'];
  /** Loses the fight in the first room: the whole party falls and the game returns to town. */
  const wipeOut = (g: Game) => {
    g.pos = { ...g.map().entrance };
    g.encounter = 99;
    g.move('right');
    expect(g.phase).toBe('battle');
    for (const m of g.battle!.party) { m.hp = 0; m.alive = false; }
    g.submitRound({});
    expect(g.phase).toBe('town');
  };
  /** The arrival without its banter (B1, B2): tests about the chat and the queue read this. */
  const talk = (g: Game): SceneId[] => g.arrival.filter((id) => !id.startsWith('banter:'));
  /**
   * HERO_LINEUP's first open banter, which trails the chat. Story depth Task 6: Noel and Selene's pair leads to one of the
   * six designed payoffs (`noel-selene:3`, `BANTER_PAYOFFS`), so it goes ahead of Liz and Selene's.
   */
  const LINEUP_BANTER: SceneId = 'banter:noel-selene:1';
  const townGame = (start = HERO_LINEUP, storage = memoryStorage()) => {
    const g = new Game(calm(), storage, undefined, 0, start);
    g.state.dungeon.reached.mainline = 3;
    g.state.story.queue = [];
    g.state.story.seen = ['prologue'];
    return g;
  };
  const inRun = (g: Game) => { expect(g.depart(MAIN, 1)).toEqual({ ok: true }); return g; };
  const chatsOf = (g: Game) => g.arrival.filter((id) => id.startsWith('chat:'));

  it("the new game's first arrival is the prologue, then the inn night", () => {
    const storage = memoryStorage();
    const g = Game.fresh(calm(), storage);
    expect(g.arrival).toEqual(['prologue', 'prologue-inn']);
    const reloaded = Game.boot(calm(), storage);
    expect(chatsOf(reloaded)).toEqual([]);
    expect(reloaded.arrival).toEqual(['prologue', 'prologue-inn']);
    // The prologue is done and saved; a reload before the inn night still plays it, and only it.
    expect(reloaded.sceneDone('prologue', 'played')).toBe(true);
    expect(Game.boot(calm(), storage).arrival).toEqual(['prologue-inn']);
  });

  it('a boot with no storage still opens on the prologue and the inn night, with no chat', () => {
    const g = Game.boot(calm(), null);
    expect(g.arrival).toEqual(['prologue', 'prologue-inn']);
  });

  /** Wins the fight in the first room, then lights the lamp home. */
  const winAndLampHome = (g: Game) => {
    g.pos = { ...g.map().entrance };
    g.encounter = 99;
    g.move('right');
    expect(g.phase).toBe('battle');
    for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; }
    g.submitRound({});
    expect(g.phase).toBe('map');
    g.state.inventory['return-lamp'] = 1;
    expect(g.useReturnLamp()).toBe(true);
  };

  it('the first return after a fight Rin won in opens on the first-return scene, then the chat, and never again', () => {
    const storage = memoryStorage();
    const g = townGame(duo, storage);
    g.state.story.seen.push('prologue-inn');
    inRun(g);
    g.returnToTown();
    expect(g.arrival).toEqual(['chat:hero:1']);   // no fight yet: nothing to tell
    expect(g.sceneDone('chat:hero:1', 'played')).toBe(true);
    inRun(g);
    winAndLampHome(g);
    expect(g.arrival[0]).toBe('first-return');
    expect(g.arrival).toHaveLength(2);
    expect(chatsOf(g)).toHaveLength(1);
    expect(Game.boot(calm(), storage).arrival).toEqual([]);   // the arrival was not saved yet: the reload is the town before it
    expect(g.sceneDone('first-return', 'played')).toBe(true);
    expect(Game.boot(calm(), storage).arrival).toEqual([]);
    inRun(g);
    winAndLampHome(g);
    expect(g.arrival).not.toContain('first-return');
  });

  it('a fight won without Rin on the field queues no first return; her first one does', () => {
    const g = townGame(duo);
    g.state.story.seen.push('prologue-inn');
    const grid = g.state.party.grid.map((c) => (c === 'rin' ? null : c));
    expect(g.setFormation(grid)).toEqual({ ok: true });   // the hero may go down alone
    inRun(g);
    winAndLampHome(g);
    expect(g.arrival).not.toContain('first-return');
    expect(g.state.party.roster.rin.exp + g.state.party.roster.rin.level).toBeGreaterThan(1);   // the bench earned exp, and still no scene
    expect(g.recall('rin')).toEqual({ ok: true });
    inRun(g);
    winAndLampHome(g);
    expect(g.arrival[0]).toBe('first-return');
  });

  it('a save from before the opening scenes existed plays neither of them on load', () => {
    const storage = memoryStorage();
    const s = newGame(undefined, 0, duo);
    s.story.queue = [];
    s.story.seen = ['prologue', 'chat:hero:1'];
    s.party.roster.hero.level = 3;
    saveGame(storage, s);
    const g = Game.boot(calm(), storage);
    expect(g.arrival).toEqual([]);
    expect(g.state.story.seen).toEqual(expect.arrayContaining(['prologue-inn', 'first-return']));
    expect(g.state.story.fresh).toEqual([]);
    inRun(g);
    winAndLampHome(g);
    expect(g.arrival).not.toContain('first-return');
    expect(g.arrival).not.toContain('prologue-inn');
  });

  it("a save from before the bellkeeper's arrival, past Rin's choice, never plays it late (continuity fix 4)", () => {
    const storage = memoryStorage();
    const s = newGame(undefined, 0, duo);
    s.story.queue = [];
    s.story.seen = ['prologue', 'prologue-inn', 'rin-reveal'];
    Object.assign(s.party.roster.rin, { memories: chainLength('rin'), oath: true });
    saveGame(storage, s);
    const g = Game.boot(calm(), storage);
    expect(g.arrival).toEqual([]);
    expect(g.state.story.seen).toContain('bellkeeper-arrives');
    expect(g.state.story.fresh).not.toContain('bellkeeper-arrives');
    // a save of this version, with the arrival still waiting, plays it on load
    const waiting = memoryStorage();
    s.story.seen = ['prologue', 'prologue-inn', 'rin-reveal'];
    s.story.queue = ['bellkeeper-arrives'];
    saveGame(waiting, s);
    expect(Game.boot(calm(), waiting).arrival).toEqual(['bellkeeper-arrives']);
  });

  it('a town action with no storage reports a failed save, as recall, forge and inn do', () => {
    const g = new Game(calm(), null, undefined, 0, START_LINEUP);
    const grid = [...g.state.party.grid];
    const h = grid.indexOf('hero');
    const to = (h + 4) % 9;
    grid[to] = grid[h]; grid[h] = null;
    expect(g.setFormation(grid)).toEqual({ ok: true });
    expect(g.notice).toBe('save-failed');
  });

  it('a reload never adds a chat, however much has been met', () => {
    const storage = memoryStorage();
    const g = townGame(HERO_LINEUP, storage);
    saveGame(storage, g.state);
    expect(Game.boot(calm(), storage).arrival).toEqual([]);
  });

  it('a return to town adds one chat', () => {
    const g = inRun(townGame());
    expect(g.arrival).toEqual([]);
    expect(g.returnToTown()).toBe(true);
    // B2: the default lineup has met a banter pair, so its banter follows the one chat, last (B1)
    expect(talk(g)).toHaveLength(1);
    expect(g.arrival).toEqual(['chat:hero:1', LINEUP_BANTER]);
    expect(chatsOf(g)).toEqual(['chat:hero:1']);
    // Leaving by the return lamp is a return to town as well.
    const h = inRun(townGame());
    h.useReturnLamp();
    expect(chatsOf(h)).toEqual(['chat:hero:1']);
  });

  it('a return to town adds one banter after the chat, and takes no draw from game.rng, lootRng or memoryRng (B1)', () => {
    /** A counted rng that never rolls an early encounter, like calm(). */
    const counted = () => { const r = { draws: 0, rng: () => { r.draws++; return 0.99; } }; return r; };
    const trip = (allHeard: boolean) => {
      const r = counted();
      const g = new Game(r.rng, memoryStorage(), undefined, 0, duo);
      g.state.dungeon.reached.mainline = 3;
      g.state.story.queue = [];
      g.state.story.seen = ['prologue', 'prologue-inn'];
      g.state.party = meet(g.state.party, 'noel', 1);
      if (allHeard) g.state.story.seen.push('banter:noel-rin:1');
      inRun(g);
      const run = g.run!;
      const at = { draws: r.draws, loot: run.lootDraws, memory: run.memoryDraws };
      expect(g.returnToTown()).toBe(true);
      return { g, draws: r.draws - at.draws, loot: run.lootDraws - at.loot, memory: run.memoryDraws - at.memory };
    };
    const due = trip(false);
    const none = trip(true);
    expect(due.g.arrival.at(-1)).toBe('banter:noel-rin:1');
    expect(due.g.arrival.filter((id) => id.startsWith('banter:'))).toHaveLength(1);
    expect(chatsOf(due.g)).toHaveLength(1);
    expect(due.g.arrival.indexOf(chatsOf(due.g)[0])).toBeLessThan(due.g.arrival.indexOf('banter:noel-rin:1'));
    expect(none.g.arrival.filter((id) => id.startsWith('banter:'))).toEqual([]);
    expect({ draws: due.draws, loot: due.loot, memory: due.memory }).toEqual({ draws: none.draws, loot: 0, memory: 0 });
    expect(none.loot + none.memory).toBe(0);
    // it is played and recorded like a chat, and saved at once in town
    expect(due.g.sceneDone('banter:noel-rin:1', 'played')).toBe(true);
    expect(due.g.state.story.seen).toContain('banter:noel-rin:1');
    expect(due.g.state.story.queue).toEqual([]);
  });

  it('an old save loads as it is: no banter is replayed or queued, and the next return brings the first one (B1)', () => {
    const storage = memoryStorage();
    const s = townGame(duo, storage).state;
    s.story.seen.push('prologue-inn', 'chat:hero:1', 'chat:rin:1');
    s.party = meet(s.party, 'noel', 1);
    s.party = meet(s.party, 'liz', 1);
    s.party = meet(s.party, 'scarlet', 1);
    saveGame(storage, s);   // nothing new in the format: a save from before B1 is exactly this
    expect(SAVE_VERSION).toBe(9);
    expect(loadGame(storage).status).toBe('ok');
    const g = Game.boot(calm(), storage);
    expect(g.notice).not.toBe('save-reset');
    expect(g.arrival).toEqual([]);
    expect(g.state.story.seen.filter((id) => id.startsWith('banter:'))).toEqual([]);
    expect(g.state.story.queue).toEqual([]);
    inRun(g);
    g.returnToTown();
    // story depth Task 6 (ruling 9's fallback): three pairs ready on a light return, so a second banter follows the first
    // the second, never the first one's pair (Task 6 review): Rin and Scarlet's, with as many left, ahead of Noel and Rin's
    expect(g.arrival.filter((id) => id.startsWith('banter:'))).toEqual(['banter:liz-scarlet:1', 'banter:rin-scarlet:1']);
    // a save that holds a heard banter loads too
    expect(g.sceneDone('banter:liz-scarlet:1', 'played')).toBe(true);
    expect(loadGame(storage).status).toBe('ok');
    expect(Game.boot(calm(), storage).state.story.seen).toContain('banter:liz-scarlet:1');
  });

  it('a wipe enqueues like a safe return', () => {
    const g = inRun(townGame());
    g.state.dungeon.reached.mainline = ACT_DEPTHS.act2;
    wipeOut(g);
    // story L Task 9: act 2's group scene takes the chat's place, the first thing of the night
    expect(g.arrival).toEqual(['act2']);
    expect(g.night[0]).toBe('group:act2');
    expect(g.state.story.queue).toEqual(['act2']);
    expect(g.state.story.nodes).toEqual(['act2']);
  });

  it('leaving a clear screen is a return to town', () => {
    const g = inRun(townGame());
    g.state.story.act1Cleared = true;
    g.state.story.queue = ['act1-after'];
    g.phase = 'clear';
    g.restartAfterClear();
    expect(g.arrival).toEqual(['act1-after', 'chat:hero:1', LINEUP_BANTER]);   // B2: the lineup's banter, last (B1)
  });

  it('the return right after the finale plays no banter; the next return brings it (B1 ruling)', () => {
    const g = inRun(townGame(duo));
    g.state.story.seen.push('prologue-inn');
    g.state.party = meet(g.state.party, 'noel', 1);
    g.state.story.act1Cleared = true;
    g.state.story.finaleCleared = true;
    g.phase = 'clear';
    g.cleared = 'finale';
    g.restartAfterClear();
    expect(g.arrival[0]).toBe('epilogue');   // story depth Task 3: the festival comes first on the return after the ending
    expect(g.arrival.some((id) => id.startsWith('banter:'))).toBe(false);
    expect(chatsOf(g)).toHaveLength(1);   // the chat still comes
    expect(g.sceneDone('epilogue', 'played')).toBe(true);   // the player hears the festival before going back down
    inRun(g);
    g.returnToTown();
    expect(g.arrival.at(-1)).toBe('banter:noel-rin:1');
    // an act-one clear is not heavy: its return keeps the banter
    const h = inRun(townGame(duo));
    h.state.story.seen.push('prologue-inn');
    h.state.party = meet(h.state.party, 'noel', 1);
    h.state.story.act1Cleared = true;
    h.state.story.queue = ['act1-after'];
    h.phase = 'clear';
    h.cleared = 'act1';
    h.restartAfterClear();
    expect(h.arrival[0]).toBe('act1-after');
    expect(h.arrival.at(-1)).toBe('banter:noel-rin:1');
  });

  it('the queue is not played twice: what is done leaves the next arrival', () => {
    const g = inRun(townGame());
    g.state.dungeon.reached.mainline = ACT_DEPTHS.act2;
    g.returnToTown();
    expect(g.sceneDone('act2', 'played')).toBe(true);
    // act 2 is heavy: no banter on that return (B1); and its group scene takes the chat's place (story L Task 9)
    expect(g.arrival).toEqual([]);
    expect(g.night[0]).toBe('group:act2');
    expect(g.sceneDone('group:act2', 'played')).toBe(true);
    inRun(g);
    g.returnToTown();
    expect(g.arrival).toEqual(['chat:hero:1', LINEUP_BANTER]);   // B2: the lineup's banter, last (B1)
    expect(g.sceneDone('chat:hero:1', 'played')).toBe(true);
    inRun(g);
    g.returnToTown();
    expect(talk(g)).toHaveLength(1);   // one chat, and not the one already heard
    expect(g.arrival.at(-1)).toBe(LINEUP_BANTER);   // the banter was not played, so it is still the one due
    expect(g.arrival).not.toContain('chat:hero:1');
  });

  it('the reveal survives a reload and a wipe', () => {
    const storage = memoryStorage();
    const g = townGame(duo, storage);
    g.state.party.roster.rin.memories = chainLength('rin');
    inRun(g);
    wipeOut(g);
    expect(g.arrival).toEqual(['rin-reveal']);
    saveGame(storage, g.state);
    const again = Game.boot(calm(), storage);
    expect(again.arrival).toEqual(['rin-reveal']);   // not played, so it waits
    expect(again.sceneDone('rin-reveal', 'skipped')).toBe(true);
    expect(again.state.party.roster.rin.oath).toBe(true);
    const done = Game.boot(calm(), storage);   // sceneDone saved by itself
    expect(done.arrival).not.toContain('rin-reveal');
    expect(done.state.party.roster.rin.oath).toBe(true);
    expect(done.state.story.seen).toContain('rin-reveal');
    expect(done.state.story.queue).not.toContain('rin-reveal');
  });

  it('departure is never blocked by the queue', () => {
    const g = townGame();
    g.arrival = ['act2', 'chat:hero:1'];
    g.state.story.queue = ['act2'];
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.state.story.queue).toEqual(['act2']);   // it waits for the next return
  });

  it('sceneDone refuses scenes that are not due', () => {
    const storage = memoryStorage();
    const g = townGame(HERO_LINEUP, storage);
    g.state.story.queue = ['act3'];
    g.arrival = ['act2'];
    const before = JSON.stringify(g.state);
    expect(g.sceneDone('act3', 'played')).toBe(false);   // queued, but not on this arrival
    expect(g.sceneDone('mem:hero:1', 'played')).toBe(false);
    expect(g.sceneDone('finale', 'played')).toBe(false);   // there is no finale yet
    expect(JSON.stringify(g.state)).toBe(before);
    expect(g.arrival).toEqual(['act2']);
    g.finale = { pieces: ['mem:hero:9'] };   // once the finale is due, it and its own memories are, and nothing else
    expect(g.sceneDone('mem:hero:10', 'played')).toBe(false);
    expect(g.sceneDone('mem:hero:9', 'played')).toBe(true);
    expect(g.sceneDone('finale', 'played')).toBe(true);
  });

  it('a scene on the arrival is recorded, taken off it and saved at once', () => {
    const storage = memoryStorage();
    const g = townGame(HERO_LINEUP, storage);
    g.state.story.queue = ['act2'];
    g.arrival = ['act2', 'chat:hero:1'];
    expect(g.sceneDone('act2', 'auto')).toBe(true);
    expect(g.arrival).toEqual(['chat:hero:1']);
    expect(g.sceneDone('act2', 'auto')).toBe(false);   // no longer due
    const saved = loadGame(storage);
    expect(saved.status).toBe('ok');
    if (saved.status === 'ok') expect(saved.state.story).toMatchObject({ queue: [], fresh: ['act2'] });
    expect(g.sceneDone('chat:hero:1', 'played')).toBe(true);
    expect(g.state.story.seen).toContain('chat:hero:1');
    expect(g.state.story.fresh).toEqual(['act2']);
  });

  it('a returned fragment is done from pending, and is not saved on the road (story L: no memory is pending)', () => {
    const storage = memoryStorage();
    const g = inRun(townGame(duo, storage));
    g.pending.push('town:orik');
    expect(g.sceneDone('town:orik', 'played')).toBe(true);
    expect(g.pending).toEqual([]);
    expect(g.state.story.seen).toContain('town:orik');
    expect(loadGame(storage).status).toBe('empty');   // only a town save follows a scene done
  });

  it('markRead drops the new mark, and saves in town', () => {
    const storage = memoryStorage();
    const g = townGame(HERO_LINEUP, storage);
    g.state.story.seen.push('act2');
    g.state.story.fresh.push('act2');
    g.markRead('act2');
    expect(g.state.story.fresh).toEqual([]);
    const saved = loadGame(storage);
    expect(saved.status === 'ok' && saved.state.story.fresh).toEqual([]);
  });

  it('a pending scene is dropped on a return, a wipe and a depart, but the queue and the untold are kept', () => {
    const g = inRun(townGame(duo));
    g.state.story.queue = ['act2'];
    g.state.party.roster.rin.memories = 1;
    g.state.story.untold = ['mem:rin:1'];
    g.pending.push('town:orik');
    g.returnToTown();
    expect(g.pending).toEqual([]);
    expect(g.state.story.queue).toEqual(['act2']);
    expect(g.state.story.untold).toEqual(['mem:rin:1']);
  });
});

describe('the state after Act 1', () => {
  it('saves and loads a valid v8 game with Act 1 cleared and its close queued', () => {
    const storage = memoryStorage();
    const g = inMap(3, calm(), storage);
    g.state.story.queue = [];
    g.state.story.seen = ['prologue', 'prologue-inn'];   // the opening is behind this party
    stepOnto(g, g.map().boss!);
    for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; }
    g.submitRound({});
    expect(g.cleared).toBe('act1');
    g.restartAfterClear();
    expect(g.state.story.act1Cleared).toBe(true);
    expect(g.state.story.queue).toContain('act1-after');
    // Rin is not in this lineup, so no first-return scene: Act 1's close leads the arrival (Task 10b).
    expect(g.arrival[0]).toBe('act1-after');
    expect(saveGame(storage, g.state)).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') return;
    expect(loaded.state.version).toBe(SAVE_VERSION);
    expect(loaded.state.story.act1Cleared).toBe(true);
    expect(loaded.state.story.queue).toContain('act1-after');
    expect(loaded.state).toEqual(g.state);
    expect(Game.boot(calm(), storage).arrival).toContain('act1-after');
  });

  it('a hand-made post-Act-1 state round-trips as well', () => {
    const storage = memoryStorage();
    const s = newGame();
    s.story.act1Cleared = true;
    s.story.seen = ['prologue'];
    s.story.queue = ['act1-after'];
    expect(saveGame(storage, s)).toBe(true);
    expect(loadGame(storage)).toEqual({ status: 'ok', state: s });
  });
});

describe('the finale', () => {
  const duo: CharacterId[] = ['hero', 'rin'];
  // Rin has made her choice unless a test says otherwise: the finale waits for it (U3).
  const run = (depth: number, tweak: (g: Game) => void = () => {}, oath = true) => {
    const g = new Game(calm(), memoryStorage(), undefined, 0, duo);
    g.state.dungeon.reached.mainline = Math.max(3, depth);
    // A game this deep has heard the acts it reached (continuity fix 1: an act still owed plays inside the finale).
    for (const node of ['act2', 'act3', 'act4'] as const) {
      if (g.state.dungeon.reached.mainline < ACT_DEPTHS[node]) continue;
      g.state.story.nodes.push(node);
      g.state.story.seen.push(node);
    }
    if (oath) Object.assign(g.state.party.roster.rin, { memories: chainLength('rin'), oath: true });   // a valid save: the oath needs every piece
    tweak(g);
    expect(g.depart(MAIN, depth)).toEqual({ ok: true });
    return g;
  };
  const heroMemories = (g: Game) => g.state.story.queue.filter((id) => id.startsWith('mem:hero:'));
  const heroPieces = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `mem:hero:${from + i}`);

  it("the depth-30 boss is the lantern's mother until the finale", () => {
    const g = run(FINALE_DEPTH);
    stepOnto(g, g.map().boss!);
    expect(g.phase).toBe('battle');
    expect(g.battle!.boss).toBe(true);
    expect(g.battle!.enemies.map((e) => [e.defId, e.name])).toEqual([[FINALE_BOSS.base, STORY.finaleBossName]]);
  });

  it("the finale waits for Rin's choice", () => {
    const g = run(FINALE_DEPTH, () => {}, false);
    const boss = g.map().boss!;
    const r = stepOnto(g, boss);
    expect(r.kind).not.toBe('boss');
    expect([g.phase, g.battle, g.finaleWaiting, g.cleared]).toEqual(['map', null, true, null]);
    expect(tileAt(g.map(), boss)).toBe('boss');   // she is still there: the boss keeps its place
    // Any other step clears the flag, and stepping back onto her says it again.
    const away = DIRS.find((d) => tileAt(g.map(), { x: boss.x + DELTA[d].x, y: boss.y + DELTA[d].y }) !== 'wall')!;
    g.move(away);
    expect(g.finaleWaiting).toBe(false);
    stepOnto(g, boss);
    expect(g.finaleWaiting).toBe(true);
    expect(g.state.story.finaleCleared).toBe(false);
  });

  it('with her choice the finale starts', () => {
    const g = run(FINALE_DEPTH);
    expect(g.state.party.roster.rin.oath).toBe(true);
    stepOnto(g, g.map().boss!);
    expect([g.phase, g.finaleWaiting]).toEqual(['battle', false]);
    expect(g.battle!.enemies.map((e) => e.name)).toEqual([STORY.finaleBossName]);
  });

  it('a party that waited can leave, get her choice, and come back to the finale', () => {
    const g = run(FINALE_DEPTH, () => {}, false);
    stepOnto(g, g.map().boss!);
    expect(g.finaleWaiting).toBe(true);
    g.state.inventory['return-lamp'] = 1;
    expect(g.useReturnLamp()).toBe(true);
    expect(g.finaleWaiting).toBe(false);
    Object.assign(g.state.party.roster.rin, { memories: chainLength('rin'), oath: true });
    expect(g.depart(MAIN, FINALE_DEPTH)).toEqual({ ok: true });
    stepOnto(g, g.map().boss!);
    expect(g.phase).toBe('battle');
  });

  it('only the finale waits: an ordinary depth-30 boss and another road are not held back', () => {
    const g = run(FINALE_DEPTH, (x) => { x.state.story.finaleCleared = true; x.state.story.act1Cleared = true; }, false);
    stepOnto(g, g.map().boss!);
    expect([g.phase, g.finaleWaiting]).toEqual(['battle', false]);
    const h = new Game(calm(), memoryStorage(), undefined, 0, duo);
    h.state.dungeon.reached.blaze = FINALE_DEPTH;
    expect(h.depart({ region: 'blaze', condition: 'plain' }, FINALE_DEPTH)).toEqual({ ok: true });
    stepOnto(h, h.map().boss!);
    expect([h.phase, h.finaleWaiting]).toEqual(['battle', false]);
  });

  it('Rin catches up while the finale waits', () => {
    const g = run(26, (x) => { x.state.party.roster.rin.memories = 6; }, false);
    expect(g.run!.glimmers[26]).toContain('rin');
    expect(downstairs(g, g.map().down!)).toMatchObject({ kind: 'floor', floor: 27 });
    // Her seventh piece is the last one: the floor after she holds it forces nothing for her.
    g.state.party.roster.rin.memories = 7;
    expect(downstairs(g, g.map().down!)).toMatchObject({ kind: 'floor', floor: 28 });
    expect(g.run!.glimmers[28]).not.toContain('rin');
  });

  it('only the main road names her: a depth-30 boss elsewhere is the ordinary beast', () => {
    const g = new Game(calm(), memoryStorage(), undefined, 0, duo);
    g.state.dungeon.reached.blaze = FINALE_DEPTH;
    expect(g.depart({ region: 'blaze', condition: 'plain' }, FINALE_DEPTH)).toEqual({ ok: true });
    stepOnto(g, g.map().boss!);
    expect(g.battle!.enemies[0].name).toContain(ENEMIES[FINALE_BOSS.base].name);   // the grown beast, not her
    expect(g.battle!.enemies[0].name).not.toBe(STORY.finaleBossName);
  });

  it('beating her clears the finale and brings the hero to ten', () => {
    const g = run(FINALE_DEPTH, (x) => { x.state.party.roster.hero.memories = 2; });
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    expect(memoriesOf(g.state.party.roster.hero)).toBe(10);
    expect(g.finale).toEqual({ pieces: ['finale-eve', ...heroPieces(3, 10)] });   // story L: the eve no departure told comes first
    expect(end.fragments!.filter((f) => f.kind === 'piece').every((f) => f.kind === 'piece' && f.id === 'hero')).toBe(true);
    expect([g.phase, g.cleared, g.state.story.finaleCleared]).toEqual(['clear', 'finale', true]);
    // The finale plays them, so nothing is marked seen, new or waiting for the town or the screen.
    expect(g.state.story.seen.some((id) => id.startsWith('mem:hero:'))).toBe(false);
    expect(g.state.story.fresh.some((id) => id.startsWith('mem:hero:'))).toBe(false);
    expect(heroMemories(g)).toEqual([]);
    expect(g.pending).toEqual([]);
  });

  it('the finale needs no hero memories and no full party', () => {
    const g = run(FINALE_DEPTH);   // the hero and Rin only, nobody holds a piece
    expect(g.state.party.recruited).toEqual(duo);
    expect(memoriesOf(g.state.party.roster.hero)).toBe(0);
    expect(memoriesOf(g.state.party.roster.rin)).toBe(chainLength('rin'));   // only Rin's choice is asked for
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect([g.phase, g.cleared]).toEqual(['clear', 'finale']);
    expect(g.finale).toEqual({ pieces: ['finale-eve', ...heroPieces(1, 10)] });
    expect(memoriesOf(g.state.party.roster.hero)).toBe(10);
  });

  it('the finale save still loads: the first act counts as cleared with it', () => {
    const g = run(FINALE_DEPTH);
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.state.story.act1Cleared).toBe(true);
    g.restartAfterClear();
    const saved = memoryStorage();
    expect(saveGame(saved, g.state)).toBe(true);
    expect(loadGame(saved).status).toBe('ok');
  });

  it('after the finale the depth-30 boss is an ordinary boss', () => {
    const g = run(FINALE_DEPTH, (x) => { x.state.story.finaleCleared = true; x.state.story.act1Cleared = true; });
    stepOnto(g, g.map().boss!);
    expect(g.battle!.enemies[0].name).toContain(ENEMIES[FINALE_BOSS.base].name);   // the grown beast, not her
    expect(g.battle!.enemies[0].name).not.toBe(STORY.finaleBossName);
    killAll(g);
    expect([g.phase, g.cleared, g.finale]).toEqual(['map', null, null]);
  });

  it('memories still untold from depth 25 play before the finale (story L)', () => {
    const g = run(25, (x) => { x.state.party.roster.hero.memories = 5; });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(heroMemories(g)).toEqual([]);
    expect(g.state.story.untold).toEqual(heroPieces(6, 9));   // owed at depth 25, waiting for a night in town
    for (let f = 25; f < FINALE_DEPTH; f++) expect(downstairs(g, g.map().down!)).toMatchObject({ kind: 'floor', floor: f + 1 });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.finale).toEqual({ pieces: ['finale-eve', ...heroPieces(6, 10)] });
    expect(heroMemories(g)).toEqual([]);
    expect(g.state.story.untold).toEqual([]);   // the finale's now
    expect([g.phase, g.cleared]).toEqual(['clear', 'finale']);
  });

  // Continuity fix 1 (supersedes I-100's "one visit" ruling): no act node may play after the finale.
  it('an act held back by Rin\'s reveal plays inside the finale, before the hero\'s memories', () => {
    // The fast dive: depth 16 crossed in the same trip as her seventh piece, so the reveal played alone and act 4 waits.
    const g = run(FINALE_DEPTH, (x) => {
      x.state.party.roster.hero.memories = 8;
      x.state.story.seen = x.state.story.seen.filter((id) => id !== 'act4');
      x.state.story.queue.push('act4');
    });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.finale!.pieces).toEqual(['finale-eve', 'act4', 'mem:hero:9', 'mem:hero:10']);
    expect(g.state.story.queue).not.toContain('act4');
    for (const id of g.finale!.pieces) expect(g.sceneDone(id, 'played'), id).toBe(true);
    expect(g.sceneDone('finale', 'played')).toBe(true);
    g.restartAfterClear();
    expect(g.arrival.filter((id) => id.startsWith('act'))).toEqual([]);   // the town never plays it after the ending
  });

  it('acts reached but never queued (no return since) are owed to the finale too, in act order', () => {
    // A dive from depth 9 straight to 30 after the reveal: acts 3 and 4 were reached in this run, never queued.
    const g = run(FINALE_DEPTH, (x) => {
      x.state.story.nodes = ['act2'];
      x.state.story.seen = x.state.story.seen.filter((id) => id !== 'act3' && id !== 'act4');
    });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.finale!.pieces.slice(0, 4)).toEqual(['finale-eve', 'act3', 'act4', 'mem:hero:1']);
    expect(g.state.story.nodes).toEqual(['act2', 'act3', 'act4']);   // their truth pages open with them
    for (const id of g.finale!.pieces) g.sceneDone(id, 'auto');
    g.sceneDone('finale', 'auto');
    g.restartAfterClear();
    expect(g.state.story.queue.filter((id) => id.startsWith('act'))).toEqual([]);
  });

  it("the bellkeeper's arrival still waiting plays inside the finale, after the acts and before the hero's memories", () => {
    // Her reveal, then straight back down to the bottom: the finale hands her bell to a man the player must have met.
    const g = run(FINALE_DEPTH, (x) => {
      x.state.party.roster.hero.memories = 9;
      x.state.story.seen = x.state.story.seen.filter((id) => id !== 'act4');
      x.state.story.queue.push('bellkeeper-arrives', 'act4');
    });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.finale!.pieces).toEqual(['finale-eve', 'act4', 'bellkeeper-arrives', 'mem:hero:10']);
    expect(g.state.story.queue).not.toContain('bellkeeper-arrives');
  });

  // Story depth Task 3 (plan ruling 8): what the finale owes is played before it; nothing heavy is left for the town.
  it('the finale plays the owed confession and the keeper before itself', () => {
    const g = run(FINALE_DEPTH, (x) => {
      x.state.party.roster.hero.memories = 9;
      x.state.story.seen.push('prologue', 'prologue-inn', 'first-return', 'rin-reveal');
      x.state.story.queue = ['rin-confess'];
    });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.finale!.pieces).toEqual(['finale-eve', 'rin-confess', 'bellkeeper-arrives', 'mem:hero:10']);
    expect(g.state.story.queue).not.toContain('rin-confess');
    for (const id of g.finale!.pieces) expect(g.sceneDone(id, 'played'), id).toBe(true);
    expect(g.sceneDone('finale', 'played')).toBe(true);
    expect(g.state.story.queue.filter((id) => HEAVY_MAJORS.has(id) || ALONE.includes(id))).toEqual([]);
    expect(g.state.story.seen).toEqual(expect.arrayContaining(['rin-confess', 'bellkeeper-arrives', 'finale']));
    g.restartAfterClear();
    expect(g.arrival[0]).toBe('epilogue');   // the festival, first on the return after the ending
  });

  // Final review: no return between her choice and the finale, so the keeper's arrival is owed and plays at the bottom, his
  // tenth piece in hand. It reads its lamp lines: he is already waiting there, not standing at the town's gate.
  it('owed at the finale, the keeper waits at the lamp, not in town; she says 「師父」 and nothing more', () => {
    const g = run(FINALE_DEPTH, (x) => {
      x.state.party.roster.hero.memories = 9;
      x.state.party.roster.rin.oath = true;
      x.state.story.seen.push('prologue', 'prologue-inn', 'first-return', 'rin-reveal');
      x.state.story.queue = ['rin-confess'];
    });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.finale!.pieces).toContain('bellkeeper-arrives');
    expect(memoriesOf(g.state.party.roster.hero)).toBe(chainLength('hero'));
    const lines = flatLines(linesOf('bellkeeper-arrives', g.state));   // the reading the game plays, from its own state (re-review)
    expect(lines.length).toBeLessThanOrEqual(lineCap('bellkeeper-arrives'));
    const said = lines.map((l) => l.text).join('');
    expect(said).toMatch(/燈座/);
    expect(said).not.toMatch(/傳送門廣場|鎮裡|幾天後/);
    const master = lines.findIndex((l) => l.who === 'rin' && /師父/.test(l.text));
    expect(master).toBeGreaterThan(0);
    expect(lines.slice(master + 1).some((l) => l.who === 'rin')).toBe(false);
    expect(said).not.toMatch(/原諒|和好|和解/);
  });

  it('a lone morning still owed at the finale counts as seen and new', () => {
    const g = run(FINALE_DEPTH, (x) => {
      x.state.party.roster.hero.memories = 9;
      x.state.story.seen.push('rin-reveal', 'rin-confess', 'bellkeeper-arrives', 'mem:hero:9');
      x.state.story.queue.push('hero-alone');
    });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.finale!.pieces).not.toContain('hero-alone');
    expect(g.state.story.queue).not.toContain('hero-alone');
    expect(g.state.story.seen).toContain('hero-alone');
    expect(g.state.story.fresh).toContain('hero-alone');
  });

  // Task 3 review (Important): a lone morning never queued, because no return came between her choice, his ninth piece
  // and the finale, is answered by the finale all the same (design §9.3.5): seen, and new.
  it('a single dive from depth 25 to the finale counts the lone morning as seen and new', () => {
    const g = run(25, (x) => {
      x.state.party.roster.hero.memories = 8;
      x.state.story.seen.push('prologue', 'prologue-inn', 'first-return', 'rin-reveal', 'rin-confess', 'bellkeeper-arrives');
      x.state.story.queue = [];
    });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.state.story.untold).toEqual(['mem:hero:9']);   // the top-up, waiting for a return that never comes (story L: untold)
    expect(g.state.story.queue).not.toContain('hero-alone');
    for (let f = 25; f < FINALE_DEPTH; f++) expect(downstairs(g, g.map().down!)).toMatchObject({ kind: 'floor', floor: f + 1 });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.finale!.pieces).not.toContain('hero-alone');
    expect(g.state.story.queue).not.toContain('hero-alone');
    expect(g.state.story.seen).toContain('hero-alone');
    expect(g.state.story.fresh).toContain('hero-alone');
  });

  it('departing right after the reveal: the finale plays the confession and the keeper, and counts the lone morning as seen and new', () => {
    const g = run(FINALE_DEPTH, (x) => {
      x.state.party.roster.hero.memories = 9;
      x.state.story.seen.push('prologue', 'prologue-inn', 'first-return', 'rin-reveal', 'mem:hero:9');
      x.state.story.queue = ['rin-confess'];
    });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.finale!.pieces).toEqual(['finale-eve', 'rin-confess', 'bellkeeper-arrives', 'mem:hero:10']);
    expect(g.state.story.seen).toContain('hero-alone');
    expect(g.state.story.fresh).toContain('hero-alone');
    expect(g.state.story.queue).not.toContain('hero-alone');
  });

  // Task 3 review (minor): the keeper her confession queues inside the finale is the finale's own scene: it never waits in
  // the queue, so leaving the ending early cannot leave him for the town after the festival.
  it('the finale keeps the scenes it covers out of the queue, even if the ending is left early', () => {
    const g = run(FINALE_DEPTH, (x) => {
      x.state.party.roster.hero.memories = 9;
      x.state.story.seen.push('prologue', 'prologue-inn', 'first-return', 'rin-reveal', 'mem:hero:9');
      x.state.story.queue = ['rin-confess'];
    });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.sceneDone('rin-confess', 'played')).toBe(true);
    expect(g.state.story.queue).not.toContain('bellkeeper-arrives');
    expect(g.sceneDone('bellkeeper-arrives', 'played')).toBe(true);   // still the finale's to play
    const left = run(FINALE_DEPTH, (x) => {
      x.state.party.roster.hero.memories = 9;
      x.state.story.seen.push('prologue', 'prologue-inn', 'first-return', 'rin-reveal', 'mem:hero:9');
      x.state.story.queue = ['rin-confess'];
    });
    stepOnto(left, left.map().boss!);
    killAll(left);
    left.sceneDone('rin-confess', 'played');
    left.restartAfterClear();   // the ending left before the keeper played
    expect(left.state.story.queue).not.toContain('bellkeeper-arrives');
    expect(left.arrival).not.toContain('bellkeeper-arrives');
  });

  it('an untold piece of someone else stays untold (story L)', () => {
    const g = run(FINALE_DEPTH, (x) => { x.state.story.untold = ['mem:rin:1']; });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.state.story.untold).toEqual(['mem:rin:1']);
    expect(g.finale!.pieces[0]).toBe('finale-eve');   // story L: the eve, with no companion's piece to tell
    expect(g.finale!.pieces.slice(1).every((id) => id.startsWith('mem:hero:'))).toBe(true);
  });

  it('the finale and its memories are due only while the finale is', () => {
    const g = run(FINALE_DEPTH, (x) => { x.state.party.roster.hero.memories = 8; });
    expect(g.sceneDone('finale', 'played')).toBe(false);
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.sceneDone('mem:hero:9', 'played')).toBe(true);
    expect(g.sceneDone('mem:hero:10', 'auto')).toBe(true);
    expect(g.sceneDone('finale', 'played')).toBe(true);
    expect(g.sceneDone('mem:hero:8', 'played')).toBe(false);   // not one of hers
    expect(g.state.story.seen).toEqual(expect.arrayContaining(['mem:hero:9', 'mem:hero:10', 'finale']));
    // only the auto one reads as new, and the lone morning the finale answered (Task 3 review: seen and new, queued or not)
    expect(g.state.story.fresh).toEqual(['hero-alone', 'mem:hero:10']);
    g.restartAfterClear();
    expect([g.phase, g.finale, g.cleared]).toEqual(['town', null, null]);
    expect(g.sceneDone('finale', 'played')).toBe(false);
  });
});

describe('the depth-3 story boss after the finale branch', () => {
  const kill = (queue: SceneId[] = [], seen: SceneId[] = []) => {
    const g = new Game(calm(), memoryStorage(), undefined, 0, ['hero', 'rin']);
    g.state.dungeon.reached.mainline = 3;
    g.state.story.queue = queue;
    g.state.story.seen = seen;
    expect(g.depart(MAIN, 3)).toEqual({ ok: true });
    stepOnto(g, g.map().boss!);
    killAll(g);
    return g;
  };
  it('queues act1-after once and clears as the first act', () => {
    const g = kill(['prologue']);
    expect([g.phase, g.cleared, g.finale]).toEqual(['clear', 'act1', null]);
    expect(g.state.story.act1Cleared).toBe(true);
    expect(g.state.story.finaleCleared).toBe(false);
    expect(g.state.story.queue.filter((id) => id === 'act1-after')).toHaveLength(1);
  });
  it('a later kill does not queue it again, while it waits or once it was seen', () => {
    expect(kill(['act1-after']).state.story.queue.filter((id) => id === 'act1-after')).toHaveLength(1);
    expect(kill([], ['act1-after']).state.story.queue).not.toContain('act1-after');
  });
});

describe('casting in the field', () => {
  it('casting in the field works on the map only, draws nothing and is not saved', () => {
    let draws = 0;
    const base = calm();
    const spy = () => { draws++; return base(); };
    const storage = memoryStorage();
    const g = inMap(1, spy, storage);
    const half = Math.floor(statsOf(g.state.party.roster.hero).hp / 2);
    g.state.party.roster.hero.hp = half;
    const tp = g.state.party.roster.selene.tp;
    const saved = new Map(storage.map);
    const loot = g.run!.lootDraws, memory = g.run!.memoryDraws;
    draws = 0;
    const r = g.castInField('selene', 'moonlight', 'hero');
    expect(r.ok).toBe(true);
    expect(g.state.party.roster.hero.hp).toBeGreaterThan(half);
    expect(g.state.party.roster.selene.tp).toBe(tp - SKILLS.moonlight.tp);
    expect(draws).toBe(0);
    expect([g.run!.lootDraws, g.run!.memoryDraws]).toEqual([loot, memory]);
    expect(storage.map).toEqual(saved);
    expect(g.returnToTown()).toBe(true);
    g.state.party.roster.hero.hp = half;
    expect(g.castInField('selene', 'moonlight', 'hero')).toEqual({ ok: false, reason: 'phase' });
    expect(g.state.party.roster.hero.hp).toBe(half);
  });
});

describe('gear and rows in the labyrinth (6f Task 3)', () => {
  const wornUids = (g: Game) => Object.values(g.state.party.roster.hero.equip).map((it) => it!.uid);
  /** Loses the next fight: the whole party falls and the game is back in town. */
  const loseAFight = (g: Game) => {
    g.encounter = 99;
    expect(g.move('right')).toEqual({ kind: 'battle' });
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    expect(g.submitRound({})!.end!).toMatchObject({ outcome: 'lose' });
    expect([g.phase, g.notice, g.run]).toEqual(['town', 'wipe', null]);
  };

  it('gear changes in the field are refused in town and when they make the pack heavier past the limit', () => {
    const town = new Game(calm(), memoryStorage(), undefined, 0, HERO_LINEUP);
    town.state.party.roster.hero.equip.body = plainItem('leather-vest', 500);
    expect(town.equipFromPack('hero', 500)).toEqual({ ok: false, reason: 'phase' });
    expect(town.unequipToPack('hero', 'body')).toEqual({ ok: false, reason: 'phase' });
    expect(town.state.party.roster.hero.equip.body?.uid).toBe(500);

    const g = inMap(1);
    g.state.party.roster.hero.equip.body = plainItem('leather-vest', 501);
    // Fill the run pack with moss until it weighs exactly the limit.
    const room = capacity(g.state.party) - carried(g.state, g.run);
    const moss = room / weightOf('moss');
    expect(Number.isInteger(moss) && moss > 0).toBe(true);
    g.run!.loot.items['moss'] = moss;
    expect(carried(g.state, g.run)).toBe(capacity(g.state.party));
    const state = structuredClone(g.state);
    const pack = g.run!.loot.gear;
    const packCopy = structuredClone(pack);
    expect(g.unequipToPack('hero', 'body')).toEqual({ ok: false, reason: 'heavy' });
    expect(g.state).toEqual(state);
    expect(g.run!.loot.gear).toBe(pack);
    expect(g.run!.loot.gear).toEqual(packCopy);

    // Over the limit already: a piece worn into an empty slot makes the pack lighter, so it is allowed though still over.
    g.run!.loot.items['moss'] = moss + 2;
    g.run!.loot.gear = [plainItem('leather-cap', 502), plainItem('leather-vest', 503)];
    const over = carried(g.state, g.run) - capacity(g.state.party);
    expect(g.equipFromPack('hero', 502)).toEqual({ ok: true });
    const after = carried(g.state, g.run) - capacity(g.state.party);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(over);
    expect(g.state.party.roster.hero.equip.head?.uid).toBe(502);
    // A swap that weighs the same is allowed too: it is not heavier.
    expect(g.equipFromPack('hero', 503)).toEqual({ ok: true });
    expect(carried(g.state, g.run) - capacity(g.state.party)).toBe(after);
    expect(g.state.party.roster.hero.equip.body?.uid).toBe(503);
    expect(g.run!.loot.gear.map((it) => it.uid)).toEqual([501]);
  });

  it('wearing from the pack is refused as heavy when the swap lowers the limit at the limit', () => {
    const g = inMap(1);
    // A worn sword with strength on it, and a plain one of the same weight in the pack.
    const strong: ItemInstance = { ...plainItem('iron-sword', 510), affixes: [{ key: 'str', value: 10 }] };
    g.state.party.roster.hero.equip.weapon = strong;
    g.run!.loot.gear = [plainItem('iron-sword', 511)];
    const room = capacity(g.state.party) - carried(g.state, g.run);
    const moss = room / weightOf('moss');
    expect(Number.isInteger(moss) && moss > 0).toBe(true);
    g.run!.loot.items['moss'] = moss;
    expect(carried(g.state, g.run)).toBe(capacity(g.state.party));
    // Without the strength the limit drops, so the same load would be over it.
    const weaker = structuredClone(g.state.party);
    weaker.roster.hero.equip.weapon = plainItem('iron-sword', 511);
    expect(capacity(weaker)).toBeLessThan(capacity(g.state.party));
    const state = structuredClone(g.state);
    const pack = g.run!.loot.gear;
    expect(g.equipFromPack('hero', 511)).toEqual({ ok: false, reason: 'heavy' });
    expect(g.state).toEqual(state);
    expect(g.run!.loot.gear).toBe(pack);
    expect(g.run!.loot.gear.map((it) => it.uid)).toEqual([511]);
  });

  it('a junk-marked piece worn from the pack loses the mark: taken off in town, it lands in the bag unmarked', () => {
    const g = inMap(1);
    g.run!.loot.gear = [{ ...plainItem('iron-sword', 520), junk: true }];
    expect(g.equipFromPack('hero', 520)).toEqual({ ok: true });
    expect(g.state.party.roster.hero.equip.weapon?.junk).toBeFalsy();
    stepOnto(g, g.map().entrance);
    expect(g.returnToTown()).toBe(true);
    const r = unequip(g.state, 'hero', 'weapon');
    if (!r.ok) throw new Error(r.reason);
    const back = r.state.bag.find((it) => it.uid === 520);
    expect(back).toBeDefined();
    expect(back!.junk).toBeFalsy();
  });

  it('field gear changes draw nothing', () => {
    let draws = 0;
    const base = calm();
    const spy = () => { draws++; return base(); };
    const storage = memoryStorage();
    const g = inMap(1, spy, storage);
    g.state.party.roster.hero.equip.weapon = plainItem('iron-sword', 601);
    g.run!.loot.gear = [plainItem('iron-sword', 602)];
    const saved = new Map(storage.map);
    const loot = g.run!.lootDraws, memory = g.run!.memoryDraws;
    draws = 0;
    expect(g.equipFromPack('hero', 602)).toEqual({ ok: true });
    expect(g.unequipToPack('hero', 'weapon')).toEqual({ ok: true });
    expect(g.run!.loot.gear.map((it) => it.uid).sort()).toEqual([601, 602]);
    expect(wornUids(g)).toEqual([]);
    expect(draws).toBe(0);
    expect([g.run!.lootDraws, g.run!.memoryDraws]).toEqual([loot, memory]);
    expect(storage.map).toEqual(saved);
  });

  it('a special worn from the pack enters the codex', () => {
    const g = inMap(1, mulberry32(1));
    const crown: ItemInstance = { ...plainItem('leather-cap', 77), rarity: 'legendary', special: 'lg-selene' };
    g.state.codex = [];
    g.run!.loot.gear = [crown];
    expect(g.equipFromPack('selene', 77)).toEqual({ ok: true });
    expect(g.state.codex).toEqual(['lg-selene']);
    expect(g.run!.loot.gear).toEqual([]);
    loseAFight(g);
    expect(g.state.party.roster.selene.equip.head?.uid).toBe(77);
    expect(g.state.codex).toEqual(['lg-selene']);
    // Off and on again in the next run: still one entry.
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.unequipToPack('selene', 'head')).toEqual({ ok: true });
    expect(g.equipFromPack('selene', 77)).toEqual({ ok: true });
    expect(g.state.codex).toEqual(['lg-selene']);
  });

  it('a piece worn from the pack survives a wipe; the piece it replaced is lost with the pack', () => {
    const g = inMap(1, mulberry32(1));
    g.state.bag = [gearItem(800)];
    g.state.party.roster.hero.equip.weapon = gearItem(600);
    g.run!.loot.gear = [gearItem(601)];
    expect(g.equipFromPack('hero', 601)).toEqual({ ok: true });
    expect(g.run!.loot.gear.map((it) => it.uid)).toEqual([600]);
    loseAFight(g);
    expect(g.state.party.roster.hero.equip.weapon?.uid).toBe(601);
    expect(g.state.bag.map((it) => it.uid)).toEqual([800]);
    const everywhere = [...g.state.bag, ...Object.values(g.state.party.roster).flatMap((m) => Object.values(m.equip))].map((it) => it!.uid);
    expect(everywhere).not.toContain(600);
  });

  it('in the labyrinth the formation can move people but not change who is out', () => {
    const g = inMap(1);
    g.state.party = meet(g.state.party, 'bobby', 1);
    expect(activeIds(g.state.party)).not.toContain('bobby');
    const grid = [...g.state.party.grid];
    // Two people trade cells: fine.
    const a = grid.indexOf('hero'), b = grid.indexOf('selene');
    const swapped = [...grid];
    swapped[a] = 'selene'; swapped[b] = 'hero';
    expect(g.setFormation(swapped)).toEqual({ ok: true });
    expect(g.state.party.grid).toEqual(swapped);
    // The bench stays in town.
    const benchIn = swapped.map((c) => (c === 'liz' ? 'bobby' : c));
    expect(g.setFormation(benchIn)).toEqual({ ok: false, reason: 'lineup' });
    // Nobody leaves the field either.
    const out = swapped.map((c) => (c === 'liz' ? null : c));
    expect(g.setFormation(out)).toEqual({ ok: false, reason: 'lineup' });
    expect(g.state.party.grid).toEqual(swapped);
    // The same people with one of them twice still goes through the party rules.
    const twice = [...swapped];
    twice[twice.indexOf(null)] = 'liz';
    expect(new Set(twice.filter((c) => c !== null))).toEqual(new Set(activeIds(g.state.party)));
    expect(g.setFormation(twice)).toEqual({ ok: false, reason: 'duplicate' });
    expect(g.state.party.grid).toEqual(swapped);

    // In town the bench may come in as before.
    const town = new Game(calm(), memoryStorage(), undefined, 0, HERO_LINEUP);
    town.state.party = meet(town.state.party, 'bobby', 1);
    const inTown = town.state.party.grid.map((c) => (c === 'liz' ? 'bobby' : c));
    expect(town.setFormation(inTown)).toEqual({ ok: true });
    expect(activeIds(town.state.party)).toContain('bobby');
  });
});

describe('rune drops (plan 8f Task 2)', () => {
  const ironBoss = (rng = calm()) => {
    const g = new Game(rng, null, undefined, 0, LEGACY_LINEUP);
    g.state.dungeon.reached.iron = 5;
    return g;
  };
  /** Into iron depth 5 and onto its boss; returns the fight's end. */
  const beatBoss = (g: Game): BattleEnd => {
    expect(g.depart({ region: 'iron', condition: 'plain' }, 5)).toEqual({ ok: true });
    expect(stepOnto(g, g.map().boss!)).toEqual({ kind: 'boss' });
    return killAll(g);
  };
  const lampHome = (g: Game) => { g.state.inventory['return-lamp'] = 1; expect(g.useReturnLamp()).toBe(true); };
  /** Runs `body` with RUNE_DROP overwritten by `over`, then puts it back. */
  const withDrops = <T,>(over: Partial<typeof RUNE_DROP>, body: () => T): T => {
    const saved = { ...RUNE_DROP };
    Object.assign(RUNE_DROP, over);
    try { return body(); } finally { Object.assign(RUNE_DROP, saved); }
  };
  /** The next ordinary fight: a move that starts one, from a full encounter meter. */
  const nextFight = (g: Game): boolean => {
    g.encounter = 99;
    for (const dir of DIRS) {
      const r = g.move(dir);
      if (r.kind === 'battle') return true;
      if (r.kind !== 'blocked') return false;
    }
    return false;
  };
  const MAGIC_SPREAD: RuneRef = { id: 'spread', tier: 'magic' };
  const keyOf = (r: RuneRef) => `${r.id}@${r.tier}`;

  it('no rune drops before the first boss, and none of their draws', () => {
    withDrops({ monster: 1, elite: 1, chest: 1 }, () => {
      const g = inMap(1, mulberry32(3));
      expect(nextFight(g)).toBe(true);
      const end = killAll(g);
      expect(end.outcome).toBe('win');
      expect(end).not.toHaveProperty('runes');
      expect(end).not.toHaveProperty('runeGold');
      stepOnto(g, plantAt(g, 'elite'));
      expect(killAll(g)).not.toHaveProperty('runes');
      const chest = stepOnto(g, plainChest(g));
      expect(chest.kind).toBe('chest');
      expect(chest).not.toHaveProperty('rune');
      expect(g.run!.runeDraws).toBe(0);
      expect(g.state.runes).toBeUndefined();
      expect(g.state.runesOpen).toBeUndefined();
    });
  });

  it('the first boss gives a magic spread and opens runes', () => {
    const g = ironBoss();
    const gold = g.state.gold;
    const end = beatBoss(g);
    expect(end.runes).toEqual([MAGIC_SPREAD]);
    expect(end).not.toHaveProperty('runeGold');
    expect(g.state.runes).toEqual({ 'spread@magic': 1 });
    expect(g.state.runesOpen).toBe(true);
    expect(g.run!.runeDraws).toBe(0);
    expect(g.state.gold).toBe(gold);
  });

  it('an old save past its first boss opens runes on its next boss', () => {
    const g = ironBoss();
    g.state.dungeon.bossKills = { 'iron:5': 3, 'mainline:3': 1 };
    const first = beatBoss(g);
    expect(first.runes).toEqual([MAGIC_SPREAD]);
    expect([g.state.runesOpen, g.run!.runeDraws]).toEqual([true, 0]);
    lampHome(g);
    const next = beatBoss(g);
    expect(next.runes).toHaveLength(1);
    expect(g.run!.runeDraws).toBe(1);
    // The boss's own roll: one rollRune on the boss row from this run's first rune draw, no drop draw before it.
    const want = rollRune(mulberry32(mix(g.run!.seed ^ RUNE_SALT, 0)), 'boss', depthLevel(5), 'plain');
    expect(next.runes).toEqual([want]);
  });

  it('rune drops leave every other drop as it was', () => {
    withDrops({ monster: 1, elite: 1, chest: 1 }, () => {
      const play = (open: boolean) => {
        const g = new Game(mulberry32(41), null, undefined, 0, LEGACY_LINEUP);
        if (open) g.state.runesOpen = true;
        expect(g.depart(MAIN, 1)).toEqual({ ok: true });
        const ends: BattleEnd[] = [];
        for (let i = 0; i < 4; i++) if (nextFight(g)) ends.push(killAll(g));
        stepOnto(g, plantAt(g, 'elite'));
        ends.push(killAll(g));
        const chest = stepOnto(g, chestWhere(g, true));
        const run = g.run!;
        return { g, ends, chest, run, next: g.rng() };
      };
      const shut = play(false);
      const open = play(true);
      expect(shut.ends.length).toBeGreaterThanOrEqual(3);
      expect(open.ends.length).toBe(shut.ends.length);
      const strip = (e: BattleEnd) => { const { runes: _r, runeGold: _g, ...rest } = e; return rest; };
      open.ends.forEach((e, i) => {
        const was = shut.ends[i];
        expect([e.exp, e.gold, e.coinGold, e.drops, e.left, e.gear, e.gearLeft, e.fragments]).toEqual([was.exp, was.gold, was.coinGold, was.drops, was.left, was.gear, was.gearLeft, was.fragments]);
        expect(strip(e)).toEqual(was);
      });
      expect(open.ends.every((e) => (e.runes?.length ?? 0) > 0)).toBe(true);
      expect(shut.ends.some((e) => e.runes)).toBe(false);
      const { rune: _r, runeGold: _g, ...chestRest } = open.chest as Extract<MoveResult, { kind: 'chest' }>;
      expect(chestRest).toEqual(shut.chest);
      expect((open.chest as Extract<MoveResult, { kind: 'chest' }>).rune).toBeDefined();
      expect([open.run.loot, open.run.lootDraws, open.run.memoryDraws, open.next]).toEqual([shut.run.loot, shut.run.lootDraws, shut.run.memoryDraws, shut.next]);
      expect([open.g.state.gold, open.g.state.inventory, open.g.state.party]).toEqual([shut.g.state.gold, shut.g.state.inventory, shut.g.state.party]);
      expect(open.run.runeDraws).toBe(open.ends.length);
    });
  });

  it('ordinary fights roll each foe once, elites at their own rate', () => {
    withDrops({ monster: 1, elite: 1 }, () => {
      const g = inMap(1, mulberry32(5));
      g.state.runesOpen = true;
      expect(nextFight(g)).toBe(true);
      const foes = g.battle!.enemies.length;
      expect(foes).toBeGreaterThan(1);
      expect(killAll(g).runes).toHaveLength(foes);
      // The elite fight: one stream; each foe in order a drop draw and then its roll, the first on the elite row.
      stepOnto(g, plantAt(g, 'elite'));
      const n = g.battle!.enemies.length;
      expect(n).toBeGreaterThan(1);
      const rng = mulberry32(mix(g.run!.seed ^ RUNE_SALT, g.run!.runeDraws));
      const want = Array.from({ length: n }, (_, i) => { rng(); return rollRune(rng, i === 0 ? 'elite' : 'monster', depthLevel(1), 'plain'); });
      expect(killAll(g).runes).toEqual(want);
      expect(g.run!.runeDraws).toBe(2);
    });
    // The elite's own rune never rolls common (the elite row has none).
    withDrops({ elite: 1, monster: 0 }, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const g = inMap(1, mulberry32(seed));
        g.state.runesOpen = true;
        stepOnto(g, plantAt(g, 'elite'));
        const runes = killAll(g).runes!;
        expect(runes).toHaveLength(1);
        expect(runes[0].tier).not.toBe('common');
      }
    });
  });

  it("a chest's rune is fixed by its spot and paid once", () => {
    withDrops({ chest: 1 }, () => {
      const g = inMap(1);
      g.state.runesOpen = true;
      const at = plainChest(g);
      const room = () => capacity(g.state.party) - carried(g.state, g.run!);
      g.run!.loot.items['star-stone'] = Math.floor(room() * 2);   // full to within half a unit
      expect(stepOnto(g, at).kind).toBe('full');
      expect(g.state.runes).toBeUndefined();
      delete g.run!.loot.items['star-stone'];
      const rng = spotRuneRng(g.run!, 1, at);
      rng();
      const want = rollRune(rng, 'chest', depthLevel(1), 'plain');
      const opened = stepOnto(g, at) as Extract<MoveResult, { kind: 'chest' }>;
      expect(opened.kind).toBe('chest');
      expect(opened.rune).toEqual(want);
      expect(g.state.runes).toEqual({ [keyOf(want)]: 1 });
      expect(stepOnto(g, at)).toEqual({ kind: 'moved' });
      expect(g.state.runes).toEqual({ [keyOf(want)]: 1 });
      expect(g.run!.runeDraws).toBe(0);
    });
  });

  it('a boss rune past 99 pays gold', () => {
    const open = () => { const g = ironBoss(); g.state.runesOpen = true; return g; };
    const free = open();
    const plain = beatBoss(free);
    const r = plain.runes![0];
    const g = open();
    g.state.runes = { [keyOf(r)]: 99 };
    const gold = g.state.gold;
    const end = beatBoss(g);
    expect(end).not.toHaveProperty('runes');
    expect(end.runeGold).toEqual([{ rune: r, gold: RUNE_SELL[r.tier], at: 0 }]);
    expect(g.state.gold).toBe(gold + RUNE_SELL[r.tier]);
    expect([end.gold, g.run!.loot.gold]).toEqual([plain.gold, free.run!.loot.gold]);
    expect(g.state.runes).toEqual({ [keyOf(r)]: 99 });
    // A wipe takes its quarter of all the gold, this too, and no more.
    const held = g.state.gold;
    expect(nextFight(g)).toBe(true);
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    g.submitRound({});
    expect([g.phase, g.state.gold]).toEqual(['town', Math.floor(held * 0.75)]);
  });

  it("a vault's rune comes from its own spot", () => {
    withDrops({ vault: 1 }, () => {
      const g = inMap(1);
      g.state.runesOpen = true;
      const at = plantAt(g, 'vault');
      g.run!.keys.add(1);
      // openVault only works where the party stands (contentAt), so the spot is `at`; the roll is keyed by it.
      expect(stepOnto(g, at).kind).toBe('event');
      const rng = spotRuneRng(g.run!, 1, at);
      rng();
      const want = rollRune(rng, 'vault', depthLevel(1), 'plain');
      expect(want.tier).not.toBe('common');
      const r = g.openVault(at) as Extract<MoveResult, { kind: 'vault' }>;
      expect(r.kind).toBe('vault');
      expect(r.rune).toEqual(want);
      expect(g.state.runes).toEqual({ [keyOf(want)]: 1 });
      expect(g.openVault(at)).toBeNull();
      expect(g.state.runes).toEqual({ [keyOf(want)]: 1 });
    });
  });

  it('a wipe keeps the runes found', () => {
    const g = ironBoss();
    beatBoss(g);
    expect(g.state.runes).toEqual({ 'spread@magic': 1 });
    expect(nextFight(g)).toBe(true);
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    g.submitRound({});
    expect(g.phase).toBe('town');
    expect(g.state.runes).toEqual({ 'spread@magic': 1 });
    expect(g.state.runesOpen).toBe(true);
  });
});

describe('rune drops at bosses (plan 8f Task 3 review of Task 2)', () => {
  it('a boss fight drops the same gear and memory pieces, runes open or not', () => {
    const play = (open: boolean) => {
      const g = new Game(mulberry32(17), null, undefined, 0, HERO_LINEUP);
      g.state.dungeon.reached.iron = 5;
      if (open) g.state.runesOpen = true;
      expect(g.depart({ region: 'iron', condition: 'plain' }, 5)).toEqual({ ok: true });
      expect(stepOnto(g, g.map().boss!)).toEqual({ kind: 'boss' });
      const end = killAll(g);
      const run = g.run!;
      return { g, end, run, next: g.rng() };
    };
    const shut = play(false);
    const open = play(true);
    expect(shut.end.runes).toEqual([{ id: 'spread', tier: 'magic' }]);   // this one opens runes
    expect(open.end.runes).toHaveLength(1);
    expect([shut.run.runeDraws, open.run.runeDraws]).toEqual([0, 1]);
    const { runes: _a, ...was } = shut.end;
    const { runes: _b, ...now } = open.end;
    expect(now).toEqual(was);
    expect(open.end.gear).toHaveLength(2);
    expect([open.end.gear, open.end.fragments]).toEqual([shut.end.gear, shut.end.fragments]);
    expect([open.run.loot, open.run.lootDraws, open.run.memoryDraws, open.next]).toEqual([shut.run.loot, shut.run.lootDraws, shut.run.memoryDraws, shut.next]);
    expect([open.g.state.story, open.g.state.dungeon.bossKills, open.g.state.gold]).toEqual([shut.g.state.story, shut.g.state.dungeon.bossKills, shut.g.state.gold]);
  });

  it('the story boss opens runes too, as the game turns to its clear card', () => {
    const g = inMap(3);
    expect(g.state.runesOpen).toBeUndefined();
    expect(stepOnto(g, g.map().boss!)).toEqual({ kind: 'boss' });
    const end = killAll(g);
    expect([g.phase, g.cleared]).toEqual(['clear', 'act1']);
    expect(end.runes).toEqual([{ id: 'spread', tier: 'magic' }]);
    expect(g.state.runesOpen).toBe(true);
    expect(g.state.runes).toEqual({ 'spread@magic': 1 });
    expect(g.run!.runeDraws).toBe(0);
  });
});

describe('trading runes in the game (plan 8f Task 4)', () => {
  it('runes are traded in town only', () => {
    const spread = { id: 'spread', tier: 'common' } as const;
    const bounce = { id: 'bounce', tier: 'rare' } as const;
    const stock = (g: Game) => { g.state.runesOpen = true; g.state.gold = 500; g.state.runes = { 'bounce@rare': 1 }; return g; };
    const fieldStorage = memoryStorage();
    const field = stock(inMap(1, calm(), fieldStorage));
    const saved = fieldStorage.map.get(SAVE_KEY);
    expect(field.buyRune(spread, 1)).toEqual({ ok: false, reason: 'phase' });
    expect(field.sellRune(bounce, 1)).toEqual({ ok: false, reason: 'phase' });
    field.encounter = 99;
    field.phase = 'battle';
    expect(field.buyRune(spread, 1)).toEqual({ ok: false, reason: 'phase' });
    expect(field.sellRune(bounce, 1)).toEqual({ ok: false, reason: 'phase' });
    expect([field.state.gold, field.state.runes, fieldStorage.map.get(SAVE_KEY)]).toEqual([500, { 'bounce@rare': 1 }, saved]);
    // In town: done and saved at once.
    const storage = memoryStorage();
    const g = stock(new Game(calm(), storage, undefined, 0, HERO_LINEUP));
    expect(g.buyRune(spread, 2)).toEqual({ ok: true });
    expect([g.state.gold, g.state.runes]).toEqual([300, { 'bounce@rare': 1, 'spread@common': 2 }]);
    expect(Game.boot(calm(), storage).state.runes).toEqual({ 'bounce@rare': 1, 'spread@common': 2 });
    expect(g.sellRune(bounce, 1)).toEqual({ ok: true });
    const back = Game.boot(calm(), storage).state;
    expect([back.gold, back.runes]).toEqual([450, { 'spread@common': 2 }]);
    expect(g.notice).toBeNull();
    expect(g.buyRune(spread, 5)).toEqual({ ok: false, reason: 'gold' });
    expect(g.sellRune(bounce, 1)).toEqual({ ok: false, reason: 'stock' });
    // A failed save says so and keeps the trade.
    const full = stock(new Game(calm(), { getItem: () => null, setItem: () => { throw new Error('full'); } }, undefined, 0, HERO_LINEUP));
    expect(full.buyRune(spread, 1)).toEqual({ ok: true });
    expect([full.notice, full.state.gold]).toEqual(['save-failed', 400]);
  });
});

describe("the order of a fight's runes (plan 8f Task 4, review of Task 3)", () => {
  it('a fight lists its runes in drop order, the ones paid as gold too', () => {
    const saved = RUNE_DROP.monster;
    RUNE_DROP.monster = 1;
    try {
      const g = inMap(1, mulberry32(5));
      g.state.runesOpen = true;
      g.encounter = 99;
      expect(DIRS.map((d) => g.phase === 'map' && g.move(d).kind).includes('battle')).toBe(true);
      const n = g.battle!.enemies.length;
      expect(n).toBeGreaterThan(1);
      const rng = mulberry32(mix(g.run!.seed ^ RUNE_SALT, g.run!.runeDraws));
      const want = Array.from({ length: n }, () => { rng(); return rollRune(rng, 'monster', depthLevel(1), 'plain'); });
      const key = (r: RuneRef) => `${r.id}@${r.tier}`;
      const fullKey = key(want[1]);
      g.state.runes = { [fullKey]: 99 };
      const end = killAll(g);
      const paid = want.map((r, at) => ({ rune: r, gold: RUNE_SELL[r.tier], at })).filter((x) => key(x.rune) === fullKey);
      const found = want.filter((r) => key(r) !== fullKey);
      expect(paid.map((x) => x.at)).toContain(1);
      expect(end.runeGold).toEqual(paid);
      expect(end.runes ?? []).toEqual(found);
    } finally {
      RUNE_DROP.monster = saved;
    }
  });
});

describe('fusing runes in the game (plan 8f Task 5)', () => {
  it('runes are fused in town only', () => {
    const spread = { id: 'spread', tier: 'common' } as const;
    const stock = (g: Game) => { g.state.gold = 100; g.state.runes = { 'spread@common': 3 }; g.state.inventory['essence-common'] = 1; return g; };
    const fieldStorage = memoryStorage();
    const field = stock(inMap(1, calm(), fieldStorage));
    const saved = fieldStorage.map.get(SAVE_KEY);
    expect(field.fuseRune(spread)).toEqual({ ok: false, reason: 'phase' });
    field.phase = 'battle';
    expect(field.fuseRune(spread)).toEqual({ ok: false, reason: 'phase' });
    expect([field.state.runes, field.state.gold, fieldStorage.map.get(SAVE_KEY)]).toEqual([{ 'spread@common': 3 }, 100, saved]);
    const storage = memoryStorage();
    const g = stock(new Game(calm(), storage, undefined, 0, HERO_LINEUP));
    const r = g.fuseRune(spread);
    expect(r.ok && r.out).toEqual({ id: 'spread', tier: 'magic' });
    expect([g.state.runes, g.state.gold, g.state.inventory['essence-common']]).toEqual([{ 'spread@magic': 1 }, 70, undefined]);
    expect(g.notice).toBe('saved');
    const back = Game.boot(calm(), storage).state;
    expect([back.runes, back.gold]).toEqual([{ 'spread@magic': 1 }, 70]);
    expect(g.fuseRune(spread)).toEqual({ ok: false, reason: 'stock' });
    expect(g.fuseRune({ id: 'spread', tier: 'epic' })).toEqual({ ok: false, reason: 'top' });
  });
});

describe('following between fights (plan 8h final review)', () => {
  it('a memory gained between wins sends the runes of a skill her build drops back to the bag (I1)', () => {
    const g = inMap(1);
    const mage = buildOf('hero', 'mage')!;
    const h = g.state.party.roster.hero;
    g.state.party.roster.hero = { ...h, level: 31, exp: 0, memories: 7, tree: buildTree('hero', 31, mage, 7), talents: buildTalents('hero', 31, mage), build: 'mage',
      sockets: { 'abyss-sword': [{ id: 'thrift', tier: 'magic' }] } };
    g.state.runes = {};
    stepOnto(g, plantAt(g, 'elite'));
    expect(killAll(g).outcome).toBe('win');
    expect(g.state.party.roster.hero.sockets?.['abyss-sword']).toEqual([{ id: 'thrift', tier: 'magic' }]);   // a win: nothing moves
    g.state.party.roster.hero.memories = 8;   // a memory between wins
    stepOnto(g, plantAt(g, 'elite'));
    expect(killAll(g).outcome).toBe('win');
    const hero = g.state.party.roster.hero;
    expect(learnedSkills(hero)).not.toContain('abyss-sword');
    expect(hero.sockets?.['abyss-sword'] ?? []).toEqual([]);
    expect(g.state.runes).toEqual({ 'thrift@magic': 1 });
  });

  it('a rune she took off by hand stays off after a win (I3)', () => {
    const g = inMap(1);
    const meteor = buildOf('noel', 'meteor')!;
    const m = g.state.party.roster.noel;
    g.state.party.roster.noel = { ...m, level: 35, exp: 0, tree: buildTree('noel', 35, meteor), talents: buildTalents('noel', 35, meteor), build: 'meteor',
      sockets: { 'fire-star': [null, { id: 'ignite', tier: 'magic' }] } };
    g.state.runes = { 'spread@magic': 1 };
    stepOnto(g, plantAt(g, 'elite'));
    expect(killAll(g).outcome).toBe('win');
    expect(g.state.party.roster.noel.sockets?.['fire-star']).toEqual([null, { id: 'ignite', tier: 'magic' }]);
    expect(g.state.runes).toEqual({ 'spread@magic': 1 });
  });
});

describe('story L: pieces wait to be told (Task 2a)', () => {
  const duo: CharacterId[] = ['hero', 'rin'];
  const run = (depth: number, tweak: (g: Game) => void = () => {}, storage = memoryStorage()) => {
    const g = new Game(calm(), storage, undefined, 0, duo);
    g.state.dungeon.reached.mainline = Math.max(3, depth);
    tweak(g);
    expect(g.depart(MAIN, depth)).toEqual({ ok: true });
    return g;
  };
  /** A glimmer for `owner` on an open cell, as the floor would have made it. */
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
  const pieceIds = (gained: readonly FragmentGain[] | undefined) => (gained ?? []).flatMap((f) => (f.kind === 'piece' ? [memScene(f.id, f.n)] : []));
  const mems = (ids: readonly SceneId[]) => ids.filter((id) => id.startsWith('mem:'));

  it('every piece taken goes to untold in pickup order, and none is pending', () => {
    const g = run(5);
    const r = stepOnto(g, plantGlimmer(g, 'rin'));
    expect(r).toEqual({ kind: 'glimmer', gained: [expect.objectContaining({ kind: 'piece', id: 'rin', n: 1 })] });
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    const boss = pieceIds(end.fragments);
    expect(boss.length).toBeGreaterThan(0);
    expect(g.state.story.untold).toEqual(['mem:rin:1', ...boss]);
    expect(g.pending).toEqual([]);
    for (const list of [g.state.story.seen, g.state.story.queue, g.state.story.fresh]) expect(mems(list)).toEqual([]);
  });

  it('a piece still counts at once: memoriesOf and the memory stats rise at pickup', () => {
    const g = run(1);
    const before = { n: memoriesOf(g.state.party.roster.rin), stats: memoryStats(g.state.party.roster.rin) };
    stepOnto(g, plantGlimmer(g, 'rin'));
    expect(memoriesOf(g.state.party.roster.rin)).toBe(before.n + 1);
    expect(memoryStats(g.state.party.roster.rin)).not.toEqual(before.stats);
    expect(g.state.story.untold).toEqual(['mem:rin:1']);
  });

  it('the depth-25 top-up waits in untold, in piece order', () => {
    const g = run(25, (x) => { x.state.party.roster.hero.memories = 5; });
    stepOnto(g, g.map().boss!);
    const end = killAll(g);
    expect(pieceIds(end.fragments).filter((id) => id.startsWith('mem:hero:'))).toEqual(['mem:hero:6', 'mem:hero:7', 'mem:hero:8', 'mem:hero:9']);
    expect(mems(g.state.story.untold ?? []).filter((id) => id.startsWith('mem:hero:'))).toEqual(['mem:hero:6', 'mem:hero:7', 'mem:hero:8', 'mem:hero:9']);
    expect(mems(g.state.story.queue)).toEqual([]);
    expect(mems(g.state.story.seen)).toEqual([]);
  });

  it("the finale fight's hero pieces are the finale's; anyone else's waits in untold", () => {
    const g = run(FINALE_DEPTH, (x) => {
      x.state.party.roster.hero.memories = 8;
      Object.assign(x.state.party.roster.rin, { memories: chainLength('rin'), oath: true });
      for (const node of ['act2', 'act3', 'act4'] as const) { x.state.story.nodes.push(node); x.state.story.seen.push(node); }
    });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.finale!.pieces).toEqual(['finale-eve', 'mem:hero:9', 'mem:hero:10']);
    expect(g.state.story.untold ?? []).toEqual([]);
    // the hero full: the boss pays Selene's next piece, and it waits to be told
    const h = run(FINALE_DEPTH, (x) => {
      x.state.party.roster.hero.memories = chainLength('hero');
      Object.assign(x.state.party.roster.rin, { memories: chainLength('rin'), oath: true });
      for (const node of ['act2', 'act3', 'act4'] as const) { x.state.story.nodes.push(node); x.state.story.seen.push(node); }
      x.state.party = meet(x.state.party, 'selene', 30);
    });
    stepOnto(h, h.map().boss!);
    const end = killAll(h);
    const paid = pieceIds(end.fragments);
    expect(paid.length).toBeGreaterThan(0);
    expect(paid.every((id) => !id.startsWith('mem:hero:'))).toBe(true);
    expect(h.state.story.untold).toEqual(paid);
    // story L Task 3d: the eve the finale falls back to tells it, still untold until it is told
    expect(h.eve.length).toBeGreaterThan(0);
    expect(h.eve.every((id) => paid.includes(id))).toBe(true);
    expect(h.finale!.pieces.filter((id) => id.startsWith('mem:'))).toEqual(h.eve);
  });

  it('tellEarly tells an untold piece: seen, not new, out of untold and tonight; anything else is refused', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, duo);
    g.state.party.roster.rin.memories = 2;
    g.state.story.untold = ['mem:rin:1', 'mem:rin:2'];
    g.state.story.tonight = ['mem:rin:1'];
    const before = JSON.stringify(g.state);
    expect(g.tellEarly('mem:rin:3')).toBe(false);
    expect(g.tellEarly('act2')).toBe(false);
    expect(JSON.stringify(g.state)).toBe(before);
    expect(g.tellEarly('mem:rin:1')).toBe(true);
    expect(g.state.story.seen).toContain('mem:rin:1');
    expect(g.state.story.fresh).not.toContain('mem:rin:1');
    expect(g.state.story.untold).toEqual(['mem:rin:2']);
    expect(g.state.story.tonight).toEqual([]);
    expect(g.tellEarly('mem:rin:1')).toBe(false);   // told already
    const saved = loadGame(storage);   // in town: saved at once
    expect(saved.status === 'ok' && saved.state.story.untold).toEqual(['mem:rin:2']);
    // in the labyrinth it waits for the next save in town
    const road = memoryStorage();
    const h = run(1, (x) => { x.state.party.roster.rin.memories = 1; x.state.story.untold = ['mem:rin:1']; }, road);
    expect(h.tellEarly('mem:rin:1')).toBe(true);
    expect(loadGame(road).status).toBe('empty');
  });
});

// story L Task 8: the pool is written now; a test that sets its own (or none) gets the written one back after it
const WRITTEN_BEATS = [...NIGHT_BEATS.lines];
describe('story L: the night in the game (Task 3b)', () => {
  afterEach(() => { NIGHT_BEATS.lines.splice(0, NIGHT_BEATS.lines.length, ...WRITTEN_BEATS); });
  const duo: CharacterId[] = ['hero', 'rin'];
  /** A game in town, the opening behind it, whose untold memories are `list` (each owner met, the earlier pieces told). */
  const withUntold = (list: SceneId[], storage = memoryStorage(), tweak: (g: Game) => void = () => {}) => {
    const g = new Game(calm(), storage, undefined, 0, duo);
    g.state.story.queue = [];
    g.state.story.seen = ['prologue', 'prologue-inn'];
    for (const id of list) {
      const [, c, k] = id.split(':') as [string, CharacterId, string];
      if (!g.state.party.recruited.includes(c)) g.state.party = meet(g.state.party, c, 1);
      const m = g.state.party.roster[c];
      m.memories = Math.max(m.memories ?? 0, Number(k));
      for (let n = 1; n < Number(k); n++) if (!list.includes(memScene(c, n)) && !g.state.story.seen.includes(memScene(c, n))) g.state.story.seen.push(memScene(c, n));
    }
    g.state.story.untold = [...list];
    tweak(g);
    return g;
  };
  /** Out through the mainline at depth 1 and straight back in by the entrance. */
  const trip = (g: Game) => {
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.returnToTown()).toBe(true);
  };
  const five: SceneId[] = ['mem:hero:3', 'mem:selene:1', 'mem:noel:1', 'mem:safira:1', 'mem:bobby:1'];

  it('a return plans the night and saves it in tonight', () => {
    const g = withUntold(five);
    trip(g);
    // backlog 5, cap 2: Lorne first
    expect(g.night).toHaveLength(2);
    expect(g.night[0]).toBe('mem:hero:3');
    expect(g.state.story.tonight).toEqual(g.night);
    expect(g.arrival.filter((id) => id.startsWith('mem:'))).toEqual([]);
    expect(g.night).toEqual(planNight(g.state, g.arrival).night);
    // told at night, a memory is done: seen, out of untold and tonight
    expect(g.sceneDone(g.night[0], 'played')).toBe(true);
    expect(g.state.story.seen).toContain('mem:hero:3');
    expect(g.state.story.untold).not.toContain('mem:hero:3');
    expect(g.state.story.tonight).not.toContain('mem:hero:3');
    expect(g.night).not.toContain('mem:hero:3');
    expect(g.sceneDone('mem:noel:2', 'played')).toBe(false);   // nothing anyone holds
  });

  it('a reload mid-night plays the rest of tonight, no more', () => {
    const storage = memoryStorage();
    const g = withUntold(five, storage);
    trip(g);
    const night = [...g.night];
    expect(night).toHaveLength(2);
    g.sceneDone(night[0], 'played');   // town saves at once
    const b = Game.boot(calm(), storage);
    expect(b.night).toEqual(night.slice(1));
    expect(b.arrival.filter((id) => id.startsWith('mem:'))).toEqual([]);
    expect(b.sceneDone(night[1], 'played')).toBe(true);
    expect(b.night).toEqual([]);
    expect(Game.boot(calm(), storage).night).toEqual([]);
  });

  it('a new return replaces tonight; what was not played stays untold', () => {
    const g = withUntold(five);
    trip(g);
    const [first, second] = g.night;
    g.sceneDone(first, 'played');
    trip(g);
    expect(g.state.story.untold).toContain(second);
    expect(g.state.story.untold).not.toContain(first);
    expect(g.state.story.tonight).toEqual(g.night);
    expect(g.night).not.toContain(first);
  });

  it('a lamp return and a wipe have a night too', () => {
    const lamp = withUntold(five);
    lamp.state.inventory['return-lamp'] = 1;
    expect(lamp.depart(MAIN, 1)).toEqual({ ok: true });
    expect(lamp.useReturnLamp()).toBe(true);
    expect(lamp.night).toHaveLength(2);
    expect(lamp.state.story.tonight).toEqual(lamp.night);
    const wiped = withUntold(five);
    expect(wiped.depart(MAIN, 1)).toEqual({ ok: true });
    expect(stepOnto(wiped, plantAt(wiped, 'elite')).kind).toBe('battle');
    for (const c of wiped.battle!.party) { c.hp = 0; c.alive = false; }
    expect(wiped.submitRound({})!.end!.outcome).toBe('lose');
    expect(wiped.phase).toBe('town');
    expect(wiped.night).toHaveLength(2);
    expect(wiped.state.story.tonight).toEqual(wiped.night);
  });

  it('owed pieces lead the arrival, ahead of the act', () => {
    const g = withUntold(['mem:selene:1', 'mem:hero:3', 'mem:rin:2', 'mem:noel:1']);
    g.state.dungeon.reached.mainline = ACT_DEPTHS.act2;
    trip(g);
    expect(g.arrival.slice(0, 3)).toEqual(['mem:hero:3', 'mem:rin:2', 'act2']);
    expect(g.night).toEqual(['group:act2', 'mem:selene:1']);   // backlog 2, cap 1; act 2's group scene first (story L Task 9)
    expect(g.state.story.tonight).toEqual(['mem:hero:3', 'mem:rin:2', 'mem:selene:1']);
    // a reload puts the owed ones back ahead of the act
    const storage = memoryStorage();
    saveGame(storage, g.state);
    const b = Game.boot(calm(), storage);
    expect(b.arrival.slice(0, 3)).toEqual(['mem:hero:3', 'mem:rin:2', 'act2']);
    expect(b.night).toEqual(['group:act2', 'mem:selene:1']);
  });

  it("untold hero pieces join the finale's list in piece order and leave untold", () => {
    const g = new Game(calm(), memoryStorage(), undefined, 0, duo);
    g.state.dungeon.reached.mainline = FINALE_DEPTH;
    g.state.party.roster.hero.memories = 8;
    Object.assign(g.state.party.roster.rin, { memories: chainLength('rin'), oath: true });
    for (const node of ['act2', 'act3', 'act4'] as const) { g.state.story.nodes.push(node); g.state.story.seen.push(node); }
    g.state.story.untold = ['mem:hero:8', 'mem:hero:7'];
    g.state.story.tonight = ['mem:hero:8'];
    expect(g.depart(MAIN, FINALE_DEPTH)).toEqual({ ok: true });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.finale!.pieces.filter((id) => id.startsWith('mem:hero:'))).toEqual(['mem:hero:7', 'mem:hero:8', 'mem:hero:9', 'mem:hero:10']);
    expect(g.state.story.untold).toEqual([]);
    expect(g.state.story.tonight).toEqual([]);
  });

  it('takeBeat moves the cursor and saves it; a reload gives the next line, not the same one', () => {
    const lines: ScriptLine[] = [{ who: 'narrator', text: '一' }, { who: 'narrator', text: '二' }];
    NIGHT_BEATS.lines.splice(0, NIGHT_BEATS.lines.length, ...lines);
    try {
      const storage = memoryStorage();
      const g = withUntold(five, storage);
      expect(g.takeBeat('mem:selene:1', 'mem:noel:1')).toEqual(lines[0]);
      expect(g.state.story.beat).toBe(1);
      const b = Game.boot(calm(), storage);
      expect(b.state.story.beat).toBe(1);
      expect(b.takeBeat('mem:selene:1', 'mem:noel:1')).toEqual(lines[1]);
      expect(b.state.story.beat).toBe(0);   // past the end, back to the start
    } finally {
      NIGHT_BEATS.lines.splice(0);
    }
    // no pool, no beat, and the cursor stays where it was
    const g = withUntold(five);
    expect(g.takeBeat('mem:selene:1', 'mem:noel:1')).toBeNull();
    expect(g.state.story.beat).toBeUndefined();
  });
});

describe('story L: the night before the descent (Task 3d)', () => {
  const duo: CharacterId[] = ['hero', 'rin'];
  /** In town after her choice, the keeper's arrival behind them; `untold` held and untold, the earlier pieces told. */
  const eveGame = (untold: SceneId[], queue: SceneId[] = ['finale-eve'], storage: ReturnType<typeof memoryStorage> | null = null) => {
    const g = new Game(calm(), storage, undefined, 0, duo);
    Object.assign(g.state.party.roster.rin, { memories: chainLength('rin'), oath: true });
    g.state.story.seen = ['prologue', 'prologue-inn', 'rin-reveal', 'rin-confess', 'bellkeeper-arrives'];
    for (let k = 1; k <= chainLength('rin'); k++) g.state.story.seen.push(memScene('rin', k));
    g.state.story.queue = [...queue];
    for (const id of untold) {
      const [, c, k] = id.split(':') as [string, CharacterId, string];
      if (!g.state.party.recruited.includes(c)) g.state.party = meet(g.state.party, c, 1);
      g.state.party.roster[c].memories = Math.max(g.state.party.roster[c].memories ?? 0, Number(k));
    }
    g.state.story.untold = [...untold];
    return g;
  };
  const four: SceneId[] = ['mem:selene:1', 'mem:noel:1', 'mem:safira:1', 'mem:bobby:1', 'mem:sylvie:1', 'mem:liz:1', 'mem:scarlet:1'];

  it("the first departure after it is queued plays the eve, then up to three companions' memories, under the night card", () => {
    const g = eveGame(four);
    g.state.story.tonight = ['mem:selene:1'];
    expect(g.departScenes()).toEqual(['finale-eve']);
    expect(g.eve).toEqual([]);
    expect(g.sceneDone('finale-eve', 'played')).toBe(true);
    expect(g.eve).toHaveLength(3);
    expect(g.eve.every((id) => four.includes(id))).toBe(true);
    expect(g.state.story.untold).toEqual(four);          // still untold until each is told
    expect(g.state.story.tonight).toEqual([]);           // the town's night does not hold them as well
    expect(g.departScenes()).toEqual([]);
    const [first] = g.eve;
    expect(g.sceneDone(first, 'played')).toBe(true);
    expect(g.state.story.seen).toContain(first);
    expect(g.state.story.untold).not.toContain(first);
    expect(g.eve).not.toContain(first);
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.eve).toEqual([]);                           // what the eve did not tell waits for a night or the handbook
    expect(g.state.story.untold).toEqual(four.filter((id) => id !== first));
  });

  it('the eve comes before the lone morning when both are owed', () => {
    const g = eveGame(four, ['hero-alone', 'finale-eve']);
    g.state.party.roster.hero.memories = 9;
    g.state.story.seen.push('mem:hero:9');
    expect(g.departScenes()).toEqual(['finale-eve', 'hero-alone']);
    expect(g.sceneDone('finale-eve', 'played')).toBe(true);
    expect(g.departScenes()).toEqual(['hero-alone']);
    const alone = eveGame(four, ['finale-eve', 'rin-confess']);
    expect(alone.departScenes()).toEqual([]);
    const away = eveGame(four);
    expect(away.depart(MAIN, 1)).toEqual({ ok: true });
    expect(away.departScenes()).toEqual([]);             // only in town
    expect(away.state.story.queue).toContain('finale-eve');
  });

  it("a reload after the eve's line: it does not play again, and its unplayed memories stay untold", () => {
    const storage = memoryStorage();
    const g = eveGame(four, ['finale-eve'], storage);
    expect(g.sceneDone('finale-eve', 'played')).toBe(true);   // town saves at once
    const picks = [...g.eve];
    const b = Game.boot(calm(), storage);
    expect(b.departScenes()).toEqual([]);
    expect(b.state.story.seen).toContain('finale-eve');
    expect(b.eve).toEqual([]);
    expect(b.state.story.untold).toEqual(four);
    expect(b.sceneDone(picks[0], 'played')).toBe(false);
  });

  it('the finale falls back to the eve first, then the acts, the confession and the keeper, then Lorne\'s pieces, then the finale', () => {
    const g = eveGame(['mem:selene:1', 'mem:noel:1', 'mem:hero:8'], ['act4', 'rin-confess']);
    g.state.story.seen = g.state.story.seen.filter((id) => id !== 'rin-confess' && id !== 'bellkeeper-arrives');
    g.state.story.seen.push('act2', 'act3');
    g.state.story.nodes = ['act2', 'act3', 'act4'];
    g.state.dungeon.reached.mainline = FINALE_DEPTH;
    expect(g.depart(MAIN, FINALE_DEPTH)).toEqual({ ok: true });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.finale!.pieces).toEqual(['finale-eve', 'mem:selene:1', 'mem:noel:1', 'act4', 'rin-confess', 'bellkeeper-arrives', 'mem:hero:8', 'mem:hero:9', 'mem:hero:10']);
    expect(g.eve).toEqual(['mem:selene:1', 'mem:noel:1']);
    expect(g.state.story.queue).not.toContain('finale-eve');
    for (const id of [...g.finale!.pieces, 'finale'] as SceneId[]) expect(g.sceneDone(id, 'played'), id).toBe(true);
    expect(g.state.story.seen).toEqual(expect.arrayContaining(['finale-eve', 'mem:selene:1', 'mem:noel:1']));
    // once the eve has played on a departure, the finale does not play it again
    const h = eveGame(['mem:selene:1'], ['rin-confess']);
    h.state.story.seen = h.state.story.seen.filter((id) => id !== 'rin-confess' && id !== 'bellkeeper-arrives');
    h.state.story.seen.push('act2', 'act3', 'act4', 'finale-eve');
    h.state.story.nodes = ['act2', 'act3', 'act4'];
    h.state.party.roster.hero.memories = 9;
    h.state.dungeon.reached.mainline = FINALE_DEPTH;
    expect(h.depart(MAIN, FINALE_DEPTH)).toEqual({ ok: true });
    stepOnto(h, h.map().boss!);
    killAll(h);
    expect(h.finale!.pieces).toEqual(['rin-confess', 'bellkeeper-arrives', 'mem:hero:10']);
    expect(h.eve).toEqual([]);
  });
});

describe('story L: the reaction slot in the game (Task 5)', () => {
  const duo: CharacterId[] = ['hero', 'rin'];
  const R = { act2: 'group:act2', act3: 'group:act3', act4: 'group:act4' } as const;
  /** The three group scenes registered for the length of `fn` (their scripts come with the writing tasks). */
  const registered = (fn: () => void) => {
    Object.assign(REACTIONS, R);
    try { fn(); } finally { for (const k of Object.keys(R)) delete REACTIONS[k as keyof typeof R]; }
  };
  /** In town, the opening behind it, `ids` met, the main road reached to act 2's depth and `untold` held untold. */
  const inTown = (ids: CharacterId[], untold: SceneId[], storage: ReturnType<typeof memoryStorage> | null = null) => {
    const g = new Game(calm(), storage, undefined, 0, duo);
    g.state.story.queue = [];
    g.state.story.seen = ['prologue', 'prologue-inn'];
    for (const c of ids) if (!g.state.party.recruited.includes(c)) g.state.party = meet(g.state.party, c, 1);
    for (const id of untold) {
      const [, c, k] = id.split(':') as [string, CharacterId, string];
      if (!g.state.party.recruited.includes(c)) g.state.party = meet(g.state.party, c, 1);
      g.state.party.roster[c].memories = Math.max(g.state.party.roster[c].memories ?? 0, Number(k));
    }
    g.state.story.untold = [...untold];
    g.state.dungeon.reached.mainline = ACT_DEPTHS.act2;
    return g;
  };
  const trip = (g: Game) => {
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.returnToTown()).toBe(true);
  };
  const four: SceneId[] = ['mem:safira:1', 'mem:bobby:1', 'mem:selene:1', 'mem:noel:1'];

  it("the group scene is the night's first item, after the day's notices", () => registered(() => {
    const storage = memoryStorage();
    const g = inTown(['selene', 'noel'], four, storage);
    trip(g);
    expect(g.arrival).toEqual(['act2']);                         // the day: the act, no chat, no banter
    expect(g.night[0]).toBe('group:act2');                       // the night: the group first
    expect(g.night.slice(1)).toEqual(['mem:selene:1', 'mem:noel:1']);   // backlog 4, cap 2: the group's two go ahead
    expect(g.state.story.tonight).toEqual(['mem:selene:1', 'mem:noel:1']);   // tonight keeps memories only
    expect(g.sceneDone('act2', 'played')).toBe(true);
    expect(g.state.story.reacts).toEqual({ 'group:act2': 0 });
    // a reload after the act: the slot is filled again, still the night's first item
    const b = Game.boot(calm(), storage);
    expect(b.arrival).toEqual([]);
    expect(b.night).toEqual(['group:act2', 'mem:selene:1', 'mem:noel:1']);
    expect(b.sceneDone('group:act2', 'played')).toBe(true);
    expect(b.state.story.reacts).toEqual({});
    expect(b.state.story.seen).toContain('group:act2');
    expect(b.night).toEqual(['mem:selene:1', 'mem:noel:1']);
    // the next return has its chat back, and no group
    trip(b);
    expect(b.arrival.concat(b.night).some((id) => id.startsWith('group:'))).toBe(false);
    expect(b.arrival.some((id) => id.startsWith('chat:') || id.startsWith('banter:'))).toBe(true);
  }));

  it('with its cast not met the arrival is as before, and the group waits one return', () => registered(() => {
    const g = inTown(['selene'], ['mem:safira:1', 'mem:bobby:1', 'mem:selene:1', 'mem:liz:1']);   // Noel not met
    trip(g);
    expect(g.night.some((id) => id.startsWith('group:'))).toBe(false);
    for (const id of [...g.arrival]) g.sceneDone(id, 'played');
    expect(g.state.story.reacts).toEqual({ 'group:act2': 0 });
    g.state.party = meet(g.state.party, 'noel', 1);
    trip(g);
    expect(g.state.story.reacts).toEqual({ 'group:act2': 1 });
    expect(g.night[0]).toBe('group:act2');
    expect(g.arrival.some((id) => id.startsWith('chat:') || id.startsWith('banter:'))).toBe(false);
  }));

  it("the finale's list never holds a group scene, and none follows it", () => registered(() => {
    const g = new Game(calm(), memoryStorage(), undefined, 0, duo);
    for (const c of ['liz', 'scarlet', 'chizuru', 'safira'] as const) g.state.party = meet(g.state.party, c, 1);
    Object.assign(g.state.party.roster.rin, { memories: chainLength('rin'), oath: true });
    g.state.party.roster.hero.memories = 9;
    g.state.story.seen = ['prologue', 'prologue-inn', 'act2', 'act3', 'rin-reveal', 'rin-confess', 'bellkeeper-arrives', 'mem:hero:9', 'finale-eve', 'hero-alone'];
    g.state.story.nodes = ['act2', 'act3'];
    g.state.story.queue = [];
    g.state.dungeon.reached.mainline = FINALE_DEPTH;
    expect(g.depart(MAIN, FINALE_DEPTH)).toEqual({ ok: true });
    stepOnto(g, g.map().boss!);
    killAll(g);
    expect(g.finale!.pieces).toContain('act4');
    expect(g.finale!.pieces.some((id) => id.startsWith('group:'))).toBe(false);
    for (const id of [...g.finale!.pieces, 'finale'] as SceneId[]) expect(g.sceneDone(id, 'played'), id).toBe(true);
    expect(g.state.story.reacts ?? {}).toEqual({});
    g.restartAfterClear();
    expect(g.phase).toBe('town');
    expect([...g.arrival, ...g.night].some((id) => id.startsWith('group:'))).toBe(false);
  }));
});

describe('story L: the dawn before departure (controller ruling 2026-10-24)', () => {
  const duo: CharacterId[] = ['hero', 'rin'];
  /** In town, the opening behind it, `untold` held and untold (each owner met, the earlier pieces told). */
  const inTown = (untold: SceneId[], storage: ReturnType<typeof memoryStorage> | null = null) => {
    const g = new Game(calm(), storage, undefined, 0, duo);
    g.state.story.queue = [];
    g.state.story.seen = ['prologue', 'prologue-inn'];
    for (const id of untold) {
      const [, c, k] = id.split(':') as [string, CharacterId, string];
      if (!g.state.party.recruited.includes(c)) g.state.party = meet(g.state.party, c, 1);
      g.state.party.roster[c].memories = Math.max(g.state.party.roster[c].memories ?? 0, Number(k));
      for (let n = 1; n < Number(k); n++) if (!untold.includes(memScene(c, n)) && !g.state.story.seen.includes(memScene(c, n))) g.state.story.seen.push(memScene(c, n));
    }
    g.state.story.untold = [...untold];
    return g;
  };
  const trip = (g: Game) => {
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.returnToTown()).toBe(true);
  };
  const eight: SceneId[] = ['mem:selene:1', 'mem:noel:1', 'mem:safira:1', 'mem:bobby:1', 'mem:sylvie:1', 'mem:liz:1', 'mem:scarlet:1', 'mem:chizuru:1'];

  it('a return that leaves four or more untold after its night saves one dawn memory; the departure plays it first', () => {
    const g = inTown(eight);
    trip(g);
    expect(g.night).toHaveLength(3);                       // backlog 8, cap 3: five left
    const dawn = g.state.story.dawn!;
    expect(dawn).toBe(dawnMemory(g.state, [...g.arrival.filter((id) => id.startsWith('mem:')), ...g.night]));
    expect(g.night).not.toContain(dawn);
    expect(g.state.story.untold).toContain(dawn);
    expect(dawn.split(':')[1]).not.toBe(g.night[g.night.length - 1].split(':')[1]);
    for (const id of [...g.arrival, ...g.night]) g.sceneDone(id, 'played');
    expect(g.departScenes()).toEqual([dawn]);              // exactly one
    expect(g.sceneDone(dawn, 'played')).toBe(true);
    expect(g.state.story.seen).toContain(dawn);
    expect(g.state.story.fresh).not.toContain(dawn);
    expect(g.state.story.untold).not.toContain(dawn);
    expect(g.state.story.dawn).toBeUndefined();
    expect(g.departScenes()).toEqual([]);
    // a small backlog leaves no dawn
    const few = inTown(eight.slice(0, 5));
    trip(few);
    expect(few.state.story.dawn).toBeUndefined();
    expect(few.departScenes()).toEqual([]);
  });

  it('the dawn is saved with the return: a reload offers the same one', () => {
    const storage = memoryStorage();
    const g = inTown(eight, storage);
    trip(g);
    for (const id of [...g.arrival, ...g.night]) g.sceneDone(id, 'played');   // town saves at each
    const dawn = g.state.story.dawn!;
    const b = Game.boot(calm(), storage);
    expect(b.state.story.dawn).toBe(dawn);
    expect(b.departScenes()).toEqual([dawn]);
    expect(b.sceneDone(dawn, 'played')).toBe(true);
    expect(Game.boot(calm(), storage).departScenes()).toEqual([]);
  });

  it('the eve takes priority on its own departure; the dawn goes before the lone morning', () => {
    const g = inTown(eight);
    trip(g);
    for (const id of [...g.arrival, ...g.night]) g.sceneDone(id, 'played');
    const dawn = g.state.story.dawn!;
    Object.assign(g.state.party.roster.rin, { memories: chainLength('rin'), oath: true });
    g.state.story.queue = ['finale-eve'];
    expect(g.departScenes()).toEqual(['finale-eve']);
    g.state.story.seen.push('finale-eve', 'bellkeeper-arrives', 'mem:hero:9');
    g.state.party.roster.hero.memories = 9;
    g.state.story.queue = ['hero-alone'];
    expect(g.departScenes()).toEqual([dawn, 'hero-alone']);
  });

  it("the eve's line said clears the dawn: its own departure plays none, reloaded or not (review)", () => {
    const storage = memoryStorage();
    const g = inTown(eight, storage);
    trip(g);
    for (const id of [...g.arrival, ...g.night]) g.sceneDone(id, 'played');
    const dawn = g.state.story.dawn!;
    expect(dawn).toBeDefined();
    Object.assign(g.state.party.roster.rin, { memories: chainLength('rin'), oath: true });
    g.state.story.queue = ['finale-eve'];
    expect(g.departScenes()).toEqual(['finale-eve']);
    expect(g.sceneDone('finale-eve', 'played')).toBe(true);   // town saves at once
    expect(g.state.story.dawn).toBeUndefined();
    expect(g.departScenes()).toEqual([]);
    const b = Game.boot(calm(), storage);
    expect(b.state.story.dawn).toBeUndefined();
    expect(b.departScenes()).toEqual([]);
    expect(b.state.story.untold).toContain(dawn);           // not told: still 新 in the handbook
  });

  it('a reveal or confession waiting blocks the dawn: the piece stays untold and new (controller ruling 2026-10-24)', () => {
    const g = inTown(eight);
    trip(g);
    for (const id of [...g.arrival, ...g.night]) g.sceneDone(id, 'played');
    const dawn = g.state.story.dawn!;
    expect(g.departScenes()).toEqual([dawn]);
    for (const alone of ['rin-reveal', 'rin-confess'] as SceneId[]) {
      g.state.story.queue = [alone];
      expect(g.departScenes(), alone).toEqual([]);
      expect(g.sceneDone(dawn, 'played'), alone).toBe(false);   // not due either
    }
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.state.story.untold).toContain(dawn);           // untold: the handbook still marks it 新
    expect(g.state.story.seen).not.toContain(dawn);
    expect(g.state.story.dawn).toBeUndefined();
  });

  it('the dawn pick goes once told some other way, once the backlog is under four, and on departing', () => {
    const g = inTown(eight);
    trip(g);
    for (const id of [...g.arrival, ...g.night]) g.sceneDone(id, 'played');
    const dawn = g.state.story.dawn!;
    // read early in the handbook: it is told, and no other piece takes its place
    expect(g.tellEarly(dawn)).toBe(true);
    expect(g.state.story.dawn).toBeUndefined();
    expect(g.departScenes()).toEqual([]);
    // a backlog under four at the departure: none
    const h = inTown(eight);
    trip(h);
    for (const id of [...h.arrival, ...h.night]) h.sceneDone(id, 'played');
    const other = (h.state.story.untold ?? []).filter((id) => id !== h.state.story.dawn);
    h.tellEarly(other[0]);
    h.tellEarly(other[1]);
    expect(h.state.story.untold).toHaveLength(3);
    expect(h.departScenes()).toEqual([]);
    // a departure leaves no pick behind
    expect(h.depart(MAIN, 1)).toEqual({ ok: true });
    expect(h.state.story.dawn).toBeUndefined();
  });
});

describe('story L: a group scene missed expires cleanly (controller ruling 2026-10-24)', () => {
  it('its cast never met in its two chances: no trace in the queue, the seen, the night or the save, and meeting them later brings nothing back', () => {
    const R = { act2: 'group:act2', act3: 'group:act3', act4: 'group:act4' } as const;
    Object.assign(REACTIONS, R);
    try {
      const storage = memoryStorage();
      const g = new Game(calm(), storage, undefined, 0, ['hero', 'rin']);
      g.state.story.queue = [];
      g.state.story.seen = ['prologue', 'prologue-inn'];
      g.state.party = meet(g.state.party, 'selene', 1);   // Noel never met
      g.state.dungeon.reached.mainline = ACT_DEPTHS.act2;
      const trip = () => { expect(g.depart(MAIN, 1)).toEqual({ ok: true }); expect(g.returnToTown()).toBe(true); for (const id of [...g.arrival, ...g.night]) g.sceneDone(id, 'played'); };
      trip();   // act 2's arrival: the first chance
      expect(g.state.story.reacts).toEqual({ 'group:act2': 0 });
      trip();   // the second
      expect(g.state.story.reacts).toEqual({ 'group:act2': 1 });
      trip();   // expired
      const everywhere = () => [...g.state.story.queue, ...g.state.story.seen, ...g.state.story.fresh, ...(g.state.story.tonight ?? []), ...g.arrival, ...g.night, ...Object.keys(g.state.story.reacts ?? {})];
      expect(everywhere().filter((id) => id.startsWith('group:'))).toEqual([]);
      const r = loadGame(storage);
      expect(r.status).toBe('ok');
      expect(r.status === 'ok' && r.state.story.reacts).toEqual({});
      // Noel met afterwards: act 2's group stays gone
      g.state.party = meet(g.state.party, 'noel', 1);
      trip();
      trip();
      expect(everywhere().filter((id) => id.startsWith('group:'))).toEqual([]);
      expect(handbook(g.state).truths.find((t) => t.stage === 'act2')!.scenes.map((e) => e.scene)).toEqual(['act2']);
      expect(Game.boot(calm(), storage).night.filter((id) => id.startsWith('group:'))).toEqual([]);
    } finally {
      for (const k of ['act2', 'act3', 'act4'] as const) delete REACTIONS[k];
    }
  });
});

/** A short fingerprint of anything JSON can write (FNV-1a over the text), for pinning a whole result in one line. */
const fnv = (x: unknown): string => {
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify(x)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16);
};

/**
 * A game standing in town with every tier unlocked (the main road reached 30, the finale won, the Nightmare depth-25 boss
 * beaten) and `tier` chosen; its Normal twin differs in the chosen tier alone.
 */
const tiered = (tier: Difficulty, rng: Rng = calm(), lineup: CharacterId[] = HERO_LINEUP): Game => {
  const g = new Game(rng, null, undefined, 0, lineup);
  g.state.dungeon.reached.mainline = 30;
  g.state.story.act1Cleared = true;
  g.state.story.finaleCleared = true;
  g.state.dungeon.bossKills['nightmare:mainline:25'] = 1;
  expect(g.chooseTier(tier)).toEqual({ ok: true });
  return g;
};
/**
 * A game ready for the finale (Rin's oath, the acts heard, the main road reached 30) on `tier`: Nightmare unlocked, the
 * finale not yet won (so never Hell).
 */
const finaleGame = (tier: Difficulty, rng: Rng = calm()): Game => {
  const g = new Game(rng, null, undefined, 0, ['hero', 'rin']);
  g.state.dungeon.reached.mainline = 30;
  for (const node of ['act2', 'act3', 'act4'] as const) {
    g.state.story.nodes.push(node);
    g.state.story.seen.push(node);
  }
  g.state.story.act1Cleared = true;
  Object.assign(g.state.party.roster.rin, { memories: chainLength('rin'), oath: true });
  expect(g.chooseTier(tier)).toEqual({ ok: true });
  return g;
};
/** The escape: always succeeds on a 0 rng; the calm rng is put back after, so what follows draws as before. */
const flee = (g: Game) => {
  (g as { rng: unknown }).rng = constRng(0);
  expect(g.submitRound({ hero: { kind: 'escape' } })!.end!.outcome).toBe('fled');
  (g as { rng: unknown }).rng = calm();
};
const affixesOf = (g: Game) => g.battle!.enemies.map((e) => e.affixes);

describe('a run has a tier (difficulty plan Task 6a)', () => {
  it('chooseTier is town-only and needs the unlock', () => {
    const st = memoryStorage();
    const g = new Game(calm(), st, undefined, 0, HERO_LINEUP);
    const writes = vi.spyOn(st, 'setItem');
    expect(g.tier()).toBe('normal');
    g.state.dungeon.reached.mainline = 9;
    expect(g.chooseTier('nightmare')).toEqual({ ok: false, reason: 'locked' });
    expect(g.chooseTier('hell')).toEqual({ ok: false, reason: 'locked' });
    expect(g.chooseTier('easy' as Difficulty)).toEqual({ ok: false, reason: 'invalid' });
    expect([g.state.dungeon.tier, g.tier()]).toEqual([undefined, 'normal']);
    expect(writes).not.toHaveBeenCalled();
    g.state.dungeon.reached.mainline = 10;
    expect(g.chooseTier('nightmare')).toEqual({ ok: true });
    expect([g.state.dungeon.tier, g.tier()]).toEqual(['nightmare', 'nightmare']);
    expect(writes).toHaveBeenCalledTimes(1);
    expect(JSON.parse(st.getItem(SAVE_KEY)!).dungeon.tier).toBe('nightmare');
    expect(g.chooseTier('hell')).toEqual({ ok: false, reason: 'locked' });
    expect(g.state.dungeon.tier).toBe('nightmare');
    // Normal is written too: the player has seen the row.
    expect(g.chooseTier('normal')).toEqual({ ok: true });
    expect(g.state.dungeon.tier).toBe('normal');
    expect(writes).toHaveBeenCalledTimes(2);
    // Not on the map.
    expect(g.depart(MAIN, 2)).toEqual({ ok: true });
    expect(g.chooseTier('nightmare')).toEqual({ ok: false, reason: 'invalid' });
    expect(g.state.dungeon.tier).toBe('normal');
    expect(writes).toHaveBeenCalledTimes(2);
  });

  it('a departure carries the chosen tier, and Normal draws as before', () => {
    const go = (choose?: Difficulty) => {
      const g = new Game(mulberry32(3), null, undefined, 0, HERO_LINEUP);
      g.state.dungeon.reached.mainline = 10;
      if (choose) expect(g.chooseTier(choose)).toEqual({ ok: true });
      expect(g.depart(MAIN, 4)).toEqual({ ok: true });
      return { run: g.run!, next: g.rng() };
    };
    const plain = go();
    const normal = go('normal');
    const night = go('nightmare');
    expect('difficulty' in plain.run).toBe(false);
    expect('difficulty' in normal.run).toBe(false);
    expect(normal.run).toEqual(plain.run);
    expect(normal.next).toBe(plain.next);
    expect(night.run.difficulty).toBe('nightmare');
    expect(night.next).toBe(plain.next);
    const { difficulty: _d, ...rest } = night.run;
    expect(rest).toEqual(plain.run);
  });

  it('an elite on Nightmare wears one affix, on Hell two', () => {
    for (const [tier, n] of [['normal', 0], ['nightmare', 1], ['hell', 2]] as const) {
      const g = tiered(tier);
      expect(g.depart(MAIN, 12)).toEqual({ ok: true });
      const at = plantAt(g, 'elite');
      stepOnto(g, at);
      const [elite, ...escorts] = g.battle!.enemies;
      if (n) expect(elite.affixes, tier).toEqual(rollAffixes(g.run!.seed, 12, n, at));
      expect(elite.affixes?.length ?? 0, tier).toBe(n);
      expect(escorts.every((e) => e.affixes === undefined), tier).toBe(true);
    }
  });

  it("a boss past the story wears its tier's affixes", () => {
    for (const [tier, n] of [['normal', 0], ['nightmare', 1], ['hell', 2]] as const) {
      const g = tiered(tier);
      expect(g.depart(MAIN, 5)).toEqual({ ok: true });
      expect(stepOnto(g, g.map().boss!)).toEqual({ kind: 'boss' });
      const [boss] = g.battle!.enemies;
      if (n) expect(boss.affixes, tier).toEqual(rollAffixes(g.run!.seed, 5, n));
      expect(boss.affixes?.length ?? 0, tier).toBe(n);
    }
  });

  it('fleeing and coming back keeps the affixes (game flow)', () => {
    const g = tiered('nightmare');
    expect(g.depart(MAIN, 12)).toEqual({ ok: true });
    const at = plantAt(g, 'elite');
    stepOnto(g, at);
    const first = affixesOf(g);
    expect(first[0]).toHaveLength(1);
    flee(g);
    expect(tileAt(g.map(), at)).toBe('elite');
    expect(stepOnto(g, at)).toEqual({ kind: 'battle' });
    expect(affixesOf(g)).toEqual(first);
    // Another elite on the floor: the affix its own spot gives.
    flee(g);
    const other = plantAt(g, 'elite', (p) => p.x !== at.x || p.y !== at.y);
    stepOnto(g, other);
    expect(affixesOf(g)[0]).toEqual(rollAffixes(g.run!.seed, 12, 1, other));
  });

  it('fleeing a Hell crowd and meeting it again on the same spot keeps its affix (game flow)', () => {
    const g = tiered('hell');
    expect(g.depart(MAIN, 12)).toEqual({ ok: true });
    const seed = g.run!.seed;
    const m = g.map();
    const open = (p: Pos) => DIRS.some((d) => tileAt(m, { x: p.x - DELTA[d].x, y: p.y - DELTA[d].y }) === 'floor');
    let at: Pos | null = null;
    let none: Pos | null = null;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      if (m.tiles[y][x] !== 'floor' || !open({ x, y })) continue;
      const has = rollCrowdAffix(seed, 12, { x, y }, TIERS.hell.crowdAffixChance) !== undefined;
      if (has) at ??= { x, y };
      else none ??= { x, y };
    }
    const meet = (who: Game, p: Pos) => { who.encounter = 99; expect(stepOnto(who, p)).toEqual({ kind: 'battle' }); return affixesOf(who); };
    const first = meet(g, at!);
    expect(first.filter(Boolean)).toHaveLength(1);
    expect(first.find(Boolean)).toEqual([rollCrowdAffix(seed, 12, at!, TIERS.hell.crowdAffixChance)!.id]);
    flee(g);
    expect(meet(g, at!)).toEqual(first);
    flee(g);
    // A spot whose draw says no: a plain crowd.
    expect(meet(g, none!).every((a) => a === undefined)).toBe(true);
    // Nightmare crowds never wear one, on the very spot.
    const n = tiered('nightmare');
    expect(n.depart(MAIN, 12)).toEqual({ ok: true });
    expect(meet(n, at!).every((a) => a === undefined)).toBe(true);
  });

  it('a reload departs into the same affixes (game flow)', () => {
    const st = memoryStorage();
    const g = new Game(calm(), st, undefined, 0, HERO_LINEUP);
    g.state.dungeon.reached.mainline = 12;
    expect(g.chooseTier('nightmare')).toEqual({ ok: true });
    // `burn`: draws taken from the game's stream after the departure (T6a-T7a review 3), so the two plays fight their
    // battles on different draws; the affixes still match, and each is the draw its own spot gives.
    const play = (burn: number) => {
      const r = loadGame(st);
      expect(r.status).toBe('ok');
      if (r.status !== 'ok') throw new Error('no save');
      const h = new Game(mulberry32(9), st, r.state);
      expect(h.tier()).toBe('nightmare');
      expect(h.depart(MAIN, 12)).toEqual({ ok: true });
      for (let i = 0; i < burn; i++) h.rng();
      const out: unknown[][] = [];
      for (let i = 0; i < 3; i++) {
        const at = plantAt(h, 'elite');
        stepOnto(h, at);
        out.push(affixesOf(h));
        expect(out[i][0], `elite ${i}`).toEqual(rollAffixes(h.run!.seed, 12, TIERS.nightmare.eliteAffixes, at));
        expect(killAll(h).outcome).toBe('win');
      }
      return out;
    };
    const a = play(0);
    expect(a.every((f) => Array.isArray(f[0]) && f[0].length === 1)).toBe(true);
    expect(play(7)).toEqual(a);
  });

  it('a Hell save reloads into the same tier, kills and affixes (game flow, Task 6b)', () => {
    const st = memoryStorage();
    const g = new Game(calm(), st, undefined, 0, HERO_LINEUP);
    g.state.dungeon.reached.mainline = 30;
    g.state.story.act1Cleared = true;
    g.state.story.finaleCleared = true;
    // Hell opens the way the game opens it: the Nightmare depth-25 boss beaten after the finale.
    expect(g.chooseTier('hell')).toEqual({ ok: false, reason: 'locked' });
    expect(g.chooseTier('nightmare')).toEqual({ ok: true });
    expect(g.depart(MAIN, 25)).toEqual({ ok: true });
    expect(stepOnto(g, g.map().boss!)).toEqual({ kind: 'boss' });
    expect(killAll(g).outcome).toBe('win');
    expect(g.state.dungeon.bossKills).toEqual({ 'nightmare:mainline:25': 1 });
    g.state.inventory['return-lamp'] = 1;
    expect(g.useReturnLamp()).toBe(true);
    expect(g.chooseTier('hell')).toEqual({ ok: true });   // saves
    const dungeon = structuredClone(g.state.dungeon);
    // `burn`: draws taken after the departure, as in the Nightmare reload above (T6a-T7a review 3).
    const play = (burn: number) => {
      const r = loadGame(st);
      expect(r.status).toBe('ok');
      if (r.status !== 'ok') throw new Error('no save');
      expect(r.state.dungeon).toEqual(dungeon);
      const h = new Game(mulberry32(9), st, r.state);
      expect(h.tier()).toBe('hell');
      expect(h.depart(MAIN, 12)).toEqual({ ok: true });
      expect(h.run!.difficulty).toBe('hell');
      for (let i = 0; i < burn; i++) h.rng();
      const out: unknown[] = [];
      for (let i = 0; i < 3; i++) {
        const at = plantAt(h, 'elite');
        stepOnto(h, at);
        out.push(affixesOf(h));
        expect(affixesOf(h)[0], `elite ${i}`).toEqual(rollAffixes(h.run!.seed, 12, TIERS.hell.eliteAffixes, at));
        expect(killAll(h).outcome).toBe('win');
      }
      // A crowd met on the first spot whose Hell draw gives one an affix.
      const m = h.map();
      const spot = (() => {
        for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
          const p = { x, y };
          const open = DIRS.some((d) => tileAt(m, { x: x - DELTA[d].x, y: y - DELTA[d].y }) === 'floor');
          if (m.tiles[y][x] === 'floor' && open && rollCrowdAffix(h.run!.seed, 12, p, TIERS.hell.crowdAffixChance)) return p;
        }
        throw new Error('no spot');
      })();
      h.encounter = 99;
      expect(stepOnto(h, spot)).toEqual({ kind: 'battle' });
      const crowd = affixesOf(h);
      const drawn = rollCrowdAffix(h.run!.seed, 12, spot, TIERS.hell.crowdAffixChance)!;
      expect(crowd[Math.floor(drawn.pick * crowd.length)]).toEqual([drawn.id]);   // the foe its spot's draw picks
      out.push(crowd);
      return out;
    };
    const a = play(0);
    expect((a.slice(0, 3) as unknown[][]).every((f) => Array.isArray(f[0]) && f[0].length === 2)).toBe(true);
    expect((a[3] as unknown[]).filter(Boolean)).toHaveLength(1);
    expect(play(7)).toEqual(a);
  });

  it('a save holding a tier it has not unlocked boots as a reset (Task 6b)', () => {
    const s = newGame(mulberry32(1), 0, HERO_LINEUP);
    s.dungeon.reached.mainline = 30;
    s.dungeon.tier = 'hell';   // no finale, no Nightmare depth-25 kill
    const b = Game.boot(mulberry32(2), memoryStorage({ [SAVE_KEY]: JSON.stringify(s) }));
    expect(b.notice).toBe('save-reset');
    expect([b.state.dungeon.tier, b.tier()]).toEqual([undefined, 'normal']);
    // The same save on Nightmare, which it has unlocked, boots as it was.
    s.dungeon.tier = 'nightmare';
    const ok = Game.boot(mulberry32(2), memoryStorage({ [SAVE_KEY]: JSON.stringify(s) }));
    expect([ok.notice, ok.tier()]).toEqual([null, 'nightmare']);
  });

  it('story fights are Normal on every tier', () => {
    const DUO: CharacterId[] = ['hero', 'rin'];
    // The rescue room (Selene, main road depth 2): the same fight as on Normal, no affixes.
    const rescue = (tier: Difficulty) => {
      const g = tiered(tier, calm(), DUO);
      expect(g.depart(MAIN, 2)).toEqual({ ok: true });
      const c = floorOf(g.run!, 2).contents.find((x) => x.kind === 'rescue')!;
      expect(stepOnto(g, c.at)).toEqual({ kind: 'rescue', who: 'selene' });
      return g.battle!.enemies;
    };
    // Scarlet's story fight (iron depth 8).
    const scarlet = (tier: Difficulty) => {
      const g = tiered(tier, calm(), DUO);
      g.state.dungeon.reached.iron = 8;
      expect(g.depart({ region: 'iron', condition: 'plain' }, 5)).toEqual({ ok: true });
      g.floor = 8;
      const c = floorOf(g.run!, 8).contents.find((x) => x.kind === 'rescue')!;
      expect(stepOnto(g, c.at)).toEqual({ kind: 'rescue', who: 'scarlet' });
      return g.battle!.enemies;
    };
    for (const tier of ['nightmare', 'hell'] as const) {
      for (const fight of [rescue, scarlet]) {
        const foes = fight(tier);
        expect(foes, `${tier} ${fight.name}`).toEqual(fight('normal'));
        expect(foes.every((e) => e.affixes === undefined)).toBe(true);
      }
    }
    // The finale (main road depth 30, before it is won: never on Hell) and the depth-3 story boss (before Act 1 is done).
    const story = (tier: Difficulty, depth: number) => {
      const g = finaleGame(tier);
      if (depth === 3) g.state.story.act1Cleared = false;
      expect(g.depart(MAIN, depth)).toEqual({ ok: true });
      expect(stepOnto(g, g.map().boss!)).toEqual({ kind: 'boss' });
      return g;
    };
    const fin = story('nightmare', FINALE_DEPTH);
    expect(fin.battle!.enemies.map((e) => e.name)).toEqual([STORY.finaleBossName]);
    expect(fin.battle!.enemies).toEqual(story('normal', FINALE_DEPTH).battle!.enemies);
    expect(fin.battle!.enemies[0].affixes).toBeUndefined();
    const act1 = story('nightmare', 3);
    expect(act1.battle!.enemies).toEqual(story('normal', 3).battle!.enemies);
    expect(act1.battle!.enemies[0].affixes).toBeUndefined();
  });

  it('a wipe keeps the chosen tier', () => {
    const g = tiered('nightmare');
    expect(g.depart(MAIN, 12)).toEqual({ ok: true });
    stepOnto(g, plantAt(g, 'elite'));
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    expect(g.submitRound({})!.end!.outcome).toBe('lose');
    expect([g.phase, g.run, g.state.dungeon.tier, g.tier()]).toEqual(['town', null, 'nightmare', 'nightmare']);
    expect(g.depart(MAIN, 12)).toEqual({ ok: true });
    expect(g.run!.difficulty).toBe('nightmare');
  });
});

describe('drops and kill keys by tier (difficulty plan Task 6a-prime)', () => {
  /** Runs `body` with RUNE_DROP overwritten by `over`, then puts it back. */
  const withDrops = <T,>(over: Partial<typeof RUNE_DROP>, body: () => T): T => {
    const saved = { ...RUNE_DROP };
    Object.assign(RUNE_DROP, over);
    try { return body(); } finally { Object.assign(RUNE_DROP, saved); }
  };
  const lampHome = (g: Game) => { g.state.inventory['return-lamp'] = 1; expect(g.useReturnLamp()).toBe(true); };

  it('Nightmare drops are better', () => {
    const elite = (tier: Difficulty) => {
      const g = tiered(tier, mulberry32(5));
      expect(g.depart(MAIN, 12)).toEqual({ ok: true });
      stepOnto(g, plantAt(g, 'elite'));
      return killAll(g);
    };
    const plus = TIERS.nightmare.ilvl;
    expect(elite('normal').gear[0].ilvl).toBe(itemLevel(12, 'elite'));
    const night = elite('nightmare');
    expect(night.gear[0].ilvl).toBe(itemLevel(12, 'elite') + plus);
    for (const it of night.gear.slice(1)) expect(it.ilvl).toBe(itemLevel(12, 'monster') + plus);
    // A Nightmare boss rolls its rune with the tier's tier and legendary multipliers, and its gear at the tier.
    const spy = vi.mocked(rollRune);
    const gearSpy = vi.mocked(rollBossGear);
    const boss = (tier: Difficulty) => {
      const g = tiered(tier);
      g.state.runesOpen = true;
      expect(g.depart(MAIN, 5)).toEqual({ ok: true });
      stepOnto(g, g.map().boss!);
      spy.mockClear();
      gearSpy.mockClear();
      return killAll(g);
    };
    const b = boss('nightmare');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0].slice(1)).toEqual(['boss', depthLevel(5), 'plain', TIERS.nightmare.runeTierMul, TIERS.nightmare.runeLegendary]);
    expect(gearSpy.mock.calls[0][1]).toMatchObject({ difficulty: 'nightmare', source: 'boss', depth: 5 });
    expect(b.gear.map((it) => it.ilvl)).toEqual([itemLevel(5, 'boss') + plus, itemLevel(5, 'boss') + plus]);
    boss('normal');
    expect(spy.mock.calls[0].slice(1)).toEqual(['boss', depthLevel(5), 'plain']);
    expect('difficulty' in gearSpy.mock.calls[0][1]).toBe(false);
    // A chest reads the run's tier: its rune and its gear.
    withDrops({ chest: 1 }, () => {
      const g = tiered('nightmare');
      g.state.runesOpen = true;
      expect(g.depart(MAIN, 12)).toEqual({ ok: true });
      spy.mockClear();
      const r = stepOnto(g, chestWhere(g, true)) as { gear?: ItemInstance };
      expect(spy.mock.calls[0].slice(1)).toEqual(['chest', depthLevel(12), 'plain', TIERS.nightmare.runeTierMul, TIERS.nightmare.runeLegendary]);
      expect(r.gear?.ilvl).toBe(itemLevel(12, 'chest') + plus);
    });
  });

  it('first kills are counted per tier', () => {
    const spy = vi.mocked(rollBossGear);
    const g = tiered('nightmare');
    delete g.state.dungeon.bossKills['nightmare:mainline:25'];
    const beat = () => {
      expect(g.depart(MAIN, 5)).toEqual({ ok: true });
      stepOnto(g, g.map().boss!);
      spy.mockClear();
      expect(killAll(g).outcome).toBe('win');
      return spy.mock.calls[0][1];
    };
    expect(beat()).toMatchObject({ bossRepeat: false, difficulty: 'nightmare' });
    expect(g.state.dungeon.bossKills).toEqual({ 'nightmare:mainline:5': 1 });
    lampHome(g);
    expect(g.chooseTier('normal')).toEqual({ ok: true });
    expect(beat()).toMatchObject({ bossRepeat: false });   // Normal still rolls its first kill
    expect(g.state.dungeon.bossKills).toEqual({ 'nightmare:mainline:5': 1, 'mainline:5': 1 });
    lampHome(g);
    expect(g.chooseTier('nightmare')).toEqual({ ok: true });
    expect(beat()).toMatchObject({ bossRepeat: true, difficulty: 'nightmare' });
    expect(g.state.dungeon.bossKills).toEqual({ 'nightmare:mainline:5': 2, 'mainline:5': 1 });
  });

  it('a story fight pays Normal loot and a Normal kill', () => {
    const spy = vi.mocked(rollRune);
    // The finale won on a Nightmare run: the very end of the same fight on Normal; the kill on the Normal key.
    const finale = (tier: Difficulty) => {
      const g = finaleGame(tier);
      g.state.runesOpen = true;
      expect(g.depart(MAIN, FINALE_DEPTH)).toEqual({ ok: true });
      stepOnto(g, g.map().boss!);
      spy.mockClear();
      return { g, end: killAll(g) };
    };
    const night = finale('nightmare');
    expect(spy.mock.calls.map((c) => c.length)).toEqual([4]);
    expect(night.end).toEqual(finale('normal').end);
    expect(night.end.gear.map((it) => it.ilvl)).toEqual([itemLevel(FINALE_DEPTH, 'boss'), itemLevel(FINALE_DEPTH, 'boss')]);
    expect(night.g.state.dungeon.bossKills).toEqual({ 'mainline:30': 1 });
    expect(night.g.state.story.finaleCleared).toBe(true);
    // A rescue fight on Nightmare and on Hell pays as on Normal, every foe rolling its rune.
    withDrops({ monster: 1 }, () => {
      const rescue = (tier: Difficulty) => {
        const g = tiered(tier, calm(), ['hero', 'rin']);
        g.state.runesOpen = true;
        expect(g.depart(MAIN, 2)).toEqual({ ok: true });
        stepOnto(g, floorOf(g.run!, 2).contents.find((x) => x.kind === 'rescue')!.at);
        spy.mockClear();
        return killAll(g);
      };
      for (const tier of ['nightmare', 'hell'] as const) {
        const end = rescue(tier);
        expect(spy.mock.calls.length).toBeGreaterThan(0);
        expect(spy.mock.calls.every((c) => c.length === 4)).toBe(true);
        expect(end, tier).toEqual(rescue('normal'));
      }
    });
  });

  it('Normal drops are as before', () => {
    // Pinned before Task 6a-prime: one seed's elite win, boss win and gear chest on iron depth 5, runes open.
    const g = new Game(mulberry32(17), null, undefined, 0, HERO_LINEUP);
    g.state.dungeon.reached.iron = 5;
    g.state.runesOpen = true;
    expect(g.depart({ region: 'iron', condition: 'plain' }, 5)).toEqual({ ok: true });
    stepOnto(g, plantAt(g, 'elite'));
    const elite = killAll(g);
    const chest = stepOnto(g, chestWhere(g, true));
    stepOnto(g, g.map().boss!);
    const boss = killAll(g);
    const sum = (e: BattleEnd) => ({ gear: e.gear.map((it) => [it.base, it.rarity, it.ilvl]), runes: e.runes, drops: e.drops, gold: e.gold, exp: e.exp });
    expect(sum(elite)).toEqual({ gear: [['scale-mail', 'magic', 20], ['wooden-buckler', 'magic', 18]], runes: undefined, drops: { 'bat-wing': 1, moss: 1, 'king-scale': 1 }, gold: 336, exp: 294 });
    expect(sum(boss)).toEqual({ gear: [['star-saber', 'legendary', 22], ['straw-sandals', 'rare', 22]], runes: [{ id: 'bounce', tier: 'rare' }], drops: { 'iron-shard': 1 }, gold: 0, exp: 1094 });
    expect(chest).toEqual({ kind: 'chest', item: 'ancient-gear', qty: 1, gear: { uid: 3, base: 'cloth-gloves', rarity: 'common', ilvl: 18, affixes: [], enhance: 0 } });
    expect([g.state.dungeon.bossKills, g.run!.lootDraws, g.run!.runeDraws, g.rng()]).toEqual([{ 'iron:5': 1 }, 5, 2, 0.06393614131957293]);
    // The whole of each result, to the last affix of every piece.
    expect([fnv(elite), fnv(boss), fnv(chest)]).toEqual(['f5001d33', 'b08b01f5', 'e0f8ad6e']);
  });
});

describe('time and moon: the day (Task 1)', () => {
  /** In town on the main road, a depth reached past the first boss. */
  const town = (storage: ReturnType<typeof memoryStorage> | null = null) => {
    const g = new Game(calm(), storage, undefined, 0, HERO_LINEUP);
    g.state.dungeon.reached.mainline = 3;
    return g;
  };

  it("a return ends the day: walking home, the lamp, a wipe and the finale's clear each add one", () => {
    // walking home by the entrance
    const g = town();
    expect(dayOf(g.state)).toBe(1);
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.returnToTown()).toBe(true);
    expect(g.state.story.day).toBe(2);
    // the return lamp, from a floor further down: the floors walked on one dive are one day
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(downstairs(g, g.map().down!)).toMatchObject({ kind: 'floor', floor: 2 });
    expect(dayOf(g.state)).toBe(2);
    g.state.inventory['return-lamp'] = 1;
    expect(g.useReturnLamp()).toBe(true);
    expect(g.state.story.day).toBe(3);
    // a wipe
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    g.encounter = 99;
    expect(g.move(DIRS.find((d) => tileAt(g.map(), { x: g.pos.x + DELTA[d].x, y: g.pos.y + DELTA[d].y }) === 'floor')!)).toEqual({ kind: 'battle' });
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    expect(g.submitRound({})!.end!.outcome).toBe('lose');
    expect([g.phase, g.notice, g.state.story.day]).toEqual(['town', 'wipe', 4]);
    // the finale's clear: the dive is one day, its return the next
    const f = finaleGame('normal');
    f.state.story.day = 9;
    expect(f.depart(MAIN, FINALE_DEPTH)).toEqual({ ok: true });
    stepOnto(f, f.map().boss!);
    expect(killAll(f).outcome).toBe('win');
    expect([f.phase, f.state.story.finaleCleared, f.state.story.day]).toEqual(['clear', true, 9]);
    f.restartAfterClear();
    expect([f.phase, f.state.story.day]).toEqual(['town', 10]);
  });

  it('a departure keeps the day, and a reload of the town save departs on the same day', () => {
    const storage = memoryStorage();
    const g = town(storage);
    expect(g.chooseTier('normal')).toEqual({ ok: true });   // the town saves at once
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(dayOf(g.state)).toBe(1);
    // no save in the labyrinth: a reload is back in town, on the same day, and departs on it
    const b = Game.boot(calm(), storage);
    expect([b.phase, dayOf(b.state)]).toEqual(['town', 1]);
    expect(b.depart(MAIN, 1)).toEqual({ ok: true });
    expect(dayOf(b.state)).toBe(1);
    expect(b.returnToTown()).toBe(true);
    expect(dayOf(b.state)).toBe(2);
  });

  it('a reload keeps the day', () => {
    const storage = memoryStorage();
    const g = town(storage);
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.returnToTown()).toBe(true);
    expect(g.chooseTier('normal')).toEqual({ ok: true });   // the town saves the return
    expect(g.state.story.day).toBe(2);
    const b = Game.boot(calm(), storage);
    expect(b.state.story.day).toBe(2);
    expect(Game.boot(calm(), storage).state.story.day).toBe(2);
    expect(Game.boot(calm(), memoryStorage()).state.story.day).toBeUndefined();   // a new game: day 1, unwritten
  });

  it("the night planned on a return is the night of the dive's day", () => {
    const g = town();
    for (let i = 0; i < 5; i++) {
      const d = dayOf(g.state);
      expect(g.depart(MAIN, 1)).toEqual({ ok: true });
      expect(g.returnToTown()).toBe(true);
      expect(dayOf(g.state)).toBe(d + 1);
      expect(tonightMoon(g.state)).toBe(moonOf(d));
    }
  });

  it('a night at the inn tells no memory and keeps tonight and the dawn', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, ['hero', 'rin']);
    g.state.story.queue = [];
    g.state.story.seen = ['prologue', 'prologue-inn'];
    const eight: SceneId[] = ['mem:selene:1', 'mem:noel:1', 'mem:safira:1', 'mem:bobby:1', 'mem:sylvie:1', 'mem:liz:1', 'mem:scarlet:1', 'mem:chizuru:1'];
    for (const id of eight) {
      const c = id.split(':')[1] as CharacterId;
      g.state.party = meet(g.state.party, c, 1);
      g.state.party.roster[c].memories = 1;
    }
    g.state.story.untold = [...eight];
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.returnToTown()).toBe(true);
    expect(g.night).toHaveLength(3);
    expect(g.state.story.dawn).toBeDefined();
    const story = structuredClone(g.state.story);
    const [arrival, night] = [[...g.arrival], [...g.night]];
    g.state.gold = 999;
    expect(g.rest().ok).toBe(true);
    expect(g.state.story.day).toBe(story.day! + 1);
    expect([g.state.story.untold, g.state.story.tonight, g.state.story.dawn]).toEqual([story.untold, story.tonight, story.dawn]);
    expect([g.arrival, g.night]).toEqual([arrival, night]);
    expect(g.state.story.seen).toEqual(story.seen);
    // saved with the rest: a reload holds the next day and the same night
    const b = Game.boot(calm(), storage);
    expect(b.state.story.day).toBe(story.day! + 1);
    expect(b.night).toEqual(night);
    expect(b.state.story.dawn).toBe(story.dawn);
  });
});

describe('time and moon: the moon in the labyrinth (Task 2)', () => {
  const PAIR: CharacterId[] = ['hero', 'selene'];
  /** In town on `day`, Selene met holding `held`, the main road reached to `depth`. */
  const inTown = (depth: number, day: number, held: number, pity: Partial<Record<CharacterId, number>> = {}, storage: ReturnType<typeof memoryStorage> | null = null) => {
    const g = new Game(calm(), storage, undefined, 0, PAIR);
    g.state.dungeon.reached.mainline = depth;
    g.state.story.day = day;
    g.state.party.roster.selene.memories = held;
    g.state.story.pity = { ...pity };
    return g;
  };
  const dive = (depth: number, day: number, held: number, pity: Partial<Record<CharacterId, number>> = {}) => {
    const g = inTown(depth, day, held, pity);
    expect(g.depart(MAIN, depth)).toEqual({ ok: true });
    return g;
  };
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
  const hers = (g: Game, floor: number) => floorOf(g.run!, floor).contents.find((c) => c.kind === 'glimmer' && c.owner === 'selene');

  it("a glimmer planted for Selene's second piece pays under a full moon and leaves a shard under any other", () => {
    expect([4, 1, 2, 3].map(moonOf)).toEqual(['full', 'waning', 'new', 'waxing']);
    const full = dive(6, 4, 1);
    expect(stepOnto(full, plantGlimmer(full, 'selene'))).toEqual({ kind: 'glimmer', gained: [{ kind: 'piece', id: 'selene', n: 2 }] });
    expect(full.state.story.untold).toEqual(['mem:selene:2']);
    for (const day of [1, 2, 3]) {
      const g = dive(6, day, 1);
      expect(stepOnto(g, plantGlimmer(g, 'selene')), `day ${day}`).toEqual({ kind: 'glimmer', gained: [{ kind: 'shard', grade: expect.any(String) }] });
      expect(memoriesOf(g.state.party.roster.selene)).toBe(1);
      expect(g.state.story.untold ?? []).toEqual([]);
    }
  });

  it("the moon of a dive is its day's, the same at the glimmer's making and its pickup", () => {
    // her fifth piece waits for the new moon (day 2); her pity is due
    const g = dive(15, 2, 4, { selene: MEMORY_PITY });
    expect(calendarOf(g.state)).toMatchObject({ day: 2, moon: 'new', time: 'day' });
    expect(g.run!.glimmers[15]).toContain('selene');
    const c = hers(g, 15)!;
    expect(c).toBeDefined();
    expect(dayOf(g.state)).toBe(2);
    expect(stepOnto(g, c.at)).toEqual({ kind: 'glimmer', gained: [{ kind: 'piece', id: 'selene', n: 5 }] });
    // the day after (the first quarter): no glimmer is made for her, and her pity still counts the floor
    const next = dive(16, 3, 4, { selene: MEMORY_PITY });
    expect(next.run!.glimmers[16]).not.toContain('selene');
    expect(hers(next, 16)).toBeUndefined();
    expect(downstairs(next, next.map().down!)).toMatchObject({ kind: 'floor', floor: 17 });
    expect(next.state.story.pity.selene).toBe(MEMORY_PITY + 1);
    expect(next.run!.glimmers[17]).not.toContain('selene');
  });

  it('a reload mid-town departs under the same moon', () => {
    const storage = memoryStorage();
    const g = inTown(15, 2, 4, { selene: MEMORY_PITY }, storage);
    expect(g.chooseTier('normal')).toEqual({ ok: true });   // the town saves
    expect(g.depart(MAIN, 15)).toEqual({ ok: true });
    expect(g.run!.glimmers[15]).toContain('selene');
    const b = Game.boot(calm(), storage);
    expect([b.phase, dayOf(b.state), calendarOf(b.state).moon]).toEqual(['town', 2, 'new']);
    expect(b.depart(MAIN, 15)).toEqual({ ok: true });
    expect(b.run!.glimmers[15]).toContain('selene');
    expect(stepOnto(b, hers(b, 15)!.at)).toEqual({ kind: 'glimmer', gained: [{ kind: 'piece', id: 'selene', n: 5 }] });
  });

  it('two games a day apart fight the same battle', () => {
    // Selene holds no piece and her first waits for no moon: the floors are the same whatever the day
    const fight = (day: number) => {
      const g = new Game(mulberry32(7), null, undefined, 0, PAIR);
      g.state.dungeon.reached.mainline = 3;
      g.state.story.day = day;
      expect(g.depart(MAIN, 1)).toEqual({ ok: true });
      g.encounter = 99;
      expect(g.move(DIRS.find((d) => tileAt(g.map(), { x: g.pos.x + DELTA[d].x, y: g.pos.y + DELTA[d].y }) === 'floor')!)).toEqual({ kind: 'battle' });
      return g;
    };
    const a = fight(1);
    const b = fight(2);
    expect(moonOf(1)).not.toBe(moonOf(2));
    expect(a.battle).toEqual(b.battle);
    expect(a.battle!.party.map((c) => c.defId)).toContain('selene');
    expect([a.battle!.moon?.phase, b.battle!.moon?.phase]).toEqual(['first', 'first']);
    for (let round = 0; round < 3; round++) {
      const ra = a.submitRound({});
      const rb = b.submitRound({});
      expect(ra?.battle.log, `round ${round + 1}`).toEqual(rb?.battle.log);
      if (!ra || ra.end) break;
    }
    expect(a.battle).toEqual(b.battle);
  });
});

describe('time and moon: the seasons and the spring festival in the game (Task 7)', () => {

  it('the finale writes the spring day', () => {
    const f = finaleGame('normal');
    f.state.story.day = 9;
    expect(f.state.story.springDay).toBeUndefined();
    expect(f.depart(MAIN, FINALE_DEPTH)).toEqual({ ok: true });
    stepOnto(f, f.map().boss!);
    expect(killAll(f).outcome).toBe('win');
    expect([f.state.story.finaleCleared, f.state.story.springDay]).toEqual([true, 9 + SPRING_AFTER]);
  });

  it("spring comes SPRING_AFTER days after the finale's dive", () => {
    const f = finaleGame('normal');
    f.state.story.day = 9;
    expect(f.depart(MAIN, FINALE_DEPTH)).toEqual({ ok: true });
    stepOnto(f, f.map().boss!);
    killAll(f);
    expect(calendarOf(f.state).season).toBe('winter');   // the finale's own day: winter (acts 3 and 4 played)
    f.restartAfterClear();
    // each return's night is its dive's day: 9 (the finale's), 10, 11, 12 winter; 13 on, spring
    const nights: string[] = [];
    for (let i = 0; i < 6; i++) {
      nights.push(`${dayOf(f.state)}:${calendarOf(f.state, 'night').season}`);
      expect(f.depart(MAIN, 1)).toEqual({ ok: true });
      expect(f.returnToTown()).toBe(true);
    }
    expect(nights).toEqual(['10:winter', '11:winter', '12:winter', '13:spring', '14:spring', '15:spring']);
  });

  it('the festival leads the night and a reload plays it again, as the return recorded it, until it is seen', () => {
    expect(SEASON_SCENES.spring).toBe('season:spring');   // Task 8: written and registered
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, ['hero', 'rin']);
    const st = g.state;
    st.dungeon.reached.mainline = 30;
    st.story.nodes = ['act2', 'act3', 'act4'];
    st.story.queue = [];
    st.story.seen = ['prologue', 'prologue-inn', 'first-return', 'act1-after', 'act2', 'act3', 'act4', 'group:act2', 'group:act3', 'group:act4', 'finale', 'epilogue', 'home:chizuru'];
    st.story.act1Cleared = true;
    st.story.finaleCleared = true;
    Object.assign(st.party.roster.rin, { memories: chainLength('rin'), oath: true });
    st.party = meet(st.party, 'chizuru', 1);
    st.party.roster.chizuru.memories = chainLength('chizuru');
    for (let n = 1; n <= chainLength('chizuru'); n++) st.story.seen.push(memScene('chizuru', n));
    st.party = meet(st.party, 'noel', 1);
    st.party.roster.noel.memories = 1;
    st.story.untold = ['mem:noel:1'];
    st.story.day = 20;
    st.story.springDay = 20;
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.returnToTown()).toBe(true);
    expect(g.night).toEqual(['season:spring']);   // the festival's night tells no memory
    expect(g.arrival).not.toContain('season:spring');
    expect(g.state.story.queue).not.toContain('season:spring');
    expect(g.state.story.untold).toEqual(['mem:noel:1']);
    expect(g.state.story.tonight).toEqual([]);
    expect(g.state.story.festival).toBe('season:spring');   // recorded with the return (Task 7 review)
    expect(g.chooseTier('normal')).toEqual({ ok: true });   // the town saves
    const b = Game.boot(calm(), storage);
    expect(b.night).toEqual(['season:spring']);
    expect(b.sceneDone('season:spring', 'played')).toBe(true);
    expect(b.state.story.seen).toContain('season:spring');
    const c = Game.boot(calm(), storage);
    expect(c.state.story.seen).toContain('season:spring');
    expect(c.night).toEqual([]);
    // the next return tells the memory that waited
    expect(c.depart(MAIN, 1)).toEqual({ ok: true });
    expect(c.returnToTown()).toBe(true);
    expect(c.night).toEqual(['mem:noel:1']);
  });

  it('the night is ordered group, season, memory, as Game.arrive puts it', () => {
    expect(orderNight(['mem:noel:1', 'season:spring', 'group:act2'])).toEqual(['group:act2', 'season:spring', 'mem:noel:1']);
    expect((['group:act2', 'season:spring', 'mem:noel:1'] as SceneId[]).map(isNightSlot)).toEqual([true, true, false]);
  });
});

describe('time and moon: a reload never decides the festival again (Task 7 review)', () => {
  /** After the finale, Rin's choice made, Chizuru whole (`home`: her homecoming already seen), Noel holding an untold piece. */
  const afterFinale = (storage: ReturnType<typeof memoryStorage>, o: { home: boolean; day: number; springDay: number }) => {
    const g = new Game(calm(), storage, undefined, 0, ['hero', 'rin']);
    const st = g.state;
    st.dungeon.reached.mainline = 30;
    st.story.nodes = ['act2', 'act3', 'act4'];
    st.story.queue = [];
    st.story.seen = ['prologue', 'prologue-inn', 'first-return', 'act1-after', 'act2', 'act3', 'act4', 'group:act2', 'group:act3', 'group:act4', 'finale', 'epilogue', ...(o.home ? ['home:chizuru' as SceneId] : [])];
    st.story.act1Cleared = true;
    st.story.finaleCleared = true;
    Object.assign(st.party.roster.rin, { memories: chainLength('rin'), oath: true });
    st.party = meet(st.party, 'chizuru', 1);
    st.party.roster.chizuru.memories = chainLength('chizuru');
    for (let n = 1; n <= chainLength('chizuru'); n++) st.story.seen.push(memScene('chizuru', n));
    st.party = meet(st.party, 'noel', 1);
    st.party.roster.noel.memories = 1;
    st.story.untold = ['mem:noel:1'];
    st.gold = 5000;
    st.story.day = o.day;
    st.story.springDay = o.springDay;
    return g;
  };

  it('case A: the homecoming return skips the festival, and a reload after the homecoming does not bring it', () => {
    const storage = memoryStorage();
    const g = afterFinale(storage, { home: false, day: 20, springDay: 20 });
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.returnToTown()).toBe(true);
    expect(g.arrival).toContain('home:chizuru');
    expect(g.night).toEqual(['mem:noel:1']);
    expect(g.state.story.festival).toBeUndefined();
    for (const id of [...g.arrival]) g.sceneDone(id, 'played');   // the homecoming seen; the town saves
    const b = Game.boot(calm(), storage);
    expect(b.night).toEqual(['mem:noel:1']);
    // the next spring return is the festival's
    expect(b.depart(MAIN, 1)).toEqual({ ok: true });
    expect(b.returnToTown()).toBe(true);
    expect(b.night).toEqual(['season:spring']);
  });

  it('case B: a winter return, then a night at the inn into spring, then a reload: no festival without a return', () => {
    const storage = memoryStorage();
    const g = afterFinale(storage, { home: true, day: 12, springDay: 13 });
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.returnToTown()).toBe(true);   // the night of day 12: winter
    expect(g.night).toEqual(['mem:noel:1']);
    expect(g.rest().ok).toBe(true);        // day 14, spring: the inn saves
    expect(g.state.story.day).toBe(14);
    const b = Game.boot(calm(), storage);
    expect(b.night).toEqual(['mem:noel:1']);
    expect(b.night).not.toContain('season:spring');
  });

  it('a reload after the festival return plays the festival again, because the return recorded it', () => {
    const storage = memoryStorage();
    const g = afterFinale(storage, { home: true, day: 20, springDay: 20 });
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.returnToTown()).toBe(true);
    expect(g.night).toEqual(['season:spring']);
    expect(g.state.story.festival).toBe('season:spring');
    expect(g.chooseTier('normal')).toEqual({ ok: true });   // the town saves, the record with it
    const b = Game.boot(calm(), storage);
    expect(b.night).toEqual(['season:spring']);
    expect(b.sceneDone('season:spring', 'played')).toBe(true);
    expect(b.state.story.festival).toBeUndefined();
    expect(Game.boot(calm(), storage).night).toEqual([]);
  });

  it('a night at the inn drops the record: a reload after it plays no festival under that moon; the next return does (bond batch fix)', () => {
    // Before this fix a night at the inn kept the record, so a festival whose night never finished (its playback threw,
    // ui2/scenes/town.ts playNight) came back on a reload under the inn night's moon.
    const storage = memoryStorage();
    const g = afterFinale(storage, { home: true, day: 20, springDay: 20 });
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.returnToTown()).toBe(true);
    expect(g.night).toEqual(['season:spring']);
    expect(g.rest().ok).toBe(true);   // the festival's night not seen; the inn saves
    expect(g.state.story.festival).toBeUndefined();
    const b = Game.boot(calm(), storage);
    expect(b.night).not.toContain('season:spring');
    expect(b.state.story.seen).not.toContain('season:spring');
    // spring stays and the festival is unseen: the next return decides it again
    expect(b.depart(MAIN, 1)).toEqual({ ok: true });
    expect(b.returnToTown()).toBe(true);
    expect(b.night).toEqual(['season:spring']);
    expect(b.state.story.festival).toBe('season:spring');
  });
});

describe('bond from going down and fighting together (bond plan Task 5)', () => {
  const field = (g: Game, id: CharacterId) => bondOf(g.state.party.roster[id]).field;
  const fighter = (g: Game, id: CharacterId) => g.battle!.party.find((c) => c.key === id)!;
  /** Every foe asleep for a while: a round passes and nobody's HP moves. */
  const lull = (g: Game) => { for (const e of g.battle!.enemies) e.sleep = 9; };
  /** HP at 20 % of her max: in danger. */
  const low = (g: Game, id: CharacterId) => { const c = fighter(g, id); c.hp = Math.floor(c.max.hp * 0.2); };
  const elite = (g: Game) => { stepOnto(g, plantAt(g, 'elite')); expect(g.phase).toBe('battle'); };

  it('going down the stairs bonds whoever goes along', () => {
    const g = inMap(1);
    g.state.party = meet(g.state.party, 'rin', 1);   // a sixth: on the bench
    expect(activeIds(g.state.party)).not.toContain('rin');
    g.state.party.roster.noel.hp = 0;                  // down
    expect(downstairs(g, g.map().down!)).toMatchObject({ kind: 'floor', floor: 2 });
    for (const id of ['chizuru', 'liz', 'selene'] as const) expect(field(g, id), id).toBe(FIELD_POINTS.floor);
    expect(field(g, 'noel')).toBe(0);
    expect(field(g, 'rin')).toBe(0);
    expect(g.state.party.roster.hero.bond).toBeUndefined();
    expect(g.run!.bond).toEqual({ chizuru: 1, liz: 1, selene: 1 });
  });

  it('a boss or an elite bonds everyone in the fight', () => {
    const g = inMap(1);
    elite(g);
    fighter(g, 'noel').hp = 0;
    fighter(g, 'noel').alive = false;   // down at the end, but in the fight
    expect(killAll(g).outcome).toBe('win');
    for (const id of ['chizuru', 'liz', 'noel', 'selene'] as const) expect(field(g, id), id).toBe(FIELD_POINTS.strong);
    expect(g.state.party.roster.hero.bond).toBeUndefined();
    // a plain fight gives nothing
    const p = inMap(1);
    (p as unknown as { startBattle: (ids: string[], boss: boolean) => void }).startBattle(['slime'], false);
    expect(killAll(p).outcome).toBe('win');
    expect(field(p, 'chizuru')).toBe(0);
  });

  it('saved means she dropped into danger during the fight and stood at the end', () => {
    const g = inMap(1);
    elite(g);
    lull(g);
    low(g, 'selene');
    expect(g.submitRound({})!.end).toBeNull();   // the round ends with her in danger
    expect(killAll(g).outcome).toBe('win');
    expect(field(g, 'selene')).toBe(FIELD_POINTS.strong + FIELD_POINTS.saved);
    expect(field(g, 'chizuru')).toBe(FIELD_POINTS.strong);
  });

  it('coming in low is not being saved', () => {
    const g = inMap(1);
    g.state.party.roster.selene.hp = Math.floor(statsOf(g.state.party.roster.selene).hp * 0.2);
    elite(g);
    lull(g);
    expect(g.submitRound({})!.end).toBeNull();
    expect(killAll(g).outcome).toBe('win');
    expect(field(g, 'selene')).toBe(FIELD_POINTS.strong);   // in danger the whole fight: no saved
  });

  it('low, mended, then low again counts', () => {
    const g = inMap(1);
    g.state.party.roster.selene.hp = Math.floor(statsOf(g.state.party.roster.selene).hp * 0.2);
    elite(g);
    lull(g);
    fighter(g, 'selene').hp = fighter(g, 'selene').max.hp;   // mended
    expect(g.submitRound({})!.end).toBeNull();
    low(g, 'selene');                                         // and low again
    expect(g.submitRound({})!.end).toBeNull();
    expect(killAll(g).outcome).toBe('win');
    expect(field(g, 'selene')).toBe(FIELD_POINTS.strong + FIELD_POINTS.saved);
  });

  it('in danger and down at the end gives nothing for being saved', () => {
    const g = inMap(1);
    elite(g);
    lull(g);
    low(g, 'selene');
    expect(g.submitRound({})!.end).toBeNull();
    fighter(g, 'selene').hp = 0;
    fighter(g, 'selene').alive = false;
    expect(killAll(g).outcome).toBe('win');
    expect(field(g, 'selene')).toBe(FIELD_POINTS.strong);
  });

  it('a rescue fight and a flight give nothing', () => {
    const r = new Game(calm(), memoryStorage(), undefined, 0, ['hero', 'rin']);
    r.state.dungeon.reached.mainline = 3;
    expect(r.depart(MAIN, 2)).toEqual({ ok: true });
    const c = floorOf(r.run!, 2).contents.find((x) => x.kind === 'rescue')!;
    expect(stepOnto(r, c.at)).toEqual({ kind: 'rescue', who: 'selene' });
    lull(r);
    low(r, 'rin');
    expect(r.submitRound({})!.end).toBeNull();
    expect(killAll(r).outcome).toBe('win');
    expect(field(r, 'rin')).toBe(0);
    expect(r.state.party.roster.selene.bond).toBeUndefined();
    const f = inMap(1);
    elite(f);
    lull(f);
    low(f, 'selene');
    expect(f.submitRound({})!.end).toBeNull();
    flee(f);
    expect(field(f, 'selene')).toBe(0);
    expect(f.run!.bond).toEqual({});
  });

  it('five a run, and a wipe keeps what was earned', () => {
    const g = inMap(1);
    elite(g);
    lull(g);
    low(g, 'selene');
    expect(g.submitRound({})!.end).toBeNull();
    expect(killAll(g).outcome).toBe('win');       // strong 2 + saved 2
    expect(downstairs(g, g.map().down!)).toMatchObject({ kind: 'floor', floor: 2 });   // + floor 1: 5
    expect(field(g, 'selene')).toBe(BOND_RUN_CAP);
    elite(g);
    expect(killAll(g).outcome).toBe('win');
    expect(field(g, 'selene')).toBe(BOND_RUN_CAP);   // the dive's cap
    expect(field(g, 'chizuru')).toBe(FIELD_POINTS.strong * 2 + FIELD_POINTS.floor);
    // a wipe: what was earned stays
    elite(g);
    for (const p of g.battle!.party) { p.hp = 0; p.alive = false; }
    expect(g.submitRound({})!.end!.outcome).toBe('lose');
    expect(g.phase).toBe('town');
    expect(field(g, 'selene')).toBe(BOND_RUN_CAP);
    // the next dive counts from 0
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.run!.bond).toEqual({});
    expect(downstairs(g, g.map().down!)).toMatchObject({ kind: 'floor', floor: 2 });
    expect(field(g, 'selene')).toBe(BOND_RUN_CAP + FIELD_POINTS.floor);
  });

  it('bond draws nothing', () => {
    type Trace = { rng: number; loot: number; memory: number; ends: unknown[]; fields: number[] };
    const play = (earn: boolean): Trace => {
      const was = BOND_SWITCH.earn;
      BOND_SWITCH.earn = earn;
      try {
        return withBondScale(0, () => {
          const base = mulberry32(7);
          let calls = 0;
          const rng: Rng = () => { calls++; return base(); };
          const g = new Game(rng, memoryStorage(), undefined, 0, HERO_LINEUP);
          g.state.dungeon.reached.mainline = 3;
          for (const id of HERO_LINEUP) g.state.party.roster[id].level = 12;
          expect(g.depart(MAIN, 1)).toEqual({ ok: true });
          const ends: unknown[] = [];
          const fight = () => {
            for (let i = 0; i < 40 && g.phase === 'battle'; i++) {
              const acts = Object.fromEntries(g.battle!.party.filter((c) => c.alive).map((c) => [c.key, { kind: 'attack', target: g.battle!.enemies.find((e) => e.alive)?.key ?? '' }]));
              const r = g.submitRound(acts as never)!;
              if (r.end) ends.push({ outcome: r.end.outcome, drops: r.end.drops, gear: r.end.gear.map((it) => [it.base, it.rarity]), fragments: r.end.fragments ?? [] });
            }
          };
          stepOnto(g, plantAt(g, 'elite'));
          fight();
          downstairs(g, g.map().down!);
          downstairs(g, g.map().down!);
          stepOnto(g, g.map().boss!);
          fight();
          const fields = HERO_LINEUP.map((id) => bondOf(g.state.party.roster[id]).field);
          return { rng: calls, loot: g.run?.lootDraws ?? -1, memory: g.run?.memoryDraws ?? -1, ends, fields };
        });
      } finally {
        BOND_SWITCH.earn = was;
      }
    };
    const on = play(true), off = play(false);
    expect(on.ends.length).toBeGreaterThanOrEqual(2);
    expect({ ...on, fields: [] }).toEqual({ ...off, fields: [] });
    expect(off.fields.every((n) => n === 0)).toBe(true);
    expect(on.fields.some((n) => n > 0)).toBe(true);
  });
});

describe('gifts in the game (bond plan Task 6)', () => {
  const pools: GiftPools = { loved: ['一', '二'], liked: ['三', '四'], neutral: ['五'], declined: { 'old-coin': '六' }, healed: { 'old-coin': '七' } };
  /** Selene's reactions registered for the test (the registry starts empty), put back after. */
  const withSelene = <T,>(f: () => T): T => {
    const had = GIFT_LINES.selene;
    GIFT_LINES.selene = pools;
    try { return f(); } finally {
      if (had) GIFT_LINES.selene = had; else delete GIFT_LINES.selene;
    }
  };
  const withHer = () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage, undefined, 0, ['hero', 'rin']);
    g.state.party = meet(g.state.party, 'selene', 1);
    g.state.inventory['star-tear'] = 3;
    g.state.inventory['old-coin'] = 3;
    g.state.inventory['dusk-cloth'] = 1;
    return { g, storage };
  };

  it('gifts only in town, once a day', () => withSelene(() => {
    const { g, storage } = withHer();
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.give('selene', 'star-tear')).toEqual({ ok: false, reason: 'phase' });
    expect(g.returnToTown()).toBe(true);
    const before = bondPoints(g.state.party.roster.selene);
    const r = g.give('selene', 'star-tear');
    expect(r.ok && [r.taste, r.gained]).toEqual(['loved', 4]);
    expect(bondPoints(g.state.party.roster.selene)).toBe(before + 4);
    const saved = loadGame(storage);
    expect(saved.status === 'ok' && saved.state.party.roster.selene.bond!.gifts).toEqual({ 'star-tear': 1 });
    expect(saved.status === 'ok' && saved.state.story.gifted).toEqual(['selene']);
    expect(g.give('selene', 'star-tear')).toEqual({ ok: false, reason: 'today' });
    // Rin takes gifts once both of her tables are written (plan ruling 6): Task 16 wrote them, so take the one after
    // her choice away to see the refusal
    const oath = RIN_OATH.value;
    RIN_OATH.value = null;
    try { expect(g.give('rin', 'dusk-cloth')).toEqual({ ok: false, reason: 'unwritten' }); } finally { RIN_OATH.value = oath; }
    g.state.gold = 1000;
    expect(g.rest().ok).toBe(true);
    const again = g.give('selene', 'star-tear');
    expect(again.ok && again.count).toBe(2);
    // a reload of the same day reads the same gifts
    const b = Game.boot(calm(), storage);
    expect(b.state.party.roster.selene.bond!.gifts).toEqual({ 'star-tear': 2 });
    expect(b.give('selene', 'star-tear')).toEqual({ ok: false, reason: 'today' });
  }));

  it('give draws nothing', () => withSelene(() => {
    const base = calm();
    let calls = 0;
    const g = new Game(() => { calls++; return base(); }, memoryStorage(), undefined, 0, ['hero', 'rin']);
    g.state.party = meet(g.state.party, 'selene', 1);
    g.state.inventory['star-tear'] = 3;
    g.state.inventory['old-coin'] = 3;
    const was = calls;
    expect(g.give('selene', 'old-coin').ok).toBe(true);   // handed back
    expect(g.give('selene', 'star-tear').ok).toBe(true);
    expect(calls).toBe(was);
  }));
});

describe('a bond choice (bond plan Task 8)', () => {
  it('a choice counts once', () => {
    bondsAdd('selene');
    try {
      const g = new Game(calm(), memoryStorage(), undefined, 0, ['hero', 'rin']);
      g.state.party = meet(g.state.party, 'selene', 1);
      const talk = () => bondOf(g.state.party.roster.selene).talk;
      expect(g.bondChoice('bond:selene:1', 'promise')).toBe(false);   // not pending
      g.pending.push('bond:selene:1');
      expect(g.bondChoice('chat:selene:1' as SceneId, 'promise')).toBe(false);   // no bond scene
      expect(g.bondChoice('bond:selene:1', 'promise')).toBe(true);
      expect(talk()).toBe(3);                                         // her preferred tone
      expect(g.bondChoice('bond:selene:1', 'promise')).toBe(false);   // once
      expect(talk()).toBe(3);
      expect(g.sceneDone('bond:selene:1', 'played')).toBe(true);
      expect(g.bondChoice('bond:selene:1', 'ask')).toBe(false);       // done
      g.pending.push('bond:selene:2');
      expect(g.bondChoice('bond:selene:2', null)).toBe(true);         // skipped: 2
      expect(talk()).toBe(5);
      g.state.party.roster.selene.bond!.talk = 11;
      g.pending.push('bond:selene:3');
      expect(g.bondChoice('bond:selene:3', 'promise')).toBe(true);
      expect(talk()).toBe(12);                                        // the cap
    } finally { bondsBack(); }
  });
});

describe('a talk a day (bond plan Task 9)', () => {
  const ready = (storage = memoryStorage()) => {
    const g = new Game(calm(), storage, undefined, 0, ['hero', 'rin']);
    g.state.party.roster.rin.memories = 2;
    g.state.party.roster.rin.bond = { talk: 0, field: 10, gifts: {} };   // 10 + 6 + 10 = 26, 同行
    return g;
  };
  const registered = <T,>(f: () => T): T => { bondsAdd('rin'); try { return f(); } finally { bondsBack(); } };

  it('one talk a day', () => registered(() => {
    const g = ready();
    g.state.gold = 1000;
    expect(g.openBond('rin')).toBe('bond:rin:1');
    expect(g.pending).toContain('bond:rin:1');
    expect(g.bondChoice('bond:rin:1', 'stay')).toBe(true);
    expect(g.sceneDone('bond:rin:1', 'played')).toBe(true);
    expect(today(g.state).talked).toBe(true);
    g.state.party.roster.rin.memories = 4;
    g.state.party.roster.rin.bond!.field = 30;   // 10 + 12 + 3 + 30 = 55: 信賴, the 2nd is open
    expect(g.openBond('rin')).toBeNull();          // one a day
    expect(g.rest().ok).toBe(true);
    expect(g.openBond('rin')).toBe('bond:rin:2');  // a new day
    g.sceneDone('bond:rin:2', 'skipped');
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.openBond('rin')).toBeNull();          // not in the labyrinth
  }));

  it('a talk cut short counts nothing', () => registered(() => {
    const storage = memoryStorage();
    const g = ready(storage);
    expect(g.chooseTier('normal')).toEqual({ ok: true });   // the town saves
    expect(g.openBond('rin')).toBe('bond:rin:1');            // and the scene never ends
    const b = Game.boot(calm(), storage);
    expect(b.state.story.talked).toBeUndefined();
    expect(bondOf(b.state.party.roster.rin).talk).toBe(0);
    expect(b.openBond('rin')).toBe('bond:rin:1');
  }));
});

describe('the night walk and the romance (bond plan Task 10)', () => {
  /** In town after the finale and the festival, Liz at 心契 with her 4th bond scene seen; her romance registered. */
  const walk = (storage = memoryStorage()) => {
    const g = new Game(calm(), storage, undefined, 0, ['hero', 'rin']);
    const st = g.state;
    st.story.act1Cleared = true;
    st.story.finaleCleared = true;
    st.story.queue = [];
    st.story.seen.push('epilogue', 'bond:liz:1', 'bond:liz:2', 'bond:liz:3', 'bond:liz:4');   // in order (the save checks it)
    st.party = meet(st.party, 'liz', 1);
    st.party.roster.liz.memories = chainLength('liz');
    st.party.roster.liz.bond = { talk: 12, field: 40, gifts: { 'old-coin': 24 } };
    return g;
  };
  const registered = <T,>(f: () => T): T => {
    regAdd(ROMANCES_WRITTEN, 'liz');
    bondsAdd('liz');
    try { return f(); } finally { romancesBack(); bondsBack(); TOGETHER_WRITTEN.value = TOGETHER_BASE; }
  };

  it('the choice is for keeps', () => registered(() => {
    const storage = memoryStorage();
    const g = walk(storage);
    expect(g.walkOpen()).toBe(true);
    expect(g.chooseRomance('liz')).toEqual({ ok: true, id: 'romance:liz' });
    expect(g.state.story.romance).toBe('liz');
    expect(g.state.story.queue).toContain('romance:liz');
    expect(g.pending).toContain('romance:liz');
    expect(g.walkOpen()).toBe(false);
    expect(g.chooseRomance('liz')).toEqual({ ok: false, reason: 'chosen' });
    expect(g.state.story.romance).toBe('liz');
    const b = Game.boot(calm(), storage);
    expect(b.state.story.romance).toBe('liz');
    expect(b.chooseRomance('rin')).toEqual({ ok: false, reason: 'chosen' });
  }));

  it('together writes nothing', () => registered(() => {
    const g = walk();
    const before = JSON.stringify(g.state);
    expect(g.walkTogether()).toBe(true);
    expect(JSON.stringify(g.state)).toBe(before);
    expect(g.walkOpen()).toBe(false);
    expect(g.walkTogether()).toBe(false);   // asked already
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.returnToTown()).toBe(true);
    expect(g.walkOpen()).toBe(true);        // the next return asks again
  }));

  it('nobody eligible, no night walk', () => {
    const g = walk();
    ROMANCES_WRITTEN.splice(0);   // not registered (bond plan Task 21 registered all nine: none here)
    try {
      expect(g.walkOpen()).toBe(false);
      expect(g.chooseRomance('liz')).toEqual({ ok: false, reason: 'ineligible' });
    } finally { romancesBack(); }
    registered(() => {
      g.state.party.roster.liz.bond = { talk: 0, field: 0, gifts: {} };
      expect(g.walkOpen()).toBe(false);
      expect(g.depart(MAIN, 1)).toEqual({ ok: true });
      expect(g.walkOpen()).toBe(false);   // not in the labyrinth either
    });
  });

  it('a romance is a night scene', () => registered(() => {
    expect(sceneTime('romance:liz')).toBe('night');
    expect(sceneTime('ending:liz')).toBe('day');
  }));
});

describe('a romance cut short plays at night (bond plan Task 11)', () => {
  /** In town after the finale and the festival, Liz chosen and her romance never finished, the town saved. */
  const chosen = (storage = memoryStorage(), prep?: (g: Game) => void) => {
    const g = new Game(calm(), storage, undefined, 0, ['hero', 'rin']);
    const st = g.state;
    st.story.act1Cleared = true;
    st.story.finaleCleared = true;
    st.story.queue = [];
    st.story.seen.push('epilogue', 'bond:liz:1', 'bond:liz:2', 'bond:liz:3', 'bond:liz:4');   // in order (the save checks it)
    st.party = meet(st.party, 'liz', 1);
    st.party.roster.liz.memories = 1;
    st.party.roster.liz.bond = { talk: 12, field: 40, gifts: { 'old-coin': 24 } };   // 10 + 3 + 82 = 95
    st.party = meet(st.party, 'noel', 1);
    st.party = meet(st.party, 'selene', 1);   // a pair with a banter ready
    st.party.roster.noel.memories = 1;
    st.story.untold = ['mem:noel:1'];
    prep?.(g);
    expect(g.chooseRomance('liz')).toEqual({ ok: true, id: 'romance:liz' });   // saved; the walk never ends
    return g;
  };
  const registered = <T,>(f: () => T): T => {
    regAdd(ROMANCES_WRITTEN, 'liz');
    bondsAdd('liz');
    try { return f(); } finally { romancesBack(); bondsBack(); }
  };

  it('a romance cut short plays in the next night', () => registered(() => {
    const storage = memoryStorage();
    chosen(storage);
    const g = Game.boot(calm(), storage);
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.returnToTown()).toBe(true);
    expect(g.arrival).not.toContain('romance:liz');
    expect(g.night).toContain('romance:liz');
    expect(g.night[0]).toBe('romance:liz');                         // before any memory
    expect(g.night.some((id) => id.startsWith('mem:'))).toBe(false); // a romance night tells none
    expect(g.arrival.some((id) => id.startsWith('banter:'))).toBe(false);
    expect(g.sceneDone('romance:liz', 'played')).toBe(true);
    expect(g.state.story.queue).not.toContain('romance:liz');
  }));

  it('a reload in town keeps it in the night', () => registered(() => {
    const storage = memoryStorage();
    chosen(storage);
    const g = Game.boot(calm(), storage);
    expect(g.night).toContain('romance:liz');   // the town it was chosen in, read back
    expect(g.arrival).not.toContain('romance:liz');
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.returnToTown()).toBe(true);
    const b = Game.boot(calm(), storage);       // back in town, before it plays
    expect(b.night).toContain('romance:liz');
    expect(b.arrival).not.toContain('romance:liz');
  }));

  it('the spring festival comes before a romance on the same night', () => registered(() => {
    expect(SEASON_SCENES.spring).toBe('season:spring');
    const storage = memoryStorage();
    chosen(storage, (g) => {
      const st = g.state;
      st.party = meet(st.party, 'chizuru', 1);
      st.party.roster.chizuru.memories = chainLength('chizuru');
      for (let n = 1; n <= chainLength('chizuru'); n++) st.story.seen.push(memScene('chizuru', n));
      st.story.seen.push('home:chizuru');
      st.story.day = 20;
      st.story.springDay = 20;
    });
    const g = Game.boot(calm(), storage);
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(g.returnToTown()).toBe(true);
    expect(g.night).toEqual(['season:spring', 'romance:liz']);   // no memory
  }));
});

describe('one heart-to-heart at a time (bond review fix)', () => {
  it('opening a second talk while one is pending returns null', () => {
    bondsAdd('rin', 'selene');
    try {
      const g = new Game(calm(), memoryStorage(), undefined, 0, ['hero', 'rin']);
      g.state.party.roster.rin.memories = 2;
      g.state.party.roster.rin.bond = { talk: 0, field: 10, gifts: {} };    // 同行
      g.state.party = meet(g.state.party, 'selene', 1);
      g.state.party.roster.selene.memories = 1;
      g.state.story.seen.push('mem:selene:1');
      g.state.party.roster.selene.bond = { talk: 0, field: 7, gifts: {} };  // 20: 同行
      expect(g.openBond('rin')).toBe('bond:rin:1');
      expect(g.openBond('selene')).toBeNull();          // Rin's is still pending: one a day
      expect(g.pending.filter((id) => id.startsWith('bond:'))).toEqual(['bond:rin:1']);
      expect(g.openBond('rin')).toBeNull();             // nor the same one twice
      expect(g.sceneDone('bond:rin:1', 'played')).toBe(true);
      expect(g.openBond('selene')).toBeNull();          // and once done, today's talk is had
    } finally { bondsBack(); }
  });
});

describe('a tier gained on a dive (bond plan Task 14)', () => {
  it('a run that raised a tier says so', () => {
    const g = new Game(calm(), memoryStorage(), undefined, 0, HERO_LINEUP);
    g.state.dungeon.reached.mainline = 3;
    g.state.party.roster.chizuru.bond = { talk: 0, field: 9, gifts: {} };   // 19: one point from 同行
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    expect(downstairs(g, g.map().down!)).toMatchObject({ kind: 'floor', floor: 2 });
    g.state.inventory['return-lamp'] = 1;
    expect(g.useReturnLamp()).toBe(true);
    expect(g.bondUps).toEqual([{ id: 'chizuru', tier: 1 }]);   // and only her: the others are still 相識
  });

  it('a wipe keeps the news too', () => {
    const g = new Game(calm(), memoryStorage(), undefined, 0, HERO_LINEUP);
    g.state.dungeon.reached.mainline = 3;
    g.state.party.roster.selene.bond = { talk: 0, field: 9, gifts: {} };
    expect(g.depart(MAIN, 1)).toEqual({ ok: true });
    stepOnto(g, plantAt(g, 'elite'));
    for (const e of g.battle!.enemies) e.sleep = 9;
    for (const p of g.battle!.party) { p.hp = 0; p.alive = false; }
    g.submitRound({});
    expect(g.phase).toBe('town');
    expect(g.bondUps).toEqual([]);   // nothing earned: a wipe is no floor
    const h = new Game(calm(), memoryStorage(), undefined, 0, HERO_LINEUP);
    h.state.dungeon.reached.mainline = 3;
    h.state.party.roster.selene.bond = { talk: 0, field: 9, gifts: {} };
    expect(h.depart(MAIN, 1)).toEqual({ ok: true });
    stepOnto(h, plantAt(h, 'elite'));
    expect(killAll(h).outcome).toBe('win');   // +2: 21, 同行
    stepOnto(h, plantAt(h, 'elite'));
    for (const p of h.battle!.party) { p.hp = 0; p.alive = false; }
    h.submitRound({});
    expect(h.phase).toBe('town');
    expect(h.bondUps).toEqual([{ id: 'selene', tier: 1 }]);
  });
});

describe('foes that leave or join a fight (roster plan B1)', () => {
  /** An elite fight on floor 1 with runes open; `f` changes the fight first. The loot and rune draws its win took. */
  const fight = (seed: number, f?: (b: BattleState) => void) => {
    const g = inMap(1, mulberry32(seed));
    g.state.runesOpen = true;
    stepOnto(g, plantAt(g, 'elite'));
    const n = g.battle!.enemies.length;
    f?.(g.battle!);
    const at = { loot: g.run!.lootDraws, rune: g.run!.runeDraws };
    const end = killAll(g);
    return { end, n, loot: g.run!.lootDraws - at.loot, rune: g.run!.runeDraws - at.rune };
  };

  it('a summoned foe pays nothing and takes no loot or rune draw', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const plain = fight(seed);
      const more = fight(seed, (b) => {
        const c = meetEnemy(b, 'golem', { scale: { depth: 1, region: 'mainline', condition: 'plain' }, k: 1 });
        c.summoned = true;
      });
      expect(more.loot, String(seed)).toBe(plain.loot);
      expect(more.rune, String(seed)).toBe(plain.rune);
      expect(more.end.exp, String(seed)).toBe(plain.end.exp);
      expect(more.end.gold, String(seed)).toBe(plain.end.gold);
      expect(more.end.drops, String(seed)).toEqual(plain.end.drops);
      // One rune stream a fight; the summon draws nothing from it, so the same runes come.
      expect(more.end.runes, String(seed)).toEqual(plain.end.runes);
      expect(more.end.gear.map((it) => it.uid), String(seed)).toEqual(plain.end.gear.map((it) => it.uid));
    }
  });

  it('a foe that left pays nothing and takes no loot or rune draw', () => {
    let fights = 0;
    for (let seed = 1; seed <= 80 && fights < 6; seed++) {
      const plain = fight(seed);
      if (plain.n !== 2) continue;
      fights++;
      let gone = 0;
      const fled = fight(seed, (b) => { const e = b.enemies[1]; gone = b.enemyDefs![e.key].exp; e.alive = false; e.left = true; });
      expect(fled.loot, String(seed)).toBe(plain.loot - 1);
      // One rune stream a fight: the elite draws first, then the escort, who left and draws nothing.
      expect(fled.rune, String(seed)).toBe(plain.rune);
      expect(plain.end.runes?.slice(0, fled.end.runes?.length ?? 0) ?? [], String(seed)).toEqual(fled.end.runes ?? []);
      expect(fled.end.exp, String(seed)).toBeLessThan(plain.end.exp);
      expect(gone).toBeGreaterThan(0);
    }
    expect(fights).toBe(6);
  });
});

