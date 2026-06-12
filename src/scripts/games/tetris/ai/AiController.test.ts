import { describe, it, expect } from 'vitest';
import { TetrisGame } from '../engine/game';
import { AiController } from './AiController';

describe('AiController', () => {
  it('在足夠時間內會讓對手盤面落子（自己會下棋）', () => {
    const g = new TetrisGame({ seed: 1 });
    const ai = new AiController((a) => g.input(a), () => g.getState(), 'normal');
    // 推進數秒，AI 應已鎖定至少一塊（盤面出現非空格）
    for (let i = 0; i < 400; i++) { ai.update(16); g.step(16); }
    expect(g.getState().board.flat().filter((c) => c).length).toBeGreaterThan(0);
  });

  it('困難比簡單思考更快（間隔更短）', () => {
    const fast = new AiController(() => {}, () => new TetrisGame({ seed: 1 }).getState(), 'hard');
    const slow = new AiController(() => {}, () => new TetrisGame({ seed: 1 }).getState(), 'easy');
    expect((fast as unknown as { intervalMs: number }).intervalMs)
      .toBeLessThan((slow as unknown as { intervalMs: number }).intervalMs);
  });
});

/** 固定 seed 自打：AI 自己對著重力玩，回傳消行數/塊數/最終狀態。 */
function selfPlay(seed: number, maxPieces: number) {
  const g = new TetrisGame({ seed });
  const ai = new AiController((a) => g.input(a), () => g.getState(), 'hard');
  let pieces = 0;
  let ticks = 0;
  const MAX_TICKS = 120000; // 安全上限（16ms × 120000 = 32 分鐘模擬時間）
  while (pieces < maxPieces && g.getState().status === 'playing' && ticks < MAX_TICKS) {
    ai.update(16);
    g.step(16);
    for (const e of g.drainEvents()) if (e.kind === 'lock') pieces++;
    ticks++;
  }
  const s = g.getState();
  return { lines: s.lines, pieces, status: s.status };
}

describe('AiController — 防自滅回歸基準（hard 純重力自打）', () => {
  // 舊版（El-Tetris + 每 80ms 走一步）基線：600 塊目標下全 seed topout——
  // seed 42: 370 塊 132 行 topout / seed 7: 374 塊 134 行 topout / seed 555: 324 塊 113 行 topout。
  // 高等級重力（level 13+ 間隔 ≤ 18ms）超過逐步走子速度 → 亂放 → 疊死。
  it('固定 seed 自打 600 塊：不 topout 且消行 ≥ 150（舊版在此 topout）', () => {
    const r = selfPlay(42, 600);
    expect(r.status).toBe('playing');
    expect(r.pieces).toBe(600);
    expect(r.lines).toBeGreaterThanOrEqual(150);
  });

  it('換一個 seed 也不會自己疊死', () => {
    const r = selfPlay(555, 600);
    expect(r.status).toBe('playing');
    expect(r.lines).toBeGreaterThanOrEqual(150);
  });
});
