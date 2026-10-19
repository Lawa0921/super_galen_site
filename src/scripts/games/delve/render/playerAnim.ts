// playerAnim.ts — 玩家動畫狀態機（純邏輯，無 DOM）：每幀由引擎狀態挑出動畫與影格。
//   優先序：dead > mantle（攀上邊緣）> hurt（受傷一瞬間的縮身）> climb / hang（繩上）> swim > jump / fall > walk / idle。
//   攀爬：手交替往上的循環跟著「爬了多少 px」前進（往下爬倒著播），每換一次手送出 grip 提示（音效 / 繩屑）；
//   停在繩上超過 HANG_DELAY 才換成「掛著、慢慢晃」的 hang（輕點上 / 下不會閃）。
import { advancePhase, idleFrame, walkFrame, type PoseKind } from './anim';

export type PlayerAnim = PoseKind | 'climb' | 'climbdown' | 'hang' | 'mantle' | 'swim' | 'hurt' | 'dead';

/** 往上爬一輪（左右手各伸一次）8 格；往下爬（手抓在手下面）6 格 */
export const CLIMB_FRAMES = 8;
export const CLIMBDOWN_FRAMES = 6;
export const HANG_FRAMES = 4;
/** 攀上邊緣：懸掛拉起 → 撐起手肘 → 膝蓋上台 → 站起 */
export const MANTLE_FRAMES = 4;
export const SWIM_FRAMES = 6;
/** 手交替一整輪（左右手各換一次）爬的距離 px */
export const CLIMB_STRIDE = 58;
/** 往下爬一輪的距離（手抓在手下面，一次只換一小段） */
export const CLIMBDOWN_STRIDE = 26;
/** 停在繩上多久才換成 hang（秒） */
export const HANG_DELAY = 0.16;
/** 受傷縮身顯示多久（秒） */
export const HURT_SHOW = 0.22;
const HANG_RATE = 2.4;
/** 停下來時把手爬到握繩姿勢的速度（輪 / 秒） */
const SETTLE_RATE = 1.6;
const SWIM_PERIOD = 0.9;

export interface AnimInput {
  dt: number;
  dead: boolean;
  climbing: boolean;
  /** 攀上邊緣的進度 0..1；null = 沒在攀 */
  mantle: number | null;
  onGround: boolean;
  vx: number; vy: number;
  /** 在液體裡游（夠深、腳沒踩地） */
  swim: boolean;
  /** 距離上次受傷幾秒 */
  sinceHurt: number;
}
export interface AnimOutput { anim: PlayerAnim; frame: number; cue: 'grip' | null; }

export class PlayerAnimator {
  anim: PlayerAnim = 'idle';
  frame = 0;
  private walkPhase = 0;
  private climbPhase = 0;
  private descending = false;
  /** 停下來後已經對齊到握繩姿勢 */
  private settled = false;
  private still = 0;
  private hangT = 0;
  private t = 0;

  update(i: AnimInput): AnimOutput {
    const dt = Math.max(0, i.dt);
    this.t += dt;
    let anim: PlayerAnim, frame = 0, cue: AnimOutput['cue'] = null;
    const wasClimb = this.anim === 'climb' || this.anim === 'climbdown' || this.anim === 'hang';
    if (i.dead) anim = 'dead';
    else if (i.mantle !== null) {
      anim = 'mantle';
      const p = Math.max(0, Math.min(1, i.mantle));
      frame = p < 0.3 ? 0 : p < 0.62 ? 1 : p < 0.84 ? 2 : 3;
    } else if (i.sinceHurt < HURT_SHOW) anim = 'hurt';
    else if (i.climbing) {
      if (!wasClimb) { this.climbPhase = 0; this.still = 0; this.hangT = 0; this.settled = false; }
      const moving = Math.abs(i.vy) > 1 || Math.abs(i.vx) > 8;
      const down = i.vy > 1;
      if (down !== this.descending && moving) { this.descending = down; this.climbPhase = 0; }
      if (moving) {
        // 往上 / 往下各自一套動作，都依爬的距離往前播
        const dist = (Math.abs(i.vy) > 1 ? Math.abs(i.vy) : Math.abs(i.vx)) * dt;
        const before = Math.floor(this.climbPhase * 2);
        const p = this.climbPhase + dist / (this.descending ? CLIMBDOWN_STRIDE : CLIMB_STRIDE);
        if (Math.floor(p * 2) !== before) cue = 'grip';
        this.climbPhase = p - Math.floor(p);
        this.still = 0;
        this.hangT = 0;
      } else {
        this.still += dt;
        // 停下來：往上爬時先把手爬到下一個「兩手都抓著」的姿勢（半輪的邊界）再掛著，不會從半空中的手跳到掛著
        if (!this.descending && !this.settled && Math.abs(this.climbPhase * 2 - Math.round(this.climbPhase * 2)) < 1e-6) this.settled = true;
        if (!this.descending && !this.settled) {
          const before = Math.floor(this.climbPhase * 2);
          const p = this.climbPhase + dt * SETTLE_RATE;
          if (Math.floor(p * 2) !== before) { this.climbPhase = (Math.floor(p * 2) / 2) % 1; this.settled = true; cue = 'grip'; }
          else this.climbPhase = p;
        }
      }
      if (moving) this.settled = false;
      const ready = this.descending || this.settled;
      if (this.still > HANG_DELAY && ready) {
        anim = 'hang';
        this.hangT += dt;
        // 兩種握法：停在第 0 格 → 前手在上；停在第 4 格 → 後手在上（和停下來那一格一樣）
        const variant = this.descending ? 0 : Math.round(this.climbPhase * 2) % 2;
        frame = variant * HANG_FRAMES + (Math.floor(this.hangT * HANG_RATE) % HANG_FRAMES);
      } else {
        anim = this.descending ? 'climbdown' : 'climb';
        const n = this.descending ? CLIMBDOWN_FRAMES : CLIMB_FRAMES;
        frame = Math.floor(this.climbPhase * n + 1e-6) % n;
      }
    } else if (i.swim && !i.onGround) {
      anim = 'swim';
      frame = Math.floor((this.t / SWIM_PERIOD) * SWIM_FRAMES) % SWIM_FRAMES;
    } else if (!i.onGround) anim = i.vy < 0 ? 'jump' : 'fall';
    else if (Math.abs(i.vx) > 10) {
      anim = 'walk';
      this.walkPhase = advancePhase(this.walkPhase, i.vx, dt);
      frame = walkFrame(this.walkPhase);
    } else {
      anim = 'idle';
      frame = idleFrame(this.t);
    }
    if (anim !== 'walk') this.walkPhase = 0;
    this.anim = anim;
    this.frame = frame;
    return { anim, frame, cue };
  }
}

/** 眨眼：每 3.3 秒閉眼 0.12 秒，每第三次連眨兩下 */
const BLINK_PERIOD = 3.3;
export function blinkAt(t: number): boolean {
  const k = Math.floor(t / BLINK_PERIOD), m = t - k * BLINK_PERIOD;
  if (m < 0.12) return true;
  return k % 3 === 2 && m >= 0.22 && m < 0.32;
}

/**
 * 爬到繩頂：最上面那隻手（handTopY，世界 px）以上已經沒有繩子了（繩頂 ropeTopY 在手下面超過 2 px）
 * → 換成「兩手抓在胸口」的繩頂影格，手不會抓在空氣上。
 */
export function atRopeTop(anim: string, handTopY: number, ropeTopY: number): boolean {
  if (anim !== 'climb' && anim !== 'hang' && anim !== 'climbdown') return false;
  return ropeTopY > handTopY + 2;
}
