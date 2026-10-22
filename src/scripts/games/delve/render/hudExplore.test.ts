// hudExplore.test.ts — HUD 探索相關的純邏輯：狀態列（指南針 / 深度計決定顯示多少）、發現橫幅佇列、日誌數字格式
import { describe, it, expect } from 'vitest';
import { statusText, layerName, BannerQueue, percentLabel, distanceLabel } from './model';

describe('狀態列', () => {
  it('沒有深度計：只顯示地層名稱；有：顯示格數', () => {
    expect(layerName(99, 100, 500, 900)).toBe('地表');
    expect(layerName(130, 100, 500, 900)).toBe('地下');
    expect(layerName(600, 100, 500, 900)).toBe('洞穴層');
    expect(layerName(950, 100, 500, 900)).toBe('熔岩深淵');
    const base = { clock: '06:00', area: '家鄉林地', feetY: 130, surface: 100, cavernY: 500, moltenY: 900 };
    expect(statusText({ ...base, east: null, depth: null })).toBe('06:00 · 家鄉林地 · 地下');
    expect(statusText({ ...base, east: null, depth: 31 })).toBe('06:00 · 家鄉林地 · 地下 31 格');
  });
  it('指南針：東 / 西 / 出生點', () => {
    const base = { clock: '06:00', area: '雪原', feetY: 99, surface: 100, cavernY: 500, moltenY: 900, depth: null };
    expect(statusText({ ...base, east: 120 })).toBe('06:00 · 雪原 · 地表 · 東 120');
    expect(statusText({ ...base, east: -7 })).toBe('06:00 · 雪原 · 地表 · 西 7');
    expect(statusText({ ...base, east: 0 })).toBe('06:00 · 雪原 · 地表 · 出生點');
  });
});

describe('發現橫幅佇列', () => {
  it('一次顯示一則、每則 dur 秒；同時發現多處依序顯示；佇列最多 4 則', () => {
    const q = new BannerQueue(2);
    expect(q.tick(0.1)).toBeNull();
    q.push({ title: '發現：A', sub: '地域' });
    q.push({ title: '發現：B', sub: '洞窟' });
    expect(q.tick(0.1)?.title).toBe('發現：A');
    expect(q.tick(1.5)?.title).toBe('發現：A');
    expect(q.tick(0.6)?.title).toBe('發現：B');
    expect(q.tick(2.1)).toBeNull();
    for (let i = 0; i < 9; i++) q.push({ title: `X${i}`, sub: '' });
    expect(q.pending).toBeLessThanOrEqual(4);
  });
  it('progress：0 → 1（給 CSS 進場 / 退場用）', () => {
    const q = new BannerQueue(2);
    q.push({ title: 'A', sub: '' });
    q.tick(0);
    expect(q.progress).toBeCloseTo(0);
    q.tick(1);
    expect(q.progress).toBeCloseTo(0.5);
  });
});

describe('日誌數字', () => {
  it('百分比與距離', () => {
    expect(percentLabel(0)).toBe('0%');
    expect(percentLabel(0.376)).toBe('38%');
    expect(percentLabel(1)).toBe('100%');
    expect(distanceLabel(12.4)).toBe('12 格');
    expect(distanceLabel(12345.6)).toBe('12,346 格');
  });
});
