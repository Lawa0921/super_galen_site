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

/** 同方向多發不同速彈鏈。 */
export function burst(o: { x: number; y: number; aim: number; speeds: number[]; kind: BulletKind }): SpawnSpec[] {
  return o.speeds.map((spd) => at(o.x, o.y, o.aim, spd, o.kind));
}

/** 迴旋鏢：朝 aim 出發、反向加速度沿 aim 方向減速折返。 */
export function boomerang(o: { x: number; y: number; aim: number; speed: number; decel: number; kind: BulletKind }): SpawnSpec[] {
  return [{
    x: o.x, y: o.y,
    vx: Math.cos(o.aim) * o.speed,
    vy: Math.sin(o.aim) * o.speed,
    ax: -Math.cos(o.aim) * o.decel,
    ay: -Math.sin(o.aim) * o.decel,
    kind: o.kind,
  }];
}

/** 慢速彈雲：以 angles[]（呼叫端用 rng 產生）放射極慢彈。 */
export function cloud(o: { x: number; y: number; angles: number[]; speed: number; kind: BulletKind }): SpawnSpec[] {
  return o.angles.map((ang) => at(o.x, o.y, ang, o.speed, o.kind));
}

/** 沿固定角度的高速彈柱（雷射感）：n 顆同向、速度由 vFrom 線性遞增到 vTo。 */
export function beamLine(o: { x: number; y: number; aim: number; n: number; vFrom: number; vTo: number; kind: BulletKind }): SpawnSpec[] {
  const out: SpawnSpec[] = [];
  for (let i = 0; i < o.n; i++) {
    const t = o.n === 1 ? 0 : i / (o.n - 1);
    const spd = o.vFrom + (o.vTo - o.vFrom) * t;
    out.push(at(o.x, o.y, o.aim, spd, o.kind));
  }
  return out;
}

/** 亡鐘鐘波：完整圓環挖出一個缺口（玩家從缺口穿越）。 */
export function bellWave(o: { x: number; y: number; n: number; speed: number; gapAt: number; gapWidth: number }): SpawnSpec[] {
  // gapAt 可能來自 aim±隨機偏移而超出 [-π, π)；不正規化會讓環狀距離算出負值
  const gapAt = ((o.gapAt % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  const out: SpawnSpec[] = [];
  for (let i = 0; i < o.n; i++) {
    const ang = (i / o.n) * 2 * Math.PI - Math.PI; // [-π, π)
    let d = Math.abs(ang - gapAt);
    d = Math.min(d, 2 * Math.PI - d);
    if (d < o.gapWidth / 2) continue;
    out.push(at(o.x, o.y, ang, o.speed, 'bell'));
  }
  return out;
}
