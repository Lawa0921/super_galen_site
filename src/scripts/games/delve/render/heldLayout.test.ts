// heldLayout.test.ts — 握點避開臉：手持物碰到「眼睛 + 嘴」那一塊就往前推到剛好碰不到
import { describe, it, expect } from 'vitest';
import { Bmp, hex } from './pixel';
import { clearShift, clearShiftAll, faceGuard, spansOf } from './heldLayout';
import { AV_HEAD } from './avatarArt';
import { EYE_FRONT, EYE_Y, MOUTH_Y } from './avatarHead';

const bar = (w: number, h: number): Bmp => { const b = new Bmp(w, h); b.rect(0, 0, w, h, hex('#ffffff')); return b; };
describe('握點避開臉', () => {
  const r = faceGuard();
  it('臉上那一塊包住前眼和嘴', () => {
    expect(r.x0).toBeLessThanOrEqual(AV_HEAD.x + EYE_FRONT);
    expect(r.x1).toBeGreaterThanOrEqual(AV_HEAD.x + EYE_FRONT + 3);
    expect(r.y0).toBeLessThanOrEqual(AV_HEAD.y + EYE_Y);
    expect(r.y1).toBeGreaterThanOrEqual(AV_HEAD.y + MOUTH_Y + 1);
  });
  it('碰得到 → 往前推到左緣剛好在那一塊外面；碰不到 → 0', () => {
    const s = spansOf(bar(3, 10));
    const dx = clearShift(s, r.x0 + 2, r.y0, r);
    expect(r.x0 + 2 + dx).toBe(r.x1 + 1);
    expect(clearShift(s, r.x1 + 1, r.y0, r)).toBe(0);
    // 在那一塊的上面 / 下面：不用推
    expect(clearShift(s, r.x0, r.y1 + 1, r)).toBe(0);
    expect(clearShift(s, r.x0, r.y0 - 10, r)).toBe(0);
    // 整個在那一塊的後面（左邊）：不用推
    expect(clearShift(s, r.x0 - 4, r.y0, r)).toBe(0);
  });
  it('同一隻手上好幾樣東西：一起推、取最大的', () => {
    const a = spansOf(bar(2, 2)), b = spansOf(bar(2, 2));
    expect(clearShiftAll([{ s: a, x: r.x0, y: r.y0 }, { s: b, x: r.x1 - 1, y: r.y0 }], r)).toBe(r.x1 + 1 - r.x0);
  });
});
