// fontGate.test.ts — 地圖文字等點陣字型載入：載入前不畫（避免先用後備字型再跳）、載入後通知重畫、沒有 document.fonts 也不出錯。
import { describe, it, expect, vi } from 'vitest';
import { FontGate, type FontSetLike } from './fontGate';

function fakeFonts(): FontSetLike & { loaded: Set<string>; resolveAll: () => void; fire: () => void; loads: string[] } {
  const loaded = new Set<string>(), pending: (() => void)[] = [], listeners: (() => void)[] = [];
  const f = {
    loaded, loads: [] as string[],
    check: (_font: string, text = '') => [...text].every((ch) => loaded.has(ch)),
    load: (_font: string, text = '') => { f.loads.push(text); return new Promise<unknown[]>((res) => pending.push(() => { for (const ch of text) loaded.add(ch); res([]); })); },
    addEventListener: (_t: string, fn: () => void) => { listeners.push(fn); },
    resolveAll: () => { for (const p of pending.splice(0)) p(); },
    fire: () => { for (const l of listeners) l(); },
  };
  return f;
}

describe('FontGate', () => {
  it('沒有 document.fonts → 永遠 ready、不丟例外', () => {
    const g = new FontGate(undefined, 'DotGothic16', () => {});
    expect(g.ready('地圖')).toBe(true);
  });
  it('字型還沒載入 → 不 ready，並只發一次 load；載入完成 → onChange、之後 ready', async () => {
    const fonts = fakeFonts(), onChange = vi.fn();
    const g = new FontGate(fonts, 'DotGothic16', onChange);
    expect(g.ready('森林')).toBe(false);
    expect(g.ready('森林')).toBe(false);
    expect(fonts.loads).toEqual(['森林']);
    fonts.resolveAll();
    await Promise.resolve(); await Promise.resolve();
    expect(onChange).toHaveBeenCalled();
    expect(g.ready('森林')).toBe(true);
  });
  it('已載入的字 → 直接 ready（不再 load）', () => {
    const fonts = fakeFonts();
    for (const ch of 'ab') fonts.loaded.add(ch);
    const g = new FontGate(fonts, 'X', () => {});
    expect(g.ready('ab')).toBe(true);
    expect(fonts.loads).toEqual([]);
  });
  it('loadingdone 事件 → onChange（別處觸發的字型載入也會重畫）', () => {
    const fonts = fakeFonts(), onChange = vi.fn();
    new FontGate(fonts, 'X', onChange);
    fonts.fire();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it('逾時（字型載不到）→ 放行用後備字型', () => {
    vi.useFakeTimers();
    try {
      const fonts = fakeFonts();
      const g = new FontGate(fonts, 'X', () => {}, 1500);
      expect(g.ready('洞')).toBe(false);
      vi.advanceTimersByTime(1600);
      expect(g.ready('洞')).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it('check / load 丟例外 → 當作 ready', () => {
    const bad: FontSetLike = { check: () => { throw new Error('x'); }, load: () => Promise.reject(new Error('y')) };
    expect(new FontGate(bad, 'X', () => {}).ready('a')).toBe(true);
  });
});
