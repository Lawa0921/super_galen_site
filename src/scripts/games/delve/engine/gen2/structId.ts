// structId.ts — 結構 id 與 gen2 結構地區 id 的編解碼（blueprint.ts 與 discovery.ts 共用，位元配置只寫在這裡）。
// 結構 id（hash2 吃得下的非負 int32）：i 13 bit | side 2 bit | region 5 bit | slot 5 bit | layer 3 bit，共 28 bit。
//   陸地：region = 地區 index、slot = 陸地槽序號；海（P12）：region = 0（海本身）、slot = SeaSlot.k、layer = BP_SURFACE。
// gen2 結構地區 id：GEN2_SITE_BASE + sid × 64 + part（sid = 結構 id、part = 同一個結構裡的第幾個地區，0 = 結構本身）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import type { Side } from '../regionInfo';
import type { Layer } from './bpcore';

export const LAYER_BITS = 3;
const SLOT_BITS = 5, REGION_BITS = 5, SIDE_BITS = 2, I_BITS = 13;
const LAYER_COUNT = 5, SLOT_LIMIT = 1 << SLOT_BITS, REGION_LIMIT = 1 << REGION_BITS, SIDE_LIMIT = 3, I_LIMIT = 1 << I_BITS;
const SLOT_SHIFT = LAYER_BITS, REGION_SHIFT = SLOT_SHIFT + SLOT_BITS, SIDE_SHIFT = REGION_SHIFT + REGION_BITS, I_SHIFT = SIDE_SHIFT + SIDE_BITS;
// 結構 id 的上限（28 bit）
const SID_LIMIT = I_LIMIT << I_SHIFT;

const okInt = (v: number, lim: number): boolean => Number.isInteger(v) && v >= 0 && v < lim;

export function encodeStructureId(side: Side, i: number, region: number, slot: number, layer: Layer): number {
  if (!okInt(i, I_LIMIT) || !okInt(side + 1, SIDE_LIMIT) || !okInt(region, REGION_LIMIT) || !okInt(slot, SLOT_LIMIT) || !okInt(layer, LAYER_COUNT)) {
    throw new RangeError(`structureId(${side}, ${i}, ${region}, ${slot}, ${layer})`);
  }
  return (i << I_SHIFT) | ((side + 1) << SIDE_SHIFT) | (region << REGION_SHIFT) | (slot << SLOT_SHIFT) | layer;
}

// 壞 id（負數、非整數、超過 28 bit、layer ≥ 5、side 欄位 = 3）丟 RangeError
export function decodeStructureId(id: number): { side: Side; i: number; region: number; slot: number; layer: Layer } {
  if (!okInt(id, SID_LIMIT)) throw new RangeError(`structure id ${id}`);
  const layer = id & ((1 << LAYER_BITS) - 1), slot = (id >> SLOT_SHIFT) & (SLOT_LIMIT - 1), region = (id >> REGION_SHIFT) & (REGION_LIMIT - 1);
  const sideField = (id >> SIDE_SHIFT) & ((1 << SIDE_BITS) - 1), i = id >> I_SHIFT;
  if (layer >= LAYER_COUNT || sideField >= SIDE_LIMIT) throw new RangeError(`structure id ${id}`);
  return { side: (sideField - 1) as Side, i, region, slot, layer: layer as Layer };
}

// ── gen2 結構地區 id ──
// 2 的 33 次方（高於地塊地區 id 的範圍 [2 的 32 次方, + 2 的 26 次方)）
export const GEN2_SITE_BASE = 8589934592;
const PARTS = 64;
// 範圍終點：GEN2_SITE_BASE + SID_LIMIT × 64（= 2 的 33 次方 + 2 的 34 次方）
const SITE_END = GEN2_SITE_BASE + SID_LIMIT * PARTS;

export function gen2SiteRegionId(sid: number, part: number): number {
  if (!okInt(sid, SID_LIMIT) || !okInt(part, PARTS)) throw new RangeError(`gen2SiteRegionId(${sid}, ${part})`);
  return GEN2_SITE_BASE + sid * PARTS + part;
}

export function isGen2SiteRegionId(id: number): boolean {
  return Number.isInteger(id) && id >= GEN2_SITE_BASE && id < SITE_END;
}

export function siteOfRegionId(id: number): { sid: number; part: number } {
  if (!isGen2SiteRegionId(id)) throw new RangeError(`gen2 site region id ${id}`);
  const off = id - GEN2_SITE_BASE, part = off % PARTS;
  return { sid: (off - part) / PARTS, part };
}
