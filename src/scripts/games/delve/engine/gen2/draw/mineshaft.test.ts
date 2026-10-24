// mineshaft.test.ts — 礦坑 + 密室的繪製（legacy/worldgen.ts 搬過來的共用碼）畫在 gen2 的 BpCanvas 上
// （legacy 那一側的回歸網是 world.central.test.ts 與 legacy/worldgen*.test.ts 的雜湊）
import { describe, it, expect } from 'vitest';
import { Gen2Source } from '../index';
import { HRng } from '../hrng';
import { KEEP, type Blueprint } from '../bpcore';
import { BpCanvas } from './bpCanvas';
import { drawMineshaft, drawSecretRoom } from './mineshaft';
import { T, LIGHT_LUT } from '../../tiles';

// "x,y" → fg（只收畫了 fg 的格）
function cellMap(b: Blueprint): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < b.cells.length; i += 5) if (b.cells[i + 2] !== KEEP) m.set(`${b.cells[i]},${b.cells[i + 1]}`, b.cells[i + 2]);
  return m;
}
// 會發光的 tile（tiles.ts 的 LIGHT_LUT > 0）
const GLOWING = new Set<number>(Object.values(T).filter((t) => LIGHT_LUT[t] > 0));

describe('drawMineshaft / drawSecretRoom', () => {
  it('drawSecretRoom 在 BpCanvas 上：裂紋石塞 2 格厚 × 4 列、secret 箱、密室裡沒有發光 tile（坑道本身有火把）', () => {
    const src = new Gen2Source('sr'), x0 = 3000, yTop = src.profile.surfaceAt(x0) + 60, cv = new BpCanvas({ x: x0 - 20, y: yTop - 10, w: 140, h: 24 }, src.profile);
    drawMineshaft(cv, { x0, len: 80, yTop }, new HRng(1, 2)); const r = drawSecretRoom(cv, { shaftX0: x0, shaftLen: 80, yTop, right: true, rw: 10 }, new HRng(1, 3));
    const b = cv.toBlueprint(1, 'mineshaft', 1), at = cellMap(b);
    for (let y = yTop; y < yTop + 4; y++) for (const dx of [0, 1]) expect(at.get(`${x0 + 80 + dx},${y}`)).toBe(T.CRACKED_STONE);
    expect(b.chests.find((c) => c.x === r.chest.x)!.kind).toBe('secret');
    expect(r).toMatchObject({ x: x0 + 82, y: yTop - 2, w: 10, h: 6 });
    // 密室（塞子起往右）不放發光物；坑道那一段有火把（所以檢查不是空的）
    const glow = [...at.entries()].filter(([, t]) => GLOWING.has(t)).map(([k]) => Number(k.split(',')[0]));
    expect(glow.length).toBeGreaterThan(0);
    expect(glow.every((x) => x < x0 + 80)).toBe(true);
  });
});
