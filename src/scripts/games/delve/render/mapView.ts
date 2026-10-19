// mapView.ts — 地圖的 DOM / canvas 層：
//   · MapCache：整個世界 1 tile = 1 px 的快取 canvas。迷霧揭露 / tile 變動只重畫那些 chunk（共用一塊 32×32 ImageData，
//     putImageData 寫入），每幀有預算，不會一次重畫整張。
//   · Minimap：HUD 角落的小地圖（原生美術像素，CSS 整數倍放大），縮放 1–3、玩家標記、使用者標記
//   · FullMap：全螢幕地圖（拖曳平移、滾輪 / 雙指縮放、點一下放 / 拿標記）、地標圖示、地域名字
import type { DelveGame } from '../engine/game';
import { CHUNK } from '../engine/constants';
import {
  buildMapLut, paintMapChunk, mapIconBmp, mapPins, mapLabels, minimapSource, zoomView, panView, clampView,
  screenToTileOnMap, tileToScreenOnMap, MAP_ICONS, type MapIcon, type MapView,
} from './mapModel';
import { Bmp, INK, hex, toCanvas } from './pixel';
import { FontGate } from './fontGate';

export class MapCache {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private buf: Uint32Array;
  private pending = new Set<number>();
  /** 有任何已探索格的 chunk（只有這些 chunk 的 tile 變動需要重畫地圖） */
  private seen = new Set<number>();
  /** 地圖內容的版本號（有重畫就 +1，小地圖 / 全地圖據此決定要不要重繪） */
  version = 0;

  constructor(private game: DelveGame) {
    const w = game.world;
    this.canvas.width = w.width;
    this.canvas.height = w.height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.img = ctx.createImageData(CHUNK, CHUNK);
    this.buf = new Uint32Array(this.img.data.buffer);
    const lut = buildMapLut();
    const f = lut.fog;
    ctx.fillStyle = `rgb(${f & 255},${(f >>> 8) & 255},${(f >>> 16) & 255})`;
    ctx.fillRect(0, 0, w.width, w.height);
    // 已有探索資料（讀檔）：只畫有任何已探索格的 chunk
    const ex = game.explored, cw = Math.ceil(w.width / CHUNK), ch = Math.ceil(w.height / CHUNK);
    ex.drainDirty();
    for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) if (this.chunkHasExplored(cx, cy)) { this.pending.add(cy * cw + cx); this.seen.add(cy * cw + cx); }
    this.update(Infinity);
  }

  private chunkHasExplored(cx: number, cy: number): boolean {
    const ex = this.game.explored, W = ex.width;
    for (let y = cy * CHUNK; y < Math.min(ex.height, (cy + 1) * CHUNK); y++) {
      const a = y * W + cx * CHUNK, b = Math.min(y * W + W, a + CHUNK);
      for (let i = a; i < b; i++) if ((ex.bits[i >> 3] >> (i & 7)) & 1) return true;
    }
    return false;
  }

  /** 世界 chunk 變動（挖掘 / 放置）：已探索的 chunk 才需要重畫 */
  markWorld(cis: readonly number[]): void { for (const ci of cis) if (this.seen.has(ci)) this.pending.add(ci); }

  /** 重畫 dirty chunk（每幀最多 budget 個；回傳畫了幾個） */
  update(budget = 24): number {
    for (const ci of this.game.explored.drainDirty()) { this.pending.add(ci); this.seen.add(ci); }
    if (!this.pending.size) return 0;
    const w = this.game.world, cw = Math.ceil(w.width / CHUNK);
    let n = 0;
    for (const ci of this.pending) {
      if (n >= budget) break;
      this.pending.delete(ci);
      const cx = ci % cw, cy = Math.floor(ci / cw);
      paintMapChunk(this.buf, w, this.game.explored, cx, cy);
      this.ctx.putImageData(this.img, cx * CHUNK, cy * CHUNK);
      n++;
    }
    if (n) this.version++;
    return n;
  }
}

/** 圖示 canvas 快取（9×9 原生像素） */
const ICONS = new Map<string, HTMLCanvasElement>();
function iconCanvas(kind: MapIcon, dim = false): HTMLCanvasElement {
  const key = kind + (dim ? '?' : '');
  let c = ICONS.get(key);
  if (!c) {
    let b = mapIconBmp(dim ? 'unknown' : kind);
    if (dim) { const o = new Bmp(9, 9); o.blit(b, 0, 0); b = o; }
    c = toCanvas(b) ?? document.createElement('canvas');
    ICONS.set(key, c);
  }
  return c;
}

/** 文字 → 點陣字 canvas：先以 16px 點陣字型畫在小 canvas，alpha 二值化成單色 + 1px 描邊（地圖上的字也是像素） */
const LABELS = new Map<string, HTMLCanvasElement>();
/** 字型載入（或放棄等待）後 +1：全地圖看到變了就重畫 */
let fontEpoch = 0;
const FONT_GATE = new FontGate(typeof document !== 'undefined' ? document.fonts : undefined, 'DotGothic16', () => { LABELS.clear(); fontEpoch++; });
/** null = 點陣字型還沒載入（先不畫字，避免先用後備字型再跳） */
function labelCanvas(text: string, color = '#f2e2b0'): HTMLCanvasElement | null {
  const key = text + color;
  let c = LABELS.get(key);
  if (c) return c;
  if (!FONT_GATE.ready(text)) return null;
  const fs = 16;
  const tmp = document.createElement('canvas');
  const tctx = tmp.getContext('2d')!;
  tctx.font = `${fs}px DotGothic16, monospace`;
  const w = Math.ceil(tctx.measureText(text).width) + 4, h = fs + 6;
  tmp.width = w; tmp.height = h;
  tctx.font = `${fs}px DotGothic16, monospace`;
  tctx.textBaseline = 'top';
  tctx.fillStyle = '#ffffff';
  tctx.fillText(text, 2, 2);
  const src = tctx.getImageData(0, 0, w, h).data;
  const b = new Bmp(w, h), col = hex(color);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (src[(y * w + x) * 4 + 3] >= 110) b.set(x, y, col);
  b.outline(INK);
  c = toCanvas(b) ?? tmp;
  LABELS.set(key, c);
  return c;
}
/** 字型全部就緒後也清一次快取（保險：別處觸發的載入） */
if (typeof document !== 'undefined' && document.fonts) void document.fonts.ready.then(() => { LABELS.clear(); fontEpoch++; });

function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  const c = iconCanvas('marker');
  ctx.drawImage(c, Math.round(x - 4.5 * k + k), Math.round(y - 8 * k), 9 * k, 9 * k);
}
/** 玩家標記：9×9 菱形圖示（白 + 黑框），閃爍時換成金色——不會整個消失 */
function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, blink: boolean): void {
  const p = iconCanvas('player');
  ctx.drawImage(p, Math.round(x - 4.5 * k), Math.round(y - 4.5 * k), 9 * k, 9 * k);
  if (blink) { ctx.fillStyle = '#ffd86a'; ctx.fillRect(Math.round(x - k), Math.round(y - k), 2 * k, 2 * k); }
}

// ── 小地圖 ───────────────────────────────────────────────
const MM_ZOOM_KEY = 'delve.minimap.zoom';
const MM_ON_KEY = 'delve.minimap.on';
function load(key: string, def: string): string {
  try { return globalThis.localStorage?.getItem(key) ?? def; } catch { return def; }
}
function store(key: string, v: string): void {
  try { globalThis.localStorage?.setItem(key, v); } catch { /* 私密模式：不記住 */ }
}

export class Minimap {
  /** 每格幾個美術像素（1–3） */
  zoom = Math.max(1, Math.min(3, Number(load(MM_ZOOM_KEY, '1')) || 1));
  visible = load(MM_ON_KEY, '1') !== '0';
  private ctx: CanvasRenderingContext2D | null;
  private lastSig = '';
  private frame = 0;

  constructor(private root: HTMLElement, private canvas: HTMLCanvasElement, private cache: MapCache, private game: DelveGame) {
    this.ctx = canvas.getContext('2d');
    this.apply();
  }
  private apply(): void {
    this.root.hidden = !this.visible;
    this.root.dataset.zoom = String(this.zoom);
  }
  toggle(): boolean { this.visible = !this.visible; store(MM_ON_KEY, this.visible ? '1' : '0'); this.apply(); this.lastSig = ''; return this.visible; }
  zoomBy(d: number): number {
    this.zoom = Math.max(1, Math.min(3, this.zoom + d));
    store(MM_ZOOM_KEY, String(this.zoom));
    this.apply();
    this.lastSig = '';
    return this.zoom;
  }
  draw(): void {
    this.frame++;
    if (!this.visible || !this.ctx) return;
    const g = this.game, t = g.playerTile(), w = g.world;
    const blink = ((this.frame >> 3) & 1) === 1;
    const sig = `${this.cache.version}|${t.x}|${t.y}|${this.zoom}|${blink}|${g.markers.length}|${g.scoutMarks.length}`;
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    const W = this.canvas.width, H = this.canvas.height, z = this.zoom;
    const s = minimapSource(t.x, t.y, W, H, z, w.width, w.height);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0c0a12';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.cache.canvas, s.sx, s.sy, s.sw, s.sh, 0, 0, s.sw * z, s.sh * z);
    for (const [list, col] of [[g.markers, '#e8701c'], [g.scoutMarks, '#4aaeb0']] as const) {
      for (const m of list) {
        const mx = (m.x - s.sx) * z, my = (m.y - s.sy) * z;
        if (mx < -4 || my < -4 || mx > W + 4 || my > H + 8) continue;
        ctx.fillStyle = '#0c0a12'; ctx.fillRect(mx - 1, my - 1, 3 + (z > 1 ? 1 : 0), 3 + (z > 1 ? 1 : 0));
        ctx.fillStyle = col; ctx.fillRect(mx, my, 1 + (z > 1 ? 1 : 0), 1 + (z > 1 ? 1 : 0));
      }
    }
    // 玩家：白色十字 + 黑框（閃爍時中心換成橘色），不會整個消失
    const px = (t.x - s.sx) * z + (z >> 1), py = (t.y - s.sy) * z + (z >> 1);
    ctx.fillStyle = '#0c0a12';
    ctx.fillRect(px - 2, py - 1, 5, 3); ctx.fillRect(px - 1, py - 2, 3, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px - 1, py, 3, 1); ctx.fillRect(px, py - 1, 1, 3);
    ctx.fillStyle = blink ? '#e8701c' : '#ffffff';
    ctx.fillRect(px, py, 1, 1);
  }
}

// ── 全地圖 ───────────────────────────────────────────────
export interface FullMapOptions { onClose: () => void; onToast: (m: string) => void; }

export class FullMap {
  view: MapView = { cx: 0, cy: 0, scale: 2 };
  private ctx: CanvasRenderingContext2D | null;
  private dirty = true;
  private lastVersion = -1;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private pinch: { d: number } | null = null;
  private readonly offs: (() => void)[] = [];
  private dpr = 1;
  private scaleSet = false;
  private fontEpoch = -1;

  constructor(private root: HTMLElement, private canvas: HTMLCanvasElement, private cache: MapCache, private game: DelveGame,
    private opts: FullMapOptions) {
    this.ctx = canvas.getContext('2d', { alpha: false });
    const on = (el: EventTarget, type: string, fn: EventListener, o?: AddEventListenerOptions): void => {
      el.addEventListener(type, fn, o); this.offs.push(() => el.removeEventListener(type, fn, o));
    };
    on(canvas, 'pointerdown', (e) => this.down(e as PointerEvent));
    on(canvas, 'pointermove', (e) => this.move(e as PointerEvent));
    on(canvas, 'pointerup', (e) => this.up(e as PointerEvent));
    on(canvas, 'pointercancel', (e) => { this.pointers.delete((e as PointerEvent).pointerId); this.drag = null; this.pinch = null; });
    on(canvas, 'wheel', (e) => {
      const we = e as WheelEvent;
      we.preventDefault();
      const p = this.local(we);
      this.view = this.clamp(zoomView(this.view, this.canvas.width, this.canvas.height, p.x, p.y, we.deltaY < 0 ? 1 : -1));
      this.dirty = true;
    }, { passive: false });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    const btn = (id: string, fn: () => void): void => { const b = root.querySelector(id); if (b) on(b, 'click', fn); };
    btn('#delve-map-close', () => this.opts.onClose());
    btn('#delve-map-in', () => this.zoomCenter(1));
    btn('#delve-map-out', () => this.zoomCenter(-1));
    btn('#delve-map-center', () => { this.centerOnPlayer(); this.dirty = true; });
  }

  get isOpen(): boolean { return !this.root.hidden; }
  open(): void {
    this.root.hidden = false;
    this.resize();
    this.centerOnPlayer();
    this.dirty = true;
    this.draw();
  }
  close(): void { this.root.hidden = true; this.pointers.clear(); this.drag = null; this.pinch = null; }

  private centerOnPlayer(): void {
    const t = this.game.playerTile();
    this.view = this.clamp({ cx: t.x + 0.5, cy: t.y + 0.5, scale: this.view.scale });
  }
  private zoomCenter(d: number): void {
    this.view = this.clamp(zoomView(this.view, this.canvas.width, this.canvas.height, this.canvas.width / 2, this.canvas.height / 2, d));
    this.dirty = true;
  }
  private clamp(v: MapView): MapView { return clampView(v, this.game.world.width, this.game.world.height, this.canvas.width, this.canvas.height); }
  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * this.dpr)), h = Math.max(1, Math.round(r.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    // 預設倍率：每格 2 裝置像素（高 DPR 時 3）
    if (!this.scaleSet) { this.view.scale = this.dpr >= 2.5 ? 3 : 2; this.scaleSet = true; }
    this.dirty = true;
  }
  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * this.dpr, y: (e.clientY - r.top) * this.dpr };
  }
  private down(e: PointerEvent): void {
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
    if (this.pointers.size === 1) this.drag = { x: p.x, y: p.y, moved: false };
    else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      this.drag = null;
    }
    e.preventDefault();
  }
  private move(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.local(e), prev = this.pointers.get(e.pointerId)!;
    this.pointers.set(e.pointerId, p);
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      // 手指距離變化超過 35% 才跳一階（倍率是離散的）
      if (d > this.pinch.d * 1.35 || d < this.pinch.d / 1.35) {
        this.view = this.clamp(zoomView(this.view, this.canvas.width, this.canvas.height, (a.x + b.x) / 2, (a.y + b.y) / 2, d > this.pinch.d ? 1 : -1));
        this.pinch.d = d;
        this.dirty = true;
      }
      return;
    }
    if (this.drag) {
      if (!this.drag.moved && Math.hypot(p.x - this.drag.x, p.y - this.drag.y) > 6 * this.dpr) this.drag.moved = true;
      if (this.drag.moved) { this.view = this.clamp(panView(this.view, p.x - prev.x, p.y - prev.y)); this.dirty = true; }
    }
  }
  private up(e: PointerEvent): void {
    const p = this.local(e);
    const drag = this.drag;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (drag && !drag.moved && this.pointers.size === 0) {
      const t = screenToTileOnMap(this.view, this.canvas.width, this.canvas.height, p.x, p.y);
      const w = this.game.world;
      if (w.inBounds(t.x, t.y)) {
        const r = this.game.toggleMarker(t.x, t.y);
        if (r === 'full') this.opts.onToast('標記已滿（最多 20 個）——點既有的標記可以移除');
        this.dirty = true;
      }
    }
    this.drag = null;
  }

  /** 每幀呼叫（開著時）：地圖內容或視圖有變才重畫 */
  draw(): void {
    if (!this.isOpen || !this.ctx) return;
    const blinkFrame = (performance.now() / 260) | 0;
    if (!this.dirty && this.cache.version === this.lastVersion && this.fontEpoch === fontEpoch && (blinkFrame & 1) === 0) return;
    this.dirty = false;
    this.fontEpoch = fontEpoch;
    this.lastVersion = this.cache.version;
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, v = this.view, g = this.game, w = g.world;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0c0a12';
    ctx.fillRect(0, 0, W, H);
    // 可見範圍（tile）→ 只取那一塊貼上
    const tx0 = Math.max(0, Math.floor(v.cx - W / 2 / v.scale)), ty0 = Math.max(0, Math.floor(v.cy - H / 2 / v.scale));
    const tx1 = Math.min(w.width, Math.ceil(v.cx + W / 2 / v.scale) + 1), ty1 = Math.min(w.height, Math.ceil(v.cy + H / 2 / v.scale) + 1);
    if (tx1 > tx0 && ty1 > ty0) {
      const p0 = tileToScreenOnMap(v, W, H, tx0, ty0);
      const ox = Math.round(p0.x - 0.5 * v.scale), oy = Math.round(p0.y - 0.5 * v.scale);
      ctx.drawImage(this.cache.canvas, tx0, ty0, tx1 - tx0, ty1 - ty0, ox, oy, (tx1 - tx0) * v.scale, (ty1 - ty0) * v.scale);
    }
    // 圖示與文字：固定大小（每個美術像素 = k 個裝置像素）
    const k = Math.max(1, Math.round(this.dpr * (W / this.dpr >= 900 ? 2 : 1.5)));
    const showAll = g.hasAccessory('map');
    for (const pin of mapPins(g.regions, g.discovery, showAll)) {
      const s = tileToScreenOnMap(v, W, H, pin.x, pin.y);
      if (s.x < -20 || s.y < -20 || s.x > W + 20 || s.y > H + 20) continue;
      ctx.drawImage(iconCanvas(pin.icon, !pin.found), Math.round(s.x - 4.5 * k), Math.round(s.y - 4.5 * k), 9 * k, 9 * k);
      if (pin.found && v.scale >= 3) {
        const lc = labelCanvas(pin.name, '#ffd86a');
        if (!lc) continue;
        const lk = Math.max(1, Math.round(k / 2));
        ctx.drawImage(lc, Math.round(s.x - (lc.width * lk) / 2), Math.round(s.y + 5 * k), lc.width * lk, lc.height * lk);
      }
    }
    for (const lb of mapLabels(g.regions, g.discovery)) {
      // 名字跟著畫面中心走，但不超出該地域的欄範圍（寬的森林段也看得到名字）
      const r = g.regions[lb.id];
      const lx = lb.x < 0 ? v.cx : Math.max(r.x + 12, Math.min(r.x + r.w - 12, v.cx));
      const s = tileToScreenOnMap(v, W, H, lx, lb.y);
      const lc = labelCanvas(lb.name);
      if (!lc) continue;
      const lk = Math.max(1, Math.round(k * 0.75));
      if (s.y < -40 || s.y > H + 40) continue;
      ctx.drawImage(lc, Math.round(s.x - (lc.width * lk) / 2), Math.round(s.y - (lc.height * lk) / 2), lc.width * lk, lc.height * lk);
    }
    // 嚮導 / 地標線索 / 委託的標記（自己的清單，不佔玩家的 20 個）
    for (const m of g.scoutMarks) {
      const s = tileToScreenOnMap(v, W, H, m.x, m.y);
      ctx.drawImage(iconCanvas('landmark'), Math.round(s.x - 4.5 * k), Math.round(s.y - 4.5 * k), 9 * k, 9 * k);
    }
    for (const m of g.markers) {
      const s = tileToScreenOnMap(v, W, H, m.x, m.y);
      drawMarker(ctx, s.x, s.y, k);
    }
    const t = g.playerTile(), ps = tileToScreenOnMap(v, W, H, t.x, t.y);
    drawPlayer(ctx, ps.x, ps.y, k, (blinkFrame & 3) === 3);
    const info = this.root.querySelector('#delve-map-info');
    if (info) info.textContent = `標記 ${g.markers.length}/20 · 嚮導與線索 ${g.scoutMarks.length} · 已探索 ${(100 * g.explored.count / (w.width * w.height)).toFixed(1)}%`;
  }

  destroy(): void { for (const f of this.offs) f(); this.close(); }
}

export { MAP_ICONS };
