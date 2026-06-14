import type { APIRoute } from 'astro';
import { getBomberRankStore } from '@scripts/games/tetris/net/rankStore';
import type { PlayerRecord, RankStore } from '@scripts/games/tetris/net/rankStore';
import { verifySignature, buildFfaResultMessage } from '@scripts/games/tetris/net/auth';
import { updateRatings, DEFAULT_RATING } from '@scripts/games/tetris/net/elo';
import { updateRatingsNWay } from '@scripts/games/tetris/net/ffaElo';
import { xpForMatch, levelForXp } from '@scripts/games/tetris/net/progression';
import { verifyVersusReplay, type VersusReplay } from '@scripts/games/bomber/net/versusReplay';

export const prerender = false;

// 共識 / 結算暫存 TTL（比照 tetris ranking.ts 的 FFA 設定）
const REPORT_TTL = 600; // 名次回報暫存 10 分鐘
const SETTLED_TTL = 86_400; // 已結算標記 1 天（防重複計分）

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

function fresh(): PlayerRecord {
  return { rating: DEFAULT_RATING, wins: 0, losses: 0, xp: 0, level: 1, games: 0, top3: 0 };
}

/** 單位玩家的結算結果（供 Task 15 結算畫面顯示）。 */
export interface BomberSettleResult {
  id: string;
  placement: number;
  ratingBefore: number;
  ratingAfter: number;
  xpGained: number;
  level: number;
}

/**
 * 套用一場 bomber versus 結算（標準名次制 ELO + XP），回傳每位玩家 before/after。
 * - 2 人場走 elo.ts updateRatings；3-4 人場走 ffaElo.ts updateRatingsNWay。
 *   （數學上 updateRatingsNWay 在 N=2 退化為 updateRatings，但 2 人仍顯式走
 *    updateRatings 以符合 Task 規格「2 人場走 updateRatings」。）
 * - XP 由 progression.ts xpForMatch/levelForXp 累加回推等級。
 * ratings 為各玩家當前基底（後端讀取，client 傳入一律不可信，故此處只吃後端讀到的值）。
 */
async function applyBomberResult(
  store: RankStore,
  standings: string[],
  ratings: Record<string, number>,
): Promise<BomberSettleResult[]> {
  const players = standings.length;

  // 1) 算新 ELO（before 用 ratings；2 人顯式 updateRatings，其餘 N-way）
  let newRatings: Record<string, number>;
  if (players === 2) {
    const [a, b] = standings; // index0 = 冠軍 = 勝方
    const ra = Number(ratings[a] ?? DEFAULT_RATING);
    const rb = Number(ratings[b] ?? DEFAULT_RATING);
    const upd = updateRatings(ra, rb, 'a'); // a = 冠軍 = winner
    newRatings = { [a]: upd.a, [b]: upd.b };
  } else {
    const ratingInput = standings.map((id, i) => ({
      id,
      rating: Number(ratings[id] ?? DEFAULT_RATING),
      placement: i + 1,
    }));
    newRatings = updateRatingsNWay(ratingInput);
  }

  // 2) 逐位玩家更新紀錄並記錄 before/after 供回應
  const out: BomberSettleResult[] = [];
  for (let i = 0; i < standings.length; i++) {
    const id = standings[i];
    const placement = i + 1;
    const isWinner = placement === 1;
    const rec = (await store.getPlayer(id)) ?? fresh();
    const ratingBefore = rec.rating;
    const xpGained = xpForMatch(players, placement, isWinner);

    rec.rating = newRatings[id];
    rec.xp += xpGained;
    rec.level = levelForXp(rec.xp);
    rec.games += 1;
    if (isWinner) rec.wins += 1; else rec.losses += 1;
    if (placement <= 3) rec.top3 += 1;
    await store.setPlayer(id, rec);

    out.push({ id, placement, ratingBefore, ratingAfter: rec.rating, xpGained, level: rec.level });
  }
  return out;
}

/**
 * POST /api/bomber-match — 回報 bomber versus 名次（需回報者錢包簽章）。
 * body: { matchId, reporterId, standings, stateHash, signature, replay, ratings? }
 *   standings: 名次順序，index0=冠軍。
 *   stateHash: replay 重模擬的決定性盤面雜湊（與 standings 一起被抽驗）。
 *   signature: 對 buildFfaResultMessage(matchId, standings, [1..N]) 的簽章。
 *   replay:    供抽驗的可重播紀錄；seed 必須與 matchId 內嵌 seed 相符。
 *   ratings:   忽略（一律由後端讀基底，防偽造灌分）。
 *
 * 共識（過半一致才入帳）/ conflict / duplicate(already) / 簽章 / replay seed 與 matchId 相符。
 * rankStore key 一律 bomber: 前綴（getBomberRankStore），與 tetris 紀錄完全隔離。
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

  const { matchId, reporterId, standings, stateHash, signature } = body;
  if (
    typeof matchId !== 'string' ||
    typeof reporterId !== 'string' ||
    typeof stateHash !== 'string' ||
    typeof signature !== 'string' ||
    !Array.isArray(standings) ||
    !standings.every((x) => typeof x === 'string')
  ) {
    return json({ error: 'bad params' }, 400);
  }
  // bomber versus：2..4 人（單機/熱座不入帳；4 人為對局上限）。
  if (standings.length < 2 || standings.length > 4) {
    return json({ error: 'player count out of range (2..4)' }, 400);
  }
  const m = matchId;
  const reporter = reporterId.toLowerCase();
  const order = standings as string[];
  const lowerStandings = order.map((id) => id.toLowerCase());

  // 回報者必須是對局參與者：非參與者的簽章不得計入共識
  if (!lowerStandings.includes(reporter)) {
    return json({ error: 'reporter not a participant' }, 403);
  }

  // ── replay 抽驗：名次與 stateHash 必須由 seed + 各玩家輸入重現 ──
  const replay = body.replay as VersusReplay | undefined;
  if (!replay || typeof replay !== 'object') {
    return json({ error: 'missing replay' }, 400);
  }
  // seed 必須與 matchId 內嵌的 seed 相符（matchId 已被簽章 → 綁定 replay）
  const seedFromMatch = parseInt(m.split('-')[1] ?? '', 36);
  if (!Number.isFinite(seedFromMatch) || replay.seed !== seedFromMatch) {
    return json({ error: 'replay seed mismatch' }, 400);
  }
  // 宣稱的 standings + stateHash 必須等於 replay 重模擬出的結果（竄改被抓）
  if (!verifyVersusReplay(replay, { standings: order, stateHash })) {
    return json({ error: 'replay does not support standings' }, 400);
  }

  // ── 簽章驗證：由 standings 推 placements 重建訊息（沿用 FFA 結果訊息格式） ──
  const placements = order.map((_, i) => i + 1);
  const message = buildFfaResultMessage(m, order, placements);
  if (!verifySignature(message, signature, reporter)) {
    return json({ error: 'bad signature' }, 401);
  }

  // ── 共識結算（過半一致）。每位玩家各回報一份 standings；達門檻 ceil(N/2) 且唯一多數才入帳 ──
  const store = getBomberRankStore();
  const n = lowerStandings.length;
  const threshold = Math.ceil(n / 2);

  // 1) 記下本次回報（以共識的 lowerStandings 為投票內容）
  await store.setBRReport(m, reporter, lowerStandings, REPORT_TTL);

  // 2) 統計「完全相同」的 standings 票數（JSON 字串當 key）
  const reports = await store.getBRReportsForMatch(m);
  const tally = new Map<string, number>();
  for (const s of Object.values(reports)) {
    tally.set(JSON.stringify(s), (tally.get(JSON.stringify(s)) ?? 0) + 1);
  }

  // 3) 最高票
  let maxVotes = 0;
  for (const v of tally.values()) if (v > maxVotes) maxVotes = v;

  // 4) 未達門檻 → pending
  if (maxVotes < threshold) return json({ outcome: 'pending' });

  // 5) 並列最高（>=2 種 standings 同為最高票）→ 無單一多數 → conflict（409）
  const leaders = [...tally.entries()].filter(([, v]) => v === maxVotes);
  if (leaders.length > 1) return json({ outcome: 'conflict' }, 409);

  // 6) 唯一多數達門檻 → 原子閘確保只結算一次 → 計分
  const consensus = JSON.parse(leaders[0][0]) as string[];
  const first = await store.markSettledBR(m, SETTLED_TTL);
  if (!first) return json({ outcome: 'already' });

  // ratings：一律由後端讀各玩家現有分數（client 傳入的 ratings 不可信，忽略）
  const ratings: Record<string, number> = {};
  for (const id of consensus) {
    const rec = await store.getPlayer(id);
    ratings[id] = rec?.rating ?? DEFAULT_RATING;
  }

  const results = await applyBomberResult(store, consensus, ratings);
  return json({ outcome: 'applied', results });
};
