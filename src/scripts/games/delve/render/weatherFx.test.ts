// weatherFx.test.ts — 雨雪粒子：有上限、只在頭上是天空的欄生成（地下 / 屋頂下沒有）、落地消失、天空高度快取會失效
import { describe, it, expect } from 'vitest';
import { WeatherFx, RAIN_CAP } from './weatherFx';
import { World } from '../engine/world';
import { T } from '../engine/tiles';

function flat(): World {
  const w = new World(96, 96);
  for (let y = 40; y < 96; y++) for (let x = 0; x < 96; x++) w.fg[w.idx(x, y)] = T.STONE;
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
    for (let x = 0; x < 96; x++) w.fg[w.idx(x, 20)] = T.STONE; // 整片屋頂
    const fx = new WeatherFx(rnd);
    for (let i = 0; i < 60; i++) fx.update(1 / 60, view(w, 22 * 16));
    expect(fx.dropCount).toBe(0);
    for (let x = 0; x < 96; x++) w.fg[w.idx(x, 20)] = T.AIR;
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
});
