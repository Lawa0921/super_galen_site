// game.fishing.test.ts — 釣魚接進遊戲：拋竿（浮標拋物線、落水漂浮）、上鉤（浮標下沉 → 判定窗內按下才釣得起來）、
// 收竿、沒魚餌 / 熔岩不能釣、釣到 → 背包 + 日誌、木箱、料理（熔爐 / 營火）、吃東西回血、挖土掉蚯蚓。
import { describe, it, expect } from 'vitest';
import { DelveGame, type DelveEvent } from './game';
import { T, W } from './tiles';
import { LIQ } from './world';
import { FIXED_DT } from './constants';
import type { ItemId } from './items';
import { ITEMS } from './items';

const SMALL = { width: 160, height: 100 };

/** 玩家站在 x=40、地面 y=60；x 46..70 是一池深 6 格的水（或指定液體） */
function pond(type: number = LIQ.WATER): DelveGame {
  const g = new DelveGame({ seed: 'fishing', ...SMALL, peaceful: true });
  // 這些測試假設 1 級角色（小世界裡走幾步就會發現地區、升級）：不拿經驗
  g.levels.locked = true;
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.setLiquid(x, y, 0, LIQ.NONE);
  for (let y = 0; y < w.height; y++) for (let x = 30; x < 100; x++) { w.setFg(x, y, y >= 60 ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  for (let y = 0; y < w.height; y++) { w.setFg(29, y, T.STONE); w.setFg(100, y, T.STONE); }
  for (let y = 60; y < 66; y++) for (let x = 46; x <= 70; x++) { w.setFg(x, y, T.AIR); w.setLiquid(x, y, 255, type); }
  g.liquids.settle(200);
  g.teleport(40, 59);
  g.setDate({ season: 1, day: 2, hour: 12 });
  run(g, 0.2);
  g.drainEvents();
  return g;
}
function run(g: DelveGame, seconds: number): void {
  for (let i = 0, n = Math.round(seconds / FIXED_DT); i < n; i++) g.step(FIXED_DT);
}
function hold(g: DelveGame, item: ItemId, n = 1): void {
  g.give(item, n);
  const i = g.inventory.slots.findIndex((s) => s?.item === item);
  g.inventory.swap(i, 0);
  g.selectSlot(0);
}
function press(g: DelveGame): void { g.setUse(true); g.step(FIXED_DT); g.setUse(false); g.step(FIXED_DT); }
/** 對準水池中央拋竿，等浮標落水 */
function cast(g: DelveGame): void {
  g.setAim(54, 58);
  press(g);
  for (let k = 0; k < 240 && g.fishing?.state !== 'floating'; k++) g.step(FIXED_DT);
}
const fishEvents = (es: DelveEvent[]): Extract<DelveEvent, { type: 'fish' }>[] => es.filter((e): e is Extract<DelveEvent, { type: 'fish' }> => e.type === 'fish');

describe('釣魚', () => {
  it('拿釣竿 + 有魚餌按「使用」→ 拋出浮標，落水後漂在水面', () => {
    const g = pond();
    g.give('worm', 5);
    hold(g, 'wood_rod');
    cast(g);
    const f = g.fishing!;
    expect(f).not.toBeNull();
    expect(f.state).toBe('floating');
    expect(f.liquid).toBe(LIQ.WATER);
    const tx = Math.floor(f.x / 16), ty = Math.floor(f.y / 16);
    expect(tx).toBeGreaterThanOrEqual(46);
    expect(tx).toBeLessThanOrEqual(70);
    expect(ty).toBeGreaterThanOrEqual(59);
    expect(ty).toBeLessThanOrEqual(60);
    expect(fishEvents(g.drainEvents()).some((e) => e.phase === 'cast')).toBe(true);
  });

  it('沒有魚餌不能拋竿（提示）', () => {
    const g = pond();
    hold(g, 'wood_rod');
    g.setAim(54, 58);
    press(g);
    expect(g.fishing).toBeNull();
    expect(g.drainEvents().some((e) => e.type === 'blocked' && e.reason === 'bait')).toBe(true);
  });

  it('等到上鉤（浮標下沉）→ 判定窗內按下 → 釣到魚：進背包、魚餌少一隻、日誌記錄、事件', () => {
    const g = pond();
    g.give('worm', 5);
    hold(g, 'wood_rod');
    cast(g);
    g.drainEvents();
    // 自然等待：最多 15 秒內一定會上鉤
    let bit = false;
    for (let k = 0; k < 60 * 15 && !bit; k++) { g.step(FIXED_DT); bit = g.fishing?.state === 'bite'; }
    expect(bit).toBe(true);
    expect(fishEvents(g.drainEvents()).some((e) => e.phase === 'bite')).toBe(true);
    const before = g.inventory.slots.reduce((n, s) => n + (s && s.item !== 'wood_rod' && s.item !== 'worm' ? s.count : 0), 0);
    press(g);
    const es = fishEvents(g.drainEvents());
    const c = es.find((e) => e.phase === 'catch');
    expect(c).toBeDefined();
    expect(c!.item).toBeDefined();
    expect(g.inventory.count('worm')).toBe(4);
    const after = g.inventory.slots.reduce((n, s) => n + (s && s.item !== 'wood_rod' && s.item !== 'worm' ? s.count : 0), 0);
    expect(after).toBe(before + 1);
    expect(g.fishing).toBeNull();
    if (ITEMS[c!.item!].fish) expect(g.fishLog[c!.item!]).toBe(1);
  });

  it('debug 強制上鉤；錯過判定窗 → 魚跑掉（魚餌不扣），浮標還在、重新等', () => {
    const g = pond();
    g.give('worm', 3);
    hold(g, 'wood_rod');
    cast(g);
    g.debugForceBite();
    expect(g.fishing!.state).toBe('bite');
    run(g, 1.2);
    expect(fishEvents(g.drainEvents()).some((e) => e.phase === 'escape')).toBe(true);
    expect(g.fishing!.state).toBe('floating');
    expect(g.inventory.count('worm')).toBe(3);
  });

  it('還沒上鉤就按 → 收竿，什麼都沒釣到', () => {
    const g = pond();
    g.give('worm', 3);
    hold(g, 'wood_rod');
    cast(g);
    press(g);
    expect(g.fishing).toBeNull();
    expect(fishEvents(g.drainEvents()).some((e) => e.phase === 'reel')).toBe(true);
    expect(g.inventory.count('worm')).toBe(3);
  });

  it('debug 指定漁獲：釣起來就是那一條', () => {
    const g = pond();
    g.give('worm', 3);
    hold(g, 'wood_rod');
    cast(g);
    g.debugForceBite('brook_trout');
    press(g);
    expect(g.inventory.count('brook_trout')).toBe(1);
    expect(g.fishLog.brook_trout).toBe(1);
  });

  it('熔岩：一般釣竿的浮標會燒掉；燼線釣竿可以釣到熔岩魚', () => {
    const g = pond(LIQ.LAVA);
    g.equip('magma_ward');
    g.give('worm', 5);
    hold(g, 'wood_rod');
    cast(g);
    expect(g.fishing).toBeNull();
    expect(fishEvents(g.drainEvents()).some((e) => e.phase === 'burn')).toBe(true);
    hold(g, 'cinder_rod');
    cast(g);
    expect(g.fishing?.state).toBe('floating');
    g.debugForceBite();
    press(g);
    const c = fishEvents(g.drainEvents()).find((e) => e.phase === 'catch');
    expect(['cinder_snapper', 'obsidian_eel', 'obsidian']).toContain(c?.item);
  });

  it('走太遠 → 線斷了自動收竿', () => {
    const g = pond();
    g.give('worm', 3);
    hold(g, 'wood_rod');
    cast(g);
    g.teleport(90, 59);
    run(g, 0.1);
    expect(g.fishing).toBeNull();
  });

  it('木箱：按「使用」打開 → 戰利品進背包、木箱少一個', () => {
    const g = pond();
    hold(g, 'wooden_crate', 2);
    press(g);
    expect(g.inventory.count('wooden_crate')).toBe(1);
    expect(g.inventory.count('copper_coin') + g.inventory.count('silver_coin')).toBeGreaterThan(0);
  });

  it('料理：熔爐或營火旁把魚烤成烤魚；吃了回血（滿血不能吃）', () => {
    const g = pond();
    g.give('reed_perch', 2);
    expect(g.craft('grilled_fish_reed_perch').ok).toBe(false);
    g.world.setFg(41, 59, T.CAMPFIRE);
    expect(g.stations().campfire).toBe(true);
    expect(g.craft('grilled_fish_reed_perch').ok).toBe(true);
    expect(g.inventory.count('grilled_fish')).toBe(1);
    hold(g, 'grilled_fish'); // hold 會再給一個 → 2
    press(g);
    expect(g.inventory.count('grilled_fish')).toBe(2);
    expect(g.drainEvents().some((e) => e.type === 'blocked' && e.reason === 'full_hp')).toBe(true);
    g.hp = 40;
    press(g);
    expect(g.inventory.count('grilled_fish')).toBe(1);
    expect(g.hp).toBeGreaterThanOrEqual(40 + (ITEMS.grilled_fish.food ?? 0) - 1);
  });

  it('挖泥土 / 草地偶爾掉蚯蚓（大約 1/12）', () => {
    const g = pond();
    let worms = 0;
    for (let k = 0; k < 600; k++) {
      g.world.setFg(38, 61, T.DIRT);
      g.mineInstant(38, 61);
    }
    run(g, 0.5);
    worms = g.inventory.count('worm') + g.drops.list.filter((d) => d.item === 'worm').reduce((n, d) => n + d.count, 0);
    expect(worms).toBeGreaterThan(20);
    expect(worms).toBeLessThan(110);
  });

  it('打草叢：晚上掉螢火蟲、白天掉蚱蜢', () => {
    const g = pond();
    let day = 0, night = 0;
    for (let k = 0; k < 300; k++) { g.world.setFg(38, 59, T.TALL_GRASS); g.mineInstant(38, 59); }
    day = g.inventory.count('grasshopper');
    g.setDate({ hour: 23 });
    for (let k = 0; k < 300; k++) { g.world.setFg(38, 59, T.TALL_GRASS); g.mineInstant(38, 59); }
    night = g.inventory.count('firefly');
    expect(day).toBeGreaterThan(5);
    expect(night).toBeGreaterThan(5);
    expect(g.inventory.count('firefly')).toBeGreaterThan(0);
  });
});
