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
