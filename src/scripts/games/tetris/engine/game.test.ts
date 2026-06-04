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

describe('TetrisGame 硬降與消行', () => {
  it('hardDrop 後鎖定並 spawn 新方塊（active 換人、發出 lock 事件）', () => {
    const g = new TetrisGame({ seed: 1 });
    g.drainEvents();
    g.input('hardDrop');
    const kinds = g.drainEvents().map((e) => e.kind);
    expect(kinds).toContain('lock');
    expect(kinds).toContain('spawn');
    expect(g.getState().active).not.toBeNull();
  });

  it('填滿一整列後 hardDrop 觸發 lineClear、lines 增加、分數上升', () => {
    const g = new TetrisGame({ seed: 1 });
    // 直接灌入「只差一格就填滿的最底列」來驗證消行管線
    g.debugFillRowExceptOneAndDrop();
    const s = g.getState();
    expect(s.lines).toBeGreaterThanOrEqual(1);
    expect(s.score).toBeGreaterThan(0);
  });

  it('hardDrop 得分 = 下落格數 × HARD_DROP_POINTS（至少 >0）', () => {
    const g = new TetrisGame({ seed: 1 });
    g.input('hardDrop');
    expect(g.getState().score).toBeGreaterThan(0);
  });
});

describe('TetrisGame hold', () => {
  it('首次 hold 把 active 收進 hold、換成新方塊、且本回合不能再 hold', () => {
    const g = new TetrisGame({ seed: 1 });
    const before = g.getState().active!.type;
    g.input('hold');
    const s = g.getState();
    expect(s.hold).toBe(before);
    expect(s.canHold).toBe(false);
    g.input('hold'); // 第二次應被忽略
    expect(g.getState().hold).toBe(before);
  });

  it('鎖定後可再次 hold（canHold 重置）', () => {
    const g = new TetrisGame({ seed: 1 });
    g.input('hold');
    g.input('hardDrop');
    expect(g.getState().canHold).toBe(true);
  });
});

describe('TetrisGame step 重力', () => {
  it('累積足夠時間後 active 下落一格', () => {
    const g = new TetrisGame({ seed: 1 });
    const y0 = g.getState().active!.y;
    g.step(2000); // 遠大於第 1 級重力間隔
    expect(g.getState().active!.y).toBeGreaterThan(y0);
  });

  it('落地後持續 step 超過 lock delay 會鎖定並換方塊', () => {
    const g = new TetrisGame({ seed: 1 });
    // 先硬性把方塊推到底
    for (let i = 0; i < 25; i++) g.step(2000);
    g.drainEvents();
    for (let i = 0; i < 5; i++) g.step(2000);
    expect(g.drainEvents().some((e) => e.kind === 'lock')).toBe(true);
  });
});
