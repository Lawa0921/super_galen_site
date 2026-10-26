// skyIsland.test.ts — 浮空島的繪製（legacy/worldgen.ts 搬過來的共用碼）畫在 gen2 的 BpCanvas 上
// （legacy 那一側的回歸網是 world.central.test.ts 與 legacy/worldgen*.test.ts 的雜湊）
import { describe, it, expect } from 'vitest';
import { Gen2Source } from '../index';
import { HRng } from '../hrng';
import { BpCanvas } from './bpCanvas';
import { drawSkyIsland } from './skyIsland';

describe('drawSkyIsland', () => {
  it('drawSkyIsland：箱子 sky、繩梯下端在 groundBelow − 3', () => {
    const cv = new BpCanvas({ x: 900, y: 200, w: 60, h: 140 }, new Gen2Source('si').profile);
    const r = drawSkyIsland(cv, { x0: 905, iw: 40, top: 230, thick: 10, noiseSeed: 7 }, new HRng(3, 4), () => 330);
    expect(r.rope).not.toBeNull(); expect(r.rope!.y1).toBe(327); expect(cv.toBlueprint(1, 'sky_island', 3).chests[0].kind).toBe('sky');
  });
  it('drawSkyIsland：groundBelow 回負數（下面不是實心地面）的欄不放繩梯；全部不行 → rope = null', () => {
    const cv = new BpCanvas({ x: 900, y: 200, w: 60, h: 140 }, new Gen2Source('si').profile);
    const r = drawSkyIsland(cv, { x0: 905, iw: 40, top: 230, thick: 10, noiseSeed: 7 }, new HRng(3, 4), () => -1);
    expect(r.rope).toBeNull(); expect(r.chest).toEqual(cv.toBlueprint(1, 'sky_island', 3).chests.map(({ x, y }) => ({ x, y }))[0]);
  });
});
