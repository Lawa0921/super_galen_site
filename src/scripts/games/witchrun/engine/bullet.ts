// bullet.ts
import type { EnemyBullet, BulletKind } from './types';
import { FIELD_W, FIELD_H, MAX_ENEMY_BULLETS, BULLET_CULL_MARGIN, BULLET_R } from './constants';

export interface SpawnSpec {
  x: number; y: number; vx: number; vy: number;
  ax?: number; ay?: number; turnRate?: number;
  kind: BulletKind;
  bounces?: number;
}

/** 固定大小物件池：超量時丟棄新彈（彈幕上限即效能上限）。 */
export class BulletPool {
  readonly capacity: number;
  readonly items: EnemyBullet[];

  constructor(capacity = MAX_ENEMY_BULLETS) {
    this.capacity = capacity;
    this.items = Array.from({ length: capacity }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, turnRate: 0,
      kind: 'rune' as BulletKind, r: 0, grazed: false, active: false, bounces: 0,
    }));
  }

  spawn(s: SpawnSpec): EnemyBullet | null {
    const b = this.items.find((it) => !it.active);
    if (!b) return null;
    b.x = s.x; b.y = s.y; b.vx = s.vx; b.vy = s.vy;
    b.ax = s.ax ?? 0; b.ay = s.ay ?? 0; b.turnRate = s.turnRate ?? 0;
    b.kind = s.kind; b.r = BULLET_R[s.kind];
    b.grazed = false; b.active = true; b.bounces = s.bounces ?? 0;
    return b;
  }

  step(dtMs: number, speedMult = 1): void {
    if (speedMult === 0) return; // 完全凍結
    const dt = (dtMs / 1000) * speedMult;
    for (const b of this.items) {
      if (!b.active) continue;
      if (b.turnRate !== 0) {
        const a = b.turnRate * dt;
        const cos = Math.cos(a), sin = Math.sin(a);
        const vx = b.vx * cos - b.vy * sin;
        b.vy = b.vx * sin + b.vy * cos;
        b.vx = vx;
      }
      b.vx += b.ax * dt; b.vy += b.ay * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      // 左右牆反射
      if (b.x < 0 || b.x > FIELD_W) {
        if (b.bounces > 0) {
          b.vx = -b.vx;
          b.bounces--;
          b.x = b.x < 0 ? 0 : FIELD_W; // 鉗回界內
          continue;
        }
      }
      const m = BULLET_CULL_MARGIN;
      if (b.x < -m || b.x > FIELD_W + m || b.y < -m || b.y > FIELD_H + m) b.active = false;
    }
  }

  clearAll(): number {
    let n = 0;
    for (const b of this.items) { if (b.active) { b.active = false; n++; } }
    return n;
  }

  countActive(): number {
    let n = 0;
    for (const b of this.items) if (b.active) n++;
    return n;
  }
}
