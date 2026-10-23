// legacyMeta.ts — 烘焙過的舊世界（Task 16）存在存檔裡的「舊生成器附帶資料」：中央框、每欄陣列（地表 / 生態 / 深度層線）、
// 出生點、生態段 / 結構 / 地形 / 地城 / 古碑 / 珍寶 / 泉水 / 村落 / 地廳 / 地標、陶罐鑰匙、地區清單（RegionJSON）。
// 依生成順序的 id（地區 id、村落 / 地廳順序 = NPC 好感鍵、陶罐鑰匙）存進來之後不再重算（spec §5 步驟 6）；讀檔不必跑舊生成器。
// JSON 形狀 = LegacyMeta，typed array 換成 base64（Int16 一律 little-endian）。壞了 = SaveFormatError（不信任存檔內容：逐欄位驗證）。
import { fromBase64, toBase64 } from '../engine/base64';
import { frameOf, type CentralFrame } from '../engine/legacy/chunkgen';
import { regionFromJSON, toRegionJSON, type RegionJSON } from '../engine/discovery';
import { BakedSource } from '../engine/bakedSource';
import { isItemId } from '../engine/items';
import type { DelveGame } from '../engine/game';
import type { GenResult, BiomeSegment, Structure, Landform, ReservedZone, GenLayers } from '../engine/legacy/worldgen';
import type { DungeonInfo } from '../engine/legacy/gen/dungeon';
import type { VillageInfo, HallInfo } from '../engine/legacy/gen/settlements';
import type { LandmarkInfo } from '../engine/legacy/gen/landmarks';
import type { SpringSpec } from '../engine/liquid';
import type { Drop } from '../engine/loot';
import { SaveFormatError, MAX_WORLD_H, MAX_WORLD_W } from './serialize';

export interface LegacyMeta {
  frame: CentralFrame; surfaceY: number; rockY: number; cavernY: number; moltenY: number;
  surface: Int16Array; biome: Uint8Array; layers: GenLayers; spawn: { x: number; y: number };
  biomes: BiomeSegment[]; structures: Structure[]; landforms: Landform[]; dungeonZone: ReservedZone; dungeon: DungeonInfo | null;
  tablets: GenResult['tablets']; relics: GenResult['relics']; springs: SpringSpec[]; villages: VillageInfo[]; halls: HallInfo[];
  landmarks: LandmarkInfo[]; potDrops: [number, Drop[]][]; regions: RegionJSON[];
}
export type LegacyMetaJSON = Omit<LegacyMeta, 'surface' | 'biome' | 'layers'> & {
  surface: string; biome: string; layers: { rock: string; deep: string; molten: string };
};

// ── typed array ↔ base64 ──
function i16ToB64(a: Int16Array): string {
  const b = new Uint8Array(a.length * 2), v = new DataView(b.buffer);
  for (let i = 0; i < a.length; i++) v.setInt16(i * 2, a[i], true);
  return toBase64(b);
}
function bytesOf(s: unknown, n: number, what: string): Uint8Array {
  if (typeof s !== 'string') throw new SaveFormatError(`legacy: ${what}`);
  let b: Uint8Array;
  try { b = fromBase64(s); } catch { throw new SaveFormatError(`legacy: ${what} base64`); }
  if (b.length !== n) throw new SaveFormatError(`legacy: ${what} length ${b.length} != ${n}`);
  return b;
}
function b64ToI16(s: unknown, n: number, what: string): Int16Array {
  const b = bytesOf(s, n * 2, what), v = new DataView(b.buffer, b.byteOffset, b.byteLength), out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = v.getInt16(i * 2, true);
  return out;
}

/** 純資料的深複本（只有數字 / 字串 / 布林 / null / 陣列 / 物件） */
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const jsonCache = new WeakMap<LegacyMeta, LegacyMetaJSON>();
/** 已解碼的 LegacyMeta → JSON（烘焙世界每次存檔寫回同一份；內容不變，以物件快取） */
export function legacyMetaToJSON(m: LegacyMeta): LegacyMetaJSON {
  const hit = jsonCache.get(m);
  if (hit) return hit;
  const { surface, biome, layers, ...rest } = m;
  const j: LegacyMetaJSON = {
    ...copy(rest), surface: i16ToB64(surface), biome: toBase64(biome),
    layers: { rock: i16ToB64(layers.rock), deep: i16ToB64(layers.deep), molten: i16ToB64(layers.molten) },
  };
  jsonCache.set(m, j);
  return j;
}

/** 舊世界遊戲 → JSON（舊生成器的輸出 + 地區清單 + 陶罐）；已烘焙的世界回它存著的那一份 */
export function encodeLegacyMeta(game: DelveGame): LegacyMetaJSON {
  const src = game.world.source;
  if (src instanceof BakedSource) return legacyMetaToJSON(src.meta);
  const w = game.world, L = game.layers, dz = game.dungeonZone;
  if (game.genKind !== 'legacy' || !w.centralArrays || !L || !dz) throw new Error('encodeLegacyMeta: not a legacy world');
  return {
    frame: frameOf(w), surfaceY: w.surfaceY, rockY: w.rockY, cavernY: w.cavernY, moltenY: w.moltenY,
    surface: i16ToB64(w.surface), biome: toBase64(w.biome),
    layers: { rock: i16ToB64(L.rock), deep: i16ToB64(L.deep), molten: i16ToB64(L.molten) },
    spawn: { x: game.spawn.x, y: game.spawn.y },
    biomes: copy([...game.biomes]), structures: copy([...game.structures]), landforms: copy([...game.landforms]),
    dungeonZone: copy(dz), dungeon: copy(game.dungeon),
    tablets: copy([...game.tablets]), relics: copy(game.relics), springs: copy([...game.springs]),
    villages: copy([...game.villages]), halls: copy([...game.halls]), landmarks: copy([...game.landmarks]),
    potDrops: copy([...w.potDrops]),
    regions: game.regions.map(toRegionJSON),
  };
}

// ── 驗證（小型 schema：只檢查列出的欄位，型別不對 = 損毀） ──
type Sch = 'int' | 'num' | 'str' | 'bool' | 'item'
  | { arr: Sch } | { obj: Record<string, Sch> } | { opt: Sch } | { nul: Sch } | { lit: readonly string[] } | { tuple: readonly Sch[] };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function check(v: unknown, s: Sch, path: string): void {
  const bad = (): never => { throw new SaveFormatError(`legacy: ${path}`); };
  if (s === 'int') { if (!Number.isInteger(v)) bad(); return; }
  if (s === 'num') { if (typeof v !== 'number' || !Number.isFinite(v)) bad(); return; }
  if (s === 'str') { if (typeof v !== 'string') bad(); return; }
  if (s === 'bool') { if (typeof v !== 'boolean') bad(); return; }
  if (s === 'item') { if (!isItemId(v)) bad(); return; }
  if ('opt' in s) { if (v !== undefined) check(v, s.opt, path); return; }
  if ('nul' in s) { if (v !== null) check(v, s.nul, path); return; }
  if ('lit' in s) { if (typeof v !== 'string' || !s.lit.includes(v)) bad(); return; }
  if ('arr' in s) { if (!Array.isArray(v)) bad(); (v as unknown[]).forEach((e, i) => check(e, s.arr, `${path}[${i}]`)); return; }
  if ('tuple' in s) {
    if (!Array.isArray(v) || v.length !== s.tuple.length) bad();
    s.tuple.forEach((t, i) => check((v as unknown[])[i], t, `${path}[${i}]`));
    return;
  }
  if (!isObj(v)) bad();
  for (const [k, t] of Object.entries(s.obj)) check((v as Record<string, unknown>)[k], t, `${path}.${k}`);
}
const o = (obj: Record<string, Sch>): Sch => ({ obj });
const arr = (s: Sch): Sch => ({ arr: s });
const POINT = o({ x: 'int', y: 'int' }), RECT = o({ x: 'int', y: 'int', w: 'int', h: 'int' });
const SCHEMA: Record<string, Sch> = {
  frame: o({ width: 'int', height: 'int', edgeL: 'int', edgeR: 'int', cavernY: 'int', moltenY: 'int' }),
  surfaceY: 'int', rockY: 'int', cavernY: 'int', moltenY: 'int',
  spawn: POINT,
  biomes: arr(o({ biome: 'int', x0: 'int', x1: 'int' })),
  structures: arr(o({ kind: 'str', x: 'int', y: 'int', w: 'int', h: 'int', flavor: { opt: 'str' }, chest: { opt: POINT }, rope: { opt: o({ x: 'int', y0: 'int', y1: 'int' }) } })),
  landforms: arr(o({ type: 'str', x0: 'int', x1: 'int' })),
  dungeonZone: o({ x0: 'int', x1: 'int', y0: 'int', y1: 'int', side: { lit: ['left', 'right'] } }),
  dungeon: { nul: o({
    bbox: RECT, color: 'str', brick: 'int', wall: 'int',
    rooms: arr(o({ id: 'int', kind: 'str', x: 'int', y: 'int', w: 'int', h: 'int', locked: 'bool' })),
    edges: arr(o({ a: 'int', b: 'int', door: { nul: POINT }, locked: 'bool' })),
    entrance: POINT, tower: RECT, entryRoom: 'int', treasureRoom: 'int', keyRoom: 'int',
    keys: arr(o({ x: 'int', y: 'int', room: 'int', container: { lit: ['chest', 'pot'] }, golden: 'bool' })),
    treasureChest: POINT, doors: arr(o({ x: 'int', y: 'int', locked: 'bool' })),
    tablets: arr(o({ x: 'int', y: 'int', id: 'int', site: 'str' })), chests: arr(o({ x: 'int', y: 'int', room: 'int' })), platforms: 'int',
  }) },
  tablets: arr(o({ x: 'int', y: 'int', id: 'int' })),
  relics: arr(o({ x: 'int', y: 'int', item: 'item', where: 'str' })),
  springs: arr(o({ x: 'int', y: 'int', type: 'int', box: o({ x0: 'int', y0: 'int', x1: 'int', y1: 'int' }), cap: 'num', drains: arr(POINT) })),
  villages: arr(o({
    x0: 'int', x1: 'int', ground: 'int', board: POINT, style: 'int',
    houses: arr(o({ x0: 'int', x1: 'int', floorY: 'int', door: 'int', role: { lit: ['elder', 'shop', 'home'] } })),
  })),
  halls: arr(o({ x0: 'int', x1: 'int', y0: 'int', floorY: 'int', forge: POINT, cart: POINT, tunnels: arr(o({ x0: 'int', x1: 'int' })) })),
  landmarks: arr(o({ x: 'int', y: 'int', tile: 'int', site: 'str' })),
  potDrops: arr({ tuple: ['int', arr(o({ item: 'item', n: 'int' }))] }),
  regions: arr(o({})),
};

/** 存檔的 JSON → LegacyMeta（typed array 解碼、地區清單照形狀重建）；任何欄位不合法 → SaveFormatError */
export function decodeLegacyMeta(v: unknown): LegacyMeta {
  if (!isObj(v)) throw new SaveFormatError('legacy: not an object');
  for (const [k, s] of Object.entries(SCHEMA)) check(v[k], s, k);
  const j = v as unknown as LegacyMetaJSON;
  const f = j.frame;
  if (f.width < 32 || f.height < 32 || f.width > MAX_WORLD_W || f.height > MAX_WORLD_H) throw new SaveFormatError('legacy: frame size');
  const W = f.width;
  if (!isObj(j.layers)) throw new SaveFormatError('legacy: layers');
  const layers: GenLayers = { rock: b64ToI16(j.layers.rock, W, 'rock'), deep: b64ToI16(j.layers.deep, W, 'deep'), molten: b64ToI16(j.layers.molten, W, 'molten') };
  const regions = j.regions.map((r, i) => {
    try { regionFromJSON(r, layers, f.height); } catch (e) {
      if (e instanceof RangeError) throw new SaveFormatError(`legacy: regions[${i}]: ${e.message}`);
      throw e;
    }
    return copy(r);
  });
  // 地區 id = 陣列索引（Discovery 以 id 查清單）
  regions.forEach((r, i) => { if (r.id !== i) throw new SaveFormatError(`legacy: regions[${i}].id`); });
  return {
    frame: { width: f.width, height: f.height, edgeL: f.edgeL, edgeR: f.edgeR, cavernY: f.cavernY, moltenY: f.moltenY },
    surfaceY: j.surfaceY, rockY: j.rockY, cavernY: j.cavernY, moltenY: j.moltenY,
    surface: b64ToI16(j.surface, W, 'surface'), biome: bytesOf(j.biome, W, 'biome').slice(), layers,
    spawn: { x: j.spawn.x, y: j.spawn.y },
    biomes: copy(j.biomes), structures: copy(j.structures), landforms: copy(j.landforms), dungeonZone: copy(j.dungeonZone), dungeon: copy(j.dungeon),
    tablets: copy(j.tablets), relics: copy(j.relics), springs: copy(j.springs), villages: copy(j.villages), halls: copy(j.halls),
    landmarks: copy(j.landmarks), potDrops: copy(j.potDrops), regions,
  };
}
