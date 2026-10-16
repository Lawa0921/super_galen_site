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

/** 玩家所在 tile 列相對地表線的描述。地表線附近 ±4 格算「地表」。 */
export function depthLabel(tileY: number, surfaceY: number): string {
  const d = tileY - surfaceY;
  if (d <= 4) return '地表';
  return `地下 ${d} 格`;
}

const BLOCKED: Record<BlockReason, string | null> = {
  reach: '太遠了，靠近一點',
  tier: '需要更好的鎬才挖得動',
  full: '背包已滿',
  body: '不能放在自己身上',
  support: '需要相鄰方塊或背牆支撐',
  occupied: null,
};
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
