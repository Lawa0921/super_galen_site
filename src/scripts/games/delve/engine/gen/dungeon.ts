// dungeon.ts — 地城生成（確定性；只用 Rng 與四則運算）。
//
// 演算法（房間擺放 + 圖 + MST + 額外迴圈）：
//   1. 地表入口塔：把預留區中央的地面整平，蓋一座磚塔（兩側木門、上層平台、旗幟 / 吊燈），塔底一口豎井往下通到入口大廳。
//   2. 房間擺放：依「必要房型」清單（書庫、牢房、神殿、密室、豎井、大廳…）逐一隨機嘗試位置，互不重疊（含磚殼間距）；
//      最深處放寶藏室。
//   3. 走廊：每對候選房間（k 近鄰）試著接一條「L 形」走廊——從目標房側面水平出去 → 一口帶平台的豎井 → 水平進入另一房
//      （或豎井直接從地板 / 天花板開進另一房）。走廊不得穿過其他房間（上鎖房間外圍留更寬的距離，避免打穿磚殼繞過鎖）。
//   4. 圖：自由房間之間取最小生成樹（Kruskal）保證連通，再加約 1/3 的短邊做迴圈；上鎖房間（寶藏室、放金鑰匙的神殿、
//      額外的密室）各自只用一條走廊接到自由區，入口處是上鎖的門。
//   5. 鑰匙：上鎖的門數 = 地城鑰匙數，全部放在「不經過任何上鎖的門就到得了」的房間（箱子或陶罐裡）→ 任何開門順序都解得開；
//      金鑰匙放在上鎖的神殿裡，寶藏室的金寶箱要用它開。
//   6. 施工：先把所有房間 / 走廊外擴 4 格填滿地城磚（磚殼），再挖空內部、鋪背景牆、放平台 / 門 / 家具 / 裝飾 / 箱子。
import type { World } from '../world';
import { Rng, subSeed } from '../rng';
import { T, SOLID_LUT } from '../tiles';
import { chestLoot, type Drop } from '../loot';
import type { ItemId } from '../items';
import type { ReservedZone } from '../worldgen';
import type { Stack } from '../inventory';

export interface DungeonOptions {
  seed: string;
  zone: ReservedZone;
  /** 每欄地表（會被入口塔整平的地方改寫） */
  surface: Int16Array;
  color: { key: string; brick: number; wall: number };
  depthFrac: (x: number, y: number) => number;
}
export type RoomKind = 'entry' | 'hall' | 'shaft' | 'library' | 'prison' | 'shrine' | 'treasure' | 'vault' | 'chamber';
/** 房間內部（不含磚殼）；地板（腳踩的那列）= y + h − 1，實心地板在 y + h */
export interface DungeonRoom { id: number; kind: RoomKind; x: number; y: number; w: number; h: number; locked: boolean; }
export interface DungeonEdge {
  a: number; b: number;
  /** b 端的門（頂端 tile）；locked = 上鎖的門 */
  door: { x: number; y: number } | null;
  locked: boolean;
}
export interface DungeonKey { x: number; y: number; room: number; container: 'chest' | 'pot'; golden: boolean; }
export interface DungeonInfo {
  bbox: { x: number; y: number; w: number; h: number };
  color: string; brick: number; wall: number;
  rooms: DungeonRoom[];
  edges: DungeonEdge[];
  /** 入口塔：腳底 tile（塔內一樓地板上） */
  entrance: { x: number; y: number };
  /** 塔的範圍 */
  tower: { x: number; y: number; w: number; h: number };
  entryRoom: number; treasureRoom: number; keyRoom: number;
  keys: DungeonKey[];
  treasureChest: { x: number; y: number };
  /** 所有門（頂端 tile） */
  doors: { x: number; y: number; locked: boolean }[];
  tablets: { x: number; y: number; id: number }[];
  /** 所有地城箱子（含寶箱） */
  chests: { x: number; y: number; room: number }[];
  /** 平台格數（統計 / 測試用） */
  platforms: number;
}

interface Rect { x: number; y: number; w: number; h: number; }
const overlap = (a: Rect, b: Rect, m = 0): boolean =>
  a.x - m < b.x + b.w && a.x + a.w + m > b.x && a.y - m < b.y + b.h && a.y + a.h + m > b.y;
const SHELL = 4;

interface Shaft { x: number; y0: number; y1: number; lowerFloor: number; upperFloor: number; }
interface Route { rects: Rect[]; shaft: Shaft | null; doorB: { x: number; y: number }; doorA: { x: number; y: number } | null; len: number; }

const SIZES: Record<RoomKind, [number, number, number, number]> = {
  // wMin, wMax, hMin, hMax（內部）
  entry: [26, 34, 9, 11], hall: [28, 44, 6, 7], shaft: [8, 10, 22, 32], library: [20, 28, 10, 12],
  prison: [22, 30, 8, 8], shrine: [16, 20, 10, 12], treasure: [16, 20, 9, 10], vault: [10, 14, 7, 8], chamber: [14, 22, 8, 12],
};

const fy = (r: DungeonRoom): number => r.y + r.h - 1;
const cxOf = (r: DungeonRoom): number => r.x + r.w / 2;
const cyOf = (r: DungeonRoom): number => r.y + r.h / 2;

export function generateDungeon(world: World, o: DungeonOptions): DungeonInfo | null {
  const { zone } = o;
  if (zone.x1 - zone.x0 < 120 || world.height < 500) return null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const plan = planDungeon(world, o, subSeed(o.seed, `dungeon-plan-${attempt}`));
    if (plan) return build(world, o, plan, subSeed(o.seed, 'dungeon-build'));
  }
  return null;
}

interface Plan {
  rooms: DungeonRoom[];
  edges: (DungeonEdge & { route: Route })[];
  gy: number; cx: number;
  entry: number; treasure: number; keyRoom: number; vault: number;
}

function planDungeon(world: World, o: DungeonOptions, rng: Rng): Plan | null {
  const { zone, surface } = o;
  const cx = Math.floor((zone.x0 + zone.x1) / 2);
  // 地面：塔附近地表的中位數
  const cols: number[] = [];
  for (let x = cx - 16; x <= cx + 16; x++) cols.push(surface[Math.max(0, Math.min(world.width - 1, x))]);
  cols.sort((a, b) => a - b);
  const gy = cols[Math.floor(cols.length / 2)];
  const X0 = zone.x0 + 6, X1 = zone.x1 - 6;
  const Y0 = gy + 20, Y1 = zone.y1 - 6;
  if (Y1 - Y0 < 160) return null;
  const rooms: DungeonRoom[] = [];
  const size = (k: RoomKind): [number, number] => {
    const s = SIZES[k];
    return [rng.int(s[0], s[1] + 1), rng.int(s[2], s[3] + 1)];
  };
  const fits = (r: Rect): boolean => r.x >= X0 && r.x + r.w <= X1 && r.y >= Y0 && r.y + r.h <= Y1
    && rooms.every((q) => !overlap(q, r, 10));
  // 入口大廳：塔正下方
  {
    const [w, h] = size('entry');
    rooms.push({ id: 0, kind: 'entry', x: cx - Math.floor(w / 2), y: gy + 24, w, h, locked: false });
  }
  // 寶藏室：最深處
  {
    let ok = false;
    for (let t = 0; t < 60 && !ok; t++) {
      const [w, h] = size('treasure');
      const r = { x: rng.int(X0, X1 - w), y: rng.int(Y1 - h - 24, Y1 - h), w, h };
      if (fits(r)) { rooms.push({ id: rooms.length, kind: 'treasure', ...r, locked: true }); ok = true; }
    }
    if (!ok) return null;
  }
  const required: RoomKind[] = ['shrine', 'library', 'prison', 'vault', 'shaft', 'hall', 'shaft', 'hall', 'chamber', 'library', 'hall', 'chamber', 'shaft', 'chamber', 'hall', 'chamber', 'prison', 'chamber'];
  for (const kind of required) {
    for (let t = 0; t < 80; t++) {
      const [w, h] = size(kind);
      const r = { x: rng.int(X0, Math.max(X0 + 1, X1 - w)), y: rng.int(Y0 + 30, Math.max(Y0 + 31, Y1 - h - 30)), w, h };
      if (!fits(r)) continue;
      rooms.push({ id: rooms.length, kind, ...r, locked: kind === 'shrine' || kind === 'vault' });
      break;
    }
  }
  const treasure = 1;
  const shrineIdx = rooms.findIndex((r) => r.kind === 'shrine');
  if (shrineIdx < 0) return null;
  // 只允許一個密室上鎖（第二個以後當一般房）
  let vault = -1;
  for (const r of rooms) if (r.kind === 'vault') { if (vault < 0) vault = r.id; else r.locked = false; }

  // ── 走廊路由 ──
  const route = (A: DungeonRoom, B: DungeonRoom): Route | null => {
    const s = cxOf(A) < cxOf(B) ? -1 : 1;
    const doorX = s < 0 ? B.x - 1 : B.x + B.w;
    const fB = fy(B), fA = fy(A);
    const kMin = B.locked ? 7 : 2, kMax = B.locked ? 14 : 12;
    for (let tries = 0; tries < 6; tries++) {
      const k = rng.int(kMin, kMax + 1);
      const tx = s < 0 ? doorX - k - 3 : doorX + k;
      if (tx < X0 - 2 || tx + 3 > X1 + 2) continue;
      const rects: Rect[] = [];
      const lx0 = Math.min(doorX, tx), lx1 = Math.max(doorX, tx + 3);
      rects.push({ x: lx0, y: fB - 3, w: lx1 - lx0 + 1, h: 4 });
      let shaft: Shaft | null = null, doorA: { x: number; y: number } | null = null;
      const inside = tx >= A.x + 1 && tx + 3 <= A.x + A.w - 2;
      if (inside) {
        if (A.y + A.h <= fB - 9) { // A 在上：豎井從 A 的地板開下來
          shaft = { x: tx, y0: A.y + A.h, y1: fB, lowerFloor: fB, upperFloor: fA };
        } else if (A.y >= fB + 6) { // A 在下：豎井開進 A 的天花板
          shaft = { x: tx, y0: fB - 3, y1: A.y - 1, lowerFloor: fA, upperFloor: fB };
        } else continue;
        rects.push({ x: tx, y: shaft.y0, w: 4, h: shaft.y1 - shaft.y0 + 1 });
      } else {
        let dAx: number;
        if (tx + 3 < A.x - 1) dAx = A.x - 1;
        else if (tx > A.x + A.w) dAx = A.x + A.w;
        else continue;
        const ax0 = Math.min(dAx, tx), ax1 = Math.max(dAx, tx + 3);
        rects.push({ x: ax0, y: fA - 3, w: ax1 - ax0 + 1, h: 4 });
        doorA = { x: dAx, y: fA - 2 };
        if (Math.abs(fA - fB) > 0) {
          const top = Math.min(fA, fB) - 3, bot = Math.max(fA, fB);
          shaft = { x: tx, y0: top, y1: bot, lowerFloor: Math.max(fA, fB), upperFloor: Math.min(fA, fB) };
          rects.push({ x: tx, y: top, w: 4, h: bot - top + 1 });
        }
      }
      // 不得穿過其他房間；上鎖房間外圍再留 6 格（磚殼不被打穿）
      let bad = false;
      for (const r of rects) {
        if (r.x < X0 - 3 || r.x + r.w > X1 + 3 || r.y < Y0 - 6 || r.y + r.h > Y1 + 4) { bad = true; break; }
        for (const q of rooms) {
          if (q === A || q === B) continue;
          if (overlap(r, q, q.locked ? 7 : 2)) { bad = true; break; }
        }
        if (bad) break;
      }
      if (bad) continue;
      const len = rects.reduce((p, r) => p + r.w + r.h, 0);
      return { rects, shaft, doorB: { x: doorX, y: fB - 2 }, doorA, len };
    }
    return null;
  };

  // ── 候選邊（k 近鄰）→ 自由房間的 MST + 迴圈 ──
  const dist = (a: DungeonRoom, b: DungeonRoom): number => {
    const dx = cxOf(a) - cxOf(b), dy = cyOf(a) - cyOf(b);
    return Math.sqrt(dx * dx + dy * dy * 1.6);
  };
  const free = rooms.filter((r) => !r.locked);
  const cand: { a: number; b: number; d: number; route: Route }[] = [];
  const seen = new Set<string>();
  for (const r of free) {
    const near = free.filter((q) => q !== r).sort((p, q) => dist(r, p) - dist(r, q)).slice(0, 4);
    for (const q of near) {
      const key = r.id < q.id ? `${r.id}-${q.id}` : `${q.id}-${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rt = route(r, q) ?? route(q, r);
      if (!rt) continue;
      cand.push({ a: r.id, b: q.id, d: dist(r, q), route: rt });
    }
  }
  // 修正門端：route(A,B) 的 doorB 在 B 側；嘗試失敗後改用 route(q,r) 時門端是 r
  for (const c of cand) {
    const B = rooms[c.b];
    const onB = c.route.doorB.x === B.x - 1 || c.route.doorB.x === B.x + B.w;
    if (!onB) { const t = c.a; c.a = c.b; c.b = t; }
  }
  cand.sort((p, q) => p.d - q.d);
  const parent = rooms.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const edges: (DungeonEdge & { route: Route })[] = [];
  const extra: typeof cand = [];
  for (const c of cand) {
    const ra = find(c.a), rb = find(c.b);
    if (ra !== rb) { parent[ra] = rb; edges.push({ a: c.a, b: c.b, door: null, locked: false, route: c.route }); }
    else extra.push(c);
  }
  // 只保留和入口連通的自由房間
  const root = find(0);
  for (const r of free) if (find(r.id) !== root) r.kind = 'chamber';
  const connected = new Set(free.filter((r) => find(r.id) === root).map((r) => r.id));
  if (connected.size < 7) return null;
  const mstLen = edges.map((e) => e.route.len).sort((p, q) => p - q);
  const median = mstLen[Math.floor(mstLen.length / 2)] ?? 100;
  let loops = 0;
  for (const c of extra) {
    if (loops >= Math.max(2, Math.floor(connected.size / 4))) break;
    if (!connected.has(c.a) || !connected.has(c.b)) continue;
    if (c.route.len > median * 1.8 || !rng.chance(2)) continue;
    // 迴圈走廊不能和既有走廊幾乎重疊
    if (edges.some((e) => (e.a === c.a && e.b === c.b) || (e.a === c.b && e.b === c.a))) continue;
    edges.push({ a: c.a, b: c.b, door: null, locked: false, route: c.route });
    loops++;
  }
  // ── 上鎖房間：各自一條走廊接到自由區，門端在上鎖房間 ──
  const attach = (L: DungeonRoom): boolean => {
    const opts = [...connected].map((i) => rooms[i]).filter((r) => r.kind !== 'entry' || L.kind !== 'treasure')
      .sort((p, q) => dist(L, p) - dist(L, q));
    for (const A of opts.slice(0, 8)) {
      const rt = route(A, L);
      if (rt) { edges.push({ a: A.id, b: L.id, door: null, locked: true, route: rt }); return true; }
    }
    return false;
  };
  if (!attach(rooms[treasure])) return null;
  if (!attach(rooms[shrineIdx])) return null;
  let vaultIdx = vault;
  if (vaultIdx >= 0 && !attach(rooms[vaultIdx])) { rooms[vaultIdx].locked = false; rooms[vaultIdx].kind = 'chamber'; vaultIdx = -1; }
  // 沒接上的房間（含沒接上的密室）移除
  const used = new Set<number>([...connected, treasure, shrineIdx]);
  if (vaultIdx >= 0) used.add(vaultIdx);
  const keep = rooms.filter((r) => used.has(r.id));
  const remap = new Map<number, number>();
  keep.forEach((r, i) => { remap.set(r.id, i); r.id = i; });
  const outEdges = edges.filter((e) => remap.has(e.a) && remap.has(e.b)).map((e) => ({ ...e, a: remap.get(e.a)!, b: remap.get(e.b)! }));
  return {
    rooms: keep, edges: outEdges, gy, cx,
    entry: remap.get(0)!, treasure: remap.get(treasure)!, keyRoom: remap.get(shrineIdx)!, vault: vaultIdx >= 0 ? remap.get(vaultIdx)! : -1,
  };
}

function build(world: World, o: DungeonOptions, p: Plan, rng: Rng): DungeonInfo {
  const W = world.width, H = world.height, fg = world.fg, wall = world.wall;
  const BR = o.color.brick, BW = o.color.wall;
  const inB = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;
  const put = (x: number, y: number, t: number): void => { if (inB(x, y)) fg[y * W + x] = t; };
  const get = (x: number, y: number): number => (inB(x, y) ? fg[y * W + x] : T.STONE);
  const setWall = (x: number, y: number, w: number): void => { if (inB(x, y)) wall[y * W + x] = w; };
  const { gy, cx } = p;
  const rooms = p.rooms;
  const E = rooms[p.entry];

  // ── 整平塔周圍的地面 ──
  for (let x = cx - 34; x <= cx + 34; x++) {
    if (x < 1 || x >= W - 1) continue;
    for (let y = Math.max(0, gy - 40); y < gy; y++) { put(x, y, T.AIR); setWall(x, y, 0); }
    for (let y = gy; y < gy + 8; y++) if (!SOLID_LUT[get(x, y)]) put(x, y, T.DIRT);
    o.surface[x] = gy;
    world.surface[x] = gy;
  }
  // ── 收集所有要挖的內部空間 ──
  const tower: Rect = { x: cx - 9, y: gy - 22, w: 19, h: 23 };
  const towerIn: Rect = { x: cx - 8, y: gy - 20, w: 17, h: 20 };
  const sx = cx - 1; // 入口豎井左欄
  const entryShaft: Rect = { x: sx, y: gy, w: 4, h: E.y - gy };
  const interiors: Rect[] = rooms.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
  for (const e of p.edges) interiors.push(...e.route.rects);
  interiors.push(entryShaft);
  // 1) 磚殼（塔身 + 每個房間 / 走廊外擴 SHELL）
  const fillRect = (r: Rect, t: number, wl: number): void => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { if (inB(x, y)) { fg[y * W + x] = t; wall[y * W + x] = wl; } }
  };
  for (const r of interiors) fillRect({ x: r.x - SHELL, y: r.y - SHELL, w: r.w + SHELL * 2, h: r.h + SHELL * 2 }, BR, BW);
  fillRect(tower, BR, BW);
  fillRect({ x: tower.x - 1, y: gy, w: tower.w + 2, h: 5 }, BR, BW); // 塔基
  // 2) 挖空
  for (const r of interiors) fillRect(r, T.AIR, BW);
  fillRect(towerIn, T.AIR, BW);
  // 塔頂城垛
  for (let x = tower.x - 1; x < tower.x + tower.w + 1; x++) {
    put(x, tower.y, BR);
    if (((x - tower.x) & 1) === 0) put(x, tower.y - 1, BR);
  }
  // 塔頂外露的牆不要（天空）
  for (let x = tower.x - 1; x < tower.x + tower.w + 1; x++) setWall(x, tower.y - 1, 0);
  let platforms = 0;
  const plat = (x: number, y: number): void => { if (inB(x, y) && fg[y * W + x] === T.AIR) { fg[y * W + x] = T.PLATFORM; platforms++; } };
  // 豎井平台：從下層地板往上每 4 列一層，最上一層和上層地板齊平
  const shaftPlatforms = (s: Shaft, x: number, w = 4): void => {
    for (let r = s.lowerFloor + 1 - 4; r > s.upperFloor + 2; r -= 4) for (let k = 0; k < w; k++) plat(x + k, r);
    for (let k = 0; k < w; k++) plat(x + k, s.upperFloor + 1);
  };
  shaftPlatforms({ x: sx, y0: gy, y1: fy(E), lowerFloor: fy(E), upperFloor: gy - 1 }, sx);
  for (const e of p.edges) if (e.route.shaft) shaftPlatforms(e.route.shaft, e.route.shaft.x);
  // 塔：二樓平台（中間留豎井口）、兩側門
  for (let x = towerIn.x; x < towerIn.x + towerIn.w; x++) if (x < sx - 1 || x > sx + 4) plat(x, gy - 10);
  for (let x = cx + 4; x <= cx + 7; x++) plat(x, gy - 5); // 爬上二樓的踏台
  const doors: { x: number; y: number; locked: boolean }[] = [];
  const placeDoor = (x: number, top: number, locked: boolean): void => {
    for (let y = top; y < top + 3; y++) { put(x, y, locked ? T.DOOR_LOCKED : T.DOOR_CLOSED); setWall(x, y, BW); }
    put(x, top - 1, BR); // 門楣
    if (!SOLID_LUT[get(x, top + 3)]) put(x, top + 3, BR);
    doors.push({ x, y: top, locked });
  };
  placeDoor(tower.x, gy - 3, false);
  placeDoor(tower.x + tower.w - 1, gy - 3, false);
  // 3) 房間之間的門
  const edges: DungeonEdge[] = [];
  for (const e of p.edges) {
    const B = rooms[e.b];
    let door: { x: number; y: number } | null = null;
    if (e.locked || rng.next() < 0.55) { placeDoor(e.route.doorB.x, e.route.doorB.y, e.locked); door = { ...e.route.doorB }; }
    else {
      // 沒有門：仍把入口上方補成 3 格高（門楣）
      put(e.route.doorB.x, fy(B) - 3, BR);
    }
    if (e.route.doorA && rng.next() < 0.3) placeDoor(e.route.doorA.x, e.route.doorA.y, false);
    edges.push({ a: e.a, b: e.b, door, locked: e.locked });
  }

  // ── 家具與裝飾 ──
  const floorFree = (x: number, y: number): boolean => get(x, y) === T.AIR && SOLID_LUT[get(x, y + 1)] === 1 && get(x, y + 1) !== T.DOOR_CLOSED;
  const isDoorCol = (x: number): boolean => doors.some((d) => d.x === x);
  const chests: { x: number; y: number; room: number }[] = [];
  const chestAt = new Map<number, (Stack | null)[]>();
  const addChest = (x: number, y: number, room: number, kind: 'dungeon' | 'treasure', locked = false): (Stack | null)[] => {
    put(x, y, locked ? T.LOCKED_CHEST : T.CHEST);
    const slots = chestLoot(o.seed, x, y, kind, o.depthFrac(x, y));
    world.chests.set(y * W + x, slots);
    chests.push({ x, y, room });
    chestAt.set(y * W + x, slots);
    return slots;
  };
  const addItem = (slots: (Stack | null)[], item: ItemId, count: number): void => {
    const i = slots.findIndex((s) => s === null);
    if (i >= 0) slots[i] = { item, count };
    else slots[slots.length - 1] = { item, count };
  };
  const pots: { x: number; y: number; room: number }[] = [];
  const addPot = (x: number, y: number, room: number): void => { if (floorFree(x, y)) { put(x, y, T.POT); pots.push({ x, y, room }); } };
  const hang = (x: number, y0: number, lenChain: number, end: number): void => {
    // 從天花板往下：鍊 × lenChain，最後掛 end（吊燈 / 無）
    if (SOLID_LUT[get(x, y0 - 1)] !== 1) return;
    let y = y0;
    for (let k = 0; k < lenChain && get(x, y) === T.AIR; k++, y++) put(x, y, T.CHAIN);
    if (end && get(x, y) === T.AIR) put(x, y, end);
  };
  const banner = (x: number, y0: number): void => {
    if (SOLID_LUT[get(x, y0 - 1)] !== 1 || get(x, y0) !== T.AIR || get(x, y0 + 1) !== T.AIR) return;
    put(x, y0, T.BANNER); put(x, y0 + 1, T.BANNER);
  };
  const cobwebs = (r: DungeonRoom): void => {
    for (const x of [r.x, r.x + r.w - 1]) if (get(x, r.y) === T.AIR && rng.chance(2)) put(x, r.y, T.COBWEB);
    if (rng.chance(3) && get(r.x + 1, r.y) === T.AIR) put(r.x + 1, r.y, T.COBWEB);
  };
  const clutter = (r: DungeonRoom, density: number): void => {
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
      if (isDoorCol(x)) continue;
      const v = rng.next();
      if (v < density * 0.4) { if (floorFree(x, fy(r))) put(x, fy(r), T.BONES); }
      else if (v < density * 0.7) addPot(x, fy(r), r.id);
      else if (v < density) { if (floorFree(x, fy(r))) put(x, fy(r), T.CANDLE); }
    }
  };
  const ceilingDecor = (r: DungeonRoom): void => {
    for (let x = r.x + 2; x < r.x + r.w - 2; x += rng.int(4, 8)) {
      const v = rng.next();
      if (v < 0.35) hang(x, r.y, rng.int(1, Math.max(2, Math.min(4, r.h - 4))), T.LANTERN);
      else if (v < 0.6 && r.h >= 7) banner(x, r.y);
      else if (v < 0.8) hang(x, r.y, rng.int(1, 3), 0);
    }
  };
  const tablets: { x: number; y: number; id: number }[] = [];
  const tablet = (x: number, y: number): void => { if (get(x, y) === T.AIR && SOLID_LUT[get(x, y + 1)] === 1) { put(x, y, T.LORE_TABLET); tablets.push({ x, y, id: tablets.length }); } };

  // 塔內
  for (const x of [towerIn.x + 2, towerIn.x + towerIn.w - 3]) banner(x, towerIn.y);
  hang(cx - 5, towerIn.y, 2, T.LANTERN); hang(cx + 6, towerIn.y, 2, T.LANTERN);
  for (const x of [towerIn.x + 1, towerIn.x + towerIn.w - 2]) if (floorFree(x, gy - 11)) put(x, gy - 11, T.CANDLE);
  tablet(towerIn.x + 3, gy - 1);

  for (const r of rooms) {
    const f = fy(r), mid = Math.floor(cxOf(r));
    cobwebs(r);
    switch (r.kind) {
      case 'entry': case 'hall': case 'chamber': {
        ceilingDecor(r);
        clutter(r, r.kind === 'chamber' ? 0.18 : 0.1);
        break;
      }
      case 'library': {
        // 書架：每 5 欄一組 3 欄寬、2–3 層高；二樓平台陽台上也有書架
        for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
          if (isDoorCol(x) || isDoorCol(x - 1) || isDoorCol(x + 1)) continue;
          const k = (x - r.x) % 6;
          if (k >= 1 && k <= 3) {
            const hgt = 2 + ((x * 7) % 2);
            for (let y = f; y > f - hgt; y--) if (get(x, y) === T.AIR) put(x, y, T.BOOKSHELF);
            if (k === 2 && rng.chance(2) && get(x, f - hgt) === T.AIR) put(x, f - hgt, T.CANDLE);
          }
        }
        const balcony = f - 5, bx1 = r.x + Math.floor(r.w * 0.55);
        if (r.h >= 10) {
          for (let x = r.x; x < bx1; x++) plat(x, balcony);
          for (let x = r.x + 1; x < bx1 - 2; x++) if ((x - r.x) % 4 !== 0 && get(x, balcony - 1) === T.AIR) {
            put(x, balcony - 1, T.BOOKSHELF);
            if (get(x, balcony - 2) === T.AIR && x % 3 === 0) put(x, balcony - 2, T.BOOKSHELF);
          }
        }
        hang(r.x + r.w - 4, r.y, 2, T.LANTERN);
        break;
      }
      case 'prison': {
        // 一排牢房：磚隔牆 + 牢門，牢房裡有骨堆、鐵鍊、陶罐
        for (let x0 = r.x + 6; x0 < r.x + r.w - 3; x0 += 6) {
          // 隔牆要站在實心地板上、頂到實心天花板（豎井從地板 / 天花板開進來的欄跳過）
          const x = [x0, x0 + 1, x0 - 1, x0 + 2].find((c) => SOLID_LUT[get(c, f + 1)] === 1 && SOLID_LUT[get(c, r.y - 1)] === 1
            && get(c, f + 1) !== T.PLATFORM && c < r.x + r.w - 2);
          if (x === undefined) continue;
          for (let y = r.y; y < f - 2; y++) put(x, y, BR);
          for (let y = f - 2; y <= f; y++) put(x, y, T.DOOR_CLOSED);
          doors.push({ x, y: f - 2, locked: false });
        }
        for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
          if (get(x, f) !== T.AIR || isDoorCol(x)) continue;
          const v = rng.next();
          if (v < 0.25) put(x, f, T.BONES); else if (v < 0.4) addPot(x, f, r.id);
          if (rng.chance(3)) hang(x, r.y, rng.int(1, 4), 0);
        }
        break;
      }
      case 'shrine': {
        // 祭壇：兩階磚台 + 古碑 + 兩側蠟燭、旗幟、吊燈
        for (let x = mid - 4; x <= mid + 4; x++) put(x, f, BR);
        for (let x = mid - 2; x <= mid + 2; x++) put(x, f - 1, BR);
        tablet(mid, f - 2);
        for (const x of [mid - 2, mid + 2]) if (get(x, f - 2) === T.AIR) put(x, f - 2, T.CANDLE);
        for (const x of [mid - 4, mid + 4]) if (get(x, f - 1) === T.AIR) put(x, f - 1, T.CANDLE);
        banner(r.x + 2, r.y); banner(r.x + r.w - 3, r.y);
        hang(mid, r.y, 2, T.LANTERN);
        break;
      }
      case 'treasure': {
        for (let x = mid - 3; x <= mid + 3; x++) put(x, f, BR);
        for (const x of [mid - 6, mid - 5, mid + 5, mid + 6]) addPot(x, f, r.id);
        for (const x of [mid - 3, mid + 3]) if (get(x, f - 1) === T.AIR) put(x, f - 1, T.CANDLE);
        banner(r.x + 1, r.y); banner(r.x + r.w - 2, r.y); banner(mid - 5, r.y); banner(mid + 5, r.y);
        hang(mid, r.y, 2, T.LANTERN);
        break;
      }
      case 'vault': {
        clutter(r, 0.35);
        hang(mid, r.y, 1, T.LANTERN);
        break;
      }
      case 'shaft': {
        // 交錯平台（左半 / 右半輪流），頂端一個箱子
        let left = true;
        for (let y = f - 3; y > r.y + 2; y -= 4) {
          const half = Math.ceil(r.w / 2) + 1;
          for (let k = 0; k < half; k++) plat(left ? r.x + k : r.x + r.w - 1 - k, y);
          left = !left;
        }
        hang(r.x + Math.floor(r.w / 2), r.y, 1, T.LANTERN);
        clutter(r, 0.25);
        break;
      }
    }
  }
  // ── 箱子與鑰匙 ──
  const keys: DungeonKey[] = [];
  const freeRooms = rooms.filter((r) => !r.locked);
  const chestSpot = (r: DungeonRoom): { x: number; y: number } | null => {
    const f = fy(r);
    for (let t = 0; t < 40; t++) {
      const x = rng.int(r.x + 1, r.x + r.w - 1);
      if (isDoorCol(x) || isDoorCol(x - 1) || isDoorCol(x + 1)) continue;
      if (floorFree(x, f)) return { x, y: f };
    }
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) if (!isDoorCol(x) && floorFree(x, f)) return { x, y: f };
    // 地板被家具佔滿：清掉一格非門的裝飾
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
      const t = get(x, f);
      if (!isDoorCol(x) && SOLID_LUT[get(x, f + 1)] && (t === T.BONES || t === T.CANDLE || t === T.POT)) { put(x, f, T.AIR); return { x, y: f }; }
    }
    return null;
  };
  // 寶藏室：金寶箱（要金鑰匙），內容是寶藏表 + 符文鎬
  const T_ = rooms[p.treasure];
  const tcx = Math.floor(cxOf(T_));
  put(tcx, fy(T_) - 1, T.AIR);
  const tSlots = addChest(tcx, fy(T_) - 1, T_.id, 'treasure', true);
  addItem(tSlots, 'rune_pickaxe', 1);
  // 神殿（上鎖）：金鑰匙箱
  const R = rooms[p.keyRoom];
  {
    let spot: { x: number; y: number } | null = null;
    const rm = Math.floor(cxOf(R));
    for (const x of [rm + 6, rm - 6, rm + 7, rm - 7]) if (!spot && floorFree(x, fy(R))) spot = { x, y: fy(R) };
    spot ??= chestSpot(R);
    if (!spot) { spot = { x: R.x + 1, y: fy(R) }; put(spot.x, spot.y, T.AIR); }
    const s = addChest(spot.x, spot.y, R.id, 'dungeon');
    addItem(s, 'golden_key', 1);
    keys.push({ ...spot, room: R.id, container: 'chest', golden: true });
  }
  // 密室：探險家地圖
  if (p.vault >= 0) {
    const V = rooms[p.vault];
    const spot = chestSpot(V);
    if (spot) addItem(addChest(spot.x, spot.y, V.id, 'dungeon'), 'explorer_map', 1);
  }
  // 地城鑰匙：上鎖的門有幾扇就放幾把，全部在自由房間（各在不同房間）；第一把藏在牢房的陶罐裡
  const lockedDoors = doors.filter((d) => d.locked).length;
  let placed = 0;
  const keyed = new Set<number>();
  const prisonPot = pots.find((q) => rooms[q.room].kind === 'prison' && !rooms[q.room].locked);
  if (prisonPot && lockedDoors > 0) {
    world.potDrops.set(prisonPot.y * W + prisonPot.x, [{ item: 'dungeon_key', n: 1 }]);
    keys.push({ x: prisonPot.x, y: prisonPot.y, room: prisonPot.room, container: 'pot', golden: false });
    keyed.add(prisonPot.room);
    placed++;
  }
  // 入口大廳以外的自由房間輪流放；房間不夠時才重複 / 用入口大廳
  const keyRooms = freeRooms.filter((r) => r.kind !== 'entry').concat(freeRooms.filter((r) => r.kind === 'entry'));
  for (let i = 0; placed < lockedDoors && i < keyRooms.length * 3; i++) {
    const r = keyRooms[(i * 5 + 2) % keyRooms.length];
    if (keyed.has(r.id) && i < keyRooms.length * 2) continue;
    const spot = chestSpot(r);
    if (!spot) continue;
    addItem(addChest(spot.x, spot.y, r.id, 'dungeon'), 'dungeon_key', 1);
    keys.push({ ...spot, room: r.id, container: 'chest', golden: false });
    keyed.add(r.id);
    placed++;
  }
  void ({} as Drop);
  // 探險提燈：自由區某個書庫 / 大廳的箱子
  {
    const r = freeRooms.find((q) => q.kind === 'library') ?? freeRooms.find((q) => q.kind === 'hall') ?? freeRooms[0];
    const spot = chestSpot(r);
    if (spot) addItem(addChest(spot.x, spot.y, r.id, 'dungeon'), 'lantern', 1);
  }
  // 額外的一般箱子
  for (const r of freeRooms) if (r.kind === 'chamber' && rng.chance(2)) { const s = chestSpot(r); if (s) addChest(s.x, s.y, r.id, 'dungeon'); }
  void chestAt;

  // 外接框
  let bx0 = tower.x - 1, by0 = tower.y - 1, bx1 = tower.x + tower.w + 1, by1 = gy + 5;
  for (const r of interiors) {
    bx0 = Math.min(bx0, r.x - SHELL); by0 = Math.min(by0, r.y - SHELL);
    bx1 = Math.max(bx1, r.x + r.w + SHELL); by1 = Math.max(by1, r.y + r.h + SHELL);
  }
  return {
    bbox: { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 },
    color: o.color.key, brick: BR, wall: BW,
    rooms, edges,
    entrance: { x: cx + 4, y: gy - 1 },
    tower,
    entryRoom: p.entry, treasureRoom: p.treasure, keyRoom: p.keyRoom,
    keys, treasureChest: { x: tcx, y: fy(T_) - 1 }, doors, tablets, chests, platforms,
  };
}
