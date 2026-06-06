import { describe, it, expect } from 'vitest';
import { baseAttack, comboAttack, computeAttack, cancelGarbage } from './attack';

describe('baseAttack', () => {
  it('一般消行：single0 double1 triple2 tetris4', () => {
    expect(baseAttack(1, 'none')).toBe(0);
    expect(baseAttack(2, 'none')).toBe(1);
    expect(baseAttack(3, 'none')).toBe(2);
    expect(baseAttack(4, 'none')).toBe(4);
  });
  it('T-spin(full)：single2 double4 triple6', () => {
    expect(baseAttack(1, 'full')).toBe(2);
    expect(baseAttack(2, 'full')).toBe(4);
    expect(baseAttack(3, 'full')).toBe(6);
  });
});

describe('comboAttack', () => {
  it('combo<=0 無加成；之後遞增', () => {
    expect(comboAttack(0)).toBe(0);
    expect(comboAttack(1)).toBe(1);
    expect(comboAttack(3)).toBe(2);
    expect(comboAttack(99)).toBe(5); // 飽和
  });
});

describe('computeAttack', () => {
  it('0 行不送', () => {
    expect(computeAttack({ count: 0, tSpin: 'none', combo: 5, b2b: true })).toBe(0);
  });
  it('tetris + combo + b2b 疊加', () => {
    // base4 + combo(1)=1 + b2b1 = 6
    expect(computeAttack({ count: 4, tSpin: 'none', combo: 1, b2b: true })).toBe(6);
  });
  it('b2b 只對困難消除生效', () => {
    // single 非困難：base0 + combo0 + 0 = 0
    expect(computeAttack({ count: 1, tSpin: 'none', combo: 0, b2b: true })).toBe(0);
  });
});

describe('cancelGarbage', () => {
  it('送出 >= 待入：清空待入、餘量送出', () => {
    expect(cancelGarbage(3, 5)).toEqual({ incoming: 0, sent: 2 });
  });
  it('送出 < 待入：扣待入、不送出', () => {
    expect(cancelGarbage(5, 2)).toEqual({ incoming: 3, sent: 0 });
  });
});
