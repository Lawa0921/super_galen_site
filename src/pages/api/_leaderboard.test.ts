import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PlayerRecord } from '@scripts/games/tetris/net/rankStore';

/**
 * GET /api/leaderboard 端點測試（copy-adapt 自 _queue.test.ts / _bomber-match.test.ts）。
 *
 * 檔名以底線開頭（_leaderboard.test.ts）防止 Astro 把測試檔當路由打包。
 * 每個 case 先 vi.resetModules() 取乾淨單例：無 Upstash env →
 *   getRankStore()        = MemoryRankStore（tetris，ns=''）
 *   getBomberRankStore()  = 另一個 MemoryRankStore 實例（bomber，ns='bomber:'）
 * 端點與測試共用同一單例，故可直接 seed store 再驗 GET 路由結果。
 *
 * 核心驗證：
 *   - game 參數路由（缺省/tetris → tetris store；bomber → bomber store）
 *   - tetris 回應 byte-identical（缺省 與 ?game=tetris 完全相同）
 *   - 兩個 ladder 完全隔離（互不污染）
 *   - 未知 game 值 → 寬鬆退回 tetris（不回 400）
 */

async function loadGet() {
  const mod = await import('./leaderboard');
  return mod.GET;
}

type Get = Awaited<ReturnType<typeof loadGet>>;

/** 建一個 Astro APIContext 風格的呼叫物件（GET 只用到 url）。 */
function ctx(query = '') {
  const url = new URL(`http://localhost/api/leaderboard${query}`);
  return { url } as never;
}

async function call(GET: Get, query = ''): Promise<{ status: number; raw: string; rows: Array<Record<string, unknown>> }> {
  const res = await GET(ctx(query));
  const raw = await res.text();
  return { status: res.status, raw, rows: (JSON.parse(raw) as { rows: Array<Record<string, unknown>> }).rows };
}

function rec(rating: number, name: string): PlayerRecord {
  return { name, rating, wins: 3, losses: 1, xp: 120, level: 2, games: 4, top3: 2 };
}

beforeEach(() => {
  vi.resetModules();
});

describe('GET /api/leaderboard — game 參數路由', () => {
  it('缺省 game → 讀 tetris ladder（getRankStore）', async () => {
    const { getRankStore } = await import('@scripts/games/tetris/net/rankStore');
    await getRankStore().setPlayer('0xTETRIS', rec(1500, 'TETRIS-ACE'));

    const GET = await loadGet();
    const { status, rows } = await call(GET);
    expect(status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('0xTETRIS');
    expect(rows[0].name).toBe('TETRIS-ACE');
    expect(rows[0].rating).toBe(1500);
    // 回應 shape：含 tier / level / wins / losses 等欄位
    expect(rows[0]).toHaveProperty('tier');
    expect(rows[0]).toHaveProperty('level');
    expect(rows[0]).toHaveProperty('wins');
    expect(rows[0]).toHaveProperty('losses');
  });

  it('?game=tetris → 與缺省 byte-identical（tetris 零回歸）', async () => {
    const { getRankStore } = await import('@scripts/games/tetris/net/rankStore');
    await getRankStore().setPlayer('0xA', rec(1400, 'A'));
    await getRankStore().setPlayer('0xB', rec(1600, 'B'));

    const GET = await loadGet();
    const def = await call(GET, '');
    const explicit = await call(GET, '?game=tetris');
    expect(def.status).toBe(200);
    expect(explicit.status).toBe(200);
    // 原始 JSON 字串完全相同 → byte-identical
    expect(explicit.raw).toBe(def.raw);
  });

  it('?game=bomber → 讀 bomber ladder（getBomberRankStore），不是 tetris', async () => {
    const { getRankStore, getBomberRankStore } = await import('@scripts/games/tetris/net/rankStore');
    await getRankStore().setPlayer('0xTETRIS', rec(1500, 'TETRIS-ACE'));
    await getBomberRankStore().setPlayer('0xBOMBER', rec(1700, 'BOMBER-KING'));

    const GET = await loadGet();
    const { status, rows } = await call(GET, '?game=bomber');
    expect(status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('0xBOMBER');
    expect(rows[0].name).toBe('BOMBER-KING');
    expect(rows[0].rating).toBe(1700);
  });

  it('兩個 ladder 完全隔離：bomber 結果不含 tetris 玩家，反之亦然', async () => {
    const { getRankStore, getBomberRankStore } = await import('@scripts/games/tetris/net/rankStore');
    await getRankStore().setPlayer('0xTETRIS', rec(1500, 'TETRIS-ACE'));
    await getBomberRankStore().setPlayer('0xBOMBER', rec(1700, 'BOMBER-KING'));

    const GET = await loadGet();
    const tetris = await call(GET, '?game=tetris');
    const bomber = await call(GET, '?game=bomber');

    expect(tetris.rows.map((r) => r.id)).toEqual(['0xTETRIS']);
    expect(bomber.rows.map((r) => r.id)).toEqual(['0xBOMBER']);
  });

  it('未知 game 值 → 寬鬆退回 tetris（不回 400）', async () => {
    const { getRankStore } = await import('@scripts/games/tetris/net/rankStore');
    await getRankStore().setPlayer('0xTETRIS', rec(1500, 'TETRIS-ACE'));

    const GET = await loadGet();
    const { status, rows } = await call(GET, '?game=pacman');
    expect(status).toBe(200);
    expect(rows.map((r) => r.id)).toEqual(['0xTETRIS']);
  });
});

describe('GET /api/leaderboard — n 參數仍照舊夾擠（回歸保護）', () => {
  it('n 超過上限 100 → 夾到 100；非數字 → 預設 20（不影響少量資料回傳）', async () => {
    const { getRankStore } = await import('@scripts/games/tetris/net/rankStore');
    // seed 3 名，驗 n 參數不會破壞回傳
    await getRankStore().setPlayer('0xA', rec(1400, 'A'));
    await getRankStore().setPlayer('0xB', rec(1600, 'B'));
    await getRankStore().setPlayer('0xC', rec(1500, 'C'));

    const GET = await loadGet();
    const big = await call(GET, '?n=9999');
    const bad = await call(GET, '?n=abc');
    expect(big.status).toBe(200);
    expect(bad.status).toBe(200);
    // 高→低排序仍正確
    expect(big.rows.map((r) => r.id)).toEqual(['0xB', '0xC', '0xA']);
    expect(bad.rows.map((r) => r.id)).toEqual(['0xB', '0xC', '0xA']);
  });
});
