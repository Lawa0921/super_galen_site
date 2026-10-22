// toastQueue.test.ts — 提示排隊：低優先度不會蓋掉重要提示，等它顯示完才出來。
import { describe, it, expect } from 'vitest';
import { ToastQueue, TOAST_HIGH, TOAST_LOW, TOAST_NORMAL } from './toastQueue';

describe('ToastQueue', () => {
  it('圖鑑收錄（低）不會蓋掉獲得傳說裝備（高）；傳說顯示完才輪到它', () => {
    const q = new ToastQueue();
    expect(q.push({ text: '獲得傳說裝備：奔雷的 金劍', ms: 3000, prio: TOAST_HIGH })).toBe('show');
    expect(q.push({ text: '圖鑑收錄新詞條：熾焰的', ms: 1800, prio: TOAST_LOW })).toBe('queued');
    expect(q.tick(1000)!.text).toContain('傳說');
    expect(q.tick(1500)!.text).toContain('傳說');
    expect(q.tick(600)!.text).toContain('圖鑑');
    expect(q.tick(1900)).toBeNull();
  });
  it('同優先度或更高 → 立刻換上（一般提示照舊互相取代）', () => {
    const q = new ToastQueue();
    q.push({ text: 'a', ms: 1000, prio: TOAST_NORMAL });
    expect(q.push({ text: 'b', ms: 1000, prio: TOAST_NORMAL })).toBe('show');
    expect(q.tick(10)!.text).toBe('b');
    expect(q.push({ text: 'c', ms: 1000, prio: TOAST_HIGH })).toBe('show');
    expect(q.push({ text: 'd', ms: 1000, prio: TOAST_NORMAL })).toBe('queued');
  });
  it('排隊不重複、最多 4 則', () => {
    const q = new ToastQueue();
    q.push({ text: 'top', ms: 1000, prio: TOAST_HIGH });
    for (let i = 0; i < 8; i++) q.push({ text: `x${i % 6}`, ms: 100, prio: TOAST_LOW });
    q.push({ text: 'x5', ms: 100, prio: TOAST_LOW });
    expect(q.queue.length).toBe(4);
    expect(new Set(q.queue.map((m) => m.text)).size).toBe(4);
  });
});
