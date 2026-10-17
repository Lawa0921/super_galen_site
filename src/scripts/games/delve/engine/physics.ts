// physics.ts — AABB vs tile 分軸移動（先 X 後 Y），子步 ≤ SUBSTEP_PX 防穿透，
// 地面上水平受阻時嘗試 step-up（≤ 1 格），抬升量記進 gfxOffY 供渲染平滑。
import {
  TILE_SIZE as S, PLAYER_W, PLAYER_H, GRAVITY, MAX_FALL, RUN_SPEED, RUN_ACCEL, RUN_DECEL,
  AIR_ACCEL, JUMP_SPEED, JUMP_HOLD, STEP_MAX, SUBSTEP_PX, CLIMB_SPEED, CLIMB_X,
} from './constants';

export interface SolidQuery {
  isSolid(tx: number, ty: number): boolean;
  /** 單向平台（只有從上方落下時擋住）；省略 = 沒有平台 */
  isPlatform?(tx: number, ty: number): boolean;
  /** 可攀爬（繩索）；省略 = 沒有繩索 */
  isClimbable?(tx: number, ty: number): boolean;
}

export interface Body {
  /** 左上角（px） */
  x: number; y: number;
  w: number; h: number;
  vx: number; vy: number;
  onGround: boolean;
  /** 僅渲染用的垂直偏移（step-up 後逐漸歸零），畫面 y = y + gfxOffY */
  gfxOffY: number;
}

export interface PlayerMotion {
  jumpTimer: number; jumpWasHeld: boolean;
  /** 正抓著繩索 */
  climbing?: boolean;
  /** 剛離開繩索的寬限時間（秒）：這段時間內允許 step-up，從繩頂側移就能上岸 */
  ropeGrace?: number;
  /** 這次騰空已用掉的空中跳躍次數（落地歸零） */
  airUsed?: number;
}
export interface MoveControl {
  moveX: number; jump: boolean;
  /** 按住「下」：穿過單向平台往下掉；在繩索上 = 往下爬 */
  drop?: boolean;
  /** 按住「上」（W / ↑）：在繩索上 = 往上爬，否則等同跳躍 */
  up?: boolean;
}
/** 移動能力倍率（飾品 / 詞條）：runMul 跑速、jumpMul 跳躍初速與可按住時間、airJumps 空中還能再跳幾次（凌雲） */
export interface MoveStats { runMul?: number; jumpMul?: number; airJumps?: number; }
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

/** 腳底剛好在第 row 列頂端（row*S）時，身體水平範圍下方有沒有平台 */
function platformUnder(q: SolidQuery, b: Body, row: number): boolean {
  if (!q.isPlatform) return false;
  const tx0 = Math.floor(b.x / S), tx1 = Math.floor((b.x + b.w - EPS) / S);
  for (let tx = tx0; tx <= tx1; tx++) if (q.isPlatform(tx, row)) return true;
  return false;
}

/** 腳底是否正好站在某一列的平台頂上 */
export function onPlatform(q: SolidQuery, b: Body): boolean {
  const feet = b.y + b.h;
  const row = Math.round(feet / S);
  return Math.abs(feet - row * S) < 0.01 && platformUnder(q, b, row);
}

/** 依 vx/vy 移動 body 一個 dt，處理碰撞、單向平台與 step-up。會改寫 body。 */
export function moveBody(q: SolidQuery, b: Body, dt: number, allowStep = b.onGround, drop = false): MoveResult {
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
      // 單向平台：往下移動、腳底從某列頂端之上（含剛好在頂端）跨進該列 → 停在頂端（按住「下」時不擋）
      if (sdy > 0 && !drop && q.isPlatform) {
        const feet = b.y + b.h, nfeet = feet + sdy;
        const row = Math.floor((nfeet - EPS) / S), top = row * S;
        if (feet <= top + 0.01 && nfeet > top && platformUnder(q, b, row) && !overlapsSolid(q, b.x, top - b.h, b.w, b.h)) {
          b.y = top - b.h; b.vy = 0; res.hitY = true;
          break;
        }
      }
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
  b.onGround = b.vy >= 0 && (overlapsSolid(q, b.x, b.y + 1, b.w, b.h) || (!drop && onPlatform(q, b)));
  return res;
}

function approach(v: number, target: number, amount: number): number {
  if (v < target) return Math.min(target, v + amount);
  if (v > target) return Math.max(target, v - amount);
  return v;
}

/** 身體中心欄、從頭到腳的範圍內有沒有繩索 */
export function overlapsRope(q: SolidQuery, b: Body): boolean {
  if (!q.isClimbable) return false;
  const tx = Math.floor((b.x + b.w / 2) / S);
  const ty0 = Math.floor(b.y / S), ty1 = Math.floor((b.y + b.h - EPS) / S);
  for (let ty = ty0; ty <= ty1; ty++) if (q.isClimbable(tx, ty)) return true;
  return false;
}

/** 從身體範圍往上找：中心欄這段繩索最上面那格的 y */
function ropeTop(q: SolidQuery, b: Body): number {
  const tx = Math.floor((b.x + b.w / 2) / S);
  let ty = Math.floor((b.y + b.h - EPS) / S);
  while (ty >= 0 && !q.isClimbable!(tx, ty)) ty--;
  while (ty > 0 && q.isClimbable!(tx, ty - 1)) ty--;
  return ty;
}

/** 攀爬中的一步：上 / 下爬、少量水平移動、往繩索中心靠；頂端停住，不越過繩頂 */
function stepClimb(q: SolidQuery, b: Body, ctl: MoveControl, mx: number, dt: number): MoveResult {
  b.vx = approach(b.vx, mx * CLIMB_X, RUN_ACCEL * dt);
  b.vy = ctl.up ? -CLIMB_SPEED : ctl.drop ? CLIMB_SPEED : 0;
  if (mx === 0) {
    const tx = Math.floor((b.x + b.w / 2) / S);
    const want = tx * S + S / 2 - b.w / 2, d = want - b.x;
    b.vx = Math.max(-60, Math.min(60, d / dt));
  }
  if (b.vy < 0) {
    // 腳底最高到繩頂那列頂端下 1px（仍算重疊繩索 → 掛住），側移時 step-up 上岸
    const minFeet = ropeTop(q, b) * S + 1;
    const feet = b.y + b.h;
    if (feet + b.vy * dt < minFeet) b.vy = Math.min(0, (minFeet - feet) / dt);
  }
  const res = moveBody(q, b, dt, true, true);
  b.onGround = false;
  return res;
}

/** 玩家在液體裡的係數（swim.playerMedium；省略 = 空氣） */
export interface LiquidMove {
  gravityMul: number; maxFallMul: number; runMul: number; jumpMul: number;
  inLiquid: boolean; swim: boolean; swimSpeed: number; swimAccel: number;
}

/**
 * 玩家一個固定步：輸入 → 速度（跑、可變高度跳、重力 / 攀爬）→ moveBody。
 * med（液體）：跑速 / 重力 / 終端速度變小；碰到液體時按跳可以起跳（游出水面），夠深時按住跳往上游。
 */
export function stepPlayer(q: SolidQuery, b: Body, m: PlayerMotion, ctl: MoveControl, dt: number, stats: MoveStats = {}, med?: LiquidMove): MoveResult {
  const mx = Math.max(-1, Math.min(1, ctl.moveX));
  const runMul = (stats.runMul ?? 1) * (med?.runMul ?? 1), jumpMul = (stats.jumpMul ?? 1) * (med?.jumpMul ?? 1);
  const onRope = overlapsRope(q, b);
  // 「上」在繩索上是爬，否則是跳
  const jumpIn = ctl.jump || (Boolean(ctl.up) && !onRope);
  const pressed = jumpIn && !m.jumpWasHeld;
  if (m.ropeGrace) m.ropeGrace = Math.max(0, m.ropeGrace - dt);
  if (!onRope) { if (m.climbing) m.ropeGrace = 0.2; m.climbing = false; }
  else if (!m.climbing && (ctl.up || (ctl.drop && !b.onGround))) m.climbing = true;
  if (m.climbing) {
    if (pressed && ctl.jump) {
      m.climbing = false;
    } else {
      m.jumpWasHeld = jumpIn;
      m.jumpTimer = 0;
      const res = stepClimb(q, b, ctl, mx, dt);
      if (b.gfxOffY > 0) b.gfxOffY = Math.max(0, b.gfxOffY - 120 * dt);
      return res;
    }
  }
  const target = mx * RUN_SPEED * runMul;
  const accel = b.onGround ? (mx !== 0 ? RUN_ACCEL : RUN_DECEL) : AIR_ACCEL;
  b.vx = approach(b.vx, target, accel * runMul * dt);

  m.jumpWasHeld = jumpIn;
  const canJump = b.onGround || (pressed && onRope && ctl.jump) || (pressed && Boolean(med?.inLiquid));
  if (b.onGround || med?.inLiquid) m.airUsed = 0;
  if (pressed && canJump) { m.jumpTimer = JUMP_HOLD * jumpMul; b.vy = -JUMP_SPEED * jumpMul; b.onGround = false; }
  else if (pressed && (m.airUsed ?? 0) < (stats.airJumps ?? 0)) {
    // 空中再跳（凌雲）：比一般跳稍弱
    m.airUsed = (m.airUsed ?? 0) + 1;
    m.jumpTimer = JUMP_HOLD * jumpMul * 0.8; b.vy = -JUMP_SPEED * jumpMul * 0.92;
  }
  if (m.jumpTimer > 0) {
    if (jumpIn) { b.vy = -JUMP_SPEED * jumpMul; m.jumpTimer -= dt; } else m.jumpTimer = 0;
  }
  if (m.jumpTimer <= 0) {
    if (med?.swim && jumpIn) b.vy = Math.max(-med.swimSpeed, b.vy - med.swimAccel * dt);
    else b.vy = Math.min(MAX_FALL * (med?.maxFallMul ?? 1), b.vy + GRAVITY * (med?.gravityMul ?? 1) * dt);
  }

  const res = moveBody(q, b, dt, b.onGround || (m.ropeGrace ?? 0) > 0, ctl.drop ?? false);
  if (res.hitY && b.vy === 0 && !b.onGround) m.jumpTimer = 0; // 撞頭
  // step-up 視覺偏移平滑歸零
  if (b.gfxOffY > 0) b.gfxOffY = Math.max(0, b.gfxOffY - 120 * dt);
  return res;
}
