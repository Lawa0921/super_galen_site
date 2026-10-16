// game.test.ts
import { describe, it, expect } from 'vitest';
import { DelveGame, type DelveEvent } from './game';
import { T, W, tileDef } from './tiles';
import { TILE_SIZE, CHUNK, FIXED_DT, REACH_TILES, DAY_LENGTH } from './constants';

const SMALL = { width: 160, height: 100 };

/** 在世界中造一塊測試場：清空 [x0,x0+40) × [0,floorY)，floorY 以下全石頭、無背牆；玩家站在 (px, floorY-1) */
function arena(seed = 'arena', px = 60, floorY = 60): DelveGame {
  const g = new DelveGame({ seed, ...SMALL });
  const w = g.world;
  for (let y = 0; y < w.height; y++) {
    for (let x = 30; x < 100; x++) {
      w.setFg(x, y, y >= floorY ? T.STONE : T.AIR);
      w.setWall(x, y, W.NONE);
    }
  }
  g.teleport(px, floorY - 1);
  for (let i = 0; i < 5; i++) g.step(FIXED_DT);
  g.drainEvents();
  return g;
}
function runFor(g: DelveGame, seconds: number): void {
  const n = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < n; i++) g.step(FIXED_DT);
}
function slotOf(g: DelveGame, item: string): number {
  return g.inventory.slots.findIndex((s) => s?.item === item);
}

describe('DelveGame 基本', () => {
  it('常數暴露', () => {
    expect(DelveGame.TILE_SIZE).toBe(TILE_SIZE);
    expect(DelveGame.CHUNK).toBe(CHUNK);
    expect(TILE_SIZE).toBe(16);
    expect(CHUNK).toBe(32);
  });
  it('出生後站在地面上；getState 為純 JSON', () => {
    const g = new DelveGame({ seed: 'basic', ...SMALL });
    runFor(g, 1);
    const s = g.getState();
    expect(s.player.onGround).toBe(true);
    expect(s.player.tileX).toBe(g.spawn.x);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(s.seed).toBe('basic');
    expect(s.inventory.find((x) => x?.item === 'torch')?.count).toBe(10);
  });
  it('同 seed + 同輸入 → 同狀態', () => {
    const a = new DelveGame({ seed: 'det', ...SMALL }), b = new DelveGame({ seed: 'det', ...SMALL });
    for (const g of [a, b]) { g.setMoveX(1); runFor(g, 0.5); g.setJump(true); runFor(g, 0.3); g.setJump(false); runFor(g, 1); }
    expect(a.getState()).toEqual(b.getState());
  });
  it('左右移動', () => {
    const g = arena();
    const x0 = g.player.x;
    g.setMoveX(1); runFor(g, 0.5);
    expect(g.player.x).toBeGreaterThan(x0 + 40);
    g.setMoveX(-1); runFor(g, 1);
    expect(g.player.x).toBeLessThan(x0);
  });
  it('drainEvents 取走後清空', () => {
    const g = arena();
    g.give('dirt', 1);
    g.mineInstant(60, 60);
    expect(g.drainEvents().length).toBeGreaterThan(0);
    expect(g.drainEvents()).toEqual([]);
  });
  it('時間前進、天空亮度隨日夜變化', () => {
    const g = arena();
    const t0 = g.getState().time;
    runFor(g, 2);
    expect(g.getState().time).toBeCloseTo(t0 + 2, 3);
    g.time = DAY_LENGTH * 0.5;
    expect(g.skyLevel()).toBeCloseTo(1, 5);
    g.time = 0;
    expect(g.skyLevel()).toBeLessThan(0.3);
  });
  it('computeLight 給出視窗光照', () => {
    const g = arena();
    g.time = DAY_LENGTH * 0.5;
    const m = g.computeLight({ x: 40, y: 20, w: 40, h: 30 });
    expect(m.get(60, 30)).toBeGreaterThan(0.9);
  });
});

describe('挖掘', () => {
  it('按住累積進度，時間 = 硬度 / 鎬速；掉落進背包', () => {
    const g = arena();
    g.setAim(61, 60); // 右腳下的石頭
    g.setMining(true);
    const need = tileDef(T.STONE).hardness / 1; // 木鎬 speed 1
    runFor(g, need * 0.5);
    expect(g.world.getFg(61, 60)).toBe(T.STONE);
    expect(g.getState().mining?.progress).toBeGreaterThan(0.3);
    runFor(g, need * 0.6);
    expect(g.world.getFg(61, 60)).toBe(T.AIR);
    expect(g.inventory.count('stone')).toBe(1);
    const ev = g.drainEvents().find((e) => e.type === 'mine') as Extract<DelveEvent, { type: 'mine' }>;
    expect(ev).toMatchObject({ x: 61, y: 60, tile: T.STONE, item: 'stone' });
  });
  it('放開按鍵或換目標會重置進度', () => {
    const g = arena();
    g.setAim(61, 60); g.setMining(true);
    runFor(g, 0.5);
    g.setMining(false); g.step(FIXED_DT);
    expect(g.getState().mining).toBeNull();
    g.setMining(true);
    runFor(g, 0.5);
    expect(g.world.getFg(61, 60)).toBe(T.STONE);
  });
  it('銅鎬比木鎬快', () => {
    const ticks = (withCopper: boolean): number => {
      const g = arena();
      if (withCopper) g.give('copper_pickaxe', 1);
      g.setAim(61, 60); g.setMining(true);
      let n = 0;
      while (g.world.getFg(61, 60) !== T.AIR && n < 1000) { g.step(FIXED_DT); n++; }
      return n;
    };
    const wood = ticks(false), copper = ticks(true);
    expect(copper).toBeLessThan(wood * 0.6);
  });
  it('超出觸及距離不挖', () => {
    const g = arena();
    g.setAim(60 + REACH_TILES + 3, 60);
    g.setMining(true);
    runFor(g, 3);
    expect(g.world.getFg(60 + REACH_TILES + 3, 60)).toBe(T.STONE);
    expect(g.drainEvents().some((e) => e.type === 'blocked' && e.reason === 'reach')).toBe(true);
  });
  it('canReach 判定', () => {
    const g = arena();
    expect(g.canReach(61, 60)).toBe(true);
    expect(g.canReach(60, 60 - 20)).toBe(false);
  });
  it('鐵礦需要銅鎬以上', () => {
    const g = arena();
    g.world.setFg(61, 60, T.IRON_ORE);
    g.setAim(61, 60); g.setMining(true);
    runFor(g, 5);
    expect(g.world.getFg(61, 60)).toBe(T.IRON_ORE);
    expect(g.drainEvents().some((e) => e.type === 'blocked' && e.reason === 'tier')).toBe(true);
    g.give('copper_pickaxe', 1);
    runFor(g, 2);
    expect(g.world.getFg(61, 60)).toBe(T.AIR);
    expect(g.inventory.count('iron_ore')).toBe(1);
  });
  it('砍樹幹會連同上方樹幹與樹葉一起倒，每段樹幹給 1 木材', () => {
    const g = arena();
    for (let y = 54; y < 60; y++) g.world.setFg(62, y, T.WOOD);
    g.world.setFg(62, 53, T.LEAVES); g.world.setFg(61, 53, T.LEAVES);
    g.setAim(62, 59); g.setMining(true);
    runFor(g, 2);
    for (let y = 53; y < 60; y++) expect(g.world.getFg(62, y)).toBe(T.AIR);
    expect(g.world.getFg(61, 53)).toBe(T.AIR);
    expect(g.inventory.count('wood')).toBe(6);
  });
  it('失去支撐的火把掉落進背包', () => {
    const g = arena();
    g.world.setFg(63, 59, T.STONE);
    g.world.setFg(64, 59, T.TORCH); // 靠著 (63,59) 與地面 (64,60)
    g.world.setFg(64, 60, T.AIR);
    const before = g.inventory.count('torch');
    g.mineInstant(63, 59);
    expect(g.world.getFg(64, 59)).toBe(T.AIR);
    expect(g.inventory.count('torch')).toBe(before + 1);
  });
  it('背包滿時無法挖掘（不吞道具）', () => {
    const g = arena();
    for (let i = 0; i < g.inventory.slots.length; i++) if (!g.inventory.slots[i]) g.inventory.slots[i] = { item: 'wood_pickaxe', count: 1 };
    g.setAim(61, 60); g.setMining(true);
    runFor(g, 3);
    expect(g.world.getFg(61, 60)).toBe(T.STONE);
    expect(g.drainEvents().some((e) => e.type === 'blocked' && e.reason === 'full')).toBe(true);
  });
});

describe('放置', () => {
  it('在鄰接實心的空格放置方塊、消耗 1 個', () => {
    const g = arena();
    g.give('dirt', 5);
    g.selectSlot(slotOf(g, 'dirt'));
    g.setAim(63, 59);
    g.setUse(true); g.step(FIXED_DT); g.setUse(false);
    expect(g.world.getFg(63, 59)).toBe(T.DIRT);
    expect(g.inventory.count('dirt')).toBe(4);
    expect(g.drainEvents().some((e) => e.type === 'place' && e.x === 63 && e.y === 59)).toBe(true);
  });
  it('不可把實心方塊放在玩家身上', () => {
    const g = arena();
    g.give('dirt', 5);
    g.selectSlot(slotOf(g, 'dirt'));
    g.setAim(60, 59);
    g.setUse(true); g.step(FIXED_DT);
    expect(g.world.getFg(60, 59)).toBe(T.AIR);
    expect(g.drainEvents().some((e) => e.type === 'blocked' && e.reason === 'body')).toBe(true);
  });
  it('懸空（無鄰接實心、無背牆）不可放；有背牆則可', () => {
    const g = arena();
    g.give('dirt', 5);
    g.selectSlot(slotOf(g, 'dirt'));
    g.setAim(63, 55);
    g.setUse(true); g.step(FIXED_DT); g.setUse(false); g.step(FIXED_DT);
    expect(g.world.getFg(63, 55)).toBe(T.AIR);
    expect(g.drainEvents().some((e) => e.type === 'blocked' && e.reason === 'support')).toBe(true);
    g.world.setWall(63, 55, W.DIRT_WALL);
    g.setUse(true); g.step(FIXED_DT);
    expect(g.world.getFg(63, 55)).toBe(T.DIRT);
  });
  it('不可放在已有方塊的格子、不可超出觸及', () => {
    const g = arena();
    g.give('dirt', 5);
    g.selectSlot(slotOf(g, 'dirt'));
    g.setAim(61, 60);
    g.setUse(true); g.step(FIXED_DT); g.setUse(false); g.step(FIXED_DT);
    expect(g.inventory.count('dirt')).toBe(5);
    g.setAim(60 + REACH_TILES + 3, 59);
    g.setUse(true); g.step(FIXED_DT);
    expect(g.world.getFg(60 + REACH_TILES + 3, 59)).toBe(T.AIR);
  });
  it('火把（非實心）可放在身體位置', () => {
    const g = arena();
    g.selectSlot(slotOf(g, 'torch'));
    g.setAim(60, 59);
    g.setUse(true); g.step(FIXED_DT);
    expect(g.world.getFg(60, 59)).toBe(T.TORCH);
    expect(g.inventory.count('torch')).toBe(9);
  });
  it('按住放置有冷卻，不會每 tick 放一格', () => {
    const g = arena();
    g.give('dirt', 50);
    g.selectSlot(slotOf(g, 'dirt'));
    g.setUse(true);
    for (let x = 62; x <= 65; x++) { g.setAim(x, 59); g.step(FIXED_DT); }
    expect(50 - g.inventory.count('dirt')).toBe(1);
  });
  it('手持鎬時 use 不放置', () => {
    const g = arena();
    g.selectSlot(slotOf(g, 'wood_pickaxe'));
    g.setAim(63, 59);
    g.setUse(true); g.step(FIXED_DT);
    expect(g.world.getFg(63, 59)).toBe(T.AIR);
  });
});

describe('合成（經由遊戲）', () => {
  it('徒手配方', () => {
    const g = arena();
    g.give('wood', 1);
    expect(g.craft('planks')).toEqual({ ok: true });
    expect(g.inventory.count('planks')).toBe(4);
    expect(g.drainEvents().some((e) => e.type === 'craft' && e.recipe === 'planks')).toBe(true);
  });
  it('銅鎬需在工作台 4 格內', () => {
    const g = arena();
    g.give('planks', 10); g.give('copper_ore', 16);
    expect(g.nearWorkbench()).toBe(false);
    expect(g.craft('copper_pickaxe')).toEqual({ ok: false, reason: 'station' });
    g.world.setFg(70, 59, T.WORKBENCH); // 太遠
    expect(g.nearWorkbench()).toBe(false);
    g.world.setFg(63, 59, T.WORKBENCH);
    expect(g.nearWorkbench()).toBe(true);
    expect(g.craft('copper_pickaxe')).toEqual({ ok: true });
    expect(g.inventory.count('copper_pickaxe')).toBe(1);
    expect(g.getState().nearWorkbench).toBe(true);
  });
});

describe('debug helpers', () => {
  it('give / mineInstant / teleport / selectSlot', () => {
    const g = arena();
    g.give('stone', 3);
    expect(g.inventory.count('stone')).toBe(3);
    g.mineInstant(61, 60);
    expect(g.world.getFg(61, 60)).toBe(T.AIR);
    expect(g.inventory.count('stone')).toBe(4);
    g.teleport(40, 59);
    expect(g.getState().player.tileX).toBe(40);
    g.selectSlot(3);
    expect(g.getState().selected).toBe(3);
  });
  it('mineInstant 會改到 modifiedChunks', () => {
    const g = new DelveGame({ seed: 'mod', ...SMALL });
    expect(g.world.modifiedChunks.size).toBe(0);
    g.mineInstant(g.spawn.x, g.spawn.y + 1);
    expect(g.world.modifiedChunks.size).toBe(1);
  });
});

/** 把背包塞滿 wood_pickaxe，只留 slot keep 給 stack */
function fillInv(g: DelveGame, keep: { item: 'wood' | 'stone' | 'torch'; count: number }[]): void {
  for (let i = 0; i < g.inventory.slots.length; i++) g.inventory.slots[i] = { item: 'wood_pickaxe', count: 1 };
  keep.forEach((k, i) => { g.inventory.slots[i] = { ...k }; });
}

describe('掉落物放不下時拒絕（不吞道具）', () => {
  it('砍樹：總木材放不下 → full 事件、樹保持原狀', () => {
    const g = arena();
    for (let y = 54; y < 60; y++) g.world.setFg(62, y, T.WOOD); // 6 段
    fillInv(g, [{ item: 'wood', count: 999 - 3 }]); // 只剩 3 格空間
    g.setAim(62, 59); g.setMining(true);
    runFor(g, 3);
    for (let y = 54; y < 60; y++) expect(g.world.getFg(62, y)).toBe(T.WOOD);
    expect(g.inventory.count('wood')).toBe(996);
    expect(g.drainEvents().some((e) => e.type === 'blocked' && e.reason === 'full')).toBe(true);
  });
  it('砍樹：剛好放得下就照常倒', () => {
    const g = arena();
    for (let y = 54; y < 60; y++) g.world.setFg(62, y, T.WOOD);
    fillInv(g, [{ item: 'wood', count: 999 - 6 }]);
    g.setAim(62, 59); g.setMining(true);
    runFor(g, 3);
    expect(g.world.getFg(62, 54)).toBe(T.AIR);
    expect(g.inventory.count('wood')).toBe(999);
  });
  it('失去支撐的火把放不下 → 整個動作拒絕', () => {
    const g = arena();
    g.world.setFg(63, 59, T.STONE);
    g.world.setFg(64, 59, T.TORCH);
    g.world.setFg(64, 60, T.AIR);
    fillInv(g, [{ item: 'stone', count: 5 }, { item: 'torch', count: 999 }]);
    expect(g.mineInstant(63, 59)).toBe(false);
    expect(g.world.getFg(63, 59)).toBe(T.STONE);
    expect(g.world.getFg(64, 59)).toBe(T.TORCH);
    expect(g.inventory.count('torch')).toBe(999);
    expect(g.drainEvents().some((e) => e.type === 'blocked' && e.reason === 'full')).toBe(true);
  });
});

describe('blocked 提示可重現', () => {
  const reachEvents = (g: DelveGame): number =>
    g.drainEvents().filter((e) => e.type === 'blocked' && e.reason === 'reach').length;
  it('同一格持續被擋只提示一次；換格再回來會再提示', () => {
    const g = arena();
    g.setMining(true);
    g.setAim(60 + REACH_TILES + 4, 60);
    runFor(g, 0.5);
    expect(reachEvents(g)).toBe(1);
    g.setAim(60 + REACH_TILES + 5, 60);
    runFor(g, 0.1);
    g.setAim(60 + REACH_TILES + 4, 60);
    runFor(g, 0.1);
    expect(reachEvents(g)).toBe(2);
  });
  it('同一格按住超過冷卻時間會再提示一次', () => {
    const g = arena();
    g.setMining(true);
    g.setAim(60 + REACH_TILES + 4, 60);
    runFor(g, 0.5);
    expect(reachEvents(g)).toBe(1);
    runFor(g, 2);
    expect(reachEvents(g)).toBeGreaterThanOrEqual(1);
  });
});

describe('地表高度（深度顯示用）', () => {
  it('world.surfaceAt 給出每欄生成時的地表高度，且各欄不同', () => {
    const g = new DelveGame({ seed: 'surf', ...SMALL });
    const w = g.world;
    const sp = g.spawn;
    expect(w.surfaceAt(sp.x)).toBe(sp.y + 1);
    const set = new Set<number>();
    for (let x = 0; x < w.width; x++) set.add(w.surfaceAt(x));
    expect(set.size).toBeGreaterThan(1);
    expect(w.cavernY).toBeGreaterThan(w.surfaceAt(sp.x));
    // 挖洞不改變地表高度
    g.mineInstant(sp.x, sp.y + 1);
    expect(w.surfaceAt(sp.x)).toBe(sp.y + 1);
  });
  it('feetTile：站在地表時腳底格 = 地表 - 1', () => {
    const g = new DelveGame({ seed: 'surf', ...SMALL });
    expect(g.feetTile()).toEqual({ x: g.spawn.x, y: g.spawn.y });
  });
});
