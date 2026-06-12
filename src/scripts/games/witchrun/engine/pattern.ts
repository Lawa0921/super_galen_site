// pattern.ts
import type { BulletKind } from './types';
import type { SpawnSpec } from './bullet';

/** 由角度+速率組 SpawnSpec。 */
function at(x: number, y: number, ang: number, speed: number, kind: BulletKind, turnRate = 0): SpawnSpec {
  return { x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, kind, turnRate };
}

export function ring(o: { x: number; y: number; n: number; speed: number; kind: BulletKind; offset?: number }): SpawnSpec[] {
  const out: SpawnSpec[] = [];
  for (let i = 0; i < o.n; i++) {
    out.push(at(o.x, o.y, (o.offset ?? 0) + (i / o.n) * 2 * Math.PI, o.speed, o.kind));
  }
  return out;
}

export function fan(o: { x: number; y: number; n: number; speed: number; aim: number; spread: number; kind: BulletKind }): SpawnSpec[] {
  const out: SpawnSpec[] = [];
  for (let i = 0; i < o.n; i++) {
    const t = o.n === 1 ? 0.5 : i / (o.n - 1);
    out.push(at(o.x, o.y, o.aim - o.spread / 2 + t * o.spread, o.speed, o.kind));
  }
  return out;
}

export function aimed(o: { x: number; y: number; tx: number; ty: number; speed: number; kind: BulletKind }): SpawnSpec[] {
  return [at(o.x, o.y, Math.atan2(o.ty - o.y, o.tx - o.x), o.speed, o.kind)];
}

/** 多臂螺旋：發射角隨時間旋進（rate rad/s），子彈本身帶微小 turnRate 增曲度。 */
export function spiral(o: { x: number; y: number; tMs: number; armN: number; speed: number; rate: number; kind: BulletKind }): SpawnSpec[] {
  const base = (o.tMs / 1000) * o.rate;
  const out: SpawnSpec[] = [];
  for (let i = 0; i < o.armN; i++) {
    out.push(at(o.x, o.y, base + (i / o.armN) * 2 * Math.PI, o.speed, o.kind, 0.25));
  }
  return out;
}

/** 亡鐘鐘波：完整圓環挖出一個缺口（玩家從缺口穿越）。 */
export function bellWave(o: { x: number; y: number; n: number; speed: number; gapAt: number; gapWidth: number }): SpawnSpec[] {
  const out: SpawnSpec[] = [];
  for (let i = 0; i < o.n; i++) {
    const ang = (i / o.n) * 2 * Math.PI - Math.PI; // [-π, π)
    let d = Math.abs(ang - o.gapAt);
    d = Math.min(d, 2 * Math.PI - d);
    if (d < o.gapWidth / 2) continue;
    out.push(at(o.x, o.y, ang, o.speed, 'bell'));
  }
  return out;
}
