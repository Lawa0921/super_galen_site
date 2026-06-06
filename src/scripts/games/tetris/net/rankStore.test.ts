import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRankStore, normalizePlayer } from './rankStore';

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

describe('PlayerRecord 擴充欄位', () => {
  it('setPlayer/getPlayer 往返保留 xp/level/games/top3', async () => {
    const s = new MemoryRankStore();
    await s.setPlayer('0xabc', { name: 'A', rating: 1200, wins: 3, losses: 1, xp: 250, level: 2, games: 4, top3: 4 });
    const p = await s.getPlayer('0xabc');
    expect(p).toMatchObject({ rating: 1200, wins: 3, losses: 1, xp: 250, level: 2, games: 4, top3: 4 });
  });

  it('normalizePlayer 補齊舊資料缺少的欄位', () => {
    const legacy = { rating: 1100, wins: 2, losses: 2 } as Record<string, unknown>;
    const n = normalizePlayer(legacy);
    expect(n).toMatchObject({ rating: 1100, wins: 2, losses: 2, xp: 0, level: 1, games: 0, top3: 0 });
  });

  it('topPlayers 仍依 rating 由高到低', async () => {
    const s = new MemoryRankStore();
    await s.setPlayer('low', { rating: 1000, wins: 0, losses: 0, xp: 0, level: 1, games: 0, top3: 0 });
    await s.setPlayer('high', { rating: 1500, wins: 0, losses: 0, xp: 0, level: 1, games: 0, top3: 0 });
    const top = await s.topPlayers(10);
    expect(top.map((t) => t.id)).toEqual(['high', 'low']);
  });
});
