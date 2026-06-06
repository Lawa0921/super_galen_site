import type { APIRoute } from 'astro';
import { getRankStore } from '@scripts/games/tetris/net/rankStore';
import { leaderboard } from '@scripts/games/tetris/net/ranking';

export const prerender = false;

/** GET /api/leaderboard?n=20 — 取前 n 名（上限 100）。 */
export const GET: APIRoute = async ({ url }) => {
  const raw = Number(url.searchParams.get('n') ?? 20);
  const n = Math.min(Math.max(Number.isFinite(raw) ? raw : 20, 1), 100);
  const rows = await leaderboard(getRankStore(), n);
  return new Response(JSON.stringify({ rows }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
