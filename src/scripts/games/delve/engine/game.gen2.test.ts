// game.gen2.test.ts — Task 13：DelveGame 的世界開機。預設（沒給 worldGen）仍是舊世界；worldGen gen2 = 不建中央、只載入出生點附近。
import { describe, expect, it } from 'vitest';
import { DelveGame } from './game';
import { FIXED_DT } from './constants';
import { BIOME } from './world';
import { SEA_Y } from './gen2/profile';
import { Gen2Source } from './gen2';

describe('DelveGame 世界開機', () => {
  it('預設仍是舊世界：genVersion 7、genKind legacy', () => {
    const g = new DelveGame({ seed: 'd', width: 160, height: 100 });
    expect(g.genVersion).toBe(7);
    expect(g.genKind).toBe('legacy');
    expect(g.gen2()).toBeNull();
    expect(g.layers).not.toBeNull();
    expect(g.dungeonZone).not.toBeNull();
  });

  it('gen2 世界：不建中央、只載入出生點附近、站在地上、genVersion 8', () => {
    const t0 = performance.now();
    const g = new DelveGame({ seed: 'g2', worldGen: { kind: 'gen2' } });
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(g.genVersion).toBe(8);
    expect(g.genKind).toBe('gen2');
    expect(g.gen2()).toBeInstanceOf(Gen2Source);
    expect(g.gen2()).toBe(g.world.source);
    expect(g.world.centralArrays).toBe(false);
    expect(g.spawn.x).toBe(2100);
    expect(g.world.isSolid(2100, g.spawn.y + 1)).toBe(true);
    expect(g.world.isSolid(2100, g.spawn.y)).toBe(false);
    expect(g.world.isResident(0)).toBe(false);
    expect(g.world.residentColumns().length).toBeLessThanOrEqual(2 * 8 + 1);
    // 其餘內容空 / null
    expect(g.layers).toBeNull();
    expect(g.dungeonZone).toBeNull();
    expect(g.dungeon).toBeNull();
    expect(g.regions).toEqual([]);
    expect(g.villages).toEqual([]);
    // 出生點那顆碑在 spawn.x + 7 的地表上（surfaceAt，不讀長度 0 的 surface 陣列）
    const home = g.waystones.byId(0)!;
    expect(home.x).toBe(2107);
    expect(home.y).toBe(g.world.surfaceAt(2107) - 1);
    expect(Number.isFinite(home.y)).toBe(true);
    for (let k = 0; k < 120; k++) g.step(FIXED_DT);
    expect(g.world.regionAt(2100).kind).toBe('home');
    g.teleport(4200 + 100, SEA_Y - 2);
    g.step(FIXED_DT);
    expect(g.world.biomeAt(4300)).toBe(BIOME.OCEAN);
  }, 30000);

  it('gen2 世界只接受正式尺寸', () => {
    expect(() => new DelveGame({ seed: 'x', width: 200, height: 100, worldGen: { kind: 'gen2' } })).toThrow(RangeError);
    expect(() => new DelveGame({ seed: 'x', height: 600, worldGen: { kind: 'gen2' } })).toThrow(RangeError);
  });

  it('gen2 客人副本：鎖表凍結、不記新鎖', () => {
    const g = new DelveGame({ seed: 'g2', worldGen: { kind: 'gen2' }, mode: 'replica' });
    const src = g.gen2()!;
    expect(src.locks.toJSON()).toEqual([]);
    const h = new DelveGame({ seed: 'g2', worldGen: { kind: 'gen2' } });
    expect(h.gen2()!.locks.toJSON().length).toBeGreaterThan(0);
  }, 30000);
});
