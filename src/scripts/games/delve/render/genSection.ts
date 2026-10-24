// genSection.ts — 世界生成畫面的「地層剖面」：生成中的真實世界縮成一張小像素圖（每格像素 = STRIDE×STRIDE 格），
// 每完成一段生成就重新取樣，新出現的像素由上往下以 Bayer 抖動掃進來（一層一層填滿）。
// 另有六個大階段（地形 → 洞穴 → 礦脈 → 地城 → 裝飾 → 液體），由生成器實際 yield 的段名推進（單調）。
// 純邏輯（取樣 / 揭露 / 階段）不碰 DOM；GenSectionView 才畫到 canvas。只有不透明像素。
import type { GenGrid } from '../engine/legacy/gen/grid';
import { TILES, T, SOLID_LUT } from '../engine/tiles';
import { LIQ } from '../engine/liquidKind';
import { buildMapLut, type MapLut } from './mapModel';
import { bayer, hex } from './pixel';

/** 六個大階段（生成器實際的順序；裝飾在液體之前）。label = 載入畫面的階段文字（和高亮的那個階段永遠一致） */
export const GEN_PHASES: readonly { key: string; zh: string; label: string }[] = [
  { key: 'terrain', zh: '地形', label: '雕出地形與地層' },
  { key: 'caves', zh: '洞穴', label: '挖掘洞穴、劃分生態區' },
  { key: 'ores', zh: '礦脈', label: '埋下礦脈、鋪上草地' },
  { key: 'dungeon', zh: '地城', label: '建造遺跡與地城' },
  { key: 'decor', zh: '草木', label: '種下草木、藏好寶物' },
  { key: 'liquids', zh: '液體', label: '引入泉水與熔岩' },
];
/** 第 k 個大階段的階段文字（k 超出範圍時夾住） */
export function genPhaseLabel(k: number): string {
  return GEN_PHASES[Math.max(0, Math.min(GEN_PHASES.length - 1, k))].label;
}

/** 每個大階段的第一段（生成器 yield 的段名開頭）；其餘的段沿用目前的階段 */
const PHASE_START: [RegExp, number][] = [
  [/^洞穴系統/, 1],
  [/^礦脈群/, 2],
  [/^礦坑/, 3],
  [/^樹木/, 4],
  [/^液體/, 5],
];

/**
 * 段名 → 大階段索引（單調：不會往回退）。生成器在每段開始前 yield 那段的名字，
 * 所以回傳的是「正在進行」的階段；索引比它小的都已經完成。
 */
export function genPhaseOf(stage: string, prev: number): number {
  for (const [re, k] of PHASE_START) if (re.test(stage)) return Math.max(prev, k);
  return Math.max(0, prev);
}

const pack = (h: string): number => { const c = hex(h); return ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0; };
export const SECTION_COLORS = {
  /** 還沒成形：近黑底 + 稀疏靛色點（和洞穴的純暗色分得開） */
  void: pack('#0c0a12'), voidDot: pack('#2c2450'),
  skyHi: pack('#3e74c4'), skyLo: pack('#5c9ce0'),
  cave: pack('#0c0a12'), caveWall: pack('#1c1424'),
};
const ORE = new Uint8Array(256);
for (const t of [T.COPPER_ORE, T.IRON_ORE, T.SILVER_ORE, T.GOLD_ORE]) ORE[t] = 1;
const BRICK = new Uint8Array(256);
for (const t of TILES) if (/^dungeon_brick/.test(t.key)) BRICK[t.id] = 1;

/** 每個輸出像素取樣幾×幾點（在 stride×stride 的區塊裡均勻分佈） */
const SUB = 3;

/**
 * 把世界縮成 outW×outH 的剖面像素（ABGR，out.length = outW*outH）。
 * 每個像素看它那塊區域裡 SUB×SUB 個取樣點：熔岩（≥1 點）/ 水（≥2 點）> 礦（≥1 點，Bayer 篩掉一半）> 地城磚 > 空氣（過半）> 實心（最多的那種）。
 * 空氣在該欄地表（第一個有實心的取樣列）之上 = 天空，之下 = 洞穴；整欄都沒有實心 = 還沒成形（暗色抖動）。
 */
export function sampleSection(world: GenGrid, outW: number, outH: number, out: Uint32Array, lut: MapLut = buildMapLut()): void {
  const { width: W, height: H, fg, wall, liquid, liquidType } = world;
  const sx = W / outW, sy = H / outH;
  const counts = new Uint16Array(256);
  const used: number[] = [];
  const C = SECTION_COLORS;
  for (let px = 0; px < outW; px++) {
    let surfaced = -1;
    const x0 = Math.floor(px * sx);
    for (let py = 0; py < outH; py++) {
      const y0 = Math.floor(py * sy);
      let air = 0, lava = 0, water = 0, ore = 0, brick = 0, walls = 0, best = 0, bestN = 0;
      for (let j = 0; j < SUB; j++) {
        const y = Math.min(H - 1, y0 + Math.floor(((j + 0.5) * sy) / SUB));
        for (let i = 0; i < SUB; i++) {
          const x = Math.min(W - 1, x0 + Math.floor(((i + 0.5) * sx) / SUB));
          const k = y * W + x, t = fg[k];
          if (liquid[k] > 0) { if (liquidType[k] === LIQ.LAVA) lava++; else water++; }
          if (ORE[t]) ore = t;
          if (BRICK[t]) brick = t;
          if (!SOLID_LUT[t]) { air++; if (wall[k]) walls++; continue; }
          if (counts[t] === 0) used.push(t);
          const n = ++counts[t];
          if (n > bestN) { bestN = n; best = t; }
        }
      }
      for (const t of used) counts[t] = 0;
      used.length = 0;
      const o = py * outW + px;
      const solidHere = air < SUB * SUB;
      if (surfaced < 0 && solidHere && air <= (SUB * SUB) >> 1) surfaced = py;
      let c: number;
      if (lava >= 1) c = lut.liquid[LIQ.LAVA];
      else if (water >= 2) c = lut.liquid[LIQ.WATER];
      else if (ore && bayer(px + 1, py + 2) < 0.5) c = lut.fg[ore]; // 礦：一半的格子才顯示（不會滿版雜點）
      else if (brick) c = lut.fg[brick];
      else if (air > (SUB * SUB) >> 1 || !best) {
        if (surfaced < 0) c = py < outH * 0.12 || bayer(px, py) < (outH * 0.5 - py) / (outH * 0.5) ? C.skyHi : C.skyLo;
        else c = walls > air >> 1 ? C.caveWall : C.cave;
      } else c = (bayer(px, py) < 0.25 ? lut.fgDark[best] : lut.fg[best]) || lut.fg[best];
      out[o] = c;
    }
    // 整欄都沒有實心：世界還沒成形
    if (surfaced < 0) {
      let any = false;
      for (let py = 0; py < outH && !any; py++) { const c = out[py * outW + px]; any = c !== C.skyHi && c !== C.skyLo; }
      if (!any) for (let py = 0; py < outH; py++) out[py * outW + px] = bayer(px, py) < 0.12 ? C.voidDot : C.void;
    }
  }
}

/** 揭露門檻：由上往下掃（55%）+ Bayer 抖動（45%） */
export function revealThreshold(x: number, y: number, h: number): number {
  return Math.min(1, (y / Math.max(1, h)) * 0.55 + bayer(x, y) * 0.45);
}

/**
 * 逐像素的揭露（每批生成都可能改到一部分像素，各自從「被改到的那一刻」起算）：
 * shown[i] ≠ target[i] 的像素在 now − since[i] ≥ 門檻 × ms 時換成新色。回傳是否還有像素在等。
 * since 以 ms 計；時間以 steps 階前進（像素遊戲不做平滑補間）。
 */
export function revealStep(shown: Uint32Array, target: Uint32Array, since: Float64Array, th: Float32Array, now: number, ms: number, steps: number): boolean {
  let pending = false;
  for (let i = 0; i < shown.length; i++) {
    if (shown[i] === target[i]) continue;
    const t = Math.ceil(Math.min(1, (now - since[i]) / ms) * steps) / steps;
    if (th[i] <= t) shown[i] = target[i]; else pending = true;
  }
  return pending;
}

/** 揭露動畫的長度（ms）與階數 */
const REVEAL_MS = 260, REVEAL_STEPS = 8;

/** 載入畫面上的剖面 canvas（canvas 大小 = 剖面像素；CSS 整數倍放大） */
export class GenSectionView {
  private readonly ctx: CanvasRenderingContext2D | null;
  private img: ImageData | null = null;
  private shown = new Uint32Array(0);
  private target = new Uint32Array(0);
  private next = new Uint32Array(0);
  private since = new Float64Array(0);
  private th = new Float32Array(0);
  private view = new Uint32Array(0);
  private raf = 0;
  private world: GenGrid | null = null;
  /** 取樣次數（e2e / 除錯） */
  samples = 0;

  constructor(readonly canvas: HTMLCanvasElement, readonly w: number, readonly h: number, private readonly reduced: boolean) {
    canvas.width = w; canvas.height = h;
    this.ctx = canvas.getContext('2d');
    this.img = this.ctx?.createImageData(w, h) ?? null;
    if (this.img) this.view = new Uint32Array(this.img.data.buffer);
    this.shown = new Uint32Array(w * h);
    this.target = new Uint32Array(w * h);
    this.next = new Uint32Array(w * h);
    this.since = new Float64Array(w * h);
    this.th = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.th[y * w + x] = revealThreshold(x, y, h);
  }

  /** 新的生成開始：清成「未成形」 */
  reset(world: GenGrid | null): void {
    this.world = world;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.shown[y * this.w + x] = bayer(x, y) < 0.12 ? SECTION_COLORS.voidDot : SECTION_COLORS.void;
    this.target.set(this.shown);
    this.paint(this.shown);
  }

  /** 一段生成做完：重新取樣，抖動掃進新的像素 */
  update(): void {
    if (!this.world) return;
    sampleSection(this.world, this.w, this.h, this.next);
    this.samples++;
    const now = performance.now(), { target, next, since } = this;
    for (let i = 0; i < next.length; i++) if (next[i] !== target[i]) { target[i] = next[i]; since[i] = now; }
    if (this.reduced) { this.shown.set(this.target); this.paint(this.shown); return; }
    if (!this.raf) this.raf = requestAnimationFrame(this.step);
  }

  /** 生成結束：最後取樣一次（動畫照常播完；之後不再看世界） */
  finish(): void {
    this.update();
    this.world = null;
  }

  private readonly step = (now: number): void => {
    this.raf = 0;
    const pending = revealStep(this.shown, this.target, this.since, this.th, now, REVEAL_MS, REVEAL_STEPS);
    this.paint(this.shown);
    if (pending) this.raf = requestAnimationFrame(this.step);
  };

  private paint(px: Uint32Array): void {
    if (!this.img || !this.ctx) return;
    this.view.set(px);
    this.ctx.putImageData(this.img, 0, 0);
  }

  destroy(): void { cancelAnimationFrame(this.raf); this.raf = 0; this.world = null; }
}
