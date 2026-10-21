// waystones.test.ts — 傳送碑（Task 11 / B10）：位置是純函式、near 不掃描但與暴力掃描相同、不在水上、間距、
// 有界世界只有出生點那顆；遊戲層的碰觸解鎖（世界共用）、打開面板、傳送（目的地先載入、不卡進實心）、存讀檔。
import { describe, expect, it } from 'vitest';
import {
  SPAWN_STONE, STONE_EVERY, STONE_JITTER, STONE_FIRST, Waystones, validStoneIds, type Waystone,
} from './waystones';
import { OuterProfile, SEA_W, type CentralFrame } from './chunkgen';
import { DelveGame, PRIVATE_EVENTS, type DelveEvent } from './game';
import { generateWorld, type GenResult } from './worldgen';
import { FIXED_DT, TILE_SIZE, WORLD_W } from './constants';
import { chunkOfX } from './coords';
import { overlapsSolid } from './physics';
import { findStandSpot } from './npcPath';
import { T, W } from './tiles';
import { createCharacter } from '../save/character';
import { normalizeAppearance } from './appearance';
import { decodeSave, encodeSave, restoreGame, snapshotGame } from '../save/serialize';
import { decodeWorld, encodeWorld, restoreSplit, saveSplitGame } from '../save/worldSave';

const FRAME: CentralFrame = { width: 4200, height: 1200, edgeL: 300, edgeR: 310, cavernY: 600, moltenY: 1000 };
const profile = (seed = 'ws'): OuterProfile => new OuterProfile(seed, FRAME);
const stones = (seed = 'ws'): Waystones => new Waystones(seed, { x: 2107, y: 299 }, profile(seed));

/** 暴力：ids −40..40 全部算出來（涵蓋 |x| ≤ 20000 + 中央寬） */
function all(ws: Waystones): Waystone[] {
  const out: Waystone[] = [];
  for (let id = -40; id <= 40; id++) { const s = ws.byId(id); if (s) out.push(s); }
  return out.sort((a, b) => a.x - b.x);
}

describe('Waystones：位置', () => {
  it('純函式：兩個實例（先問的順序不同）位置完全相同', () => {
    const a = stones(), b = stones();
    const ids = [-12, 3, 0, 7, -1, 1, 20, -20];
    const fa = ids.map((i) => a.byId(i));
    const fb = [...ids].reverse().map((i) => b.byId(i)).reverse();
    expect(fa).toEqual(fb);
    expect(a.near(-30000, 30000)).toEqual(b.near(-30000, 30000));
  });

  it('near 與暴力掃描相同（x ∈ [−20000, 20000)，各種寬度的窗）', () => {
    const ws = stones('near'), list = all(ws).filter((s) => s.x >= -20000 && s.x < 20000);
    const brute = (x0: number, x1: number): Waystone[] => list.filter((s) => s.x >= x0 && s.x < x1);
    expect(ws.near(-20000, 20000)).toEqual(list);
    for (const w of [1, 5, 37, 400, 1601, 5000]) {
      for (let x0 = -20000; x0 < 20000; x0 += w === 1 ? 97 : Math.max(13, w >> 1)) {
        const x1 = Math.min(20000, x0 + w);
        expect(ws.near(x0, x1)).toEqual(brute(x0, x1));
      }
    }
    // 每顆碑本身那一格的窗
    for (const s of list) expect(ws.near(s.x, s.x + 1)).toEqual([s]);
    expect(ws.near(10, 10)).toEqual([]);
  });

  it('出生點那顆 id 0、名字；外圍東 +k / 西 −k 的名字；第一顆在海後 STONE_FIRST ± 抖動', () => {
    const ws = stones();
    expect(ws.byId(SPAWN_STONE)).toEqual({ id: 0, x: 2107, y: 299, name: '出生地傳送碑' });
    expect(ws.byId(1)!.name).toBe('東境第 1 碑');
    expect(ws.byId(-3)!.name).toBe('西境第 3 碑');
    const e1 = ws.byId(1)!, w1 = ws.byId(-1)!;
    expect(e1.x - FRAME.width).toBeGreaterThanOrEqual(SEA_W + STONE_FIRST - STONE_JITTER);
    expect(e1.x - FRAME.width).toBeLessThan(SEA_W + STONE_FIRST + STONE_JITTER);
    expect(-1 - w1.x).toBeGreaterThanOrEqual(SEA_W + STONE_FIRST - STONE_JITTER);
    expect(-1 - w1.x).toBeLessThan(SEA_W + STONE_FIRST + STONE_JITTER);
    // y = 地表 − 1；footprint 2×3、底列 = y
    const p = profile();
    expect(e1.y).toBe(p.surfaceAt(e1.x) - 1);
    expect(ws.footprint(e1)).toEqual({ x: e1.x, y: e1.y - 2, w: 2, h: 3 });
    expect(ws.byId(1.5)).toBeNull();
  });

  it('碑不在水上：footprint 兩欄都是陸地、沒有水面（幾個種子）', () => {
    for (const seed of ['ws', 'a', 'b', 'c', 'infinite-e2e']) {
      const ws = stones(seed), p = profile(seed);
      for (const s of all(ws)) {
        if (s.id === 0) continue;
        for (const x of [s.x, s.x + 1]) {
          expect(p.zoneAt(x).kind).toBe('land');
          expect(p.waterTopAt(x)).toBeNull();
        }
      }
    }
  });

  it('同一側相鄰兩顆的間距在 STONE_EVERY ± 2 × STONE_JITTER 內', () => {
    for (const seed of ['ws', 'x', 'y']) {
      const ws = stones(seed);
      for (const side of [1, -1]) {
        for (let k = 1; k < 30; k++) {
          const a = ws.byId(side * k)!, b = ws.byId(side * (k + 1))!;
          const gap = Math.abs(b.x - a.x);
          expect(gap).toBeGreaterThanOrEqual(STONE_EVERY - 2 * STONE_JITTER);
          expect(gap).toBeLessThanOrEqual(STONE_EVERY + 2 * STONE_JITTER);
        }
      }
    }
  });

  it('硬邊界外沒有碑；near 再大的範圍也只到硬邊界', () => {
    const ws = stones();
    const far = ws.near(-5_000_000, 5_000_000);
    expect(far.length).toBeGreaterThan(1000);
    for (const s of far) expect(Math.abs(s.x)).toBeLessThan(1_000_000);
    expect(ws.byId(100000)).toBeNull();
  });

  it('有界世界（profile = null）只有 id 0', () => {
    const ws = new Waystones('legacy', { x: 30, y: 40 }, null);
    expect(ws.near(-1_000_000, 1_000_000).map((s) => s.id)).toEqual([0]);
    expect(ws.byId(1)).toBeNull();
    expect(ws.byId(-1)).toBeNull();
    expect(ws.near(0, 30)).toEqual([]);
  });

  it('validStoneIds：只留整數、不是 0、這個世界有的碑；去重、排序；不是陣列 = []', () => {
    const ws = stones();
    expect(validStoneIds([3, -2, 3, 0, 1.5, 'x', null, 1, 999999], ws)).toEqual([-2, 1, 3]);
    expect(validStoneIds('nope', ws)).toEqual([]);
    expect(validStoneIds(undefined, ws)).toEqual([]);
    expect(validStoneIds([1, 2], new Waystones('l', { x: 1, y: 1 }, null))).toEqual([]);
  });
});

// ── 遊戲層（正式尺寸、固定種子；世界只生成一次） ─────────────────
const SEED = 'waystones-1a';
let GEN: GenResult | null = null;
const gen = (): GenResult => (GEN ??= generateWorld(SEED));
const game = (): DelveGame => {
  const g = new DelveGame({ seed: SEED, gen: gen(), peaceful: true });
  g.drainAll();
  return g;
};
const steps = (g: DelveGame, n: number): void => { for (let i = 0; i < n; i++) g.step(FIXED_DT); };
const hero = () => createCharacter('乙', normalizeAppearance(undefined), 0);
const feetX = (g: DelveGame): number => Math.floor((g.player.x + g.player.w / 2) / TILE_SIZE);
const of = <K extends DelveEvent['type']>(ev: DelveEvent[], t: K): Extract<DelveEvent, { type: K }>[] =>
  ev.filter((e): e is Extract<DelveEvent, { type: K }> => e.type === t);
/** 站到碑旁（碑右邊那一欄附近找站得住的地方） */
function standBy(g: DelveGame, s: Waystone, dx = 2): void {
  g.ensureAround(s.x);
  const spot = findStandSpot(g.world, s.x + dx, s.y)!;
  expect(spot).not.toBeNull();
  g.teleport(spot.x, spot.y);
}
/** 站進碑的 footprint 裡（身體與碑重疊） */
function touch(g: DelveGame, s: Waystone): void { standBy(g, s, 1); }

describe('遊戲層：傳送碑', () => {
  it('出生後 unlockedStones() 只有出生點那顆（spawn.x + 7、生成地表上）', () => {
    const g = game();
    const st = g.unlockedStones();
    expect(st.map((s) => s.id)).toEqual([0]);
    expect(st[0].x).toBe(g.spawn.x + 7);
    expect(st[0].y).toBe(g.world.surface[g.spawn.x + 7] - 1);
    expect(g.stonesUnlocked.size).toBe(0);
  });

  it('走到東境第 1 碑 → stone_unlock 事件、stonesUnlocked 有 1；再碰一次不會重複', () => {
    const g = game();
    const s = g.waystones.byId(1)!;
    expect(s.x).toBeGreaterThan(WORLD_W + SEA_W);
    touch(g, s);
    steps(g, 2);
    const ev = of(g.drainEvents(), 'stone_unlock');
    expect(ev).toEqual([{ type: 'stone_unlock', id: 1, name: '東境第 1 碑', x: s.x, y: s.y }]);
    expect(g.stonesUnlocked.has(1)).toBe(true);
    expect(g.unlockedStones().map((t) => t.id)).toEqual([0, 1]);
    steps(g, 5);
    expect(of(g.drainEvents(), 'stone_unlock')).toEqual([]);
  });

  it('共用：actor b 碰到西境第 1 碑 → 本地 actor 的 unlockedStones() 也有它、事件兩人都看得到', () => {
    const g = game();
    const s = g.waystones.byId(-1)!;
    g.ensureAround(s.x);
    const spot = findStandSpot(g.world, s.x + 1, s.y)!;
    g.addActor('b', hero(), spot);
    g.drainEvents('h'); g.drainEvents('b');
    steps(g, 2);
    const eh = of(g.drainEvents('h'), 'stone_unlock'), eb = of(g.drainEvents('b'), 'stone_unlock');
    expect(eh.map((e) => e.id)).toEqual([-1]);
    expect(eb.map((e) => e.id)).toEqual([-1]);
    expect(PRIVATE_EVENTS.has('stone_unlock')).toBe(false);
    expect(PRIVATE_EVENTS.has('stone')).toBe(true);
    expect(g.withActor(g.local, () => g.unlockedStones().map((t) => t.id))).toEqual([-1, 0]);
  });

  it('站在出生點碑旁 travelStone(1) → 到東境第 1 碑旁：欄已常駐、不在實心裡、stone travel 事件（Review Focus 5）', () => {
    const g = game();
    const home = g.waystones.byId(0)!, dest = g.waystones.byId(1)!;
    standBy(g, home);
    expect(g.stoneHere()?.id).toBe(0);
    g.stonesUnlocked.add(1);
    // 目的地一開始還沒載入
    expect(g.world.isResident(chunkOfX(dest.x))).toBe(false);
    expect(g.travelStone(1)).toBe(true);
    const fx = feetX(g);
    expect(Math.abs(fx - (dest.x + 2))).toBeLessThanOrEqual(8);
    for (let c = chunkOfX(fx) - 1; c <= chunkOfX(fx) + 1; c++) expect(g.world.isResident(c)).toBe(true);
    const p = g.player;
    expect(overlapsSolid(g.world, p.x, p.y, p.w, p.h)).toBe(false);
    const ev = of(g.drainEvents(), 'stone');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: 'stone', phase: 'travel', id: 0, to: 1 });
    expect(g.stoneHere()?.id).toBe(1);
    // 掉下去 / 走幾步之後還是站得住
    steps(g, 30);
    expect(overlapsSolid(g.world, g.player.x, g.player.y, g.player.w, g.player.h)).toBe(false);
  });

  it('目的地沒解鎖 / 不在碑旁 / 同一顆 / 不存在 → false（不動）', () => {
    const g = game();
    const home = g.waystones.byId(0)!;
    standBy(g, home);
    const x0 = g.player.x;
    expect(g.travelStone(1)).toBe(false);
    expect(g.travelStone(0)).toBe(false);
    expect(g.travelStone(99999)).toBe(false);
    g.stonesUnlocked.add(1);
    g.teleport(home.x + 40, g.world.surface[home.x + 40] - 1);
    expect(g.stoneHere()).toBeNull();
    expect(g.travelStone(1)).toBe(false);
    standBy(g, home);
    expect(g.player.x).toBe(x0);
    expect(of(g.drainEvents(), 'stone')).toEqual([]);
  });

  it('目的地碑旁被方塊填滿 → false、不動、blocked 原因是 blockedstone（不是爐心的 blockedspot）', () => {
    const g = game();
    const home = g.waystones.byId(0)!, dest = g.waystones.byId(1)!;
    standBy(g, home);
    g.stonesUnlocked.add(1);
    g.ensureAround(dest.x);
    for (let y = dest.y - 12; y <= dest.y + 12; y++) for (let x = dest.x - 10; x <= dest.x + 14; x++) {
      g.world.setFg(x, y, T.STONE);
      g.world.setLiquid(x, y, 0, 0);
    }
    const x0 = g.player.x;
    g.drainEvents();
    expect(g.travelStone(1)).toBe(false);
    expect(g.player.x).toBe(x0);
    const bl = of(g.drainEvents(), 'blocked');
    expect(bl.map((e) => e.reason)).toEqual(['blockedstone']);
  });

  it('站在沒解鎖的碑旁（沒碰到）不能從那裡傳', () => {
    const g = game();
    const s = g.waystones.byId(1)!;
    // 碑右邊 3 欄：在 ± 2 格內但身體不重疊
    standBy(g, s, 4);
    expect(g.stoneHere()?.id).toBe(1);
    expect(g.stonesUnlocked.has(1)).toBe(false);
    expect(g.travelStone(0)).toBe(false);
  });

  /** 拿著 item（null = 空手）瞄準 (x, y) 按一下使用 → 這段期間的事件 */
  function useAt(g: DelveGame, item: string | null, x: number, y: number): DelveEvent[] {
    if (item === null) {
      const e = g.inventory.slots.findIndex((st, i) => i < 10 && !st);
      g.selectSlot(e);
      expect(g.inventory.selectedStack()).toBeNull();
    } else {
      if (!g.inventory.slots.some((st) => st?.item === item)) g.give(item as never, 10);
      g.selectSlot(g.inventory.slots.findIndex((st) => st?.item === item));
    }
    g.drainEvents();
    g.setAim(x, y);
    g.setUse(true);
    steps(g, 2);
    g.setUse(false);
    steps(g, 1);
    return g.drainEvents();
  }

  it('空手 / 拿鎬 / 拿劍瞄準碑按使用 → stone open 事件；太遠 → 不開', () => {
    const g = game();
    const home = g.waystones.byId(0)!;
    standBy(g, home);
    const fp = g.waystones.footprint(home);
    for (const item of [null, 'wood_pickaxe', 'wood_sword']) {
      const ev = useAt(g, item, fp.x, fp.y + 1);
      expect(of(ev, 'stone')).toEqual([{ type: 'stone', phase: 'open', id: 0, x: home.x, y: home.y }]);
      expect(of(ev, 'place')).toEqual([]);
    }
    // 遠處：不開
    g.teleport(home.x + 30, g.world.surface[home.x + 30] - 1);
    steps(g, 1);
    expect(of(useAt(g, null, fp.x, fp.y + 1), 'stone')).toEqual([]);
  });

  it('拿著能放的方塊 / 背景牆瞄準碑的 footprint → 照常放置、不開面板（控制者裁定：放置優先）；碑還在', () => {
    const g = game();
    const home = g.waystones.byId(0)!;
    standBy(g, home);
    const fp = g.waystones.footprint(home), before = { ...home };
    // 泥土放在碑腳（左欄最底列，玩家身體不在那欄）
    const e1 = useAt(g, 'dirt', fp.x, fp.y + 2);
    expect(of(e1, 'stone')).toEqual([]);
    expect(of(e1, 'place')).toHaveLength(1);
    expect(g.world.getFg(fp.x, fp.y + 2)).toBe(T.DIRT);
    // 木板疊在泥土上
    const e2 = useAt(g, 'planks', fp.x, fp.y + 1);
    expect(of(e2, 'stone')).toEqual([]);
    expect(g.world.getFg(fp.x, fp.y + 1)).toBe(T.PLANKS);
    // 木板牆貼在碑的右下格（腳下是地面 = 有支撐）
    const e3 = useAt(g, 'plank_wall', fp.x + 1, fp.y + 2);
    expect(of(e3, 'stone')).toEqual([]);
    expect(g.world.getWall(fp.x + 1, fp.y + 2)).toBe(W.PLANK_WALL);
    // 放不了（右上格懸空沒支撐）也是走放置那條路：提示 support、不開面板
    const e4 = useAt(g, 'plank_wall', fp.x + 1, fp.y);
    expect(of(e4, 'stone')).toEqual([]);
    expect(g.world.getWall(fp.x + 1, fp.y)).toBe(0);
    expect(of(e4, 'blocked').map((e) => e.reason)).toEqual(['support']);
    // 碑本身不受影響：位置相同、還找得到、空手照樣打得開
    expect(g.waystones.byId(0)).toEqual(before);
    expect(g.unlockedStones().map((s) => s.id)).toEqual([0]);
    expect(of(useAt(g, null, fp.x + 1, fp.y + 1), 'stone')).toHaveLength(1);
  });

  it('外圍的碑 footprint 裡放了方塊，碑照樣碰得到、解鎖', () => {
    const g = game();
    const s = g.waystones.byId(1)!;
    // 碑右邊第 3 欄：身體不碰到碑（還沒解鎖）
    standBy(g, s, 3);
    steps(g, 1);
    expect(g.stonesUnlocked.has(1)).toBe(false);
    const ev = useAt(g, 'planks', s.x, s.y);
    expect(of(ev, 'stone')).toEqual([]);
    expect(g.world.getFg(s.x, s.y)).toBe(T.PLANKS);
    expect(g.stonesUnlocked.has(1)).toBe(false);
    // 站到碑上（踩著剛放的木板）→ 碰到 → 解鎖
    g.teleport(s.x + 1, s.y - 1);
    steps(g, 2);
    expect(g.stonesUnlocked.has(1)).toBe(true);
    expect(of(g.drainEvents(), 'stone_unlock').map((e) => e.id)).toEqual([1]);
  });

  it('坐船時用傳送碑傳送 → 下船', () => {
    const g = game();
    const home = g.waystones.byId(0)!;
    standBy(g, home);
    g.stonesUnlocked.add(1);
    (g.local as unknown as { boating: boolean }).boating = true;
    expect(g.travelStone(1)).toBe(true);
    expect(g.local.boating).toBe(false);
  });

  it('存讀檔：解鎖集合還在（合併檔 + 世界檔）；舊存檔（沒有 stones）→ 只有出生點那顆', () => {
    const g = game();
    g.stonesUnlocked.add(1); g.stonesUnlocked.add(-2);
    const snap = snapshotGame(g, 0);
    expect(snap.header.stones).toEqual([-2, 1]);
    const r = restoreGame(decodeSave(encodeSave(snap)), { gen: gen() });
    if (!r.ok) throw new Error(r.message);
    expect([...r.game.stonesUnlocked].sort((a, b) => a - b)).toEqual([-2, 1]);
    expect(r.game.unlockedStones().map((s) => s.id)).toEqual([-2, 0, 1]);
    // 世界檔（split / join）
    const who = { id: 'ws', nick: '旅人', createdAt: 1, rev: 1 }, where = { worldId: 'wws', worldName: 'ws', visits: {} };
    const { world, character } = saveSplitGame(g, who, where, 5);
    const wd = decodeWorld(encodeWorld(world));
    expect(wd.header.stones).toEqual([-2, 1]);
    const r2 = restoreSplit(wd, character, { gen: gen() });
    if (!r2.ok) throw new Error(r2.message);
    expect([...r2.game.stonesUnlocked].sort((a, b) => a - b)).toEqual([-2, 1]);
    // 壞掉 / 不存在的 id 讀檔時丟掉
    const bad = snapshotGame(g, 0);
    bad.header.stones = [1, 0, 99999, 2.5] as number[];
    const r3 = restoreGame(decodeSave(encodeSave(bad)), { gen: gen() });
    if (!r3.ok) throw new Error(r3.message);
    expect([...r3.game.stonesUnlocked]).toEqual([1]);
    // 舊存檔：沒有 stones
    const old = snapshotGame(g, 0);
    delete old.header.stones;
    const r4 = restoreGame(decodeSave(encodeSave(old)), { gen: gen() });
    if (!r4.ok) throw new Error(r4.message);
    expect(r4.game.unlockedStones().map((s) => s.id)).toEqual([0]);
  });

  it('沒解鎖任何碑 → 存檔不寫 stones（B6）', () => {
    const g = game();
    expect('stones' in snapshotGame(g, 0).header).toBe(false);
    const { world } = saveSplitGame(g, { id: 'ws', nick: 'n', createdAt: 1, rev: 1 }, { worldId: 'wws', worldName: 'ws', visits: {} }, 5);
    expect('stones' in world.header).toBe(false);
  });

  it('有界的小世界：只有出生點那顆、存檔不寫 stones', () => {
    const g = new DelveGame({ seed: 'tiny', width: 160, height: 100 });
    expect(g.world.bounds).toBe('legacy');
    expect(g.waystones.near(-1_000_000, 1_000_000).map((s) => s.id)).toEqual([0]);
    expect(g.unlockedStones().map((s) => s.id)).toEqual([0]);
    expect('stones' in snapshotGame(g, 0).header).toBe(false);
  });
});
