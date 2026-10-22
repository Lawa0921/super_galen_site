// levelFx.ts — 等級系統的世界特效（Canvas2D，畫在低解析緩衝上、光照之後；世界 px 座標、對齊整數美術像素）：
//   · 升級：腳下往上竄的金色光柱 + 向外擴散的像素環。
//   · 突進：身後的速度線殘影。
//   · 震地：沿地面向兩側推開的衝擊波弧（沙 / 金色像素，棋盤抖動）。
//   · 尋礦感知：從玩家擴散的聲納圈 + 礦格四角的閃爍括號（穿過黑暗與岩壁都看得到）。
// 只用統一色票（render/pixel.ts）的實色，不用半透明。
import type { DelveGame, DelveEvent } from '../engine/game';
import { DASH_TIME, PULSE_RADIUS, SLAM_RADIUS } from '../engine/skills';
import { T } from '../engine/tiles';
import { TILE_SIZE as S } from '../engine/constants';

interface Ring { x: number; y: number; t: number; dur: number; r0: number; r1: number; colors: readonly string[]; ground: boolean; }
interface Pillar { t: number; dur: number; }
interface Trail { x: number; y: number; dir: number; life: number; }

const ORE_COLOR: Partial<Record<number, string>> = {
  [T.COPPER_ORE]: '#ffa93a', [T.IRON_ORE]: '#cceaf8', [T.SILVER_ORE]: '#ffffff', [T.GOLD_ORE]: '#ffd86a',
};
const GOLD = ['#fff4c0', '#ffd86a', '#e8701c'] as const;

export class LevelFx {
  private rings: Ring[] = [];
  private pillars: Pillar[] = [];
  private trails: Trail[] = [];
  private dashLeft = 0;
  private dashDir = 1;
  private clock = 0;

  constructor(private readonly game: DelveGame) {}

  onEvent(e: DelveEvent): void {
    const p = this.game.player;
    if (e.type === 'levelup') {
      this.pillars.push({ t: 0, dur: 1.3 });
      this.rings.push({ x: p.x + p.w / 2, y: p.y + p.h / 2, t: 0, dur: 0.7, r0: 4, r1: 56, colors: GOLD, ground: false });
    } else if (e.type === 'skill' && e.phase === 'start' && e.skill === 'dash') {
      this.dashLeft = DASH_TIME + 0.08;
      this.dashDir = this.game.facing;
    } else if (e.type === 'skill' && e.phase === 'land' && e.skill === 'slam') {
      this.rings.push({ x: e.x, y: e.y, t: 0, dur: 0.38, r0: 6, r1: SLAM_RADIUS * S, colors: ['#f2e2b0', '#d8ba76', '#966139'], ground: true });
    } else if (e.type === 'skill' && e.phase === 'start' && e.skill === 'pulse') {
      const c = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
      this.rings.push({ x: c.x, y: c.y, t: 0, dur: 0.9, r0: 8, r1: PULSE_RADIUS * S, colors: ['#cceaf8', '#4aaeb0', '#1f6474'], ground: false });
      this.rings.push({ x: c.x, y: c.y, t: -0.18, dur: 0.9, r0: 8, r1: PULSE_RADIUS * S * 0.7, colors: ['#4aaeb0', '#1f6474'], ground: false });
    }
  }

  /** 光照遮罩之後（ctx 已平移到世界座標） */
  draw(ctx: CanvasRenderingContext2D, dt: number): void {
    this.clock += dt;
    const p = this.game.player;
    // 突進殘影：身後幾條白 / 淡藍的速度線
    if (this.dashLeft > 0) {
      this.dashLeft -= dt;
      this.trails.push({ x: p.x + p.w / 2, y: p.y, dir: this.dashDir, life: 0.22 });
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      t.life -= dt;
      if (t.life <= 0) { this.trails.splice(i, 1); continue; }
      const len = Math.round(6 + t.life * 40);
      for (const [k, dy] of [[0, 8], [1, 18], [2, 30], [3, 38]] as const) {
        if ((k + Math.floor(t.life * 30)) % 2) continue;
        ctx.fillStyle = k % 2 ? '#cceaf8' : '#ffffff';
        const x0 = Math.round(t.dir > 0 ? t.x - 6 - len : t.x + 6);
        ctx.fillRect(x0, Math.round(t.y + dy), len, 1);
      }
    }
    // 升級光柱：腳下竄起的光條（左右交錯、越往上越細）
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const pl = this.pillars[i];
      pl.t += dt;
      if (pl.t >= pl.dur) { this.pillars.splice(i, 1); continue; }
      const k = pl.t / pl.dur, cx = Math.round(p.x + p.w / 2), bottom = Math.round(p.y + p.h);
      const height = Math.round(90 * Math.min(1, k * 2.5));
      for (let col = -9; col <= 9; col++) {
        const seed = (col * 37 + 11) % 7;
        const top = bottom - Math.round(height * (1 - Math.abs(col) / 12) - seed * 3);
        const blink = (Math.floor(this.clock * 24) + col) % 3 === 0;
        if (k > 0.7 && blink) continue;
        ctx.fillStyle = Math.abs(col) < 3 ? '#fff4c0' : Math.abs(col) < 6 ? '#ffd86a' : '#e8701c';
        if ((col & 1) === 0) ctx.fillRect(cx + col, top, 1, bottom - top);
        else for (let y = top; y < bottom; y += 3) ctx.fillRect(cx + col, y + ((Math.floor(this.clock * 30) + col) % 3), 1, 1);
      }
    }
    // 擴散的環（升級 / 聲納）與地面衝擊波（只畫下半圈、貼著地）
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.dur) { this.rings.splice(i, 1); continue; }
      if (r.t < 0) continue;
      const k = r.t / r.dur, rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) ** 2);
      const col = r.colors[Math.min(r.colors.length - 1, Math.floor(k * r.colors.length))];
      ctx.fillStyle = col;
      const n = Math.max(24, Math.round(rad * 0.9));
      for (let s = 0; s < n; s++) {
        if ((s + Math.floor(k * 8)) % (k > 0.6 ? 3 : 2)) continue;
        const a = (s / n) * Math.PI * 2;
        if (r.ground) {
          // 地面：兩道往外推的塵浪（高度隨距離變矮）
          if (Math.sin(a) > -0.05) continue;
          const x = r.x + Math.cos(a) * rad, y = r.y + Math.sin(a) * Math.max(3, 12 * (1 - k));
          ctx.fillRect(Math.round(x), Math.round(y), 2, 1);
        } else ctx.fillRect(Math.round(r.x + Math.cos(a) * rad), Math.round(r.y + Math.sin(a) * rad), 1, 1);
      }
    }
    // 尋礦感知：礦格四角括號（最後 2 秒閃爍）
    const op = this.game.orePulse;
    if (op) {
      const spread = Math.min(1, (op.max - op.t) / 0.9);
      if (op.t > 2 || Math.floor(this.clock * 8) % 2 === 0) {
        const cx = op.x, cy = op.y, R = PULSE_RADIUS * spread;
        for (const o of op.ores) {
          if (Math.hypot(o.x - cx, o.y - cy) > R) continue;
          ctx.fillStyle = ORE_COLOR[o.tile] ?? '#ffffff';
          const x = o.x * S, y = o.y * S, L = 4;
          ctx.fillRect(x - 1, y - 1, L, 1); ctx.fillRect(x - 1, y - 1, 1, L);
          ctx.fillRect(x + S - L + 1, y - 1, L, 1); ctx.fillRect(x + S, y - 1, 1, L);
          ctx.fillRect(x - 1, y + S, L, 1); ctx.fillRect(x - 1, y + S - L + 1, 1, L);
          ctx.fillRect(x + S - L + 1, y + S, L, 1); ctx.fillRect(x + S, y + S - L + 1, 1, L);
          ctx.fillRect(x + S / 2 - 1, y + S / 2 - 1, 2, 2);
        }
      }
    }
  }
}
