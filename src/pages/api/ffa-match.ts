import type { APIRoute } from 'astro';
import { getRankStore } from '@scripts/games/tetris/net/rankStore';
import { reportFfaResult } from '@scripts/games/tetris/net/ranking';
import { verifySignature, buildFfaResultMessage } from '@scripts/games/tetris/net/auth';
import { verifyFfaReplay, type FfaReplay } from '@scripts/games/tetris/net/ffaReplay';
import { DEFAULT_RATING } from '@scripts/games/tetris/net/elo';

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
 * POST /api/ffa-match — 回報 N 人大亂鬥名次（需回報者錢包簽章）。
 * body: { matchId, reporterId, standings, signature, replay, ratings? }
 *   standings: 名次順序，index0=冠軍。
 *   signature: 對 buildFfaResultMessage(matchId, standings, [1..N]) 的簽章。
 *   replay:    供抽驗的可重播紀錄；seed 必須與 matchId 內嵌 seed 相符。
 *   ratings:   可選；缺則由後端讀各玩家現有分數。
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

  const { matchId, reporterId, standings, signature } = body;
  if (
    typeof matchId !== 'string' ||
    typeof reporterId !== 'string' ||
    typeof signature !== 'string' ||
    !Array.isArray(standings) ||
    !standings.every((x) => typeof x === 'string')
  ) {
    return json({ error: 'bad params' }, 400);
  }
  // FFA 僅限 3..8 人：2 人必須走 /api/match 的 1v1 雙方確認路徑
  // （否則 ceil(2/2)=1 會讓單一簽章即可結算，繞過雙方共識）。
  if (standings.length < 3 || standings.length > 8) {
    return json({ error: 'player count out of range (3..8)' }, 400);
  }
  const m = matchId;
  const reporter = (reporterId as string).toLowerCase();
  const order = standings as string[];
  const lowerStandings = order.map((id) => id.toLowerCase());

  // 回報者必須是對局參與者：非參與者的簽章不得計入共識
  // （否則任意外部錢包可對捏造對局投票，影響他人積分）。
  if (!lowerStandings.includes(reporter)) {
    return json({ error: 'reporter not a participant' }, 403);
  }

  // ── replay 抽驗：名次必須由 seed + 各玩家輸入重現 ──
  const replay = body.replay as FfaReplay | undefined;
  if (!replay || typeof replay !== 'object') {
    return json({ error: 'missing replay' }, 400);
  }
  // seed 必須與 matchId 內嵌的 seed 相符（matchId 已被簽章 → 綁定 replay）
  const seedFromMatch = parseInt(m.split('-')[1] ?? '', 36);
  if (!Number.isFinite(seedFromMatch) || replay.seed !== seedFromMatch) {
    return json({ error: 'replay seed mismatch' }, 400);
  }
  // 宣稱的 standings 必須等於 replay 重模擬出的名次（竄改名次被抓）
  if (!verifyFfaReplay(replay, order)) {
    return json({ error: 'replay does not support standings' }, 400);
  }

  // ── 簽章驗證：由 standings 推 sortedPlayerIds/sortedPlacements 重建訊息 ──
  const placements = order.map((_, i) => i + 1);
  const message = buildFfaResultMessage(m, order, placements);
  if (!verifySignature(message, signature, reporter)) {
    return json({ error: 'bad signature' }, 401);
  }

  // ── ratings：一律由後端讀各玩家現有分數。client 傳入的 ratings 不可信
  //   （否則回報者可偽造基底分數直接灌分），故無條件忽略。──
  const store = getRankStore();
  const ratings: Record<string, number> = {};
  for (const id of lowerStandings) {
    const rec = await store.getPlayer(id);
    ratings[id] = rec?.rating ?? DEFAULT_RATING;
  }

  const outcome = await reportFfaResult({
    matchId: m,
    reporterId: reporter,
    standings: lowerStandings,
    ratings,
  });
  // conflict 用 409，其餘（applied/pending/already）用 200，比照 1v1 端點對等慣例
  const status = outcome === 'conflict' ? 409 : 200;
  return json({ outcome }, status);
};
