import { describe, it, expect } from 'vitest';
import { TetrisGame, type InputAction } from './game';

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

describe('TetrisGame 垃圾與頂出', () => {
  it('receiveGarbage 從底部加入垃圾列', () => {
    const g = new TetrisGame({ seed: 1 });
    g.receiveGarbage(3, 4);
    const board = g.getState().board;
    const lastY = board.length - 1;
    expect(board[lastY].filter((c) => c === 'G').length).toBe(9);
    expect(board[lastY][4]).toBe(null); // 洞
  });

  it('堆到頂時 spawn 失敗 → status=topout、發出 topout 事件', () => {
    const g = new TetrisGame({ seed: 1 });
    // 注入大量垃圾把盤面塞滿到頂
    for (let i = 0; i < 25; i++) g.receiveGarbage(1, 0);
    g.input('hardDrop'); // 觸發下一次 spawn
    expect(g.getState().status).toBe('topout');
  });
});

describe('TetrisGame combo 與事件整合', () => {
  it('連續消行讓 combo 遞增、未消行的落地把 combo 歸 -1', () => {
    const g = new TetrisGame({ seed: 1 });
    expect(g.getState().combo).toBe(-1);
    g.debugFillRowExceptOneAndDrop();
    expect(g.getState().combo).toBe(0);
    g.debugFillRowExceptOneAndDrop();
    expect(g.getState().combo).toBe(1);
    g.debugFillRowExceptOneAndDrop();
    expect(g.getState().combo).toBe(2);
    // 目前 active 是一般方塊，直接硬降不會消行 → combo 歸 -1
    g.input('hardDrop');
    expect(g.getState().combo).toBe(-1);
  });

  it('消行會發出 lineClear 事件（含 combo 欄位）', () => {
    const g = new TetrisGame({ seed: 1 });
    g.drainEvents();
    g.debugFillRowExceptOneAndDrop();
    const events = g.drainEvents();
    const lc = events.find((e) => e.kind === 'lineClear');
    expect(lc).toBeDefined();
    if (lc && lc.kind === 'lineClear') {
      expect(lc.count).toBe(1);
      expect(lc.combo).toBe(0);
    }
  });

  it('頂出時發出 topout 事件且 status 為 topout', () => {
    const g = new TetrisGame({ seed: 1 });
    for (let i = 0; i < 25; i++) g.receiveGarbage(1, 0);
    g.drainEvents();
    g.input('hardDrop'); // 觸發下一次 spawn → 失敗 → topout
    const events = g.drainEvents();
    expect(events.some((e) => e.kind === 'topout')).toBe(true);
    expect(g.getState().status).toBe('topout');
  });
});

describe('TetrisGame setGravityScale（default-inactive）', () => {
  const INPUTS: InputAction[] = [
    'left', 'rotateCW', 'right', 'softDrop', 'right', 'rotateCCW',
    'left', 'softDrop', 'right', 'rotateCW', 'left', 'hardDrop',
  ];
  /** 確定性輸入腳本：每幀一個輸入 + step(16)，回傳逐幀事件流 JSON */
  function runFrames(g: TetrisGame, frames: number): string {
    const evLog: string[] = [];
    for (let i = 0; i < frames; i++) {
      g.input(INPUTS[i % INPUTS.length]);
      g.step(16);
      evLog.push(JSON.stringify(g.drainEvents()));
    }
    return evLog.join('|');
  }

  it('零回歸：setGravityScale(1) 後同 seed 同輸入 600 幀 getState 與事件流逐位相等', () => {
    const a = new TetrisGame({ seed: 42 });
    const b = new TetrisGame({ seed: 42 });
    b.setGravityScale(1); // 顯式設回預設值 → 必須與從未呼叫者逐位相同
    const evA = runFrames(a, 600);
    const evB = runFrames(b, 600);
    expect(JSON.stringify(b.getState())).toBe(JSON.stringify(a.getState()));
    expect(evB).toBe(evA);
  });

  it('scale=0.3 下落變慢；還原 1 恢復下落', () => {
    const normal = new TetrisGame({ seed: 1 });
    const slow = new TetrisGame({ seed: 1 });
    slow.setGravityScale(0.3); // level 1 間隔 1000ms → 3333ms
    normal.step(1000);
    slow.step(1000);
    expect(normal.getState().active!.y).toBeGreaterThan(slow.getState().active!.y);
    slow.setGravityScale(1);
    const y0 = slow.getState().active!.y;
    slow.step(1000); // 累積 2000ms ÷ 1000ms → 下落
    expect(slow.getState().active!.y).toBeGreaterThan(y0);
  });

  it('gravity scale 不影響 lock delay（仍為 500ms）', () => {
    const g = new TetrisGame({ seed: 1 });
    g.setGravityScale(2); // 間隔 1000 → 500ms
    for (let i = 0; i < 25; i++) g.input('softDrop'); // 推到底（落地不觸發 locking）
    g.drainEvents();
    // step(100)×5：第 5 步重力 tick 觸發 locking、lockTimer=100
    // 再 3 步 lockTimer=400 < 500 → 第 8 步仍未鎖；第 9 步 lockTimer=500 → 鎖定
    for (let i = 0; i < 8; i++) g.step(100);
    expect(g.drainEvents().some((e) => e.kind === 'lock')).toBe(false);
    g.step(100);
    expect(g.drainEvents().some((e) => e.kind === 'lock')).toBe(true);
  });

  it('clamp：非正數/NaN 忽略、上限 10', () => {
    const g = new TetrisGame({ seed: 1 });
    g.setGravityScale(0);
    g.setGravityScale(-3);
    g.setGravityScale(NaN);
    const ref = new TetrisGame({ seed: 1 });
    g.step(999);
    ref.step(999); // 仍為原速 → 999 < 1000 不下落
    expect(g.getState().active!.y).toBe(ref.getState().active!.y);
    g.setGravityScale(100); // clamp → 10，間隔 100ms
    g.step(100); // 累積 1099ms ÷ 100ms → 下落 10 格（若未 clamp 會直衝到底）
    expect(g.getState().active!.y).toBe(10);
  });
});

describe('TetrisGame clearBottomRows（道具）', () => {
  it('堆 3 行清 2 行：剩 1 行且內容=原最上行；分數/combo/lines 不變；active 不動', () => {
    const g = new TetrisGame({ seed: 1 });
    g.receiveGarbage(1, 2); // 先進 → 最後在最上（hole@2）
    g.receiveGarbage(1, 5);
    g.receiveGarbage(1, 7); // 最底（hole@7）
    const before = g.getState();
    g.drainEvents();
    g.clearBottomRows(2);
    const s = g.getState();
    const lastRow = s.board[s.board.length - 1];
    expect(lastRow.filter((c) => c === 'G').length).toBe(9);
    expect(lastRow[2]).toBe(null); // 剩下的是原最上行（hole@2）
    expect(s.board.flat().filter((c) => c === 'G').length).toBe(9); // 只剩 1 行垃圾
    expect(s.score).toBe(before.score);
    expect(s.combo).toBe(before.combo);
    expect(s.lines).toBe(before.lines);
    expect(s.active).toEqual(before.active);
  });

  it('不發 lineClear、發 itemClear（rows=n）', () => {
    const g = new TetrisGame({ seed: 1 });
    g.receiveGarbage(3, 4);
    g.drainEvents();
    g.clearBottomRows(2);
    const evs = g.drainEvents();
    expect(evs.some((e) => e.kind === 'lineClear')).toBe(false);
    expect(evs.some((e) => e.kind === 'itemClear' && e.rows === 2)).toBe(true);
  });

  it('空盤/n=0 安全 no-op', () => {
    const g = new TetrisGame({ seed: 1 });
    const before = JSON.stringify(g.getState());
    g.drainEvents();
    g.clearBottomRows(0);
    expect(g.drainEvents().length).toBe(0);
    g.clearBottomRows(2); // 空盤照常運作（移除空行=無變化）
    expect(JSON.stringify(g.getState())).toBe(before);
  });
});

describe('TetrisGame rerollQueue（道具）', () => {
  it('確定性：同 seed 同時機 reroll → 兩實例狀態逐位相同', () => {
    const a = new TetrisGame({ seed: 9 });
    const b = new TetrisGame({ seed: 9 });
    a.rerollQueue();
    b.rerollQueue();
    expect(JSON.stringify(a.getState())).toBe(JSON.stringify(b.getState()));
  });

  it('真的有重抽：與未 reroll 實例的 active+next 序列不同；next 長度不變', () => {
    const a = new TetrisGame({ seed: 9 });
    const c = new TetrisGame({ seed: 9 });
    a.rerollQueue();
    const sa = a.getState();
    const sc = c.getState();
    expect(sa.next.length).toBe(sc.next.length);
    expect([sa.active!.type, ...sa.next].join('')).not.toBe([sc.active!.type, ...sc.next].join(''));
  });

  it('reroll 後 active 從 spawn 位置重出（發 spawn 事件）', () => {
    const g = new TetrisGame({ seed: 9 });
    g.input('softDrop');
    g.input('softDrop');
    g.drainEvents();
    g.rerollQueue();
    expect(g.getState().active!.y).toBe(0); // 回到 spawn 高度
    expect(g.drainEvents().some((e) => e.kind === 'spawn')).toBe(true);
  });

  it('盤面已滿時 reroll → 照既有 topout 規則；topout 後再 reroll 安全 no-op', () => {
    const g = new TetrisGame({ seed: 9 });
    for (let i = 0; i < 25; i++) g.receiveGarbage(1, 0);
    g.rerollQueue(); // spawn 失敗 → topout
    expect(g.getState().status).toBe('topout');
    g.rerollQueue(); // 不應 throw
    expect(g.getState().status).toBe('topout');
  });
});
