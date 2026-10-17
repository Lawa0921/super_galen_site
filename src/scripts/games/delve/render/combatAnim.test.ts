// combatAnim.test.ts — 攻擊動畫角度、矛的伸縮、怪物影格選擇、傷害數字飄字
import { describe, it, expect } from 'vitest';
import { aimArmDeg, attackArmDeg, spearThrust, enemyFrameIndex, FloatNumbers, digitRows } from './combatAnim';
import { makeEnemy } from '../engine/enemies';

describe('攻擊動畫', () => {
  it('瞄準角 → 手臂角（面向座標）：右 = 90、上 = 180、下 = 0；面向左時鏡像', () => {
    expect(aimArmDeg(0, 1)).toBeCloseTo(90);
    expect(aimArmDeg(-Math.PI / 2, 1)).toBeCloseTo(180);
    expect(aimArmDeg(Math.PI / 2, 1)).toBeCloseTo(0);
    expect(aimArmDeg(Math.PI, -1)).toBeCloseTo(90);
  });
  it('劍：從頭頂後方往前下劈（角度單調遞減）', () => {
    const a = [0, 0.25, 0.5, 0.75, 1].map((p) => attackArmDeg('sword', p, 90));
    expect(a[0]).toBeGreaterThan(170);
    expect(a[4]).toBeLessThan(40);
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeLessThanOrEqual(a[i - 1]);
  });
  it('弓 / 法杖 / 矛：手臂指向瞄準方向', () => {
    for (const k of ['bow', 'staff', 'spear'] as const) expect(attackArmDeg(k, 0.5, 123)).toBe(123);
  });
  it('矛：先刺出再收回', () => {
    expect(spearThrust(0)).toBe(0);
    expect(spearThrust(0.45)).toBeCloseTo(1);
    expect(spearThrust(1)).toBeLessThan(0.2);
  });
});

describe('怪物影格', () => {
  it('跳跳型：地上兩格呼吸、空中上升 / 下降各一格', () => {
    const e = makeEnemy(1, 'gel_blob', 0, 0);
    e.body.onGround = true; e.age = 0;
    const a = enemyFrameIndex(e, 4);
    e.age = 0.35;
    expect(enemyFrameIndex(e, 4)).not.toBe(a);
    e.body.onGround = false; e.body.vy = -100;
    expect(enemyFrameIndex(e, 4)).toBe(2);
    e.body.vy = 100;
    expect(enemyFrameIndex(e, 4)).toBe(3);
  });
  it('首領第二階段用後三格', () => {
    const e = makeEnemy(1, 'lantern_warden', 0, 0);
    e.phase = 2;
    for (let t = 0; t < 2; t += 0.1) { e.age = t; expect(enemyFrameIndex(e, 6)).toBeGreaterThanOrEqual(3); }
    e.phase = 1;
    expect(enemyFrameIndex(e, 6)).toBeLessThan(3);
  });
  it('影格永遠在範圍內', () => {
    for (const k of ['night_walker', 'cave_bat', 'frost_wolf', 'snap_vine', 'ember_imp', 'dusk_owl', 'rock_crab'] as const) {
      const e = makeEnemy(1, k, 0, 0);
      for (let t = 0; t < 3; t += 0.07) { e.age = t; e.body.vx = 60; const f = enemyFrameIndex(e, 3); expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(3); }
    }
  });
});

describe('飄字', () => {
  it('數字往上飄、時間到消失、數量有上限', () => {
    const f = new FloatNumbers();
    f.add(10, 100, '12', 'hit');
    const y0 = f.list[0].y;
    f.step(0.3);
    expect(f.list[0].y).toBeLessThan(y0);
    f.step(2);
    expect(f.list.length).toBe(0);
    for (let i = 0; i < 200; i++) f.add(0, 0, String(i), 'hit');
    expect(f.list.length).toBeLessThanOrEqual(64);
  });
  it('像素字型：每個數字 3×5', () => {
    for (const ch of '0123456789+') { const r = digitRows(ch); expect(r.length).toBe(5); for (const row of r) expect(row.length).toBe(3); }
  });
});
