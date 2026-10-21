// model.ts — render 層的純邏輯（無 DOM，可單元測試）：鏡頭、固定步長、chunk 範圍 / LRU、HUD 文字、配方列。
import { RECIPES, canCraft, stationOk, type CraftContext, type Station } from '../engine/crafting';
import type { Inventory, Stack } from '../engine/inventory';
import type { ItemId } from '../engine/items';
import type { BlockReason } from '../engine/game';
import { CHUNK, DAY_LENGTH } from '../engine/constants';

export interface Cam { x: number; y: number; }

/** 把鏡頭左上角夾在世界內（水平範圍 [worldX0, worldX0 + worldW)）；視窗比世界大時置中。 */
export function clampCamera(x: number, y: number, viewW: number, viewH: number, worldW: number, worldH: number, worldX0 = 0): Cam {
  const cx = viewW >= worldW ? worldX0 + (worldW - viewW) / 2 : Math.max(worldX0, Math.min(worldX0 + worldW - viewW, x));
  const cy = viewH >= worldH ? (worldH - viewH) / 2 : Math.max(0, Math.min(worldH - viewH, y));
  return { x: cx, y: cy };
}

/** 鏡頭跟隨（指數平滑，與幀率無關）。target 為要置中的世界 px 座標；worldX0 = 世界左緣（px）。 */
export function followCamera(
  cam: Cam, target: Cam, viewW: number, viewH: number, worldW: number, worldH: number,
  dt: number, snap = false, stiffness = 9, worldX0 = 0,
): Cam {
  const goal = clampCamera(target.x - viewW / 2, target.y - viewH / 2, viewW, viewH, worldW, worldH, worldX0);
  if (snap) return goal;
  const a = 1 - Math.exp(-stiffness * Math.max(0, dt));
  return clampCamera(cam.x + (goal.x - cam.x) * a, cam.y + (goal.y - cam.y) * a, viewW, viewH, worldW, worldH, worldX0);
}

/**
 * 鏡頭要置中的世界座標。玩家放在畫面中央略偏下（約 54%）；直式螢幕不再大幅上抬，
 * 避免畫面大半是天空——上方被 HUD 蓋住，下方是要挖的地面。
 */
export function cameraFocus(pc: Cam, viewW: number, viewH: number): Cam {
  const portrait = viewH > viewW;
  const below = viewH * (portrait ? 0.05 : 0.04);
  return { x: pc.x, y: pc.y - below };
}

/** 固定步長累加器：advance(幀秒數) 回傳本幀應執行幾個模擬步。 */
export class FixedStepper {
  private acc = 0;
  constructor(readonly dt: number = 1 / 60, readonly maxFrame: number = 0.25) {}
  advance(frame: number): number {
    const f = Number.isFinite(frame) && frame > 0 ? Math.min(frame, this.maxFrame) : 0;
    this.acc += f;
    let n = 0;
    while (this.acc + 1e-9 >= this.dt) { this.acc -= this.dt; n++; }
    if (this.acc < 0) this.acc = 0;
    return n;
  }
  /** 插值用：累加器剩餘比例 0..1 */
  get alpha(): number { return this.acc / this.dt; }
}

export interface ChunkRange { cx0: number; cy0: number; cx1: number; cy1: number; }

/** 與視窗（世界 px）相交的 chunk 範圍（含端點），夾在世界內。 */
export function visibleChunks(
  camX: number, camY: number, viewW: number, viewH: number, chunkPx: number, chunksX: number, chunksY: number,
): ChunkRange {
  const clampX = (v: number): number => Math.max(0, Math.min(chunksX - 1, v));
  const clampY = (v: number): number => Math.max(0, Math.min(chunksY - 1, v));
  return {
    cx0: clampX(Math.floor(camX / chunkPx)),
    cy0: clampY(Math.floor(camY / chunkPx)),
    cx1: clampX(Math.floor((camX + viewW - 1) / chunkPx)),
    cy1: clampY(Math.floor((camY + viewH - 1) / chunkPx)),
  };
}

/** 簡單 LRU（Map 插入順序）。set 超過容量時回傳被淘汰的項目，供回收 canvas。 */
export class ChunkLRU<V> {
  private map = new Map<number, V>();
  constructor(readonly capacity: number) {}
  get size(): number { return this.map.size; }
  has(k: number): boolean { return this.map.has(k); }
  get(k: number): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) { this.map.delete(k); this.map.set(k, v); }
    return v;
  }
  set(k: number, v: V): { key: number; value: V } | null {
    if (this.map.has(k)) { this.map.delete(k); this.map.set(k, v); return null; }
    this.map.set(k, v);
    if (this.map.size > this.capacity) {
      const first = this.map.keys().next().value as number;
      const value = this.map.get(first) as V;
      this.map.delete(first);
      return { key: first, value };
    }
    return null;
  }
  keys(): number[] { return [...this.map.keys()]; }
  delete(k: number): boolean { return this.map.delete(k); }
  clear(): void { this.map.clear(); }
}

// ── HUD 文字 ─────────────────────────────────────────────
export function formatClock(time: number): string {
  let p = (time % DAY_LENGTH) / DAY_LENGTH;
  if (p < 0) p += 1;
  const mins = Math.floor(p * 24 * 60 + 1e-6) % (24 * 60);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * 玩家深度描述。feetY = 玩家腳底所在 tile 列；surfaceAtCol = 玩家所在欄的地表高度（第一個實心格 y）；
 * cavernY = 洞穴層起點。站在地表上時 feetY = surfaceAtCol - 1（深度 0）。
 */
export function depthLabel(feetY: number, surfaceAtCol: number, cavernY: number, moltenY = Infinity): string {
  const d = feetY + 1 - surfaceAtCol;
  if (d <= 0) return '地表';
  if (feetY >= moltenY) return `熔岩深淵 · 地下 ${d} 格`;
  if (feetY >= cavernY) return `洞穴層 · 地下 ${d} 格`;
  return `地下 ${d} 格`;
}

/** 沒有深度計時只顯示地層名稱 */
export function layerName(feetY: number, surfaceAtCol: number, cavernY: number, moltenY = Infinity): string {
  if (feetY + 1 - surfaceAtCol <= 0) return '地表';
  if (feetY >= moltenY) return '熔岩深淵';
  if (feetY >= cavernY) return '洞穴層';
  return '地下';
}

/**
 * HUD 狀態列：時間 · 區域 · 深度 · 東西座標。
 * 深度：有深度計 → 「地下 N 格」（含地層），沒有 → 只有地層名稱；東西：有指南針才顯示（相對出生點）。
 */
export function statusText(o: {
  clock: string; area: string; feetY: number; surface: number; cavernY: number; moltenY: number;
  east: number | null; depth: number | null;
}): string {
  const parts = [o.clock, o.area, o.depth !== null ? depthLabel(o.feetY, o.surface, o.cavernY, o.moltenY) : layerName(o.feetY, o.surface, o.cavernY, o.moltenY)];
  if (o.east !== null) parts.push(o.east > 0 ? `東 ${o.east}` : o.east < 0 ? `西 ${-o.east}` : '出生點');
  return parts.filter(Boolean).join(' · ');
}

export interface BannerMsg { title: string; sub: string; }
/** 發現橫幅：一次一則、每則 dur 秒，依序播放；佇列滿了丟掉最舊的 */
export class BannerQueue {
  private queue: BannerMsg[] = [];
  private cur: BannerMsg | null = null;
  private t = 0;
  constructor(readonly dur = 2.8, readonly max = 4) {}
  push(m: BannerMsg): void {
    this.queue.push(m);
    while (this.queue.length > this.max) this.queue.shift();
  }
  get pending(): number { return this.queue.length; }
  /** 0..1：目前這則播到哪 */
  get progress(): number { return this.cur ? Math.min(1, this.t / this.dur) : 0; }
  tick(dt: number): BannerMsg | null {
    if (this.cur) {
      this.t += dt;
      if (this.t >= this.dur) this.cur = null;
    }
    if (!this.cur && this.queue.length) { this.cur = this.queue.shift()!; this.t = 0; }
    return this.cur;
  }
}

export function percentLabel(f: number): string { return `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`; }
/** 地圖探索比例（0..1）：世界很大，剛開始只有零點幾 %——不到 1% 顯示兩位小數、極小值顯示 <0.01% */
export function exploredLabel(f: number): string {
  const p = Math.max(0, Math.min(1, f)) * 100;
  if (p === 0) return '0%';
  if (p >= 100) return '100%';
  if (p < 0.01) return '<0.01%';
  return p < 1 ? `${p.toFixed(2)}%` : `${p.toFixed(1)}%`;
}
export interface TileRect { x: number; y: number; w: number; h: number; }
/** tile (x,y) 是否在 rect（tile 座標）往外 margin 格內：畫面外的液體反應不放音效 / 粒子 */
export function nearRect(x: number, y: number, r: TileRect, margin: number): boolean {
  return x >= r.x - margin && x < r.x + r.w + margin && y >= r.y - margin && y < r.y + r.h + margin;
}
/** 有沒有任何 chunk（chunk 鍵，world.chunkCoords 解碼）和 rect（tile，往外 margin）相交：只有這樣才需要重算光照 */
export function chunksTouchRect(
  cis: Iterable<number>, world: { chunkCoords(ci: number): { cx: number; cy: number } }, r: TileRect, margin: number,
): boolean {
  const x0 = r.x - margin, y0 = r.y - margin, x1 = r.x + r.w + margin, y1 = r.y + r.h + margin;
  for (const ci of cis) {
    const { cx, cy } = world.chunkCoords(ci);
    const tx = cx * CHUNK, ty = cy * CHUNK;
    if (tx < x1 && tx + CHUNK > x0 && ty < y1 && ty + CHUNK > y0) return true;
  }
  return false;
}
/** 操作說明看過的記號（localStorage） */
export const HELP_KEY = 'delve.help.seen';
export function helpSeen(store: Pick<Storage, 'getItem'> | undefined | null): boolean {
  try { return store?.getItem(HELP_KEY) === '1'; } catch { return false; }
}
export function distanceLabel(tiles: number): string {
  return `${Math.round(tiles).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} 格`;
}

const BLOCKED: Record<BlockReason, string | null> = {
  reach: '太遠了，靠近一點',
  tier: '需要更好的鎬才挖得動',
  full: '背包已滿',
  body: '不能放在自己身上',
  support: '需要相鄰方塊或背牆支撐',
  occupied: null,
  chest: '箱子裡還有東西，先拿空才能挖',
  locked: '鎖住了，需要地城鑰匙',
  golden: '金寶箱上了鎖，需要金鑰匙',
  ammo: '沒有箭了（木箭：木材 + 石頭，在工作台做）',
  mana: '魔力不足',
  summon: '燈芯祭品只能在夜晚或洞穴層以下使用（場上不能已有首領）',
  potion: '藥水還在冷卻（或生命已滿）',
  maxlife: '生命上限已經到頂了',
  sleep: '附近有怪物，現在睡不著',
  bait: '沒有魚餌（挖泥土找蚯蚓、拔草叢抓蟲）',
  full_hp: '現在不餓（生命是滿的）',
  claim: '這裡已經在別的據點範圍裡了（爐心之間要隔開一點）',
  coins: '錢不夠',
  bagfull: '背包放不下了',
  blockedspot: '目的地的爐心被方塊圍住了，傳不過去（先清出一點空間）',
};

/** 古碑碑文（佔位文字） */
const LORE: readonly string[] = [
  '碑文：「塔下的路通往深處。鑰匙藏在沒有上鎖的地方。」',
  '碑文：「守門人走了，只留下牢房、書與鐵鍊。」',
  '碑文：「金色的鑰匙供奉在神殿，金色的箱子沉在最深處。」',
  '碑文：「石磚比你的鎬更古老——只有金鎬敲得動它。」',
  '碑文：「往下走，往下走，直到看見燃燒的岩石。」',
];
export function loreText(id: number): string { return LORE[((id % LORE.length) + LORE.length) % LORE.length]; }
const HINTS: Record<string, string> = { platform: '站在平台上：按 S / ↓ 可以穿過平台往下掉' };
export function hintText(id: string): string { return HINTS[id] ?? ''; }
// ── ?autostart=1 深連結（多存檔槽：新世界永遠另開存檔槽，不會覆蓋） ──────────────────
export type AutostartPlan =
  | { kind: 'none' }
  | { kind: 'fresh'; seed: string | undefined }
  | { kind: 'continue' };

/** ?autostart=1[&seed=x][&fresh=1]：fresh=1 或指定 seed → 開新世界；都沒有 → 有存檔就繼續冒險，沒有就開新世界。 */
export function autostartPlan(search: string, hasSave: boolean): AutostartPlan {
  const qs = new URLSearchParams(search);
  if (qs.get('autostart') !== '1') return { kind: 'none' };
  const seed = qs.get('seed') ?? undefined;
  if (hasSave && seed === undefined && qs.get('fresh') !== '1') return { kind: 'continue' };
  return { kind: 'fresh', seed };
}

const BIOME_NAMES = ['森林', '沙漠', '雪原', '叢林'];
export function biomeLabel(biome: number): string { return BIOME_NAMES[biome] ?? BIOME_NAMES[0]; }
const REGION_NAMES: Record<string, string> = { mushroom_biome: '螢光菇林', crystal_cave: '水晶洞', sky_island: '浮空島', cabin: '廢棄小屋', mineshaft: '礦坑', ruin: '遺跡', dungeon: '地城' };
/** 玩家所在區域名：在迷你生態區 / 結構裡就顯示它，否則顯示地表生態區 */
export function regionLabel(biome: number, regions: readonly { kind: string; x: number; y: number; w: number; h: number }[], x: number, y: number): string {
  for (const r of regions) {
    const name = REGION_NAMES[r.kind];
    if (name && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return name;
  }
  return biomeLabel(biome);
}

export function blockedMessage(reason: BlockReason): string | null { return BLOCKED[reason] ?? null; }

export function countLabel(s: Stack | null): string {
  return s && s.count > 1 ? String(s.count) : '';
}

export interface RecipeRow {
  id: string;
  out: { item: ItemId; n: number };
  /** have = 可用總數；bag = 背包裡的；fromChest = 這次會從據點箱子拿幾個（共享儲物） */
  inputs: { item: ItemId; n: number; have: number; bag?: number; fromChest?: number }[];
  craftable: boolean;
  /** 需要合成站但不在附近 */
  needStation: boolean;
  /** 需要的合成站（null = 不需要） */
  station: Station | null;
  /** 材料不足 */
  missing: boolean;
}

/**
 * 合成清單。chests = 據點共享儲物（Lv3）：背包外、範圍內箱子裡的數量（省略 = 沒有共享儲物）；
 * 有的話 have = 背包 + 箱子、fromChest = 這次要從箱子拿幾個。
 */
export function recipeRows(inv: Inventory, near: boolean | Partial<Record<Station, boolean>>, chests?: (item: ItemId) => number): RecipeRow[] {
  const ctx: CraftContext = typeof near === 'boolean' ? { nearWorkbench: near }
    : { nearWorkbench: Boolean(near.workbench), nearFurnace: Boolean(near.furnace), nearAnvil: Boolean(near.anvil), nearCampfire: Boolean(near.campfire) };
  return RECIPES.map((r) => {
    const inputs = r.inputs.map((a) => {
      const bag = inv.count(a.item);
      if (!chests) return { item: a.item, n: a.n, have: bag };
      const extra = chests(a.item);
      return { item: a.item, n: a.n, have: bag + extra, bag, fromChest: Math.max(0, Math.min(extra, a.n - bag)) };
    });
    return {
      id: r.id,
      out: { ...r.out },
      inputs,
      craftable: chests ? stationOk(r, ctx) && inputs.every((a) => a.have >= a.n) : canCraft(inv, r, ctx),
      needStation: r.station !== null && !stationOk(r, ctx),
      station: r.station,
      missing: inputs.some((a) => a.have < a.n),
    };
  });
}
