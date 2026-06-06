import type { APIRoute } from 'astro';
import { getRankStore } from '@scripts/games/tetris/net/rankStore';
import { reportResult } from '@scripts/games/tetris/net/ranking';
import { verifySignature, buildResultMessage } from '@scripts/games/tetris/net/auth';

export const prerender = false;

const json = (obj: unknown, status = 200): Response =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// 簡易 per-instance rate limit（搭配 Upstash 免費硬上限做雙保險）
const hits = new Map<string, { n: number; reset: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || e.reset < now) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  e.n++;
  return e.n > 30; // 30 次/分鐘/實例
}

/**
 * POST /api/match — 回報對戰結果（需勝方錢包簽章）。
 * body: { matchId, reporter, opponent, winner, signature }
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  let ip = 'unknown';
  try { ip = clientAddress; } catch { /* 某些環境不提供 */ }
  if (limited(ip)) return json({ error: 'rate limited' }, 429);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'bad json' }, 400);
  }

  const { matchId, reporter, opponent, winner, signature } = body;
  if (![matchId, reporter, opponent, winner, signature].every((x) => typeof x === 'string')) {
    return json({ error: 'bad params' }, 400);
  }
  const m = matchId as string;
  const rep = reporter as string;
  const opp = opponent as string;
  const win = winner as string;

  const message = buildResultMessage(m, rep, opp, win);
  if (!verifySignature(message, signature as string, rep)) {
    return json({ error: 'bad signature' }, 401);
  }

  const status = await reportResult(getRankStore(), { matchId: m, reporter: rep, opponent: opp, winner: win });
  return json({ status });
};
