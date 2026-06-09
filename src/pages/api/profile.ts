import type { APIRoute } from 'astro';
import { getRankStore } from '@scripts/games/tetris/net/rankStore';
import { tierFor } from '@scripts/games/tetris/net/elo';
import { levelProgress } from '@scripts/games/tetris/net/progression';

export const prerender = false;

const json = (obj: unknown, status = 200): Response =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** GET /api/profile?addr=0x... — 取單一玩家檔案；找不到回 { profile: null }。 */
export const GET: APIRoute = async ({ url }) => {
  const addr = (url.searchParams.get('addr') ?? '').trim();
  if (!addr) return json({ error: 'missing addr' }, 400);
  const p = await getRankStore().getPlayer(addr);
  const profile = p
    ? {
        addr,
        name: p.name ?? null,
        level: p.level,
        xp: p.xp,
        progress: levelProgress(p.xp).ratio,
        rating: p.rating,
        tier: tierFor(p.rating),
        games: p.games,
        wins: p.wins,
        losses: p.losses,
        top3: p.top3,
      }
    : null;
  return json({ profile });
};
