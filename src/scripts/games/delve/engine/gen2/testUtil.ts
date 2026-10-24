// testUtil.ts — gen2 測試共用（只給 *.test.ts 用，不進遊戲路徑）：填一欄、位元組、source 模式的 World、
// 取樣陸地地區、空氣 BFS、靜態液體不變量、地城的可解性。本資料夾的非測試檔會被 grep 禁用 API，這裡一樣遵守。
import { Column, type ColumnSource } from '../column';
import { CHUNK, WORLD_H } from '../constants';
import { World, LIQ } from '../world';
import { T, DUNGEON_COLORS, isSolidTile } from '../tiles';
import { LIQ_MAX } from '../liquidKind';
import type { RegionInfo } from '../regionInfo';
import type { DungeonInfo } from '../genTypes';
import { Gen2Source } from './index';
import type { Blueprint } from './bpcore';

// 第 cx 欄整欄（32 格）由 src 填
export function fillCol(src: ColumnSource, cx: number): Column {
  const col = new Column(cx, WORLD_H);
  src.fill(col, cx * CHUNK, cx * CHUNK + CHUNK);
  return col;
}

// 一欄七層的全部位元組
export const bytes = (c: Column): Uint8Array => new Uint8Array(c.view.buffer);

// 4200 × 1200、infinite、每一欄都問 src
export function worldOf(src: ColumnSource): World {
  return new World(4200, WORLD_H, { bounds: 'infinite', source: src, central: 'source' });
}

// 讓涵蓋 world x ∈ [x0, x1) 的欄都常駐
export function loadColumns(w: World, x0: number, x1: number): void {
  for (let cx = x0 >> 5; cx <= (x1 - 1) >> 5; cx++) w.ensureColumn(cx);
}

// 陸地地區（home / culture / wild）：家鄉的全部地區（home = true）+ 每側前 perSide 片大陸的全部地區
export function sampleRegions(src: Gen2Source, o: { home: boolean; perSide: number }): RegionInfo[] {
  const out: RegionInfo[] = [];
  if (o.home) {
    const h = src.layout.landmassAt(2100);
    if (!h || h.kind !== 'home') throw new Error('no gen2 home');
    out.push(...h.regions);
  }
  for (const side of [1, -1] as const) {
    let n = 0;
    for (let i = 1; n < o.perSide; i++) {
      const m = src.layout.landmass(side, i);
      if (m.kind !== 'continent') continue;
      out.push(...m.regions);
      n++;
    }
  }
  return out;
}

// 第 x 欄由上往下第一個實心格的 y（skip(y) = true 的格不算；整欄都不是 = 世界高）
export function firstSolid(w: World, x: number, skip?: (y: number) => boolean): number {
  for (let y = 0; y < w.height; y++) if (isSolidTile(w.getFg(x, y)) && !skip?.(y)) return y;
  return w.height;
}

// 從 (x, y) 走 4 鄰的空氣格（沒有液體）、x ∈ [xLo, xHi]，走得到任一 y ≥ deepAt(x) 的格 = true
export function bfsReachesDepth(w: World, x: number, y: number, deepAt: (x: number) => number, xLo: number, xHi: number): boolean {
  const H = w.height, wd = xHi - xLo + 1;
  const open = (px: number, py: number): boolean => w.getFg(px, py) === T.AIR && w.getLiquid(px, py) === 0;
  if (!open(x, y)) return false;
  const deep: number[] = [];
  for (let px = xLo; px <= xHi; px++) deep.push(deepAt(px));
  const seen = new Uint8Array(wd * H);
  const q: number[] = [x, y];
  seen[(y * wd) + x - xLo] = 1;
  for (let h = 0; h < q.length; h += 2) {
    const px = q[h], py = q[h + 1];
    if (py >= deep[px - xLo]) return true;
    for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
      if (nx < xLo || nx > xHi || ny < 0 || ny >= H) continue;
      const k = ny * wd + nx - xLo;
      if (seen[k] || !open(nx, ny)) continue;
      seen[k] = 1;
      q.push(nx, ny);
    }
  }
  return false;
}

// 靜態液體不變量：x ∈ [x0, x1) 的每個水 / 熔岩 / 蜂蜜格都是滿格、不在實心格裡，下方與左右是實心或同種滿格液體（世界底下算實心）。回違規格。
// 液體可以泡著非實心物件（箱子、木樑；liquid.ts 只擋實心格），所以沉船裡泡水的箱子 / 桅杆也算靜止。
export function liquidInvariant(w: World, x0: number, x1: number): { x: number; y: number }[] {
  const bad: { x: number; y: number }[] = [];
  const H = w.height;
  const holds = (x: number, y: number, type: number): boolean =>
    y >= H || isSolidTile(w.getFg(x, y)) || (w.getLiquid(x, y) === LIQ_MAX && w.getLiquidType(x, y) === type);
  for (let x = x0; x < x1; x++) {
    for (let y = 0; y < H; y++) {
      if (w.getLiquid(x, y) === 0) continue;
      const type = w.getLiquidType(x, y);
      const ok = (type === LIQ.WATER || type === LIQ.LAVA || type === LIQ.HONEY) && w.getLiquid(x, y) === LIQ_MAX && !isSolidTile(w.getFg(x, y))
        && holds(x, y + 1, type) && holds(x - 1, y, type) && holds(x + 1, y, type);
      if (!ok) bad.push({ x, y });
    }
  }
  return bad;
}

// 測試檔共用的小工具
export const range = (a: number, b: number): number[] => Array.from({ length: b - a }, (_, k) => a + k);
export const SEEDS5 = ['s-a', 's-b', 's-c', 's-d', 's-e'];
export const SEEDS50 = Array.from({ length: 50 }, (_, k) => `anc-${k}`);

// 每個種子一個 Gen2Source（同一個測試檔內共用）
const SRC = new Map<string, Gen2Source>();
export function srcOf(seed: string): Gen2Source {
  let s = SRC.get(seed);
  if (!s) { s = new Gen2Source(seed); SRC.set(seed, s); }
  return s;
}
// 家鄉地塊（與 [home.x0, home.x1) 相交）的全部藍圖，依 (layer, id) 排序
export function homeBlueprints(seed: string): Blueprint[] {
  const s = srcOf(seed), h = s.layout.origin.home;
  if (!h) throw new Error('no gen2 home');
  return s.blueprints.overlapping(h.x0, h.x1);
}
// 依序找種子（SEEDS5）家鄉裡第一份 kind 藍圖
export function firstOf(kind: string): { src: Gen2Source; b: Blueprint } {
  for (const seed of SEEDS5) { const b = homeBlueprints(seed).find((q) => q.kind === kind); if (b) return { src: srcOf(seed), b }; }
  throw new Error(`no home ${kind}`);
}

// ── 外框 b 內的格（藍圖外框 = { x, y, w, h }）──
type Box = { x: number; y: number; w: number; h: number };
// 讓外框涵蓋的欄都常駐
export const loadBox = (w: World, b: Box): void => loadColumns(w, b.x, b.x + b.w);
// 外框內 fg = tile 的格數
export function countIn(w: World, b: Box, tile: number): number {
  let n = 0;
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (w.getFg(x, y) === tile) n++;
  return n;
}
// 外框內有 type 液體的格數
export function liquidIn(w: World, b: Box, type: number): number {
  let n = 0;
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (w.getLiquid(x, y) > 0 && w.getLiquidType(x, y) === type) n++;
  return n;
}
// 外框內 liquid / liquidType 的複本
export function snapshotLiquid(w: World, b: Box): number[] {
  const out: number[] = [];
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) out.push(w.getLiquid(x, y), w.getLiquidType(x, y));
  return out;
}

// ── 地城的可解性（原 legacy/gen/dungeon.test.ts 的兩個檢查，改成吃 DungeonInfo / World；M2b 刪 legacy 後仍在）──
type Verdict = { ok: true } | { ok: false; why: string };
const bad = (why: string): Verdict => ({ ok: false, why });

// 房間圖：鑰匙數 = 上鎖的門數 = 上鎖的邊數；不開鎖就到得了所有地城鑰匙、到不了寶藏室與放金鑰匙的神殿；
// 金鑰匙在上鎖的神殿（不是寶藏室）、寶藏室上鎖；拿齊鑰匙逐一開門 → 所有房間都到得了
export function solvable(d: DungeonInfo): Verdict {
  const lockedEdges = d.edges.filter((e) => e.locked), regular = d.keys.filter((k) => !k.golden), golden = d.keys.filter((k) => k.golden);
  if (regular.length !== lockedEdges.length) return bad(`keys ${regular.length} vs locked edges ${lockedEdges.length}`);
  if (d.doors.filter((q) => q.locked).length !== lockedEdges.length) return bad('locked doors vs locked edges');
  if (golden.length !== 1) return bad(`golden keys ${golden.length}`);
  const T_ = d.rooms[d.treasureRoom], K = d.rooms[d.keyRoom];
  if (T_.kind !== 'treasure' || !T_.locked) return bad('treasure room not locked');
  if (K.kind !== 'shrine' || !K.locked || golden[0].room !== d.keyRoom) return bad('golden key not in the locked shrine');
  const reach = (open: (e: DungeonInfo['edges'][number]) => boolean): Set<number> => {
    const seen = new Set([d.entryRoom]), q = [d.entryRoom];
    while (q.length) {
      const a = q.pop()!;
      for (const e of d.edges) {
        if (!open(e)) continue;
        const o = e.a === a ? e.b : e.b === a ? e.a : -1;
        if (o >= 0 && !seen.has(o)) { seen.add(o); q.push(o); }
      }
    }
    return seen;
  };
  const free = reach((e) => !e.locked);
  for (const k of regular) if (!free.has(k.room)) return bad(`key in room ${k.room} behind a lock`);
  if (free.has(d.treasureRoom) || free.has(d.keyRoom)) return bad('locked room reachable without a key');
  let keys = regular.length, got = free;
  const opened = new Set<number>();
  for (let guard = 0; guard <= lockedEdges.length; guard++) {
    const i = lockedEdges.findIndex((e, k) => !opened.has(k) && (got.has(e.a) || got.has(e.b)));
    if (i < 0 || keys === 0) break;
    opened.add(i); keys--;
    got = reach((e) => !e.locked || opened.has(lockedEdges.indexOf(e)));
  }
  if (got.size !== d.rooms.length) return bad(`reached ${got.size} of ${d.rooms.length} rooms`);
  return { ok: true };
}

// tile 層級（洪水填充，4 連通，範圍 = bbox 外擴）：非實心可走、關著的木門可開、上鎖的門依 openLocked。
// 不開鎖：拿得到所有地城鑰匙、碰不到金鑰匙 / 金寶箱 / 上鎖房間內部；開鎖：金鑰匙、金寶箱、每個房間的地板都到得了
// w 只要讀得到 fg（gen2 的 World 與舊生成器的 GenGrid 都可以，legacy/gen/dungeon.test.ts 共用）
export function floodSolvable(w: { getFg(x: number, y: number): number }, d: DungeonInfo): Verdict {
  const b = d.bbox, x0 = b.x - 2, x1 = b.x + b.w + 2, y0 = b.y - 6, y1 = b.y + b.h + 2, W = x1 - x0;
  const flood = (openLocked: boolean): Uint8Array => {
    const seen = new Uint8Array(W * (y1 - y0));
    const pass = (x: number, y: number): boolean => {
      const t = w.getFg(x, y);
      if (t === T.DOOR_CLOSED) return true;
      if (t === T.DOOR_LOCKED) return openLocked;
      return !isSolidTile(t);
    };
    const st = [d.entrance.x, d.entrance.y];
    seen[(d.entrance.y - y0) * W + d.entrance.x - x0] = 1;
    while (st.length) {
      const y = st.pop()!, x = st.pop()!;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
        const k = (ny - y0) * W + nx - x0;
        if (seen[k] || !pass(nx, ny)) continue;
        seen[k] = 1; st.push(nx, ny);
      }
    }
    return seen;
  };
  const closed = flood(false), open = flood(true), at = (s: Uint8Array, x: number, y: number): boolean => s[(y - y0) * W + x - x0] === 1;
  for (const k of d.keys.filter((q) => !q.golden)) if (!at(closed, k.x, k.y)) return bad(`key at ${k.x},${k.y} unreachable`);
  const g = d.keys.find((q) => q.golden)!, t = d.treasureChest;
  if (at(closed, g.x, g.y) || at(closed, t.x, t.y)) return bad('golden key / treasure chest reachable without a key');
  if (!at(open, g.x, g.y) || !at(open, t.x, t.y)) return bad('golden key / treasure chest unreachable with keys');
  for (const q of d.rooms) {
    let any = false;
    for (let x = q.x; x < q.x + q.w && !any; x++) any = at(open, x, q.y + q.h - 1);
    if (!any) return bad(`room ${q.id} ${q.kind} floor unreachable`);
  }
  for (const q of d.rooms.filter((r) => r.locked)) {
    for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) if (at(closed, x, y)) return bad(`locked room ${q.id} open at ${x},${y}`);
  }
  return { ok: true };
}

// rect 內地面以下（y ≥ surfaceAt；地面以上是天空，不是洞穴）的空氣格中，背景牆不是地城牆（三色之一）的座標
const DUNGEON_WALLS: ReadonlySet<number> = new Set(DUNGEON_COLORS.map((c) => c.wall));
export function naturalHoles(w: World, r: { x: number; y: number; w: number; h: number }): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let x = r.x; x < r.x + r.w; x++) {
    const s = w.surfaceAt(x);
    for (let y = Math.max(r.y, s); y < r.y + r.h; y++) if (w.getFg(x, y) === T.AIR && !DUNGEON_WALLS.has(w.getWall(x, y))) out.push({ x, y });
  }
  return out;
}

// 從藍圖的第一個地標（礦坑的礦車、小生態 / 蜂巢的地標，Task 10 / 11）出發走不擋身體的格（4 鄰、不進液體），範圍 = 外框外擴 80 欄、外框上方 80 列（到世界頂）到外框下 40 列：
// 走到外框外 ≥ 300 格、或走到地表以上（y < 地面）= true
export function walkOut(w: World, src: Gen2Source, b: Blueprint): boolean {
  const cart = b.landmarks[0], x0 = b.x - 80, x1 = b.x + b.w + 80, y0 = Math.max(0, b.y - 80), y1 = b.y + b.h + 40, W = x1 - x0;
  const seen = new Uint8Array(W * (y1 - y0)), st = [cart.x, cart.y];
  seen[(cart.y - y0) * W + cart.x - x0] = 1;
  let out = 0;
  while (st.length) {
    const y = st.pop()!, x = st.pop()!;
    if (y < src.surfaceAt(x)) return true;
    if ((x < b.x || x >= b.x + b.w || y < b.y || y >= b.y + b.h) && ++out >= 300) return true;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
      const k = (ny - y0) * W + nx - x0;
      if (seen[k] || isSolidTile(w.getFg(nx, ny)) || w.getLiquid(nx, ny) > 0) continue;
      seen[k] = 1; st.push(nx, ny);
    }
  }
  return false;
}
// ── 跨層不重疊（Q10）──
// 外框相交、而且兩份都不是液體的藍圖配對（所有層之間；同層的配對由槽保證不相交，也一併檢查）。回 [kind@x:layer, kind@x:layer]
const LIQUID_KINDS: ReadonlySet<string> = new Set(['lake', 'cave_lake', 'lava_pool']);
export function overlapPairs(bps: readonly Blueprint[]): [string, string][] {
  const out: [string, string][] = [];
  const meet = (a: Blueprint, b: Blueprint): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const tag = (b: Blueprint): string => `${b.kind}@${b.x}:${b.layer}`;
  for (let i = 0; i < bps.length; i++) for (let j = i + 1; j < bps.length; j++) {
    const a = bps[i], b = bps[j];
    if (a.id === b.id || LIQUID_KINDS.has(a.kind) || LIQUID_KINDS.has(b.kind) || !meet(a, b)) continue;
    out.push([tag(a), tag(b)]);
  }
  return out;
}
