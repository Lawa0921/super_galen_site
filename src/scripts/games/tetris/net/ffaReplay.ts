import { FfaMatch } from '../engine/ffa';
import type { InputAction } from '../engine/game';

const SIM_DT = 1000 / 60;
const MAX_FRAMES = 60 * 60 * 30; // FFA 局可較長，上限 30 分鐘
const MAX_EVENTS = 20000;

/** 一場 FFA 的可重播紀錄：seed + 玩家清單 + 總幀數 + 稀疏的逐幀「某玩家」輸入。 */
export interface FfaReplay {
  seed: number;
  playerIds: string[];
  frameCount: number;
  events: Array<{ f: number; p: string; a: InputAction[] }>;
  /** 中離事件（可選，向後相容）：幀 f 時玩家 p 判敗淘汰；套用順序在該幀輸入之前。 */
  forfeits?: Array<{ f: number; p: string }>;
}

/** 以確定性引擎重跑該 FFA 局，回傳最終名次（getStandings，index0=冠軍）或 null（未結束）。 */
export function simulateFfaReplay(replay: FfaReplay): string[] | null {
  // 依 frame 分組事件（同一幀可能有多筆不同玩家的輸入，依陣列順序排列）
  const byFrame = new Map<number, Array<{ p: string; a: InputAction[] }>>();
  for (const e of replay.events) {
    if (!byFrame.has(e.f)) byFrame.set(e.f, []);
    byFrame.get(e.f)!.push({ p: e.p, a: e.a });
  }

  // 依 frame 分組 forfeits（同一幀多筆依陣列出現序套用）
  const forfeitsByFrame = new Map<number, string[]>();
  if (Array.isArray(replay.forfeits)) {
    for (const ff of replay.forfeits) {
      if (!forfeitsByFrame.has(ff.f)) forfeitsByFrame.set(ff.f, []);
      forfeitsByFrame.get(ff.f)!.push(ff.p);
    }
  }

  const match = new FfaMatch(replay.playerIds, { seed: replay.seed });
  const n = Math.min(replay.frameCount, MAX_FRAMES);

  for (let f = 0; f < n && match.phase === 'playing'; f++) {
    // 該幀的中離事件先於輸入套用（與錄製端約定一致）
    const frameForfeits = forfeitsByFrame.get(f);
    if (frameForfeits) {
      for (const p of frameForfeits) match.forfeit(p);
    }
    const frameInputs = byFrame.get(f);
    if (frameInputs) {
      // 同一幀多筆 events 依其在 events 陣列中的順序套用
      for (const entry of frameInputs) {
        for (const act of entry.a) {
          match.input(entry.p, act);
        }
      }
    }
    match.step(SIM_DT);
  }

  if (match.phase === 'result') {
    return match.getStandings();
  }
  return null;
}

/** replay 結構合理且重模擬名次 == 宣稱名次。 */
export function verifyFfaReplay(replay: FfaReplay, claimedStandings: string[]): boolean {
  // 結構檢查：replay 本身必須是物件
  if (!replay || typeof replay !== 'object') return false;

  // 各欄位型別檢查
  if (typeof replay.seed !== 'number') return false;
  if (!Array.isArray(replay.playerIds)) return false;
  if (!Number.isFinite(replay.frameCount)) return false;
  if (!Array.isArray(replay.events)) return false;

  // 上限檢查
  if (replay.frameCount > MAX_FRAMES) return false;
  if (replay.events.length > MAX_EVENTS) return false;

  // forfeits 檢查（欄位不存在＝合法，向後相容）
  if (replay.forfeits !== undefined) {
    if (!Array.isArray(replay.forfeits)) return false;
    if (replay.forfeits.length > replay.playerIds.length) return false;
    for (const ff of replay.forfeits) {
      if (!ff || typeof ff !== 'object') return false;
      if (!Number.isFinite(ff.f) || ff.f < 0 || ff.f > replay.frameCount) return false;
      if (typeof ff.p !== 'string' || !replay.playerIds.includes(ff.p)) return false;
    }
  }

  // 重模擬並與宣稱名次逐位比對
  const simStandings = simulateFfaReplay(replay);
  if (simStandings === null) return false;
  if (simStandings.length !== claimedStandings.length) return false;
  for (let i = 0; i < simStandings.length; i++) {
    if (simStandings[i] !== claimedStandings[i]) return false;
  }
  return true;
}
