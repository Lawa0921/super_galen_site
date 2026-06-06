import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from './signalStore';

describe('MemoryStore', () => {
  it('set / get 往返', async () => {
    const s = new MemoryStore();
    await s.set('k', 'v', 60);
    expect(await s.get('k')).toBe('v');
  });

  it('del 後讀不到', async () => {
    const s = new MemoryStore();
    await s.set('k', 'v', 60);
    await s.del('k');
    expect(await s.get('k')).toBeNull();
  });

  it('未設定的 key 回 null', async () => {
    const s = new MemoryStore();
    expect(await s.get('nope')).toBeNull();
  });

  it('TTL 過期後回 null', async () => {
    vi.useFakeTimers();
    try {
      const s = new MemoryStore();
      await s.set('k', 'v', 1); // 1 秒
      expect(await s.get('k')).toBe('v');
      vi.advanceTimersByTime(1500);
      expect(await s.get('k')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('模擬 WebRTC 房間握手（offer→answer 透過 store 中轉）', async () => {
    const store = new MemoryStore(); // 模擬 serverless 共用的 store
    const room = 'AB12C';
    // host 上傳 offer
    await store.set(`sig:${room}:offer`, 'OFFER_SDP', 300);
    // guest 取 offer、上傳 answer
    expect(await store.get(`sig:${room}:offer`)).toBe('OFFER_SDP');
    await store.set(`sig:${room}:answer`, 'ANSWER_SDP', 300);
    // host 輪詢到 answer
    expect(await store.get(`sig:${room}:answer`)).toBe('ANSWER_SDP');
  });
});
