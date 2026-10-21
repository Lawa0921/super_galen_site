// weatherFx.ts — 天氣 / 季節的畫面效果（renderer 每幀呼叫；世界 px = 美術 px）：
//   · 雨（斜向 1 px 雨絲 + 落地水花）/ 雪（1–2 px 雪花，落地停一下）：只生在畫面內、而且只在「頭上是天空」的欄
//     （每欄的第一個實心格 = skyTop，按 chunk 欄快取 Map<cx, Int16Array(32)>、chunk 變動時失效、欄卸載時 prune 丟掉；
//     沒常駐的欄不快取），總數有上限、依畫面面積縮放。
//   · 霧：地表附近的抖動遮罩（Bayer 圖樣、世界座標錨定、離地越近越濃，沒有半透明）
//   · 落葉 / 花瓣：從畫面上秋天 / 開花的樹冠飄下，碰到實心就停住消失
//   · 睡覺淡出：全畫面 Bayer 抖動的黑（4 階）
import type { World } from '../engine/world';
import { TILE_SIZE, CHUNK } from '../engine/constants';
import { chunkOfX, localX } from '../engine/coords';
import { ditherBmp } from './seasonArt';
import { Bmp, bayer, hex, toCanvas } from './pixel';

/** 霧的圖樣（64×16）：1 px Bayer 抖動，密度沿水平方向起伏成一縷一縷 */
function fogBmp(level: number, color: string): Bmp {
  const b = new Bmp(64, 16), c = hex(color);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) {
    const wisp = 0.55 + 0.45 * Math.sin((x / 64) * Math.PI * 2 + Math.sin((y / 16) * Math.PI * 2) * 0.8);
    if (bayer(x, y) < level * wisp * 1.25) b.set(x, y, c);
  }
  return b;
}

const S = TILE_SIZE;
/** 參考畫面（640×360 美術 px）的最多粒子數 */
export const RAIN_CAP = 300;
export const SNOW_CAP = 380;
export const LEAF_CAP = 72;
/** 粒子數上限的絕對值（大螢幕也不超過） */
const HARD_CAP = 520;

/** 交換刪除（從尾端往前走訪時安全） */
function kill<T>(a: T[], i: number): void { a[i] = a[a.length - 1]; a.pop(); }
interface Drop { x: number; y: number; vx: number; vy: number; life: number; kind: 0 | 1 | 2; }
interface Leaf { x: number; y: number; vx: number; vy: number; phase: number; life: number; color: string; dark: string; rest: number; }
export interface Canopy { x: number; y: number; w: number; h: number; colors: readonly string[]; /** 葉片暗面（對比用） */ dark: string; }
export interface PrecipView {
  world: World; camX: number; camY: number; vw: number; vh: number;
  /** 'rain' | 'snow' | null（storm 傳 rain + storm=true） */
  kind: 'rain' | 'snow' | null; storm: boolean; intensity: number; wind: number;
  /** 0..1 亮度（決定雨雪顏色的明暗階） */
  light: number;
}

export class WeatherFx {
  private drops: Drop[] = [];
  private splash: Drop[] = [];
  private leaves: Leaf[] = [];
  private acc = 0;
  private lastKind: string | null = null;
  private lastCam = { x: 0, y: 0 };
  private fogDrift = 0;
  /** 天空高度快取：每個 chunk 欄（cx）一段 CHUNK 欄（-1 = 要重算）；換世界就整個丟掉 */
  private skyTop = new Map<number, Int16Array>();
  private skyWorld: World | null = null;
  /** 上一次用到的 chunk 欄（同一欄連續查詢不必查 Map） */
  private skyCx = NaN;
  private skyCol: Int16Array | null = null;
  private fogPats = new Map<string, CanvasPattern | null>();
  private fogCanvas = new Map<string, HTMLCanvasElement>();
  private sleepCanvas: HTMLCanvasElement[] = [];
  private sleepPats: (CanvasPattern | null)[] = [];
  readonly stats = { drops: 0, leaves: 0 };
  constructor(private rnd: () => number = Math.random) {}

  /** chunk 變動：那幾欄的天空高度要重算 */
  invalidate(world: World, cis: readonly number[]): void {
    if (this.skyWorld !== world) return;
    for (const ci of cis) this.skyTop.get(world.chunkCoords(ci).cx)?.fill(-1);
  }
  invalidateAll(): void { this.skyTop.clear(); this.skyCx = NaN; this.skyCol = null; }
  /** 丟掉已經沒常駐的欄的天空高度（renderer 定期呼叫；欄卸載後記憶體不留） */
  prune(world: World): void {
    if (this.skyWorld !== world) return;
    for (const cx of this.skyTop.keys()) if (!world.isResident(cx)) this.skyTop.delete(cx);
    if (this.skyCol && !this.skyTop.has(this.skyCx)) { this.skyCx = NaN; this.skyCol = null; }
  }
  /** 有快取天空高度的 chunk 欄（測試用） */
  cachedSkyColumns(): number[] { return [...this.skyTop.keys()]; }
  /** 第 x 欄從天空往下第一個實心（或結冰）格的 y（沒常駐的欄讀到 = 石頭 → 0，不快取） */
  top(world: World, x: number): number {
    if (this.skyWorld !== world) { this.skyWorld = world; this.invalidateAll(); }
    if (x < world.xMin || x >= world.xMax) return 0;
    const cx = chunkOfX(x);
    let col = this.skyCol;
    if (cx !== this.skyCx || !col) {
      if (!world.isResident(cx)) return 0;
      col = this.skyTop.get(cx) ?? null;
      if (!col) { col = new Int16Array(CHUNK).fill(-1); this.skyTop.set(cx, col); }
      this.skyCx = cx; this.skyCol = col;
    }
    const lx = localX(x);
    let t = col[lx];
    if (t < 0) {
      t = 0;
      while (t < world.height && !world.isSolid(x, t)) t++;
      col[lx] = t;
    }
    return t;
  }

  /** 推進雨 / 雪 */
  update(dt: number, v: PrecipView): void {
    const w = v.world;
    const area = (v.vw * v.vh) / (640 * 360);
    const cap = Math.min(HARD_CAP, Math.round((v.kind === 'snow' ? SNOW_CAP : RAIN_CAP) * area * Math.max(0, Math.min(1, v.intensity)) * (v.storm ? 1.25 : 1)));
    const R = this.rnd;
    // 換天氣 / 鏡頭大跳（傳送、讀檔）：直接在整個畫面鋪上一層（不用等第一批從頂端落下）
    const jump = Math.abs(v.camX - this.lastCam.x) > v.vw || Math.abs(v.camY - this.lastCam.y) > v.vh;
    this.lastCam = { x: v.camX, y: v.camY };
    if (v.kind && cap > 0 && (v.kind !== this.lastKind || jump)) {
      // 換成另一種降水：舊的那種直接清掉（天氣切換前強度已漸變到 0）
      if (v.kind !== this.lastKind) this.drops = this.drops.filter((p) => (v.kind === 'snow' ? p.kind !== 0 : p.kind === 0));
      const windPx = v.wind * (v.kind === 'snow' ? 40 : 170);
      for (let k = this.drops.length; k < cap * 0.85; k++) {
        const x = v.camX - 20 + R() * (v.vw + 40), y = v.camY + R() * v.vh;
        const tx = Math.floor(x / S);
        if (this.top(w, tx) * S <= y) continue;
        if (v.kind === 'snow') this.drops.push({ x, y, vx: windPx, vy: 26 + R() * 26, life: R() * 3, kind: 1 });
        else this.drops.push({ x, y, vx: windPx * (0.9 + R() * 0.2), vy: 380 + R() * 90, life: 0, kind: 0 });
      }
    }
    this.lastKind = v.kind;
    // 生成：在畫面頂端往上一點、依風往上風處多生一些
    if (v.kind && cap > 0) {
      const fall = v.kind === 'snow' ? 40 : 420;
      const rate = (cap * fall) / Math.max(60, v.vh + 40);
      this.acc += rate * dt;
      const windPx = v.wind * (v.kind === 'snow' ? 40 : 170);
      while (this.acc >= 1) {
        this.acc -= 1;
        if (this.drops.length >= cap) continue;
        const lead = -windPx * ((v.vh + 40) / fall);
        const x = v.camX - 20 + R() * (v.vw + 40) + lead;
        const y = v.camY - 6 - R() * 30;
        if (this.top(w, Math.floor(x / S)) * S <= v.camY - 8) continue; // 這欄頭上被擋住（地下 / 屋頂）
        if (v.kind === 'snow') this.drops.push({ x, y, vx: windPx, vy: 26 + R() * 26, life: 0, kind: 1 });
        else this.drops.push({ x, y, vx: windPx * (0.9 + R() * 0.2), vy: 380 + R() * 90, life: 0, kind: 0 });
      }
    } else this.acc = 0;
    const ds = this.drops;
    for (let i = ds.length - 1; i >= 0; i--) {
      const p = ds[i];
      p.life += dt;
      if (p.kind === 1) p.x += (p.vx + Math.sin(p.life * 2.1 + p.y * 0.05) * 10) * dt;
      else p.x += p.vx * dt;
      p.y += p.vy * dt;
      const tx = Math.floor(p.x / S), ground = this.top(w, tx) * S;
      const wet = w.getLiquid(tx, Math.floor(p.y / S)) > 40;
      if (p.y >= ground || wet) {
        if (p.kind === 0 && this.splash.length < 80 && p.y < v.camY + v.vh) {
          this.splash.push({ x: p.x, y: Math.min(p.y, ground) - 1, vx: (R() - 0.5) * 40, vy: -40 - R() * 30, life: 0.12 + R() * 0.08, kind: 2 });
        }
        if (p.kind === 1 && !wet) { p.kind = 2; p.y = ground - 1; p.vx = 0; p.vy = 0; p.life = -0.6; continue; }
        kill(ds, i);
        continue;
      }
      if (p.kind === 2) { if (p.life >= 0) kill(ds, i); continue; }
      if (p.y > v.camY + v.vh + 24 || p.x < v.camX - 80 || p.x > v.camX + v.vw + 80) kill(ds, i);
    }
    for (let i = this.splash.length - 1; i >= 0; i--) {
      const s = this.splash[i];
      s.life -= dt; s.vy += 400 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life <= 0) kill(this.splash, i);
    }
    this.stats.drops = ds.length + this.splash.length;
  }

  /** 雨絲 / 雪花（畫在光照遮罩之後：夜裡也看得到，顏色依亮度分階） */
  drawPrecip(ctx: CanvasRenderingContext2D, light: number, storm: boolean): void {
    if (!this.drops.length && !this.splash.length) return;
    const lv = light > 0.66 ? 2 : light > 0.33 ? 1 : 0;
    const RAIN_HEAD = ['#5c9ce0', '#94c8ee', '#cceaf8'][lv], RAIN_TAIL = ['#2c4486', '#5c9ce0', '#94c8ee'][lv];
    const SNOW_A = ['#7f9cc4', '#cceaf8', '#ffffff'][lv], SNOW_B = ['#5e5e74', '#b4b9c8', '#cceaf8'][lv];
    const len = storm ? 6 : 4;
    // 先畫所有雨絲的尾巴，再畫頭（同色一次設定 fillStyle）
    ctx.fillStyle = RAIN_TAIL;
    for (const p of this.drops) {
      if (p.kind !== 0) continue;
      const sx = p.vx / p.vy;
      for (let k = 1; k < len; k++) ctx.fillRect(Math.round(p.x - sx * k), Math.round(p.y) - k, 1, 1);
    }
    ctx.fillStyle = RAIN_HEAD;
    for (const p of this.drops) if (p.kind === 0) ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    for (const s of this.splash) ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    ctx.fillStyle = SNOW_A;
    for (const p of this.drops) {
      if (p.kind === 0) continue;
      const big = ((p.x * 7 + p.vy) | 0) % 2 === 0;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), big ? 2 : 1, big ? 2 : 1);
    }
    ctx.fillStyle = SNOW_B;
    for (const p of this.drops) if (p.kind === 2) ctx.fillRect(Math.round(p.x) + 1, Math.round(p.y), 1, 1);
  }

  // ── 落葉 / 花瓣 ──
  updateLeaves(dt: number, world: World, canopies: readonly Canopy[], wind: number, view: { x: number; y: number; w: number; h: number }): void {
    const R = this.rnd, L = this.leaves;
    const rate = 1.1 + Math.abs(wind) * 2;
    for (const c of canopies) {
      if (L.length >= LEAF_CAP) break;
      if (R() > dt * rate) continue;
      // 從樹冠下半部飄出（落在樹冠外才看得清楚）
      L.push({ x: c.x + R() * c.w, y: c.y + c.h * (0.82 + R() * 0.18), vx: 0, vy: 14 + R() * 10, phase: R() * 6, life: 0, color: c.colors[Math.floor(R() * c.colors.length) % c.colors.length], dark: c.dark, rest: 0 });
    }
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life += dt;
      if (p.rest > 0) { p.rest -= dt; if (p.rest <= 0) kill(L, i); continue; }
      p.phase += dt * 2.4;
      p.x += (wind * 34 + Math.sin(p.phase) * 14) * dt;
      p.y += p.vy * (0.7 + 0.3 * Math.cos(p.phase * 0.9)) * dt;
      const tx = Math.floor(p.x / S), ty = Math.floor((p.y + 1) / S);
      if (world.isSolid(tx, ty) || world.getLiquid(tx, ty) > 60) { p.rest = 1.2; continue; }
      if (p.life > 14 || p.y > view.y + view.h + 30 || p.x < view.x - 60 || p.x > view.x + view.w + 60) kill(L, i);
    }
    this.stats.leaves = L.length;
  }
  drawLeaves(ctx: CanvasRenderingContext2D): void {
    for (const p of this.leaves) {
      const x = Math.round(p.x), y = Math.round(p.y);
      // 3 px 的葉片（亮面 2 px + 暗面 1 px），翻面時換成直立的樣子（簡單的翻轉感）
      const flat = Math.sin(p.phase) > 0 || p.rest > 0;
      ctx.fillStyle = p.color;
      if (flat) ctx.fillRect(x, y, 2, 2); else ctx.fillRect(x, y, 1, 2);
      ctx.fillStyle = p.dark;
      if (flat) ctx.fillRect(x + 2, y + 1, 1, 1); else ctx.fillRect(x + 1, y + 1, 1, 2);
    }
  }

  // ── 霧 ──
  private fogPat(ctx: CanvasRenderingContext2D, level: number, color: string): CanvasPattern | null {
    const key = `${level}|${color}`;
    if (!this.fogPats.has(key)) {
      const c = toCanvas(fogBmp(level, color)) as HTMLCanvasElement;
      this.fogCanvas.set(key, c);
      this.fogPats.set(key, ctx.createPattern(c, 'repeat'));
    }
    return this.fogPats.get(key) ?? null;
  }
  /**
   * 地表附近的霧（世界 transform 下呼叫）：每欄依地面高度畫 3 條帶（離地 0–5 / 5–11 / 11–19 格，越近越濃）；
   * 相鄰同高的欄合併成一個矩形。intensity 0..1 決定濃度階。
   */
  drawFog(ctx: CanvasRenderingContext2D, world: World, camX: number, camY: number, vw: number, vh: number, intensity: number, light: number): void {
    if (intensity <= 0.05) return;
    const color = light > 0.66 ? '#b4b9c8' : light > 0.33 ? '#707490' : '#2c2838';
    const k = Math.max(0, Math.min(1, intensity));
    const levels = [0.3 * k, 0.18 * k, 0.08 * k].map((l) => Math.round(l * 16) / 16);
    const bands: [number, number][] = [[-3, 1], [-6, -3], [-10, -6]];
    // 霧帶隨時間緩緩橫移（圖樣以世界座標錨定 + 位移）
    this.fogDrift += 0.12;
    const m = new DOMMatrix([1, 0, 0, 1, Math.round(this.fogDrift) % 64, 0]);
    const tx0 = Math.floor(camX / S), tx1 = Math.ceil((camX + vw) / S);
    for (let b = 0; b < 3; b++) {
      if (levels[b] <= 0) continue;
      const pat = this.fogPat(ctx, levels[b], color);
      if (!pat) continue;
      pat.setTransform(m);
      ctx.fillStyle = pat;
      let runX = tx0, runG = this.top(world, tx0);
      const flush = (xEnd: number): void => {
        const y0 = (runG + bands[b][0]) * S, y1 = (runG + bands[b][1]) * S;
        if (y1 < camY || y0 > camY + vh) return;
        ctx.fillRect(runX * S, y0, (xEnd - runX) * S, y1 - y0);
      };
      for (let x = tx0 + 1; x <= tx1; x++) {
        const g = x <= tx1 - 1 ? this.top(world, x) : -9999;
        if (g === runG) continue;
        flush(x);
        runX = x; runG = g;
      }
    }
  }

  // ── 睡覺淡出 ──
  drawSleep(ctx: CanvasRenderingContext2D, fade: number, W: number, H: number): void {
    const lv = Math.round(Math.max(0, Math.min(1, fade)) * 4);
    if (!lv) return;
    if (lv >= 4) { ctx.fillStyle = '#0c0a12'; ctx.fillRect(0, 0, W, H); return; }
    if (!this.sleepCanvas.length) {
      for (let k = 1; k <= 3; k++) this.sleepCanvas.push(toCanvas(ditherBmp(k / 4, '#0c0a12')) as HTMLCanvasElement);
      this.sleepPats = this.sleepCanvas.map((c) => ctx.createPattern(c, 'repeat'));
    }
    const pat = this.sleepPats[lv - 1];
    if (!pat) return;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
  }
  clear(): void { this.drops.length = 0; this.splash.length = 0; this.leaves.length = 0; }
  get dropCount(): number { return this.drops.length; }
}
