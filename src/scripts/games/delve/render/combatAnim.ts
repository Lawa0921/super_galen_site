// combatAnim.ts — 戰鬥動畫的純邏輯（無 DOM）：攻擊手臂角度、矛伸縮、怪物影格選擇、傷害飄字、3×5 像素數字字型。
import type { WeaponKind } from '../engine/items';
import { ENEMIES, type Enemy } from '../engine/enemies';

/** 世界瞄準角（弧度，0 = 右、y 向下）→ 手臂角度（度；面向座標：0 = 下垂、90 = 平舉向前、180 = 舉過頭） */
export function aimArmDeg(rad: number, facing: 1 | -1): number {
  return (Math.atan2(Math.cos(rad) * facing, Math.sin(rad)) * 180) / Math.PI;
}
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

/** 攻擊時前手的角度。p = 進度 0..1、aimDeg = 指向瞄準點的手臂角度 */
export function attackArmDeg(kind: WeaponKind, p: number, aimDeg: number): number {
  const q = Math.max(0, Math.min(1, p));
  switch (kind) {
    case 'sword': return 200 - 175 * easeOut(Math.min(1, q / 0.8));
    case 'broadsword': return 210 - 190 * Math.min(1, q < 0.25 ? q * 0.6 : 0.15 + (q - 0.25) * 1.6);
    case 'throw':
    case 'boomerang': return q < 0.5 ? 175 - 230 * q : 60;
    default: return aimDeg; // spear / bow / staff
  }
}
/** 矛：0..1 的伸出量（前 45% 刺出、60% 後收回） */
export function spearThrust(p: number): number {
  if (p <= 0) return 0;
  if (p < 0.45) return Math.sin((p / 0.45) * Math.PI * 0.5);
  if (p < 0.6) return 1;
  return Math.max(0, 1 - (p - 0.6) / 0.4);
}

/** 怪物這一刻用第幾格（n = 總格數） */
export function enemyFrameIndex(e: Enemy, n: number): number {
  const def = ENEMIES[e.kind], b = e.body, t = e.age;
  const clamp = (i: number): number => Math.max(0, Math.min(n - 1, i));
  switch (def.ai) {
    case 'hop':
      if (b.onGround) return Math.floor(t / 0.3) % 2 === 0 ? 0 : 1;
      return clamp(b.vy < 0 ? 2 : 3);
    case 'walker':
    case 'crawler': {
      if (e.kind === 'frost_wolf' && e.state === 'leap') return clamp(4);
      if (e.kind === 'rock_crab' && e.state === 'dash') return clamp(2);
      const walkN = e.kind === 'frost_wolf' ? 4 : e.kind === 'rock_crab' || e.kind === 'sand_scorpion' ? 2 : n;
      if (!b.onGround) return clamp(1);
      if (Math.abs(b.vx) < 5) return 0;
      return clamp(Math.floor(t * (4 + Math.abs(b.vx) / 20)) % walkN);
    }
    case 'flyer': return clamp(Math.floor(t * 12) % 3 === 2 ? 1 : Math.floor(t * 12) % 3);
    case 'swooper': return e.state === 'dive' ? clamp(3) : clamp(Math.floor(t * 8) % 3);
    case 'shooter': return e.state === 'shoot' && e.cd > 1.5 ? clamp(2) : clamp(Math.floor(t * 20) % 2);
    case 'plant': return e.state === 'lunge' ? clamp(2) : e.state === 'retract' ? clamp(1) : clamp(Math.floor(t * 2) % 2);
    case 'ghost': return clamp(Math.floor(t * 6) % n);
    case 'teleporter': return e.state === 'cast' ? clamp(2) : clamp(Math.floor(t * 2) % 2);
    case 'boss': return clamp(((e.phase ?? 1) === 2 ? 3 : 0) + (Math.floor(t * 6) % 3));
    case 'swimmer': return clamp(e.state === 'flop' ? 1 : Math.floor(t * (e.state === 'chase' ? 14 : 7)) % 3);
    case 'jelly': return e.state === 'pulse' ? clamp(1) : clamp(Math.floor(t * 1.5) % 2 === 0 ? 0 : 2);
  }
}

// ── 飄字 ───────────────────────────────────────────────
export type FloatKind = 'hit' | 'crit' | 'hurt' | 'heal' | 'info' | 'xp';
export interface FloatNum { x: number; y: number; vy: number; text: string; kind: FloatKind; life: number; max: number; }
export class FloatNumbers {
  readonly list: FloatNum[] = [];
  add(x: number, y: number, text: string, kind: FloatKind): void {
    const life = kind === 'crit' ? 1.1 : kind === 'info' || kind === 'xp' ? 1.4 : 0.9;
    this.list.push({ x: x + ((this.list.length * 7) % 9) - 4, y, vy: kind === 'crit' ? -70 : -50, text, kind, life, max: life });
    if (this.list.length > 64) this.list.shift();
  }
  step(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.life -= dt;
      if (f.life <= 0) { this.list.splice(i, 1); continue; }
      f.y += f.vy * dt;
      f.vy *= Math.max(0, 1 - dt * 2.5);
    }
  }
}

/** 3×5 像素字型（'#' = 亮） */
const FONT: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'], '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '###'],
  '+': ['...', '.#.', '###', '.#.', '...'], '-': ['...', '...', '###', '...', '...'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  // 經驗飄字「+12XP」（等級系統）
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'], P: ['##.', '#.#', '##.', '#..', '#..'],
};
export function digitRows(ch: string): string[] { return FONT[ch] ?? ['...', '...', '...', '...', '...']; }
