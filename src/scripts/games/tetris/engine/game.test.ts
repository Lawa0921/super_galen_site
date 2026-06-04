import { describe, it, expect } from 'vitest';
import { TetrisGame } from './game';

describe('TetrisGame 初始化', () => {
  it('開局有 active 方塊、next 佇列、status=playing', () => {
    const g = new TetrisGame({ seed: 1 });
    const s = g.getState();
    expect(s.active).not.toBeNull();
    expect(s.next.length).toBeGreaterThanOrEqual(5);
    expect(s.status).toBe('playing');
    expect(s.score).toBe(0);
    expect(s.level).toBe(1);
    expect(s.combo).toBe(-1);
  });

  it('同 seed 兩局 active/next 完全相同', () => {
    const a = new TetrisGame({ seed: 7 }).getState();
    const b = new TetrisGame({ seed: 7 }).getState();
    expect(a.active!.type).toBe(b.active!.type);
    expect(a.next).toEqual(b.next);
  });
});

describe('TetrisGame 移動與旋轉', () => {
  it('left/right 改變 active.x', () => {
    const g = new TetrisGame({ seed: 1 });
    const x0 = g.getState().active!.x;
    g.input('left');
    expect(g.getState().active!.x).toBe(x0 - 1);
    g.input('right');
    g.input('right');
    expect(g.getState().active!.x).toBe(x0 + 1);
  });

  it('rotateCW 改變 rotation', () => {
    const g = new TetrisGame({ seed: 1 });
    const r0 = g.getState().active!.rotation;
    g.input('rotateCW');
    expect(g.getState().active!.rotation).toBe((r0 + 1) % 4);
  });
});
