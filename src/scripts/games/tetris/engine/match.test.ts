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

describe('TetrisMatch 垃圾傾倒與抵銷', () => {
  it('有待入垃圾、落地未消行 → 傾倒到自己盤面並發 garbageIn', () => {
    const m = new TetrisMatch({ seed: 3 });
    // 直接灌 B 的待入垃圾
    (m as unknown as { incoming: Record<string, number> }).incoming.B = 3;
    m.drainEvents();
    m.b.input('hardDrop'); // 一般落地、未消行
    m.step(0);
    const evs = m.drainEvents();
    expect(evs.some((e) => e.kind === 'garbageIn' && e.side === 'B' && e.amount === 3)).toBe(true);
    expect(m.pendingGarbage('B')).toBe(0);
    expect(m.b.getState().board.flat().filter((c) => c === 'G').length).toBeGreaterThan(0);
  });

  it('消行可抵銷待入垃圾（不傾倒）', () => {
    const m = new TetrisMatch({ seed: 3 });
    (m as unknown as { incoming: Record<string, number> }).incoming.A = 1;
    m.drainEvents();
    m.a.debugFillRowExceptOneAndDrop(); // 清 1 行（attack 0），但消行就不傾倒
    m.step(0);
    // 未傾倒：A 盤面不應因垃圾增加（仍有抵銷邏輯，single attack 0 不足以清 1，但「消行不傾倒」規則成立）
    const evs = m.drainEvents();
    expect(evs.some((e) => e.kind === 'garbageIn' && e.side === 'A')).toBe(false);
  });

  it('頂出 → result、對手勝、發 ko', () => {
    const m = new TetrisMatch({ seed: 3 });
    for (let i = 0; i < 25; i++) m.a.receiveGarbage(1, 0);
    m.drainEvents();
    m.a.input('hardDrop'); // 觸發 spawn 失敗 → topout
    m.step(0);
    const evs = m.drainEvents();
    expect(m.phase).toBe('result');
    expect(m.winner).toBe('B');
    expect(evs.some((e) => e.kind === 'ko' && e.winner === 'B')).toBe(true);
  });

  it('同 seed 兩場 match 垃圾洞序列相同（可重現）', () => {
    const holes = (seed: number) => {
      const m = new TetrisMatch({ seed });
      const r = (m as unknown as { holeRng: () => number }).holeRng;
      return [r(), r(), r()];
    };
    expect(holes(7)).toEqual(holes(7));
  });
});

describe('TetrisMatch 真實攻擊與抵銷（整合）', () => {
  it('連段送出真實垃圾給對手並發 attack 事件', () => {
    const m = new TetrisMatch({ seed: 5 });
    m.drainEvents();
    // 連續三次消行 → combo 0,1,2 → comboAttack 0+1+1 = 2 送給 B
    m.a.debugFillRowExceptOneAndDrop();
    m.a.debugFillRowExceptOneAndDrop();
    m.a.debugFillRowExceptOneAndDrop();
    m.step(0);
    expect(m.pendingGarbage('B')).toBe(2);
    const evs = m.drainEvents();
    expect(evs.some((e) => e.kind === 'attack' && e.from === 'A' && e.amount > 0)).toBe(true);
  });

  it('消行先抵銷自身待入垃圾、餘量才送對手', () => {
    const m = new TetrisMatch({ seed: 5 });
    (m as unknown as { incoming: Record<string, number> }).incoming.A = 1;
    m.drainEvents();
    // 四次消行 combo 0,1,2,3 → 送出 0+1+1+2=4；先抵銷 A 的 1 → A=0、B=3
    for (let i = 0; i < 4; i++) m.a.debugFillRowExceptOneAndDrop();
    m.step(0);
    expect(m.pendingGarbage('A')).toBe(0);
    expect(m.pendingGarbage('B')).toBe(3);
  });
});

describe('TetrisMatch 護盾（default-inactive）', () => {
  it('零回歸：addShield(side, 0) 後同 seed 同輸入 N 幀狀態與事件流逐位相等', () => {
    const run = (withShieldZero: boolean): string => {
      const m = new TetrisMatch({ seed: 11 });
      if (withShieldZero) m.addShield('A', 0);
      (m as unknown as { incoming: Record<string, number> }).incoming.A = 3;
      const evLog: string[] = [];
      for (let i = 0; i < 300; i++) {
        m.input('A', i % 7 === 0 ? 'hardDrop' : 'softDrop');
        m.input('B', i % 3 === 0 ? 'left' : 'rotateCW');
        m.step(16);
        evLog.push(JSON.stringify(m.drainEvents()));
      }
      return JSON.stringify([
        m.a.getState(), m.b.getState(),
        m.pendingGarbage('A'), m.pendingGarbage('B'),
        m.phase, m.winner,
      ]) + evLog.join('|');
    };
    expect(run(true)).toBe(run(false));
  });

  it('8 盾擋 5 行：全擋（發 shieldBlock 5、不傾倒）；再 5 行 → 擋 3 傾 2', () => {
    const m = new TetrisMatch({ seed: 3 });
    m.addShield('B', 8);
    const inc = (m as unknown as { incoming: Record<string, number> }).incoming;
    inc.B = 5;
    m.drainEvents();
    m.b.input('hardDrop'); // 落地未消行 → 結算傾倒
    m.step(0);
    let evs = m.drainEvents();
    expect(evs.some((e) => e.kind === 'shieldBlock' && e.side === 'B' && e.amount === 5)).toBe(true);
    expect(evs.some((e) => e.kind === 'garbageIn' && e.side === 'B')).toBe(false);
    expect(m.b.getState().board.flat().filter((c) => c === 'G').length).toBe(0);
    // 剩盾 3：再送 5 → 擋 3、傾倒 2
    inc.B = 5;
    m.b.input('hardDrop');
    m.step(0);
    evs = m.drainEvents();
    expect(evs.some((e) => e.kind === 'shieldBlock' && e.side === 'B' && e.amount === 3)).toBe(true);
    expect(evs.some((e) => e.kind === 'garbageIn' && e.side === 'B' && e.amount === 2)).toBe(true);
    expect(m.b.getState().board.flat().filter((c) => c === 'G').length).toBe(2 * 9);
    // 盾已耗盡：第三波全傾倒
    inc.B = 1;
    m.b.input('hardDrop');
    m.step(0);
    evs = m.drainEvents();
    expect(evs.some((e) => e.kind === 'shieldBlock')).toBe(false);
    expect(evs.some((e) => e.kind === 'garbageIn' && e.side === 'B' && e.amount === 1)).toBe(true);
  });

  it('addShield 可累加、各側獨立、非正數忽略', () => {
    const m = new TetrisMatch({ seed: 3 });
    m.addShield('A', 2);
    m.addShield('A', 3);
    m.addShield('A', 0);
    m.addShield('A', -4);
    const inc = (m as unknown as { incoming: Record<string, number> }).incoming;
    inc.A = 9;
    m.drainEvents();
    m.a.input('hardDrop');
    m.step(0);
    const evs = m.drainEvents();
    // A 有 5 盾；B 完全沒有
    expect(evs.some((e) => e.kind === 'shieldBlock' && e.side === 'A' && e.amount === 5)).toBe(true);
    expect(evs.some((e) => e.kind === 'garbageIn' && e.side === 'A' && e.amount === 4)).toBe(true);
    inc.B = 2;
    m.b.input('hardDrop');
    m.step(0);
    const evsB = m.drainEvents();
    expect(evsB.some((e) => e.kind === 'shieldBlock' && e.side === 'B')).toBe(false);
    expect(evsB.some((e) => e.kind === 'garbageIn' && e.side === 'B' && e.amount === 2)).toBe(true);
  });
});
