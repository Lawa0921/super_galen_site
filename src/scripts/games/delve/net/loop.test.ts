// loop.test.ts — NetLoop：背景節流不掉速、單次上限、stop；搭配真的 NetHost 不需要任何 rAF。
import { describe, it, expect } from 'vitest';
import { DelveGame } from '../engine/game';
import { T, W } from '../engine/tiles';
import { LIQ, BIOME } from '../engine/world';
import { HOST_MAX_FRAME_S, LOOP_EVERY_MS, NetLoop, type Ticker } from './loop';
import { NetHost } from './host';

class FakeTicker implements Ticker {
  cb: ((n: number) => void) | null = null;
  every = 0;
  start(cb: (n: number) => void, every: number): void { this.cb = cb; this.every = every; }
  stop(): void { this.cb = null; }
  fire(now: number): void { this.cb?.(now); }
}

function setup(): { t: FakeTicker; steps: number[]; loop: NetLoop } {
  const t = new FakeTicker();
  const steps: number[] = [];
  const loop = new NetLoop(t, (_n, s) => { steps.push(s); });
  loop.start();
  return { t, steps, loop };
}
const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);

describe('NetLoop', () => {
  it('以 LOOP_EVERY_MS 啟動計時器；running 反映狀態', () => {
    const { t, loop } = setup();
    expect(t.every).toBe(LOOP_EVERY_MS);
    expect(loop.running).toBe(true);
    loop.stop();
    expect(loop.running).toBe(false);
  });

  it('每 16.67 ms 觸發 60 次 → 共 60 步', () => {
    const { t, steps } = setup();
    t.fire(0);
    for (let i = 1; i <= 60; i++) t.fire(i * LOOP_EVERY_MS);
    expect(sum(steps)).toBe(60);
  });

  it('背景節流：每 1000 ms 觸發一次、共 30 次 → 每次 60 步、共 1800', () => {
    const { t, steps } = setup();
    t.fire(0);
    for (let i = 1; i <= 30; i++) t.fire(i * 1000);
    expect(steps.slice(1).every((s) => s === 60)).toBe(true);
    expect(sum(steps)).toBe(1800);
  });

  it('一次間隔 5000 ms 只補 HOST_MAX_FRAME_S 的步數（60）', () => {
    expect(HOST_MAX_FRAME_S).toBe(1);
    const { t, steps } = setup();
    t.fire(0);
    t.fire(5000);
    expect(steps[1]).toBe(60);
    t.fire(5000 + LOOP_EVERY_MS);
    expect(steps[2]).toBe(1); // 超出上限的時間不累積成債
  });

  it('stop() 後 fire 不再呼叫 run', () => {
    const { t, steps, loop } = setup();
    t.fire(0);
    t.fire(1000);
    const n = steps.length;
    loop.stop();
    t.fire(2000);
    expect(steps.length).toBe(n);
  });

  it('NetLoop + 真的 NetHost：沒有 rAF，30 次 1 秒觸發後 time ≥ 29.9 秒、tick +1800', () => {
    const game = new DelveGame({ seed: 'host', width: 160, height: 100 });
    const w = game.world;
    game.liquids.setSprings([]);
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
      w.setLiquid(x, y, 0, LIQ.NONE);
      w.setFg(x, y, y >= 60 ? T.STONE : T.AIR);
      w.setWall(x, y, W.NONE);
    }
    for (let x = 0; x < w.width; x++) { w.surface[x] = 60; w.biome[x] = BIOME.FOREST; }
    game.spawn.x = 40; game.spawn.y = 59;
    game.teleport(40, 59);
    game.setDate({ season: 1, day: 2, hour: 12 });
    game.peaceful = true;
    game.drainEvents();
    const host = new NetHost(game, { build: 'b', worldId: 'w1', visits: { get: () => undefined, put: () => {} } });
    host.open();
    const t = new FakeTicker();
    const loop = new NetLoop(t, (n, s) => host.frame(n, s));
    loop.start();
    const time0 = game.time, tick0 = game.tick;
    t.fire(0);
    for (let i = 1; i <= 30; i++) t.fire(i * 1000);
    expect(game.tick - tick0).toBe(1800);
    expect(game.time - time0).toBeGreaterThanOrEqual(29.9);
  });
});
