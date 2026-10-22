// model.test.ts — render 層的純邏輯：鏡頭、固定步長、chunk 可見範圍 / LRU、HUD 文字與配方列。
import { describe, it, expect } from 'vitest';
import {
  clampCamera, followCamera, FixedStepper, visibleChunks, ChunkLRU,
  formatClock, depthLabel, blockedMessage, recipeRows, countLabel, cameraFocus, autostartPlan, biomeLabel, regionLabel } from './model';
import { Inventory } from '../engine/inventory';
import { DAY_LENGTH } from '../engine/constants';

describe('clampCamera', () => {
  it('夾在世界範圍內（有界世界傳 0, width*S）', () => {
    expect(clampCamera(-50, -10, 800, 600, 0, 3200, 1600)).toEqual({ x: 0, y: 0 });
    expect(clampCamera(5000, 5000, 800, 600, 0, 3200, 1600)).toEqual({ x: 2400, y: 1000 });
    expect(clampCamera(100, 200, 800, 600, 0, 3200, 1600)).toEqual({ x: 100, y: 200 });
  });
  it('視窗比世界大時置中', () => {
    expect(clampCamera(0, 0, 1000, 600, 0, 800, 1600).x).toBe(-100);
  });
  it('世界左緣不是 0（worldX0）：夾在 [worldX0, worldX1 - viewW]', () => {
    expect(clampCamera(-5000, 0, 800, 600, -1600, 1600, 1600).x).toBe(-1600);
    expect(clampCamera(5000, 0, 800, 600, -1600, 1600, 1600).x).toBe(800);
    expect(clampCamera(-700, 0, 800, 600, -1600, 1600, 1600).x).toBe(-700);
    expect(followCamera({ x: 0, y: 0 }, { x: -5000, y: 0 }, 800, 600, -1600, 1600, 1600, 1 / 60, true).x).toBe(-1600);
  });
  it('無限世界（±1e6 格）：可以停在負 px、也可以走過舊的 4200 寬右緣', () => {
    const X0 = -1e6 * 16, X1 = 1e6 * 16, H = 1200 * 16;
    expect(clampCamera(-5000, 300, 800, 600, X0, X1, H)).toEqual({ x: -5000, y: 300 });
    expect(clampCamera(4300 * 16, 300, 800, 600, X0, X1, H).x).toBe(4300 * 16);
    expect(clampCamera(-3e7, 0, 800, 600, X0, X1, H).x).toBe(X0);
    expect(clampCamera(3e7, 0, 800, 600, X0, X1, H).x).toBe(X1 - 800);
    const c = followCamera({ x: 0, y: 0 }, { x: -4800, y: 300 }, 800, 600, X0, X1, H, 1 / 60, true);
    expect(c.x).toBe(-5200);
  });
});

describe('followCamera', () => {
  it('朝目標平滑移動，不超過目標', () => {
    const c = followCamera({ x: 0, y: 0 }, { x: 1000, y: 800 }, 800, 600, 0, 32000, 16000, 1 / 60);
    // 目標鏡頭 = 中心 - 半視窗 = (600, 500)
    expect(c.x).toBeGreaterThan(0);
    expect(c.x).toBeLessThan(600);
    expect(c.y).toBeGreaterThan(0);
    expect(c.y).toBeLessThan(500);
  });
  it('長時間後收斂到目標並受夾限', () => {
    let c = { x: 0, y: 0 };
    for (let i = 0; i < 600; i++) c = followCamera(c, { x: 100, y: 100 }, 800, 600, 0, 32000, 16000, 1 / 60);
    expect(c.x).toBeCloseTo(0);
    expect(c.y).toBeCloseTo(0);
    for (let i = 0; i < 600; i++) c = followCamera(c, { x: 5000, y: 4000 }, 800, 600, 0, 32000, 16000, 1 / 60);
    expect(c.x).toBeCloseTo(4600, 0);
    expect(c.y).toBeCloseTo(3700, 0);
  });
  it('snap=true 直接到位', () => {
    const c = followCamera({ x: 0, y: 0 }, { x: 1000, y: 800 }, 800, 600, 0, 32000, 16000, 1 / 60, true);
    expect(c).toEqual({ x: 600, y: 500 });
  });
});

describe('FixedStepper', () => {
  it('累積到一個步長才步進', () => {
    const s = new FixedStepper(1 / 60);
    expect(s.advance(0.01)).toBe(0);
    expect(s.advance(0.01)).toBe(1);
  });
  it('單幀上限 250ms（最多 15 步）', () => {
    const s = new FixedStepper(1 / 60, 0.25);
    expect(s.advance(5)).toBe(15);
    expect(s.advance(0)).toBe(0);
  });
  it('負值或 NaN 視為 0', () => {
    const s = new FixedStepper(1 / 60);
    expect(s.advance(-1)).toBe(0);
    expect(s.advance(Number.NaN)).toBe(0);
  });
});

describe('visibleChunks', () => {
  it('列出與視窗相交的 chunk，夾在世界內（cxMin..cxMax 含端點）', () => {
    // chunk 512px；視窗 (0,0)-(800,600) → cx 0..1, cy 0..1
    const v = visibleChunks(0, 0, 800, 600, 512, 0, 49, 16);
    expect(v).toEqual({ cx0: 0, cy0: 0, cx1: 1, cy1: 1 });
    const w = visibleChunks(-100, 7000, 800, 2000, 512, 0, 49, 16);
    expect(w.cx0).toBe(0);
    expect(w.cy1).toBe(15);
  });
  it('無限世界：視窗在負 x → 負的 cx0；過了舊右緣（cx 131）不被夾住', () => {
    const v = visibleChunks(-1000, 0, 800, 600, 512, -31250, 31249, 38);
    expect(v.cx0).toBe(-2);
    expect(v.cx1).toBe(-1);
    const e = visibleChunks(4300 * 16, 0, 800, 600, 512, -31250, 31249, 38);
    expect(e.cx0).toBe(134);
    expect(e.cx1).toBe(135);
    // 硬邊界還是夾住
    expect(visibleChunks(-1e9, 0, 800, 600, 512, -31250, 31249, 38).cx0).toBe(-31250);
  });
});

describe('ChunkLRU', () => {
  it('超過容量時淘汰最久沒用的', () => {
    const lru = new ChunkLRU<string>(2);
    expect(lru.set(1, 'a')).toBeNull();
    expect(lru.set(2, 'b')).toBeNull();
    lru.get(1); // 1 變最新
    expect(lru.set(3, 'c')).toEqual({ key: 2, value: 'b' });
    expect(lru.has(2)).toBe(false);
    expect(lru.get(1)).toBe('a');
    expect(lru.size).toBe(2);
  });
  it('evictWhere：拿掉符合條件的項目並回傳（卸載欄的 chunk 圖回收）', () => {
    const lru = new ChunkLRU<string>(8);
    lru.set(1, 'a'); lru.set(2, 'b'); lru.set(3, 'c');
    expect(lru.evictWhere((k) => k !== 2)).toEqual(['a', 'c']);
    expect(lru.keys()).toEqual([2]);
    expect(lru.evictWhere(() => false)).toEqual([]);
  });
  it('覆寫同 key 不淘汰', () => {
    const lru = new ChunkLRU<string>(1);
    lru.set(1, 'a');
    expect(lru.set(1, 'b')).toBeNull();
    expect(lru.get(1)).toBe('b');
  });
});

describe('HUD 文字', () => {
  it('formatClock：0 為午夜、半天為正午', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(DAY_LENGTH / 2)).toBe('12:00');
    expect(formatClock(DAY_LENGTH * 0.75)).toBe('18:00');
    expect(formatClock(DAY_LENGTH * 1.25)).toBe('06:00');
  });
  it('depthLabel：以玩家所在欄的地表高度計算（腳底格）', () => {
    // 腳底格 = 地表 - 1 → 站在地表上
    expect(depthLabel(139, 140, 220)).toBe('地表');
    // 在地表上方（山坡上、樹上）也算地表
    expect(depthLabel(100, 140, 220)).toBe('地表');
    expect(depthLabel(149, 140, 220)).toBe('地下 10 格');
    // 同樣的 y，在較低的欄位仍是地表（不能用全世界 surfaceY）
    expect(depthLabel(149, 150, 220)).toBe('地表');
    // 進入洞穴層
    expect(depthLabel(229, 140, 220)).toBe('洞穴層 · 地下 90 格');
    expect(depthLabel(529, 140, 220, 500)).toBe('熔岩深淵 · 地下 390 格');
    expect(depthLabel(329, 140, 220, 500)).toBe('洞穴層 · 地下 190 格');
  });
  it('blockedMessage：occupied 不提示', () => {
    expect(blockedMessage('reach')).toMatch(/太遠/);
    expect(blockedMessage('tier')).toMatch(/鎬/);
    expect(blockedMessage('occupied')).toBeNull();
  });
  it('blockedMessage：傳送碑旁被擋住與爐心旁被擋住是不同的提示', () => {
    expect(blockedMessage('blockedspot')).toMatch(/爐心/);
    expect(blockedMessage('blockedstone')).toMatch(/傳送碑/);
    expect(blockedMessage('blockedstone')).not.toMatch(/爐心/);
    expect(blockedMessage('lockedtoss')).toBe('鎖定的裝備不能丟（先在背包裡解鎖）');
  });
  it('countLabel：1 個不顯示數字', () => {
    expect(countLabel(null)).toBe('');
    expect(countLabel({ item: 'wood_pickaxe', count: 1 })).toBe('');
    expect(countLabel({ item: 'dirt', count: 42 })).toBe('42');
  });
});

describe('recipeRows', () => {
  it('共享儲物：箱子裡的材料也算、標出要從箱子拿幾個', () => {
    const inv = new Inventory();
    inv.add('planks', 3);
    const rows = recipeRows(inv, true, (it) => (it === 'planks' ? 10 : 0));
    const t = rows.find((r) => r.id === 'table')!;
    expect(t.craftable).toBe(true);
    expect(t.inputs[0]).toEqual({ item: 'planks', n: 8, have: 13, bag: 3, fromChest: 5 });
    const solo = recipeRows(inv, true).find((r) => r.id === 'table')!;
    expect(solo.craftable).toBe(false);
  });

  it('標示可合成、缺料、需工作台', () => {
    const inv = new Inventory();
    inv.add('wood', 1);
    inv.add('planks', 5);
    inv.add('copper_bar', 5);
    const far = recipeRows(inv, false);
    const planks = far.find((r) => r.id === 'planks')!;
    expect(planks.craftable).toBe(true);
    expect(planks.inputs[0]).toEqual({ item: 'wood', n: 1, have: 1 });
    const bench = far.find((r) => r.id === 'workbench')!;
    expect(bench.craftable).toBe(false);
    expect(bench.missing).toBe(true);
    const cp = far.find((r) => r.id === 'copper_pickaxe')!;
    expect(cp.craftable).toBe(false);
    expect(cp.needStation).toBe(true);
    expect(cp.missing).toBe(false);
    const near = recipeRows(inv, true);
    expect(near.find((r) => r.id === 'copper_pickaxe')!.craftable).toBe(true);
  });
});

describe('cameraFocus（直式螢幕讓玩家在中間偏下、多看地面）', () => {
  const ratio = (vw: number, vh: number): number => {
    const pc = { x: 5000, y: 3000 };
    const f = cameraFocus(pc, vw, vh);
    return (pc.y - (f.y - vh / 2)) / vh; // 玩家在畫面中的縱向比例
  };
  it('橫式：玩家略低於中央', () => {
    const r = ratio(640, 360);
    expect(r).toBeGreaterThan(0.5);
    expect(r).toBeLessThan(0.6);
  });
  it('直式：玩家在中間偏下，但不會掉到下 1/3（不再大半是天空）', () => {
    const r = ratio(195, 422);
    expect(r).toBeGreaterThan(0.5);
    expect(r).toBeLessThan(0.6);
  });
  it('x 置中', () => {
    expect(cameraFocus({ x: 77, y: 0 }, 195, 422).x).toBe(77);
  });
});

describe('autostart（?autostart=1 深連結；新世界永遠開新存檔槽，不再覆蓋確認）', () => {
  it('沒有 autostart=1 不動作', () => {
    expect(autostartPlan('', false)).toEqual({ kind: 'none' });
    expect(autostartPlan('?seed=abc', true)).toEqual({ kind: 'none' });
  });
  it('沒有存檔 → 開新世界（有 seed 就用）', () => {
    expect(autostartPlan('?seed=abc&autostart=1', false)).toEqual({ kind: 'fresh', seed: 'abc' });
    expect(autostartPlan('?autostart=1', false)).toEqual({ kind: 'fresh', seed: undefined });
  });
  it('fresh=1 或指定 seed → 開新世界（另開存檔槽，舊存檔不動）', () => {
    expect(autostartPlan('?seed=abc&autostart=1&fresh=1', true)).toEqual({ kind: 'fresh', seed: 'abc' });
    expect(autostartPlan('?autostart=1&fresh=1', true)).toEqual({ kind: 'fresh', seed: undefined });
    expect(autostartPlan('?seed=abc&autostart=1', true)).toEqual({ kind: 'fresh', seed: 'abc' });
  });
  it('有存檔、沒有 seed / fresh=1 → 繼續冒險', () => {
    expect(autostartPlan('?autostart=1', true)).toEqual({ kind: 'continue' });
  });
});

describe('biomeLabel', () => {
  it('四個生態區的中文名稱', () => {
    expect(biomeLabel(0)).toBe('森林');
    expect(biomeLabel(1)).toBe('沙漠');
    expect(biomeLabel(2)).toBe('雪原');
    expect(biomeLabel(3)).toBe('叢林');
    expect(biomeLabel(99)).toBe('森林');
  });
  it('地底的迷你生態區優先', () => {
    const regions = [{ kind: 'mushroom_biome', x: 10, y: 10, w: 20, h: 10 }, { kind: 'crystal_cave', x: 50, y: 50, w: 10, h: 10 }];
    expect(regionLabel(0, regions, 15, 15)).toBe('螢光菇林');
    expect(regionLabel(0, regions, 55, 55)).toBe('水晶洞');
    expect(regionLabel(2, regions, 0, 0)).toBe('雪原');
  });
});
