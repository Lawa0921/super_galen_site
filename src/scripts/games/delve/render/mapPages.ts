// mapPages.ts — 地圖頁（B12）：無限世界的地圖不再是一張整個世界大小的 canvas，而是一頁頁 8×8 chunk（256×256 px，1 tile = 1 px）的 canvas。
//   · 只有含已探索 chunk 的頁才會建立；最多 MAX_PAGES 頁，超過就淘汰最久沒畫到的頁（之後再畫到時重建、重畫）
//   · 迷霧揭露 / tile 變動只重畫那些 chunk（共用一塊 32×32 ImageData，putImageData 寫入）；每幀有預算
//   · 常駐的欄用 world.window 讀；沒常駐但探索過的欄用 world.peekColumn（暫時生成 + 蓋上停放的、不註冊）補畫，
//     每幀最多 PEEK_PER_FRAME 欄（生成一欄是整欄的成本）——不改變 residentColumns()
//   · draw：把畫面範圍內存在的頁貼到目標 ctx（沒有頁的地方留給呼叫端的背景色）
//   · exploredExtent：已探索格的水平範圍（tile 精準；大地圖拖曳的夾限用）
import type { World, TileWindow } from '../engine/world';
import type { ExploredMap } from '../engine/explore';
import type { Column } from '../engine/column';
import { CHUNK } from '../engine/constants';
import { buildMapLut, paintMapChunk, mapChunkWindow, chunkEdgeBits, clampView, type MapLut, type MapView } from './mapModel';

export { clampView };

export const PAGE_CHUNKS = 8, PAGE_PX = PAGE_CHUNKS * 32, MAX_PAGES = 96, PEEK_PER_FRAME = 2, PAINT_PER_FRAME = 24;

/** 頁 x 的偏移（頁 x 可負：±X_LIMIT / 256 ≈ ±3907）與每個頁 x 底下的頁 y 數上限 */
const PAGE_OFF = 2 ** 16;
const PAGE_ROWS = 256;
function pageKeyOf(px: number, py: number): number { return (px + PAGE_OFF) * PAGE_ROWS + py; }
/** chunk (cx, cy) 所在頁的鍵：floor(cx / 8)、floor(cy / 8) 打包（cx 可負） */
export function pageKey(cx: number, cy: number): number {
  return pageKeyOf(Math.floor(cx / PAGE_CHUNKS), Math.floor(cy / PAGE_CHUNKS));
}

/** 地圖頁要的遊戲介面（DelveGame 本身就符合） */
export interface MapPagesGame { readonly world: World; readonly explored: ExploredMap; }
export type MakeCanvas = (w: number, h: number) => HTMLCanvasElement;

const defaultCanvas: MakeCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

interface Page {
  /** 頁座標（chunk / 8） */
  px: number; py: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** 這頁重畫過幾個 chunk */
  version: number;
  /** 最後一次建立 / 被 draw 用到的時鐘 */
  used: number;
}

/** peek 欄複製進視窗的層（paintMapChunk 讀的那些） */
const PEEK_LAYERS = ['fg', 'wall', 'liquid', 'liquidType', 'variant'] as const;

export class MapPages {
  /** 地圖內容的版本號（有重畫就 +1，小地圖 / 全地圖據此決定要不要重繪） */
  version = 0;
  private readonly pages = new Map<number, Page>();
  /** 含已探索 chunk 的頁（被淘汰的頁也在：畫到時重建） */
  private readonly explPages = new Set<number>();
  /** 待重畫的 chunk：cx → cy 集合（同一欄的一起畫：沒常駐的欄 peek 一次畫完） */
  private readonly pending = new Map<number, Set<number>>();
  private nPending = 0;
  private img: ImageData | null = null;
  private buf: Uint32Array | null = null;
  private win: TileWindow | undefined;
  private clock = 0;
  /** 最近一次 draw 的時鐘（那次用到的頁不淘汰：避免畫面上的頁互相擠掉） */
  private lastDraw = -1;
  /** 已探索 chunk 的欄範圍（含）；null = 還沒有 */
  private cxLo = 0;
  private cxHi = -1;
  /** exploredExtent 的快取（undefined = 要重算） */
  private extent: { x0: number; x1: number } | null | undefined = null;
  private readonly lut: MapLut = buildMapLut();
  private readonly fogCss: string;

  constructor(private readonly game: MapPagesGame, private readonly makeCanvas: MakeCanvas = defaultCanvas) {
    const f = this.lut.fog;
    this.fogCss = `rgb(${f & 255},${(f >>> 8) & 255},${(f >>> 16) & 255})`;
    // 已有探索資料（讀檔）：含已探索格的 chunk 全部排程；dirty 的都包含在內
    const ex = game.explored;
    ex.drainDirty();
    for (const k of ex.exploredChunks()) this.note(k);
    this.update(Infinity);
  }

  /** 世界 chunk 變動（挖掘 / 放置 / 液體）：已探索、而且頁還在的 chunk 才需要重畫（被淘汰的頁重建時整頁重畫） */
  markWorld(chunkKeys: readonly number[]): void {
    const w = this.game.world, ex = this.game.explored;
    for (const k of chunkKeys) {
      const { cx, cy } = w.chunkCoords(k);
      if (ex.chunkBits(cx, cy) && this.pages.has(pageKey(cx, cy))) this.enqueue(cx, cy);
    }
  }

  /** 重畫待畫的 chunk（每幀最多 budget 個；沒常駐的欄每幀最多 PEEK_PER_FRAME 欄 peek）；回傳畫了幾個 */
  update(budget = PAINT_PER_FRAME): number {
    for (const k of this.game.explored.drainDirty()) this.note(k);
    this.evict();
    if (!this.nPending) return 0;
    const w = this.game.world, ex = this.game.explored;
    const lo = w.xMin >> 5, hi = (w.xMax - 1) >> 5;
    let n = 0, peeks = 0;
    for (const [cx, cys] of this.pending) {
      if (n >= budget) break;
      const resident = w.isResident(cx);
      let col: Column | null = null;
      if (!resident) {
        if (cx < lo || cx > hi) { this.nPending -= cys.size; this.pending.delete(cx); continue; }
        // 只有迷霧邊緣（沒有已探索格）的 chunk 不讀格子：不必 peek
        let need = false;
        for (const cy of cys) if (ex.chunkBits(cx, cy)) { need = true; break; }
        if (need) {
          if (peeks >= PEEK_PER_FRAME) continue;
          col = w.peekColumn(cx);
          peeks++;
        }
      }
      for (const cy of cys) {
        // 常駐的欄照預算分批；peek 過的欄一次畫完（不必再 peek 一次）
        if (!col && n >= budget) break;
        cys.delete(cy);
        this.nPending--;
        if (this.paint(cx, cy, col)) n++;
      }
      if (!cys.size) this.pending.delete(cx);
    }
    if (n) this.version++;
    return n;
  }

  /** 把畫面範圍內存在的頁貼到 ctx（呼叫端先填背景、設 imageSmoothingEnabled = false）；沒有頁的地方不畫 */
  draw(ctx: CanvasRenderingContext2D, view: MapView, sw: number, sh: number): void {
    const s = view.scale, w = this.game.world;
    const tx0 = Math.max(w.xMin, view.cx - sw / 2 / s), tx1 = Math.min(w.xMax - 1, view.cx + sw / 2 / s);
    const ty0 = Math.max(0, view.cy - sh / 2 / s), ty1 = Math.min(w.height - 1, view.cy + sh / 2 / s);
    if (tx1 < tx0 || ty1 < ty0) return;
    const pxa = Math.floor(tx0 / PAGE_PX), pxb = Math.floor(tx1 / PAGE_PX);
    const pya = Math.floor(ty0 / PAGE_PX), pyb = Math.floor(ty1 / PAGE_PX);
    const stamp = ++this.clock;
    this.lastDraw = stamp;
    for (let py = pya; py <= pyb; py++) {
      const t = Math.round(sh / 2 + (py * PAGE_PX - view.cy) * s), b = Math.round(sh / 2 + ((py + 1) * PAGE_PX - view.cy) * s);
      for (let px = pxa; px <= pxb; px++) {
        const pk = pageKeyOf(px, py);
        let page = this.pages.get(pk);
        if (!page) {
          // 被淘汰過的頁：重建（先是迷霧色）、整頁排程重畫
          if (!this.explPages.has(pk)) continue;
          page = this.createPage(px, py);
        }
        page.used = stamp;
        const l = Math.round(sw / 2 + (px * PAGE_PX - view.cx) * s), r = Math.round(sw / 2 + ((px + 1) * PAGE_PX - view.cx) * s);
        ctx.drawImage(page.canvas, 0, 0, PAGE_PX, PAGE_PX, l, t, r - l, b - t);
      }
    }
  }

  /** 已探索格的水平範圍 [x0, x1)（tile 精準）；還沒探索任何格 = null */
  exploredExtent(): { x0: number; x1: number } | null {
    if (this.extent !== undefined) return this.extent;
    if (this.cxHi < this.cxLo) return (this.extent = null);
    const lo = this.columnMask(this.cxLo), hi = this.columnMask(this.cxHi);
    this.extent = {
      x0: this.cxLo * CHUNK + (31 - Math.clz32(lo & -lo)),
      x1: this.cxHi * CHUNK + (31 - Math.clz32(hi)) + 1,
    };
    return this.extent;
  }

  /** 目前的頁鍵（測試 / 除錯） */
  pageKeys(): number[] { return [...this.pages.keys()]; }
  /** 某頁重畫過幾次；頁不存在 = undefined */
  pageVersion(pk: number): number | undefined { return this.pages.get(pk)?.version; }
  /** 還在排隊的 chunk 數 */
  pendingCount(): number { return this.nPending; }

  // ── 內部 ──────────────────────────────────────────────
  /** 迷霧 dirty / 讀檔的 chunk：有已探索格 → 記錄頁、擴大範圍、排程（頁還沒有就建立）；沒有（只是迷霧邊緣）→ 頁在才重畫 */
  private note(k: number): void {
    const { cx, cy } = this.game.world.chunkCoords(k);
    const pk = pageKey(cx, cy);
    if (!this.game.explored.chunkBits(cx, cy)) {
      if (this.pages.has(pk)) this.enqueue(cx, cy);
      return;
    }
    this.explPages.add(pk);
    if (this.cxHi < this.cxLo) { this.cxLo = this.cxHi = cx; this.extent = undefined; }
    else {
      if (cx < this.cxLo) this.cxLo = cx;
      if (cx > this.cxHi) this.cxHi = cx;
      if (cx === this.cxLo || cx === this.cxHi) this.extent = undefined;
    }
    if (this.pages.has(pk)) this.enqueue(cx, cy);
    else this.createPage(Math.floor(cx / PAGE_CHUNKS), Math.floor(cy / PAGE_CHUNKS));
  }

  private enqueue(cx: number, cy: number): void {
    let s = this.pending.get(cx);
    if (!s) { s = new Set(); this.pending.set(cx, s); }
    if (!s.has(cy)) { s.add(cy); this.nPending++; }
  }

  /** 建一頁（迷霧色底）並排程它所有已探索的 chunk */
  private createPage(px: number, py: number): Page {
    const canvas = this.makeCanvas(PAGE_PX, PAGE_PX);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    const ex = this.game.explored, H = this.game.world.height;
    ctx.fillStyle = this.fogCss;
    ctx.fillRect(0, 0, PAGE_PX, Math.max(0, Math.min(PAGE_PX, H - py * PAGE_PX)));
    const page: Page = { px, py, canvas, ctx, version: 0, used: ++this.clock };
    this.pages.set(pageKeyOf(px, py), page);
    if (!this.img) { this.img = ctx.createImageData(CHUNK, CHUNK); this.buf = new Uint32Array(this.img.data.buffer); }
    for (let cx = px * PAGE_CHUNKS; cx < (px + 1) * PAGE_CHUNKS; cx++) {
      for (let cy = py * PAGE_CHUNKS; cy < (py + 1) * PAGE_CHUNKS && cy < ex.chunksY; cy++) if (ex.chunkBits(cx, cy)) this.enqueue(cx, cy);
    }
    return page;
  }

  /** 超過 MAX_PAGES：淘汰最久沒畫到的頁（最近一次 draw 用到的不淘汰），連同它排隊中的 chunk */
  private evict(): void {
    if (this.pages.size <= MAX_PAGES) return;
    const cand = [...this.pages].filter(([, p]) => p.used !== this.lastDraw).sort((a, b) => a[1].used - b[1].used);
    for (const [pk, p] of cand) {
      if (this.pages.size <= MAX_PAGES) break;
      this.pages.delete(pk);
      p.canvas.width = 0; // 釋放像素記憶體
      for (let cx = p.px * PAGE_CHUNKS; cx < (p.px + 1) * PAGE_CHUNKS; cx++) {
        const s = this.pending.get(cx);
        if (!s) continue;
        for (let cy = p.py * PAGE_CHUNKS; cy < (p.py + 1) * PAGE_CHUNKS; cy++) if (s.delete(cy)) this.nPending--;
        if (!s.size) this.pending.delete(cx);
      }
    }
  }

  /** 畫 chunk (cx, cy) 到它的頁（頁不在 = 不畫）。col = peek 來的欄（沒常駐）；null = 常駐，直接讀世界 */
  private paint(cx: number, cy: number, col: Column | null): boolean {
    const page = this.pages.get(pageKey(cx, cy));
    if (!page || !this.img || !this.buf) return false;
    const w = this.game.world, ex = this.game.explored, bits = ex.chunkBits(cx, cy);
    // 常駐：一次批次讀取（含一圈鄰格）；沒常駐：視窗裡這欄的格是「沒載入 = 石頭」，用 peek 的欄蓋上（鄰格照世界：常駐的讀得到）。
    // 沒有已探索格（迷霧邊緣）：整塊迷霧，不讀格子
    let win: TileWindow;
    if (bits) win = this.win = mapChunkWindow(w, cx, cy, this.win);
    else {
      // paintMapChunk 只用到視窗的座標（世界框 / 抖動的奇偶）
      win = this.win ??= mapChunkWindow(w, cx, cy);
      win.x0 = cx * CHUNK - 1; win.y0 = cy * CHUNK - 1; win.w = CHUNK + 2; win.h = CHUNK + 2;
    }
    if (col && bits) {
      const y0 = cy * CHUNK, y1 = Math.min(y0 + CHUNK, w.height);
      for (let y = y0; y < y1; y++) {
        const so = y << 5, d = (y - win.y0) * win.w + 1;
        for (const L of PEEK_LAYERS) win[L].set(col[L].subarray(so, so + CHUNK), d);
      }
    }
    paintMapChunk(this.buf, win, bits, this.lut, w, chunkEdgeBits(ex, cx, cy));
    page.ctx.putImageData(this.img, (cx - page.px * PAGE_CHUNKS) * CHUNK, (cy - page.py * PAGE_CHUNKS) * CHUNK);
    page.version++;
    return true;
  }

  /** 第 cx 欄所有已探索 chunk 的位元 OR 成一個 32 位元遮罩（bit lx = 那一行有已探索格） */
  private columnMask(cx: number): number {
    const ex = this.game.explored;
    let m = 0;
    for (let cy = 0; cy < ex.chunksY; cy++) {
      const b = ex.chunkBits(cx, cy);
      if (!b) continue;
      for (let o = 0; o < b.length; o += 4) m |= b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
    }
    return m;
  }
}
