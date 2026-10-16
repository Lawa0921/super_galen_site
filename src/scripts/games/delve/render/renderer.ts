// renderer.ts — Canvas2D 場景：天空/視差山 → chunk 快取（牆+前景+接邊）→ 玩家/粒子/裂痕/游標 → 光照遮罩。
import type { DelveGame } from '../engine/game';
import { T, isSolidTile, WALLS } from '../engine/tiles';
import { ITEMS } from '../engine/items';
import { TILE_SIZE, CHUNK } from '../engine/constants';
import { buildAtlas, hex, mix, type Atlas } from './textures';
import { ChunkLRU, cameraFocus, followCamera, visibleChunks, type Cam } from './model';

const S = TILE_SIZE;
const CPX = CHUNK * S;
/** 每幀最多重畫幾個「已在快取裡」的 dirty chunk（看得到但沒快取的一律立即畫） */
const REDRAW_BUDGET = 4;
const LIGHT_EVERY = 4;

interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; }

export interface RenderStats { chunksDrawn: number; cached: number; lightMs: number; }

export class Renderer {
  readonly atlas: Atlas;
  readonly ctx: CanvasRenderingContext2D;
  cam: Cam = { x: 0, y: 0 };
  /** 世界 px → CSS px 縮放 */
  zoom = 1;
  viewW = 0; viewH = 0; dpr = 1;
  facing: 1 | -1 = 1;
  stats: RenderStats = { chunksDrawn: 0, cached: 0, lightMs: 0 };

  private cache: ChunkLRU<HTMLCanvasElement>;
  private pool: HTMLCanvasElement[] = [];
  private pending = new Set<number>();
  private lightCanvas = document.createElement('canvas');
  private lightCtx: CanvasRenderingContext2D;
  private lightImg: ImageData | null = null;
  private light: { x0: number; y0: number; w: number; h: number } | null = null;
  private lightAge = 999;
  private lightDirty = true;
  private frame = 0;
  private particles: Particle[] = [];
  private walkPhase = 0;
  private swing = 0;
  private snapNext = true;
  private skyKey = '';
  private skyGrad: CanvasGradient | null = null;
  private hillPhase: number[];

  constructor(readonly canvas: HTMLCanvasElement, readonly game: DelveGame) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const lctx = this.lightCanvas.getContext('2d');
    if (!ctx || !lctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.lightCtx = lctx;
    this.atlas = buildAtlas();
    this.cache = new ChunkLRU(48);
    let s = 0;
    for (const ch of game.seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    this.hillPhase = [0, 1, 2, 3, 4, 5].map((i) => ((s >>> (i * 4)) & 15) / 2.5);
  }

  resize(cssW: number, cssH: number, devicePixelRatio: number): void {
    this.dpr = Math.min(2, Math.max(1, devicePixelRatio || 1));
    this.viewW = Math.max(1, cssW);
    this.viewH = Math.max(1, cssH);
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
    const minSide = Math.min(this.viewW, this.viewH);
    this.zoom = Math.min(2, Math.max(1, Math.floor((minSide / 700) * 2) / 2));
    const vis = (Math.ceil(this.worldViewW() / CPX) + 1) * (Math.ceil(this.worldViewH() / CPX) + 1);
    if (vis + 8 > this.cache.capacity) {
      const old = this.cache;
      this.cache = new ChunkLRU(vis + 16);
      for (const k of old.keys()) { const c = old.get(k); if (c) this.cache.set(k, c); }
    }
    this.skyKey = '';
    this.lightDirty = true;
  }

  worldViewW(): number { return this.viewW / this.zoom; }
  worldViewH(): number { return this.viewH / this.zoom; }

  /** CSS px（相對 canvas）→ 世界 px */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.cam.x + sx / this.zoom, y: this.cam.y + sy / this.zoom };
  }

  snapCamera(): void { this.snapNext = true; }
  invalidateAll(): void {
    for (const k of this.cache.keys()) this.pending.add(k);
    this.lightDirty = true;
  }

  /** 遊戲事件 → 粒子 / 光照重算 */
  onEvent(e: { type: string; x?: number; y?: number; tile?: number }): void {
    if (e.type === 'mine' || e.type === 'place') this.lightDirty = true;
    if (e.type === 'mine' && e.x !== undefined && e.y !== undefined) {
      const color = this.atlas.tileColor(e.tile ?? T.DIRT);
      for (let i = 0; i < 7; i++) {
        this.particles.push({
          x: (e.x + 0.5) * S, y: (e.y + 0.5) * S,
          vx: (Math.random() - 0.5) * 140, vy: -Math.random() * 160 - 20,
          life: 0.5 + Math.random() * 0.3, color,
        });
      }
    }
  }

  render(dt: number): void {
    const g = this.game, w = g.world;
    this.frame++;
    const worldW = w.width * S, worldH = w.height * S;
    const vw = this.worldViewW(), vh = this.worldViewH();
    const pc = g.playerCenter();
    // 玩家在畫面中央略偏下（直式不再大幅上抬，避免大半畫面是天空）
    this.cam = followCamera(this.cam, cameraFocus(pc, vw, vh), vw, vh, worldW, worldH, dt, this.snapNext);
    this.snapNext = false;
    // 對齊裝置像素，避免 chunk 接縫
    const unit = this.dpr * this.zoom;
    const camX = Math.round(this.cam.x * unit) / unit, camY = Math.round(this.cam.y * unit) / unit;

    // dirty chunk
    for (const ci of w.drainDirty()) this.pending.add(ci);
    if (this.pending.size) this.lightDirty = true;

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawSky(ctx);

    ctx.setTransform(unit, 0, 0, unit, -camX * unit, -camY * unit);
    ctx.imageSmoothingEnabled = false;
    // 地下背景（無牆的地底空洞）
    const undergroundY = (w.surfaceY + 6) * S;
    if (camY + vh > undergroundY) {
      ctx.fillStyle = '#1c130d';
      ctx.fillRect(camX, Math.max(camY, undergroundY), vw + 1, camY + vh - Math.max(camY, undergroundY) + 1);
    }

    const r = visibleChunks(camX, camY, vw, vh, CPX, w.chunksX, w.chunksY);
    let budget = REDRAW_BUDGET, drawn = 0;
    for (let cy = r.cy0; cy <= r.cy1; cy++) {
      for (let cx = r.cx0; cx <= r.cx1; cx++) {
        const ci = w.chunkIndex(cx, cy);
        let c = this.cache.get(ci);
        if (!c) {
          c = this.paintChunk(ci, this.pool.pop());
          const ev = this.cache.set(ci, c);
          if (ev) this.pool.push(ev.value);
          this.pending.delete(ci);
          drawn++;
        } else if (this.pending.has(ci) && budget > 0) {
          this.paintChunk(ci, c);
          this.pending.delete(ci);
          budget--; drawn++;
        }
        ctx.drawImage(c, cx * CPX, cy * CPX);
      }
    }
    // 不可見的 dirty chunk：若在快取中就丟掉快取（下次看到再畫），避免 pending 無限累積
    if (this.pending.size > 64) {
      for (const ci of this.pending) if (!this.cache.has(ci)) this.pending.delete(ci);
    }
    this.stats.chunksDrawn = drawn;
    this.stats.cached = this.cache.size;

    this.drawMiningAndCursor(ctx);
    this.drawPlayer(ctx, dt);
    this.drawParticles(ctx, dt);
    this.drawLight(ctx, camX, camY, vw, vh);
  }

  // ── chunk ─────────────────────────────────────────────
  private paintChunk(ci: number, reuse?: HTMLCanvasElement): HTMLCanvasElement {
    const c = reuse ?? document.createElement('canvas');
    if (c.width !== CPX) { c.width = CPX; c.height = CPX; }
    const ctx = c.getContext('2d');
    if (!ctx) return c;
    ctx.clearRect(0, 0, CPX, CPX);
    ctx.imageSmoothingEnabled = false;
    const w = this.game.world, A = this.atlas, img = A.canvas;
    const { cx, cy } = w.chunkCoords(ci);
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const x1 = Math.min(w.width, x0 + CHUNK), y1 = Math.min(w.height, y0 + CHUNK);
    const W = w.width;
    // 1) 背景牆（前景是不透明實心時省略）
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        const wid = w.wall[i];
        if (wid === 0) continue;
        const f = w.fg[i];
        if (isSolidTile(f) && f !== T.WORKBENCH) continue;
        const s = A.wall(wid, w.variant[i]);
        ctx.drawImage(img, s.sx, s.sy, S, S, (x - x0) * S, (y - y0) * S, S, S);
      }
    }
    // 牆與空氣交界：牆的外緣描暗（牆邊有前景實心時略過）
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        if (w.wall[i] === 0 || isSolidTile(w.fg[i])) continue;
        const px = (x - x0) * S, py = (y - y0) * S;
        if (w.getWall(x, y - 1) === 0 && !isSolidTile(w.getFg(x, y - 1))) ctx.fillRect(px, py, S, 2);
        if (w.getWall(x - 1, y) === 0 && !isSolidTile(w.getFg(x - 1, y))) ctx.fillRect(px, py, 2, S);
        if (w.getWall(x + 1, y) === 0 && !isSolidTile(w.getFg(x + 1, y))) ctx.fillRect(px + S - 2, py, 2, S);
      }
    }
    // 2) 前景
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        const f = w.fg[i];
        if (f === T.AIR) continue;
        const s = A.tile(f, w.variant[i]);
        ctx.drawImage(img, s.sx, s.sy, S, S, (x - x0) * S, (y - y0) * S, S, S);
      }
    }
    // 3) 接邊：實心格面向非實心的那一側描暗；外角挖掉 1px 變圓
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const f = w.fg[y * W + x];
        if (!isSolidTile(f)) continue;
        const up = !isSolidTile(w.getFg(x, y - 1)) && y > 0;
        const dn = !isSolidTile(w.getFg(x, y + 1));
        const lf = !isSolidTile(w.getFg(x - 1, y));
        const rt = !isSolidTile(w.getFg(x + 1, y));
        if (!(up || dn || lf || rt)) continue;
        const px = (x - x0) * S, py = (y - y0) * S;
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        if (up && f !== T.GRASS) ctx.fillRect(px, py, S, 1);
        if (dn) ctx.fillRect(px, py + S - 1, S, 1);
        if (lf) ctx.fillRect(px, py, 1, S);
        if (rt) ctx.fillRect(px + S - 1, py, 1, S);
        if (up && f !== T.GRASS) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(px + 1, py + 1, S - 2, 1); }
        const corner = (cxp: number, cyp: number): void => {
          const wid = w.getWall(x, y);
          if (wid !== 0) { ctx.fillStyle = WALLS[wid].color; ctx.fillRect(cxp, cyp, 1, 1); }
          else ctx.clearRect(cxp, cyp, 1, 1);
        };
        if (up && lf) corner(px, py);
        if (up && rt) corner(px + S - 1, py);
        if (dn && lf) corner(px, py + S - 1);
        if (dn && rt) corner(px + S - 1, py + S - 1);
      }
    }
    return c;
  }

  // ── 天空 ─────────────────────────────────────────────
  private drawSky(ctx: CanvasRenderingContext2D): void {
    const g = this.game, sky = g.skyLevel();
    const t = Math.max(0, Math.min(1, (sky - 0.12) / 0.88));
    const key = `${Math.round(t * 40)}:${this.viewH}`;
    if (key !== this.skyKey || !this.skyGrad) {
      const top = mix(hex('#060a1f'), hex('#4f93dc'), t), bot = mix(hex('#1c2448'), hex('#c4e6f6'), t);
      const grad = ctx.createLinearGradient(0, 0, 0, this.viewH);
      grad.addColorStop(0, `rgb(${top.join(',')})`);
      grad.addColorStop(1, `rgb(${bot.join(',')})`);
      this.skyGrad = grad;
      this.skyKey = key;
    }
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // 太陽 / 月亮：依一天的進度劃弧
    const day = (g.time % 600) / 600;
    const sunUp = day > 0.2 && day < 0.8;
    const arc = sunUp ? (day - 0.2) / 0.6 : ((day + 0.2) % 1) / 0.4;
    const bx = this.viewW * (0.1 + 0.8 * Math.min(1, Math.max(0, arc)));
    const by = this.viewH * (0.42 - 0.32 * Math.sin(Math.PI * Math.min(1, Math.max(0, arc))));
    ctx.fillStyle = sunUp ? '#fff3b0' : '#e8ecf5';
    const r = sunUp ? 22 : 16;
    ctx.fillRect(Math.round(bx - r), Math.round(by - r), r * 2, r * 2);
    if (sunUp) { ctx.fillStyle = 'rgba(255,240,170,0.25)'; ctx.fillRect(Math.round(bx - r - 6), Math.round(by - r - 6), r * 2 + 12, r * 2 + 12); }
    else { ctx.fillStyle = '#c9d0de'; ctx.fillRect(Math.round(bx - 6), Math.round(by - 4), 6, 6); }

    // 兩層視差山
    const horizon = (g.world.surfaceY - 30) * S;
    const mid = this.cam.y + this.worldViewH() / 2;
    const at = (f: number): number => this.viewH / 2 + (horizon - mid) * this.zoom * f;
    this.drawHills(ctx, 0.15, at(0.3) + 10, 120, mix(hex('#25304f'), hex('#9cc0d2'), t), 0);
    this.drawHills(ctx, 0.35, at(0.5) + 40, 80, mix(hex('#1a2a2a'), hex('#6f9f6a'), t), 3);
  }

  private drawHills(ctx: CanvasRenderingContext2D, factor: number, baseY: number, amp: number, col: number[], ph: number): void {
    if (baseY - amp * 2 > this.viewH) return;
    const p = this.hillPhase;
    ctx.fillStyle = `rgb(${col.join(',')})`;
    ctx.beginPath();
    ctx.moveTo(0, this.viewH);
    const step = 8;
    for (let sx = 0; sx <= this.viewW + step; sx += step) {
      const wx = (this.cam.x * factor * this.zoom + sx) / 140;
      const h = Math.sin(wx + p[ph]) * 0.55 + Math.sin(wx * 2.3 + p[ph + 1]) * 0.3 + Math.sin(wx * 5.1 + p[ph + 2]) * 0.15;
      ctx.lineTo(sx, Math.round((baseY - amp * (0.6 + h * 0.6)) / 4) * 4);
    }
    ctx.lineTo(this.viewW, this.viewH);
    ctx.closePath();
    ctx.fill();
  }

  // ── 前景物件 ─────────────────────────────────────────
  private drawMiningAndCursor(ctx: CanvasRenderingContext2D): void {
    const g = this.game, st = g.getState();
    if (st.mining) {
      const stage = Math.min(3, Math.floor(st.mining.progress * 4));
      const c = this.atlas.crack(stage);
      ctx.drawImage(this.atlas.canvas, c.sx, c.sy, S, S, st.mining.x * S, st.mining.y * S, S, S);
    }
    const { x, y } = st.aim;
    if (!g.world.inBounds(x, y)) return;
    const ok = g.canReach(x, y);
    ctx.strokeStyle = ok ? 'rgba(255,255,255,0.85)' : 'rgba(255,70,70,0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x * S + 0.5, y * S + 0.5, S - 1, S - 1);
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, dt: number): void {
    const g = this.game, p = g.player, st = g.getState();
    if (p.vx > 8) this.facing = 1; else if (p.vx < -8) this.facing = -1;
    if (st.mining) this.facing = (st.mining.x + 0.5) * S >= p.x + p.w / 2 ? 1 : -1;
    const moving = p.onGround && Math.abs(p.vx) > 10;
    this.walkPhase = moving ? this.walkPhase + Math.abs(p.vx) * dt * 0.09 : 0;
    this.swing = st.mining ? (this.swing + dt * 14) % (Math.PI * 2) : 0;

    const cx = Math.round(p.x + p.w / 2), top = Math.round(p.y + p.gfxOffY);
    ctx.save();
    ctx.translate(cx, top);
    ctx.scale(this.facing, 1);
    const R = (x: number, y: number, w: number, h: number, c: string): void => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    const skin = '#f0c08c', hair = '#5a3418', shirt = '#2f8fa8', shirtD = '#236f83', pants = '#4a3d6e', boot = '#3a2616';
    const air = !p.onGround;
    const sw = Math.sin(this.walkPhase);
    const legA = air ? -3 : Math.round(sw * 3), legB = air ? 3 : -Math.round(sw * 3);
    // 後腿
    R(-4 + legB, 30, 5, 9, '#3c3159');
    R(-4 + legB, 39, 6, 3, boot);
    // 後臂
    const armSwing = air ? -8 : Math.round(-sw * 3);
    R(-7, 17 + Math.min(0, armSwing), 3, 10, shirtD);
    // 身體
    R(-5, 16, 10, 15, shirt);
    R(-5, 28, 10, 3, '#6b4a2a');
    // 前腿
    R(-1 + legA, 30, 5, 9, pants);
    R(-1 + legA, 39, 6, 3, boot);
    // 頭
    R(-5, 3, 10, 12, skin);
    R(-6, 1, 12, 4, hair);
    R(-6, 1, 4, 10, hair);
    R(2, 8, 2, 2, '#1d1d2a');
    R(4, 11, 1, 1, '#c98d64');
    // 前臂 + 手上物品
    const held = st.held;
    ctx.save();
    ctx.translate(3, 18);
    const ang = st.mining ? -1.4 + (Math.sin(this.swing) + 1) * 1.1 : air ? -1.2 : sw * 0.35;
    ctx.rotate(ang);
    R(-1, 0, 3, 10, shirt);
    R(-1, 9, 3, 3, skin);
    if (held) {
      const ic = this.atlas.icon(held.item);
      const isPick = ITEMS[held.item].pick !== undefined;
      ctx.translate(0, 11);
      ctx.rotate(isPick ? -0.8 : 0);
      const sz = isPick ? 14 : 9;
      ctx.drawImage(this.atlas.canvas, ic.sx, ic.sy, S, S, isPick ? -3 : -4, isPick ? -sz + 2 : -2, sz, sz);
    }
    ctx.restore();
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, dt: number): void {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.life -= dt;
      if (q.life <= 0) { ps.splice(i, 1); continue; }
      q.vy += 700 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(q.x), Math.round(q.y), 2, 2);
    }
  }

  // ── 光照 ─────────────────────────────────────────────
  private drawLight(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const g = this.game, w = g.world;
    this.lightAge++;
    if (this.lightDirty || this.lightAge >= LIGHT_EVERY || !this.light) {
      const t0 = performance.now();
      const held = g.inventory.selectedStack();
      const pt = g.playerTile();
      const extra = held && held.item === 'torch' ? [{ x: pt.x, y: pt.y, v: 0.85 }] : [{ x: pt.x, y: pt.y, v: 0.22 }];
      const view = { x: Math.floor(camX / S) - 1, y: Math.floor(camY / S) - 1, w: Math.ceil(vw / S) + 3, h: Math.ceil(vh / S) + 3 };
      const L = g.computeLight(view, extra);
      // 只上傳視窗附近（+2 格）到小 canvas
      const lx0 = Math.max(L.x0, view.x - 2), ly0 = Math.max(L.y0, view.y - 2);
      const lx1 = Math.min(L.x0 + L.w, view.x + view.w + 2), ly1 = Math.min(L.y0 + L.h, view.y + view.h + 2);
      const lw = Math.max(1, lx1 - lx0), lh = Math.max(1, ly1 - ly0);
      if (this.lightCanvas.width !== lw || this.lightCanvas.height !== lh || !this.lightImg) {
        this.lightCanvas.width = lw; this.lightCanvas.height = lh;
        this.lightImg = this.lightCtx.createImageData(lw, lh);
      }
      const d = this.lightImg.data, surf = w.surfaceY, W = w.width;
      for (let y = 0; y < lh; y++) {
        const ty = ly0 + y;
        for (let x = 0; x < lw; x++) {
          const tx = lx0 + x;
          const o = (y * lw + x) * 4;
          let a: number;
          const wi = ty * W + tx;
          if (ty <= surf && w.fg[wi] === T.AIR && w.wall[wi] === 0) a = 0; // 開放天空：交給天空漸層表現晝夜
          else {
            const l = L.data[(ty - L.y0) * L.w + (tx - L.x0)];
            a = Math.max(0, Math.min(0.97, 1 - l * 1.08));
          }
          d[o] = 4; d[o + 1] = 4; d[o + 2] = 10; d[o + 3] = Math.round(a * 255);
        }
      }
      this.lightCtx.putImageData(this.lightImg, 0, 0);
      this.light = { x0: lx0, y0: ly0, w: lw, h: lh };
      this.lightAge = 0;
      this.lightDirty = false;
      this.stats.lightMs = performance.now() - t0;
    }
    const lm = this.light;
    if (!lm) return;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.lightCanvas, lm.x0 * S, lm.y0 * S, lm.w * S, lm.h * S);
    ctx.imageSmoothingEnabled = false;
  }

  destroy(): void {
    this.cache.clear();
    this.pool.length = 0;
    this.particles.length = 0;
  }
}
