import { updateRatings, tierFor, DEFAULT_RATING } from './elo';
import type { RankStore, PlayerRecord } from './rankStore';

const REPORT_TTL = 600; // 結果回報暫存 10 分鐘
const SETTLED_TTL = 86_400; // 已結算標記 1 天（防重複計分）

export interface ResultClaim {
  matchId: string;
  reporter: string; // 回報者 id（錢包地址）
  opponent: string; // 對手 id
  winner: string; // 勝方 id（reporter 或 opponent）
}

export type ReportStatus = 'pending' | 'settled' | 'conflict' | 'already' | 'invalid';

function fresh(): PlayerRecord {
  return { rating: DEFAULT_RATING, wins: 0, losses: 0 };
}

async function applyResult(store: RankStore, a: string, b: string, winner: string): Promise<void> {
  const pa = (await store.getPlayer(a)) ?? fresh();
  const pb = (await store.getPlayer(b)) ?? fresh();
  const w = winner === a ? 'a' : 'b';
  const upd = updateRatings(pa.rating, pb.rating, w);
  pa.rating = upd.a;
  pb.rating = upd.b;
  if (w === 'a') { pa.wins++; pb.losses++; } else { pb.wins++; pa.losses++; }
  await store.setPlayer(a, pa);
  await store.setPlayer(b, pb);
}

/**
 * 回報一場對戰結果。雙方各回報一次，winner 一致才計分（P2P 無權威伺服器的務實防作弊）。
 */
export async function reportResult(store: RankStore, claim: ResultClaim): Promise<ReportStatus> {
  const { matchId, reporter, opponent, winner } = claim;
  if (winner !== reporter && winner !== opponent) return 'invalid';
  if (reporter === opponent) return 'invalid';
  if (await store.isSettled(matchId)) return 'already';

  await store.setReport(matchId, reporter, winner, REPORT_TTL);

  const oppClaim = await store.getReport(matchId, opponent);
  if (!oppClaim) return 'pending';
  if (oppClaim !== winner) return 'conflict';

  // 雙方一致 → 計分（再次防重）
  if (await store.isSettled(matchId)) return 'already';
  await store.markSettled(matchId, SETTLED_TTL);
  await applyResult(store, reporter, opponent, winner);
  return 'settled';
}

export interface LeaderRow {
  id: string;
  rating: number;
  tier: string;
  wins: number;
  losses: number;
  name?: string;
}

/** 取排行榜前 n 名（附段位/戰績）。 */
export async function leaderboard(store: RankStore, n: number): Promise<LeaderRow[]> {
  const top = await store.topPlayers(n);
  const rows: LeaderRow[] = [];
  for (const t of top) {
    const p = await store.getPlayer(t.id);
    rows.push({
      id: t.id,
      rating: t.rating,
      tier: tierFor(t.rating),
      wins: p?.wins ?? 0,
      losses: p?.losses ?? 0,
      name: p?.name,
    });
  }
  return rows;
}
