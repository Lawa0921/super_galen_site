// liquidDraw.ts — 液體圖層（每幀重畫視窗內的液體格，不進 tile chunk 快取 → 流動不會讓 chunk 一直重畫）。
//   · 貼片圖集：type × piece（水面 / 內部 / 水柱）× 動畫格 × 填充高度，啟動時由 liquidArt 畫好（全部色票色、無半透明）
//   · 每格依「上方有沒有液體 / 下面能不能流」挑貼片（liquidPiece），動畫格由時鐘決定（水 6 fps、熔岩 / 蜂蜜較慢）
//   · 熔岩表面格（隔欄取樣、有上限）丟進暖色光暈清單
//   · 呼吸泡泡（玩家頭上）
import type { World } from '../engine/world';
import { LIQ } from '../engine/liquidKind';
import { SOLID_LUT } from '../engine/tiles';
import { TILE_SIZE } from '../engine/constants';
import { toCanvas } from './pixel';
import { LIQUID_FRAMES, breathBubble, liquidPiece, liquidTile, type LiquidPiece } from './liquidArt';

const S = TILE_SIZE;
const PIECES: LiquidPiece[] = ['surface', 'body', 'fall'];
const TYPES = [LIQ.WATER, LIQ.LAVA, LIQ.HONEY];
/** 每種液體的動畫速度（格 / 秒） */
const FPS: Record<number, number> = { [LIQ.WATER]: 6, [LIQ.LAVA]: 2.5, [LIQ.HONEY]: 1.5 };
const MAX_LAVA_GLOWS = 120;
/** 內部貼片的橫條（連續的內部格一次畫完，減少 drawImage 次數） */
const STRIP = 64;

export interface LiquidDrawStats { cells: number; }

export class LiquidLayer {
  readonly atlas: HTMLCanvasElement;
  /** 內部貼片橫向重複 STRIP 次：列 = (type, frame) */
  private readonly strip: HTMLCanvasElement;
  private readonly bubbleFull: HTMLCanvasElement;
  private readonly bubbleEmpty: HTMLCanvasElement;
  stats: LiquidDrawStats = { cells: 0 };

  constructor() {
    // 欄：h = 1..16（水面用；body / fall 用 h = 16 那欄）；列：(type, piece, frame)
    const c = document.createElement('canvas');
    c.width = 16 * S;
    c.height = TYPES.length * PIECES.length * LIQUID_FRAMES * S;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    TYPES.forEach((t, ti) => PIECES.forEach((piece, pi) => {
      for (let f = 0; f < LIQUID_FRAMES; f++) {
        const row = (ti * PIECES.length + pi) * LIQUID_FRAMES + f;
        const hs = piece === 'surface' ? 16 : 1;
        for (let k = 0; k < hs; k++) {
          const h = piece === 'surface' ? k + 1 : 16;
          toCanvas(liquidTile(t, h, f, piece), { ctx, x: (h - 1) * S, y: row * S });
        }
      }
    }));
    this.atlas = c;
    const st = document.createElement('canvas');
    st.width = STRIP * S; st.height = TYPES.length * LIQUID_FRAMES * S;
    const sctx = st.getContext('2d');
    if (!sctx) throw new Error('2d context unavailable');
    TYPES.forEach((_, ti) => {
      for (let f = 0; f < LIQUID_FRAMES; f++) {
        const row = (ti * PIECES.length + 1) * LIQUID_FRAMES + f;
        for (let k = 0; k < STRIP; k++) sctx.drawImage(c, 15 * S, row * S, S, S, k * S, (ti * LIQUID_FRAMES + f) * S, S, S);
      }
    });
    this.strip = st;
    this.bubbleFull = toCanvas(breathBubble(true)) as HTMLCanvasElement;
    this.bubbleEmpty = toCanvas(breathBubble(false)) as HTMLCanvasElement;
  }

  /** 畫視窗（世界 px）內的液體；lavaGlows 收集熔岩表面光暈點（世界 px） */
  draw(ctx: CanvasRenderingContext2D, w: World, camX: number, camY: number, vw: number, vh: number, clock: number,
    lavaGlows: { x: number; y: number }[]): void {
    const W = w.width, L = w.liquid, LT = w.liquidType, fg = w.fg;
    const tx0 = Math.max(0, Math.floor(camX / S)), tx1 = Math.min(W, Math.ceil((camX + vw) / S) + 1);
    const ty0 = Math.max(0, Math.floor(camY / S)), ty1 = Math.min(w.height, Math.ceil((camY + vh) / S) + 1);
    const frames = [0, 0, 0, 0];
    for (const t of TYPES) frames[t] = Math.floor(clock * FPS[t]) % LIQUID_FRAMES;
    let cells = 0, glows = 0;
    const H = w.height;
    /** (x,y) 是內部貼片（上方同種液體、下面流不動）→ 回傳種類，否則 0 */
    const bodyType = (i: number, y: number): number => {
      const t = LT[i];
      if (!L[i] || !t || SOLID_LUT[fg[i]] === 1 || y === 0 || !L[i - W] || LT[i - W] !== t) return 0;
      const j = i + W;
      if (y + 1 < H && SOLID_LUT[fg[j]] !== 1 && (LT[j] === LIQ.NONE || (LT[j] === t && L[j] < 255))) return 0;
      return t;
    };
    for (let y = ty0; y < ty1; y++) {
      const row = y * W;
      for (let x = tx0; x < tx1; x++) {
        const i = row + x, a = L[i];
        if (!a) continue;
        const t = LT[i];
        if (!t || SOLID_LUT[fg[i]] === 1) continue;
        // 連續的內部格：一次畫一整段（最多 STRIP 格）
        if (bodyType(i, y) === t) {
          let n = 1;
          while (n < STRIP && x + n < tx1 && bodyType(i + n, y) === t) n++;
          ctx.drawImage(this.strip, 0, ((t - 1) * LIQUID_FRAMES + frames[t]) * S, n * S, S, x * S, y * S, n * S, S);
          cells += n;
          x += n - 1;
          continue;
        }
        const above = y > 0 && L[i - W] > 0 && LT[i - W] === t;
        const j = i + W;
        const belowOpen = y + 1 < H && SOLID_LUT[fg[j]] !== 1 && (LT[j] === LIQ.NONE || (LT[j] === t && L[j] < 255));
        const p = liquidPiece(a, above, belowOpen);
        const pi = p.piece === 'surface' ? 0 : p.piece === 'body' ? 1 : 2;
        const rowA = ((t - 1) * PIECES.length + pi) * LIQUID_FRAMES + frames[t];
        ctx.drawImage(this.atlas, (p.h - 1) * S, rowA * S, S, S, x * S, y * S, S, S);
        cells++;
        // 水柱中間的單格空隙（一包一包往下掉）：下面空、再下面又是同種液體 → 補一段水柱，看起來連續
        if (p.piece === 'fall' && L[j] === 0 && y + 2 < w.height && LT[j + W] === t && SOLID_LUT[fg[j]] !== 1) {
          ctx.drawImage(this.atlas, (S - 1) * S, (((t - 1) * PIECES.length + 2) * LIQUID_FRAMES + frames[t]) * S, S, S, x * S, (y + 1) * S, S, S);
        }
        if (t === LIQ.LAVA && !above && (x & 1) === 0 && glows < MAX_LAVA_GLOWS) { lavaGlows.push({ x: x * S + 8, y: y * S + S - p.h }); glows++; }
      }
    }
    this.stats.cells = cells;
  }

  /** 呼吸泡泡：一排在玩家頭上（滿 / 破），breath 為剩幾顆（可小數） */
  drawBreath(ctx: CanvasRenderingContext2D, cx: number, top: number, breath: number, max: number): void {
    const n = Math.ceil(breath - 1e-6), gap = 7, w0 = max * gap;
    const x0 = Math.round(cx - w0 / 2), y0 = Math.round(top - 11);
    for (let k = 0; k < max; k++) ctx.drawImage(k < n ? this.bubbleFull : this.bubbleEmpty, x0 + k * gap, y0);
  }
}
