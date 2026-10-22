// game.explore.test.ts — 遊戲裡的探索：出生點周圍已揭露、移動揭露、光照揭露、首次進入地區的發現事件、
// 古碑收進日誌、拿到珍寶、地圖標記
import { describe, it, expect, beforeAll } from 'vitest';
import { DelveGame, type DelveEvent } from './game';
import { T } from './tiles';
import { FIXED_DT } from './constants';
import { LightMap } from './lighting';

const run = (g: DelveGame, s: number): void => { for (let i = 0, n = Math.round(s / FIXED_DT); i < n; i++) g.step(FIXED_DT); };
type Disc = Extract<DelveEvent, { type: 'discover' }>;

describe('探索（小世界）', () => {
  it('開局：出生點周圍已揭露、出生地區已發現（不跳橫幅）', () => {
    const g = new DelveGame({ seed: 'ex', width: 200, height: 120 });
    expect(g.explored.has(g.spawn.x, g.spawn.y)).toBe(true);
    expect(g.explored.has(g.spawn.x + 60, g.spawn.y)).toBe(false);
    const home = g.discovery.regionsAt(g.spawn.x, g.spawn.y);
    expect(home.length).toBeGreaterThan(0);
    for (const r of home) expect(g.discovery.isFound(r.id)).toBe(true);
    run(g, 0.2);
    expect(g.drainEvents().some((e) => e.type === 'discover')).toBe(false);
  });
  it('移動 → 沿路揭露；光照夠亮的格（在畫面內）也揭露', () => {
    const g = new DelveGame({ seed: 'ex', width: 200, height: 120 });
    g.teleport(20, g.world.surfaceAt(20) - 1);
    run(g, 0.1);
    expect(g.explored.has(20, g.world.surfaceAt(20) - 2)).toBe(true);
    const data = new Float32Array(10 * 10).fill(0.9);
    expect(g.revealLit(new LightMap(150, 90, 10, 10, data), { x: 150, y: 90, w: 10, h: 10 })).toBe(100);
    expect(g.explored.has(155, 95)).toBe(true);
  });
  it('地圖標記：新增 / 移除，最多 20 個', () => {
    const g = new DelveGame({ seed: 'ex', width: 200, height: 120 });
    expect(g.toggleMarker(10, 10)).toBe('added');
    expect(g.markers).toEqual([{ x: 10, y: 10 }]);
    expect(g.toggleMarker(11, 10)).toBe('removed');
    expect(g.markers).toEqual([]);
  });
});

describe('探索（完整世界）', { timeout: 120_000 }, () => {
  let g: DelveGame;
  beforeAll(() => { g = new DelveGame({ seed: 'alpha' }); }, 120_000);

  it('傳送到小屋 → 發現事件（帶中文名字），日誌的「遺跡與建築」+1；同一處不再觸發', () => {
    const cabin = g.structures.find((s) => s.kind === 'cabin' && s.chest)!;
    const before = g.discovery.stats().cats.find((c) => c.cat === 'site')!.found;
    g.drainEvents();
    g.teleport(cabin.chest!.x + 1, cabin.chest!.y);
    run(g, 0.1);
    const ev = g.drainEvents().filter((e): e is Disc => e.type === 'discover');
    const site = ev.find((e) => e.region.kind === 'cabin');
    expect(site?.region.name).toMatch(/[一-鿿]/);
    expect(g.discovery.stats().cats.find((c) => c.cat === 'site')!.found).toBe(before + 1);
    run(g, 0.2);
    expect(g.drainEvents().some((e) => e.type === 'discover' && e.region.kind === 'cabin')).toBe(false);
  });
  it('古碑：讀一次收進日誌（first = true），再讀不重複計算', () => {
    const t = g.tablets[3];
    g.teleport(t.x + 1, t.y);
    run(g, 0.05);
    g.drainEvents();
    expect(g.interact(t.x, t.y)).toBe(true);
    const ev = g.drainEvents().find((e) => e.type === 'lore') as Extract<DelveEvent, { type: 'lore' }>;
    expect(ev.id).toBe(t.id);
    expect(ev.first).toBe(true);
    g.interact(t.x, t.y);
    const ev2 = g.drainEvents().find((e) => e.type === 'lore') as Extract<DelveEvent, { type: 'lore' }>;
    expect(ev2.first).toBe(false);
    expect(g.discovery.stats().lore).toEqual({ found: 1, total: 14 });
  });
  it('拿到珍寶（背包裡出現獨特道具）→ treasure 事件、日誌珍寶 +1', () => {
    g.drainEvents();
    g.give('magnet');
    run(g, 0.6);
    expect(g.drainEvents().some((e) => e.type === 'treasure' && e.item === 'magnet')).toBe(true);
    expect(g.discovery.treasures.has('magnet')).toBe(true);
  });
  it('最深紀錄與移動距離會累積', () => {
    const s0 = g.discovery.stats();
    const x = g.spawn.x + 40;
    g.teleport(x, g.world.surfaceAt(x) + 60);
    for (let y = g.world.surfaceAt(x) + 55; y < g.world.surfaceAt(x) + 64; y++) for (let dx = -3; dx <= 3; dx++) g.world.setFg(x + dx, y, T.AIR);
    run(g, 0.5);
    expect(g.discovery.stats().depthRecord).toBeGreaterThanOrEqual(58);
    g.setMoveX(1); run(g, 0.5); g.setMoveX(0);
    expect(g.discovery.stats().distance).toBeGreaterThan(s0.distance + 2);
  });
});
