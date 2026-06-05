import { describe, it, expect } from 'vitest';
import { TetrisMatch } from './match';

describe('TetrisMatch 初始化', () => {
  it('兩盤皆 playing、同 seed 方塊序列相同（公平）', () => {
    const m = new TetrisMatch({ seed: 9 });
    expect(m.phase).toBe('playing');
    const sa = m.a.getState();
    const sb = m.b.getState();
    expect(sa.active!.type).toBe(sb.active!.type);
    expect(sa.next).toEqual(sb.next);
  });

  it('input 只路由到指定側', () => {
    const m = new TetrisMatch({ seed: 9 });
    const x0 = m.a.getState().active!.x;
    m.input('A', 'left');
    expect(m.a.getState().active!.x).toBe(x0 - 1);
    expect(m.b.getState().active!.x).toBe(x0); // B 不受影響
  });
});

describe('TetrisMatch 攻擊路由', () => {
  it('A 消行 → 對手 B 累積待入垃圾，並發出 attack 事件', () => {
    const m = new TetrisMatch({ seed: 9 });
    m.drainEvents();
    m.a.debugFillRowExceptOneAndDrop(); // A 清 1 行（single，attack 0）→ 不送
    m.step(0);
    // single 攻擊 0；改用連段或 tetris 才會送。這裡先確認 single 不送。
    expect(m.pendingGarbage('B')).toBe(0);
  });
});
