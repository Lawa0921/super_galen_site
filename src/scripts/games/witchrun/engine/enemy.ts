// enemy.ts
import type { Enemy, EnemyKind, PathKind, BulletKind } from './types';
import type { SpawnSpec } from './bullet';
import { aimed, fan, ring } from './pattern';

export interface EnemyDef {
  hp: number;
  speed: number;            // px/s（descend/swoop 的位移速率）
  fireIntervalMs: number;
  firstFireMs: number;      // 出生後首發延遲
  bulletKind: BulletKind;
  bulletSpeed: number;
  /** 開火型態：aimed=瞄準自機 1 發；fan3=朝自機扇形 3 發；ring8=環形 8 發 */
  fire: 'aimed' | 'fan3' | 'ring8';
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  bat:   { hp: 2,  speed: 90,  fireIntervalMs: 1800, firstFireMs: 600,  bulletKind: 'wisp', bulletSpeed: 130, fire: 'aimed' },
  wisp:  { hp: 1,  speed: 60,  fireIntervalMs: 2400, firstFireMs: 900,  bulletKind: 'wisp', bulletSpeed: 110, fire: 'aimed' },
  fairy: { hp: 3,  speed: 70,  fireIntervalMs: 2000, firstFireMs: 700,  bulletKind: 'rune', bulletSpeed: 140, fire: 'fan3' },
  tome:  { hp: 6,  speed: 80,  fireIntervalMs: 2600, firstFireMs: 800,  bulletKind: 'rune', bulletSpeed: 150, fire: 'ring8' },
  blade: { hp: 2,  speed: 130, fireIntervalMs: 1500, firstFireMs: 500,  bulletKind: 'page', bulletSpeed: 180, fire: 'aimed' },
  gear:  { hp: 8,  speed: 50,  fireIntervalMs: 2200, firstFireMs: 600,  bulletKind: 'gear', bulletSpeed: 120, fire: 'ring8' },
  angel: { hp: 4,  speed: 90,  fireIntervalMs: 1700, firstFireMs: 500,  bulletKind: 'rune', bulletSpeed: 160, fire: 'fan3' },
  moth:  { hp: 3,  speed: 100, fireIntervalMs: 1600, firstFireMs: 400,  bulletKind: 'wisp', bulletSpeed: 150, fire: 'fan3' },
  chime: { hp: 5,  speed: 60,  fireIntervalMs: 2000, firstFireMs: 600,  bulletKind: 'wave', bulletSpeed: 130, fire: 'ring8' },
};

export function makeEnemy(id: number, kind: EnemyKind, x: number, y: number, path: PathKind): Enemy {
  return { id, kind, x, y, hp: ENEMY_DEFS[kind].hp, alive: true, path, t: 0, baseX: x, fireCdMs: ENEMY_DEFS[kind].firstFireMs };
}

const HOVER_Y = 140;       // hover 停駐高度
const SINE_AMP = 60;       // sine 擺幅
const SINE_FREQ = 1.2;     // sine 頻率（rad/s 係數）
const SINE_DESCENT = 40;   // sine 整體下移 px/s
const SWOOP_VED = 120;     // swoop 縱向速率

/** 推進路徑與開火冷卻；冷卻到 0 時回傳彈幕 SpawnSpec[] 並重置。 */
export function stepEnemy(e: Enemy, dtMs: number, target: { px: number; py: number }): SpawnSpec[] {
  const d = ENEMY_DEFS[e.kind];
  const dt = dtMs / 1000;
  e.t += dtMs;

  if (e.path === 'descend') {
    e.y += d.speed * dt;
  } else if (e.path === 'sine') {
    e.y += SINE_DESCENT * dt;
    e.x = e.baseX + Math.sin((e.t / 1000) * SINE_FREQ * Math.PI) * SINE_AMP;
  } else if (e.path === 'hover') {
    if (e.y < HOVER_Y) e.y = Math.min(HOVER_Y, e.y + d.speed * dt);
  } else if (e.path === 'swoopL') {
    e.x -= d.speed * dt; e.y += SWOOP_VED * dt;
  } else if (e.path === 'swoopR') {
    e.x += d.speed * dt; e.y += SWOOP_VED * dt;
  }

  // 刻意不做 lag 補發：game.ts 的 STEP_CAP_MS(100) < 最短 fireIntervalMs，單 tick 至多一輪
  e.fireCdMs -= dtMs;
  if (e.fireCdMs > 0) return [];
  e.fireCdMs = d.fireIntervalMs;

  const aim = Math.atan2(target.py - e.y, target.px - e.x);
  if (d.fire === 'aimed') return aimed({ x: e.x, y: e.y, tx: target.px, ty: target.py, speed: d.bulletSpeed, kind: d.bulletKind });
  if (d.fire === 'fan3') return fan({ x: e.x, y: e.y, n: 3, speed: d.bulletSpeed, aim, spread: Math.PI / 5, kind: d.bulletKind });
  return ring({ x: e.x, y: e.y, n: 8, speed: d.bulletSpeed, kind: d.bulletKind });
}
