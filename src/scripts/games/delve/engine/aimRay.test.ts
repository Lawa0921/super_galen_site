// aimRay.test.ts — 方向挖掘：游標那格挖不到時，從玩家中心朝游標點打射線，挖觸及範圍內碰到的第一個挖得動的方塊。
import { describe, it, expect } from 'vitest';
import { DelveGame, type DelveEvent } from './game';
import { T, W, tileDef } from './tiles';
import { TILE_SIZE as S, FIXED_DT } from './constants';
import { marchTiles } from './aimRay';
import { coopRig, FRAME, FLOOR, type Rig } from '../net/testRig';

/** 測試場（同 game.test.ts）：x ∈ [30,100) 清空、y ≥ 60 石頭、無背牆；玩家站在 (60, 59)，中心在 (60.5, 58.69) 格 */
function arena(): DelveGame {
  const g = new DelveGame({ seed: 'arena', width: 160, height: 100 });
  const w = g.world;
  for (let y = 0; y < w.height; y++) {
    for (let x = 30; x < 100; x++) { w.setFg(x, y, y >= 60 ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  }
  g.teleport(60, 59);
  for (let i = 0; i < 5; i++) g.step(FIXED_DT);
  g.drainEvents();
  return g;
}
function runFor(g: DelveGame, seconds: number): void {
  const n = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < n; i++) g.step(FIXED_DT);
}
/** 游標放在 tile (tx, ty) 的中心 */
const aimAt = (g: DelveGame, tx: number, ty: number): void => g.setAimWorld((tx + 0.5) * S, (ty + 0.5) * S);
const mines = (g: DelveGame): Extract<DelveEvent, { type: 'mine' }>[] =>
  g.drainEvents().filter((e): e is Extract<DelveEvent, { type: 'mine' }> => e.type === 'mine');
const STONE_S = tileDef(T.STONE).hardness / 1 + 0.2; // 木鎬挖一塊石頭的時間 + 一點餘裕

describe('marchTiles（格子射線）', () => {
  const walk = (ox: number, oy: number, dx: number, dy: number, maxT: number): string[] => {
    const out: string[] = [];
    marchTiles(ox, oy, dx, dy, maxT, (x, y) => { out.push(`${x},${y}`); return false; });
    return out;
  };
  it('水平 / 垂直：逐格、到 maxT 為止（含起點那格）', () => {
    expect(walk(0.5, 0.5, 1, 0, 3)).toEqual(['0,0', '1,0', '2,0', '3,0']);
    expect(walk(0.5, 0.5, 0, -1, 2)).toEqual(['0,0', '0,-1', '0,-2']);
  });
  it('斜線：不跳格（每一步只換一個軸，除了正好穿過格角）', () => {
    const t = walk(0.5, 0.3, 1, 0.45, 6);
    for (let i = 1; i < t.length; i++) {
      const [ax, ay] = t[i - 1].split(',').map(Number), [bx, by] = t[i].split(',').map(Number);
      expect(Math.abs(bx - ax) + Math.abs(by - ay)).toBe(1);
    }
  });
  it('正好穿過格角：兩個側鄰格都走到（先水平、後垂直），再到對角那格', () => {
    expect(walk(0.5, 0.5, 1, 1, 1.5)).toEqual(['0,0', '1,0', '0,1', '1,1']);
    expect(walk(0.5, 0.5, -1, -1, 1.5)).toEqual(['0,0', '-1,0', '0,-1', '-1,-1']);
  });
  it('visit 回傳 true 就停；零向量不走', () => {
    const out: string[] = [];
    marchTiles(0.5, 0.5, 1, 0, 10, (x, y) => { out.push(`${x},${y}`); return x === 2; });
    expect(out).toEqual(['0,0', '1,0', '2,0']);
    expect(walk(0.5, 0.5, 0, 0, 10)).toEqual([]);
  });
});

describe('方向挖掘', () => {
  it('游標正好在觸及範圍內的方塊上 → 挖那格（跟以前一樣，就算射線上更近處有別的方塊）', () => {
    const g = arena();
    g.world.setFg(62, 58, T.STONE);
    g.world.setFg(64, 58, T.STONE);
    aimAt(g, 64, 58); g.setMining(true);
    runFor(g, STONE_S);
    expect(g.world.getFg(64, 58)).toBe(T.AIR);
    expect(g.world.getFg(62, 58)).toBe(T.STONE);
  });

  it('游標在方塊後面的空氣（觸及範圍內）→ 挖射線碰到的那塊', () => {
    const g = arena();
    g.world.setFg(63, 58, T.STONE);
    aimAt(g, 65, 58); g.setMining(true);
    g.step(FIXED_DT);
    expect(g.getState().mining).toMatchObject({ x: 63, y: 58 });
    runFor(g, STONE_S);
    expect(g.world.getFg(63, 58)).toBe(T.AIR);
    expect(mines(g).map((e) => [e.x, e.y])).toEqual([[63, 58]]);
  });

  it('游標遠超過觸及距離、方向對 → 挖射線上觸及範圍內最近的那塊', () => {
    const g = arena();
    g.world.setFg(64, 58, T.STONE);
    g.world.setFg(65, 58, T.STONE);
    aimAt(g, 90, 58); g.setMining(true);
    runFor(g, STONE_S);
    expect(g.world.getFg(64, 58)).toBe(T.AIR);
    expect(g.world.getFg(65, 58)).toBe(T.STONE);
    // 朝斜下指向遠處的地面：挖到觸及範圍內的地面那格
    const h = arena();
    const c = h.playerCenter();
    h.setAimWorld(c.x + 3 * S * 4, c.y + 3 * S * 1.6); // 方向 (4, 1.6)：穿過 y = 60 的地面
    h.setMining(true);
    runFor(h, STONE_S);
    const ev = mines(h);
    expect(ev.length).toBe(1);
    expect(ev[0].y).toBe(60);
    expect(h.canReach(ev[0].x, ev[0].y)).toBe(true);
  });

  it('斜線正好穿過兩塊對角相接的方塊中間的格角 → 不鑽過去：先挖水平側的那塊', () => {
    const g = arena();
    const c = g.playerCenter();
    // 玩家中心 (60.5, 58.69)；格角 K = (62, 57)：(62,57) 與 (61,56) 在 K 對角相接，(62,56) 在縫的另一邊
    const K = { x: 62 * S, y: 57 * S };
    g.world.setFg(62, 57, T.STONE);
    g.world.setFg(61, 56, T.STONE);
    g.world.setFg(62, 56, T.STONE);
    g.setAimWorld(c.x + (K.x - c.x) * 3, c.y + (K.y - c.y) * 3); // 游標在縫後面的空氣
    g.setMining(true);
    g.step(FIXED_DT);
    expect(g.getState().mining).toMatchObject({ x: 62, y: 57 });
    runFor(g, STONE_S);
    expect(g.world.getFg(62, 57)).toBe(T.AIR);
    expect(g.world.getFg(62, 56)).toBe(T.STONE);
  });

  it('射線先碰到挖不動的方塊（湧泉石 / 木鎬挖鐵礦）→ 不穿過去挖後面的；提示挖不動的原因', () => {
    for (const block of [T.SPRING, T.IRON_ORE]) {
      const g = arena();
      g.world.setFg(62, 58, block);
      g.world.setFg(64, 58, T.STONE);
      aimAt(g, 90, 58); g.setMining(true);
      runFor(g, 3);
      expect(g.world.getFg(62, 58)).toBe(block);
      expect(g.world.getFg(64, 58)).toBe(T.STONE);
      expect(g.getState().mining).toBeNull();
      expect(g.drainEvents().some((e) => e.type === 'blocked' && e.reason === 'tier')).toBe(true);
    }
  });

  it('觸及範圍內那個方向什麼都沒有 → 不挖', () => {
    const g = arena();
    const before = g.world.getFg(60, 60);
    aimAt(g, 60, 20); g.setMining(true); // 正上方，全是空氣
    runFor(g, 2);
    expect(g.getState().mining).toBeNull();
    expect(mines(g)).toEqual([]);
    expect(g.world.getFg(60, 60)).toBe(before);
  });

  it('爬繩時：跟自己身體重疊的繩子不擋射線、也不會被挖', () => {
    const g = arena();
    // 身體佔 y = 57..59：那三格掛繩子，上面隔一格空氣是石頭
    for (let y = 57; y < 60; y++) g.world.setFg(60, y, T.ROPE);
    g.world.setFg(60, 55, T.STONE);
    aimAt(g, 60, 30); g.setMining(true);
    runFor(g, STONE_S);
    expect(g.world.getFg(60, 55)).toBe(T.AIR);
    for (let y = 57; y < 60; y++) expect(g.world.getFg(60, y)).toBe(T.ROPE);
  });

  it('按住挖掘、游標在空氣裡掃過好幾格（射線指的還是同一塊）→ 進度不歸零，照常挖掉', () => {
    const g = arena();
    g.world.setFg(63, 58, T.STONE);
    g.setMining(true);
    const n = Math.round(STONE_S / FIXED_DT);
    for (let i = 0; i < n; i++) { aimAt(g, 65 + (i % 3), 58); g.step(FIXED_DT); }
    expect(g.world.getFg(63, 58)).toBe(T.AIR);
  });

  it('mineFocus：按住挖掘時是實際要挖的那格（框框畫在這）；沒按 / 沒東西 → null', () => {
    const g = arena();
    g.world.setFg(63, 58, T.STONE);
    aimAt(g, 66, 58);
    expect(g.mineFocus()).toBeNull();
    g.setMining(true);
    expect(g.mineFocus()).toEqual({ x: 63, y: 58 });
    aimAt(g, 60, 20);
    expect(g.mineFocus()).toBeNull();
    aimAt(g, 61, 60); // 游標就在腳邊的地面上
    expect(g.mineFocus()).toEqual({ x: 61, y: 60 });
  });

  it('單機決定性：同樣的輸入 → 同樣的結果', () => {
    const play = (): unknown => {
      const g = arena();
      g.world.setFg(63, 57, T.STONE); g.world.setFg(64, 58, T.DIRT);
      g.setMining(true);
      for (let i = 0; i < 200; i++) { aimAt(g, 70 + (i % 5), 50 + (i % 9)); g.step(FIXED_DT); }
      return [g.world.getFg(63, 57), g.world.getFg(64, 58), g.getState()];
    };
    expect(play()).toEqual(play());
  });
});

describe('方向挖掘（co-op）', () => {
  function until(r: Rig, cond: () => boolean, maxMs: number): boolean {
    for (let t = 0; t < maxMs; t += FRAME) { if (cond()) return true; r.run(FRAME); }
    return cond();
  }
  it('客人朝方塊的方向按住挖（游標在遠處的空氣）→ 房主那邊挖掉那塊；客人的框框也指著它', () => {
    const r = coopRig();
    const g = r.guests[0], hg = r.hostGame, gg = g.game!;
    const p = gg.local.player, tx = Math.floor((p.x + p.w / 2) / S), ty = FLOOR - 2;
    hg.world.setFg(tx + 3, ty, T.STONE);
    r.run(500);
    expect(gg.world.getFg(tx + 3, ty)).toBe(T.STONE);
    const pick = gg.local.inventory.slots.findIndex((s) => s?.item === 'wood_pickaxe');
    if (pick >= 0) gg.selectSlot(pick);
    aimAt(gg, tx + 25, ty);
    gg.setMining(true);
    expect(gg.mineFocus()).toEqual({ x: tx + 3, y: ty });
    expect(until(r, () => hg.world.getFg(tx + 3, ty) === T.AIR, 4000)).toBe(true);
    gg.setMining(false);
    expect(until(r, () => gg.world.getFg(tx + 3, ty) === T.AIR, 2000)).toBe(true);
  });
});
