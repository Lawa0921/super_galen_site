import { Container, Sprite, Text, type Texture, type TextStyleOptions } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { BOARD_WIDTH, VISIBLE_HEIGHT } from '../engine/constants';
import { cellToPixel, type Point } from './layout';

interface Particle {
  sp: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  baseSize: number;
  spin: number;
}
interface Ring {
  sp: Sprite;
  life: number;
  max: number;
  from: number;
  to: number;
}
interface Flash {
  sp: Sprite;
  life: number;
  max: number;
}
interface Burst {
  sp: Sprite;
  life: number;
  max: number;
  base: number;
}
interface Popup {
  t: Text;
  life: number;
  max: number;
  vy: number;
  baseScale: number;
}

const GRAVITY = 1600; // px/s^2
const MAX_PARTICLES = 420;

const POPUP_STYLE: TextStyleOptions = {
  fontFamily: '"Press Start 2P", Consolas, monospace',
  fontSize: 18,
  fill: 0xffffff,
  align: 'center',
};

/** 互動特效層：火花爆裂、消行閃光、衝擊波、霓虹彈字。畫於 fxLayer（強 bloom）。 */
export class Effects {
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private flashes: Flash[] = [];
  private bursts: Burst[] = [];
  private popups: Popup[] = [];
  private popupLayer = new Container();
  private cellSize = 24;
  private origin: Point = { x: 0, y: 0 };

  constructor(
    private layer: Container,
    private tex: { spark: Texture; ring: Texture; glow: Texture },
  ) {
    this.popupLayer.filters = [new GlowFilter({ color: 0xffffff, outerStrength: 2, innerStrength: 0, distance: 12 })];
    layer.addChild(this.popupLayer);
  }

  setLayout(cellSize: number, origin: Point): void {
    this.cellSize = cellSize;
    this.origin = origin;
  }

  private cellCenter(cx: number, cy: number): Point {
    const p = cellToPixel(cx, cy, this.cellSize, this.origin);
    return { x: p.x + this.cellSize / 2, y: p.y + this.cellSize / 2 };
  }

  private wellRect() {
    const top = cellToPixel(0, 2, this.cellSize, this.origin); // 第一個可見列 (BUFFER_ROWS=2)
    return { x: this.origin.x, y: top.y, w: this.cellSize * BOARD_WIDTH, h: this.cellSize * VISIBLE_HEIGHT };
  }

  /** 在一個格子位置噴出火花。 */
  private emitAt(x: number, y: number, color: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;
      const sp = new Sprite(this.tex.spark);
      sp.anchor.set(0.5);
      sp.blendMode = 'add';
      sp.tint = color;
      sp.x = x;
      sp.y = y;
      const ang = Math.random() * Math.PI * 2;
      const v = speed * (0.5 + Math.random() * 0.9);
      const size = this.cellSize * (0.34 + Math.random() * 0.5);
      sp.width = size;
      sp.height = size;
      sp.rotation = Math.random() * Math.PI;
      this.layer.addChild(sp);
      this.particles.push({
        sp,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v - speed * 0.3,
        life: 0.5 + Math.random() * 0.45,
        max: 0.95,
        baseSize: size,
        spin: (Math.random() * 2 - 1) * 8,
      });
    }
  }

  /** 方塊落地：小爆裂 + 落點底部火花。 */
  lockBurst(cells: Point[], color: number): void {
    // 取最低一列的格子做衝擊火花
    let maxY = -Infinity;
    for (const c of cells) maxY = Math.max(maxY, c.y);
    for (const c of cells) {
      if (c.y !== maxY) continue;
      const p = this.cellCenter(c.x, c.y);
      this.emitAt(p.x, p.y + this.cellSize * 0.4, color, 6, 300);
    }
  }

  private addRing(x: number, y: number, color: number, toDiameter: number, lifeMs: number): void {
    const sp = new Sprite(this.tex.ring);
    sp.anchor.set(0.5);
    sp.blendMode = 'add';
    sp.tint = color;
    sp.x = x;
    sp.y = y;
    this.layer.addChild(sp);
    const from = toDiameter * 0.15;
    sp.width = sp.height = from;
    this.rings.push({ sp, life: lifeMs / 1000, max: lifeMs / 1000, from, to: toDiameter });
  }

  private addRowFlash(rowY: number, color: number): void {
    const r = this.wellRect();
    const p = this.cellCenter(0, rowY);
    const sp = new Sprite(this.tex.glow);
    sp.anchor.set(0.5);
    sp.blendMode = 'add';
    sp.tint = color;
    sp.x = r.x + r.w / 2;
    sp.y = p.y;
    sp.width = r.w * 1.25;
    sp.height = this.cellSize * 2.8;
    this.layer.addChild(sp);
    this.flashes.push({ sp, life: 0.45, max: 0.45 });
  }

  /** 消行：逐列閃光 + 沿列噴碎屑 + 中心衝擊波。 */
  lineClear(rows: number[], color: number): void {
    for (const y of rows) {
      this.addRowFlash(y, 0xffffff);
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const p = this.cellCenter(x, y);
        this.emitAt(p.x, p.y, color, 5, 420);
      }
    }
    const r = this.wellRect();
    const cy = rows.reduce((a, y) => a + this.cellCenter(0, y).y, 0) / rows.length;
    this.addRing(r.x + r.w / 2, cy, color, r.w * 2.0, 520);
  }

  /** 霓虹彈字（COMBO / TETRIS / T-SPIN…），於盤面中心上浮淡出。 */
  popup(text: string, color: number, big = false, yShift = 0): void {
    const r = this.wellRect();
    const t = new Text({ text, style: { ...POPUP_STYLE, fill: color, fontSize: big ? 26 : 16 } });
    t.anchor.set(0.5);
    t.x = r.x + r.w / 2;
    t.y = r.y + r.h * 0.34 + yShift;
    this.popupLayer.addChild(t);
    this.popups.push({ t, life: 1.1, max: 1.1, vy: -38, baseScale: 1 });
  }

  /** 頂出：整盤閃一下大光。 */
  topoutFlash(): void {
    const r = this.wellRect();
    const sp = new Sprite(this.tex.glow);
    sp.anchor.set(0.5);
    sp.blendMode = 'add';
    sp.tint = 0xff3355;
    sp.x = r.x + r.w / 2;
    sp.y = r.y + r.h / 2;
    sp.width = r.w * 1.6;
    sp.height = r.h * 1.1;
    this.layer.addChild(sp);
    this.flashes.push({ sp, life: 0.7, max: 0.7 });
  }

  /** 跨場攻擊光束：自攻擊方飛向對手盤面，短暫亮起淡出。 */
  attackBeam(fromX: number, fromY: number, toX: number, toY: number, color: number): void {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const len = Math.max(1, Math.hypot(dx, dy));
    const sp = new Sprite(this.tex.glow);
    sp.anchor.set(0.5);
    sp.blendMode = 'add';
    sp.tint = color;
    sp.x = (fromX + toX) / 2;
    sp.y = (fromY + toY) / 2;
    sp.rotation = Math.atan2(dy, dx);
    sp.width = len;
    sp.height = this.cellSize * 0.9;
    this.layer.addChild(sp);
    this.flashes.push({ sp, life: 0.34, max: 0.34 });
  }

  /** 被注入垃圾：盤面紅閃。 */
  garbageInFlash(rect: { x: number; y: number; w: number; h: number }, color = 0xff3355): void {
    const sp = new Sprite(this.tex.glow);
    sp.anchor.set(0.5);
    sp.blendMode = 'add';
    sp.tint = color;
    sp.x = rect.x + rect.w / 2;
    sp.y = rect.y + rect.h / 2;
    sp.width = rect.w * 1.3;
    sp.height = rect.h * 1.05;
    this.layer.addChild(sp);
    this.flashes.push({ sp, life: 0.4, max: 0.4 });
  }

  /** 技能發動爆發：盤面中心一張 additive 貼圖，0.6→1.15 倍放大＋淡出後自動移除。 */
  skillBurst(tex: Texture, cx: number, cy: number, opts?: { scale?: number; lifeMs?: number }): void {
    const sp = new Sprite(tex);
    sp.anchor.set(0.5);
    sp.blendMode = 'add';
    sp.x = cx;
    sp.y = cy;
    const base = this.cellSize * BOARD_WIDTH * 0.9 * (opts?.scale ?? 1);
    sp.width = sp.height = base * 0.6;
    this.layer.addChild(sp);
    const life = (opts?.lifeMs ?? 500) / 1000;
    this.bursts.push({ sp, life, max: life, base });
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.sp.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += GRAVITY * dt;
      p.sp.x += p.vx * dt;
      p.sp.y += p.vy * dt;
      p.sp.rotation += p.spin * dt;
      const k = p.life / p.max;
      p.sp.alpha = Math.min(1, k * 1.6);
      const s = p.baseSize * (0.4 + 0.6 * k);
      p.sp.width = s;
      p.sp.height = s;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        r.sp.destroy();
        this.rings.splice(i, 1);
        continue;
      }
      const k = 1 - r.life / r.max;
      const d = r.from + (r.to - r.from) * k;
      r.sp.width = d;
      r.sp.height = d;
      r.sp.alpha = (1 - k) * 0.9;
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        f.sp.destroy();
        this.flashes.splice(i, 1);
        continue;
      }
      f.sp.alpha = f.life / f.max;
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      if (b.life <= 0) {
        b.sp.destroy();
        this.bursts.splice(i, 1);
        continue;
      }
      const k = 1 - b.life / b.max; // 0→1
      const s = b.base * (0.6 + 0.55 * k);
      b.sp.width = b.sp.height = s;
      b.sp.alpha = 1 - k;
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.t.destroy();
        this.popups.splice(i, 1);
        continue;
      }
      const k = p.life / p.max;
      p.t.y += p.vy * dt;
      p.t.alpha = Math.min(1, k * 2);
      const punch = 1 + (1 - k) * 0.15;
      p.t.scale.set(p.baseScale * punch);
    }
  }
}
