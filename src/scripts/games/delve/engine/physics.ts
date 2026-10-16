// physics.ts — AABB vs tile 分軸移動（先 X 後 Y），子步 ≤ SUBSTEP_PX 防穿透，
// 地面上水平受阻時嘗試 step-up（≤ 1 格），抬升量記進 gfxOffY 供渲染平滑。
import {
  TILE_SIZE as S, PLAYER_W, PLAYER_H, GRAVITY, MAX_FALL, RUN_SPEED, RUN_ACCEL, RUN_DECEL,
  AIR_ACCEL, JUMP_SPEED, JUMP_HOLD, STEP_MAX, SUBSTEP_PX,
} from './constants';

export interface SolidQuery { isSolid(tx: number, ty: number): boolean; }

export interface Body {
  /** 左上角（px） */
  x: number; y: number;
  w: number; h: number;
  vx: number; vy: number;
  onGround: boolean;
  /** 僅渲染用的垂直偏移（step-up 後逐漸歸零），畫面 y = y + gfxOffY */
  gfxOffY: number;
}

export interface PlayerMotion { jumpTimer: number; jumpWasHeld: boolean; }
export interface MoveControl { moveX: number; jump: boolean; }
export interface MoveResult { hitX: boolean; hitY: boolean; stepped: boolean; }

const EPS = 1e-6;

export function makeBody(x: number, y: number, w = PLAYER_W, h = PLAYER_H): Body {
  return { x, y, w, h, vx: 0, vy: 0, onGround: false, gfxOffY: 0 };
}

export function overlapsSolid(q: SolidQuery, x: number, y: number, w: number, h: number): boolean {
  const tx0 = Math.floor(x / S), tx1 = Math.floor((x + w - EPS) / S);
  const ty0 = Math.floor(y / S), ty1 = Math.floor((y + h - EPS) / S);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) if (q.isSolid(tx, ty)) return true;
  }
  return false;
}

/** 依 vx/vy 移動 body 一個 dt，處理碰撞與 step-up。會改寫 body。 */
export function moveBody(q: SolidQuery, b: Body, dt: number, allowStep = b.onGround): MoveResult {
  const res: MoveResult = { hitX: false, hitY: false, stepped: false };
  // ── X 軸 ──
  const dx = b.vx * dt;
  if (dx !== 0) {
    const n = Math.ceil(Math.abs(dx) / SUBSTEP_PX);
    const sdx = dx / n;
    for (let i = 0; i < n; i++) {
      const nx = b.x + sdx;
      if (!overlapsSolid(q, nx, b.y, b.w, b.h)) { b.x = nx; continue; }
      if (allowStep) {
        const feet = b.y + b.h;
        const row = Math.floor((feet - EPS) / S);
        const lift = feet - row * S;
        if (lift > 0 && lift <= STEP_MAX
          && !overlapsSolid(q, b.x, b.y - lift, b.w, b.h)
          && !overlapsSolid(q, nx, b.y - lift, b.w, b.h)) {
          b.y -= lift; b.x = nx; b.gfxOffY += lift; res.stepped = true;
          continue;
        }
      }
      // 貼齊阻擋格邊緣
      if (sdx > 0) {
        const col = Math.floor((nx + b.w - EPS) / S);
        b.x = Math.max(b.x, col * S - b.w);
      } else {
        const col = Math.floor(nx / S);
        b.x = Math.min(b.x, (col + 1) * S);
      }
      b.vx = 0; res.hitX = true;
      break;
    }
  }
  // ── Y 軸 ──
  const dy = b.vy * dt;
  if (dy !== 0) {
    const n = Math.ceil(Math.abs(dy) / SUBSTEP_PX);
    const sdy = dy / n;
    for (let i = 0; i < n; i++) {
      const ny = b.y + sdy;
      if (!overlapsSolid(q, b.x, ny, b.w, b.h)) { b.y = ny; continue; }
      if (sdy > 0) {
        const row = Math.floor((ny + b.h - EPS) / S);
        b.y = Math.max(b.y, row * S - b.h);
      } else {
        const row = Math.floor(ny / S);
        b.y = Math.min(b.y, (row + 1) * S);
      }
      b.vy = 0; res.hitY = true;
      break;
    }
  }
  b.onGround = b.vy >= 0 && overlapsSolid(q, b.x, b.y + 1, b.w, b.h);
  return res;
}

function approach(v: number, target: number, amount: number): number {
  if (v < target) return Math.min(target, v + amount);
  if (v > target) return Math.max(target, v - amount);
  return v;
}

/** 玩家一個固定步：輸入 → 速度（跑、可變高度跳、重力）→ moveBody。 */
export function stepPlayer(q: SolidQuery, b: Body, m: PlayerMotion, ctl: MoveControl, dt: number): MoveResult {
  const mx = Math.max(-1, Math.min(1, ctl.moveX));
  const target = mx * RUN_SPEED;
  const accel = b.onGround ? (mx !== 0 ? RUN_ACCEL : RUN_DECEL) : AIR_ACCEL;
  b.vx = approach(b.vx, target, accel * dt);

  const pressed = ctl.jump && !m.jumpWasHeld;
  m.jumpWasHeld = ctl.jump;
  if (pressed && b.onGround) { m.jumpTimer = JUMP_HOLD; b.vy = -JUMP_SPEED; b.onGround = false; }
  if (m.jumpTimer > 0) {
    if (ctl.jump) { b.vy = -JUMP_SPEED; m.jumpTimer -= dt; } else m.jumpTimer = 0;
  }
  if (m.jumpTimer <= 0) b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);

  const res = moveBody(q, b, dt);
  if (res.hitY && b.vy === 0 && !b.onGround) m.jumpTimer = 0; // 撞頭
  // step-up 視覺偏移平滑歸零
  if (b.gfxOffY > 0) b.gfxOffY = Math.max(0, b.gfxOffY - 120 * dt);
  return res;
}
