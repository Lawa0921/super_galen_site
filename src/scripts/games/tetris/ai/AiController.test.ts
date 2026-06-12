import { describe, it, expect } from 'vitest';
import { TetrisGame } from '../engine/game';
import { AiController, type Difficulty } from './AiController';

/** 決定性 rng（LCG）：失誤判定可重現，速率探針不抖動。 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe('AiController', () => {
  it('在足夠時間內會讓對手盤面落子（自己會下棋）', () => {
    const g = new TetrisGame({ seed: 1 });
    const ai = new AiController((a) => g.input(a), () => g.getState(), 'normal');
    // 推進數秒，AI 應已鎖定至少一塊（盤面出現非空格）
    for (let i = 0; i < 400; i++) { ai.update(16); g.step(16); }
    expect(g.getState().board.flat().filter((c) => c).length).toBeGreaterThan(0);
  });

  it('難度越高思考越快：insane < hard < normal < easy', () => {
    const delay = (d: Difficulty) => {
      const ai = new AiController(() => {}, () => new TetrisGame({ seed: 1 }).getState(), d);
      return (ai as unknown as { intervalMs: number }).intervalMs;
    };
    expect(delay('insane')).toBeLessThan(delay('hard'));
    expect(delay('hard')).toBeLessThan(delay('normal'));
    expect(delay('normal')).toBeLessThan(delay('easy'));
  });

  it('insane 零失誤（mistakeRate = 0），其餘難度有失誤率', () => {
    const rate = (d: Difficulty) => {
      const ai = new AiController(() => {}, () => new TetrisGame({ seed: 1 }).getState(), d);
      return (ai as unknown as { mistakeRate: number }).mistakeRate;
    };
    expect(rate('insane')).toBe(0);
    expect(rate('hard')).toBeGreaterThan(0);
    expect(rate('normal')).toBeGreaterThan(rate('hard'));
    expect(rate('easy')).toBeGreaterThan(rate('normal'));
  });
});

/** 固定 seed 自打：AI 自己對著重力玩，回傳消行數/塊數/最終狀態。 */
function selfPlay(difficulty: Difficulty, seed: number, maxPieces: number) {
  const g = new TetrisGame({ seed });
  const ai = new AiController((a) => g.input(a), () => g.getState(), difficulty, lcg(seed * 7 + 1));
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

describe('AiController — 防自滅回歸基準（insane 純重力自打）', () => {
  // 舊版（El-Tetris + 每 80ms 走一步）基線：600 塊目標下全 seed topout——
  // seed 42: 370 塊 132 行 topout / seed 7: 374 塊 134 行 topout / seed 555: 324 塊 113 行 topout。
  // 高等級重力（level 13+ 間隔 ≤ 18ms）超過逐步走子速度 → 亂放 → 疊死。
  // 「最強」基準由 insane 承接（原 hard 80ms/零失誤參數整組搬到 insane）。
  it('固定 seed 自打 600 塊：不 topout 且消行 ≥ 150（舊版在此 topout）', () => {
    const r = selfPlay('insane', 42, 600);
    expect(r.status).toBe('playing');
    expect(r.pieces).toBe(600);
    expect(r.lines).toBeGreaterThanOrEqual(150);
  });

  it('換一個 seed 也不會自己疊死', () => {
    const r = selfPlay('insane', 555, 600);
    expect(r.status).toBe('playing');
    expect(r.lines).toBeGreaterThanOrEqual(150);
  });
});

/**
 * 速率探針：各難度純重力自打 30 秒「模擬時間」（16ms 固定步進，非牆鐘），
 * 斷言消行速率落在設計帶。玩家回饋：舊 hard（80ms+零失誤）≈ 3 行/秒人類不可能贏 →
 * hard 目標 0.4–1.0 行/秒（人類能贏）、insane 維持神級 > 2 行/秒、easy < 0.4 新手友善。
 */
function linesPerSecond(difficulty: Difficulty, seed: number, durationMs = 30_000): number {
  const g = new TetrisGame({ seed });
  const ai = new AiController((a) => g.input(a), () => g.getState(), difficulty, lcg(seed * 31 + 7));
  let t = 0;
  while (t < durationMs && g.getState().status === 'playing') {
    ai.update(16);
    g.step(16);
    t += 16;
  }
  return g.getState().lines / (t / 1000);
}

/** 3 個 seed 平均，壓低單局 7-bag 運氣抖動。 */
function avgRate(difficulty: Difficulty): number {
  const seeds = [42, 555, 7];
  return seeds.reduce((sum, s) => sum + linesPerSecond(difficulty, s), 0) / seeds.length;
}

describe('AiController — 難度速率帶（30 秒模擬時間自打）', () => {
  it('easy < 0.4 行/秒（新手友善）', () => {
    expect(avgRate('easy')).toBeLessThan(0.4);
  });

  it('normal 介於 easy 帶與 hard 帶之間（0.2–0.8 行/秒）', () => {
    const r = avgRate('normal');
    expect(r).toBeGreaterThan(0.2);
    expect(r).toBeLessThan(0.8);
  });

  it('hard 0.4–1.0 行/秒（強但人類能贏；舊版 ≈ 3 行/秒）', () => {
    const r = avgRate('hard');
    expect(r).toBeGreaterThanOrEqual(0.4);
    expect(r).toBeLessThanOrEqual(1.0);
  });

  it('insane > 2 行/秒（神級超級模式 = 原 hard 不降速）', () => {
    expect(avgRate('insane')).toBeGreaterThan(2);
  });
});
