import { describe, it, expect } from 'vitest';
import { TetrisGame } from './game';
import { TetrisMatch } from './match';
import {
  applySkill, resetSlow,
  DEFAULT_BOMB_ROWS, DEFAULT_SHIELD_ROWS, SLOW_SCALE, SLOW_DURATION_MS,
} from './items';

describe('items 常數', () => {
  it('預設值符合 spec：bomb 2 行、shield 8 行、slow 0.3×/10s', () => {
    expect(DEFAULT_BOMB_ROWS).toBe(2);
    expect(DEFAULT_SHIELD_ROWS).toBe(8);
    expect(SLOW_SCALE).toBe(0.3);
    expect(SLOW_DURATION_MS).toBe(10000);
  });
});

describe('applySkill: bomb', () => {
  it('預設清除最底 2 行（不計分、發 itemClear）', () => {
    const g = new TetrisGame({ seed: 1 });
    g.receiveGarbage(3, 4);
    g.drainEvents();
    applySkill({ game: g }, 'bomb');
    const s = g.getState();
    expect(s.board.flat().filter((c) => c === 'G').length).toBe(9); // 3 行剩 1 行
    expect(s.score).toBe(0);
    const evs = g.drainEvents();
    expect(evs.some((e) => e.kind === 'itemClear' && e.rows === 2)).toBe(true);
    expect(evs.some((e) => e.kind === 'lineClear')).toBe(false);
  });

  it('bombRows 參數化（perk 加成）：bombRows=3 清 3 行', () => {
    const g = new TetrisGame({ seed: 1 });
    g.receiveGarbage(3, 4);
    applySkill({ game: g }, 'bomb', { bombRows: 3 });
    expect(g.getState().board.flat().filter((c) => c === 'G').length).toBe(0);
  });
});

describe('applySkill: slow + resetSlow', () => {
  it('slow 套用 0.3× 重力（下落較慢）；resetSlow 還原原速', () => {
    const normal = new TetrisGame({ seed: 1 });
    const slowed = new TetrisGame({ seed: 1 });
    applySkill({ game: slowed }, 'slow');
    normal.step(1000);
    slowed.step(1000); // 間隔 1000/0.3≈3333 → 不下落
    expect(slowed.getState().active!.y).toBeLessThan(normal.getState().active!.y);
    resetSlow(slowed);
    const y0 = slowed.getState().active!.y;
    slowed.step(1000); // 累積 2000ms ÷ 1000ms → 下落
    expect(slowed.getState().active!.y).toBeGreaterThan(y0);
  });
});

describe('applySkill: reroll', () => {
  it('同 seed 同時機 applySkill reroll → 確定性相同；與未 reroll 不同', () => {
    const a = new TetrisGame({ seed: 9 });
    const b = new TetrisGame({ seed: 9 });
    const c = new TetrisGame({ seed: 9 });
    applySkill({ game: a }, 'reroll');
    applySkill({ game: b }, 'reroll');
    expect(JSON.stringify(a.getState())).toBe(JSON.stringify(b.getState()));
    const sa = a.getState();
    const sc = c.getState();
    expect([sa.active!.type, ...sa.next].join('')).not.toBe([sc.active!.type, ...sc.next].join(''));
  });
});

describe('applySkill: shield', () => {
  it('經 match 接線：預設加 8 盾、擋下垃圾', () => {
    const m = new TetrisMatch({ seed: 3 });
    applySkill({ game: m.b, match: m, side: 'B' }, 'shield');
    (m as unknown as { incoming: Record<string, number> }).incoming.B = 8;
    m.drainEvents();
    m.b.input('hardDrop');
    m.step(0);
    const evs = m.drainEvents();
    expect(evs.some((e) => e.kind === 'shieldBlock' && e.side === 'B' && e.amount === 8)).toBe(true);
    expect(evs.some((e) => e.kind === 'garbageIn' && e.side === 'B')).toBe(false);
  });

  it('shieldRows 參數化', () => {
    const m = new TetrisMatch({ seed: 3 });
    applySkill({ game: m.a, match: m, side: 'A' }, 'shield', { shieldRows: 2 });
    (m as unknown as { incoming: Record<string, number> }).incoming.A = 5;
    m.drainEvents();
    m.a.input('hardDrop');
    m.step(0);
    const evs = m.drainEvents();
    expect(evs.some((e) => e.kind === 'shieldBlock' && e.side === 'A' && e.amount === 2)).toBe(true);
    expect(evs.some((e) => e.kind === 'garbageIn' && e.side === 'A' && e.amount === 3)).toBe(true);
  });

  it('缺 match context → throw（避免接線錯誤靜默吞掉）', () => {
    const g = new TetrisGame({ seed: 1 });
    expect(() => applySkill({ game: g }, 'shield')).toThrow();
  });
});
