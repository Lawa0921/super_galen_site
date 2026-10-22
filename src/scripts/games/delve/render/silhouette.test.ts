// silhouette.test.ts — 暗處怪物剪影：身體壓暗（但不低於可辨識的下限）、眼睛保持亮色、全部色票色、不透明
import { describe, it, expect } from 'vitest';
import { Bmp, hex, inPalette, luma } from './pixel';
import { silhouetteBmp, SILHOUETTE_FLOOR, EYE_COLORS, silhouetteWanted } from './enemyArt';

describe('silhouetteBmp', () => {
  const src = new Bmp(4, 1);
  src.set(0, 0, hex('#93cc50'));   // 亮綠身體
  src.set(1, 0, hex('#1c1424'));   // INK 描邊
  src.set(2, 0, EYE_COLORS[0]);    // 眼睛
  // (3,0) 透明
  const out = silhouetteBmp(src);
  it('透明像素保持透明；其他全部不透明、在色票上', () => {
    expect(out.alpha(3, 0)).toBe(0);
    for (let x = 0; x < 3; x++) { expect(out.alpha(x, 0)).toBe(255); expect(inPalette(out.get(x, 0))).toBe(true); }
  });
  it('身體壓暗，但不低於剪影下限', () => {
    const body = out.get(0, 0);
    expect(luma(body)).toBeLessThan(luma(hex('#93cc50')));
    expect(luma(body)).toBeGreaterThanOrEqual(luma(SILHOUETTE_FLOOR) - 1);
  });
  it('眼睛保持原色（在黑暗中閃一下）', () => {
    expect(out.get(2, 0)).toEqual(EYE_COLORS[0]);
  });
});

describe('silhouetteWanted', () => {
  it('玩家 12 格內、而且所在處夠暗才畫剪影', () => {
    expect(silhouetteWanted(5, 0.05)).toBe(true);
    expect(silhouetteWanted(5, 0.8)).toBe(false);
    expect(silhouetteWanted(13, 0.05)).toBe(false);
  });
});
