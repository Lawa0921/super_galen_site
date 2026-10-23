// liquid.perf.test.ts — LiquidSim 效能基準（1b M1 Task 1）：舊世界出生點 ±200 欄全醒，量每步耗時中位數
import { it, expect } from 'vitest';
import { DelveGame } from './game';

it('LiquidSim 基準：舊世界出生點 ±200 欄全醒，120 步', () => {
  const g = new DelveGame({ seed: 'liq-perf' }); // 正式尺寸、舊生成器
  const sx = g.spawn.x;
  g.liquids.wakeRect(sx - 200, 0, sx + 200, g.world.height);
  const t: number[] = [];
  for (let k = 0; k < 120; k++) { const t0 = performance.now(); g.liquids.step(); t.push(performance.now() - t0); }
  t.sort((a, b) => a - b);
  console.info('[liquid baseline] median ms/step', t[60].toFixed(3));
  expect(t[60]).toBeLessThan(50);
}, 60_000);
