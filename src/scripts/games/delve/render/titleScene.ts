// titleScene.ts — 標題畫面背後的即時場景（遊戲自己的引擎 + 渲染器）：
//   開場鏡頭從天空慢慢沉到地表下，穿過一條掛著繩梯的豎井，停在一座精心佈置的洞窟：
//   火把、水晶簇、螢光菇、熔岩池與水池的光，主角在裡面揮鎬敲鐵礦（敲碎了過一會兒長回來）。
//   晝夜跟著現實時間、季節跟著現實月份、天氣依世界天氣表；按任意鍵可以跳過下降。
// 便宜：小世界、較大的美術像素、direct 模式（CSS 放大）、光照每 20 幀才重算；每幀量測，超過預算就隔幀畫；
// 分頁隱藏時停；prefers-reduced-motion 直接停在最後的構圖、只畫一張。
import { DelveGame } from '../engine/game';
import { FIXED_DT, TILE_SIZE } from '../engine/constants';
import { T, W } from '../engine/tiles';
import { LIQ } from '../engine/liquidKind';
import { Renderer } from './renderer';
import { FixedStepper } from './model';
import { descentY, focusFor, realDate } from './titleModel';
import { bayer } from './pixel';
import { LIVE } from './live';

/** 精選的種子 / 世界大小（小世界：生成快） */
export const TITLE_SEED = 'delve-title-7';
const WORLD = { width: 360, height: 240 };
/** 開場下降秒數 */
export const DESCENT_S = 4.5;
/** 每幀預算（ms）：超過就降成隔幀 / 每三幀畫一次 */
const BUDGET_MS = 3;
/** 標題背景的短邊美術 px（遊戲是 ~520；這裡放大一些） */
const TARGET_SHORT = 270;
/** 洞窟大小（格） */
const CAVE_W = 34, CAVE_H = 9;

export interface TitleSceneOptions {
  reducedMotion: boolean;
  /** 現在時間（測試 / 截圖用；預設 new Date()） */
  now?: Date;
}

interface Showcase { cx: number; top: number; floor: number; surf: number; ore: { x: number; y: number }[]; }

export class TitleScene {
  readonly game: DelveGame;
  readonly renderer: Renderer;
  private raf = 0;
  private last = 0;
  private t = 0;
  private running = false;
  private destroyed = false;
  private every = 1;
  private skip = 0;
  private ema = 0;
  private regrow = 0;
  private readonly stepper = new FixedStepper(FIXED_DT, 0.25);
  private readonly ro: ResizeObserver | null;
  private readonly cam = { x: 0, y: 0 };
  private readonly show: Showcase;
  /** 抖動暗角（不透明像素；離焦點越遠越密），蓋在場景上：字標 / 選單那側較暗、主角那裡清楚 */
  private vignette: HTMLCanvasElement | null = null;
  /** 量測：最近的平均 / 最大每幀耗時（ms）、畫了幾幀 */
  readonly perf = { avgMs: 0, maxMs: 0, frames: 0 };

  constructor(readonly canvas: HTMLCanvasElement, private readonly opts: TitleSceneOptions) {
    const g = new DelveGame({ seed: TITLE_SEED, ...WORLD, peaceful: true });
    this.game = g;
    LIVE.scenes++;
    const rd = realDate(opts.now ?? new Date());
    g.setDate({ year: 1, season: rd.season, day: rd.day, hour: rd.hour });
    this.show = buildShowcase(g);
    const r = new Renderer(canvas, g, { direct: true });
    r.lightEvery = 6;
    r.camOverride = this.cam;
    r.showCursor = false;
    r.plainBackdrop = true;
    this.renderer = r;
    if (opts.reducedMotion) this.t = DESCENT_S;
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
    // 觀察外層（canvas 自己的 CSS 尺寸由這裡設定，觀察它會自己觸發自己）
    this.ro?.observe(canvas.parentElement ?? canvas);
    this.resize();
    document.addEventListener('visibilitychange', this.onVis);
  }

  /** 下降結束了沒 */
  get landed(): boolean { return this.t >= DESCENT_S; }
  /** 跳過開場下降（按任意鍵開始時） */
  skipIntro(): void {
    if (this.t >= DESCENT_S) return;
    this.t = DESCENT_S;
    this.renderer.lightEvery = 20;
    if (!this.running || this.opts.reducedMotion) this.drawOnce();
  }

  private readonly onVis = (): void => {
    if (document.hidden) this.pause();
    else if (this.running) this.loop();
  };

  resize(): void {
    if (this.destroyed) return;
    const rr = this.renderer, dpr = window.devicePixelRatio || 1;
    const cw = window.innerWidth, ch = window.innerHeight;
    // 美術像素比遊戲大一些（短邊約 TARGET_SHORT 美術 px）：畫面更有「標題插畫」感，也更便宜
    const base = Math.max(1, Math.round(Math.min(cw, ch) * dpr / TARGET_SHORT));
    rr.zoomOffset = 0;
    rr.resize(cw, ch, dpr);
    rr.zoomOffset = Math.max(0, base - rr.scale);
    rr.resize(cw, ch, dpr);
    // direct 模式：canvas = 低解析緩衝，CSS 尺寸設成整數倍放大後的大小（超出畫面的部分裁掉）
    this.canvas.style.setProperty('--cw', `${(rr.bufW * rr.scale) / dpr}px`);
    this.canvas.style.setProperty('--ch', `${(rr.bufH * rr.scale) / dpr}px`);
    rr.invalidateAll();
    this.vignette = makeVignette(rr.bufW, rr.bufH, focusFor(cw, ch));
    if (this.opts.reducedMotion || !this.running) this.drawOnce();
  }

  /** 場景畫完後蓋上暗角（direct 模式：直接畫在畫布上） */
  private postFx(): void {
    const v = this.vignette;
    if (!v) return;
    const ctx = this.renderer.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(v, 0, 0);
  }

  /** 開始動畫（reduced motion：只畫一張） */
  start(): void {
    if (this.destroyed) return;
    this.running = true;
    if (this.opts.reducedMotion) { this.drawOnce(); return; }
    this.loop();
  }

  private loop(): void {
    if (this.raf || this.destroyed || this.opts.reducedMotion) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private pause(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private drawOnce(): void {
    // 靜態畫面：讓液體 / 主角先落定幾刻再畫
    for (let i = 0; i < 30; i++) this.game.step(FIXED_DT);
    this.game.drainEvents();
    this.place();
    this.renderer.render(0);
    this.postFx();
  }

  /** 鏡頭：洞窟中心落在畫面焦點；開場從「地表在畫面下方」的天空沉下來，之後微微左右晃 */
  private place(): void {
    const S = TILE_SIZE, r = this.renderer, vw = r.bufW, vh = r.bufH, sh = this.show;
    const f = focusFor(window.innerWidth, window.innerHeight);
    const fx = (sh.cx + 0.5) * S, fy = (sh.top + CAVE_H / 2) * S;
    // 起點：地表在畫面 72% 的高度（第一格就看得到地面、樹與遠山），再沉進洞窟
    const y1 = Math.round(fy - vh * f.y), y0 = Math.round(sh.surf * S - vh * 0.72);
    const drift = this.t > DESCENT_S ? Math.round(Math.sin((this.t - DESCENT_S) * 0.18) * 10) : 0;
    this.cam.x = Math.round(fx - vw * f.x) + drift;
    this.cam.y = descentY(this.t, Math.min(y0, y1), y1, DESCENT_S);
  }

  /** 主角持續敲鐵礦：敲碎了 1.6 秒後長回來 */
  private mine(dt: number): void {
    const g = this.game, w = g.world;
    const target = this.show.ore.find((o) => w.getFg(o.x, o.y) === T.IRON_ORE);
    if (target) { g.setAim(target.x, target.y); g.setUse(true); this.regrow = 0; return; }
    g.setUse(false);
    this.regrow += dt;
    if (this.regrow > 1.6) { for (const o of this.show.ore) w.setFg(o.x, o.y, T.IRON_ORE); this.regrow = 0; }
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (this.destroyed || !this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    // 超過預算：隔幀 / 每三幀畫一次（時間照樣累加）
    if (++this.skip < this.every) return;
    const fdt = Math.min(0.25, dt * this.skip);
    this.skip = 0;
    this.last = now;
    const t0 = performance.now();
    const was = this.t;
    this.t += fdt;
    if (was < DESCENT_S && this.t >= DESCENT_S) this.renderer.lightEvery = 20;
    const g = this.game, n = this.stepper.advance(fdt);
    for (let i = 0; i < n; i++) { this.mine(FIXED_DT); g.step(FIXED_DT); }
    for (const e of g.drainEvents()) this.renderer.onEvent(e);
    g.hp = g.maxHp();
    this.place();
    this.renderer.render(fdt);
    this.postFx();
    const ms = performance.now() - t0;
    this.ema = this.ema ? this.ema * 0.9 + ms * 0.1 : ms;
    this.every = this.ema > BUDGET_MS * 2 ? 3 : this.ema > BUDGET_MS ? 2 : 1;
    const p = this.perf;
    p.frames++;
    p.avgMs = this.ema;
    p.maxMs = Math.max(p.maxMs * 0.995, ms);
  };

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    LIVE.scenes--;
    this.running = false;
    this.pause();
    this.ro?.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
    this.canvas.style.removeProperty('--cw');
    this.canvas.style.removeProperty('--ch');
    this.renderer.destroy();
  }
}

/**
 * 佈置展示洞窟：地表下 3 格開一座 CAVE_W×CAVE_H 的洞（邊緣不規則），石頭背牆、石地板；
 * 從地表往下一條 3 格寬的豎井（中間掛繩梯），讓開場鏡頭「穿過地表」；
 * 洞裡：火把、天花板水晶簇、地上螢光菇、右邊熔岩池、左邊水池、主角站在中間偏左敲兩格鐵礦。
 */
function buildShowcase(g: DelveGame): Showcase {
  const w = g.world;
  const cx = Math.floor(w.width * 0.55);
  const x0 = cx - CAVE_W / 2, x1 = cx + CAVE_W / 2;
  let surf = 0, surfMin = Infinity;
  for (let x = x0 - 2; x <= x1 + 2; x++) { surf = Math.max(surf, w.surfaceAt(x)); surfMin = Math.min(surfMin, w.surfaceAt(x)); }
  const top = surf + 3, floor = top + CAVE_H; // floor = 地板第一列（實心）
  const rough = (x: number, k: number): number => Math.round(Math.sin(x * 0.9 + k) * 0.8 + Math.sin(x * 0.37 + k * 2) * 0.9);
  for (let x = x0 - 3; x <= x1 + 3; x++) {
    for (let y = top - 3; y <= floor + 40; y++) {
      w.setLiquid(x, y, 0, 0);
      const edge = x < x0 || x >= x1;
      const ceil = top + Math.max(0, rough(x, 1));
      w.setFg(x, y, !edge && y >= ceil && y < floor ? T.AIR : T.STONE);
      w.setWall(x, y, W.STONE_WALL);
    }
  }
  // 豎井：地表 → 洞頂，中間掛繩
  const sx = cx + 6;
  for (let y = Math.max(1, surfMin - 6); y < floor; y++) {
    for (let x = sx - 1; x <= sx + 1; x++) {
      if (y < w.surfaceAt(x)) continue;
      w.setFg(x, y, T.AIR);
      if (y < top) w.setWall(x, y, W.DIRT_WALL);
    }
    if (y >= w.surfaceAt(sx)) w.setFg(sx, y, T.ROPE);
  }
  // 熔岩池（右）、水池（左）：地板挖 2 格深
  const pool = (px0: number, px1: number, type: number): void => {
    for (let x = px0; x <= px1; x++) {
      for (let y = floor; y < floor + 2; y++) { w.setFg(x, y, T.AIR); w.setLiquid(x, y, 255, type); }
      w.setFg(x, floor + 2, type === LIQ.LAVA ? T.BASALT : T.STONE);
    }
  };
  pool(x1 - 6, x1 - 2, LIQ.LAVA);
  pool(x0 + 1, x0 + 4, LIQ.WATER);
  // 光源與裝飾
  const put = (x: number, y: number, id: number): void => { if (w.getFg(x, y) === T.AIR && w.getLiquid(x, y) === 0) w.setFg(x, y, id); };
  // 光源少而集中：明暗對比（兩支火把、三簇水晶、兩朵螢光菇、熔岩池）
  for (const x of [cx - 1]) put(x, floor - 1, T.TORCH);
  for (const x of [x0 + 6]) {
    for (let y = top; y < floor; y++) if (w.getFg(x, y) === T.AIR && w.isSolid(x, y - 1)) { w.setFg(x, y, T.CRYSTAL); break; }
  }
  for (const x of [x0 + 10]) put(x, floor - 1, T.GLOW_MUSHROOM);
  // 鐘乳石 / 石筍
  for (const x of [x0 + 3, x0 + 13, cx + 2, cx + 9, x1 - 3]) {
    for (let y = top; y < floor; y++) if (w.getFg(x, y) === T.AIR && w.isSolid(x, y - 1)) { w.setFg(x, y, T.STALACTITE); break; }
  }
  for (const x of [x0 + 12, cx + 4, cx + 11]) put(x, floor - 1, T.STALAGMITE);
  // 主角與鐵礦：主角站在洞中央偏左，左邊兩格高的鐵礦柱
  const px = cx - 4;
  const ore = [{ x: px - 2, y: floor - 1 }, { x: px - 2, y: floor - 2 }];
  for (const o of ore) w.setFg(o.x, o.y, T.IRON_ORE);
  g.teleport(px, floor - 1);
  g.give('iron_pickaxe', 1);
  const slot = g.inventory.slots.findIndex((s) => s?.item === 'iron_pickaxe');
  if (slot >= 0 && slot < 10) g.selectSlot(slot);
  // 生成階段的修改不算玩家修改
  w.drainDirty();
  g.liquids.wakeAll();
  return { cx, top, floor, surf: surfMin, ore };
}

/** 抖動暗角：以焦點為中心的橢圓距離，越遠 Bayer 門檻越高 → 暗點越密（最外圈約 70% 覆蓋），頂端再加一點（字標底） */
function makeVignette(w: number, h: number, f: { x: number; y: number }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.createImageData(w, h), px = new Uint32Array(img.data.buffer);
  const DARK = 0xff120a0c; // #0c0a12
  const fx = f.x * w, fy = f.y * h, rx = w * 0.62, ry = h * 0.75;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - fx) / rx, dy = (y - fy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      // 三階（0 / 25% / 50%）：規則的抖動圖樣，不是零星雜點
      const t = d < 0.8 ? 0 : d < 1.05 ? 0.25 : 0.5;
      if (bayer(x, y) < t) px[y * w + x] = DARK;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
