// combatAnim.test.ts — 攻擊動畫角度、矛的伸縮、怪物影格選擇、傷害數字飄字
import { describe, it, expect } from 'vitest';
import { aimArmDeg, attackArmDeg, spearThrust, enemyFrameIndex, FloatNumbers, digitRows } from './combatAnim';
import { makeEnemy } from '../engine/enemies';
import { heldOverHead } from './anim';

describe('攻擊動畫', () => {
  it('瞄準角 → 手臂角（面向座標）：右 = 90、上 = 180、下 = 0；面向左時鏡像', () => {
    expect(aimArmDeg(0, 1)).toBeCloseTo(90);
    expect(aimArmDeg(-Math.PI / 2, 1)).toBeCloseTo(180);
    expect(aimArmDeg(Math.PI / 2, 1)).toBeCloseTo(0);
    expect(aimArmDeg(Math.PI, -1)).toBeCloseTo(90);
  });
  it('揮擊弧線在頭的前上方：整段手臂角度都 ≤ 170°（Q 版大頭：舉到頭後面會讓刀身穿過臉）', () => {
    for (const k of ['sword', 'broadsword', 'throw', 'boomerang'] as const) for (let i = 0; i <= 100; i++) expect(attackArmDeg(k, i / 100, 90), `${k} ${i}`).toBeLessThanOrEqual(170);
  });
  it('投擲（飛刀 / 迴力鏢）：先往後上拉、再往前甩出去（甩出去之後手在前下方）', () => {
    for (const k of ['throw', 'boomerang'] as const) {
      const at = (p: number): number => attackArmDeg(k, p, 90);
      expect(Math.max(...[0.1, 0.15, 0.2].map(at))).toBeGreaterThan(at(0) + 10);
      expect(at(0.6)).toBeLessThan(80);
      expect(at(0.6)).toBeGreaterThan(20);
    }
  });
  it('劍：預備動作往上拉（比起手更高）→ 一口氣往前下劈、劈過頭 → 收招回一點', () => {
    const at = (p: number): number => attackArmDeg('sword', p, 90);
    expect(at(0)).toBeGreaterThan(120);
    // 預備：前段角度先往上（往後）拉
    const wind = Math.max(...[0.04, 0.08, 0.12].map(at));
    expect(wind).toBeGreaterThan(at(0) + 8);
    // 下劈：預備之後單調遞減到最低點（劈過頭，比收招的角度更低）
    const swing = [0.15, 0.25, 0.35, 0.45, 0.55].map(at);
    for (let i = 1; i < swing.length; i++) expect(swing[i]).toBeLessThanOrEqual(swing[i - 1]);
    const low = Math.min(...Array.from({ length: 101 }, (_, k) => at(k / 100)));
    expect(low).toBeLessThan(25);
    // 收招：最後回彈一點，停在 40° 以下
    expect(at(1)).toBeGreaterThan(low + 4);
    expect(at(1)).toBeLessThan(40);
  });
  it('大劍：預備更久更高、劈得更低', () => {
    const at = (p: number): number => attackArmDeg('broadsword', p, 90);
    expect(Math.max(...[0.05, 0.1, 0.15, 0.2].map(at))).toBeGreaterThan(at(0) + 10);
    expect(Math.min(...Array.from({ length: 101 }, (_, k) => at(k / 100)))).toBeLessThan(15);
  });
  it('大劍：預備舉在頭的前上方、不進「疊在頭前面」的角度（寬刀身疊上去會蓋住瀏海和遠側眼睛）', () => {
    for (let i = 0; i <= 100; i++) expect(heldOverHead(attackArmDeg('broadsword', i / 100, 90)), `broadsword ${i}`).toBe(false);
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
