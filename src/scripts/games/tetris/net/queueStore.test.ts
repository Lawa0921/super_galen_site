import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryQueueStore } from './queueStore';
import type { QueueEntry } from './queueStore';

function entry(id: string, joinedAt: number, rating = 1000): QueueEntry {
  return { id, name: `N-${id}`, rating, joinedAt };
}

describe('getQueueStore 環境選擇', () => {
  beforeEach(() => {
    vi.resetModules(); // 清掉模組單例，讓每個 case 重新判斷
  });

  it('有 UPSTASH_REDIS_REST_* → 用 Upstash（非 MemoryQueueStore）', async () => {
    const mod = await import('./queueStore');
    const store = mod.getQueueStore({
      UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'tok',
    });
    expect(store).not.toBeInstanceOf(mod.MemoryQueueStore);
  });

  it('完全無金鑰 → 退回 MemoryQueueStore', async () => {
    const mod = await import('./queueStore');
    expect(mod.getQueueStore({})).toBeInstanceOf(mod.MemoryQueueStore);
  });

  it('只設一半金鑰 → 拋錯（避免靜默退回記憶體）', async () => {
    const mod = await import('./queueStore');
    expect(() => mod.getQueueStore({ KV_REST_API_URL: 'https://x.upstash.io' })).toThrow();
  });
});

describe('MemoryQueueStore 隊列語意', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('enqueue → listWaiting 回傳該 entry（完整欄位）', async () => {
    const s = new MemoryQueueStore();
    await s.enqueue(entry('a', 100_000, 1200), 15);
    expect(await s.listWaiting()).toEqual([{ id: 'a', name: 'N-a', rating: 1200, joinedAt: 100_000 }]);
  });

  it('listWaiting 依 joinedAt 升冪；同分以 id 次序（撮合穩定）', async () => {
    const s = new MemoryQueueStore();
    await s.enqueue(entry('late', 100_500), 15);
    await s.enqueue(entry('b-same', 100_000), 15);
    await s.enqueue(entry('a-same', 100_000), 15);
    expect((await s.listWaiting()).map((e) => e.id)).toEqual(['a-same', 'b-same', 'late']);
  });

  it('entry TTL 過期 → listWaiting 不回', async () => {
    const s = new MemoryQueueStore();
    await s.enqueue(entry('a', 100_000), 15);
    vi.advanceTimersByTime(15_001);
    expect(await s.listWaiting()).toEqual([]);
  });

  it('heartbeat 續命：過原 TTL 後仍在隊列', async () => {
    const s = new MemoryQueueStore();
    await s.enqueue(entry('a', 100_000), 15);
    vi.advanceTimersByTime(14_000);
    await s.heartbeat('a', 15);
    vi.advanceTimersByTime(14_000); // 原 TTL 早已過，但 heartbeat 後尚未過
    expect((await s.listWaiting()).map((e) => e.id)).toEqual(['a']);
  });

  it('heartbeat 不復活已過期或不存在的 entry', async () => {
    const s = new MemoryQueueStore();
    await s.enqueue(entry('a', 100_000), 15);
    vi.advanceTimersByTime(15_001);
    await s.heartbeat('a', 15); // 已過期
    await s.heartbeat('ghost', 15); // 從未存在
    expect(await s.listWaiting()).toEqual([]);
  });

  it('leave 後不在 listWaiting', async () => {
    const s = new MemoryQueueStore();
    await s.enqueue(entry('a', 100_000), 15);
    await s.enqueue(entry('b', 100_001), 15);
    await s.leave('a');
    expect((await s.listWaiting()).map((e) => e.id)).toEqual(['b']);
  });

  it('claimMatchLock 原子閘：首次 true、持鎖期間 false、TTL 過期後可再取', async () => {
    const s = new MemoryQueueStore();
    expect(await s.claimMatchLock(3)).toBe(true);
    expect(await s.claimMatchLock(3)).toBe(false); // 鎖仍有效
    vi.advanceTimersByTime(3_001);
    expect(await s.claimMatchLock(3)).toBe(true); // 鎖過期自復原
  });

  it('setMatch/getMatch 往返；未設定回 null', async () => {
    const s = new MemoryQueueStore();
    const info = { room: 'AB12C', role: 'host' as const, mode: 'ffa' as const, count: 3, players: ['a', 'b', 'c'] };
    await s.setMatch('a', info, 60);
    expect(await s.getMatch('a')).toEqual(info);
    expect(await s.getMatch('b')).toBeNull();
  });

  it('match TTL 過期 → getMatch 回 null', async () => {
    const s = new MemoryQueueStore();
    await s.setMatch('a', { room: 'AB12C', role: 'guest', mode: '1v1', count: 2, players: ['x', 'a'] }, 60);
    vi.advanceTimersByTime(60_001);
    expect(await s.getMatch('a')).toBeNull();
  });
});
