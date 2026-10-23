// bake.test.ts — Task 16：舊世界（genVersion 7、正式尺寸）烘焙成 genVersion 8（旗標後面；這裡只測純函式 bakeWorld 與讀回來的世界）。
// fixture = Task 1 凍結的 format11-v7（seed 'fixture-v11'）；舊生成器的結果在檔案內共用一次。
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { generateWorld } from '../engine/legacy/worldgen';
import { T } from '../engine/tiles';
import { CHUNK, FIXED_DT, GEN_VERSION_V2, TILE_SIZE } from '../engine/constants';
import { X_LIMIT, chunkKey } from '../engine/coords';
import { OuterGen, OuterProfile, SEA_W, SEG_W, frameOf } from '../engine/legacy/chunkgen';
import { outerRegionId } from '../engine/discovery';
import { GEN2_VERSION, Gen2Source } from '../engine/gen2';
import { LockTable } from '../engine/gen2/locks';
import { BakedSource } from '../engine/bakedSource';
import { worldOf, loadColumns, liquidInvariant } from '../engine/gen2/testUtil';
import { Column, li } from '../engine/column';
import type { DelveGame } from '../engine/game';
import type { ChunkData, World } from '../engine/world';
import { createCharacter, type DelveCharacter } from './character';
import { normalizeAppearance } from '../engine/appearance';
import { SaveFormatError, decodeSave, validGen2 } from './serialize';
import { decodeWorld, encodeWorld, restoreSplit, saveSplitGame, type SplitRestoreResult, type VisitSave, type WorldHeader } from './worldSave';
import { decodeLegacyMeta } from './legacyMeta';
import { SplitSession, V7_BACKUP_SUFFIX, saveSplit, type SplitStore } from './split';
import { FIXTURE11_EDITS, FIXTURE11_PATH, FIXTURE11_SEED, FIXTURE11_WHO } from './legacyFixture11';
import { readLegacyFixture } from './legacyFixture';
import { bakeApplies, bakeWorld, farthestKnown, legacyRange, validBakeInfo } from './bake';

// 讀檔時有沒有跑舊生成器：generateWorld 包一層計數（其餘照原樣）
const genCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock('../engine/legacy/worldgen', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../engine/legacy/worldgen')>();
  return { ...mod, generateWorld: (...a: Parameters<typeof mod.generateWorld>) => { genCalls.n++; return mod.generateWorld(...a); } };
});

type RestoreOk = Extract<SplitRestoreResult, { ok: true }>;
const restored = (r: SplitRestoreResult): DelveGame => { if (!r.ok) throw new Error(r.message); return (r as RestoreOk).game; };

const originalBytes = new Uint8Array(readFileSync(FIXTURE11_PATH));
const fixtureWorld = decodeWorld(originalBytes);
const char: DelveCharacter = { ...createCharacter(FIXTURE11_WHO.nick, normalizeAppearance(undefined), 1), id: FIXTURE11_WHO.id };
const gen = generateWorld(FIXTURE11_SEED);
const L = restored(restoreSplit(fixtureWorld, char, { gen }));
const frame = frameOf(L.world);
const profile = new OuterProfile(FIXTURE11_SEED, frame);
const stones = L.waystones;
let ms = performance.now();
const baked = bakeWorld(fixtureWorld, char, gen, 1);
ms = performance.now() - ms;
const B = restored(restoreSplit(baked, char));
const meta = decodeLegacyMeta(baked.header.gen2!.legacy);
const bakeInfo = baked.header.gen2!.bake!;
const range = legacyRange(fixtureWorld.header, profile, stones);

const seg = (k: number) => profile.segmentAt(4200 + SEA_W + 1 + k * SEG_W)!;   // v1 東側第 k 段
const sortedChests = (w: World, x0 = -Infinity, x1 = Infinity) =>
  [...w.chests].filter(([k]) => { const x = w.tileXY(k).x; return x >= x0 && x < x1; }).sort((a, b) => a[0] - b[0]);
/** 兩個世界的一串 chunk 逐格比對（六層），回不同的 [cx, cy]（toEqual 逐元素比 5000 個 chunk 太慢） */
const LAYERS = ['fg', 'wall', 'liquid', 'liquidType', 'frozen', 'half'] as const;
const sameChunk = (a: ChunkData | null, b: ChunkData | null): boolean =>
  !!a && !!b && LAYERS.every((k) => Buffer.from(a[k]).equals(Buffer.from(b[k])));
function chunkDiffs(a: World, b: World, cols: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const cx of cols) {
    a.ensureColumn(cx); b.ensureColumn(cx);
    for (let cy = 0; cy < 38; cy++) if (!sameChunk(a.readChunk(cx, cy), b.readChunk(cx, cy))) out.push([cx, cy]);
  }
  return out;
}
/** 中央 10 個固定 (cx, cy)：含玩家挖過的 (64, 7)、兩端、最後一欄（跨進 v1 的 131）與最後一列 */
const SAMPLE10: [number, number][] = [[0, 0], [2, 12], [5, 10], [30, 25], [64, 7], [64, 8], [70, 30], [100, 20], [131, 10], [131, 37]];

/** 合成標頭：以 fixture 的 WorldHeader 為底，只放 o 指定的那一種已知點（玩家本身留在中央出生點附近） */
type Known = { pos?: number; chunkAtX?: number; fogAtX?: number; stone?: number; region?: number };
function hdr(o: Known): WorldHeader {
  const h = fixtureWorld.header, id = FIXTURE11_WHO.id;
  const ck = (x: number): number => chunkKey(Math.ceil(h.width / CHUNK), x >> 5, 9);
  const visit: VisitSave = {
    ...h.visits[id], pos: { x: (o.pos ?? 2100) * TILE_SIZE, y: 3000, vx: 0, vy: 0 }, bed: null, markers: [],
    discovery: { regions: o.region !== undefined ? [o.region] : [], lore: [], treasures: [], depthRecord: 0, distance: 0 },
  };
  delete visit.exploredOuter;
  if (o.fogAtX !== undefined) visit.exploredOuter = { chunks: [ck(o.fogAtX)], data: '' };
  const out: WorldHeader = { ...h, chunks: o.chunkAtX !== undefined ? [ck(o.chunkAtX)] : [], liquids: undefined, drops: [], visits: { [id]: visit } };
  delete out.stones;
  if (o.stone !== undefined) out.stones = [o.stone];
  return out;
}
/** 整顆碑（x、x + 1）落在段 s 內的碑 id */
const stoneIn = (s: { x0: number; x1: number }): number | null => {
  for (let k = 1; k < 30; k++) { const st = stones.byId(k); if (st && st.x >= s.x0 && st.x + 1 < s.x1) return k; }
  return null;
};

/** 記憶體 SplitStore：記錄 putSplit 次數；丟錯時不改任何記錄 */
function fakeSplitStore(o: { backupThrows?: boolean; putThrows?: boolean; slots: Record<string, Uint8Array> }) {
  const slots = new Map<string, Uint8Array>(Object.entries(o.slots).map(([k, v]) => [k, v.slice()]));
  const unused = (): never => { throw new Error('unused'); };
  const st: SplitStore & { putCalls: number; slot(k: string): Uint8Array | undefined } = {
    putCalls: 0,
    slot: (k) => slots.get(k),
    async getSlot(k) { const b = slots.get(k); return b ? { bytes: new Uint8Array(b) } : null; },
    async getCharacter() { return null; },
    async backupSlot(from, to) {
      if (o.backupThrows) throw new Error('backup failed');
      const b = slots.get(from); if (!b) throw new Error('no such slot');
      if (!slots.has(to)) slots.set(to, b.slice());
    },
    async putSplit(slot, world, character) {
      st.putCalls++;
      if (o.putThrows) throw new Error('put failed');
      slots.set(slot, world.bytes);
      return { slot, seed: world.seed, savedAt: character.savedAt, bytes: world.bytes.length };
    },
    listWorlds: async () => [], listCharacters: async () => [],
    deleteWorld: async () => unused(), deleteCharacter: async () => unused(), putCharacter: async () => unused(),
  };
  return st;
}

/** g.liquids 目前喚醒格所在的 chunk 鍵（只看常駐欄） */
function awakeChunks(g: DelveGame): number[] {
  const w = g.world, out = new Set<number>();
  for (const cx of w.residentColumns()) for (let y = 0; y < w.height; y++) for (let x = cx * CHUNK; x < cx * CHUNK + CHUNK; x++) {
    if (g.liquids.isAwake(x, y)) out.add(w.chunkIndex(cx, y >> 5));
  }
  return [...out].sort((a, b) => a - b);
}
/** 第一個安靜 chunk 裡、4 鄰有液體的石頭 / 泥土格（那一欄先載入）與那格液體 */
function solidInQuietChunk(g: DelveGame): { x: number; y: number; lx: number; ly: number } {
  const w = g.world;
  for (const k of [...w.bakedQuiet].sort((a, b) => a - b)) {
    const { cx, cy } = w.chunkCoords(k);
    if (cx < 0 || cx >= w.chunksX) continue;
    w.ensureColumn(cx);
    for (let y = cy * CHUNK; y < Math.min(w.height - 1, cy * CHUNK + CHUNK); y++) for (let x = cx * CHUNK + 1; x < cx * CHUNK + CHUNK - 1; x++) {
      const t = w.getFg(x, y);
      if (t !== T.STONE && t !== T.DIRT) continue;
      for (const [lx, ly] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) if (w.getLiquid(lx, ly) && (ly >> 5) === cy) return { x, y, lx, ly };
    }
  }
  throw new Error('no solid next to liquid in a quiet chunk');
}

describe('舊世界烘焙（Task 16）', { timeout: 120_000 }, () => {
  it('bakeApplies：只有 v7 且正式尺寸', () => {
    expect(bakeApplies({ genVersion: 7, width: 4200, height: 1200 })).toBe(true);
    expect(bakeApplies({ genVersion: 7, width: 200, height: 100 })).toBe(false);
    expect(bakeApplies({ genVersion: 8, width: 4200, height: 1200 })).toBe(false);
  });

  it('legacyRange：玩家在 v1 東海 → 東接縫 = 4200 + SEA_W、從大陸開始；西側只有中央 → 西接縫 = −SEA_W、從大陸開始', () => {
    const r = legacyRange(hdr({ pos: 4300 }), profile, stones);
    expect(r.east).toMatchObject({ x: 4200 + SEA_W, start: 'continent', seaY: frame.edgeR + 1, shore: profile.surfaceAt(4200 + SEA_W - 1) });
    expect(r.west).toMatchObject({ x: -SEA_W, start: 'continent', seaY: frame.edgeL + 1, shore: profile.surfaceAt(-SEA_W) });
    expect(legacyRange(hdr({ pos: -100 }), profile, stones).west).toMatchObject({ x: -SEA_W, start: 'continent' });
  });

  it('legacyRange：改過的 chunk 在 v1 陸地段中間 / 玩家站在段末前一格 → 到那一段的末端、從海開始；西側負 x 對稱', () => {
    const s = seg(2);
    const e = legacyRange(hdr({ chunkAtX: (s.x0 + s.x1) >> 1 }), profile, stones).east;
    expect(e).toMatchObject({ x: s.x1, start: 'sea', seaY: frame.edgeR + 1, shore: profile.surfaceAt(s.x1 - 1) });
    // 玩家身體右緣（20 px）剛好落在段末前一格
    expect(legacyRange(hdr({ pos: s.x1 - 2 }), profile, stones).east).toMatchObject({ x: s.x1, start: 'sea' });
    // 整個 chunk 都在段內（chunk 的最後一欄 < s.x1）→ 這一段；跨過段界的 chunk → 舊範圍包住整個 chunk（延到下一段的末端）
    const inside = (s.x1 & ~31) - 1;
    expect(legacyRange(hdr({ chunkAtX: inside }), profile, stones).east.x).toBe(s.x1);
    const straddle = legacyRange(hdr({ chunkAtX: s.x1 - 1 }), profile, stones).east;
    expect(straddle.x).toBe(profile.segmentAt((s.x1 - 1) | 31)!.x1);
    expect(straddle.x).toBeGreaterThan((s.x1 - 1) | 31);
    const ws = profile.segmentAt(-SEA_W - 1 - 3 * SEG_W)!;
    expect(legacyRange(hdr({ pos: ws.x0 + 3 }), profile, stones).west).toMatchObject({ x: ws.x0, start: 'sea', seaY: frame.edgeL + 1, shore: profile.surfaceAt(ws.x0) });
    expect(legacyRange(hdr({ chunkAtX: ws.x0 + 3 }), profile, stones).west.x).toBe(profile.segmentAt((ws.x0 + 3) & ~31)!.x0);
  });

  it('legacyRange：只有迷霧 / 只有傳送碑 / 只有已發現地區在遠處，也算進去', () => {
    // 有整顆碑的那一段（第 4 段起往外找；碑每 1600 格一顆，不是每段都有）
    let k = 4;
    while (stoneIn(seg(k)) === null) k++;
    const s = seg(k);
    for (const h of [hdr({ fogAtX: s.x0 + 10 }), hdr({ stone: stoneIn(s)! }), hdr({ region: outerRegionId(s.k + 1, 1) })]) {
      expect(legacyRange(h, profile, stones).east.x).toBe(s.x1);
    }
    expect(farthestKnown(hdr({ region: outerRegionId(s.k + 1, 1) }), profile, stones).east).toBeGreaterThanOrEqual(s.x0);
    // 西海被發現（地區 id 段號 0）→ 西接縫在海的末端
    expect(legacyRange(hdr({ region: outerRegionId(0, -1) }), profile, stones).west).toMatchObject({ x: -SEA_W, start: 'continent' });
  });

  it('fixture 的舊範圍：東到東外圍第一段的末端、西到西外圍第一段的末端，兩側都從海開始', () => {
    expect(range.east).toMatchObject({ x: profile.segmentAt(4200 + SEA_W + 300)!.x1, start: 'sea' });
    expect(range.west).toMatchObject({ x: profile.segmentAt(-700)!.x0, start: 'sea' });
    expect({ east: bakeInfo.east, west: bakeInfo.west, frame: bakeInfo.frame }).toEqual({ east: range.east, west: range.west, frame });
  });

  it('烘焙後的標頭：genVersion 8、outerGen = GEN2_VERSION、gen2 = { locks: [], bake, legacy }、所有中央 chunk 都存', () => {
    const h = baked.header;
    expect(h.genVersion).toBe(GEN_VERSION_V2);
    expect(h.outerGen).toBe(GEN2_VERSION);
    expect(h.bounds).toBe('infinite');
    expect(h.gen2!.locks).toEqual([]);
    const set = new Set(h.chunks);
    for (let cy = 0; cy < 38; cy++) for (let cx = 0; cx < 132; cx++) expect(set.has(cy * 132 + cx)).toBe(true);
    expect(new Set(h.liquids!.chunks).size).toBeGreaterThanOrEqual(132 * 38);
    expect(Object.keys(h.visits)).toEqual(Object.keys(fixtureWorld.header.visits));
    // 這個世界沒來過的角色拿來烘焙：不替它留下 visit
    const other = bakeWorld(fixtureWorld, { ...char, id: 'other-char' }, gen, 1);
    expect(other.header.visits).toEqual(fixtureWorld.header.visits);
  });

  it('烘焙前後逐格相同', () => {
    expect(chunkDiffs(B.world, L.world, Array.from({ length: 132 }, (_, cx) => cx))).toEqual([]);
    expect(sortedChests(B.world, range.west.x, range.east.x)).toEqual(sortedChests(L.world, range.west.x, range.east.x));
    expect([...B.world.potDrops]).toEqual([...L.world.potDrops]);
    for (let x = range.west.x; x < range.east.x; x += 7) {
      expect(B.world.surfaceAt(x)).toBe(L.world.surfaceAt(x));
      expect(B.world.biomeAt(x)).toBe(L.world.biomeAt(x));
      expect(B.world.layersAt(x)).toEqual(L.world.layersAt(x));
      expect(B.world.regionAt(x)).toEqual(L.world.regionAt(x));
    }
    expect(chunkDiffs(B.world, L.world, [-3, -10, 140, 150])).toEqual([]);
    // 接縫內側：舊範圍最外面那 32 欄（接縫封口只改 gen2 那一側）
    for (const x0 of [range.west.x, range.east.x - 32]) {
      B.world.ensureColumn(x0 >> 5); B.world.ensureColumn((x0 + 31) >> 5); L.world.ensureColumn(x0 >> 5); L.world.ensureColumn((x0 + 31) >> 5);
      for (let x = x0; x < x0 + 32; x++) for (let y = 0; y < 1200; y++) {
        if (B.world.getFg(x, y) !== L.world.getFg(x, y) || B.world.getLiquid(x, y) !== L.world.getLiquid(x, y)) throw new Error(`seam inner ${x},${y}`);
      }
    }
    expect(B.regions.map((r) => [r.id, r.name, r.x, r.y, r.w, r.h])).toEqual(L.regions.map((r) => [r.id, r.name, r.x, r.y, r.w, r.h]));
    expect(B.spawn).toEqual(L.spawn);
    for (const id of [0, 1, -1]) expect(B.waystones.byId(id)).toEqual(L.waystones.byId(id));
    // ±2 在這份 fixture 裡已經過接縫（裁決 P6）：落在 gen2 陸地
    expect(B.waystones.byId(2)!.x).toBeGreaterThanOrEqual(range.east.x);
    expect(B.waystones.byId(-2)!.x).toBeLessThan(range.west.x);
    for (const id of [2, -2]) expect(['wild', 'culture']).toContain(B.world.regionAt(B.waystones.byId(id)!.x).kind);
    expect(B.villages).toEqual(L.villages); expect(B.halls).toEqual(L.halls);
    expect(B.landmarks).toEqual(L.landmarks); expect(B.dungeon).toEqual(L.dungeon); expect(B.tablets).toEqual(L.tablets);
    expect(B.springs).toEqual(L.springs); expect(B.layers).toEqual(L.layers);
    // 外圍地區：舊範圍內 = v1 的 id / 名字；接縫外 = gen2
    for (const x of [4300, 4900, -300, -900]) {
      expect(B.discovery.visit(x, 200).map((r) => [r.id, r.name])).toEqual(L.discovery.visit(x, 200).map((r) => [r.id, r.name]));
    }
  });

  it('玩家的改動保留（fixture 的挖洞、木板、箱子內容）', () => {
    const E = FIXTURE11_EDITS;
    for (const [x, y] of E.dug) { B.world.ensureColumn(x >> 5); expect(B.world.getFg(x, y)).toBe(T.AIR); }
    for (const [x, y] of E.planks) { B.world.ensureColumn(x >> 5); expect(B.world.getFg(x, y)).toBe(T.PLANKS); }
    expect(B.world.chests.get(B.world.idx(E.chest.x, E.chest.y))!.filter(Boolean)).toEqual(E.chest.items);
  });

  it('接縫外是 gen2', () => {
    const e = range.east;
    expect(B.world.regionAt(e.x + (e.start === 'sea' ? 5 : 0)).kind).toMatch(e.start === 'sea' ? /^sea$/ : /^(wild|culture)$/);
    expect(B.world.regionAt(e.x - 1).kind).toBe('wild');   // v1 的陸地段
    if (e.start === 'sea') expect(B.world.source!.waterTopAt!(e.x + 50)).toBe(frame.edgeR + 1);
    const c1 = [B.gen2()!.layout.landmass(1, e.start === 'sea' ? 2 : 1), B.gen2()!.layout.landmass(-1, range.west.start === 'sea' ? 2 : 1)];
    for (const m of c1) expect(m.kind).toBe('continent');
    expect(c1.filter((m) => m.culture === 'mistbamboo')).toHaveLength(1);
  });

  it('烘焙世界讀檔不必跑舊生成器、genKind baked、存回再讀一樣', () => {
    const n0 = genCalls.n;
    const B1 = restored(restoreSplit(baked, char));   // 不傳 gen
    expect(genCalls.n).toBe(n0);
    expect(B1.genKind).toBe('baked');
    expect(B1.gen2()).toBe((B1.world.source as BakedSource).gen2);
    const { world: w2 } = saveSplitGame(B1, FIXTURE11_WHO, { worldId: baked.header.worldId, worldName: baked.header.worldName, visits: baked.header.visits }, 2);
    expect(w2.header.genVersion).toBe(GEN_VERSION_V2);
    expect(w2.header.gen2!.bake).toEqual(bakeInfo);
    expect(w2.header.gen2!.legacy).toEqual(baked.header.gen2!.legacy);
    const B2 = restored(restoreSplit(decodeWorld(encodeWorld(w2)), char));
    expect(genCalls.n).toBe(n0);
    for (const [cx, cy] of SAMPLE10) {
      B1.world.ensureColumn(cx); B2.world.ensureColumn(cx);
      expect(B2.world.readChunk(cx, cy)).toEqual(B1.world.readChunk(cx, cy));
    }
    expect(chunkDiffs(B2.world, B1.world, Array.from({ length: 132 }, (_, cx) => cx))).toEqual([]);
    expect(sortedChests(B2.world)).toEqual(sortedChests(B1.world));
    expect(B2.regions.map((r) => r.name)).toEqual(B1.regions.map((r) => r.name));
  });

  it('安靜 chunk：讀檔後沒有任何安靜 chunk 被喚醒；在安靜 chunk 挖一格 → 從 bakedQuiet 移除且旁邊的液體被喚醒', () => {
    expect(B.world.bakedQuiet.size).toBeGreaterThan(4000);
    // 玩家改過的中央 chunk（挖洞那一塊）不是安靜的
    expect(B.world.bakedQuiet.has(B.world.chunkIndex(FIXTURE11_EDITS.chest.x >> 5, FIXTURE11_EDITS.chest.y >> 5))).toBe(false);
    B.step(FIXED_DT);
    expect(awakeChunks(B).filter((k) => B.world.bakedQuiet.has(k))).toEqual([]);
    const { x, y, lx, ly } = solidInQuietChunk(B), ck = B.world.chunkIndex(x >> 5, y >> 5);
    expect(B.liquids.isAwake(lx, ly)).toBe(false);
    expect(B.mineInstant(x, y)).toBe(true);
    expect(B.world.bakedQuiet.has(ck)).toBe(false);
    expect(B.liquids.isAwake(lx, ly)).toBe(true);
    // 存檔寫回目前的安靜 chunk
    const s = saveSplitGame(B, FIXTURE11_WHO, { worldId: 'w', worldName: 'w', visits: {} }, 3).world.header.gen2!.bake!;
    let k = 0; const quiet = s.quiet.map((d) => (k += d));
    expect(new Set(quiet)).toEqual(B.world.bakedQuiet);
  });

  it('失敗注入（裁決 P7）：烘焙中途丟錯 → 丟出、輸入原封不動；備份或寫入丟錯 → 原 v7 記錄位元組不變', async () => {
    const before = structuredClone(fixtureWorld), charBefore = structuredClone(char);
    for (const stage of ['restore', 'snapshot', 'meta', 'split'] as const) {
      expect(() => bakeWorld(fixtureWorld, char, gen, 1, (s) => { if (s === stage) throw new Error('inject ' + s); })).toThrow('inject ' + stage);
    }
    const seen: string[] = [];
    bakeWorld(fixtureWorld, char, gen, 1, (s) => { seen.push(s); });
    expect(seen).toEqual(['restore', 'snapshot', 'meta', 'split']);
    expect(fixtureWorld).toEqual(before);
    expect(char).toEqual(charBefore);
    for (const fail of [{ backupThrows: true }, { putThrows: true }]) {
      const store = fakeSplitStore({ ...fail, slots: { 'w-1': originalBytes } }), s = SplitSession.fromLoaded(baked.header, char, 'w-1');
      s.pendingBackup = V7_BACKUP_SUFFIX;
      await expect(saveSplit(store, s, B, 2)).rejects.toThrow();
      expect(store.slot('w-1')).toEqual(originalBytes);
      expect(s.pendingBackup).toBe(V7_BACKUP_SUFFIX);
      if (fail.backupThrows) expect(store.putCalls).toBe(0); else expect(store.slot('w-1' + V7_BACKUP_SUFFIX)).toEqual(originalBytes);
    }
    // 都成功：先備份原檔、再寫 v8，之後不再備份
    const store = fakeSplitStore({ slots: { 'w-1': originalBytes } }), s = SplitSession.fromLoaded(baked.header, char, 'w-1');
    s.pendingBackup = V7_BACKUP_SUFFIX;
    await saveSplit(store, s, B, 2);
    expect(store.slot('w-1' + V7_BACKUP_SUFFIX)).toEqual(originalBytes);
    expect(decodeWorld(store.slot('w-1')!).header.genVersion).toBe(GEN_VERSION_V2);
    expect(s.pendingBackup).toBeNull();
  });

  it('接縫（P13）：兩種接縫都沒有空氣縫、沒有液體牆', () => {
    // v1 自己的熔岩層本來就有階梯狀的液面（舊生成器的既有狀況，舊世界一樣）：純 v1 世界在舊範圍那一側就有的違規不算接縫造成的
    const v1w = worldOf(new OuterGen(FIXTURE11_SEED, frame));
    let sealed = 0;
    for (const h of [hdr({ pos: 4300 }), hdr({ chunkAtX: (seg(2).x0 + seg(2).x1) >> 1 }), fixtureWorld.header]) {
      const rg = legacyRange(h, profile, stones);
      const src = new BakedSource(FIXTURE11_SEED, meta, { ...bakeInfo, east: rg.east, west: rg.west }, new LockTable(), false), w = worldOf(src);
      for (const sx of [rg.east.x, rg.west.x]) {
        loadColumns(w, sx - 40, sx + 40); loadColumns(v1w, sx - 40, sx + 40);
        expect(Math.abs(src.surfaceAt(sx) - src.surfaceAt(sx - 1))).toBeLessThanOrEqual(4);
        const inherent = new Set(liquidInvariant(v1w, sx - 40, sx + 40).filter((p) => src.inLegacy(p.x)).map((p) => `${p.x},${p.y}`));
        expect(liquidInvariant(w, sx - 40, sx + 40).filter((p) => !inherent.has(`${p.x},${p.y}`))).toEqual([]);
        // 舊範圍那一側與純 v1 逐格相同；gen2 那一側只有緊貼接縫的一欄（gx）被封口，再往外一欄（ox）與純 gen2 相同
        const gx = sx === rg.east.x ? sx : sx - 1, ox = sx === rg.east.x ? gx + 1 : gx - 1;
        const g2 = new Gen2Source(FIXTURE11_SEED, { origin: { home: null, east: rg.east, west: rg.west }, recordLocks: false });
        const rawCol = (x: number): Column => { const c = new Column(x >> 5, 1200); g2.fill(c, x, x + 1); return c; };
        const rg2 = rawCol(gx), ro = rawCol(ox), chestYs = new Set(g2.objectsIn(gx, gx + 1).map((c) => c.y));
        for (let y = 0; y < 1200; y++) {
          for (const x of [sx - 2, sx - 1, sx, sx + 1]) {
            if (src.inLegacy(x) && (w.getFg(x, y) !== v1w.getFg(x, y) || w.getLiquid(x, y) !== v1w.getLiquid(x, y))) throw new Error(`v1 side changed ${x},${y}`);
          }
          if (w.getFg(gx, y) !== rg2.fg[li(gx, y)]) {
            // 只封空氣格 / 本來有液體的格，不封生成物件那格
            expect(w.getFg(gx, y)).toBe(T.STONE);
            expect(rg2.fg[li(gx, y)] === T.AIR || rg2.liquid[li(gx, y)] > 0).toBe(true);
            expect(chestYs.has(y)).toBe(false);
            sealed++;
          }
          if (w.getFg(ox, y) !== ro.fg[li(ox, y)] || w.getLiquid(ox, y) !== ro.liquid[li(ox, y)]) throw new Error(`gen2 beyond seam column changed ${ox},${y}`);
        }
      }
    }
    expect(sealed).toBeGreaterThan(0);
    expect(new Set([legacyRange(hdr({ pos: 4300 }), profile, stones).east.start, legacyRange(hdr({ chunkAtX: (seg(2).x0 + seg(2).x1) >> 1 }), profile, stones).east.start]))
      .toEqual(new Set(['continent', 'sea']));
  });

  it('壞的烘焙存檔：bake / legacy 只有一個、bake 壞掉、缺中央 chunk → 損毀', () => {
    const g = baked.header.gen2!;
    expect(validGen2(JSON.parse(JSON.stringify(g)))).toEqual(g);
    for (const bad of [{ locks: [], bake: g.bake }, { locks: [], legacy: g.legacy }, { ...g, legacy: { ...g.legacy, villages: 3 } }]) {
      expect(() => validGen2(bad)).toThrow(SaveFormatError);
    }
    const bakes: unknown[] = [
      null, { ...g.bake, east: { ...g.bake!.east, x: 4000 } }, { ...g.bake, west: { ...g.bake!.west, x: 5 } },
      { ...g.bake, east: { ...g.bake!.east, start: 'land' } }, { ...g.bake, quiet: [-1] }, { ...g.bake, quiet: [5, 0] },
      { ...g.bake, quiet: [132 * 38] }, { ...g.bake, frame: { ...g.bake!.frame, width: 'x' } },
    ];
    for (const b of bakes) expect(() => validBakeInfo(b)).toThrow(SaveFormatError);
    expect(validBakeInfo(JSON.parse(JSON.stringify(g.bake)))).toEqual(g.bake);
    // 世界檔層：只拿掉 legacy → decodeWorld 損毀
    const noLegacy = { ...baked, header: { ...baked.header, gen2: { locks: [], bake: g.bake } } };
    expect(() => decodeWorld(encodeWorld(noLegacy as typeof baked))).toThrow(SaveFormatError);
    // 少一個中央 chunk → 讀檔失敗（不會讀出一片空氣）
    const chunks = new Map(baked.chunks); chunks.delete(64 + 7 * 132);
    const holed = { header: { ...baked.header, chunks: baked.header.chunks.filter((k) => k !== 64 + 7 * 132) }, chunks };
    const r = restoreSplit(holed, char);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('format');
  });

  it('接縫封口不碰箱子 / 門等非空氣格（箱子照樣登錄），只封空氣格', () => {
    const src = new BakedSource(FIXTURE11_SEED, meta, bakeInfo, new LockTable(), false);
    const vx = bakeInfo.west.x, gx = vx - 1;
    const inner = new Column(vx >> 5, 1200, false);
    new OuterGen(FIXTURE11_SEED, frame).fill(inner, vx, vx + 1);
    const ys: number[] = [];
    for (let y = 0; y < 1200 && ys.length < 3; y++) if (inner.liquid[li(vx, y)] > 0 && inner.fg[li(vx, y)] === T.AIR) ys.push(y);
    expect(ys).toHaveLength(3);
    const [yChest, yDoor, yAir] = ys;
    // gen2 那一欄在這三列放箱子 / 開著的門 / 空氣（都沒有液體），箱子由 objectsIn 回報
    const g2 = src.gen2, fill0 = g2.fill.bind(g2), objs0 = g2.objectsIn.bind(g2);
    g2.fill = (col, a, b) => {
      fill0(col, a, b);
      if (gx < a || gx >= b) return;
      for (const [y, t] of [[yChest, T.CHEST], [yDoor, T.DOOR_OPEN], [yAir, T.AIR]] as const) { col.fg[li(gx, y)] = t; col.liquid[li(gx, y)] = 0; col.liquidType[li(gx, y)] = 0; }
    };
    g2.objectsIn = (a, b) => [...objs0(a, b), ...(gx >= a && gx < b ? [{ x: gx, y: yChest, slots: [{ item: 'copper_coin' as const, count: 3 }] }] : [])];
    const w = worldOf(src);
    w.ensureColumn(gx >> 5);
    expect(w.getFg(gx, yChest)).toBe(T.CHEST);
    expect(w.getFg(gx, yDoor)).toBe(T.DOOR_OPEN);
    expect(w.getFg(gx, yAir)).toBe(T.STONE);
    expect(w.chests.get(w.idx(gx, yChest))?.[0]).toEqual({ item: 'copper_coin', count: 3 });
  });

  it('烘焙結果自己先過讀檔驗證：已知點逼近 X_LIMIT（接縫會到 X_LIMIT 以外）→ bakeWorld 丟錯、輸入不動', () => {
    const id = FIXTURE11_WHO.id, v = fixtureWorld.header.visits[id];
    const far: typeof fixtureWorld = { ...fixtureWorld, header: { ...fixtureWorld.header, visits: { [id]: { ...v, markers: [{ x: X_LIMIT - 1, y: 300 }] } } } };
    expect(legacyRange(far.header, profile, stones).east.x).toBeGreaterThanOrEqual(X_LIMIT);
    const before = structuredClone(far);
    expect(() => bakeWorld(far, char, gen, 1)).toThrow(/does not validate.*side x/);
    expect(far).toEqual(before);
  });

  it('bake.frame 與 legacy.frame 不同 → 損毀', () => {
    const g = baked.header.gen2!;
    expect(() => validGen2({ ...g, bake: { ...g.bake, frame: { ...g.bake!.frame, edgeR: g.bake!.frame.edgeR + 1 } } })).toThrow(SaveFormatError);
    expect(() => validBakeInfo(g.bake, { ...meta.frame, width: 4232 })).toThrow(SaveFormatError);
  });

  it('小尺寸 fixture（format9 / format10）判定不適用，照舊載入', () => {
    const fixture9 = decodeSave(readLegacyFixture());
    const fixture10 = decodeWorld(new Uint8Array(readFileSync(resolve(process.cwd(), 'src/scripts/games/delve/save/__fixtures__/format10.delve'))));
    for (const h of [fixture9.header, fixture10.header]) expect(bakeApplies(h)).toBe(false);
    expect(() => bakeWorld(fixture10, char, gen, 1)).toThrow();
  });

  it('大小量測（回報、不阻擋）', () => {
    const raw = encodeWorld(baked), bytes = gzipSync(raw).length;
    console.info('[bake size] gzip bytes', bytes, 'raw bytes', raw.length, 'header json bytes', JSON.stringify(baked.header).length, 'bake ms', Math.round(ms));
    expect(bytes).toBeLessThan(16 * 1024 * 1024);
  });
});

