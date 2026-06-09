import { TetrisMatch, type Side } from '../engine/match';
import type { InputAction } from '../engine/game';

const SIM_DT = 1000 / 60;
const MAX_FRAMES = 60 * 60 * 20; // 上限 20 分鐘，防爆量
const MAX_EVENTS = 8000;

/** 一場 1v1 鎖步的可重播紀錄：seed + 總幀數 + 稀疏的逐幀雙方輸入。 */
export interface MatchReplay {
  seed: number;
  frameCount: number;
  events: Array<{ f: number; a: InputAction[]; b: InputAction[] }>;
}

/** 以確定性引擎重跑該局，回傳勝方（未分勝負回 null）。 */
export function simulateReplay(replay: MatchReplay): Side | null {
  const byFrame = new Map<number, { a: InputAction[]; b: InputAction[] }>();
  for (const e of replay.events) byFrame.set(e.f, { a: e.a, b: e.b });
  const m = new TetrisMatch({ seed: replay.seed });
  const n = Math.min(replay.frameCount, MAX_FRAMES);
  for (let f = 0; f < n && m.phase === 'playing'; f++) {
    const ins = byFrame.get(f);
    if (ins) {
      for (const a of ins.a) m.input('A', a);
      for (const b of ins.b) m.input('B', b);
    }
    m.step(SIM_DT);
  }
  return m.winner ?? null;
}

/** replay 結構合理且重模擬出的勝方 == 宣稱勝方。 */
export function verifyReplay(replay: MatchReplay, claimedWinnerSide: Side): boolean {
  if (!replay || typeof replay.seed !== 'number' || !Number.isFinite(replay.frameCount) || !Array.isArray(replay.events)) {
    return false;
  }
  if (replay.frameCount > MAX_FRAMES || replay.events.length > MAX_EVENTS) return false;
  return simulateReplay(replay) === claimedWinnerSide;
}
