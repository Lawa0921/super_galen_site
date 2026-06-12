// boss.ts
import type { BossId, BossState } from './types';
import type { SpawnSpec } from './bullet';
import { ring, fan, aimed, spiral, bellWave } from './pattern';
import { FIELD_W } from './constants';

/** 每 phase：hpPct = 進入此 phase 的血量比例上限；attacks = 週期性攻擊列表。 */
export interface PhaseDef {
  hpPct: number;   // phase i 在 hp/maxHp <= hpPct 時啟用（phase 0 為 1.0）
  attacks: { everyMs: number; pattern: PatternId }[];
}
export type PatternId =
  | 'ring12' | 'ring20' | 'fan5' | 'fan7' | 'aimed3'   // 泛用
  | 'spiral2' | 'spiral4'                              // 螺旋
  | 'bellwave';                                        // 亡鐘專用

export interface BossDef { id: BossId; hp: number; x: number; y: number; phases: PhaseDef[]; }

export const BOSS_DEFS: Record<BossId, BossDef> = {
  gargoyle: {
    id: 'gargoyle', hp: 300, x: FIELD_W / 2, y: 120,
    phases: [
      { hpPct: 1.0, attacks: [{ everyMs: 1600, pattern: 'fan5' }, { everyMs: 2400, pattern: 'aimed3' }] },
      { hpPct: 0.5, attacks: [{ everyMs: 1300, pattern: 'fan7' }, { everyMs: 2000, pattern: 'ring12' }] },
    ],
  },
  grimoire: {
    id: 'grimoire', hp: 420, x: FIELD_W / 2, y: 120,
    phases: [
      { hpPct: 1.0, attacks: [{ everyMs: 1500, pattern: 'ring12' }, { everyMs: 2600, pattern: 'aimed3' }] },
      { hpPct: 0.5, attacks: [{ everyMs: 900, pattern: 'spiral2' }, { everyMs: 2200, pattern: 'fan5' }] },
    ],
  },
  bellwright: {
    id: 'bellwright', hp: 540, x: FIELD_W / 2, y: 120,
    phases: [
      { hpPct: 1.0, attacks: [{ everyMs: 1100, pattern: 'spiral2' }] },
      { hpPct: 0.6, attacks: [{ everyMs: 900, pattern: 'spiral4' }, { everyMs: 2400, pattern: 'ring12' }] },
      { hpPct: 0.25, attacks: [{ everyMs: 800, pattern: 'spiral4' }, { everyMs: 2000, pattern: 'fan7' }] },
    ],
  },
  deadbell: {
    id: 'deadbell', hp: 700, x: FIELD_W / 2, y: 130,
    phases: [
      { hpPct: 1.0, attacks: [{ everyMs: 2600, pattern: 'bellwave' }, { everyMs: 1800, pattern: 'aimed3' }] },
      { hpPct: 0.6, attacks: [{ everyMs: 2200, pattern: 'bellwave' }, { everyMs: 1400, pattern: 'fan5' }] },
      { hpPct: 0.3, attacks: [{ everyMs: 1800, pattern: 'bellwave' }, { everyMs: 1000, pattern: 'spiral2' }] },
    ],
  },
};

export class BossRunner {
  readonly state: BossState;
  tolls = 0;                       // 亡鐘已敲響數
  private def: BossDef;
  private timers: number[];        // 對應目前 phase 各攻擊的倒數
  private tMs = 0;
  private rng: () => number;

  constructor(id: BossId, rng: () => number) {
    this.def = BOSS_DEFS[id];
    this.rng = rng;
    this.state = { id, x: this.def.x, y: this.def.y, hp: this.def.hp, maxHp: this.def.hp, phase: 0, alive: true };
    this.timers = this.def.phases[0].attacks.map((a) => a.everyMs);
  }

  /** 扣血；跨過閾值時切 phase 並回傳 true。 */
  damage(amount: number): boolean {
    if (!this.state.alive) return false;
    this.state.hp = Math.max(0, this.state.hp - amount);
    if (this.state.hp === 0) { this.state.alive = false; return false; }
    const pct = this.state.hp / this.state.maxHp;
    let next = this.state.phase;
    for (let i = this.def.phases.length - 1; i > this.state.phase; i--) {
      if (pct <= this.def.phases[i].hpPct) { next = i; break; }
    }
    if (next !== this.state.phase) {
      this.state.phase = next;
      this.timers = this.def.phases[next].attacks.map((a) => a.everyMs);
      return true;
    }
    return false;
  }

  /** 推進攻擊計時；回傳本 tick 產生的彈幕。Boss 緩慢左右漂移。 */
  step(dtMs: number, target: { px: number; py: number }): SpawnSpec[] {
    if (!this.state.alive) return [];
    this.tMs += dtMs;
    this.state.x = this.def.x + Math.sin(this.tMs / 2400) * 70;

    const out: SpawnSpec[] = [];
    const phase = this.def.phases[this.state.phase];
    for (let i = 0; i < phase.attacks.length; i++) {
      this.timers[i] -= dtMs;
      if (this.timers[i] > 0) continue;
      this.timers[i] = phase.attacks[i].everyMs;
      out.push(...this.emit(phase.attacks[i].pattern, target));
    }
    return out;
  }

  private emit(id: PatternId, target: { px: number; py: number }): SpawnSpec[] {
    const { x, y } = this.state;
    const aim = Math.atan2(target.py - y, target.px - x);
    switch (id) {
      case 'ring12': return ring({ x, y, n: 12, speed: 130, kind: 'rune', offset: this.rng() * Math.PI });
      case 'ring20': return ring({ x, y, n: 20, speed: 140, kind: 'rune', offset: this.rng() * Math.PI });
      case 'fan5':   return fan({ x, y, n: 5, speed: 170, aim, spread: Math.PI / 4, kind: 'page' });
      case 'fan7':   return fan({ x, y, n: 7, speed: 180, aim, spread: Math.PI / 3, kind: 'page' });
      case 'aimed3': return [
        ...aimed({ x: x - 24, y, tx: target.px, ty: target.py, speed: 200, kind: 'wisp' }),
        ...aimed({ x, y, tx: target.px, ty: target.py, speed: 200, kind: 'wisp' }),
        ...aimed({ x: x + 24, y, tx: target.px, ty: target.py, speed: 200, kind: 'wisp' }),
      ];
      case 'spiral2': return spiral({ x, y, tMs: this.tMs, armN: 2, speed: 140, rate: 1.4, kind: 'gear' });
      case 'spiral4': return spiral({ x, y, tMs: this.tMs, armN: 4, speed: 150, rate: 1.8, kind: 'gear' });
      case 'bellwave': {
        this.tolls += 1;
        // 缺口朝玩家附近 ± 隨機偏移：找得到但要移動
        const gapAt = aim + (this.rng() - 0.5) * (Math.PI / 3);
        return bellWave({ x, y, n: 40, speed: 120, gapAt, gapWidth: Math.PI / 5 });
      }
      default:
        id satisfies never;
        return [];
    }
  }
}
