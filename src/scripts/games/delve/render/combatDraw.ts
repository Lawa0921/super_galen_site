// combatDraw.ts — 戰鬥圖層（Canvas2D，畫在低解析緩衝上）：地上的掉落物、怪物（閃白 / 燃燒）、噬花藤莖、投射物、
// 首領光暈、命中火花 / 死亡碎屑、傷害飄字（3×5 像素字 + 1px 描邊）、畫面震動。全部對齊整數美術像素。
import type { DelveGame, DelveEvent } from '../engine/game';
import { ENEMIES, type EnemyKind } from '../engine/enemies';
import type { ItemId } from '../engine/items';
import type { Atlas } from './textures';
import type { Sprites } from './sprites';
import { toCanvas } from './pixel';
import { enemyFrames, flashBmp, silhouetteBmp, silhouetteWanted } from './enemyArt';
import type { Enemy } from '../engine/enemies';
import { FloatNumbers, digitRows, enemyFrameIndex, type FloatKind } from './combatAnim';

interface EnemySprite { frames: HTMLCanvasElement[]; flash: HTMLCanvasElement[]; dark: HTMLCanvasElement[]; anchor: 'bottom' | 'center'; }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; grav: number; }
export interface GlowSink { warm: { x: number; y: number }[]; cool: { x: number; y: number }[]; }

/** 怪物死亡碎屑的顏色 */
const GORE: Partial<Record<EnemyKind, string[]>> = {
  gel_blob: ['#4aaeb0', '#a2c8b0', '#2c8692'], frost_blob: ['#94c8ee', '#cceaf8', '#ffffff'],
  night_walker: ['#463c78', '#6a9c88', '#2c2450'], dusk_owl: ['#7c4c2e', '#c99660', '#472819'],
  cave_bat: ['#463c78', '#7a5a8c'], rock_crab: ['#5e5e74', '#a83a10', '#858aa0'], frost_wolf: ['#b4b9c8', '#ffffff', '#858aa0'],
  sand_scorpion: ['#e8701c', '#a83a10', '#ffa93a'], thorn_hornet: ['#ffd86a', '#1c1424', '#cceaf8'], snap_vine: ['#468a34', '#b8788e', '#93cc50'],
  spore_walker: ['#4aaeb0', '#c99660', '#cceaf8'], bone_knight: ['#f2e2b0', '#d8ba76', '#858aa0'], cursed_skull: ['#f2e2b0', '#7a5a8c', '#b8788e'],
  ember_imp: ['#e8701c', '#ffd86a', '#6c1e14'], magma_bat: ['#e8701c', '#ffa93a', '#2c2838'], lantern_warden: ['#4aaeb0', '#cceaf8', '#423f54', '#ffd86a'],
  warden_wisp: ['#cceaf8', '#4aaeb0'],
};
const NUM_COLOR: Record<FloatKind, string> = { hit: '#fff4c0', crit: '#ffa93a', hurt: '#e8701c', heal: '#93cc50', info: '#cceaf8' };

export class CombatLayer {
  readonly numbers = new FloatNumbers();
  private sprites: Record<EnemyKind, EnemySprite>;
  private sparks: Spark[] = [];
  private shakeT = 0;
  private shakeAmp = 0;
  private clock = 0;
  private numCache = new Map<string, HTMLCanvasElement>();
  /** 飄字放大倍數（手機上放大；renderer.resize 設定，見 lowres.floatTextScale） */
  numScale = 1;

  constructor(private readonly game: DelveGame, private readonly atlas: Atlas, private readonly sp: Sprites) {
    const raw = enemyFrames();
    const out = {} as Record<EnemyKind, EnemySprite>;
    for (const k of Object.keys(raw) as EnemyKind[]) {
      const f = raw[k];
      out[k] = {
        frames: f.frames.map((b) => toCanvas(b) as HTMLCanvasElement),
        flash: f.frames.map((b) => toCanvas(flashBmp(b), null, true) as HTMLCanvasElement),
        dark: f.frames.map((b) => toCanvas(silhouetteBmp(b)) as HTMLCanvasElement),
        anchor: f.anchor,
      };
    }
    this.sprites = out;
  }

  shake(amp: number, t: number): void { if (amp >= this.shakeAmp || this.shakeT <= 0) { this.shakeAmp = amp; this.shakeT = t; } }
  /** 本幀鏡頭震動偏移（整數美術 px） */
  shakeOffset(dt: number): { x: number; y: number } {
    this.clock += dt;
    if (this.shakeT <= 0) return { x: 0, y: 0 };
    this.shakeT -= dt;
    const a = Math.round(this.shakeAmp * Math.min(1, this.shakeT * 6));
    return { x: Math.round(Math.sin(this.clock * 91) * a), y: Math.round(Math.cos(this.clock * 73) * a) };
  }

  private burst(x: number, y: number, colors: string[], n: number, speed = 120, grav = 500): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.4, life: 0.35 + Math.random() * 0.35, color: colors[i % colors.length], size: i % 3 === 0 ? 2 : 1, grav });
    }
    if (this.sparks.length > 400) this.sparks.splice(0, this.sparks.length - 400);
  }

  onEvent(e: DelveEvent): void {
    switch (e.type) {
      case 'hit':
        this.numbers.add(e.x, e.y - 4, String(e.amount), e.crit ? 'crit' : 'hit');
        this.burst(e.x, e.y + 6, e.crit ? ['#ffd86a', '#ffffff'] : ['#fff4c0', ...(GORE[e.kind] ?? ['#ffffff']).slice(0, 1)], e.crit ? 7 : 4, 110);
        if (e.crit) this.shake(1, 0.12);
        break;
      case 'hurt':
        this.numbers.add(e.x, e.y - 4, String(e.amount), 'hurt');
        this.burst(e.x, e.y + 16, ['#e8701c', '#a83a10'], 6, 90);
        this.shake(e.amount >= 20 ? 3 : 2, 0.22);
        break;
      case 'heal': this.numbers.add(e.x, e.y - 4, `+${e.amount}`, 'heal'); break;
      case 'kill': {
        const big = ENEMIES[e.kind].boss;
        this.burst(e.x, e.y, GORE[e.kind] ?? ['#ffffff'], big ? 80 : 14, big ? 240 : 140);
        if (big) this.shake(5, 0.8);
        break;
      }
      case 'boss':
        if (e.phase === 'spawn') this.shake(3, 0.6);
        if (e.phase === 'phase2') { this.shake(4, 0.8); const b = this.game.bossEnemy(); if (b) this.burst(b.body.x + b.body.w / 2, b.body.y + b.body.h / 2, ['#423f54', '#5e5e74', '#cceaf8', '#4aaeb0'], 40, 220, 300); }
        break;
      case 'impact':
        this.burst(e.x, e.y, e.kind === 'fireball' || e.kind === 'ember' ? ['#ffa93a', '#e8701c'] : e.kind === 'bolt' ? ['#f2b888', '#b8788e', '#ffffff'] : ['#d8ba76', '#966139'], 4, 70);
        break;
      case 'death': this.burst(e.x, e.y, ['#a83a10', '#6c1e14', '#e8701c'], 24, 160); this.shake(3, 0.4); break;
      default: break;
    }
  }

  /** 光照遮罩之前：掉落物、怪物、投射物（會被黑暗遮住；發光物另外加光暈） */
  drawWorld(ctx: CanvasRenderingContext2D, view: { x: number; y: number; w: number; h: number }, glow: GlowSink): void {
    const g = this.game, M = 24;
    const inView = (x: number, y: number, w: number, h: number): boolean => x + w > view.x - M && x < view.x + view.w + M && y + h > view.y - M && y < view.y + view.h + M;
    // 掉落物（原尺寸圖示，落地時微微上下浮動）
    for (const d of g.drops.list) {
      const b = d.body;
      if (!inView(b.x, b.y, b.w, b.h)) continue;
      const bob = b.onGround ? Math.round(Math.sin(d.age * 3 + d.id) * 1) - 1 : 0;
      const src = this.atlas.icon(d.item);
      ctx.drawImage(this.atlas.canvas, src.sx, src.sy, 16, 16, Math.round(b.x + b.w / 2 - 8), Math.round(b.y + b.h - 15 + bob), 16, 16);
      if (d.item === 'life_core' || d.item === 'warden_heart' || d.item === 'lumen_blade') glow.cool.push({ x: b.x + b.w / 2, y: b.y });
    }
    // 怪物
    for (const e of g.enemies) {
      const b = e.body, spr = this.sprites[e.kind];
      if (!inView(b.x - 20, b.y - 20, b.w + 40, b.h + 40)) continue;
      if (e.kind === 'snap_vine' && e.anchor) this.drawStem(ctx, e.anchor.x, e.anchor.y, b.x + b.w / 2, b.y + b.h / 2);
      // 首領離場 / 碎籠時閃爍
      if (e.state === 'shatter' && Math.floor(e.age * 20) % 2 === 0) continue;
      const top = this.drawEnemy(ctx, e, e.flash > 0 ? spr.flash : spr.frames);
      const cx = Math.round(b.x + b.w / 2);
      if (e.burn > 0 && Math.floor(e.age * 12) % 2 === 0) {
        ctx.fillStyle = '#ffa93a';
        ctx.fillRect(cx - 3 + (Math.floor(e.age * 9) % 5), top + 2, 1, 2);
        ctx.fillStyle = '#ffd86a';
        ctx.fillRect(cx + 2 - (Math.floor(e.age * 7) % 4), top + 4, 1, 1);
      }
      if (e.kind === 'lantern_warden') glow.cool.push({ x: cx, y: b.y + b.h / 2 + 4 }, { x: cx, y: b.y + b.h / 2 - 8 });
      else if (e.kind === 'warden_wisp' || e.kind === 'cursed_skull' || e.kind === 'glow_jelly') glow.cool.push({ x: cx, y: b.y + b.h / 2 });
      else if (e.kind === 'ember_imp' || e.kind === 'magma_bat') glow.warm.push({ x: cx, y: b.y + b.h / 2 });
    }
    // 投射物
    for (const p of g.projectiles.list) {
      const b = p.body, x = b.x + b.w / 2, y = b.y + b.h / 2;
      if (!inView(b.x, b.y, b.w, b.h)) continue;
      const ang = Math.atan2(b.vy, b.vx);
      switch (p.kind) {
        case 'arrow': case 'knife': {
          const item = (p.item ?? (p.kind === 'arrow' ? 'wooden_arrow' : 'throwing_knife')) as ItemId;
          const c = this.sp.rotatedIcon(item, p.stuck ? Math.atan2(b.vy, b.vx) : ang, -Math.PI / 4);
          ctx.drawImage(c, Math.round(x - 12), Math.round(y - 12));
          if (p.flame) glow.warm.push({ x, y });
          break;
        }
        case 'boomerang': {
          const c = this.sp.rotatedIcon('wood_boomerang', p.t * 18, 0);
          ctx.drawImage(c, Math.round(x - 12), Math.round(y - 12));
          break;
        }
        case 'bolt': {
          const ux = Math.cos(ang), uy = Math.sin(ang);
          const cols = ['#ffffff', '#f2b888', '#b8788e', '#7a5a8c'];
          for (let k = 0; k < 4; k++) { ctx.fillStyle = cols[k]; ctx.fillRect(Math.round(x - ux * k * 3) - (k ? 0 : 1), Math.round(y - uy * k * 3) - (k ? 0 : 1), k ? 2 : 3, k ? 2 : 3); }
          glow.cool.push({ x, y });
          break;
        }
        case 'wave': {
          // 新月形光刃：垂直於飛行方向的弧
          const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
          for (let k = -6; k <= 6; k++) {
            const bend = -(k * k) / 10;
            ctx.fillStyle = Math.abs(k) < 3 ? '#ffffff' : Math.abs(k) < 5 ? '#cceaf8' : '#4aaeb0';
            ctx.fillRect(Math.round(x + nx * k + ux * bend), Math.round(y + ny * k + uy * bend), 2, 2);
          }
          glow.cool.push({ x, y });
          break;
        }
        case 'stinger': {
          const ux = Math.cos(ang), uy = Math.sin(ang);
          ctx.fillStyle = '#1c1424';
          for (let k = 0; k < 5; k++) ctx.fillRect(Math.round(x - ux * k), Math.round(y - uy * k), 1, 1);
          ctx.fillStyle = '#ffd86a'; ctx.fillRect(Math.round(x - ux * 4), Math.round(y - uy * 4), 1, 1);
          break;
        }
        case 'fireball': case 'ember': {
          const r = p.kind === 'fireball' ? 4 : 3, fl = Math.floor(p.t * 14) % 2;
          ctx.fillStyle = '#a83a10'; ctx.fillRect(Math.round(x - r), Math.round(y - r + 1), r * 2, r * 2 - 2); ctx.fillRect(Math.round(x - r + 1), Math.round(y - r), r * 2 - 2, r * 2);
          ctx.fillStyle = '#ffa93a'; ctx.fillRect(Math.round(x - r + 1), Math.round(y - r + 1), r * 2 - 2, r * 2 - 2);
          ctx.fillStyle = fl ? '#fff4c0' : '#ffd86a'; ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
          // 尾焰
          ctx.fillStyle = '#e8701c';
          ctx.fillRect(Math.round(x - Math.cos(ang) * (r + 2)), Math.round(y - Math.sin(ang) * (r + 2)), 2, 2);
          glow.warm.push({ x, y });
          break;
        }
        default: break;
      }
    }
  }

  /** 畫一隻怪物（frames 選一組影格），回傳精靈頂端 y */
  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, frames: HTMLCanvasElement[]): number {
    const b = e.body, spr = this.sprites[e.kind];
    const c = frames[enemyFrameIndex(e, frames.length)];
    const cx = Math.round(b.x + b.w / 2);
    const top = spr.anchor === 'bottom' ? Math.round(b.y + b.h) - c.height : Math.round(b.y + b.h / 2 - c.height / 2);
    ctx.save();
    ctx.translate(cx, top);
    if (e.dir < 0 && e.kind !== 'lantern_warden') ctx.scale(-1, 1);
    ctx.drawImage(c, -Math.floor(c.width / 2), 0);
    ctx.restore();
    return top;
  }

  /**
   * 光照遮罩之後：玩家附近、站在暗處的怪物補畫一層「剪影」（身體壓暗、眼睛保留亮色），
   * 黑暗中的戰鬥看得到敵人輪廓。lightAt(tx, ty) = 該格亮度 0..1。
   */
  drawDark(ctx: CanvasRenderingContext2D, view: { x: number; y: number; w: number; h: number }, lightAt: (tx: number, ty: number) => number): void {
    const g = this.game, p = g.player, px = (p.x + p.w / 2) / 16, py = (p.y + p.h / 2) / 16;
    for (const e of g.enemies) {
      const b = e.body;
      if (b.x + b.w < view.x || b.x > view.x + view.w || b.y + b.h < view.y || b.y > view.y + view.h) continue;
      if (e.state === 'shatter' || e.flash > 0) continue;
      const tx = (b.x + b.w / 2) / 16, ty = (b.y + b.h / 2) / 16;
      if (!silhouetteWanted(Math.hypot(tx - px, ty - py), lightAt(Math.floor(tx), Math.floor(ty)))) continue;
      this.drawEnemy(ctx, e, this.sprites[e.kind].dark);
    }
  }

  /** 噬花藤的莖：從根部到頭，每 3px 一節、兩側小葉 */
  private drawStem(ctx: CanvasRenderingContext2D, ax: number, ay: number, hx: number, hy: number): void {
    const n = Math.max(2, Math.floor(Math.hypot(hx - ax, hy - ay) / 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n, sway = Math.sin(t * Math.PI) * Math.sin(this.clock * 2 + ax) * 3;
      const x = Math.round(ax + (hx - ax) * t + sway), y = Math.round(ay + (hy - ay) * t);
      ctx.fillStyle = '#16301e'; ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = i % 2 ? '#468a34' : '#2d672e'; ctx.fillRect(x, y, 2, 2);
      if (i % 4 === 2) { ctx.fillStyle = '#67ab3c'; ctx.fillRect(x + 2, y - 1, 2, 1); }
    }
  }

  /** 光照遮罩之後：火花、飄字（不被黑暗吃掉） */
  drawOverlay(ctx: CanvasRenderingContext2D, dt: number): void {
    const ps = this.sparks;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.life -= dt;
      if (q.life <= 0) { ps.splice(i, 1); continue; }
      q.vy += q.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(q.x), Math.round(q.y), q.size, q.size);
    }
    this.numbers.step(dt);
    for (const f of this.numbers.list) {
      if (f.life < 0.2 && Math.floor(f.life * 30) % 2 === 0) continue;
      const c = this.numCanvas(f.text, f.kind);
      ctx.drawImage(c, Math.round(f.x - c.width / 2), Math.round(f.y - c.height));
    }
  }

  /** 3×5 數字 → canvas（暴擊 2 倍大），1px 深色描邊 */
  private numCanvas(text: string, kind: FloatKind): HTMLCanvasElement {
    const key = `${kind}:${text}:${this.numScale}`;
    let c = this.numCache.get(key);
    if (c) return c;
    const k = (kind === 'crit' ? 2 : 1) * this.numScale;
    const w = (text.length * 4 - 1) * k + 2, h = 5 * k + 2;
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    if (x) {
      const cells: [number, number][] = [];
      [...text].forEach((ch, i) => digitRows(ch).forEach((row, ry) => [...row].forEach((v, rx) => { if (v === '#') cells.push([1 + (i * 4 + rx) * k, 1 + ry * k]); })));
      x.fillStyle = '#0c0a12';
      for (const [cx, cy] of cells) x.fillRect(cx - 1, cy - 1, k + 2, k + 2);
      x.fillStyle = NUM_COLOR[kind];
      for (const [cx, cy] of cells) x.fillRect(cx, cy, k, k);
    }
    if (this.numCache.size > 400) this.numCache.clear();
    this.numCache.set(key, c);
    return c;
  }
}
