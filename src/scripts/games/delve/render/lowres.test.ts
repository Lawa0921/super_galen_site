// lowres.test.ts — 像素完美管線的純邏輯：整數倍率、低解析緩衝尺寸、鏡頭對齊美術像素、光照分階 + 抖動。
import { describe, it, expect } from 'vitest';
import { LIGHT_LEVELS, bufferSize, lightLevel, pickScale, quantizeLevel, snapCam, snapPx, zoomScale, clampZoom, parseZoomPref, MAX_ZOOM_OFFSET } from './lowres';

describe('pickScale（裝置 px → 整數倍率，短邊約 520 美術 px）', () => {
  it('常見桌面解析度：1080p 看到 60 格寬、720p 40 格寬', () => {
    expect(pickScale(1280, 720)).toBe(2);   // 640×360 美術 px = 40 格寬
    expect(pickScale(1920, 1080)).toBe(2);  // 960×540 = 60 格寬
    expect(pickScale(2560, 1440)).toBe(3);  // 853×480
    expect(pickScale(3840, 2160)).toBe(4);  // 960×540
  });
  it('直式手機以短邊（寬）為準', () => {
    expect(pickScale(1170, 2532)).toBe(2);  // 585 美術 px 寬
    expect(pickScale(780, 1688)).toBe(2);   // 390
  });
  it('永遠是 ≥1 的整數', () => {
    for (const [w, h] of [[1, 1], [300, 200], [1366, 768], [1536, 864], [999, 777], [5000, 3000]]) {
      const k = pickScale(w, h);
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(1);
    }
    expect(pickScale(300, 200)).toBe(1);
  });
});

describe('bufferSize', () => {
  it('無條件進位，放大後蓋滿畫布', () => {
    expect(bufferSize(1920, 1080, 3)).toEqual({ w: 640, h: 360 });
    expect(bufferSize(1366, 768, 2)).toEqual({ w: 683, h: 384 });
    expect(bufferSize(1367, 769, 2)).toEqual({ w: 684, h: 385 });
  });
});

describe('鏡頭對齊整數美術像素', () => {
  it('四捨五入且不產生 -0', () => {
    expect(snapCam({ x: 10.4, y: 20.6 })).toEqual({ x: 10, y: 21 });
    const c = snapCam({ x: -0.4, y: -0.2 });
    expect(Object.is(c.x, -0)).toBe(false);
    expect(Object.is(c.y, -0)).toBe(false);
  });
  it('視差層位移也對齊', () => {
    expect(snapPx(123.5 * 0.28)).toBe(Math.round(123.5 * 0.28));
    expect(Number.isInteger(snapPx(7.77))).toBe(true);
  });
});

describe('光照分階', () => {
  const L = LIGHT_LEVELS;
  it('6–8 階', () => {
    expect(L).toBeGreaterThanOrEqual(6);
    expect(L).toBeLessThanOrEqual(8);
  });
  it('端點與剛好落在階上的值不抖動', () => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      expect(lightLevel(0, x, y)).toBe(0);
      expect(lightLevel(1, x, y)).toBe(L - 1);
      expect(lightLevel(3 / (L - 1), x, y)).toBe(3);
      expect(lightLevel(-0.5, x, y)).toBe(0);
      expect(lightLevel(2, x, y)).toBe(L - 1);
    }
  });
  it('兩階正中間：4×4 Bayer 抖動，約一半一半，只用相鄰兩階', () => {
    const a = 3.5 / (L - 1);
    const seen: number[] = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) seen.push(lightLevel(a, x, y));
    expect(new Set(seen)).toEqual(new Set([3, 4]));
    expect(seen.filter((v) => v === 4).length).toBe(8);
  });
  it('接近階的值是平台（不抖動），只有階與階之間的過渡帶才抖動', () => {
    const near = (3 + 0.15) / (L - 1);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) expect(lightLevel(near, x, y)).toBe(3);
  });
  it('對 a 單調、圖樣以座標 &3 週期重複（世界錨定、不閃爍）', () => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      let prev = -1;
      for (let a = 0; a <= 1.0001; a += 0.01) {
        const v = lightLevel(a, x, y);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
      expect(lightLevel(0.37, x, y)).toBe(lightLevel(0.37, x + 4, y + 8));
    }
  });
  it('quantizeLevel：整體亮度（晝夜）直接吸附到階上', () => {
    expect(quantizeLevel(0)).toBe(0);
    expect(quantizeLevel(1)).toBe(1);
    const q = quantizeLevel(0.3);
    expect(Math.abs(q * (L - 1) - Math.round(q * (L - 1)))).toBeLessThan(1e-9);
    expect(Math.abs(q - 0.3)).toBeLessThanOrEqual(0.5 / (L - 1) + 1e-9);
  });
});

describe('縮放等級（整數倍率）', () => {
  it('offset 0 = 預設倍率；+ 放大（倍率變大）、− 縮小', () => {
    expect(zoomScale(1920, 1080, 0)).toBe(2);
    expect(zoomScale(1920, 1080, 1)).toBe(3);
    expect(zoomScale(1920, 1080, -1)).toBe(1);
    expect(zoomScale(3840, 2160, -2)).toBe(2);
  });
  it('倍率夾在 1 .. 短邊 / 160（不會放到看不見東西）', () => {
    expect(zoomScale(1920, 1080, -5)).toBe(1);
    expect(zoomScale(1920, 1080, 9)).toBe(6);
    expect(zoomScale(1280, 720, 9)).toBe(4);
    for (const z of [-4, -1, 0, 2, 4]) expect(Number.isInteger(zoomScale(1366, 768, z))).toBe(true);
  });
  it('clampZoom 把 offset 收斂到有效範圍（重複按不會累積）', () => {
    expect(clampZoom(-7, 1920, 1080)).toBe(-1);
    expect(clampZoom(7, 1920, 1080)).toBe(4);
    expect(clampZoom(0, 1920, 1080)).toBe(0);
  });
  it('localStorage 偏好解析：壞值回 0', () => {
    expect(parseZoomPref('1')).toBe(1);
    expect(parseZoomPref('-2')).toBe(-2);
    expect(parseZoomPref(null)).toBe(0);
    expect(parseZoomPref('abc')).toBe(0);
    expect(parseZoomPref('1.5')).toBe(0);
    expect(parseZoomPref('99')).toBe(MAX_ZOOM_OFFSET);
  });
});
