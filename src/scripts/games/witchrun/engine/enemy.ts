// enemy.ts
import type { Enemy, EnemyKind, PathKind, BulletKind } from './types';
import type { SpawnSpec } from './bullet';
import { aimed, fan, ring, burst, boomerang, cloud, beamLine } from './pattern';
import { FIELD_W, ELITE_HP_MULT, ELITE_FIRE_CD_MULT } from './constants';

export interface EnemyDef {
  hp: number;
  speed: number;            // px/s（descend/swoop 的位移速率）
  fireIntervalMs: number;
  firstFireMs: number;      // 出生後首發延遲
  bulletKind: BulletKind;
  bulletSpeed: number;
  /** 開火型態（v2 一敵一語言） */
  fire: 'burst3' | 'drift' | 'fan5' | 'spinRing' | 'boomerang' | 'bounce' | 'beam' | 'dustCloud' | 'waveRing';
  deathBurst?: boolean;     // 擊破時死亡音爆（chime）
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  bat:   { hp: 2,  speed: 90,  fireIntervalMs: 1800, firstFireMs: 600,  bulletKind: 'wisp', bulletSpeed: 130, fire: 'burst3' },
  wisp:  { hp: 1,  speed: 60,  fireIntervalMs: 2400, firstFireMs: 900,  bulletKind: 'wisp', bulletSpeed: 90,  fire: 'drift' },
  fairy: { hp: 3,  speed: 70,  fireIntervalMs: 2000, firstFireMs: 700,  bulletKind: 'rune', bulletSpeed: 110, fire: 'fan5' },
  tome:  { hp: 6,  speed: 80,  fireIntervalMs: 2600, firstFireMs: 800,  bulletKind: 'rune', bulletSpeed: 130, fire: 'spinRing' },
  blade: { hp: 2,  speed: 130, fireIntervalMs: 1500, firstFireMs: 500,  bulletKind: 'page', bulletSpeed: 260, fire: 'boomerang' },
  gear:  { hp: 8,  speed: 50,  fireIntervalMs: 2200, firstFireMs: 600,  bulletKind: 'gear', bulletSpeed: 150, fire: 'bounce' },
  angel: { hp: 4,  speed: 90,  fireIntervalMs: 1700, firstFireMs: 500,  bulletKind: 'rune', bulletSpeed: 380, fire: 'beam' },
  moth:  { hp: 3,  speed: 100, fireIntervalMs: 1600, firstFireMs: 400,  bulletKind: 'wisp', bulletSpeed: 40,  fire: 'dustCloud' },
  chime: { hp: 5,  speed: 60,  fireIntervalMs: 2000, firstFireMs: 600,  bulletKind: 'wave', bulletSpeed: 130, fire: 'waveRing', deathBurst: true },
};

export function makeEnemy(id: number, kind: EnemyKind, x: number, y: number, path: PathKind, elite = false): Enemy {
  const def = ENEMY_DEFS[kind];
  const hp = elite ? def.hp * ELITE_HP_MULT : def.hp;
  const e: Enemy = { id, kind, x, y, hp, alive: true, path, t: 0, baseX: x, fireCdMs: def.firstFireMs };
  if (elite) e.elite = true;
  return e;
}

const HOVER_Y = 140;       // hover 停駐高度
const SINE_AMP = 60;       // sine 擺幅
const SINE_FREQ = 1.2;     // sine 頻率（rad/s 係數）
const SINE_DESCENT = 40;   // sine 整體下移 px/s
const SWOOP_VED = 120;     // swoop 縱向速率

export interface EnemyStepResult {
  spawns: SpawnSpec[];
  telegraph?: { x1: number; y1: number; x2: number; y2: number; durMs: number };
}

/** 推進路徑與開火冷卻；冷卻到 0 時回傳彈幕 SpawnSpec[] 並重置。 */
export function stepEnemy(
  e: Enemy,
  dtMs: number,
  target: { px: number; py: number },
  rng: () => number,
): EnemyStepResult {
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
  if (e.fireCdMs > 0) return { spawns: [] };
  // elite 開火間隔縮短（angel beam telegraph 的 700ms 固定值不受影響，在 beam 分支單獨設）
  e.fireCdMs = e.elite ? d.fireIntervalMs * ELITE_FIRE_CD_MULT : d.fireIntervalMs;

  const aim = Math.atan2(target.py - e.y, target.px - e.x);

  switch (d.fire) {
    case 'burst3':
      // 以 def.bulletSpeed 為基準的三段彈鏈（130 → 160/200/240），平衡調整只動 def
      return { spawns: burst({ x: e.x, y: e.y, aim, speeds: [d.bulletSpeed + 30, d.bulletSpeed + 70, d.bulletSpeed + 110], kind: d.bulletKind }) };

    case 'drift': {
      const spec = aimed({ x: e.x, y: e.y, tx: target.px, ty: target.py, speed: d.bulletSpeed, kind: d.bulletKind });
      spec[0].ax = (rng() - 0.5) * 60;
      return { spawns: spec };
    }

    case 'fan5':
      return { spawns: fan({ x: e.x, y: e.y, n: 5, speed: d.bulletSpeed, aim, spread: Math.PI / 3, kind: d.bulletKind }) };

    case 'spinRing':
      return { spawns: ring({ x: e.x, y: e.y, n: 8, speed: d.bulletSpeed, kind: d.bulletKind, offset: e.t / 900 }) };

    case 'boomerang':
      return { spawns: boomerang({ x: e.x, y: e.y, aim, speed: d.bulletSpeed, decel: 180, kind: d.bulletKind }) };

    case 'bounce':
      return {
        spawns: fan({ x: e.x, y: e.y, n: 3, speed: d.bulletSpeed, aim, spread: Math.PI / 2, kind: d.bulletKind })
          .map((s) => ({ ...s, bounces: 1 })),
      };

    case 'beam': {
      if (e.beamAim === undefined) {
        // 第一段：鎖定目標角、發 telegraph、設 beamAim、縮短冷卻
        e.beamAim = aim;
        e.fireCdMs = 700;
        const beamLen = 800;
        return {
          spawns: [],
          telegraph: {
            x1: e.x, y1: e.y,
            x2: e.x + Math.cos(aim) * beamLen,
            y2: e.y + Math.sin(aim) * beamLen,
            durMs: 700,
          },
        };
      } else {
        // 第二段：發射彈柱，清除 beamAim
        const lockedAim = e.beamAim;
        e.beamAim = undefined;
        e.fireCdMs = d.fireIntervalMs;
        return { spawns: beamLine({ x: e.x, y: e.y, aim: lockedAim, n: 8, vFrom: 320, vTo: 480, kind: d.bulletKind }) };
      }
    }

    case 'dustCloud': {
      const angles = Array.from({ length: 10 }, () => rng() * 2 * Math.PI);
      return { spawns: cloud({ x: e.x, y: e.y, angles, speed: d.bulletSpeed, kind: d.bulletKind }) };
    }

    case 'waveRing':
      return { spawns: ring({ x: e.x, y: e.y, n: 8, speed: d.bulletSpeed, kind: d.bulletKind }) };
  }
}
