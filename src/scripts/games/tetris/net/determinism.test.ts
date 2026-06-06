import { describe, it, expect } from 'vitest';
import { TetrisMatch } from '../engine/match';

const SIM_DT = 1000 / 60;

function run(seed: number, script: Array<{ frame: number; side: 'A' | 'B'; action: any }>) {
  const m = new TetrisMatch({ seed });
  const byFrame = new Map<number, typeof script>();
  for (const s of script) {
    const arr = byFrame.get(s.frame) ?? [];
    arr.push(s);
    byFrame.set(s.frame, arr);
  }
  for (let f = 0; f < 300; f++) {
    const ins = byFrame.get(f) ?? [];
    // 固定順序：先 A 後 B
    for (const i of ins.filter((x) => x.side === 'A')) m.input('A', i.action);
    for (const i of ins.filter((x) => x.side === 'B')) m.input('B', i.action);
    m.step(SIM_DT);
  }
  return m;
}

describe('deterministic fixed-step match', () => {
  it('同 seed + 同輸入序列 + 固定 dt → 兩 match 盤面/分數完全一致', () => {
    const script = [
      { frame: 5, side: 'A' as const, action: 'left' as const },
      { frame: 5, side: 'B' as const, action: 'right' as const },
      { frame: 10, side: 'A' as const, action: 'hardDrop' as const },
      { frame: 12, side: 'B' as const, action: 'rotateCW' as const },
      { frame: 20, side: 'B' as const, action: 'hardDrop' as const },
    ];
    const a = run(42, script).a.getState();
    const b = run(42, script).a.getState();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // 不同 seed 應不同
    const c = run(43, script).a.getState();
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });
});
