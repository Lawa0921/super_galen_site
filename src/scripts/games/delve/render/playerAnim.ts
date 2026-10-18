// playerAnim.ts — 玩家動畫狀態機（純邏輯，無 DOM）：每幀由引擎狀態挑出動畫與影格。
//   優先序：dead > mantle（攀上邊緣）> hurt（受傷一瞬間的縮身）> climb / hang（繩上）> swim > jump / fall > walk / idle。
//   攀爬：手交替往上的循環跟著「爬了多少 px」前進（往下爬倒著播），每換一次手送出 grip 提示（音效 / 繩屑）；
//   停在繩上超過 HANG_DELAY 才換成「掛著、慢慢晃」的 hang（輕點上 / 下不會閃）。
import { advancePhase, idleFrame, walkFrame, type PoseKind } from './anim';

export type PlayerAnim = PoseKind | 'climb' | 'hang' | 'mantle' | 'swim' | 'hurt' | 'dead';

export const CLIMB_FRAMES = 6;
export const HANG_FRAMES = 4;
/** 攀上邊緣：懸掛拉起 → 撐起手肘 → 膝蓋上台 → 站起 */
export const MANTLE_FRAMES = 4;
export const SWIM_FRAMES = 6;
/** 手交替一整輪（左右手各換一次）爬的距離 px */
export const CLIMB_STRIDE = 26;
/** 停在繩上多久才換成 hang（秒） */
export const HANG_DELAY = 0.16;
/** 受傷縮身顯示多久（秒） */
export const HURT_SHOW = 0.22;
const HANG_RATE = 2.4;
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
  private still = 0;
  private hangT = 0;
  private t = 0;

  update(i: AnimInput): AnimOutput {
    const dt = Math.max(0, i.dt);
    this.t += dt;
    let anim: PlayerAnim, frame = 0, cue: AnimOutput['cue'] = null;
    const wasClimb = this.anim === 'climb' || this.anim === 'hang';
    if (i.dead) anim = 'dead';
    else if (i.mantle !== null) {
      anim = 'mantle';
      const p = Math.max(0, Math.min(1, i.mantle));
      frame = p < 0.3 ? 0 : p < 0.62 ? 1 : p < 0.84 ? 2 : 3;
    } else if (i.sinceHurt < HURT_SHOW) anim = 'hurt';
    else if (i.climbing) {
      if (!wasClimb) { this.climbPhase = 0; this.still = 0; this.hangT = 0; }
      const moving = Math.abs(i.vy) > 1 || Math.abs(i.vx) > 8;
      if (moving) {
        // 往上（vy < 0）或橫移 → 正向；往下 → 倒著
        const dist = (Math.abs(i.vy) > 1 ? -i.vy : Math.abs(i.vx)) * dt;
        const before = Math.floor(this.climbPhase * 2);
        const p = this.climbPhase + dist / CLIMB_STRIDE;
        if (Math.floor(p * 2) !== before) cue = 'grip';
        this.climbPhase = p - Math.floor(p);
        this.still = 0;
        this.hangT = 0;
      } else this.still += dt;
      if (this.still > HANG_DELAY) {
        anim = 'hang';
        this.hangT += dt;
        frame = Math.floor(this.hangT * HANG_RATE) % HANG_FRAMES;
      } else {
        anim = 'climb';
        frame = Math.floor(this.climbPhase * CLIMB_FRAMES + 1e-6) % CLIMB_FRAMES;
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
