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

  it('只有 URL 沒有 TOKEN → 拋錯（避免靜默退回記憶體）', async () => {
    const mod = await import('./rankStore');
    expect(() => mod.getRankStore({ KV_REST_API_URL: 'https://x.upstash.io' })).toThrow();
  });

  it('只有 TOKEN 沒有 URL → 拋錯', async () => {
    const mod = await import('./rankStore');
    expect(() => mod.getRankStore({ UPSTASH_REDIS_REST_TOKEN: 'tok' })).toThrow();
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

describe('markSettled 原子性（首次 true、重複 false）', () => {
  it('同一 matchId 第一次回 true、第二次回 false', async () => {
    const s = new MemoryRankStore();
    expect(await s.markSettled('m-atomic', 60)).toBe(true);
    expect(await s.markSettled('m-atomic', 60)).toBe(false);
  });
});

describe('大亂鬥（BR/FFA）回報蒐集與共識結算閘', () => {
  it('setBRReport → getBRReportsForMatch 往返正確（reporterId→standings）', async () => {
    const s = new MemoryRankStore();
    await s.setBRReport('mbr', '0xA', ['0xA', '0xB', '0xC'], 60);
    await s.setBRReport('mbr', '0xB', ['0xA', '0xC', '0xB'], 60);
    const reports = await s.getBRReportsForMatch('mbr');
    expect(reports['0xA']).toEqual(['0xA', '0xB', '0xC']);
    expect(reports['0xB']).toEqual(['0xA', '0xC', '0xB']);
    expect(Object.keys(reports).sort()).toEqual(['0xA', '0xB']);
  });

  it('同一 reporter 後寫覆蓋前寫', async () => {
    const s = new MemoryRankStore();
    await s.setBRReport('mbr', '0xA', ['0xA', '0xB'], 60);
    await s.setBRReport('mbr', '0xA', ['0xB', '0xA'], 60);
    const reports = await s.getBRReportsForMatch('mbr');
    expect(reports['0xA']).toEqual(['0xB', '0xA']);
  });

  it('不同 matchId 互不干擾', async () => {
    const s = new MemoryRankStore();
    await s.setBRReport('m1', '0xA', ['0xA', '0xB'], 60);
    await s.setBRReport('m2', '0xA', ['0xB', '0xA'], 60);
    expect((await s.getBRReportsForMatch('m1'))['0xA']).toEqual(['0xA', '0xB']);
    expect((await s.getBRReportsForMatch('m2'))['0xA']).toEqual(['0xB', '0xA']);
  });

  it('無回報的 matchId → 空物件', async () => {
    const s = new MemoryRankStore();
    expect(await s.getBRReportsForMatch('none')).toEqual({});
  });

  it('markSettledBR 第一次 true、第二次 false（原子閘）', async () => {
    const s = new MemoryRankStore();
    expect(await s.markSettledBR('mbr', 60)).toBe(true);
    expect(await s.markSettledBR('mbr', 60)).toBe(false);
  });
});
