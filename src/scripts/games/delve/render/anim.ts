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
/** 揮鎬的起點：頭的前上方（Q 版大頭：從頭後面起手會讓鎬頭穿過臉） */
export const SWING_FROM = 165;
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
      // Q 版走路：手擺得大（前後各 ~48°）
      front = Math.round(-s * 48);
      back = -front;
      break;
    }
    case 'jump': front = 150; back = -40; break;
    case 'fall': front = 115; back = -55; break;
    // 待機：跟著呼吸，吸氣時肩膀往上、手微微往前後張開
    default: front = [2, 5, 7, 4][((frame % 4) + 4) % 4]; back = [-2, -4, -6, -4][((frame % 4) + 4) % 4];
  }
  if (swing !== null) front = swing;
  return { front, back };
}

/**
 * 前手舉過頭 / 往後拉（150°–300°：揮劍的預備、揮鎬的起手）：大頭會把手上的武器整個擋住，
 * 這時武器要另外疊在頭的前面（手臂本身還是在頭後面）。
 */
export function heldOverHead(deg: number): boolean {
  const d = ((deg % 360) + 360) % 360;
  return d >= 150 && d <= 300;
}

/** 手上拿的東西的種類：carryStyle 的種類 + 火把 / 提燈 */
export type HeldKind = CarryStyle | 'torch';
/** 這種手持物要不要畫在頭（臉）的前面：火把 / 釣竿 / 方塊 / 弓杖矛 = 前面；鎬 / 劍 = 照常在頭後面 */
export function heldOverFace(k: HeldKind): boolean { return k !== 'pick' && k !== 'blade'; }
/** 拿著這種東西時前手的角度（度）：火把 / 方塊 = 往前平舉（手離開臉） */
export function heldCarryArm(k: HeldKind): number { return k === 'torch' ? 85 : k === 'mini' ? 75 : CARRY_ARM; }

export function flameFrame(t: number, x: number, y: number): number {
  const off = ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % 97;
  return Math.floor(t * 9 + off * 0.37) % FLAME_FRAMES;
}

// ── 手持工具 / 武器：待機、走路時也拿在手上（不只挖掘 / 攻擊時） ──────────
/** rod = 釣竿：往前斜舉、竿尖拉出釣線 */
export type CarryStyle = 'pick' | 'blade' | 'rotated' | 'mini' | 'rod';
/** 物品 → 拿在手上的畫法：鎬畫在手臂精靈裡、劍畫刀身、弓 / 法杖 / 矛旋轉圖示、投擲武器畫小圖示 */
export function carryStyle(def: { pick?: unknown; weapon?: { kind: string }; rod?: unknown } | null | undefined): CarryStyle | null {
  if (!def) return null;
  if (def.pick) return 'pick';
  if (def.rod) return 'rod';
  const k = def.weapon?.kind;
  if (!k) return null;
  if (k === 'sword' || k === 'broadsword') return 'blade';
  if (k === 'bow' || k === 'staff' || k === 'spear') return 'rotated';
  return 'mini';
}
/** 拿著工具時前手的角度：往前斜舉（工具頭在身前），走路時跟著小幅擺動 */
export const CARRY_ARM = 40;
export function carryArm(kind: PoseKind, front: number): number {
  if (kind === 'idle') return CARRY_ARM;
  if (kind === 'walk') return CARRY_ARM + Math.round(front * 0.3);
  return front;
}
