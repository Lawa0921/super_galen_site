import { buildFfaResultMessage } from '@scripts/games/tetris/net/auth';
import { simulateVersusReplay, type VersusReplay } from './versusReplay';

/** 結果回報逾時（沿用 tetris ffaNetMain 的 8s）。 */
const REPORT_TIMEOUT_MS = 8_000;

/**
 * 結算端點（/api/bomber-match）回報結果。client 端負責「組 claim → 簽章 → POST → 解析」，
 * 真正的計分/共識/防作弊全由後端（Task 14）負責。
 *
 * - applied   ：共識達成且本次請求為首位結算者 → results 含每位玩家 before/after。
 * - pending   ：尚未達共識門檻（其他端還沒回報相同 standings）。
 * - already   ：本場已被結算過（重複回報，不重複計分）。
 * - conflict  ：並列最高票（無單一多數）→ 名次有爭議。
 * - null      ：casual（無 signMessage）不回報；或網路/解析失敗（不丟例外）。
 */
export type BomberRankOutcome = 'applied' | 'pending' | 'already' | 'conflict' | null;

/** 單位玩家結算結果（鏡像 endpoint 的 BomberSettleResult，供結算畫面顯示 Elo±/XP/等級）。 */
export interface BomberRankResult {
  id: string;
  placement: number; // 1 = 冠軍
  ratingBefore: number;
  ratingAfter: number;
  xpGained: number;
  level: number;
}

/** reportBomberRanked 的回傳：本次結果 + 達共識時每位玩家的 before/after。 */
export interface BomberRankReport {
  outcome: BomberRankOutcome;
  results?: BomberRankResult[];
}

/**
 * 組出對局 id：**bomber-<seed.toString(36)>-<roomId>**。
 *
 * 鐵則（與 Task 14 endpoint 對齊）：endpoint 以 `matchId.split('-')[1]` 取出中段、
 * 以 base36 parseInt，要求 == replay.seed。故 seed 必須是中段、且以 36 進位編碼。
 * roomId 放最後一段（可含字母，不被當作 seed 解析）。
 */
export function buildBomberMatchId(seed: number, roomId: string): string {
  return `bomber-${seed.toString(36)}-${roomId}`;
}

/** 為 Promise 加逾時（避免對手結算後崩潰導致 UI 永久等待）。 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** 把任意回應正規化成已知 outcome；未知值 → null。 */
function normalizeOutcome(v: unknown): BomberRankOutcome {
  return v === 'applied' || v === 'pending' || v === 'already' || v === 'conflict' ? v : null;
}

/**
 * 對局結束後本機簽章並 POST /api/bomber-match。
 *
 * 決定性鐵則：standings 與 stateHash **不**讀 live match 狀態，而是由 replay 經
 * simulateVersusReplay 重模擬得到——這正是 endpoint 抽驗時重建的同一份結果，
 * 保證 client 宣稱值與 server 重模擬「逐位元相同」（否則 verifyVersusReplay 會 400）。
 *
 * - 無 signMessage（casual / 未連錢包）→ 不送、回 { outcome: null }（仍可顯示本機名次）。
 * - 各端各自呼叫一次（mirror tetris FFA：consensus 過半 + SETTLED 原子閘去重；
 *   不需要選「誰送」——全送，後端只結算一次）。
 * - 逾時 / 網路 / 壞 JSON → { outcome: null }，絕不丟未捕捉例外（不影響對局收尾）。
 */
export async function reportBomberRanked(opts: {
  /** host 廣播的對局 seed（== replay.seed）。 */
  seed: number;
  /** 房號（BomberReady.room）。 */
  roomId: string;
  /** 本端玩家 id（== 簽章地址；ranked 時為錢包地址）。 */
  reporterId: string;
  /** 本局可重播紀錄（lockstep.getReplay()）。 */
  replay: VersusReplay;
  /** 錢包簽章函式；casual（無）→ 不回報。 */
  signMessage?: (msg: string) => Promise<string>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<BomberRankReport> {
  const { seed, roomId, reporterId, replay, signMessage } = opts;
  if (!signMessage) return { outcome: null }; // casual：不回報

  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? REPORT_TIMEOUT_MS;

  try {
    // standings + stateHash 由 replay 重模擬（與 endpoint 抽驗同源 → 必相符）。
    const { standings, stateHash } = simulateVersusReplay(replay);
    const matchId = buildBomberMatchId(seed, roomId);

    // 簽章訊息：buildFfaResultMessage(matchId, standings, [1..N])（與 endpoint 重建一致）。
    const placements = standings.map((_, i) => i + 1);
    const message = buildFfaResultMessage(matchId, standings, placements);
    const signature = await signMessage(message);

    const body: Record<string, unknown> = {
      matchId,
      reporterId,
      standings,
      stateHash,
      signature,
      replay,
    };

    const res = await withTimeout(
      fetchFn('/api/bomber-match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      timeoutMs,
      'bomber-report',
    );
    const json = (await res.json()) as { outcome?: unknown; results?: BomberRankResult[] };
    const outcome = normalizeOutcome(json.outcome);
    return outcome === 'applied' ? { outcome, results: json.results } : { outcome };
  } catch {
    return { outcome: null }; // 回報失敗不影響對局收尾
  }
}
