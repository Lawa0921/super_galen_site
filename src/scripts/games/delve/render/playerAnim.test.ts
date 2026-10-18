// playerAnim.test.ts — 玩家動畫狀態機（純邏輯）：idle / walk / jump / fall / climb / hang / mantle / swim / hurt / dead，
// 攀爬的「手交替」循環跟著爬的距離走（往下爬倒著播）、停下來一下才換成掛著搖晃、每次換手發出 grip 提示（音效 / 粉塵）。
import { describe, it, expect } from 'vitest';
import {
  PlayerAnimator, CLIMB_FRAMES, CLIMBDOWN_FRAMES, HANG_FRAMES, MANTLE_FRAMES, SWIM_FRAMES, HANG_DELAY, HURT_SHOW, CLIMB_STRIDE, blinkAt, type AnimInput,
} from './playerAnim';

const base: AnimInput = { dt: 1 / 60, dead: false, climbing: false, mantle: null, onGround: true, vx: 0, vy: 0, swim: false, sinceHurt: 99 };
function feed(a: PlayerAnimator, i: Partial<AnimInput>, n: number): { grips: number; frames: number[] } {
  let grips = 0;
  const frames: number[] = [];
  for (let k = 0; k < n; k++) {
    const r = a.update({ ...base, ...i });
    if (r.cue === 'grip') grips++;
    frames.push(r.frame);
  }
  return { grips, frames };
}

describe('PlayerAnimator：地面 / 空中', () => {
  it('站著 = idle、跑 = walk、往上 = jump、往下 = fall', () => {
    const a = new PlayerAnimator();
    expect(a.update(base).anim).toBe('idle');
    expect(a.update({ ...base, vx: 150 }).anim).toBe('walk');
    expect(a.update({ ...base, onGround: false, vy: -200 }).anim).toBe('jump');
    expect(a.update({ ...base, onGround: false, vy: 200 }).anim).toBe('fall');
  });
  it('優先序：死亡 > 攀上邊緣 > 受傷 > 攀爬 > 游泳', () => {
    const a = new PlayerAnimator();
    expect(a.update({ ...base, dead: true, climbing: true, sinceHurt: 0 }).anim).toBe('dead');
    expect(a.update({ ...base, mantle: 0.3, sinceHurt: 0 }).anim).toBe('mantle');
    expect(a.update({ ...base, climbing: true, sinceHurt: 0.05 }).anim).toBe('hurt');
    expect(a.update({ ...base, climbing: true, sinceHurt: HURT_SHOW + 0.01, vy: -120 }).anim).toBe('climb');
    expect(a.update({ ...base, onGround: false, swim: true }).anim).toBe('swim');
  });
});

describe('PlayerAnimator：攀爬狀態機', () => {
  it('往上爬：climb，影格依爬的距離前進，一個循環 = CLIMB_STRIDE px，每半個循環一次 grip', () => {
    const a = new PlayerAnimator();
    // 120 px/s 爬 1 秒 = 120 px
    const r = feed(a, { climbing: true, onGround: false, vy: -120 }, 60);
    expect(a.anim).toBe('climb');
    const cycles = 120 / CLIMB_STRIDE;
    expect(r.grips).toBeGreaterThanOrEqual(Math.floor(cycles * 2) - 1);
    expect(r.grips).toBeLessThanOrEqual(Math.ceil(cycles * 2) + 1);
    expect(new Set(r.frames).size).toBe(CLIMB_FRAMES);
    for (const f of r.frames) { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(CLIMB_FRAMES); }
  });
  it('往下爬是另一套動作（climbdown：手抓在手下面），不是往上爬倒著播；影格往前、會換手', () => {
    const a = new PlayerAnimator();
    feed(a, { climbing: true, onGround: false, vy: -120 }, 12);
    expect(a.anim).toBe('climb');
    const down = feed(a, { climbing: true, onGround: false, vy: 120 }, 60);
    expect(a.anim).toBe('climbdown');
    expect(new Set(down.frames).size).toBe(CLIMBDOWN_FRAMES);
    expect(down.grips).toBeGreaterThan(4);
    let fwd = 0;
    for (let i = 1; i < down.frames.length; i++) { const d = (down.frames[i] - down.frames[i - 1] + CLIMBDOWN_FRAMES) % CLIMBDOWN_FRAMES; if (d === 1) fwd++; }
    expect(fwd).toBeGreaterThan(5);
  });
  it('在繩上停下：HANG_DELAY 之內維持 climb（點一下上不會閃成掛著），之後換成 hang 並慢慢搖晃', () => {
    const a = new PlayerAnimator();
    feed(a, { climbing: true, onGround: false, vy: -120 }, 20);
    const short = Math.floor((HANG_DELAY * 60) / 2);
    feed(a, { climbing: true, onGround: false }, short);
    expect(a.anim).toBe('climb');
    const r = feed(a, { climbing: true, onGround: false }, 240);
    expect(a.anim).toBe('hang');
    expect(r.grips).toBe(0);
    expect(new Set(r.frames.slice(-120)).size).toBe(HANG_FRAMES);
  });
  it('在繩上橫移也算 climb', () => {
    const a = new PlayerAnimator();
    feed(a, { climbing: true, onGround: false, vx: 70 }, 30);
    expect(a.anim).toBe('climb');
  });
  it('攀上邊緣：影格跟著進度（0 → MANTLE_FRAMES−1，不倒退）', () => {
    const a = new PlayerAnimator();
    let last = -1;
    for (let k = 0; k <= 20; k++) {
      const r = a.update({ ...base, onGround: false, mantle: k / 20 });
      expect(r.anim).toBe('mantle');
      expect(r.frame).toBeGreaterThanOrEqual(last);
      last = r.frame;
    }
    expect(last).toBe(MANTLE_FRAMES - 1);
  });
  it('離開繩索 → 回到一般姿勢；再抓回去時從新的循環開始', () => {
    const a = new PlayerAnimator();
    feed(a, { climbing: true, onGround: false, vy: -120 }, 30);
    expect(a.update({ ...base, onGround: false, vy: 50 }).anim).toBe('fall');
    expect(a.update({ ...base, climbing: true, onGround: false, vy: -120 }).frame).toBe(0);
  });
});

describe('游泳 / 眨眼', () => {
  it('游泳影格會循環', () => {
    const a = new PlayerAnimator();
    const r = feed(a, { onGround: false, swim: true }, 120);
    expect(new Set(r.frames).size).toBe(SWIM_FRAMES);
  });
  it('眨眼：大部分時間睜眼，每幾秒閉一下（很短）', () => {
    let closed = 0;
    const N = 6000;
    for (let i = 0; i < N; i++) if (blinkAt(i / 600)) closed++;
    expect(closed / N).toBeGreaterThan(0.01);
    expect(closed / N).toBeLessThan(0.08);
  });
});
