import { updateRatings, tierFor, DEFAULT_RATING } from './elo';
import { xpForMatch, levelForXp } from './progression';
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
  return { rating: DEFAULT_RATING, wins: 0, losses: 0, xp: 0, level: 1, games: 0, top3: 0 };
}

/** 依本場名次累加 XP/等級/場數/勝負/前三。placement 1 = 冠軍。 */
function applyMatchProgress(rec: PlayerRecord, placement: number, players: number): void {
  const isWinner = placement === 1;
  rec.xp += xpForMatch(players, placement, isWinner);
  rec.level = levelForXp(rec.xp);
  rec.games += 1;
  if (isWinner) rec.wins += 1; else rec.losses += 1;
  if (placement <= 3) rec.top3 += 1;
}

async function applyResult(store: RankStore, a: string, b: string, winner: string): Promise<void> {
  const pa = (await store.getPlayer(a)) ?? fresh();
  const pb = (await store.getPlayer(b)) ?? fresh();
  const w = winner === a ? 'a' : 'b';
  const upd = updateRatings(pa.rating, pb.rating, w);
  pa.rating = upd.a;
  pb.rating = upd.b;
  // 1v1：勝方名次 1、敗方名次 2，人數 2
  applyMatchProgress(pa, w === 'a' ? 1 : 2, 2);
  applyMatchProgress(pb, w === 'b' ? 1 : 2, 2);
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

  // 原子閘：只有第一個成功 markSettled 的請求能入帳（防並發重複計分）
  const first = await store.markSettled(matchId, SETTLED_TTL);
  if (!first) return 'already';
  await applyResult(store, reporter, opponent, winner);
  return 'settled';
}

export interface LeaderRow {
  id: string;
  rating: number;
  tier: string;
  level: number;
  xp: number;
  wins: number;
  losses: number;
  games: number;
  top3: number;
  name?: string;
}

/** 取排行榜前 n 名（附段位/等級/戰績）。 */
export async function leaderboard(store: RankStore, n: number): Promise<LeaderRow[]> {
  const top = await store.topPlayers(n);
  const rows: LeaderRow[] = [];
  for (const t of top) {
    const p = await store.getPlayer(t.id);
    rows.push({
      id: t.id,
      rating: t.rating,
      tier: tierFor(t.rating),
      level: p?.level ?? 1,
      xp: p?.xp ?? 0,
      wins: p?.wins ?? 0,
      losses: p?.losses ?? 0,
      games: p?.games ?? 0,
      top3: p?.top3 ?? 0,
      name: p?.name,
    });
  }
  return rows;
}
