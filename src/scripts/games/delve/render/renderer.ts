// renderer.ts — Canvas2D 場景（全部以原生美術解析度畫進低解析緩衝，最後整數倍放大貼到螢幕）：視差背景 → 地下暗紋 → chunk 快取（牆 + 自動接邊前景 + 材質滲透 + 草葉）
// → 樹 / 火把（動態）→ 裂痕 / 游標 → 玩家（分件精靈）→ 粒子 → 光照遮罩（8 階 + Bayer 抖動）→ 火光暈。
import type { DelveGame } from '../engine/game';
import { BLOCKS_LIGHT_LUT, T, isSolidTile, isDecor } from '../engine/tiles';
import { ITEMS, type ItemId } from '../engine/items';
import { TILE_SIZE, CHUNK, DAY_LENGTH } from '../engine/constants';
import { buildAtlas, perpMask, type Atlas } from './textures';
import { ChunkLRU, biomeBlend, cameraFocus, followCamera, visibleChunks, type Cam } from './model';
import { CORNER, EDGE, blendOverlay, decorStyle, edgeMask, innerCornerMask, type Neighbor } from './autotile';
import {
  advancePhase, armAngles, flameFrame, idleFrame, poseKind, swingAngle, walkFrame, SWING_RATE,
} from './anim';
import { FRAME, FW, FH, Sprites } from './sprites';
import { Background } from './background';
import { scanTrees, treeKind, TREE_KIND } from './scene';
import { LIGHT_LEVELS, PLATEAU, bufferSize, clampZoom, quantizeLevel, snapCam, zoomScale } from './lowres';
import { bayer } from './pixel';

const S = TILE_SIZE;
const CPX = CHUNK * S;
/** 每幀最多重畫幾個「已在快取裡」的 dirty chunk（看得到但沒快取的一律立即畫） */
const REDRAW_BUDGET = 4;
const LIGHT_EVERY = 4;
/** 光照遮罩每格 tile 切幾格（16 / 8 = 每格 2 美術 px） */
const LSUB = 8;
/** 4×4 Bayer 門檻（同 pixel.bayer） */
const BAYER_T = Float32Array.from({ length: 16 }, (_, i) => bayer(i & 3, i >> 2));
const SIDE_D: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** 游標四角：(是否右側, 是否下側, 水平延伸方向, 垂直延伸方向) */
const CURSOR_CORNERS: [number, number, number, number][] = [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]];

interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; }

export interface RenderStats { chunksDrawn: number; cached: number; lightMs: number; }

export class Renderer {
  readonly atlas: Atlas;
  readonly sprites: Sprites;
  readonly ctx: CanvasRenderingContext2D;
  /** 平滑鏡頭（內部計算用）；繪製時用對齊整數美術 px 的 drawCam */
  cam: Cam = { x: 0, y: 0 };
  drawCam: Cam = { x: 0, y: 0 };
  /** 世界 px（= 美術 px）→ CSS px 縮放 = scale / dpr */
  zoom = 1;
  /** 每個美術像素佔幾個裝置像素（整數） */
  scale = 1;
  /** CSS px 視窗 */
  viewW = 0; viewH = 0; dpr = 1;
  /** 低解析緩衝大小（美術 px） */
  bufW = 1; bufH = 1;
  facing: 1 | -1 = 1;
  /** 使用者縮放（預設倍率 + offset，整數倍） */
  zoomOffset = 0;
  private cssW = 1; private cssH = 1;
  stats: RenderStats = { chunksDrawn: 0, cached: 0, lightMs: 0 };
  /** debug：不畫光照遮罩（文件截圖用） */
  fullbright = false;

  private cache: ChunkLRU<HTMLCanvasElement>;
  private pool: HTMLCanvasElement[] = [];
  private pending = new Set<number>();
  private buf = document.createElement('canvas');
  private bctx: CanvasRenderingContext2D;
  private lightCanvas = document.createElement('canvas');
  private lightA = new Float32Array(0);
  /** 每格是否「戶外」：戶外的暗用夜空藍（色票 #18204a），地下用近黑（#0c0a12） */
  private lightOut = new Uint8Array(0);
  private lightCtx: CanvasRenderingContext2D;
  private lightImg: ImageData | null = null;
  private light: { x0: number; y0: number; w: number; h: number } | null = null;
  private lightAge = 999;
  private lightDirty = true;
  private frame = 0;
  private clock = 0;
  private particles: Particle[] = [];
  private walkPhase = 0;
  private swingPhase = 0;
  private snapNext = true;
  private bg: Background;
  private torchesSeen: { x: number; y: number }[] = [];
  private coolSeen: { x: number; y: number }[] = [];
  /** 平均地表高度（世界 px），地下背景起點用 */
  private horizonPx: number;
  /** 地表高度前綴和（遠景地平線取鏡頭附近平均） */
  private surfSum: Float64Array;

  constructor(readonly canvas: HTMLCanvasElement, readonly game: DelveGame) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const lctx = this.lightCanvas.getContext('2d');
    const bctx = this.buf.getContext('2d', { alpha: false });
    if (!ctx || !lctx || !bctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.bctx = bctx;
    this.lightCtx = lctx;
    this.atlas = buildAtlas();
    this.sprites = new Sprites((item) => this.atlas.iconBmp(item));
    this.cache = new ChunkLRU(48);
    let s = 0;
    for (const ch of game.seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    this.bg = new Background(s % 100000);
    const surf = game.world.surface;
    let sum = 0;
    for (let i = 0; i < surf.length; i++) sum += surf[i];
    this.horizonPx = (surf.length ? sum / surf.length : game.world.surfaceY) * S;
    this.surfSum = new Float64Array(surf.length + 1);
    for (let i = 0; i < surf.length; i++) this.surfSum[i + 1] = this.surfSum[i] + surf[i];
  }

  resize(cssW: number, cssH: number, devicePixelRatio: number): void {
    // 不限制 DPR：畫布 = 實際裝置像素，否則瀏覽器會再做一次非整數縮放
    this.dpr = Math.max(0.5, devicePixelRatio || 1);
    this.cssW = cssW; this.cssH = cssH;
    this.viewW = Math.max(1, cssW);
    this.viewH = Math.max(1, cssH);
    const dw = Math.max(1, Math.round(this.viewW * this.dpr)), dh = Math.max(1, Math.round(this.viewH * this.dpr));
    this.canvas.width = dw;
    this.canvas.height = dh;
    this.zoomOffset = clampZoom(this.zoomOffset, dw, dh);
    this.scale = zoomScale(dw, dh, this.zoomOffset);
    const b = bufferSize(dw, dh, this.scale);
    this.bufW = b.w; this.bufH = b.h;
    this.buf.width = b.w; this.buf.height = b.h;
    this.zoom = this.scale / this.dpr;
    const vis = (Math.ceil(this.worldViewW() / CPX) + 1) * (Math.ceil(this.worldViewH() / CPX) + 1);
    if (vis + 8 > this.cache.capacity) {
      const old = this.cache;
      this.cache = new ChunkLRU(vis + 16);
      for (const k of old.keys()) { const c = old.get(k); if (c) this.cache.set(k, c); }
    }
    this.lightDirty = true;
  }

  /** 改縮放（+1 放大 / −1 縮小），回傳實際生效的 offset */
  zoomBy(d: number): number {
    this.zoomOffset += d;
    this.resize(this.cssW, this.cssH, this.dpr);
    this.snapCamera();
    this.invalidateAll();
    return this.zoomOffset;
  }
  /** 預設倍率（不含使用者縮放）換成 CSS px 比例：HUD 像素單位用它，縮放時 HUD 不跟著變 */
  baseZoom(): number {
    const dw = Math.round(this.cssW * this.dpr), dh = Math.round(this.cssH * this.dpr);
    return zoomScale(dw, dh, 0) / this.dpr;
  }
  /** 目前視野大小（格） */
  viewTiles(): { w: number; h: number } { return { w: Math.round(this.bufW / S), h: Math.round(this.bufH / S) }; }

  worldViewW(): number { return this.bufW; }
  worldViewH(): number { return this.bufH; }

  /** CSS px（相對 canvas）→ 世界 px（以畫面上實際看到的對齊後鏡頭換算） */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.drawCam.x + sx / this.zoom, y: this.drawCam.y + sy / this.zoom };
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
      const ink = this.atlas.tileInk(e.tile ?? T.DIRT);
      for (let i = 0; i < 8; i++) {
        this.particles.push({
          x: (e.x + 0.5) * S, y: (e.y + 0.5) * S,
          vx: (Math.random() - 0.5) * 140, vy: -Math.random() * 160 - 20,
          life: 0.5 + Math.random() * 0.3, color: i % 3 === 0 ? ink : color,
        });
      }
    }
  }

  render(dt: number): void {
    const g = this.game, w = g.world;
    this.frame++;
    this.clock += dt;
    const worldW = w.width * S, worldH = w.height * S;
    const vw = this.worldViewW(), vh = this.worldViewH();
    const pc = g.playerCenter();
    this.cam = followCamera(this.cam, cameraFocus(pc, vw, vh), vw, vh, worldW, worldH, dt, this.snapNext);
    this.snapNext = false;
    // 繪製時對齊整數美術 px：精靈 / chunk / 視差層都落在像素格上，不會閃爍
    this.drawCam = snapCam(this.cam);
    const camX = this.drawCam.x, camY = this.drawCam.y;

    for (const ci of w.drainDirty()) this.pending.add(ci);
    if (this.pending.size) this.lightDirty = true;

    const ctx = this.bctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    let day = (g.time % DAY_LENGTH) / DAY_LENGTH;
    if (day < 0) day += 1;
    this.bg.draw(ctx, {
      viewW: this.bufW, viewH: this.bufH, camX, camY,
      horizonY: this.localHorizon(camX + vw / 2), time: g.time, dayFrac: day,
      biome: biomeBlend((x) => w.biome[x], (camX + vw / 2) / S, w.width),
    });

    ctx.setTransform(1, 0, 0, 1, -camX, -camY);
    const surf = w.surface;
    this.bg.drawUnderground(ctx, camX, camY, vw, vh,
      (tx) => (surf[Math.max(0, Math.min(surf.length - 1, tx))] + 6) * S, S, (w.rockY || w.cavernY) * S, w.cavernY * S, w.moltenY ? w.moltenY * S : Infinity);

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
    if (this.pending.size > 64) {
      for (const ci of this.pending) if (!this.cache.has(ci)) this.pending.delete(ci);
    }
    this.stats.chunksDrawn = drawn;
    this.stats.cached = this.cache.size;

    this.drawTrees(ctx, camX, camY, vw, vh);
    this.drawTorches(ctx, camX, camY, vw, vh);
    this.drawMiningAndCursor(ctx);
    this.drawPlayer(ctx, dt);
    this.drawParticles(ctx, dt);
    this.drawLight(ctx, camX, camY, vw, vh);
    this.drawGlows(ctx);

    // 整數倍放大貼到螢幕：每個美術像素 = scale×scale 裝置像素
    const out = this.ctx;
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.imageSmoothingEnabled = false;
    out.drawImage(this.buf, 0, 0, this.bufW, this.bufH, 0, 0, this.bufW * this.scale, this.bufH * this.scale);
  }

  /** 鏡頭附近 ±80 欄的平均地表（世界 px） */
  private localHorizon(wx: number): number {
    const n = this.surfSum.length - 1;
    if (n <= 0) return this.horizonPx;
    const c = Math.floor(wx / S);
    const a = Math.max(0, Math.min(n - 1, c - 80)), b = Math.max(a + 1, Math.min(n, c + 80));
    return ((this.surfSum[b] - this.surfSum[a]) / (b - a)) * S;
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
    const W = w.width, fg = w.fg, wall = w.wall, variant = w.variant;
    let qx = 0, qy = 0;
    const nb: Neighbor = (dx, dy) => w.getFg(qx + dx, qy + dy);
    const masks = new Uint8Array(CHUNK * CHUNK);

    // 前景遮罩（先算，牆要知道哪些實心格有圓角缺口）
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!isSolidTile(fg[y * W + x])) continue;
        qx = x; qy = y;
        masks[(y - y0) * CHUNK + (x - x0)] = edgeMask(nb);
      }
    }
    // 1) 背景牆（實心且無外露邊的格省略）
    const wallOpen = (x: number, y: number): boolean => w.getWall(x, y) === 0 && !isSolidTile(w.getFg(x, y));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        const wid = wall[i];
        if (wid === 0) continue;
        if (isSolidTile(fg[i]) && masks[(y - y0) * CHUNK + (x - x0)] === 0) continue;
        let m = 0;
        if (wallOpen(x, y - 1)) m |= EDGE.UP;
        if (wallOpen(x + 1, y)) m |= EDGE.RIGHT;
        if (wallOpen(x, y + 1)) m |= EDGE.DOWN;
        if (wallOpen(x - 1, y)) m |= EDGE.LEFT;
        const s = A.wall(wid, variant[i], m);
        ctx.drawImage(img, s.sx, s.sy, S, S, (x - x0) * S, (y - y0) * S, S, S);
      }
    }
    // 2) 前景（樹幹 / 樹葉 / 火把為動態精靈）
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        const f = fg[i];
        if (f === T.AIR || f === T.WOOD || f === T.LEAVES || f === T.TORCH) continue;
        qx = x; qy = y;
        const s = isDecor(f) ? A.decor(f, decorStyle(f, x, y, nb)) : A.tile(f, variant[i], masks[(y - y0) * CHUNK + (x - x0)]);
        ctx.drawImage(img, s.sx, s.sy, S, S, (x - x0) * S, (y - y0) * S, S, S);
      }
    }
    // 3) 材質滲透 + 內角
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const f = fg[y * W + x];
        if (!isSolidTile(f)) continue;
        const mask = masks[(y - y0) * CHUNK + (x - x0)];
        const px = (x - x0) * S, py = (y - y0) * S;
        for (let sIdx = 0; sIdx < 4; sIdx++) {
          const n = w.getFg(x + SIDE_D[sIdx][0], y + SIDE_D[sIdx][1]);
          const m = blendOverlay(f, n);
          if (!m) continue;
          if (f === T.GRASS && (mask & EDGE.UP) && (sIdx === 1 || sIdx === 3)) continue;
          const side = [EDGE.UP, EDGE.RIGHT, EDGE.DOWN, EDGE.LEFT][sIdx];
          const s = A.blend(m, sIdx, perpMask(side, mask));
          ctx.drawImage(img, s.sx, s.sy, S, S, px, py, S, S);
        }
        qx = x; qy = y;
        const ic = innerCornerMask(nb);
        if (ic) {
          ctx.fillStyle = A.tileInk(f);
          if (ic & CORNER.TL) ctx.fillRect(px, py, 1, 1);
          if (ic & CORNER.TR) ctx.fillRect(px + S - 1, py, 1, 1);
          if (ic & CORNER.BR) ctx.fillRect(px + S - 1, py + S - 1, 1, 1);
          if (ic & CORNER.BL) ctx.fillRect(px, py + S - 1, 1, 1);
        }
      }
    }
    // 4) 草葉：長到草地上方那格（包含下一個 chunk 頂列的草）
    const yEnd = Math.min(w.height - 1, y1);
    for (let y = Math.max(1, y0); y <= yEnd; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        const gt = fg[i];
        if (gt !== T.GRASS && gt !== T.JUNGLE_GRASS) continue;
        if (fg[i - W] !== T.AIR) continue; // 上面有植物 / 物件時不畫草葉
        const s = A.blades(variant[i], gt === T.JUNGLE_GRASS);
        ctx.drawImage(img, s.sx, s.sy, S, S, (x - x0) * S, (y - 1 - y0) * S, S, S);
      }
    }
    return c;
  }

  // ── 樹 / 火把 ─────────────────────────────────────────
  private drawTrees(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const w = this.game.world;
    const tx0 = Math.floor(camX / S) - 6, tx1 = Math.ceil((camX + vw) / S) + 6;
    const ty0 = Math.floor(camY / S) - 1, ty1 = Math.ceil((camY + vh) / S) + 1;
    const trees = scanTrees((x, y) => w.getFg(x, y), Math.max(0, tx0), Math.max(0, ty0), Math.min(w.width, tx1), Math.min(w.height, ty1));
    for (const t of trees) {
      const kind = treeKind(t.ground, t.variant);
      const sp = this.sprites.tree(kind, t.baseY - t.topY + 1, Math.min(kind === TREE_KIND.JUNGLE ? 7 : 4, t.leafR), t.grounded);
      const dx = t.x * S + S / 2 - sp.ax, dy = (t.baseY + 1) * S - sp.ay;
      if (dx > camX + vw || dx + sp.canvas.width < camX || dy > camY + vh || dy + sp.canvas.height < camY) continue;
      ctx.drawImage(sp.canvas, Math.round(dx), Math.round(dy));
    }
  }

  private drawTorches(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const w = this.game.world, W = w.width, fg = w.fg;
    const tx0 = Math.max(0, Math.floor(camX / S) - 1), tx1 = Math.min(W, Math.ceil((camX + vw) / S) + 1);
    const ty0 = Math.max(0, Math.floor(camY / S) - 1), ty1 = Math.min(w.height, Math.ceil((camY + vh) / S) + 1);
    const seen = this.torchesSeen, cool = this.coolSeen;
    seen.length = 0; cool.length = 0;
    const t = this.clock;
    for (let y = ty0; y < ty1; y++) {
      const row = y * W;
      for (let x = tx0; x < tx1; x++) {
        const f = fg[row + x];
        if (f === T.CRYSTAL || f === T.GLOW_MUSHROOM) { cool.push({ x: x * S + 8, y: y * S + 9 }); continue; }
        if (f === T.CANDLE || f === T.LANTERN) { seen.push({ x: x * S + 8, y: y * S + (f === T.LANTERN ? 8 : 5) }); continue; }
        // 熔岩石：只有外露在空氣下的那幾格發光暈（隔格取樣、有上限，避免整片深淵都是光暈）
        if (f === T.MAGMA_ROCK) {
          if (((x + y) & 1) === 0 && y > 0 && fg[row - W + x] === T.AIR && seen.length < 160) seen.push({ x: x * S + 8, y: y * S + 2 });
          continue;
        }
        if (f !== T.TORCH) continue;
        const c = this.sprites.torches[flameFrame(t, x, y)];
        ctx.drawImage(c, x * S + 3, y * S);
        seen.push({ x: x * S + 8, y: y * S + 6 });
      }
    }
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
    // 像素角括號：四個 L 形角（1px 亮線 + 右下 1px 暗影），沒有半透明
    const px = x * S, py = y * S, n = 4;
    const corners = (c: string, o: number): void => {
      ctx.fillStyle = c;
      for (const [cx, cy, sx, sy] of CURSOR_CORNERS) {
        const x0 = px + cx * (S - 1), y0 = py + cy * (S - 1);
        ctx.fillRect((sx > 0 ? x0 : x0 - n + 1) + o, y0 + o, n, 1);
        ctx.fillRect(x0 + o, (sy > 0 ? y0 : y0 - n + 1) + o, 1, n);
      }
    };
    corners('#0c0a12', 1);
    corners(ok ? '#ffffff' : '#e8701c', 0);
  }

  /** 背包裡最好的鎬（挖掘時手上顯示它） */
  private bestPickItem(): ItemId | null {
    let best: ItemId | null = null, tier = -1;
    for (const s of this.game.inventory.slots) {
      const p = s ? ITEMS[s.item].pick : undefined;
      if (s && p && p.speed > tier) { tier = p.speed; best = s.item; }
    }
    return best;
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, dt: number): void {
    const g = this.game, p = g.player, st = g.getState();
    if (p.vx > 8) this.facing = 1; else if (p.vx < -8) this.facing = -1;
    if (st.mining) this.facing = (st.mining.x + 0.5) * S >= p.x + p.w / 2 ? 1 : -1;
    const kind = poseKind(p.onGround, p.vx, p.vy);
    this.walkPhase = kind === 'walk' ? advancePhase(this.walkPhase, p.vx, dt) : 0;
    this.swingPhase = st.mining ? (this.swingPhase + dt * SWING_RATE) % 1 : 0;
    let fi: number, local: number;
    if (kind === 'walk') { local = walkFrame(this.walkPhase); fi = FRAME.WALK + local; }
    else if (kind === 'jump') { local = 0; fi = FRAME.JUMP; }
    else if (kind === 'fall') { local = 0; fi = FRAME.FALL; }
    else { local = idleFrame(this.clock); fi = FRAME.IDLE + local; }

    const held = st.held ? st.held.item : null;
    const heldPick = held && ITEMS[held].pick ? held : null;
    const swing = st.mining ? swingAngle(this.swingPhase) : null;
    const arms = armAngles(kind, local, swing);
    // 鎬只在挖掘時拿出來（走路時不拖著鎬）
    const showPick = st.mining ? this.bestPickItem() : null;
    void heldPick;
    const heldOther = !st.mining && held && !heldPick ? held : null;
    if (heldOther && kind !== 'jump' && kind !== 'fall') arms.front = 62 + Math.round(arms.front * 0.15);

    const SP = this.sprites;
    const bodyDy = SP.bodyDy[fi] ?? 0;
    const cx = Math.round(p.x + p.w / 2), bottom = Math.round(p.y + p.h + p.gfxOffY);
    ctx.save();
    ctx.translate(cx, bottom);
    ctx.scale(this.facing, 1);
    const ox = -FW / 2, oy = -FH;
    const sb = SP.shoulder(true), sf = SP.shoulder(false);
    const back = SP.arm(true, null, arms.back);
    ctx.drawImage(back.canvas, ox + sb.x - back.ox, oy + sb.y + bodyDy - back.oy);
    ctx.drawImage(SP.body, fi * FW, 0, FW, FH, ox, oy, FW, FH);
    // 手持非鎬物件（火把 / 方塊）：手在前、物件直立
    const rad = (arms.front * Math.PI) / 180;
    const hx = Math.round(ox + sf.x + Math.sin(rad) * SP.handReach), hy = Math.round(oy + sf.y + bodyDy + Math.cos(rad) * SP.handReach);
    if (heldOther === 'torch') {
      const c = SP.torches[flameFrame(this.clock, 7, 3)];
      ctx.drawImage(c, hx - 5, hy - 14);
    }
    const front = SP.arm(false, showPick, arms.front);
    ctx.drawImage(front.canvas, ox + sf.x - front.ox, oy + sf.y + bodyDy - front.oy);
    if (heldOther && heldOther !== 'torch') {
      const m = SP.mini(heldOther);
      ctx.drawImage(m, hx - 2, hy - 6);
    }
    ctx.restore();
    if (heldOther === 'torch' || heldOther === 'lantern') {
      this.torchesSeen.push({ x: cx + this.facing * (hx + 0), y: bottom + hy - 8 });
    }
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

  private drawGlows(ctx: CanvasRenderingContext2D): void {
    if (!this.torchesSeen.length && !this.coolSeen.length) return;
    const gl = this.sprites.glow, hw = gl.width / 2;
    const cg = this.sprites.coolGlow, ch = cg.width / 2;
    ctx.globalCompositeOperation = 'lighter';
    for (const t of this.torchesSeen) ctx.drawImage(gl, Math.round(t.x - hw), Math.round(t.y - hw));
    for (const t of this.coolSeen) ctx.drawImage(cg, Math.round(t.x - ch), Math.round(t.y - ch));
    ctx.globalCompositeOperation = 'source-over';
  }

  // ── 光照 ─────────────────────────────────────────────
  // 每格 tile 先算暗度（0 = 亮、1 = 全暗），再雙線性取樣到 2 美術 px 的小格，
  // 量化成 LIGHT_LEVELS 階：靠近某階是平台，兩階之間用世界錨定的 4×4 Bayer 抖動 → 復古的階梯式光照。
  private drawLight(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    if (this.fullbright) return;
    const g = this.game, w = g.world;
    this.lightAge++;
    if (this.lightDirty || this.lightAge >= LIGHT_EVERY || !this.light) {
      const t0 = performance.now();
      const pt = g.playerTile();
      const extra = g.heldLights();
      const view = { x: Math.floor(camX / S) - 1, y: Math.floor(camY / S) - 1, w: Math.ceil(vw / S) + 3, h: Math.ceil(vh / S) + 3 };
      const L = g.computeLight(view, extra);
      const lx0 = Math.max(L.x0, view.x - 2), ly0 = Math.max(L.y0, view.y - 2);
      const lx1 = Math.min(L.x0 + L.w, view.x + view.w + 2), ly1 = Math.min(L.y0 + L.h, view.y + view.h + 2);
      const lw = Math.max(1, lx1 - lx0), lh = Math.max(1, ly1 - ly0);
      const cw = lw * LSUB, chh = lh * LSUB;
      if (this.lightCanvas.width !== cw || this.lightCanvas.height !== chh || !this.lightImg) {
        this.lightCanvas.width = cw; this.lightCanvas.height = chh;
        this.lightImg = this.lightCtx.createImageData(cw, chh);
      }
      if (this.lightA.length < lw * lh) { this.lightA = new Float32Array(lw * lh); this.lightOut = new Uint8Array(lw * lh); }
      const A = this.lightA, OUT = this.lightOut, surf = w.surfaceY, W = w.width;
      // 戶外（天空可見）的格：依晝夜整體壓暗，直接吸附到某一階（不會整片抖動）
      const skyA = quantizeLevel((1 - g.skyLevel()) * 0.5);
      for (let y = 0; y < lh; y++) {
        const ty = ly0 + y;
        const dyp = ty - pt.y;
        for (let x = 0; x < lw; x++) {
          const tx = lx0 + x;
          let a: number;
          const wi = ty * W + tx;
          if (ty <= surf && !BLOCKS_LIGHT_LUT[w.fg[wi]] && w.wall[wi] === 0) a = -1; // 開放天空
          else {
            const l = L.data[(ty - L.y0) * L.w + (tx - L.x0)];
            // 最低環境光：玩家附近保留微弱輪廓，越遠越接近全暗
            const dxp = tx - pt.x;
            const dist = Math.sqrt(dxp * dxp + dyp * dyp);
            const cap = 0.82 + 0.15 * Math.min(1, Math.max(0, (dist - 3) / 10));
            a = Math.max(0, Math.min(cap, 1 - l * 1.08));
          }
          A[y * lw + x] = a < 0 ? skyA : Math.max(skyA, a);
          OUT[y * lw + x] = a < 0 ? 1 : 0;
        }
      }
      // 取樣表（只跟 x 或 y 有關）：小格中心 → tile 中心座標系的雙線性權重
      const top = LIGHT_LEVELS - 1;
      const ox = lx0 * LSUB, oy = ly0 * LSUB;
      const X0 = new Int32Array(cw), X1 = new Int32Array(cw), WX = new Float32Array(cw);
      for (let x = 0; x < cw; x++) {
        const fx = (x + 0.5) / LSUB - 0.5;
        const x0 = Math.max(0, Math.min(lw - 1, Math.floor(fx)));
        X0[x] = x0; X1[x] = Math.min(lw - 1, x0 + 1); WX[x] = Math.max(0, Math.min(1, fx - x0));
      }
      // 每階的 RGBA（地下近黑、戶外夜空藍），以 uint32 一次寫入
      const pix = new Uint32Array(this.lightImg.data.buffer);
      const caveC = new Uint32Array(LIGHT_LEVELS), skyC = new Uint32Array(LIGHT_LEVELS);
      for (let k = 0; k < LIGHT_LEVELS; k++) {
        const al = Math.round((k / top) * 255);
        caveC[k] = ((al << 24) | (18 << 16) | (10 << 8) | 12) >>> 0;
        skyC[k] = ((al << 24) | (74 << 16) | (32 << 8) | 24) >>> 0;
      }
      for (let y = 0; y < chh; y++) {
        const fy = (y + 0.5) / LSUB - 0.5;
        const y0 = Math.max(0, Math.min(lh - 1, Math.floor(fy))), y1 = Math.min(lh - 1, y0 + 1);
        const wy = Math.max(0, Math.min(1, fy - y0));
        const r0 = y0 * lw, r1 = y1 * lw, rn = wy < 0.5 ? r0 : r1;
        const brow = ((oy + y) & 3) * 4, row = y * cw;
        for (let x = 0; x < cw; x++) {
          const x0 = X0[x], x1 = X1[x], wx = WX[x];
          const a0 = A[r0 + x0] + (A[r0 + x1] - A[r0 + x0]) * wx;
          const a1 = A[r1 + x0] + (A[r1 + x1] - A[r1 + x0]) * wx;
          const v = (a0 + (a1 - a0) * wy) * top;
          // 與 lowres.lightLevel 相同的分階（內聯以免每格呼叫函式）
          let lv = v | 0;
          const f = v - lv;
          if (lv >= top) lv = top;
          else if (f > 1 - PLATEAU) lv++;
          else if (f >= PLATEAU && BAYER_T[brow + ((ox + x) & 3)] < (f - PLATEAU) / (1 - 2 * PLATEAU)) lv++;
          pix[row + x] = OUT[rn + (wx < 0.5 ? x0 : x1)] ? skyC[lv] : caveC[lv];
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
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.lightCanvas, lm.x0 * S, lm.y0 * S, lm.w * S, lm.h * S);
  }

  destroy(): void {
    this.cache.clear();
    this.pool.length = 0;
    this.particles.length = 0;
  }
}
