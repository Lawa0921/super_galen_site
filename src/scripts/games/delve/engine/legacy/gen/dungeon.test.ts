// dungeon.test.ts — 地城：結構、房型、門與鑰匙的可解性（房間圖模擬 + tile 層級的洪水填充）、確定性
import { describe, it, expect, beforeAll } from 'vitest';
import { generateWorld, type GenResult } from '../worldgen';
import { T, SOLID_LUT, tileDef, isDungeonBrick, TIER_GOLD, ceilOk, floorOk } from '../../tiles';
import type { DungeonInfo } from '../../genTypes';
import { solvable, floodSolvable } from '../../gen2/testUtil';

const SEEDS = ['alpha', 'dungeon-b', 'dungeon-c'];

// 全尺寸世界生成在整套測試平行跑時可能要好幾秒：放寬逾時
describe('地城', { timeout: 180_000 }, () => {
  const results: GenResult[] = [];
  beforeAll(() => { for (const s of SEEDS) results.push(generateWorld(s)); }, 180_000);
  const D = (r: GenResult): DungeonInfo => r.dungeon!;

  it('每個 seed 都有地城：在預留區內、入口塔在地表、配色是三色之一', () => {
    for (const r of results) {
      const d = D(r);
      expect(d).toBeTruthy();
      const z = r.dungeonZone;
      expect(d.bbox.x).toBeGreaterThanOrEqual(z.x0);
      expect(d.bbox.x + d.bbox.w).toBeLessThanOrEqual(z.x1);
      expect(['blue', 'green', 'pink']).toContain(d.color);
      expect(isDungeonBrick(d.brick)).toBe(true);
      // 入口：腳下是實心、身體三格是空的；塔頂露天
      const { x, y } = d.entrance;
      expect(SOLID_LUT[r.world.getFg(x, y + 1)]).toBe(1);
      for (let k = 0; k < 3; k++) expect(SOLID_LUT[r.world.getFg(x, y - k)]).toBe(0);
      expect(d.tower.y + d.tower.h).toBeLessThanOrEqual(r.world.surface[x] + 2);
    }
  });
  it('房型齊全：入口、寶藏室（最深）、神殿、書庫、牢房、豎井、大廳；房間 ≥ 12', () => {
    for (const r of results) {
      const d = D(r);
      const kinds = new Set(d.rooms.map((q) => q.kind));
      for (const k of ['entry', 'treasure', 'shrine', 'library', 'prison', 'shaft', 'hall'] as const) expect(kinds.has(k), k).toBe(true);
      expect(d.rooms.length).toBeGreaterThanOrEqual(12);
      const T_ = d.rooms[d.treasureRoom];
      expect(T_.kind).toBe('treasure');
      const deepest = Math.max(...d.rooms.map((q) => q.y + q.h));
      expect(T_.y + T_.h).toBeGreaterThanOrEqual(deepest - 30);
    }
  });
  it('物件：書架、牢門、古碑、鐵鍊、旗幟、蠟燭、吊燈、骨堆、蜘蛛網、平台都有；寶藏室有金寶箱', () => {
    for (const r of results) {
      const d = D(r), w = r.world;
      const cnt = new Map<number, number>();
      for (let y = d.bbox.y; y < d.bbox.y + d.bbox.h; y++) for (let x = d.bbox.x; x < d.bbox.x + d.bbox.w; x++) {
        const t = w.getFg(x, y);
        cnt.set(t, (cnt.get(t) ?? 0) + 1);
      }
      for (const t of [T.BOOKSHELF, T.DOOR_CLOSED, T.LORE_TABLET, T.CHAIN, T.BANNER, T.CANDLE, T.LANTERN, T.BONES, T.COBWEB, T.PLATFORM, T.POT]) {
        expect(cnt.get(t) ?? 0, `tile ${t}`).toBeGreaterThan(0);
      }
      expect(cnt.get(T.LOCKED_CHEST)).toBe(1);
      expect(w.getFg(d.treasureChest.x, d.treasureChest.y)).toBe(T.LOCKED_CHEST);
      expect(w.chests.get(d.treasureChest.y * w.width + d.treasureChest.x)!.some((s) => s?.item === 'rune_pickaxe')).toBe(true);
      expect(d.tablets.length).toBeGreaterThanOrEqual(2);
      expect(d.platforms).toBeGreaterThan(100);
    }
  });
  it('門都是 3 格高：上面是門楣、下面是實心地板', () => {
    for (const r of results) {
      const w = r.world;
      for (const dr of D(r).doors) {
        const t = w.getFg(dr.x, dr.y);
        for (let k = 0; k < 3; k++) expect(w.getFg(dr.x, dr.y + k)).toBe(t);
        expect(SOLID_LUT[w.getFg(dr.x, dr.y - 1)]).toBe(1);
        expect(SOLID_LUT[w.getFg(dr.x, dr.y + 3)]).toBe(1);
        expect(t === T.DOOR_LOCKED).toBe(dr.locked);
      }
    }
  });
  it('地城磚要金鎬、上鎖的門 / 金寶箱挖不動', () => {
    expect(tileDef(T.DUNGEON_BRICK_BLUE).minTier).toBe(TIER_GOLD);
    expect(tileDef(T.DOOR_LOCKED).minTier).toBeGreaterThan(10);
    expect(tileDef(T.LOCKED_CHEST).minTier).toBeGreaterThan(10);
  });
  // 兩個解謎檢查共用 gen2/testUtil.ts 的 solvable / floodSolvable（M2b 刪 legacy 後 gen2 仍在用）
  it('可解性（房間圖）：鑰匙數 = 上鎖的門數，全都在不經過任何鎖就到得了的房間；之後任意順序都打得開', () => {
    for (const r of results) expect(solvable(D(r))).toEqual({ ok: true });
  });
  it('可解性（tile 洪水填充）：不開鎖時拿得到所有地城鑰匙但進不了上鎖房間；開鎖後金鑰匙與金寶箱都到得了', () => {
    for (const r of results) expect(floodSolvable(r.world, D(r))).toEqual({ ok: true });
  });
  it('豎井可以爬：每個平台往上 5 格內（左右 ±5 欄）都有下一個平台，或已經到頂', () => {
    for (const r of results) {
      const w = r.world, d = D(r);
      const isP = (x: number, y: number): boolean => w.getFg(x, y) === T.PLATFORM;
      for (let y = d.bbox.y; y < d.bbox.y + d.bbox.h; y++) for (let x = d.bbox.x; x < d.bbox.x + d.bbox.w; x++) {
        if (!isP(x, y)) continue;
        let next = false, higher = false;
        for (let yy = y - 1; yy >= y - 30 && !next; yy--) for (let xx = x - 5; xx <= x + 5; xx++) {
          if (!isP(xx, yy)) continue;
          if (y - yy <= 5) next = true; else higher = true;
        }
        // 上方 6 格內有天花板 → 這是頂層（或旁邊就是出口）
        let ceiling = false;
        for (let yy = y - 1; yy >= y - 6; yy--) if (SOLID_LUT[w.getFg(x, yy)]) { ceiling = true; break; }
        // 和地板齊平的豎井口（平台這列左右接著實心地板、地板上方是房間）：站在地板上，不是攀爬缺口
        let x0 = x, x1 = x;
        while (isP(x0 - 1, y)) x0--;
        while (isP(x1 + 1, y)) x1++;
        const floorHatch = [x0 - 1, x1 + 1].some((fx) => SOLID_LUT[w.getFg(fx, y)] === 1 && SOLID_LUT[w.getFg(fx, y - 1)] !== 1);
        if (!next && higher && !ceiling && !floorHatch) expect.fail(`platform gap above ${x},${y}`);
      }
    }
  });
  it('地城物件的支撐都成立（地面 / 垂吊）', () => {
    for (const r of results) {
      const w = r.world, d = D(r);
      for (let y = d.bbox.y; y < d.bbox.y + d.bbox.h; y++) for (let x = d.bbox.x; x < d.bbox.x + d.bbox.w; x++) {
        const t = w.getFg(x, y), sup = tileDef(t).support;
        if (sup === 'floor') expect(floorOk(t, w.getFg(x, y + 1)), `floor ${t}@${x},${y}`).toBe(true);
        if (sup === 'ceiling') expect(ceilOk(t, w.getFg(x, y - 1)), `ceil ${t}@${x},${y}`).toBe(true);
      }
    }
  });
});
