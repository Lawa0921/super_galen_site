// game.settle.test.ts — 據點接上遊戲：放爐心、雙格家具、重生點、安心回血、合成站聯動、共享儲物、
// 居民商店 / 鍛冶師折扣、建築木槌（半格）、存檔來回。
import { describe, expect, it } from 'vitest';
import { DelveGame } from './game';
import { T, W } from './tiles';
import { FIXED_DT, TILE_SIZE as S } from './constants';
import type { ItemId } from './items';
import { buildHouse } from './houseFixture';
import { restoreGame, serializeGame } from '../save/serialize';
import { NPCS, shopPrice } from './npcs';
import { CALM_REGEN } from './settlement';

const SMALL = { width: 200, height: 100 };
const GROUND = 60;

function arena(seed = 'settle'): DelveGame {
  const g = new DelveGame({ seed, ...SMALL, peaceful: true });
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) { w.setFg(x, y, y >= GROUND ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); w.setLiquid(x, y, 0, 0); }
  g.teleport(60, GROUND - 1);
  g.setDate({ hour: 12 });
  for (let i = 0; i < 5; i++) g.step(FIXED_DT);
  g.drainEvents();
  return g;
}
function hold(g: DelveGame, item: ItemId, n = 1): void {
  g.give(item, n);
  const i = g.inventory.slots.findIndex((s) => s?.item === item);
  g.inventory.swap(i, 0);
  g.selectSlot(0);
}
function place(g: DelveGame, item: ItemId, x: number, y: number): boolean { hold(g, item); return g.tryPlace(x, y); }
/** 爐心放在 (60, GROUND-1)，房子在左邊（內部 50..57 × 54..58） */
function village(g: DelveGame, rooms = 1): void {
  for (let k = 0; k < rooms; k++) buildHouse(g.world, 50 - k * 9, GROUND - 6, 8, 5);
  expect(place(g, 'hearth', 60, GROUND - 1)).toBe(true);
}
function steps(g: DelveGame, n: number): void { for (let i = 0; i < n; i++) g.step(FIXED_DT); }

describe('hearth & claim', () => {
  it('placing a hearth founds a settlement; overlapping claims are blocked', () => {
    const g = arena();
    expect(place(g, 'hearth', 60, GROUND - 1)).toBe(true);
    expect(g.settle.cores.length).toBe(1);
    expect(g.drainEvents()).toContainEqual(expect.objectContaining({ type: 'settlement', phase: 'found' }));
    g.teleport(64, GROUND - 1);
    expect(place(g, 'hearth', 66, GROUND - 1)).toBe(false);
    expect(g.drainEvents()).toContainEqual(expect.objectContaining({ type: 'blocked', reason: 'claim' }));
  });
  it('using the hearth opens the settlement panel; mining it disbands', () => {
    const g = arena();
    village(g);
    expect(g.interact(60, GROUND - 1)).toBe(true);
    expect(g.drainEvents()).toContainEqual(expect.objectContaining({ type: 'hearth', id: g.settle.cores[0].id }));
    g.mineInstant(60, GROUND - 1);
    expect(g.settle.cores).toEqual([]);
    expect(g.inventory.count('hearth')).toBe(1);
  });
});

describe('pair furniture', () => {
  it('sofa / fireplace take two tiles and drop one item', () => {
    const g = arena();
    expect(place(g, 'sofa', 62, GROUND - 1)).toBe(true);
    expect([g.world.getFg(62, GROUND - 1), g.world.getFg(63, GROUND - 1)]).toEqual([T.SOFA_L, T.SOFA_R]);
    expect(place(g, 'fireplace', 65, GROUND - 1)).toBe(true);
    const before = g.inventory.count('sofa');
    g.mineInstant(63, GROUND - 1);
    expect(g.world.getFg(62, GROUND - 1)).toBe(T.AIR);
    expect(g.inventory.count('sofa')).toBe(before + 1);
  });
});

describe('perks', () => {
  it('Lv1: hearth spawn point', () => {
    const g = arena();
    village(g);
    const id = g.settle.cores[0].id;
    expect(g.setSpawnCore(id)).toBe(true);
    expect(g.respawnPoint()).toEqual({ x: 61, y: GROUND - 1 });
  });
  it('Lv1: calm regen inside the claim', () => {
    const g = arena();
    village(g);
    steps(g, 2);
    expect(g.calm()).toBe(true);
    g.hp = 50;
    (g as unknown as { sinceHit: number }).sinceHit = 0;
    steps(g, 60);
    const inside = g.hp - 50;
    const g2 = arena();
    g2.hp = 50;
    (g2 as unknown as { sinceHit: number }).sinceHit = 0;
    steps(g2, 60);
    expect(inside - (g2.hp - 50)).toBeCloseTo(CALM_REGEN, 0);
  });
  it('Lv2: stations anywhere in the claim work together', () => {
    const g = arena();
    village(g, 2);
    buildHouse(g.world, 32, GROUND - 6, 8, 5, { extra: [[5, 4, T.CHEST], [6, 0, T.CHANDELIER], [6, 1, T.PAINTING], [5, 1, T.SHELF]] });
    g.world.setFg(48, GROUND - 2, T.PAINTING);
    g.world.setFg(90, GROUND - 1, T.ANVIL);
    g.settle.refresh(g.world, true);
    expect(g.settlementHere()?.level).toBeGreaterThanOrEqual(2);
    expect(g.stations().anvil).toBe(true);
    g.teleport(150, GROUND - 1);
    expect(g.stations().anvil).toBe(false);
  });
  it('Lv3: shared storage lets crafting use chest contents', () => {
    const g = arena();
    // 三間有裝飾的房間 → Lv3
    buildHouse(g.world, 50, GROUND - 6, 8, 5, { extra: [[5, 4, T.CHEST], [6, 2, T.PAINTING], [2, 0, T.CHANDELIER]] });
    buildHouse(g.world, 41, GROUND - 6, 8, 5, { extra: [[5, 4, T.BOOKSHELF], [6, 1, T.SHELF], [2, 0, T.CHANDELIER]] });
    buildHouse(g.world, 32, GROUND - 6, 8, 5, { extra: [[5, 4, T.POTTED_PLANT], [6, 4, T.RUG], [6, 1, T.BANNER]] });
    buildHouse(g.world, 23, GROUND - 6, 8, 5, { extra: [[5, 4, T.SOFA_L], [6, 4, T.SOFA_R], [6, 1, T.PAINTING]] });
    expect(place(g, 'hearth', 60, GROUND - 1)).toBe(true);
    g.world.setFg(61, GROUND - 1, T.WORKBENCH);
    g.settle.refresh(g.world, true);
    expect(g.settlementHere()?.level).toBe(3);
    const chest = g.world.chests.get(g.world.idx(55, GROUND - 2))!;
    chest[0] = { item: 'planks', count: 20 };
    expect(g.inventory.count('planks')).toBe(0);
    expect(g.storageCount('planks')).toBe(20);
    expect(g.craft('table').ok).toBe(true);
    expect(chest[0]?.count).toBe(12);
    expect(g.inventory.count('table')).toBe(1);
  });
});

describe('settlers in the game', () => {
  it('a merchant moves in during the day and sells for coins', () => {
    const g = arena();
    village(g);
    steps(g, 60 * 7);
    expect(g.settle.npc('merchant')).not.toBeNull();
    g.give('copper_coin', 200);
    const price = shopPrice(NPCS.merchant.shop[0].price, g.settle.npc('merchant')!.mood);
    expect(g.buy('merchant', 0)).toBe(true);
    expect(g.coins()).toBe(200 - price);
    expect(g.inventory.count('torch')).toBeGreaterThanOrEqual(10);
    g.give('gel', 10);
    expect(g.sell('merchant', 'gel', 10)).toBe(true);
    expect(g.inventory.count('gel')).toBe(0);
    g.inventory.remove('copper_coin', g.inventory.count('copper_coin'));
    g.inventory.remove('silver_coin', g.inventory.count('silver_coin'));
    expect(g.buy('merchant', 0)).toBe(false);
  });
  it('talking to a settler yields a zh line', () => {
    const g = arena();
    village(g);
    g.debugMoveIn('merchant');
    const n = g.settle.npc('merchant')!;
    g.teleport(Math.floor(n.body.x / S) + 2, GROUND - 1);
    g.setAimWorld(n.body.x + n.body.w / 2, n.body.y + n.body.h / 2);
    g.setUse(true); g.step(FIXED_DT); g.setUse(false);
    const talk = g.drainEvents().find((e) => e.type === 'talk');
    expect(talk).toBeDefined();
    expect((talk as { line: string }).line).toMatch(/[一-鿿]/);
  });
  it('the smith discounts forging and works as an anvil', () => {
    const g = arena();
    village(g, 2);
    g.world.setFg(62, GROUND - 1, T.FURNACE);
    g.settle.refresh(g.world, true);
    g.giveGear('iron_sword', 1);
    const at = g.inventory.slots.findIndex((s) => s?.item === 'iron_sword');
    const full = g.forgeCosts(at).upgrade!;
    expect(g.debugMoveIn('smith')).toBe(true);
    g.settle.npc('smith')!.mood = 100;
    const cut = g.forgeCosts(at).upgrade!;
    expect(cut.shard).toBeLessThan(full.shard);
    const n = g.settle.npc('smith')!;
    g.teleport(Math.floor(n.body.x / S), GROUND - 1);
    expect(g.canForge()).toBe(true);
  });
});

describe('builder hammer', () => {
  it('toggles a block between full and half; the player stands on the half', () => {
    const g = arena();
    g.world.setFg(62, GROUND - 1, T.STONE);
    hold(g, 'builder_hammer');
    g.setAim(62, GROUND - 1);
    g.setUse(true); g.step(FIXED_DT); g.setUse(false); g.step(FIXED_DT);
    expect(g.world.isHalf(62, GROUND - 1)).toBe(true);
    g.teleport(62, GROUND - 3);
    steps(g, 60);
    expect(g.player.y + g.player.h).toBeCloseTo((GROUND - 1) * S + S / 2, 1);
    // 走過去：半格當階梯，不用跳
    g.teleport(58, GROUND - 1);
    g.setMoveX(1);
    steps(g, 40);
    g.setMoveX(0);
    expect(g.player.x).toBeGreaterThan(62 * S);
  });
});

describe('save round-trip', () => {
  it('keeps hearths, settlers, the spawn hearth and half blocks', () => {
    const g = arena();
    village(g);
    g.debugMoveIn('merchant');
    g.setSpawnCore(g.settle.cores[0].id);
    g.world.setFg(70, GROUND - 1, T.STONE);
    g.world.setHalf(70, GROUND - 1, true);
    const r = restoreGame(serializeGame(g));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const h = r.game;
    expect(h.settle.cores.map((c) => [c.x, c.y])).toEqual([[60, GROUND - 1]]);
    expect(h.settle.npcs.map((n) => n.kind)).toEqual(['merchant']);
    expect(h.settle.npc('merchant')!.home).toBe(g.settle.npc('merchant')!.home);
    expect(h.respawnPoint()).toEqual({ x: 61, y: GROUND - 1 });
    expect(h.world.isHalf(70, GROUND - 1)).toBe(true);
    expect(h.settlementHere()?.level).toBe(1);
  });
});

describe('safe arrival spots', () => {
  it('hearth respawn never puts the player inside blocks; boxed-in hearth falls back to the world spawn', () => {
    const g = arena();
    village(g);
    const id = g.settle.cores[0].id;
    g.setSpawnCore(id);
    // 爐心右邊堆滿方塊：重生點換到附近的空位
    for (let y = GROUND - 4; y < GROUND; y++) for (let x = 61; x <= 63; x++) g.world.setFg(x, y, T.STONE);
    const r = g.respawnPoint();
    const free = (x: number, y: number): boolean => [-1, 0, 1].every((dx) => [0, 1, 2].every((k) => !g.world.isSolid(x + dx, y - k)));
    expect(free(r.x, r.y)).toBe(true);
    expect(g.world.isSolid(r.x, r.y + 1)).toBe(true);
    // 整圈封死 → 回到出生點
    for (let y = GROUND - 12; y < GROUND; y++) for (let x = 48; x <= 72; x++) if (!(x === 60 && y === GROUND - 1)) g.world.setFg(x, y, T.STONE);
    expect(g.respawnPoint()).toEqual({ x: g.spawn.x, y: g.spawn.y });
  });
  it('fast travel lands on a free spot next to the destination hearth, or refuses when it is sealed', () => {
    const g = new DelveGame({ seed: 'travel', width: 400, height: 100, peaceful: true });
    const w = g.world;
    g.liquids.setSprings([]);
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) { w.setFg(x, y, y >= GROUND ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); w.setLiquid(x, y, 0, 0); }
    const decos: [number, number, number][][] = [
      [[5, 4, T.CHEST], [6, 2, T.PAINTING], [2, 0, T.CHANDELIER]],
      [[5, 4, T.BOOKSHELF], [6, 1, T.SHELF], [2, 0, T.CHANDELIER]],
      [[5, 4, T.POTTED_PLANT], [6, 4, T.RUG], [6, 1, T.BANNER]],
      [[5, 4, T.SOFA_L], [6, 4, T.SOFA_R], [6, 1, T.PAINTING]],
    ];
    for (const base of [20, 250]) {
      decos.forEach((extra, k) => buildHouse(w, base + k * 9, GROUND - 6, 8, 5, { extra }));
      w.setFg(base + 40, GROUND - 1, T.HEARTH);
      g.settle.found(base + 40, GROUND - 1);
    }
    g.settle.refresh(w, true);
    const [a, b] = g.settle.cores;
    expect(g.waypoints().map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    g.teleport(a.x - 2, a.y);
    // 目的地爐心右邊被堵住
    for (let y = GROUND - 3; y < GROUND; y++) w.setFg(b.x + 1, y, T.STONE);
    expect(g.travel(b.id)).toBe(true);
    const t = g.feetTile();
    expect([-1, 0, 1].every((dx) => [0, 1, 2].every((k) => !w.isSolid(t.x + dx, t.y - k)))).toBe(true);
    expect(Math.abs(t.x - b.x)).toBeLessThanOrEqual(8);
    // 回去 a，把 b 整個封死 → 傳不過去，玩家不動
    g.teleport(a.x - 2, a.y);
    for (let y = GROUND - 12; y < GROUND; y++) for (let x = b.x - 10; x <= b.x + 10; x++) if (!(x === b.x && y === b.y)) w.setFg(x, y, T.STONE);
    g.drainEvents();
    expect(g.travel(b.id)).toBe(false);
    expect(g.drainEvents()).toContainEqual(expect.objectContaining({ type: 'blocked', reason: 'blockedspot' }));
    expect(g.feetTile().x).toBe(a.x - 2);
  });
});
