// anim.test.ts — 玩家動畫影格選擇與時序、揮動弧度、角度量化、火焰影格。
import { describe, it, expect } from 'vitest';
import {
  poseKind, advancePhase, walkFrame, WALK_FRAMES, STRIDE_PX, idleFrame, IDLE_FRAMES, IDLE_PERIOD,
  swingAngle, SWING_FROM, SWING_TO, angleIndex, flameFrame, FLAME_FRAMES, armAngles, carryStyle, carryArm, CARRY_ARM,
} from './anim';

describe('手持工具 / 武器（待機、走路時也拿在手上）', () => {
  it('carryStyle：鎬 → pick、劍 → blade、弓 / 法杖 / 矛 → rotated、投擲武器 → mini、其他 → null', () => {
    expect(carryStyle({ pick: { speed: 1, tier: 1 } })).toBe('pick');
    expect(carryStyle({ weapon: { kind: 'sword' } })).toBe('blade');
    expect(carryStyle({ weapon: { kind: 'broadsword' } })).toBe('blade');
    for (const k of ['bow', 'staff', 'spear'] as const) expect(carryStyle({ weapon: { kind: k } })).toBe('rotated');
    for (const k of ['throw', 'boomerang'] as const) expect(carryStyle({ weapon: { kind: k } })).toBe('mini');
    expect(carryStyle({})).toBe(null);
    expect(carryStyle(null)).toBe(null);
  });
  it('carryArm：待機 / 走路時手臂往前斜舉（走路稍微擺動），跳躍 / 下落維持原姿勢', () => {
    expect(carryArm('idle', 2)).toBe(CARRY_ARM);
    const a = carryArm('walk', 34), b = carryArm('walk', -34);
    expect(a).toBeGreaterThan(CARRY_ARM);
    expect(b).toBeLessThan(CARRY_ARM);
    expect(Math.abs(a - CARRY_ARM)).toBeLessThan(15);
    expect(carryArm('jump', 150)).toBe(150);
    expect(carryArm('fall', 115)).toBe(115);
  });
});

describe('poseKind', () => {
  it('地面靜止 = idle、地面移動 = walk', () => {
    expect(poseKind(true, 0, 0)).toBe('idle');
    expect(poseKind(true, 5, 0)).toBe('idle');
    expect(poseKind(true, 120, 0)).toBe('walk');
    expect(poseKind(true, -120, 0)).toBe('walk');
  });
  it('空中上升 = jump、下落 = fall', () => {
    expect(poseKind(false, 0, -200)).toBe('jump');
    expect(poseKind(false, 100, 250)).toBe('fall');
  });
});

describe('walk 影格與水平速度連動', () => {
  it('走一個 STRIDE_PX 正好一輪 8 格', () => {
    let ph = 0;
    const seen: number[] = [];
    for (let i = 0; i < WALK_FRAMES; i++) {
      seen.push(walkFrame(ph));
      ph = advancePhase(ph, 180, STRIDE_PX / 180 / WALK_FRAMES);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(walkFrame(ph)).toBe(0);
  });
  it('速度越快，同一時間前進越多影格；方向不影響', () => {
    const slow = advancePhase(0, 60, 0.1), fast = advancePhase(0, 180, 0.1);
    expect(fast).toBeGreaterThan(slow);
    expect(advancePhase(0, -180, 0.1)).toBeCloseTo(fast);
  });
  it('phase 永遠在 [0,1)', () => {
    let ph = 0.9;
    for (let i = 0; i < 50; i++) { ph = advancePhase(ph, 180, 0.37); expect(ph).toBeGreaterThanOrEqual(0); expect(ph).toBeLessThan(1); }
  });
});

describe('idleFrame', () => {
  it('一個 IDLE_PERIOD 跑完 4 格並循環', () => {
    const f = [0, 1, 2, 3].map((k) => idleFrame((k + 0.5) * IDLE_PERIOD / IDLE_FRAMES));
    expect(f).toEqual([0, 1, 2, 3]);
    expect(idleFrame(IDLE_PERIOD + 0.01)).toBe(0);
    expect(idleFrame(-0.1)).toBeGreaterThanOrEqual(0);
  });
});

describe('swingAngle', () => {
  it('起點舉在頭後上方、揮到前下方，再回去', () => {
    expect(swingAngle(0)).toBeCloseTo(SWING_FROM);
    expect(SWING_FROM).toBeGreaterThan(150);
    expect(SWING_TO).toBeLessThan(60);
    const mid = swingAngle(0.35);
    expect(mid).toBeLessThan(SWING_FROM);
    expect(mid).toBeGreaterThan(SWING_TO - 1);
    expect(Math.min(...[0.44, 0.45, 0.46].map(swingAngle))).toBeCloseTo(SWING_TO, 0);
    expect(swingAngle(0.999)).toBeGreaterThan(SWING_FROM - 15);
  });
  it('下劈（前段）比收回快', () => {
    // 前 45% 掃過整個弧；後 55% 才回去
    expect(swingAngle(0.45)).toBeCloseTo(SWING_TO, 0);
    expect(swingAngle(0.7)).toBeLessThan(SWING_FROM - 30);
  });
});

describe('angleIndex', () => {
  it('量化角度並環繞', () => {
    expect(angleIndex(0, 32)).toBe(0);
    expect(angleIndex(11.25, 32)).toBe(1);
    expect(angleIndex(360, 32)).toBe(0);
    expect(angleIndex(-11.25, 32)).toBe(31);
    expect(angleIndex(185, 32)).toBe(16);
  });
});

describe('armAngles', () => {
  it('走路時前後手反向擺動；idle 自然下垂', () => {
    const a = armAngles('walk', 2, null), b = armAngles('walk', 6, null);
    expect(Math.sign(a.front)).toBe(-Math.sign(a.back));
    expect(a.front).toBeCloseTo(-b.front);
    const i = armAngles('idle', 0, null);
    expect(Math.abs(i.front)).toBeLessThan(15);
  });
  it('走路的手擺幅夠大（Q 版的誇張擺手，≥ 40°）；待機時手跟著呼吸微微動', () => {
    const amp = Math.max(...Array.from({ length: WALK_FRAMES }, (_, f) => Math.abs(armAngles('walk', f, null).front)));
    expect(amp).toBeGreaterThanOrEqual(40);
    const idle = new Set(Array.from({ length: IDLE_FRAMES }, (_, f) => armAngles('idle', f, null).front));
    expect(idle.size).toBeGreaterThanOrEqual(2);
  });
  it('揮動時前手用 swing 角度', () => {
    expect(armAngles('walk', 3, 120).front).toBe(120);
    expect(armAngles('jump', 0, null).front).toBeGreaterThan(90);
  });
});

describe('flameFrame', () => {
  it('隨時間循環，不同位置的火把錯開', () => {
    const fs = new Set<number>();
    for (let t = 0; t < 2; t += 0.03) fs.add(flameFrame(t, 3, 4));
    expect(fs.size).toBe(FLAME_FRAMES);
    for (const f of fs) expect(f).toBeLessThan(FLAME_FRAMES);
    const a = [0, 0.1, 0.2, 0.3, 0.4].map((t) => flameFrame(t, 3, 4)).join();
    const b = [0, 0.1, 0.2, 0.3, 0.4].map((t) => flameFrame(t, 40, 9)).join();
    expect(a).not.toBe(b);
  });
});
