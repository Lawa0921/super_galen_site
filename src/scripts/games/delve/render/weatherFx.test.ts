// weatherFx.test.ts — 雨雪粒子：有上限、只在頭上是天空的欄生成（地下 / 屋頂下沒有）、落地消失、天空高度快取會失效
import { describe, it, expect } from 'vitest';
import { WeatherFx, RAIN_CAP } from './weatherFx';
import { World } from '../engine/world';
import { T } from '../engine/tiles';

function flat(): World {
  const w = new World(96, 96);
  for (let y = 40; y < 96; y++) for (let x = 0; x < 96; x++) w.setFg(x, y, T.STONE);
  return w;
}
const view = (w: World, camY: number, kind: 'rain' | 'snow' | null = 'rain') => ({
  world: w, camX: 0, camY, vw: 640, vh: 360, kind, storm: false, intensity: 1, wind: 0.3, light: 1,
});
let seed = 1;
const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

describe('WeatherFx 雨雪', () => {
  it('地表：有雨、數量有上限', () => {
    const w = flat(), fx = new WeatherFx(rnd);
    for (let i = 0; i < 120; i++) fx.update(1 / 60, view(w, 40 * 16 - 300));
    expect(fx.dropCount).toBeGreaterThan(50);
    expect(fx.dropCount).toBeLessThanOrEqual(RAIN_CAP);
  });
  it('地下（畫面在地表下）：一滴都不生', () => {
    const w = flat(), fx = new WeatherFx(rnd);
    for (let i = 0; i < 120; i++) fx.update(1 / 60, view(w, 60 * 16));
    expect(fx.dropCount).toBe(0);
  });
  it('屋頂下的欄不生雨；拆掉屋頂（invalidate）後就會下', () => {
    const w = flat();
    for (let x = 0; x < 96; x++) w.setFg(x, 20, T.STONE); // 整片屋頂
    const fx = new WeatherFx(rnd);
    for (let i = 0; i < 60; i++) fx.update(1 / 60, view(w, 22 * 16));
    expect(fx.dropCount).toBe(0);
    for (let x = 0; x < 96; x++) w.setFg(x, 20, T.AIR);
    fx.invalidate(w, [0, 1, 2]);
    for (let i = 0; i < 60; i++) fx.update(1 / 60, view(w, 22 * 16));
    expect(fx.dropCount).toBeGreaterThan(0);
  });
  it('停雨後粒子會落地消失', () => {
    const w = flat(), fx = new WeatherFx(rnd);
    for (let i = 0; i < 60; i++) fx.update(1 / 60, view(w, 40 * 16 - 300));
    for (let i = 0; i < 120; i++) fx.update(1 / 60, view(w, 40 * 16 - 300, null));
    expect(fx.dropCount).toBe(0);
  });
  it('負 x 的欄（無限世界）：算得出 skyTop；沒常駐的欄不快取，卸載後 prune 會丟掉', () => {
    const w = new World(96, 96, { bounds: 'infinite' });
    w.ensureColumn(-1);
    for (let y = 40; y < 96; y++) for (let x = -32; x < 0; x++) w.setFg(x, y, T.STONE);
    w.setFg(-7, 30, T.STONE);
    const fx = new WeatherFx(rnd);
    expect(fx.top(w, -10)).toBe(40);
    expect(fx.top(w, -7)).toBe(30);
    expect(fx.top(w, -32)).toBe(40);
    expect(fx.cachedSkyColumns()).toContain(-1);
    // 第 -2 欄沒常駐（讀到 = 石頭）：回 0（頭上被擋住、不下雨），但不留快取
    expect(fx.top(w, -40)).toBe(0);
    expect(fx.cachedSkyColumns()).not.toContain(-2);
    // 載入後（renderer 會收到 dirty → invalidate）就算得出真的高度
    w.ensureColumn(-2);
    fx.invalidate(w, w.drainDirty());
    expect(fx.top(w, -40)).toBe(96); // 新欄沒有 source = 全空氣 → 一路到底
    expect(fx.cachedSkyColumns()).toContain(-2);
    w.unloadColumn(-2);
    fx.prune(w);
    expect(fx.cachedSkyColumns()).not.toContain(-2);
    expect(fx.cachedSkyColumns()).toContain(-1);
  });
});
