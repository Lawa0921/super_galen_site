import { updateRatings, tierFor, DEFAULT_RATING } from './elo';
import { updateRatingsNWay } from './ffaElo';
import { xpForMatch, levelForXp } from './progression';
import { getRankStore, type RankStore, type PlayerRecord } from './rankStore';

const REPORT_TTL = 600; // 結果回報暫存 10 分鐘
const SETTLED_TTL = 86_400; // 已結算標記 1 天（防重複計分）

// 大亂鬥（FFA/N 人）共識用 TTL
const FFA_REPORT_TTL = 600; // 名次回報暫存 10 分鐘
const FFA_SETTLED_TTL = 86_400; // 已結算標記 1 天（防重複計分）

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

export type FfaReportOutcome = 'applied' | 'pending' | 'conflict' | 'already';

/**
 * 套用一場 N 人大亂鬥結算：依共識 standings（index0=冠軍）算新 ELO 並更新各玩家戰績。
 * ratings 為呼叫端先讀的各玩家當前分數（缺者退回 DEFAULT_RATING）。
 */
async function applyFfaResult(
  store: RankStore,
  standings: string[],
  ratings: Record<string, number>,
): Promise<void> {
  const players = standings.length;
  // 名次 1..N（standings index0=冠軍）
  const ratingInput = standings.map((id, i) => ({
    id,
    rating: Number(ratings[id] ?? DEFAULT_RATING),
    placement: i + 1,
  }));
  const newRatings = updateRatingsNWay(ratingInput);

  for (let i = 0; i < standings.length; i++) {
    const id = standings[i];
    const placement = i + 1;
    const rec = (await store.getPlayer(id)) ?? fresh();
    rec.rating = newRatings[id];
    applyMatchProgress(rec, placement, players);
    await store.setPlayer(id, rec);
  }
}

/**
 * 回報一場 N 人大亂鬥結果。每位玩家各回報一份 standings（index0=冠軍）；
 * 當「完全相同的 standings」票數達共識門檻 ceil(N/2) 且為唯一多數時，
 * 以 markSettledBR 原子閘確保只結算一次後計分。
 */
export async function reportFfaResult(input: {
  matchId: string;
  reporterId: string;
  standings: string[];
  ratings: Record<string, number>;
}): Promise<FfaReportOutcome> {
  const { matchId, reporterId, standings, ratings } = input;
  const store = getRankStore();
  const n = standings.length;
  const threshold = Math.ceil(n / 2);

  // 1. 記下本次回報
  await store.setBRReport(matchId, reporterId, standings, FFA_REPORT_TTL);

  // 2. 統計「完全相同」的 standings 票數（JSON 字串當 key）
  const reports = await store.getBRReportsForMatch(matchId);
  const tally = new Map<string, number>();
  for (const s of Object.values(reports)) {
    const key = JSON.stringify(s);
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  // 3. 找最高票
  let maxVotes = 0;
  for (const v of tally.values()) if (v > maxVotes) maxVotes = v;

  // 4. 最高票未達門檻 → pending
  if (maxVotes < threshold) return 'pending';

  // 5. 並列最高（>=2 種 standings 同為最高票）→ 無單一多數 → conflict
  const leaders = [...tally.entries()].filter(([, v]) => v === maxVotes);
  if (leaders.length > 1) return 'conflict';

  // 6. 唯一多數達門檻 → 原子閘 → 計分
  const consensus = JSON.parse(leaders[0][0]) as string[];
  const first = await store.markSettledBR(matchId, FFA_SETTLED_TTL);
  if (!first) return 'already';
  await applyFfaResult(store, consensus, ratings);
  return 'applied';
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
