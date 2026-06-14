import type { APIRoute } from 'astro';
import { getRankStore, getBomberRankStore } from '@scripts/games/tetris/net/rankStore';
import { leaderboard } from '@scripts/games/tetris/net/ranking';

export const prerender = false;

/**
 * GET /api/leaderboard?n=20&game=tetris — 取前 n 名（上限 100）。
 *
 * game 參數選 ladder（皆回傳相同 response shape，頁面以同一方式渲染）：
 *   - 缺省 / 'tetris' → 預設 tetris ladder（getRankStore，與原本 byte-identical）
 *   - 'bomber'        → 隔離的 bomber ladder（getBomberRankStore，bomber: 前綴）
 * 未知 game 值 → 退回 tetris（與站內 ?n 等容錯參數一致的寬鬆處理；不回 400）。
 */
export const GET: APIRoute = async ({ url }) => {
  const raw = Number(url.searchParams.get('n') ?? 20);
  const n = Math.min(Math.max(Number.isFinite(raw) ? raw : 20, 1), 100);
  const game = url.searchParams.get('game');
  const store = game === 'bomber' ? getBomberRankStore() : getRankStore();
  const rows = await leaderboard(store, n);
  return new Response(JSON.stringify({ rows }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
