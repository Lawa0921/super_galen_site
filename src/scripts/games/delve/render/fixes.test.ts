// fixes.test.ts — render 層純邏輯：探索百分比精度、畫面附近判定、dirty chunk 與光照視窗相交、
// 操作說明是否已看過、手機預設縮放（每格 ≥ 16 CSS px）。
import { describe, it, expect } from 'vitest';
import { exploredLabel, nearRect, chunksTouchRect, helpSeen, HELP_KEY } from './model';
import { zoomScale, clampZoom } from './lowres';
import { CHUNK, TILE_SIZE } from '../engine/constants';

describe('exploredLabel', () => {
  it('不到 1% 顯示兩位小數；0 顯示 0%；之後一位小數', () => {
    expect(exploredLabel(0)).toBe('0%');
    expect(exploredLabel(52 * 19 / (4200 * 1200))).toBe('0.02%');
    expect(exploredLabel(0.00004)).toBe('<0.01%');
    expect(exploredLabel(0.0567)).toBe('5.7%');
    expect(exploredLabel(1)).toBe('100%');
  });
});

describe('nearRect / chunksTouchRect', () => {
  const view = { x: 100, y: 50, w: 60, h: 34 };
  it('tile 在視窗 + margin 內才算', () => {
    expect(nearRect(120, 60, view, 0)).toBe(true);
    expect(nearRect(165, 60, view, 8)).toBe(true);
    expect(nearRect(200, 60, view, 8)).toBe(false);
    expect(nearRect(120, 10, view, 8)).toBe(false);
  });
  it('dirty chunk 和光照視窗（含 margin）相交', () => {
    const chunksX = 10;
    const ci = (cx: number, cy: number): number => cy * chunksX + cx;
    // 視窗 tile 100..160 × 50..84 → chunk x 3..5、y 1..2（CHUNK=32）
    expect(CHUNK).toBe(32);
    expect(chunksTouchRect([ci(4, 2)], chunksX, view, 0)).toBe(true);
    expect(chunksTouchRect([ci(9, 9)], chunksX, view, 8)).toBe(false);
    expect(chunksTouchRect([], chunksX, view, 8)).toBe(false);
    // 剛好在視窗左邊 margin 內
    expect(chunksTouchRect([ci(2, 1)], chunksX, view, 8)).toBe(true);
    expect(chunksTouchRect([ci(1, 1)], chunksX, view, 8)).toBe(false);
  });
});

describe('helpSeen', () => {
  it('localStorage 有記號才算看過；讀取丟例外 = 沒看過', () => {
    expect(HELP_KEY).toBe('delve.help.seen');
    expect(helpSeen({ getItem: () => '1' })).toBe(true);
    expect(helpSeen({ getItem: () => null })).toBe(false);
    expect(helpSeen({ getItem: () => { throw new Error('private'); } })).toBe(false);
    expect(helpSeen(undefined)).toBe(false);
  });
});

describe('手機預設縮放', () => {
  it('390×844、DPR 3：每格至少 16 CSS px', () => {
    const k = zoomScale(1170, 2532, 0, 3);
    expect((TILE_SIZE * k) / 3).toBeGreaterThanOrEqual(16);
  });
  it('DPR 2.625（Android 412 寬）：每格至少 16 CSS px', () => {
    const k = zoomScale(1082, 2402, 0, 2.625);
    expect((TILE_SIZE * k) / 2.625).toBeGreaterThanOrEqual(16);
  });
  it('桌面 DPR 1 不變；沒給 DPR 時與舊行為相同', () => {
    expect(zoomScale(1920, 1080, 0, 1)).toBe(2);
    expect(zoomScale(1170, 2532, 0)).toBe(2);
    expect(clampZoom(0, 1170, 2532, 3)).toBe(0);
    // 手機上還是可以縮小一階
    expect(zoomScale(1170, 2532, -1, 3)).toBeLessThan(zoomScale(1170, 2532, 0, 3));
  });
});
