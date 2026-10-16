// anim.ts — 動畫時序的純邏輯（無 DOM）：姿勢判定、走路相位、idle 呼吸、揮動弧、角度量化、火焰影格。
// 角度單位：度；0 = 手臂自然下垂，正值 = 往面向方向抬（90 = 平舉向前、180 = 舉過頭）。

export type PoseKind = 'idle' | 'walk' | 'jump' | 'fall';

export const WALK_FRAMES = 8;
/** 走一整輪（兩步）的水平距離 px */
export const STRIDE_PX = 48;
export const IDLE_FRAMES = 4;
export const IDLE_PERIOD = 2.4;
/** 揮動：每秒幾下 */
export const SWING_RATE = 2.6;
export const SWING_FROM = 200;
export const SWING_TO = 25;
export const FLAME_FRAMES = 4;
export const ARM_STEPS = 32;

export function poseKind(onGround: boolean, vx: number, vy: number): PoseKind {
  if (onGround) return Math.abs(vx) > 10 ? 'walk' : 'idle';
  return vy < 0 ? 'jump' : 'fall';
}

export function advancePhase(phase: number, vx: number, dt: number): number {
  const p = phase + (Math.abs(vx) * Math.max(0, dt)) / STRIDE_PX;
  return p - Math.floor(p);
}

export function walkFrame(phase: number): number {
  return Math.floor(phase * WALK_FRAMES + 1e-6) % WALK_FRAMES;
}

export function idleFrame(t: number): number {
  const p = ((t % IDLE_PERIOD) + IDLE_PERIOD) % IDLE_PERIOD;
  return Math.floor((p / IDLE_PERIOD) * IDLE_FRAMES) % IDLE_FRAMES;
}

/** p ∈ [0,1)：前 45% 加速下劈（ease-in），之後 ease-out 收回 */
export function swingAngle(p: number): number {
  const q = p - Math.floor(p);
  if (q < 0.45) {
    const t = q / 0.45;
    return SWING_FROM + (SWING_TO - SWING_FROM) * t * t;
  }
  const t = (q - 0.45) / 0.55;
  const e = t * t * (3 - 2 * t);
  return SWING_TO + (SWING_FROM - SWING_TO) * e;
}

export function angleIndex(deg: number, steps: number = ARM_STEPS): number {
  const k = Math.round((deg / 360) * steps);
  return ((k % steps) + steps) % steps;
}

/** 前 / 後手臂角度。swing 非 null 時前手用揮動角度。 */
export function armAngles(kind: PoseKind, frame: number, swing: number | null): { front: number; back: number } {
  let front: number, back: number;
  switch (kind) {
    case 'walk': {
      const s = Math.sin((frame / WALK_FRAMES) * Math.PI * 2);
      front = Math.round(-s * 34);
      back = -front;
      break;
    }
    case 'jump': front = 150; back = -40; break;
    case 'fall': front = 115; back = -55; break;
    default: front = frame === 1 || frame === 2 ? 4 : 2; back = -2;
  }
  if (swing !== null) front = swing;
  return { front, back };
}

export function flameFrame(t: number, x: number, y: number): number {
  const off = ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % 97;
  return Math.floor(t * 9 + off * 0.37) % FLAME_FRAMES;
}
