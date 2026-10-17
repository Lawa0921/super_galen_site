// game.tools.test.ts — 探索工具：繩索（往下延伸、攀爬、支撐）、床（重生點）、傳送石（引導後傳送）、飾品效果、配方、導航資訊
import { describe, it, expect } from 'vitest';
import { DelveGame, type DelveEvent } from './game';
import { T, W } from './tiles';
import { FIXED_DT, REACH_TILES, TILE_SIZE as S } from './constants';
import { findRecipe } from './crafting';

const SMALL = { width: 160, height: 100 };

/** 測試場：x 30..100 清空，floorY 以下石頭；玩家站在 (px, floorY-1) */
function arena(px = 60, floorY = 60): DelveGame {
  const g = new DelveGame({ seed: 'tools', ...SMALL });
  const w = g.world;
  for (let y = 0; y < w.height; y++) for (let x = 30; x < 100; x++) { w.setFg(x, y, y >= floorY ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  g.teleport(px, floorY - 1);
  run(g, 0.1);
  g.drainEvents();
  return g;
}
function run(g: DelveGame, seconds: number): void {
  for (let i = 0, n = Math.round(seconds / FIXED_DT); i < n; i++) g.step(FIXED_DT);
}
function hold(g: DelveGame, item: Parameters<DelveGame['give']>[0]): void {
  g.give(item, item === 'rope' ? 50 : 1);
  const i = g.inventory.slots.findIndex((s) => s?.item === item);
  g.inventory.swap(i, 0);
  g.selectSlot(0);
}
const use = (g: DelveGame, x: number, y: number, t = 0.05): void => { g.setAim(x, y); g.setUse(true); run(g, t); g.setUse(false); run(g, 1 / 60); };

describe('繩索', () => {
  it('掛在天花板下 → 再點繩索會往下延伸（接在最下面）；沒有支撐的地方放不下', () => {
    const g = arena();
    const w = g.world;
    for (let x = 58; x <= 66; x++) w.setFg(x, 52, T.STONE); // 天花板（第 52 列）
    hold(g, 'rope');
    use(g, 62, 53);
    expect(w.getFg(62, 53)).toBe(T.ROPE);
    use(g, 62, 53);
    expect(w.getFg(62, 54)).toBe(T.ROPE);
    use(g, 62, 53);
    expect(w.getFg(62, 55)).toBe(T.ROPE);
    expect(g.inventory.count('rope')).toBe(47);
    // 半空中（上面空氣、兩側空氣）放不下
    const before = g.inventory.count('rope');
    use(g, 57, 56);
    expect(w.getFg(57, 56)).toBe(T.AIR);
    expect(g.inventory.count('rope')).toBe(before);
  });
  it('按住使用 → 連續往下放成一條（不超過地面）', () => {
    const g = arena();
    for (let x = 58; x <= 66; x++) g.world.setFg(x, 52, T.STONE);
    hold(g, 'rope');
    g.setAim(63, 53); g.setUse(true); run(g, 2); g.setUse(false);
    let n = 0;
    for (let y = 53; y < 60; y++) if (g.world.getFg(63, y) === T.ROPE) n++;
    expect(n).toBe(7); // 53..59，碰到地板（60）停
  });
  it('挖掉最上面那格：下面整條失去支撐一起收回背包', () => {
    const g = arena();
    for (let x = 58; x <= 66; x++) g.world.setFg(x, 52, T.STONE);
    hold(g, 'rope');
    for (let k = 0; k < 4; k++) use(g, 62, 53);
    const c = g.inventory.count('rope');
    g.mineInstant(62, 53);
    for (let y = 53; y < 57; y++) expect(g.world.getFg(62, y)).toBe(T.AIR);
    expect(g.inventory.count('rope')).toBe(c + 4);
  });
  it('玩家抓繩往上爬（setUp）', () => {
    const g = arena(62);
    for (let y = 40; y < 60; y++) g.world.setFg(62, y, T.ROPE);
    for (let x = 58; x <= 66; x++) g.world.setFg(x, 39, T.STONE);
    const y0 = g.player.y;
    g.setUp(true); run(g, 0.8); g.setUp(false);
    expect(g.player.y).toBeLessThan(y0 - 4 * S);
    expect(g.getState().player.climbing).toBe(true);
  });
});

describe('床與重生點', () => {
  it('床佔兩格（床頭 + 床尾）；互動設定重生點；挖掉任一半整張收回、重生點回到出生點', () => {
    const g = arena(60);
    hold(g, 'bed');
    use(g, 63, 59);
    const w = g.world;
    expect(w.getFg(63, 59)).toBe(T.BED_HEAD);
    expect(w.getFg(64, 59)).toBe(T.BED_FOOT);
    expect(g.respawnPoint()).toEqual(g.spawn);
    use(g, 64, 59);
    const ev = g.drainEvents().find((e) => e.type === 'spawn') as Extract<DelveEvent, { type: 'spawn' }> | undefined;
    expect(ev?.set).toBe(true);
    expect(g.bed).toEqual({ x: 63, y: 59 });
    expect(g.respawnPoint()).toEqual({ x: 63, y: 59 });
    g.mineInstant(64, 59);
    expect(w.getFg(63, 59)).toBe(T.AIR);
    expect(w.getFg(64, 59)).toBe(T.AIR);
    expect(g.inventory.count('bed')).toBe(1);
    expect(g.respawnPoint()).toEqual(g.spawn);
  });
  it('右邊沒空間 / 沒地板放不下', () => {
    const g = arena(60);
    hold(g, 'bed');
    g.world.setFg(64, 59, T.STONE);
    use(g, 63, 59);
    expect(g.world.getFg(63, 59)).toBe(T.AIR);
    expect(g.inventory.count('bed')).toBe(1);
  });
});

describe('傳送石', () => {
  it('手持使用 → 引導約 1.2 秒後傳送回重生點（床），不消耗', () => {
    const g = arena(43);
    hold(g, 'bed');
    use(g, 40, 59);
    use(g, 40, 59);
    expect(g.bed).toEqual({ x: 40, y: 59 });
    g.teleport(90, 59); run(g, 0.1);
    hold(g, 'recall_stone');
    g.setAim(91, 55); g.setUse(true); run(g, 0.5);
    expect(g.getState().recall).toBeGreaterThan(0.2);
    expect(g.playerTile().x).toBe(90);
    run(g, 1); g.setUse(false);
    expect(g.playerTile().x).toBe(40);
    expect(g.inventory.count('recall_stone')).toBe(1);
    expect(g.drainEvents().some((e) => e.type === 'recall' && e.phase === 'done')).toBe(true);
  });
  it('引導中移動 → 取消', () => {
    const g = arena(60);
    hold(g, 'recall_stone');
    g.setAim(61, 55); g.setUse(true); run(g, 0.4);
    g.setMoveX(1); run(g, 0.2); g.setMoveX(0);
    g.setUse(false); run(g, 1.5);
    expect(g.getState().recall).toBe(0);
    expect(g.drainEvents().some((e) => e.type === 'recall' && e.phase === 'cancel')).toBe(true);
    expect(g.playerTile().x).not.toBe(g.spawn.x);
  });
});

describe('飾品（裝在飾品槽才生效）', () => {
  it('疾行靴：跑得更快；跳躍靴：跳得更高', () => {
    const dist = (boots: boolean): number => { const g = arena(40); if (boots) g.equip('swift_boots'); g.setMoveX(1); run(g, 0.8); return g.player.x; };
    expect(dist(true) - dist(false)).toBeGreaterThan(40);
    const peak = (boots: boolean): number => {
      const g = arena(60); if (boots) g.equip('jump_boots');
      const y0 = g.player.y; let min = y0;
      g.setJump(true);
      for (let i = 0; i < 60; i++) { g.step(FIXED_DT); min = Math.min(min, g.player.y); }
      return y0 - min;
    };
    expect(peak(true)).toBeGreaterThan(peak(false) * 1.3);
  });
  it('夜視護符：身邊多一圈光；磁石：伸手距離 +3 格', () => {
    const g = arena(60);
    const v0 = Math.max(...g.heldLights().map((l) => l.v));
    g.equip('night_amulet');
    expect(Math.max(...g.heldLights().map((l) => l.v))).toBeGreaterThan(v0 + 0.3);
    const far = REACH_TILES + 2;
    const t = g.playerTile();
    expect(g.canReach(t.x + far, t.y)).toBe(false);
    g.equip('magnet');
    expect(g.canReach(t.x + far, t.y)).toBe(true);
  });
  it('指南針 / 深度計：navInfo 只在持有時提供東西座標 / 深度', () => {
    const g = arena(60);
    expect(g.navInfo()).toEqual({ east: null, depth: null });
    g.give('compass'); g.give('depth_meter');
    const n = g.navInfo();
    expect(n.east).toBe(g.feetTile().x - g.spawn.x);
    expect(typeof n.depth).toBe('number');
  });
});

describe('配方', () => {
  it('繩索、床、傳送石、指南針、深度計都做得出來', () => {
    for (const id of ['rope', 'bed', 'recall_stone', 'compass', 'depth_meter']) {
      const r = findRecipe(id);
      expect(r, id).toBeTruthy();
      const g = arena(60);
      g.world.setFg(61, 59, T.WORKBENCH);
      for (const a of r!.inputs) g.give(a.item, a.n);
      expect(g.craft(id).ok, id).toBe(true);
      expect(g.inventory.count(r!.out.item)).toBeGreaterThanOrEqual(r!.out.n);
    }
  });
});
