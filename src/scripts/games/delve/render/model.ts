// model.ts — render 層的純邏輯（無 DOM，可單元測試）：鏡頭、固定步長、chunk 範圍 / LRU、HUD 文字、配方列。
import { RECIPES, canCraft } from '../engine/crafting';
import type { Inventory, Stack } from '../engine/inventory';
import type { ItemId } from '../engine/items';
import type { BlockReason } from '../engine/game';
import { DAY_LENGTH } from '../engine/constants';

export interface Cam { x: number; y: number; }

/** 把鏡頭左上角夾在世界內；視窗比世界大時置中。 */
export function clampCamera(x: number, y: number, viewW: number, viewH: number, worldW: number, worldH: number): Cam {
  const cx = viewW >= worldW ? (worldW - viewW) / 2 : Math.max(0, Math.min(worldW - viewW, x));
  const cy = viewH >= worldH ? (worldH - viewH) / 2 : Math.max(0, Math.min(worldH - viewH, y));
  return { x: cx, y: cy };
}

/** 鏡頭跟隨（指數平滑，與幀率無關）。target 為要置中的世界 px 座標。 */
export function followCamera(
  cam: Cam, target: Cam, viewW: number, viewH: number, worldW: number, worldH: number,
  dt: number, snap = false, stiffness = 9,
): Cam {
  const goal = clampCamera(target.x - viewW / 2, target.y - viewH / 2, viewW, viewH, worldW, worldH);
  if (snap) return goal;
  const a = 1 - Math.exp(-stiffness * Math.max(0, dt));
  return clampCamera(cam.x + (goal.x - cam.x) * a, cam.y + (goal.y - cam.y) * a, viewW, viewH, worldW, worldH);
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
export function depthLabel(feetY: number, surfaceAtCol: number, cavernY: number): string {
  const d = feetY + 1 - surfaceAtCol;
  if (d <= 0) return '地表';
  if (feetY >= cavernY) return `洞穴層 · 地下 ${d} 格`;
  return `地下 ${d} 格`;
}

const BLOCKED: Record<BlockReason, string | null> = {
  reach: '太遠了，靠近一點',
  tier: '需要更好的鎬才挖得動',
  full: '背包已滿',
  body: '不能放在自己身上',
  support: '需要相鄰方塊或背牆支撐',
  occupied: null,
  chest: '箱子裡還有東西，先拿空才能挖',
};
// ── 新世界 / 存檔覆蓋流程（單一存檔槽） ──────────────────
/** 已有存檔時新世界要先確認；force（使用者已確認 / fresh=1）直接開始。 */
export function newWorldPlan(existingSeed: string | null, force: boolean): 'start' | 'confirm' {
  return existingSeed !== null && !force ? 'confirm' : 'start';
}

export type AutostartPlan =
  | { kind: 'none' }
  | { kind: 'start'; seed: string | undefined }
  | { kind: 'confirm'; seed: string | undefined; existing: string };

/** ?autostart=1[&seed=x][&fresh=1]：有存檔且沒有 fresh=1 時不得直接覆蓋。 */
export function autostartPlan(search: string, existingSeed: string | null): AutostartPlan {
  const qs = new URLSearchParams(search);
  if (qs.get('autostart') !== '1') return { kind: 'none' };
  const seed = qs.get('seed') ?? undefined;
  if (newWorldPlan(existingSeed, qs.get('fresh') === '1') === 'confirm') {
    return { kind: 'confirm', seed, existing: existingSeed as string };
  }
  return { kind: 'start', seed };
}

/**
 * 背景的生態區過渡：鏡頭所在欄的生態區 a，若 range 欄內有別的生態區 b，就混入 b，
 * 比例 t 越靠邊界越大（最多 0.5，邊界兩側對稱），並量化成 0 / 0.25 / 0.5 三階 → 一階一階地換色。
 */
export function biomeBlend(biomeAt: (x: number) => number, cx: number, width: number, range = 60): { a: number; b: number; t: number } {
  const x = Math.max(0, Math.min(width - 1, Math.floor(cx)));
  const a = biomeAt(x);
  let best = range + 1, b = a;
  for (let d = 1; d <= range; d++) {
    const l = x - d, r = x + d;
    if (l >= 0 && biomeAt(l) !== a) { best = d; b = biomeAt(l); break; }
    if (r < width && biomeAt(r) !== a) { best = d; b = biomeAt(r); break; }
  }
  if (b === a) return { a, b: a, t: 0 };
  const t = Math.round(Math.max(0, 0.5 * (1 - (best - 1) / range)) * 4) / 4;
  return { a, b: t > 0 ? b : a, t };
}

const BIOME_NAMES = ['森林', '沙漠', '雪原', '叢林'];
export function biomeLabel(biome: number): string { return BIOME_NAMES[biome] ?? BIOME_NAMES[0]; }
const REGION_NAMES: Record<string, string> = { mushroom_biome: '螢光菇林', crystal_cave: '水晶洞', sky_island: '浮空島', cabin: '廢棄小屋', mineshaft: '礦坑', ruin: '遺跡' };
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
  inputs: { item: ItemId; n: number; have: number }[];
  craftable: boolean;
  /** 需要工作台但不在附近 */
  needStation: boolean;
  /** 材料不足 */
  missing: boolean;
}

export function recipeRows(inv: Inventory, nearWorkbench: boolean): RecipeRow[] {
  return RECIPES.map((r) => {
    const inputs = r.inputs.map((a) => ({ item: a.item, n: a.n, have: inv.count(a.item) }));
    return {
      id: r.id,
      out: { ...r.out },
      inputs,
      craftable: canCraft(inv, r, { nearWorkbench }),
      needStation: r.station === 'workbench' && !nearWorkbench,
      missing: inputs.some((a) => a.have < a.n),
    };
  });
}
