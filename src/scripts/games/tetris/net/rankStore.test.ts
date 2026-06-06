import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('getRankStore 環境選擇', () => {
  beforeEach(() => {
    vi.resetModules(); // 清掉模組單例，讓每個 case 重新判斷
  });

  it('有 UPSTASH_REDIS_REST_* → 用 Upstash（非 MemoryRankStore）', async () => {
    const mod = await import('./rankStore');
    const store = mod.getRankStore({
      UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'tok',
    });
    expect(store).not.toBeInstanceOf(mod.MemoryRankStore);
  });

  it('有 Vercel 注入的 KV_REST_API_* → 用 Upstash（非 MemoryRankStore）', async () => {
    const mod = await import('./rankStore');
    const store = mod.getRankStore({
      KV_REST_API_URL: 'https://x.upstash.io',
      KV_REST_API_TOKEN: 'tok',
    });
    expect(store).not.toBeInstanceOf(mod.MemoryRankStore);
  });

  it('完全無金鑰 → 退回 MemoryRankStore', async () => {
    const mod = await import('./rankStore');
    const store = mod.getRankStore({});
    expect(store).toBeInstanceOf(mod.MemoryRankStore);
  });
});
