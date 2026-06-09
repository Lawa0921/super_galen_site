import { describe, it, expect } from 'vitest';
import { simulateReplay, verifyReplay, type MatchReplay } from './replay';
import { TetrisMatch } from '../engine/match';
import type { InputAction } from '../engine/game';

const SIM_DT = 1000 / 60;

function buildReplay(seed: number): { replay: MatchReplay; winner: 'A' | 'B' } {
  const m = new TetrisMatch({ seed });
  const events: MatchReplay['events'] = [];
  let f = 0;
  for (; f < 4000 && m.phase === 'playing'; f++) {
    const a: InputAction[] = (f % 2 === 0) ? ['hardDrop'] : []; // A 狂硬降 → 很快堆頂
    const b: InputAction[] = [];
    if (a.length || b.length) events.push({ f, a, b });
    for (const x of a) m.input('A', x);
    for (const x of b) m.input('B', x);
    m.step(SIM_DT);
  }
  return { replay: { seed, frameCount: f, events }, winner: m.winner as 'A' | 'B' };
}

describe('simulateReplay / verifyReplay', () => {
  it('重模擬還原出與原局相同的勝方', () => {
    const { replay, winner } = buildReplay(123);
    expect(['A', 'B']).toContain(winner);
    expect(simulateReplay(replay)).toBe(winner);
  });
  it('宣稱正確勝方 → verify 通過；宣稱反方 → 不通過', () => {
    const { replay, winner } = buildReplay(123);
    const other = winner === 'A' ? 'B' : 'A';
    expect(verifyReplay(replay, winner)).toBe(true);
    expect(verifyReplay(replay, other)).toBe(false);
  });
  it('超量幀數直接拒絕', () => {
    expect(verifyReplay({ seed: 1, frameCount: 99_999_999, events: [] }, 'A')).toBe(false);
  });
});
