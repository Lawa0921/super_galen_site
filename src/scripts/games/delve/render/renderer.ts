// renderer.ts — Canvas2D 場景（全部以原生美術解析度畫進低解析緩衝，最後整數倍放大貼到螢幕）：視差背景 → 地下暗紋 → chunk 快取（牆 + 自動接邊前景 + 材質滲透 + 草葉）
// → 樹 / 火把（動態）→ 掉落物 / 怪物 → 玩家（分件精靈）→ 液體圖層（每幀、抖動半透、熔岩光暈）→ 裂痕 / 游標 → 呼吸泡泡
// → 粒子（含濺水 / 蒸氣 / 火焰）→ 彩色光照遮罩（multiply；亮度 8 階 + 階界 Bayer 抖動、色相吸附）→ 暗處怪物剪影 → 火光暈。
import type { DelveGame, DelveEvent } from '../engine/game';
import { BLOCKS_LIGHT_LUT, T, isSolidTile, isDecor } from '../engine/tiles';
import { ITEMS, type ItemId } from '../engine/items';
import { TILE_SIZE, CHUNK, DAY_LENGTH } from '../engine/constants';
import { buildAtlas, perpMask, type Atlas } from './textures';
import { ChunkLRU, cameraFocus, chunksTouchRect, followCamera, nearRect, visibleChunks, type Cam, type TileRect } from './model';
import { CORNER, EDGE, blendOverlay, decorStyle, edgeMask, innerCornerMask, type Neighbor } from './autotile';
import { armAngles, carryArm, carryStyle, flameFrame, heldCarryArm, heldOverFace, heldOverHead, swingAngle, SWING_RATE, type PoseKind } from './anim';
import { FW, FH, Sprites } from './sprites';
import { PlayerAnimator, atRopeTop, blinkAt, type PlayerAnim } from './playerAnim';
import { MANTLE_KNEE_X, ROPE_HAND_HI, SHEET, type SheetAnim } from './avatarArt';
import { previewArms } from './dollPreview';
import { CombatLayer } from './combatDraw';
import { LevelFx } from './levelFx';
import { aimArmDeg, attackArmDeg, spearThrust } from './combatAnim';
import { Background } from './background';
import { scanTrees, torchMount, treeKind, TREE_KIND } from './scene';
import { bufferSize, clampZoom, floatTextScale, snapCam, zoomScale } from './lowres';
import { ambientReach, depthSurfaceAt, type LightMap, type PointLight } from '../engine/lighting';
import { shadeTiles, LightFiller, rectCovers, depthCurve, AMBIENT_R, type ShadeRect } from './lightShade';
import { AmbientField, ambientKind, AMBIENT_GLOWS, type AmbientKind } from './ambient';
import { LiquidLayer } from './liquidDraw';
import { LIQ } from '../engine/liquidKind';
import { dayIndexOf, seasonBlend } from '../engine/calendar';
import { fallColors, grassLook, grassLookChanges, leafColors, leafFall, treeLook } from './seasonLook';
import { FloraAtlas, iceBmp } from './seasonArt';
import { decorStyleAt } from './decorPick'; // [polish]
import { tileVariant } from './tileFamily'; // [polish]
import { WeatherFx, type Canopy } from './weatherFx';
import { lootGlyphScale } from './lootArt';
import { toCanvas } from './pixel';
import { bobberBmp, campfireBmp } from './fishArt';
import { SettleLayer } from './settleDraw'; // [settle]
import { FolkLayer } from './folkDraw';

const S = TILE_SIZE;
const CPX = CHUNK * S;
/** 每幀最多重畫幾個「已在快取裡」的 dirty chunk（看得到但沒快取的一律立即畫） */
const REDRAW_BUDGET = 4;
const LIGHT_EVERY = 4;
/** 光照重算每幀最多花這麼多毫秒（超過就留到下一幀繼續填；畫面沒被遮罩蓋滿時例外：當幀填完） */
const LIGHT_BUDGET_MS = 1.6;
/** 光照遮罩每格 tile 切幾格（16 / 8 = 每格 2 美術 px） */
const LSUB = 8;
const SIDE_D: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/** 液體反應（蒸氣 / 嘶聲）只在畫面往外這麼多格內才放粒子 / 音效、觸發光照重算 */
export const REACTION_MARGIN = 12;
/** 光照視窗外這麼多格內的 tile 變動才需要重算光照（光源半徑） */
const LIGHT_MARGIN = 12;

/** 游標四角：(是否右側, 是否下側, 水平延伸方向, 垂直延伸方向) */
const CURSOR_CORNERS: [number, number, number, number][] = [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]];

/**
 * 光照遮罩的一組像素緩衝（multiply 光色 + 'lighter' 暗色補色的 ImageData 與 Uint32 視圖）。
 * 兩組緩衝輪流分幀填色，畫布只有一組：填完才 putImageData 上去（畫布不會在填色中途被清掉 / 改尺寸）。
 */
interface LightSet { img: ImageData | null; pix: Uint32Array; dimg: ImageData | null; dpix: Uint32Array; }
function makeLightSet(): LightSet { return { img: null, pix: new Uint32Array(0), dimg: null, dpix: new Uint32Array(0) }; }
/** 分幀中的光照重算：寫進哪一組、引擎光照、遮罩矩形、已花的時間 */
interface LightJob { set: LightSet; L: LightMap; rect: ShadeRect; ms: number; frames: number; fillMs: number; }

interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; /** 重力（預設 700；蒸氣 / 泡泡為負） */ g?: number; size?: number; }
/** 濺起的水花色（色票） */
const SPLASH: Record<number, string[]> = {
  [LIQ.WATER]: ['#cceaf8', '#94c8ee', '#5c9ce0', '#ffffff'],
  [LIQ.LAVA]: ['#ffd86a', '#ffa93a', '#e8701c', '#fff4c0'],
  [LIQ.HONEY]: ['#ffd86a', '#ffa93a', '#e8701c', '#fff4c0'],
};

export interface RenderStats {
  chunksDrawn: number; cached: number; liquidCells: number; liquidMs: number;
  /** 光照：整次重算 / 其中引擎 / 填像素 / putImageData（毫秒） */
  lightMs: number; lightEngineMs: number; lightFillMs: number; lightPutMs: number;
  /** 上一次光照重算分散到幾幀 */
  lightFrames: number;
}
/** 上一幀各階段耗時（ms；效能剖析用，原地更新不配置） */
export interface RenderPhases { bg: number; chunks: number; sprites: number; liquid: number; fx: number; light: number; over: number; blit: number; }

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
  stats: RenderStats = { chunksDrawn: 0, cached: 0, lightMs: 0, lightEngineMs: 0, lightFillMs: 0, lightPutMs: 0, lightFrames: 0, liquidCells: 0, liquidMs: 0 };
  readonly phases: RenderPhases = { bg: 0, chunks: 0, sprites: 0, liquid: 0, fx: 0, light: 0, over: 0, blit: 0 };
  private tp = 0;
  /** 距上次 lap 的毫秒數 */
  private lap(): number { const n = performance.now(), d = n - this.tp; this.tp = n; return d; }
  /** 液體圖層（不進 chunk 快取） */
  readonly liquidLayer = new LiquidLayer();
  /** debug：不畫光照遮罩（文件截圖用） */
  fullbright = false;
  /** 標題畫面背景：鏡頭由外部指定（世界 px，左上角），不跟玩家；不畫玩家 */
  camOverride: Cam | null = null;
  hidePlayer = false;
  /** 畫瞄準游標（標題背景關掉） */
  showCursor = true;
  /** 遠景不做生態區交界混色（標題背景的大像素下，混色的抖動圖樣像雜訊） */
  plainBackdrop = false;
  /** 光照每幾幀重算一次（標題背景鏡頭很慢，可以拉長） */
  lightEvery = LIGHT_EVERY;
  /** 世界 chunk 有變動（小地圖快取跟著重畫） */
  onWorldDirty: ((cis: number[]) => void) | null = null;
  /** 環境粒子 */
  readonly ambient = new AmbientField();
  ambientNow: AmbientKind | null = null;
  /** 戰鬥圖層（掉落物 / 怪物 / 投射物 / 飄字 / 震動） */
  readonly combat: CombatLayer;
  /** [settle] 據點圖層：居民、查房模式、放置預覽 */
  readonly settleLayer: SettleLayer;
  /** 世界 NPC：村民 / 矮人 / 旅人 / 受困探險者 */
  readonly folkLayer: FolkLayer;
  /** 等級系統的世界特效（升級光柱 / 突進 / 震地 / 尋礦感知） */
  readonly levelFx: LevelFx;
  /** 季節植物（草葉 / 花 / 高草 × 四季 × 擺動）與冰面 */
  readonly flora = new FloraAtlas();
  private ice: HTMLCanvasElement[] = [0, 1, 2].flatMap((v) => [toCanvas(iceBmp(v, false)) as HTMLCanvasElement, toCanvas(iceBmp(v, true)) as HTMLCanvasElement]);
  /** 雨 / 雪 / 霧 / 落葉 / 睡覺淡出 */
  readonly fx = new WeatherFx();
  /** chunk 快取裡的草皮是哪一天的季節外觀（換日 → 重畫） */
  private seasonDay = -1;
  private canopies: Canopy[] = [];
  /** 正在打的閃電（世界 px 的 x、形狀種子） */
  private bolt: { x: number; seed: number } | null = null;
  private boltN = 0;
  private lastFlash = 0;
  /** 釣魚：浮標、營火火焰（3 格動畫）、竿尖位置（世界 px；畫釣線用） */
  private bobber = toCanvas(bobberBmp()) as HTMLCanvasElement;
  private campfires = [0, 1, 2].map((f) => toCanvas(campfireBmp(f)) as HTMLCanvasElement);
  private rodTip: { x: number; y: number } | null = null;

  private cache: ChunkLRU<HTMLCanvasElement>;
  private pool: HTMLCanvasElement[] = [];
  private pending = new Set<number>();
  private buf: HTMLCanvasElement = document.createElement('canvas');
  private bctx: CanvasRenderingContext2D;
  /** 光照遮罩兩組（multiply 光色 + 'lighter' 暗色補色）：一組顯示、另一組分幀填色，填完互換 */
  private lightSets: [LightSet, LightSet] = [makeLightSet(), makeLightSet()];
  private lightCanvas = document.createElement('canvas');
  private darkCanvas = document.createElement('canvas');
  private lightCtx = this.lightCanvas.getContext('2d');
  private darkCtx = this.darkCanvas.getContext('2d');
  private front = 0;
  /** 分幀進行中的光照重算（null = 沒有） */
  private job: LightJob | null = null;
  private filler = new LightFiller();
  private readonly now = (): number => performance.now();
  /** 每格最終光色（3 float / 格） */
  private lightA = new Float32Array(0);
  /** 輪廓微光可照的格 */
  private reach = new Uint8Array(0);
  /** 目前顯示的遮罩對應的引擎光照（暗處剪影用） */
  private lastLight: LightMap | null = null;
  /** 目前顯示的遮罩（tile 矩形） */
  private light: ShadeRect | null = null;
  private extraLights: PointLight[] = [];
  /** 每幀重用的畫面矩形 / 光源清單 / 亮度查詢（不在每幀配置新物件） */
  private viewBox = { x: 0, y: 0, w: 0, h: 0 };
  private readonly lightAtFn = (tx: number, ty: number): number => this.lightAt(tx, ty);
  private lightView = { x: 0, y: 0, w: 0, h: 0 };
  private lightAge = 999;
  private lightDirty = true;
  private frame = 0;
  private clock = 0;
  private particles: Particle[] = [];
  private walkPhase = 0;
  private swingPhase = 0;
  private snapNext = true;
  private viewed = false;
  private bg: Background;
  private torchesSeen: { x: number; y: number }[] = [];
  private coolSeen: { x: number; y: number }[] = [];
  /** 畫面上的水晶簇（光暈中心 + 變體：0 青 / 1 紫） */
  private crystalSeen: { x: number; y: number; v: number }[] = [];
  private glowSeen = { warm: this.torchesSeen, cool: this.coolSeen };
  /** 平均地表高度（世界 px），地下背景起點用 */
  private horizonPx: number;
  /** 地表高度前綴和（遠景地平線取鏡頭附近平均） */
  private surfSum: Float64Array;

  /**
   * opts.direct：直接畫在 canvas 上（canvas 大小 = 低解析緩衝），整數倍放大交給 CSS（image-rendering: pixelated）；
   * 省掉最後一次全螢幕放大貼圖（標題背景用）。
   */
  constructor(readonly canvas: HTMLCanvasElement, readonly game: DelveGame, opts: { direct?: boolean } = {}) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (opts.direct) this.buf = canvas;
    const bctx = opts.direct ? ctx : this.buf.getContext('2d', { alpha: false });
    if (!ctx || !bctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.bctx = bctx;
    this.atlas = buildAtlas();
    this.sprites = new Sprites((item) => this.atlas.iconBmp(item));
    this.combat = new CombatLayer(game, this.atlas, this.sprites);
    this.settleLayer = new SettleLayer(game, this.atlas); // [settle]
    this.folkLayer = new FolkLayer(game);
    this.levelFx = new LevelFx(game);
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
    this.zoomOffset = clampZoom(this.zoomOffset, dw, dh, this.dpr);
    this.scale = zoomScale(dw, dh, this.zoomOffset, this.dpr);
    const b = bufferSize(dw, dh, this.scale);
    this.bufW = b.w; this.bufH = b.h;
    this.buf.width = b.w; this.buf.height = b.h;
    this.zoom = this.scale / this.dpr;
    this.combat.numScale = floatTextScale(this.viewW, this.zoom);
    this.combat.lootScale = lootGlyphScale(this.zoom);
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
    return zoomScale(dw, dh, 0, this.dpr) / this.dpr;
  }
  /** 目前視野大小（格） */
  viewTiles(): { w: number; h: number } { return { w: Math.round(this.bufW / S), h: Math.round(this.bufH / S) }; }

  worldViewW(): number { return this.bufW; }
  worldViewH(): number { return this.bufH; }

  /** CSS px（相對 canvas）→ 世界 px（以畫面上實際看到的對齊後鏡頭換算） */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.drawCam.x + sx / this.zoom, y: this.drawCam.y + sy / this.zoom };
  }

  /** [settle] 世界 px → CSS px（相對 canvas；DOM 標籤定位用） */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.drawCam.x) * this.zoom, y: (wy - this.drawCam.y) * this.zoom };
  }
  snapCamera(): void { this.snapNext = true; }
  invalidateAll(): void {
    for (const k of this.cache.keys()) this.pending.add(k);
    this.lightDirty = true;
  }

  /** 遊戲事件 → 粒子 / 光照重算 */
  onEvent(e: DelveEvent): void {
    this.combat.onEvent(e);
    this.levelFx.onEvent(e);
    if (e.type === 'respawn') this.snapCamera();
    if (e.type === 'hurt' && !e.cause) this.hurtAt = this.clock;
    if (e.type === 'climb') this.climbDust(e.phase !== 'grab', e.phase === 'mantle' ? e : null);
    if (e.type === 'lightning') { this.bolt = { x: e.x * S + S / 2, seed: ++this.boltN }; this.lightDirty = true; }
    if (e.type === 'mine' && e.tile === T.ICE) this.fx.invalidate(this.game.world, [this.game.world.chunkIndex(Math.floor(e.x / CHUNK), Math.floor(e.y / CHUNK))]);
    if ((e.type === 'mine' || e.type === 'place') && this.nearView(e.x, e.y, LIGHT_MARGIN)) this.lightDirty = true;
    if (e.type === 'splash') this.burst(e.x, e.y, e.big ? 16 : 9, SPLASH[e.liquid] ?? SPLASH[LIQ.WATER], e.big ? 260 : 170);
    if (e.type === 'liquidtool') this.burst((e.x + 0.5) * S, (e.y + 0.5) * S, 7, SPLASH[e.liquid] ?? SPLASH[LIQ.WATER], 130);
    if (e.type === 'liquid' && this.nearView(e.x, e.y)) {
      // 反應：一團往上飄的蒸氣（灰白），黑曜石 / 酥蜜塊另外噴一點碎屑（畫面外的反應不畫、不重算光照）
      for (let i = 0; i < 10; i++) {
        this.particles.push({ x: (e.x + Math.random()) * S, y: (e.y + 0.3) * S, vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 50,
          life: 0.7 + Math.random() * 0.6, color: i % 3 === 0 ? '#ffffff' : '#b4b9c8', g: -40, size: i % 2 ? 2 : 1 });
      }
      this.lightDirty = true;
    }
    if (e.type === 'bubble') {
      const p = this.game.player;
      for (let i = 0; i < 2; i++) this.particles.push({ x: p.x + p.w / 2 + (this.game.facing * 6) + i * 2, y: p.y + 8, vx: (Math.random() - 0.5) * 20, vy: -40, life: 1.1, color: '#cceaf8', g: -60, size: 1 });
    }
    if (e.type === 'mine') {
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

  /** 目前畫面（tile 座標）；還沒畫過第一幀時 null */
  viewRect(): TileRect | null {
    if (!this.viewed) return null;
    return { x: Math.floor(this.drawCam.x / S), y: Math.floor(this.drawCam.y / S), w: Math.ceil(this.bufW / S) + 1, h: Math.ceil(this.bufH / S) + 1 };
  }
  /** tile (x,y) 是否在畫面附近（音效 / 粒子用）；還沒畫過第一幀時一律 true */
  nearView(x: number, y: number, margin = REACTION_MARGIN): boolean {
    const r = this.viewRect();
    return !r || nearRect(x, y, r, margin);
  }

  render(dt: number): void {
    const g = this.game, w = g.world, ph = this.phases;
    this.tp = performance.now();
    this.frame++;
    this.clock += dt;
    const worldW = w.width * S, worldH = w.height * S;
    const vw = this.worldViewW(), vh = this.worldViewH();
    const pc = g.playerCenter();
    this.cam = this.camOverride
      ? { x: Math.max(0, Math.min(worldW - vw, this.camOverride.x)), y: Math.max(0, Math.min(worldH - vh, this.camOverride.y)) }
      : followCamera(this.cam, cameraFocus(pc, vw, vh), vw, vh, worldW, worldH, dt, this.snapNext);
    this.snapNext = false;
    // 繪製時對齊整數美術 px：精靈 / chunk / 視差層都落在像素格上，不會閃爍
    this.drawCam = snapCam(this.cam);
    const sh = this.combat.shakeOffset(dt);
    this.drawCam = { x: this.drawCam.x + sh.x, y: this.drawCam.y + sh.y };
    this.viewed = true;
    g.viewHalf = { w: Math.ceil(vw / S / 2), h: Math.ceil(vh / S / 2) };
    const camX = this.drawCam.x, camY = this.drawCam.y;

    const dirty = w.drainDirty();
    for (const ci of dirty) this.pending.add(ci);
    if (dirty.length) { this.onWorldDirty?.(dirty); this.fx.invalidate(w, dirty); }
    // 換日：結冰可能變了 → 天空高度重算；草 / 植物的季節外觀真的會變（換季的過渡期）才重畫 chunk：
    // 看得到的 chunk 這一幀全部重畫（不分批 → 不會新舊季節混在畫面上），看不到的直接丟出快取（進畫面時才畫新的）
    const today = dayIndexOf(g.time);
    let seasonFlush = false;
    if (today !== this.seasonDay) {
      if (this.seasonDay >= 0) {
        this.fx.invalidateAll();
        seasonFlush = grassLookChanges(this.seasonDay, today);
      }
      this.seasonDay = today;
    }
    const flash = g.flash();
    if (flash !== this.lastFlash) { this.lastFlash = flash; this.lightDirty = true; if (!flash) this.bolt = null; }
    // 液體變動只需要讓地圖重畫（液體圖層每幀畫，不碰 tile chunk 快取）
    const ldirty = w.drainLiquidDirty();
    if (ldirty.length) this.onWorldDirty?.(ldirty);
    // 只有「這一幀新變動、而且碰到光照視窗」的 chunk 才逼光照重算；
    // 留在 pending 裡等進畫面才重畫的畫面外 chunk 不算（以前會讓光照每幀重算）
    const lw = this.light;
    if (dirty.length && (!lw || chunksTouchRect(dirty, w.chunksX, { x: lw.x0, y: lw.y0, w: lw.w, h: lw.h }, LIGHT_MARGIN))) this.lightDirty = true;

    const ctx = this.bctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    let day = (g.time % DAY_LENGTH) / DAY_LENGTH;
    if (day < 0) day += 1;
    const sun = g.sun(), wx = g.localWeatherState();
    this.bg.draw(ctx, {
      viewW: this.bufW, viewH: this.bufH, camX, camY,
      horizonY: this.localHorizon(camX + vw / 2), time: g.time, dayFrac: day,
      biome: { a: w.biome[Math.max(0, Math.min(w.width - 1, Math.floor((camX + vw / 2) / S)))], b: 0, t: 0 },
      // 生態區交界：每層依鏡頭中心連續混合（標題背景不混）
      biomeCols: this.plainBackdrop ? undefined : w.biome, centerTile: (camX + vw / 2) / S,
      sunrise: sun.sunrise, sunset: sun.sunset, twilight: sun.twilight, moon: g.moon(),
      season: seasonBlend(g.time),
      weather: { kind: wx.kind, intensity: wx.intensity, flash, wind: g.wind() },
      // 遠方的閃電：依視差壓縮到畫面中段（±40 格的落雷大多看得到）
      bolt: this.bolt ? { x: vw / 2 + (this.bolt.x - (camX + vw / 2)) * 0.35, seed: this.bolt.seed } : null,
    });

    ctx.setTransform(1, 0, 0, 1, -camX, -camY);
    const surf = w.surface;
    this.bg.drawUnderground(ctx, camX, camY, vw, vh,
      (tx) => (surf[Math.max(0, Math.min(surf.length - 1, tx))] + 6) * S, S, (w.rockY || w.cavernY) * S, w.cavernY * S, w.moltenY ? w.moltenY * S : Infinity,
      { biome: w.biome, structures: g.structures }); // [polish] biome-specific backdrops
    ph.bg = this.lap();

    const r = visibleChunks(camX, camY, vw, vh, CPX, w.chunksX, w.chunksY);
    if (seasonFlush) {
      for (const k of this.cache.keys()) {
        const { cx, cy } = w.chunkCoords(k);
        if (cx >= r.cx0 && cx <= r.cx1 && cy >= r.cy0 && cy <= r.cy1) this.pending.add(k);
        else { const c = this.cache.get(k); if (c) this.pool.push(c); this.cache.delete(k); this.pending.delete(k); }
      }
      this.lightDirty = true;
    }
    let budget = seasonFlush ? Infinity : REDRAW_BUDGET, drawn = 0;
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
    ph.chunks = this.lap();

    this.drawFlora(ctx, camX, camY, vw, vh);
    this.drawTrees(ctx, camX, camY, vw, vh);
    this.drawTorches(ctx, camX, camY, vw, vh);
    const vb = this.viewBox;
    vb.x = camX; vb.y = camY; vb.w = vw; vb.h = vh;
    this.combat.drawWorld(ctx, vb, this.glowSeen);
    this.settleLayer.drawWorld(ctx, vb, this.clock); // [settle]
    this.folkLayer.drawWorld(ctx, vb, this.clock);
    this.drawPlayer(ctx, dt);
    ph.sprites = this.lap();
    const tl = performance.now();
    this.liquidLayer.draw(ctx, w, camX, camY, vw, vh, this.clock, this.torchesSeen);
    this.stats.liquidMs = performance.now() - tl;
    this.stats.liquidCells = this.liquidLayer.stats.cells;
    ph.liquid = this.lap();
    this.drawIce(ctx, camX, camY, vw, vh);
    this.drawFishing(ctx);
    this.drawMiningAndCursor(ctx);
    this.drawStatus(ctx, dt);
    this.drawParticles(ctx, dt);
    // 落葉 / 花瓣（受光照：畫在遮罩之前）
    this.fx.updateLeaves(dt, w, this.canopies, g.wind(), vb);
    this.fx.drawLeaves(ctx);
    // 雨 / 雪
    const precip = wx.kind === 'rain' || wx.kind === 'storm' ? 'rain' : wx.kind === 'snow' ? 'snow' : null;
    this.fx.update(dt, { world: w, camX, camY, vw, vh, kind: precip, storm: wx.kind === 'storm', intensity: wx.intensity, wind: g.wind(), light: g.skyLevel() });
    this.updateAmbient(dt, camX, camY, vw, vh);
    this.drawAmbient(ctx, false);
    ph.fx = this.lap();
    this.drawLight(ctx, camX, camY, vw, vh);
    ph.light = this.lap();
    if (!this.fullbright) { this.combat.drawDark(ctx, vb, this.lightAtFn); this.drawPlayerRim(ctx); }
    // 霧 / 雨雪畫在光照之後（夜裡也看得到，顏色依天空亮度分階）
    const lvl = this.fullbright ? 1 : g.skyLevel();
    if (wx.kind === 'fog') this.fx.drawFog(ctx, w, camX, camY, vw, vh, wx.intensity, lvl);
    this.fx.drawPrecip(ctx, lvl, wx.kind === 'storm');
    this.drawAmbient(ctx, true);
    this.drawRecall(ctx);
    this.drawGlows(ctx);
    this.combat.drawOverlay(ctx, dt);
    if (this.showCursor) this.settleLayer.drawOverlay(ctx, vb); // [settle]
    this.levelFx.draw(ctx, dt);
    // 睡覺：全畫面抖動淡出 / 淡入
    const sl = g.sleepFade();
    if (sl > 0) { ctx.setTransform(1, 0, 0, 1, 0, 0); this.fx.drawSleep(ctx, sl, this.bufW, this.bufH); }

    ph.over = this.lap();
    // 整數倍放大貼到螢幕：每個美術像素 = scale×scale 裝置像素
    const out = this.ctx;
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.imageSmoothingEnabled = false;
    if (this.buf !== this.canvas) out.drawImage(this.buf, 0, 0, this.bufW, this.bufH, 0, 0, this.bufW * this.scale, this.bufH * this.scale);
    ph.blit = this.lap();
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
        // 樹 / 火把 / 花 / 高草是每幀畫的動態精靈（季節外觀、隨風擺動）
        if (f === T.AIR || f === T.WOOD || f === T.LEAVES || f === T.TORCH || f === T.FLOWER || f === T.TALL_GRASS) continue;
        qx = x; qy = y;
        const s = isDecor(f) ? A.decor(f, decorStyleAt(f, x, y, nb, this.seasonDay, w.surface[x])) // [polish] cobweb corners + seasonal decor
          : f === T.GRASS ? A.grass(this.grassSeason(x, y, i), variant[i], masks[(y - y0) * CHUNK + (x - x0)])
          : A.tile(f, tileVariant(f, x, y, variant[i]), masks[(y - y0) * CHUNK + (x - x0)]); // [polish] stone/dirt families
        if (w.half[i]) { // [settle] 半格：上緣 4 列 + 下緣 4 列疊成下半格
          ctx.drawImage(img, s.sx, s.sy, S, 4, (x - x0) * S, (y - y0) * S + 8, S, 4);
          ctx.drawImage(img, s.sx, s.sy + 12, S, 4, (x - x0) * S, (y - y0) * S + 12, S, 4);
          continue;
        }
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
        // 一般草地的草葉改成每幀畫（季節 + 風），這裡只畫叢林草葉
        if (gt !== T.JUNGLE_GRASS) continue;
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
    const day = Math.max(0, this.seasonDay);
    this.canopies.length = 0;
    for (const t of trees) {
      const kind = treeKind(t.ground, t.variant);
      const r = Math.min(kind === TREE_KIND.JUNGLE ? 7 : 4, t.leafR);
      const look = treeLook(kind, t.x, day);
      const sp = this.sprites.tree(kind, t.baseY - t.topY + 1, r, t.grounded, look);
      const dx = t.x * S + S / 2 - sp.ax, dy = (t.baseY + 1) * S - sp.ay;
      if (dx > camX + vw || dx + sp.canvas.width < camX || dy > camY + vh || dy + sp.canvas.height < camY) continue;
      ctx.drawImage(sp.canvas, Math.round(dx), Math.round(dy));
      // 秋葉 / 春花：樹冠範圍（上半部）會飄落
      if (r > 0 && leafFall(look)) this.canopies.push({ x: dx + 6, y: dy, w: sp.canvas.width - 12, h: Math.max(8, 2 * (sp.canvas.height - (t.baseY - t.topY + 1) * S) + 2), colors: fallColors(look), dark: leafColors(look, kind)[1] ?? '#2a1810' });
    }
  }

  /**
   * 季節植物（每幀）：一般草地上方的草葉、花、高草——依每格的季節外觀挑圖、依風向與陣風挑擺動影格
   * （風小時大多不動；有風時整片往下風處偏，局部陣風來回擺）。
   */
  private drawFlora(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const g = this.game, w = g.world, W = w.width, fg = w.fg, F = this.flora, img = F.canvas;
    const tx0 = Math.max(0, Math.floor(camX / S)), tx1 = Math.min(W, Math.ceil((camX + vw) / S) + 1);
    const ty0 = Math.max(1, Math.floor(camY / S)), ty1 = Math.min(w.height, Math.ceil((camY + vh) / S) + 2);
    const day = Math.max(0, this.seasonDay), wind = g.wind(), t = this.clock;
    const gust = 0.3 + Math.abs(wind);
    const sway = (x: number, k: number): number => {
      const v = wind * 1.2 * k + Math.sin(t * 2.6 + x * 0.45) * 0.55 * gust * k;
      return v > 0.5 ? 1 : v < -0.5 ? -1 : 0;
    };
    for (let y = ty0; y < ty1; y++) {
      const row = y * W;
      for (let x = tx0; x < tx1; x++) {
        const f = fg[row + x];
        if (f === T.GRASS) {
          if (fg[row - W + x] !== T.AIR) continue;
          const s = F.blades(grassLook(x, day), w.variant[row + x], sway(x, 0.8));
          ctx.drawImage(img, s.sx, s.sy, S, S, x * S, (y - 1) * S, S, S);
        } else if (f === T.FLOWER || f === T.TALL_GRASS) {
          const style = decorStyle(f, x, y, (dx, dy) => w.getFg(x + dx, y + dy));
          const look = grassLook(x, day);
          const s = f === T.FLOWER ? F.flower(look, style, sway(x, 0.8)) : F.tallGrass(look, style, sway(x, 1));
          ctx.drawImage(img, s.sx, s.sy, S, S, x * S, y * S, S, S);
        }
      }
    }
  }

  /** 草皮的季節外觀：冬天只有露天的草才積雪（湖底 / 水下的草改用秋天的枯黃） */
  private grassSeason(x: number, y: number, i: number): number {
    const w = this.game.world;
    const look = grassLook(x, this.seasonDay < 0 ? 0 : this.seasonDay);
    if (look === 3 && y > 0 && w.liquid[i - w.width] > 0) return 2;
    return look;
  }

  /** 結冰的湖面（畫在液體圖層之上，蓋住那格的水） */
  private drawIce(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const w = this.game.world, W = w.width, F = w.frozen;
    const tx0 = Math.max(0, Math.floor(camX / S)), tx1 = Math.min(W, Math.ceil((camX + vw) / S) + 1);
    const ty0 = Math.max(0, Math.floor(camY / S)), ty1 = Math.min(w.height, Math.ceil((camY + vh) / S) + 1);
    for (let y = ty0; y < ty1; y++) {
      const row = y * W;
      for (let x = tx0; x < tx1; x++) {
        if (!F[row + x]) continue;
        const top = y === 0 || !F[row - W + x];
        ctx.drawImage(this.ice[(w.variant[row + x] % 3) * 2 + (top ? 1 : 0)], x * S, y * S);
      }
    }
  }

  private drawTorches(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const w = this.game.world, W = w.width, fg = w.fg;
    const tx0 = Math.max(0, Math.floor(camX / S) - 1), tx1 = Math.min(W, Math.ceil((camX + vw) / S) + 1);
    const ty0 = Math.max(0, Math.floor(camY / S) - 1), ty1 = Math.min(w.height, Math.ceil((camY + vh) / S) + 1);
    const seen = this.torchesSeen, cool = this.coolSeen, crys = this.crystalSeen, VAR = w.variant;
    seen.length = 0; cool.length = 0; crys.length = 0;
    const t = this.clock;
    for (let y = ty0; y < ty1; y++) {
      const row = y * W;
      for (let x = tx0; x < tx1; x++) {
        const f = fg[row + x];
        if (f === T.CRYSTAL) { crys.push({ x: x * S + 8, y: y * S + 8, v: VAR[row + x] & 1 }); continue; }
        if (f === T.GLOW_MUSHROOM) { cool.push({ x: x * S + 8, y: y * S + 9 }); continue; }
        if (f === T.CANDLE || f === T.LANTERN) { seen.push({ x: x * S + 8, y: y * S + (f === T.LANTERN ? 8 : 5) }); continue; }
        if (f === T.LANTERN_POST) { seen.push({ x: x * S + 8, y: y * S + 3 }); continue; }
        if (f === T.CAMPFIRE) { ctx.drawImage(this.campfires[flameFrame(t, x, y) % 3], x * S, y * S); seen.push({ x: x * S + 8, y: y * S + 8 }); continue; }
        // 熔岩石：只有外露在空氣下的那幾格發光暈（隔格取樣、有上限，避免整片深淵都是光暈）
        if (f === T.MAGMA_ROCK) {
          if (((x + y) & 1) === 0 && y > 0 && fg[row - W + x] === T.AIR && seen.length < 160) seen.push({ x: x * S + 8, y: y * S + 2 });
          continue;
        }
        if (f !== T.TORCH) continue;
        // 依支撐挑精靈：地板 / 背牆直立，貼左右牆的斜掛（底端貼牆）
        const mount = torchMount(y + 1 < w.height ? fg[row + W + x] : T.STONE, x > 0 ? fg[row + x - 1] : T.STONE, x + 1 < W ? fg[row + x + 1] : T.STONE);
        const fr = flameFrame(t, x, y), SP = this.sprites;
        const ox = mount === 'left' ? 0 : mount === 'right' ? 6 : 3;
        const c = mount === 'left' ? SP.torchesLeft[fr] : mount === 'right' ? SP.torchesRight[fr] : SP.torches[fr];
        ctx.drawImage(c, x * S + ox, y * S);
        seen.push({ x: x * S + ox + 5, y: y * S + 6 });
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
    if (!this.showCursor || !g.world.inBounds(x, y)) return;
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

  /** 玩家動畫狀態機（climb / hang / mantle / swim / hurt / dead …）；e2e 讀 playerAnim */
  private readonly animator = new PlayerAnimator();
  /** 最近一次受傷的時間（clock 秒） */
  private hurtAt = -99;
  /** 目前的玩家動畫（e2e / debug） */
  playerAnim: PlayerAnim = 'idle';
  /** 這一幀玩家畫在哪（光照遮罩之後補畫暗處輪廓光用）；沒畫 = null */
  private rimDraw: { cx: number; bottom: number; facing: number; fi: number; x: number; y: number; canvas: HTMLCanvasElement } | null = null;
  /** 動畫提示（換手 → 攀爬音效）；main.ts 接到音效 */
  onCue: ((cue: 'grip') => void) | null = null;

  /** 玩家中心欄這段繩子最上面那格的頂端（世界 px） */
  private ropeTopY(p: { x: number; y: number; w: number; h: number }): number {
    const w = this.game.world, tx = Math.floor((p.x + p.w / 2) / S);
    let ty = Math.floor((p.y + p.h - 0.01) / S);
    while (ty >= 0 && !w.isClimbable(tx, ty)) ty--;
    while (ty > 0 && w.isClimbable(tx, ty - 1)) ty--;
    return ty * S;
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, dt: number): void {
    const g = this.game, p = g.player, st = g.getState();
    this.rimDraw = null;
    if (this.hidePlayer) return;
    const SP = this.sprites;
    // 紙娃娃：樣子沒變（key 一樣）就沿用快取的影格表
    const doll = g.doll();
    SP.setDoll(doll.look, doll.key);
    const mt = st.player.mantle;
    const swim = st.liquid.frac > 0.55 && !p.onGround && !st.player.climbing;
    const an = this.animator.update({
      dt, dead: st.dead, climbing: st.player.climbing, mantle: mt ? mt.p : null, onGround: p.onGround, vx: p.vx, vy: p.vy,
      swim, sinceHurt: this.clock - this.hurtAt,
    });
    this.playerAnim = an.anim;
    if (an.cue === 'grip') this.climbDust(false);
    if (an.cue) this.onCue?.(an.cue);
    const atk = st.attack;
    if (mt) this.facing = mt.dir;
    else if (atk) this.facing = atk.dir;
    else if (!st.dead) {
      if (p.vx > 8) this.facing = 1; else if (p.vx < -8) this.facing = -1;
      if (st.mining) this.facing = (st.mining.x + 0.5) * S >= p.x + p.w / 2 ? 1 : -1;
      // 釣魚：面向浮標（拋竿時沿用遊戲的面向）
      else if (st.fishing) this.facing = Math.abs(st.fishing.x - (p.x + p.w / 2)) > 2 ? (st.fishing.x >= p.x + p.w / 2 ? 1 : -1) : st.facing;
    }
    this.elementSparks(doll.look, dt);
    this.swingPhase = st.mining ? (this.swingPhase + dt * SWING_RATE) % 1 : 0;
    // 受傷無敵時閃爍（倒地 / 縮身那一下不閃）
    if (!st.dead && st.iframes > 0 && an.anim !== 'hurt' && Math.floor(st.iframes * 16) % 2 === 1) return;
    const cx = Math.round(p.x + p.w / 2), bottom = Math.round(p.y + p.h + p.gfxOffY);
    const ox = -FW / 2, oy = -FH;
    // 爬到繩頂：舉高的那隻手以上沒有繩子了 → 換成兩手抓在胸口的繩頂影格
    let sheetAnim: SheetAnim = an.anim === 'idle' && blinkAt(this.clock) ? 'blink' : an.anim;
    let sheetFrame = an.frame;
    if (st.player.climbing && atRopeTop(an.anim, bottom + oy + ROPE_HAND_HI, this.ropeTopY(p))) { sheetAnim = 'ropetop'; sheetFrame = Math.floor(this.clock * 3) % 2; }
    const fi = SHEET[sheetAnim][0] + Math.min(sheetFrame, SHEET[sheetAnim][1] - 1);
    // 分幀烘焙：換裝那一幀只烘這一格 + 時間預算內的幾格（不會整張同步烘完卡住）
    const sheet = SP.dollSheet(fi);
    const meta = sheet.meta[fi];
    this.rimDraw = { cx, bottom, facing: this.facing, fi, x: ox + (meta.arms ? 0 : meta.ox ?? 0), y: oy, canvas: sheet.canvas };
    if (!meta.arms) {
      // 背面爬繩 / 掛著 / 倒地：手臂畫在影格裡，手上的東西收起來
      ctx.save(); ctx.translate(cx, bottom); ctx.scale(this.facing, 1);
      ctx.drawImage(sheet.canvas, fi * FW, 0, FW, FH, ox + (meta.ox ?? 0), oy, FW, FH);
      ctx.restore();
      this.rodTip = null;
      return;
    }
    const kind: PoseKind = an.anim === 'walk' || an.anim === 'jump' || an.anim === 'fall' ? an.anim : 'idle';
    const local = an.anim === 'walk' || an.anim === 'idle' ? an.frame : 0;
    const held = st.held ? st.held.item : null;
    const heldDef = held ? ITEMS[held] : null;
    let swing: number | null = st.mining ? swingAngle(this.swingPhase) : null;
    let blade: ItemId | null = null;
    let rot: { item: ItemId; base: number; push: number } | null = null;
    let throwMini: ItemId | null = null;
    if (atk) {
      swing = attackArmDeg(atk.kind, atk.progress, aimArmDeg(atk.angle, atk.dir));
      if (atk.kind === 'sword' || atk.kind === 'broadsword') blade = atk.item;
      else if (atk.kind === 'bow') rot = { item: atk.item, base: -Math.PI * 0.75, push: 0 };
      else if (atk.kind === 'staff') rot = { item: atk.item, base: -Math.PI / 4, push: 4 };
      else if (atk.kind === 'spear') rot = { item: atk.item, base: -Math.PI / 4, push: 4 + spearThrust(atk.progress) * 16 };
      else if (atk.progress < 0.5) throwMini = atk.item;
    }
    const special = an.anim === 'mantle' || an.anim === 'swim' || an.anim === 'hurt';
    if (special) { swing = null; blade = null; rot = null; throwMini = null; }
    const arms = special ? previewArms(an.anim as 'mantle' | 'swim' | 'hurt', an.frame) : armAngles(kind, local, swing);
    // 攀上邊緣（最後一格「站起來」以外）：手抓在牆角上（台面往內 3 px），換算成影格座標
    const grip = mt && an.frame < 3
      // 膝蓋上台那格：身體已經越過牆角，手改撐在身前的台面上（不會往後拉長）
      ? SP.grip(meta, fi, Math.max(an.frame === 2 ? MANTLE_KNEE_X : 0, Math.round((mt.edgeX + mt.dir * 3 - cx) * this.facing - ox)), Math.round(mt.edgeY - 1 - bottom - oy))
      : null;
    // 待機 / 走路 / 跳躍時，手上的鎬 / 武器也拿著（往前斜舉）；挖掘時換成背包裡最好的鎬、攻擊時用攻擊動畫
    const carry = !st.mining && !atk && !special ? carryStyle(heldDef) : null;
    if (carry && carry !== 'mini') arms.front = carryArm(kind, arms.front);
    // 鎬：扛在身前、鎬頭朝上（不會拖在腳邊）
    // 釣竿：手往前平舉到胸口（竿子從胸前斜上去，線從竿尖出來）
    // 釣竿：手往前平舉（竿子從手往前上方斜出去、不會蓋到大頭）
    if (carry === 'rod') arms.front = st.fishing?.state === 'bite' ? 105 : 85;
    if (carry === 'pick') arms.front = (kind === 'jump' || kind === 'fall' ? 150 : 128) + (kind === 'walk' ? Math.round(Math.sin((local / 8) * Math.PI * 2) * 6) : 0);
    const showPick = special ? null : st.mining ? this.bestPickItem() : carry === 'pick' ? held : null;
    if (carry === 'blade') blade = held;
    const heldOther = !special && !st.mining && !atk && held && carry !== 'rod' && ((!heldDef?.pick && !heldDef?.weapon) || carry === 'mini') ? held : null;
    // 火把 / 方塊：前手往前平舉（手在身體前面、離開臉）
    if (heldOther && kind !== 'jump' && kind !== 'fall') arms.front = heldCarryArm(heldOther === 'torch' || heldOther === 'lantern' ? 'torch' : 'mini') + Math.round(arms.front * 0.15);

    const bodyDy = meta.dy;
    ctx.save();
    ctx.translate(cx, bottom);
    ctx.scale(this.facing, 1);
    const sb0 = SP.shoulder(true), sf0 = SP.shoulder(false);
    const sb = { x: sb0.x + meta.dx, y: sb0.y }, sf = { x: sf0.x + meta.dx, y: sf0.y };
    // 紙娃娃順序：後手臂 → 第一張（背飾 / 後髮 / 身體 / 腿 / 胸）→ 前手臂 + 手持 → 第二張（臉 / 前髮 / 頭飾 / 前飾品）
    if (!grip) { const back = SP.arm(true, null, arms.back); ctx.drawImage(back.canvas, ox + sb.x - back.ox, oy + sb.y + bodyDy - back.oy); }
    ctx.drawImage(sheet.canvas, fi * FW, 0, FW, FH, ox, oy, FW, FH);
    // 手持非鎬物件（火把 / 方塊）：手在前、物件直立
    const radA = (arms.front * Math.PI) / 180;
    const hx = Math.round(ox + sf.x + Math.sin(radA) * SP.handReach), hy = Math.round(oy + sf.y + bodyDy + Math.cos(radA) * SP.handReach);
    // 揮劍殘影：刀身掃過的弧（前 80%）
    if (atk && blade && atk.progress < 0.8) {
      const r0 = 20, r1 = atk.kind === 'broadsword' ? 34 : 30;
      const sx = ox + sf.x, sy = oy + sf.y + bodyDy;
      for (let d = arms.front + 8; d <= Math.min(arms.front + 70, 205); d += 4) {
        const fade = (d - arms.front) / 70;
        ctx.fillStyle = fade < 0.35 ? '#ffffff' : fade < 0.7 ? '#cceaf8' : '#94c8ee';
        const ux = Math.sin((d * Math.PI) / 180), uy = Math.cos((d * Math.PI) / 180);
        for (let r = r0 + Math.round(fade * 6); r <= r1; r += 3) ctx.fillRect(Math.round(sx + ux * r), Math.round(sy + uy * r), 1, 1);
      }
    }
    if (grip) ctx.drawImage(grip.arms, ox - grip.pad, oy - grip.pad);
    else { const front = SP.arm(false, showPick, arms.front, blade); ctx.drawImage(front.canvas, ox + sf.x - front.ox, oy + sf.y + bodyDy - front.oy); }
    ctx.drawImage(sheet.canvas, fi * FW, FH, FW, FH, ox, oy, FW, FH);
    // 舉過頭的劍 / 鎬（揮擊預備）：大頭會擋住，武器另外疊在頭前面（手臂還在頭後面）
    if (!grip && (showPick || blade) && heldOverHead(arms.front)) {
      const it = SP.arm(false, showPick, arms.front, blade, true);
      ctx.drawImage(it.canvas, ox + sf.x - it.ox, oy + sf.y + bodyDy - it.oy);
      // 臉那一層再蓋回去：武器在頭髮前面、臉後面（不會一刀劃過眼睛）
      ctx.drawImage(sheet.canvas, fi * FW, FH * 3, FW, FH, ox, oy, FW, FH);
    }
    // 手掌蓋在臉 / 頭髮上面：看得出抓住了邊緣
    if (grip) ctx.drawImage(grip.hands, ox - grip.pad, oy - grip.pad);
    // 手持的火把 / 方塊畫在頭的前面（大頭不會把它蓋掉）
    if (heldOther === 'torch' && heldOverFace('torch')) {
      const c = SP.torches[flameFrame(this.clock, 7, 3)];
      ctx.drawImage(c, hx - 4, hy - 13);
    }
    if (heldOther && heldOther !== 'torch' && heldOverFace('mini')) {
      const m = SP.mini(heldOther);
      ctx.drawImage(m, hx - 2, hy - 6);
    }
    // 投擲物握在手上（往外偏一格：不會蓋在臉頰上）
    if (throwMini) ctx.drawImage(SP.mini(throwMini), hx - 2, hy - 5);
    ctx.restore();
    if (rot && atk) {
      // 弓 / 法杖 / 矛：世界座標下旋轉到瞄準角，畫在手上
      const wx = cx + this.facing * (ox + sf.x), wy = bottom + oy + sf.y + bodyDy;
      const ux = Math.cos(atk.angle), uy = Math.sin(atk.angle);
      const c = SP.rotatedIcon(rot.item, atk.angle, rot.base);
      const px = wx + ux * (SP.handReach + rot.push), py = wy + uy * (SP.handReach + rot.push);
      ctx.drawImage(c, Math.round(px - c.width / 2), Math.round(py - c.height / 2));
      if (rot.item === 'crystal_staff') this.coolSeen.push({ x: px + ux * 8, y: py + uy * 8 });
    }
    if (carry === 'rotated' && held) {
      // 弓 / 法杖 / 矛拿在手上：法杖 / 矛朝上斜立、弓朝前
      const wk = heldDef?.weapon?.kind;
      // （圖示中心沿著拿的方向往外推：握的那端在手上，不會整支蓋到大頭）
      const up = wk === 'bow' ? 0.3 : -Math.PI / 2 + 0.6;
      const ang = this.facing > 0 ? up : Math.PI - up;
      const base = wk === 'bow' ? -Math.PI * 0.75 : -Math.PI / 4;
      const c = SP.rotatedIcon(held, ang, base);
      const px = cx + this.facing * hx, py = bottom + hy, push = wk === 'bow' ? 4 : 8;
      ctx.drawImage(c, Math.round(px - c.width / 2 + Math.cos(ang) * push), Math.round(py - c.height / 2 + Math.sin(ang) * push));
    }
    if (heldOther === 'torch' || heldOther === 'lantern') {
      this.torchesSeen.push({ x: cx + this.facing * (hx + 0), y: bottom + hy - 8 });
    }
    // 釣竿：往前斜舉；竿尖記下來畫釣線
    this.rodTip = null;
    if (carry === 'rod' && held) {
      const fishing = st.fishing;
      // 浮標在水上時竿子比較平（往浮標那邊）、上鉤時往上抬
      // 竿子比較平（往前上方）、握把在手上：整支在臉的前面外側，不會蓋到額頭
      const up = fishing?.state === 'bite' ? -Math.PI / 2 + 0.55 : fishing ? -Math.PI / 2 + 1.05 : -Math.PI / 2 + 0.85;
      const ang = this.facing > 0 ? up : Math.PI - up;
      const c = this.sprites.rotatedIcon(held, ang, -Math.PI / 4);
      const px = cx + this.facing * hx, py = bottom + hy;
      const ix = Math.round(px - c.width / 2 + Math.cos(ang) * 9), iy = Math.round(py - c.height / 2 + Math.sin(ang) * 9);
      ctx.drawImage(c, ix, iy);
      // 竿尖：圖示中心（手 + 9）再往外半條對角線（≈ 9）
      this.rodTip = { x: Math.round(px + Math.cos(ang) * 18), y: Math.round(py + Math.sin(ang) * 18) };
    }
  }

  /** 釣線（竿尖 → 浮標，往下垂的拋物線，1px 像素點）+ 浮標（上鉤時沉下去、頭上冒驚嘆號） */
  private drawFishing(ctx: CanvasRenderingContext2D): void {
    const f = this.game.fishing, tip = this.rodTip;
    if (!f || !tip) return;
    const bite = f.state === 'bite';
    // 浮標：漂著時一半在水裡（只露上半）；上鉤時沉到只剩天線、抖動
    const bob = f.state === 'floating' ? Math.round(Math.sin(this.clock * 3) * 0.6) : 0;
    const dip = bite ? 3 + (Math.floor(this.clock * 12) & 1) : 0;
    const bx = Math.round(f.x) - 2, by = Math.round(f.y) - 5 + bob + dip;
    // 線：二次貝茲（中點往下垂；上鉤時拉直）
    const ex = bx + 2, ey = by;
    const sag = bite ? 2 : Math.min(28, Math.hypot(ex - tip.x, ey - tip.y) * 0.18);
    const mx = (tip.x + ex) / 2, my = Math.max(tip.y, ey) + sag;
    const n = Math.max(8, Math.ceil(Math.hypot(ex - tip.x, ey - tip.y) / 2));
    ctx.fillStyle = '#cceaf8';
    let lx = -9999, ly = -9999;
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t;
      const x = Math.round(u * u * tip.x + 2 * u * t * mx + t * t * ex), y = Math.round(u * u * tip.y + 2 * u * t * my + t * t * ey);
      if (x === lx && y === ly) continue;
      ctx.fillRect(x, y, 1, 1);
      lx = x; ly = y;
    }
    const show = f.state === 'flying' ? 7 : bite ? 3 : 5;
    ctx.drawImage(this.bobber, 0, 0, 4, show, bx, by, 4, show);
    if (bite) {
      // 驚嘆號（白底黑邊，2×6）
      const qx = bx + 1, qy = by - 12 - (Math.floor(this.clock * 6) & 1);
      ctx.fillStyle = '#1c1424'; ctx.fillRect(qx - 1, qy - 1, 4, 10);
      ctx.fillStyle = '#ffd86a'; ctx.fillRect(qx, qy, 2, 5); ctx.fillRect(qx, qy + 6, 2, 2);
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, dt: number): void {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.life -= dt;
      if (q.life <= 0) { ps.splice(i, 1); continue; }
      q.vy += (q.g ?? 700) * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      ctx.fillStyle = q.color;
      const sz = q.size ?? 2;
      ctx.fillRect(Math.round(q.x), Math.round(q.y), sz, sz);
    }
    if (ps.length > 600) ps.splice(0, ps.length - 600);
  }

  /** 元素詞條的點綴粒子：熾焰往上飄的火星、霜寒落下的冰晶、引雷一閃一閃的電光、劇毒的泡泡、螢光的光點 */
  private sparkT = 0;
  private elementSparks(l: import('../engine/doll').DollLook, dt: number): void {
    this.sparkT -= dt;
    if (this.sparkT > 0) return;
    this.sparkT = 0.07;
    const p = this.game.player;
    const parts: [import('../engine/doll').DollPiece | null, number][] = [[l.head, 36], [l.body, 20], [l.legs, 6]];
    for (const [pc, h] of parts) {
      if (!pc?.elem || Math.random() > 0.75) continue;
      const big = Math.random() < 0.35 ? 2 : 1;
      const x = p.x + p.w / 2 + (Math.random() - 0.5) * 12, y = p.y + p.h - h + (Math.random() - 0.5) * 6;
      switch (pc.elem) {
        case 'fire': this.particles.push({ x, y, vx: (Math.random() - 0.5) * 12, vy: -28 - Math.random() * 20, life: 0.6, color: Math.random() < 0.5 ? '#ffa93a' : '#ffd86a', g: -30, size: big }); break;
        case 'ice': this.particles.push({ x, y, vx: (Math.random() - 0.5) * 8, vy: 6, life: 0.8, color: Math.random() < 0.5 ? '#cceaf8' : '#ffffff', g: 18, size: big }); break;
        case 'storm': this.particles.push({ x, y, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 40, life: 0.16, color: Math.random() < 0.5 ? '#ffffff' : '#9a6ee0', g: 0, size: big }); break;
        case 'poison': this.particles.push({ x, y, vx: 0, vy: -14, life: 0.5, color: '#93cc50', g: -10, size: 1 }); break;
        case 'light': this.particles.push({ x, y, vx: (Math.random() - 0.5) * 6, vy: -10, life: 0.7, color: '#fff4c0', g: -6, size: 1 }); break;
      }
    }
  }

  /** 攀爬的粉塵：換手時繩上掉一點繩屑；攀上邊緣時牆角揚起一小撮灰 + 一滴汗 */
  private climbDust(big: boolean, at: { x: number; y: number } | null = null): void {
    const p = this.game.player;
    const x = at ? at.x : p.x + p.w / 2, y = at ? at.y : p.y + 4;
    const cols = ['#c99660', '#966139', '#d8ba76'];
    for (let i = 0; i < (big ? 6 : 2); i++) {
      this.particles.push({ x: x + (Math.random() - 0.5) * (big ? 10 : 4), y, vx: (Math.random() - 0.5) * (big ? 60 : 16), vy: big ? -20 - Math.random() * 40 : 10 + Math.random() * 20,
        life: 0.3 + Math.random() * 0.3, color: cols[i % cols.length], size: 1, g: big ? 200 : 120 });
    }
    if (big) this.particles.push({ x: p.x + p.w / 2 - this.facing * 8, y: p.y + 14, vx: -this.facing * 25, vy: -50, life: 0.45, color: '#94c8ee', size: 1, g: 300 });
  }

  /** 濺起一圈水花（世界 px） */
  private burst(x: number, y: number, n: number, colors: string[], speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (1.1 + Math.random() * 0.8);
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({ x: x + (Math.random() - 0.5) * 10, y: y - 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.35, color: colors[i % colors.length], size: i % 3 === 0 ? 1 : 2 });
    }
  }

  /** 玩家狀態：水下呼吸泡泡、著火時身上冒火、泡過蜂蜜時偶爾冒金色光點 */
  private drawStatus(ctx: CanvasRenderingContext2D, dt: number): void {
    const g = this.game, p = g.player;
    if (g.dead) return;
    if (g.breath < 10 - 1e-6) this.liquidLayer.drawBreath(ctx, p.x + p.w / 2, p.y + p.gfxOffY, g.breath, 10);
    if (g.burning > 0 && Math.random() < dt * 30) {
      this.particles.push({ x: p.x + Math.random() * p.w, y: p.y + p.h * (0.3 + Math.random() * 0.6), vx: (Math.random() - 0.5) * 20, vy: -50 - Math.random() * 40,
        life: 0.3 + Math.random() * 0.3, color: Math.random() < 0.5 ? '#ffa93a' : '#e8701c', g: -80, size: 2 });
      this.torchesSeen.push({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
    }
    if (g.honeyT > 0 && Math.random() < dt * 4) {
      this.particles.push({ x: p.x + Math.random() * p.w, y: p.y + Math.random() * p.h, vx: 0, vy: -20, life: 0.6, color: '#ffd86a', g: -10, size: 1 });
    }
  }

  // ── 環境粒子 ─────────────────────────────────────────
  private updateAmbient(dt: number, camX: number, camY: number, vw: number, vh: number): void {
    const g = this.game, w = g.world;
    if (this.frame % 20 === 1) {
      const p = g.playerTile(), x = Math.max(0, Math.min(w.width - 1, p.x));
      const surf = w.surfaceAt(x);
      this.ambientNow = ambientKind({
        molten: p.y >= g.layers.molten[x],
        mushroom: g.discovery.regionsAt(p.x, p.y).some((r) => r.kind === 'mushroom_biome') || this.nearMushroomGrass(p.x, p.y),
        outdoors: p.y <= surf + 1 && w.getWall(p.x, p.y) === 0,
        underground: p.y > surf + 4,
        biome: w.biomeAt(x),
        sky: g.skyLevel(),
        precip: ['rain', 'storm', 'snow'].includes(g.localWeatherState().kind) && g.localWeatherState().intensity > 0.3,
        winter: g.season() === 3,
      });
    }
    this.ambient.step(dt, this.ambientNow, { x: camX, y: camY, w: vw, h: vh });
  }
  /** 附近（±12 欄、±7 列，隔格取樣）有幾格蘑菇草 → 算在菇林裡 */
  private nearMushroomGrass(px: number, py: number): boolean {
    const w = this.game.world;
    let n = 0;
    for (let y = py - 7; y <= py + 7; y += 2) for (let x = px - 12; x <= px + 12; x += 2) if (w.getFg(x, y) === T.MUSHROOM_GRASS && ++n >= 4) return true;
    return false;
  }
  private drawAmbient(ctx: CanvasRenderingContext2D, glow: boolean): void {
    for (const p of this.ambient.particles) {
      if (AMBIENT_GLOWS[p.kind] !== glow || !AmbientField.visible(p, this.frame)) continue;
      const x = Math.round(p.x), y = Math.round(p.y);
      ctx.fillStyle = p.color;
      switch (p.kind) {
        case 'snow': ctx.fillRect(x, y, p.size, p.size); break; // [polish] 2–3 px 雪片
        case 'ember': ctx.fillRect(x, y, 1, 2); break;          // 往上飄的短火星
        case 'firefly': ctx.fillRect(x, y, 2, 2); ctx.fillStyle = '#fff4c0'; ctx.fillRect(x, y, 1, 1); break;
        case 'spore': ctx.fillRect(x, y, 1, 1); ctx.fillRect(x + 1, y + 1, 1, 1); break;
        default: ctx.fillRect(x, y, p.size, p.size); // [polish] 1–2 px 浮塵
      }
    }
  }
  /** 傳送石引導：玩家身邊往上飄的青色光點，越接近完成越密 */
  private drawRecall(ctx: CanvasRenderingContext2D): void {
    const r = this.game.getState().recall;
    if (r <= 0) return;
    const p = this.game.player, cx = Math.round(p.x + p.w / 2), by = Math.round(p.y + p.h);
    const n = 4 + Math.floor(r * 12), t = this.clock;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * 2;
      const rise = ((t * 30 + i * 13) % 44);
      ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#cceaf8' : '#4aaeb0';
      ctx.fillRect(cx + Math.round(Math.cos(a) * (12 - r * 4)), by - Math.round(rise), 1, 2);
    }
  }

  private drawGlows(ctx: CanvasRenderingContext2D): void {
    if (!this.torchesSeen.length && !this.coolSeen.length && !this.crystalSeen.length) return;
    const gl = this.sprites.glow, hw = gl.width / 2;
    const cg = this.sprites.coolGlow, ch = cg.width / 2;
    const xg = this.sprites.crystalGlow, xh = xg[0].width / 2;
    ctx.globalCompositeOperation = 'lighter';
    for (const t of this.torchesSeen) ctx.drawImage(gl, Math.round(t.x - hw), Math.round(t.y - hw));
    for (const t of this.coolSeen) ctx.drawImage(cg, Math.round(t.x - ch), Math.round(t.y - ch));
    for (const t of this.crystalSeen) ctx.drawImage(xg[t.v], Math.round(t.x - xh), Math.round(t.y - xh));
    ctx.globalCompositeOperation = 'source-over';
  }

  // ── 光照 ─────────────────────────────────────────────
  // 引擎算出每格 RGB 光 → shadeTiles（天空色、玩家附近「看得到」的格才有輪廓微光）→ fillLightPixels：
  // 每格切 LSUB 小格雙線性取樣，亮度分 LIGHT_LEVELS 階（只有階與階之間用世界錨定 Bayer 抖動）、色相吸附成有限幾階；
  // 以 'multiply' 疊上（不透明光色 × 色票色），全暗的格再以 'lighter' 補上色票最暗色。
  private drawLight(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    if (this.fullbright) return;
    this.lightAge++;
    const t0 = performance.now();
    const v = this.lightView;
    v.x = Math.floor(camX / S); v.y = Math.floor(camY / S); v.w = Math.ceil(vw / S) + 1; v.h = Math.ceil(vh / S) + 1;
    // 重算分散到幾幀（每幀最多 LIGHT_BUDGET_MS）：顯示中的遮罩是世界錨定的，鏡頭移動幾幀仍蓋得住畫面；
    // 蓋不住（第一幀、縮放、傳送、高速墜落）才當幀一次做完。重算中又有變動 → 這次做完立刻再排一次。
    if (!this.job && (this.lightDirty || this.lightAge >= this.lightEvery || !this.light)) this.startLightJob(camX, camY, vw, vh);
    if (this.job) {
      const urgent = !rectCovers(this.light, v);
      this.advanceLightJob(urgent ? Infinity : t0 + LIGHT_BUDGET_MS);
      if (urgent && !rectCovers(this.light, v)) { this.startLightJob(camX, camY, vw, vh); this.advanceLightJob(Infinity); }
    }
    const lm = this.light;
    if (!lm) return;
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.lightCanvas, lm.x0 * S, lm.y0 * S, lm.w * S, lm.h * S);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.darkCanvas, lm.x0 * S, lm.y0 * S, lm.w * S, lm.h * S);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** 開始一次光照重算：引擎光照 + 每格光色 + 填色準備（便宜的部分當幀做完），像素留給 advanceLightJob 分幀填 */
  private startLightJob(camX: number, camY: number, vw: number, vh: number): void {
    const t0 = performance.now();
    const g = this.game, w = g.world;
    const pt = g.playerTile();
    const extra = this.extraLights;
    extra.length = 0;
    for (const l of g.heldLights()) extra.push(l);
    for (const l of g.enemyLights()) extra.push(l);
    for (const l of g.projectileLights()) extra.push(l);
    const view = { x: Math.floor(camX / S) - 1, y: Math.floor(camY / S) - 1, w: Math.ceil(vw / S) + 3, h: Math.ceil(vh / S) + 3 };
    const L = g.computeLight(view, extra);
    this.stats.lightEngineMs = performance.now() - t0;
    // 戰爭迷霧：畫面上看得到（夠亮）的格算探索過
    g.revealLit(L, { x: Math.floor(camX / S), y: Math.floor(camY / S), w: Math.ceil(vw / S) + 1, h: Math.ceil(vh / S) + 1 });
    const lx0 = Math.max(L.x0, view.x - 2), ly0 = Math.max(L.y0, view.y - 2);
    const lx1 = Math.min(L.x0 + L.w, view.x + view.w + 2), ly1 = Math.min(L.y0 + L.h, view.y + view.h + 2);
    const lw = Math.max(1, lx1 - lx0), lh = Math.max(1, ly1 - ly0);
    // 寫進沒在顯示的那一組
    const set = this.lightSets[this.front ^ 1];
    const cw = lw * LSUB, chh = lh * LSUB;
    if (!set.img || !set.dimg || set.img.width !== cw || set.img.height !== chh) {
      set.img = new ImageData(cw, chh);
      set.dimg = new ImageData(cw, chh);
      set.pix = new Uint32Array(set.img.data.buffer);
      set.dpix = new Uint32Array(set.dimg.data.buffer);
    }
    if (this.lightA.length < lw * lh * 3) { this.lightA = new Float32Array(lw * lh * 3); this.reach = new Uint8Array(lw * lh); }
    const reach = this.reach.subarray(0, lw * lh);
    const rect = { x0: lx0, y0: ly0, w: lw, h: lh };
    ambientReach(w, pt.x, pt.y, AMBIENT_R, { x: lx0, y: ly0, w: lw, h: lh }, reach);
    const A = this.lightA.subarray(0, lw * lh * 3);
    shadeTiles(L, w, rect, pt, g.skyRGB(), reach, A);
    this.filler.begin(A, lw, lh, LSUB, lx0 * LSUB, ly0 * LSUB, set.pix, set.dpix);
    this.job = { set, L, rect, ms: performance.now() - t0, frames: 0, fillMs: 0 };
    this.lightAge = 0;
    this.lightDirty = false;
  }

  /** 光照重算往前推進到 deadline（至少一個 tile 列）；填完就上傳、換成顯示中的那一組 */
  private advanceLightJob(deadline: number): void {
    const j = this.job;
    if (!j) return;
    const t1 = performance.now();
    j.frames++;
    const done = this.filler.fillUntil(deadline, this.now);
    const t2 = performance.now();
    j.fillMs += t2 - t1;
    j.ms += t2 - t1;
    if (!done) return;
    const img = j.set.img!, dimg = j.set.dimg!;
    if (this.lightCanvas.width !== img.width || this.lightCanvas.height !== img.height) {
      this.lightCanvas.width = img.width; this.lightCanvas.height = img.height;
      this.darkCanvas.width = img.width; this.darkCanvas.height = img.height;
    }
    this.lightCtx?.putImageData(img, 0, 0);
    this.darkCtx?.putImageData(dimg, 0, 0);
    const t3 = performance.now();
    j.ms += t3 - t2;
    this.front ^= 1;
    this.light = j.rect;
    this.lastLight = j.L;
    this.job = null;
    this.stats.lightFillMs = j.fillMs;
    this.stats.lightPutMs = t3 - t2;
    this.stats.lightMs = j.ms;
    this.stats.lightFrames = j.frames;
  }

  /** 暗處的玩家輪廓光：站的地方很暗時，在光照遮罩之上補畫一圈冷灰的外框（身體 / 頭；手臂很細就不補） */
  private drawPlayerRim(ctx: CanvasRenderingContext2D): void {
    const r = this.rimDraw;
    if (!r) return;
    const t = this.game.playerTile();
    const lv = Math.max(this.lightAt(t.x, t.y), this.lightAt(t.x, t.y - 1));
    if (lv > 0.32) return;
    ctx.save();
    ctx.translate(r.cx, r.bottom);
    ctx.scale(r.facing, 1);
    ctx.drawImage(r.canvas, r.fi * FW, FH * 2, FW, FH, r.x, r.y, FW, FH);
    ctx.restore();
  }

  /** 上次光照計算時某格（tile）的亮度（三通道最大值 ×1.08，地下套同一條暗部曲線；沒算過 = 1） */
  lightAt(tx: number, ty: number): number {
    const L = this.lastLight;
    if (!L || this.fullbright) return 1;
    return depthCurve(Math.min(1, L.get(tx, ty) * 1.08), ty - depthSurfaceAt(this.game.world.surface, tx));
  }

  destroy(): void {
    this.cache.clear();
    this.pool.length = 0;
    this.particles.length = 0;
  }
}
