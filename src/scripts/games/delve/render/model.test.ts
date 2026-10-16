// model.test.ts — render 層的純邏輯：鏡頭、固定步長、chunk 可見範圍 / LRU、HUD 文字與配方列。
import { describe, it, expect } from 'vitest';
import {
  clampCamera, followCamera, FixedStepper, visibleChunks, ChunkLRU,
  formatClock, depthLabel, blockedMessage, recipeRows, countLabel,
} from './model';
import { Inventory } from '../engine/inventory';
import { DAY_LENGTH } from '../engine/constants';

describe('clampCamera', () => {
  it('夾在世界範圍內', () => {
    expect(clampCamera(-50, -10, 800, 600, 3200, 1600)).toEqual({ x: 0, y: 0 });
    expect(clampCamera(5000, 5000, 800, 600, 3200, 1600)).toEqual({ x: 2400, y: 1000 });
    expect(clampCamera(100, 200, 800, 600, 3200, 1600)).toEqual({ x: 100, y: 200 });
  });
  it('視窗比世界大時置中', () => {
    expect(clampCamera(0, 0, 1000, 600, 800, 1600).x).toBe(-100);
  });
});

describe('followCamera', () => {
  it('朝目標平滑移動，不超過目標', () => {
    const c = followCamera({ x: 0, y: 0 }, { x: 1000, y: 800 }, 800, 600, 32000, 16000, 1 / 60);
    // 目標鏡頭 = 中心 - 半視窗 = (600, 500)
    expect(c.x).toBeGreaterThan(0);
    expect(c.x).toBeLessThan(600);
    expect(c.y).toBeGreaterThan(0);
    expect(c.y).toBeLessThan(500);
  });
  it('長時間後收斂到目標並受夾限', () => {
    let c = { x: 0, y: 0 };
    for (let i = 0; i < 600; i++) c = followCamera(c, { x: 100, y: 100 }, 800, 600, 32000, 16000, 1 / 60);
    expect(c.x).toBeCloseTo(0);
    expect(c.y).toBeCloseTo(0);
    for (let i = 0; i < 600; i++) c = followCamera(c, { x: 5000, y: 4000 }, 800, 600, 32000, 16000, 1 / 60);
    expect(c.x).toBeCloseTo(4600, 0);
    expect(c.y).toBeCloseTo(3700, 0);
  });
  it('snap=true 直接到位', () => {
    const c = followCamera({ x: 0, y: 0 }, { x: 1000, y: 800 }, 800, 600, 32000, 16000, 1 / 60, true);
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
  it('列出與視窗相交的 chunk，夾在世界內', () => {
    // chunk 512px；視窗 (0,0)-(800,600) → cx 0..1, cy 0..1
    const v = visibleChunks(0, 0, 800, 600, 512, 50, 16);
    expect(v).toEqual({ cx0: 0, cy0: 0, cx1: 1, cy1: 1 });
    const w = visibleChunks(-100, 7000, 800, 2000, 512, 50, 16);
    expect(w.cx0).toBe(0);
    expect(w.cy1).toBe(15);
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
  it('depthLabel', () => {
    expect(depthLabel(100, 140)).toBe('地表');
    expect(depthLabel(141, 140)).toBe('地表');
    expect(depthLabel(160, 140)).toBe('地下 20 格');
  });
  it('blockedMessage：occupied 不提示', () => {
    expect(blockedMessage('reach')).toMatch(/太遠/);
    expect(blockedMessage('tier')).toMatch(/鎬/);
    expect(blockedMessage('occupied')).toBeNull();
  });
  it('countLabel：1 個不顯示數字', () => {
    expect(countLabel(null)).toBe('');
    expect(countLabel({ item: 'wood_pickaxe', count: 1 })).toBe('');
    expect(countLabel({ item: 'dirt', count: 42 })).toBe('42');
  });
});

describe('recipeRows', () => {
  it('標示可合成、缺料、需工作台', () => {
    const inv = new Inventory();
    inv.add('wood', 1);
    inv.add('planks', 5);
    inv.add('copper_ore', 8);
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
