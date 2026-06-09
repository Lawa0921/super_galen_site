import type { APIRoute } from 'astro';
import { getRankStore } from '@scripts/games/tetris/net/rankStore';
import { reportResult } from '@scripts/games/tetris/net/ranking';
import { verifySignature, buildResultMessage } from '@scripts/games/tetris/net/auth';
import { verifyReplay, type MatchReplay } from '@scripts/games/tetris/net/replay';

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

  // ── replay 抽驗：宣稱勝方必須由 seed + 雙方輸入重現 ──
  const replay = body.replay as MatchReplay | undefined;
  const aId = body.aId;
  const bId = body.bId;
  if (!replay || typeof aId !== 'string' || typeof bId !== 'string') {
    return json({ error: 'missing replay' }, 400);
  }
  // seed 必須與 matchId 內嵌的 seed 相符（matchId 已被簽章 → 綁定 replay）
  const seedFromMatch = parseInt(m.split('-')[1] ?? '', 36);
  if (!Number.isFinite(seedFromMatch) || replay.seed !== seedFromMatch) {
    return json({ error: 'replay seed mismatch' }, 400);
  }
  // 宣稱的 winner ID 必須對應 replay 重模擬出的勝方 side（host=A、guest=B）
  const okA = verifyReplay(replay, 'A') && aId.toLowerCase() === win.toLowerCase();
  const okB = verifyReplay(replay, 'B') && bId.toLowerCase() === win.toLowerCase();
  if (!okA && !okB) {
    return json({ error: 'replay does not support result' }, 400);
  }

  const status = await reportResult(getRankStore(), {
    matchId: m,
    reporter: rep.toLowerCase(),
    opponent: opp.toLowerCase(),
    winner: win.toLowerCase(),
  });
  return json({ status });
};
