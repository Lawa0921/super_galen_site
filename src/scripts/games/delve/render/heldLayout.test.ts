// heldLayout.test.ts — 握點避開臉：手持物碰到「眼睛 + 嘴」那一塊就往前推到剛好碰不到
import { describe, it, expect } from 'vitest';
import { Bmp, hex } from './pixel';
import { clearShift, clearShiftAll, faceGuard, spansOf } from './heldLayout';
import { AV_HEAD, avatarFrame, raceHeadDy } from './avatarArt';
import { EYE_FRONT, EYE_Y, MOUTH_Y } from './avatarHead';
import { RACES, bodyDefaults } from '../engine/appearance';
import { plainLook } from '../engine/doll';
import { MOUTH, MOUTH_RED, eyeRamp } from './avatarPalette';

const bar = (w: number, h: number): Bmp => { const b = new Bmp(w, h); b.rect(0, 0, w, h, hex('#ffffff')); return b; };
for (const [who, headDy] of [['人類', 0], ['矮人', raceHeadDy('dwarf')]] as const) describe(`握點避開臉（${who}）`, () => {
  const r = faceGuard(0, 0, headDy);
  it('臉上那一塊包住前眼和嘴', () => {
    expect(r.x0).toBeLessThanOrEqual(AV_HEAD.x + EYE_FRONT);
    expect(r.x1).toBeGreaterThanOrEqual(AV_HEAD.x + EYE_FRONT + 3);
    expect(r.y0).toBeLessThanOrEqual(AV_HEAD.y + EYE_Y + headDy);
    expect(r.y1).toBeGreaterThanOrEqual(AV_HEAD.y + MOUTH_Y + 1 + headDy);
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
describe('種族的頭部位移', () => {
  it('faceGuard 的 headDy：整塊往下移', () => {
    const a = faceGuard(1, 1), b = faceGuard(1, 1, 2);
    expect(b).toEqual({ ...a, y0: a.y0 + 2, y1: a.y1 + 2 });
  });
  it('每個種族、兩種體型、待機 / 走路：影格裡真正的眼睛和嘴都在 faceGuard(meta.dx, meta.dy) 裡（矮人的 meta.dy 已含 raceHeadDy）', () => {
    const e = new Set([...eyeRamp(1).slice(0, 2), MOUTH, MOUTH_RED].map((c) => c.join()));
    for (let race = 0; race < RACES.length; race++) for (const body of [0, 1]) for (const [an, f] of [['idle', 0], ['idle', 2], ['walk', 1], ['walk', 5]] as const) {
      const fr = avatarFrame(plainLook({ ...bodyDefaults(body), eyes: 1, race }), an, f), g = faceGuard(fr.meta.dx, fr.meta.dy);
      let n = 0;
      for (let y = 0; y < fr.face!.h; y++) for (let x = 0; x < fr.face!.w; x++) {
        if (!fr.face!.on(x, y) || !e.has(fr.face!.get(x, y).join())) continue;
        n++;
        expect(x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1, `${RACES[race].id} body ${body} ${an}${f} (${x},${y})`).toBe(true);
      }
      expect(n).toBeGreaterThan(6);
    }
  });
});
