// background.sun.test.ts — 日 / 月在天上的位置只看時間：鏡頭上下 / 左右移動（遠景剪影跟著視差移動）時，太陽不能跟著山的稜線上下跳。
import { describe, it, expect, afterAll } from 'vitest';
import { installFakeCanvas, mainCanvas, type FakeCanvas } from './fakeCanvas';
import { Background, type BgView } from './background';

const restore = installFakeCanvas();
afterAll(() => restore());

const view = (camX: number, camY: number, dayFrac: number): BgView => ({
  viewW: 480, viewH: 270, camX, camY, horizonY: 2000, time: 0, dayFrac,
});

/** 太陽（或月亮）這一幀畫在哪：回傳 [x, y] */
function sunAt(bg: Background, v: BgView): [number, number] {
  const c = mainCanvas();
  bg.draw(c.ctx, v);
  const sun = (bg as unknown as { sun: FakeCanvas }).sun;
  const hit = c.calls.find((e) => e[0] === 'drawImage' && e[1] === sun);
  if (!hit) throw new Error('沒畫太陽');
  return [hit[3] as number, hit[4] as number];
}

describe('太陽位置不跟著遠景剪影', () => {
  for (const [name, d] of [['日出後不久', 0.27], ['上午', 0.35], ['日落前', 0.73]] as const) {
    it(`${name}：鏡頭上下移動，太陽不動`, () => {
      const bg = new Background(7);
      const ref = sunAt(bg, view(5000, 2000 - 135, d));
      for (const camY of [1500, 1700, 1900, 2100, 2300]) expect(sunAt(bg, view(5000, camY, d))).toEqual(ref);
    });
    it(`${name}：鏡頭左右移動，太陽不動`, () => {
      const bg = new Background(7);
      const ref = sunAt(bg, view(5000, 1865, d));
      for (const camX of [4000, 4317, 4650, 5333, 6100]) expect(sunAt(bg, view(camX, 1865, d))).toEqual(ref);
    });
  }
});
