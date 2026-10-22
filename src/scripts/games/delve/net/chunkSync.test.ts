// chunkSync.test.ts — 按 chunk 同步核心（C3–C6）：雜湊、整欄回覆、日誌上線格式、客人 rev 表、液體訊框。
// 兩個同一 source 的無限世界：房主 H、客人 G。tiles 走 JSON 來回、bulk 走 encodeBulk / decodeBulk 來回（模擬線上）。
import { describe, it, expect } from 'vitest';
import { World, LIQ } from '../engine/world';
import { li, type Column, type ColumnSource, type ColumnLayers } from '../engine/column';
import { T, W } from '../engine/tiles';
import { encodeBulk, decodeBulk } from './codec';
import type { BulkHead, WireBatch } from './protocol';
import {
  chunkSum, columnSums, answerSum, wireBatch, chunkMessage, encodeLiq, applyLiq, ChunkSyncGuest,
} from './chunkSync';

// ── TestSource（抄 engine/world.stream.test.ts） ──
function hash(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y + 977, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}
const srcFg = (x: number, y: number): number => { const v = hash(x, y) % 3; return v === 0 ? T.STONE : v === 1 ? T.DIRT : T.AIR; };
const srcWall = (x: number, y: number): number => (hash(y, x) % 4 === 0 ? W.DIRT_WALL : 0);
class TestSource implements ColumnSource {
  readonly version = 1;
  fills: [number, number, number][] = [];
  fill(col: Column, x0: number, x1: number): void {
    this.fills.push([col.cx, x0, x1]);
    for (let y = 0; y < col.height; y++) {
      for (let x = x0; x < x1; x++) { col.fg[li(x, y)] = srcFg(x, y); col.wall[li(x, y)] = srcWall(x, y); }
    }
  }
  surfaceAt(x: number): number { return 30 + (x & 3); }
  biomeAt(x: number): number { return x < 0 ? 2 : 1; }
  layersAt(x: number): ColumnLayers { return { rock: 50 + (x & 1), deep: 70, molten: 90 }; }
}

// 高 128 → chunksY = 4（brief 的 64×64 只有 2 列 chunk，到不了 cy 3）
const mk = (): World => new World(64, 128, { bounds: 'infinite', source: new TestSource() });
const LAYERS = ['fg', 'wall', 'liquid', 'liquidType', 'frozen', 'half'] as const;

/** 線上來回：tiles 是 JSON，bulk 是二進位訊框 */
const viaJson = <X>(v: X): X => JSON.parse(JSON.stringify(v)) as X;
function viaBulk<H extends BulkHead>(m: { head: H; payload: Uint8Array }): { head: H; payload: Uint8Array } {
  const d = decodeBulk(encodeBulk(m.head, m.payload));
  if (!d) throw new Error('bulk roundtrip failed');
  return { head: d.head as H, payload: d.payload };
}
/** 房主的日誌 → wire 批次 */
const drainWire = (H: World): WireBatch[] => viaJson(H.edits.drain().map((b) => wireBatch(H, b)));
function run(H: World, s: ChunkSyncGuest): void { s.onTiles(drainWire(H)); }
/** 客人在 tileX：送 sum、房主回 col、客人套上 */
function interest(H: World, s: ChunkSyncGuest, tileX: number): number[] {
  const reqs = s.updateInterest(tileX);
  for (const r of reqs) { const m = viaBulk(answerSum(H, r.cx, r.sums)); s.onCol(m.head, m.payload); }
  return reqs.map((r) => r.cx);
}
/** 這幾欄兩邊六層 + 箱子 + 解鎖相等 */
function expectSame(H: World, G: World, cols: readonly number[]): void {
  for (const cx of cols) {
    for (let cy = 0; cy < H.chunksY; cy++) {
      const a = H.readChunk(cx, cy), b = G.readChunk(cx, cy);
      expect(a, `H ${cx},${cy}`).not.toBeNull();
      expect(b, `G ${cx},${cy}`).not.toBeNull();
      for (const L of LAYERS) expect(Buffer.from(b![L]).equals(Buffer.from(a![L])), `${L} ${cx},${cy}`).toBe(true);
    }
  }
  const inCols = (w: World, k: number): boolean => cols.includes(w.tileXY(k).x >> 5);
  const chests = (w: World): [number, unknown][] => [...w.chests].filter(([k]) => inCols(w, k)).sort((p, q) => p[0] - q[0]);
  expect(viaJson(chests(G))).toEqual(viaJson(chests(H)));
  const unl = (w: World): number[] => [...w.unlocked].filter((k) => inCols(w, k)).sort((p, q) => p - q);
  expect(unl(G)).toEqual(unl(H));
}
/** 兩邊都載入 cx 2、清掉載入時的日誌 */
function pair(): { H: World; G: World; s: ChunkSyncGuest } {
  const H = mk(), G = mk();
  H.ensureColumn(2); G.ensureColumn(2);
  H.edits.drain(); G.edits.drain();
  return { H, G, s: new ChunkSyncGuest(G) };
}
/** cx 2 裡 cy 的一格（不是箱子的普通格） */
const cell = (cy: number, dx = 3, dy = 4): [number, number] => [64 + dx, cy * 32 + dy];

describe('chunkSum / columnSums', () => {
  it('chunkSum：相同為等、改一格就變、只改箱子內容也變', () => {
    const { H, G } = pair();
    expect(columnSums(H, 2)).toEqual(columnSums(G, 2));
    expect(columnSums(H, 2)).toHaveLength(H.chunksY);
    const base = columnSums(G, 2);
    const [x, y] = cell(1);
    H.setFg(x, y, H.getFg(x, y) === T.WOOD ? T.STONE : T.WOOD);
    const after = columnSums(H, 2);
    expect(after[1]).not.toBe(base[1]);
    for (const cy of [0, 2, 3]) expect(after[cy]).toBe(base[cy]);
    // 兩邊同一格放箱子 → 相等
    const [cx0, cy0] = cell(2, 10, 10);
    H.setFg(cx0, cy0, T.CHEST); G.setFg(cx0, cy0, T.CHEST);
    expect(chunkSum(H, 2, 2)).toBe(chunkSum(G, 2, 2));
    // 只改箱子內容（格子不變）→ 不同
    H.chests.get(H.idx(cx0, cy0))![0] = { item: 'dirt', count: 3 };
    H.touchChest(cx0, cy0);
    expect(chunkSum(H, 2, 2)).not.toBe(chunkSum(G, 2, 2));
    // 只改解鎖旗標也不同
    G.chests.get(G.idx(cx0, cy0))![0] = { item: 'dirt', count: 3 };
    expect(chunkSum(H, 2, 2)).toBe(chunkSum(G, 2, 2));
    G.unlocked.add(G.idx(cx0, cy0));
    expect(chunkSum(H, 2, 2)).not.toBe(chunkSum(G, 2, 2));
  });

  it('欄沒常駐也沒停放 → 0', () => {
    const H = mk();
    expect(chunkSum(H, 9, 0)).toBe(0);
    expect(columnSums(H, 9)).toEqual([0, 0, 0, 0]);
  });
});

describe('answerSum', () => {
  it('answerSum 只送不同的、revs 全帶', () => {
    const { H, G, s } = pair();
    const sums = columnSums(G, 2);
    for (const cy of [0, 3]) { const [x, y] = cell(cy); H.setFg(x, y, T.WOOD); }
    const { head, payload } = answerSum(H, 2, sums);
    expect(head.t).toBe('col');
    expect(head.cx).toBe(2);
    expect(head.diff.map((d) => d.cy)).toEqual([0, 3]);
    expect(head.revs).toHaveLength(H.chunksY);
    expect(head.revs[0]).toBe(H.edits.rev(H.chunkIndex(2, 0)));
    expect(head.revs[0]).toBeGreaterThan(0);
    expect(head.revs[1]).toBe(0);
    expect(payload.length).toBeGreaterThan(0);
    // 經同步核心套上
    H.edits.drain();
    expect(s.updateInterest(64).map((r) => r.cx)).toEqual([0, 1, 2]);
    for (const cx of [0, 1]) { const m = viaBulk(answerSum(H, cx, columnSums(G, cx))); s.onCol(m.head, m.payload); }
    const m = viaBulk({ head, payload });
    s.onCol(m.head, m.payload);
    expectSame(H, G, [0, 1, 2]);
    expect(s.state(H.chunkIndex(2, 0))).toBe('live');
    expect(s.rev(H.chunkIndex(2, 0))).toBe(head.revs[0]);
  });

  it('停放中的 chunk', () => {
    const { H, G, s } = pair();
    H.ensureColumn(5); G.ensureColumn(5);
    const [x, y] = [5 * 32 + 7, 2 * 32 + 9];
    H.setFg(x, y, H.getFg(x, y) === T.WOOD ? T.STONE : T.WOOD);
    H.edits.drain();
    expect(H.unloadColumn(5)).toBe(true);
    expect(H.parkedChunks()).toContain(H.chunkIndex(5, 2));
    expect(H.isResident(5)).toBe(false);
    const a = answerSum(H, 5, columnSums(G, 5));
    expect(a.head.diff.map((d) => d.cy)).toEqual([2]);
    expect(H.isResident(5)).toBe(true);
    // 經同步核心：updateInterest 也會要 cx 5
    const reqs = s.updateInterest(5 * 32);
    expect(reqs.map((r) => r.cx)).toContain(5);
    for (const r of reqs) { const m = viaBulk(answerSum(H, r.cx, r.sums)); s.onCol(m.head, m.payload); }
    expectSame(H, G, [5]);
    expect(G.getFg(x, y)).toBe(H.getFg(x, y));
  });
});

describe('wireBatch / chunkMessage', () => {
  it('箱子鍵帶內容與解鎖；tiles 裡有箱子的格自動補一筆', () => {
    const { H } = pair();
    const [x, y] = cell(1, 5, 5);
    H.setFg(x, y, T.CHEST);
    const [b] = H.edits.drain();
    const wb = wireBatch(H, b);
    expect(wb.chests).toEqual([[H.idx(x, y), H.chests.get(H.idx(x, y)), 0]]);
    H.chests.get(H.idx(x, y))![1] = { item: 'dirt', count: 2 };
    H.unlocked.add(H.idx(x, y));
    H.touchChest(x, y);
    const [b2] = H.edits.drain();
    const wb2 = wireBatch(H, b2);
    expect(wb2.tiles).toEqual([]);
    expect(wb2.chests).toEqual([[H.idx(x, y), [null, { item: 'dirt', count: 2 }, ...new Array(H.chests.get(H.idx(x, y))!.length - 2).fill(null)], 1]]);
    // 不共用房主的陣列
    expect(wb2.chests[0][1]).not.toBe(H.chests.get(H.idx(x, y)));
    // 挖掉箱子 → 內容 null
    H.setFg(x, y, T.AIR);
    H.touchChest(x, y);
    const [b3] = H.edits.drain();
    expect(wireBatch(H, b3).chests).toEqual([[H.idx(x, y), null, 1]]);
  });

  it('chunkMessage：沒常駐也沒停放 → null', () => {
    const H = mk();
    expect(chunkMessage(H, H.chunkIndex(9, 0))).toBeNull();
    const m = chunkMessage(H, H.chunkIndex(0, 1))!;
    expect(m.head).toEqual({ t: 'chunk', key: H.chunkIndex(0, 1), rev: 0, chests: [] });
  });
});

describe('ChunkSyncGuest 亂序', () => {
  /** 已同步好 cx 0..2 的一對 */
  function synced(): { H: World; G: World; s: ChunkSyncGuest } {
    const p = pair();
    expect(interest(p.H, p.s, 64)).toEqual([0, 1, 2]);
    expectSame(p.H, p.G, [0, 1, 2]);
    return p;
  }

  it('① sum 之後、col 之前房主又改了同一 chunk：tiles 先到 → 暫存、col 套完重放', () => {
    const { H, G, s } = pair();
    const [x0, y0] = cell(1, 2, 2);
    H.setFg(x0, y0, T.WOOD); H.edits.drain();          // 讓 cy 1 有差異
    const reqs = s.updateInterest(64);
    const cols = reqs.map((r) => viaBulk(answerSum(H, r.cx, r.sums)));
    const k = H.chunkIndex(2, 1);
    const colRev = cols[2].head.revs[1];
    const [x, y] = cell(1, 6, 6);
    H.setFg(x, y, T.WOOD);
    const tiles = drainWire(H);
    expect(tiles[0].rev).toBeGreaterThan(colRev);
    s.onTiles(tiles);
    expect(s.state(k)).toBe('pending');
    expect(G.getFg(x, y)).not.toBe(T.WOOD);
    for (const m of cols) s.onCol(m.head, m.payload);
    expect(s.state(k)).toBe('live');
    expect(s.rev(k)).toBe(tiles[0].rev);
    expectSame(H, G, [0, 1, 2]);
  });

  it('② 房主的改動在 answerSum 之前（tiles rev ≤ col rev）→ 重放時跳過', () => {
    const { H, G, s } = pair();
    const reqs = s.updateInterest(64);
    const [x, y] = cell(1, 6, 6);
    H.setFg(x, y, T.WOOD);
    const tiles = drainWire(H);
    const cols = reqs.map((r) => viaBulk(answerSum(H, r.cx, r.sums)));
    const k = H.chunkIndex(2, 1);
    expect(tiles[0].rev).toBeLessThanOrEqual(cols[2].head.revs[1]);
    s.onTiles(tiles);
    expect(s.state(k)).toBe('pending');
    for (const m of cols) s.onCol(m.head, m.payload);
    expect(s.state(k)).toBe('live');
    // 每個整塊覆寫 +1；tiles 沒有重放（重放的話會多 1）
    expect(s.writes).toBe(cols.reduce((n, m) => n + m.head.diff.length, 0));
    expectSame(H, G, [0, 1, 2]);
  });

  it('③ full 標記先到、chunk 後到', () => {
    const { H, G, s } = synced();
    const d = H.readChunk(2, 3)!;
    d.fg.fill(T.WOOD, 0, 64);
    H.writeChunk(2, 3, d);
    const k = H.chunkIndex(2, 3);
    const batches = H.edits.drain();
    expect(batches[0].full).toBe(true);
    const marker = viaJson(batches.map((b) => wireBatch(H, b)));
    expect(marker[0]).toEqual({ chunk: k, rev: H.edits.rev(k), tiles: [], chests: [], full: true });
    const m = viaBulk(chunkMessage(H, k)!);
    s.onTiles(marker);
    expect(s.state(k)).toBe('pending');
    // 等整塊期間來的 tiles 暫存
    const [x, y] = cell(3, 9, 9);
    H.setFg(x, y, T.STONE === H.getFg(x, y) ? T.DIRT : T.STONE);
    const later = drainWire(H);
    s.onTiles(later);
    expect(s.state(k)).toBe('pending');
    s.onChunk(m.head, m.payload);
    expect(s.state(k)).toBe('live');
    expect(s.rev(k)).toBe(later[0].rev);
    expectSame(H, G, [0, 1, 2]);
  });

  it('④ chunk 先到、full 標記後到（忽略標記）', () => {
    const { H, G, s } = synced();
    const d = H.readChunk(2, 0)!;
    d.wall.fill(W.DIRT_WALL);
    H.writeChunk(2, 0, d);
    const k = H.chunkIndex(2, 0);
    const marker = drainWire(H);
    const m = viaBulk(chunkMessage(H, k)!);
    s.onChunk(m.head, m.payload);
    expect(s.state(k)).toBe('live');
    expect(s.rev(k)).toBe(m.head.rev);
    s.onTiles(marker);
    expect(s.state(k)).toBe('live');
    expectSame(H, G, [0, 1, 2]);
  });

  it('⑤ 兩批 rev 顛倒到達：舊的被丟', () => {
    const { H, G, s } = synced();
    const [x, y] = cell(2, 1, 1);
    H.setFg(x, y, T.WOOD);
    const b1 = drainWire(H);
    H.setFg(x, y, T.DIRT === H.getFg(x, y) ? T.STONE : T.DIRT);
    const b2 = drainWire(H);
    const k = H.chunkIndex(2, 2);
    s.onTiles(b2);
    const w = s.writes;
    s.onTiles(b1);
    expect(s.writes).toBe(w);
    expect(s.rev(k)).toBe(b2[0].rev);
    expect(G.getFg(x, y)).toBe(H.getFg(x, y));
    expectSame(H, G, [0, 1, 2]);
  });

  it('⑥ 那欄還沒送 sum 時到的 tiles → 丟（unsynced），之後 sum / col 還是一致', () => {
    const { H, G, s } = pair();
    const [x, y] = cell(0, 8, 8);
    H.setFg(x, y, T.WOOD);
    const k = H.chunkIndex(2, 0);
    s.onTiles(drainWire(H));
    expect(s.state(k)).toBe('unsynced');
    expect(s.writes).toBe(0);
    expect(G.getFg(x, y)).not.toBe(T.WOOD);
    interest(H, s, 64);
    expect(s.state(k)).toBe('live');
    expectSame(H, G, [0, 1, 2]);
  });

  it('箱子：tiles 帶箱子內容、整塊會刪掉清單沒有的箱子', () => {
    const { H, G, s } = synced();
    const [x, y] = cell(1, 4, 4);
    H.setFg(x, y, T.CHEST);
    H.chests.get(H.idx(x, y))![0] = { item: 'dirt', count: 7 };
    H.touchChest(x, y);
    run(H, s);
    expectSame(H, G, [0, 1, 2]);
    // 客人那邊多一個房主沒有的箱子 → 整塊覆寫後刪掉
    const [gx, gy] = cell(1, 20, 20);
    G.setFg(gx, gy, T.CHEST);
    G.unlocked.add(G.idx(gx, gy));
    const d = H.readChunk(2, 1)!;
    H.writeChunk(2, 1, d);
    run(H, s);
    const m = viaBulk(chunkMessage(H, H.chunkIndex(2, 1))!);
    s.onChunk(m.head, m.payload);
    expect(G.chests.has(G.idx(gx, gy))).toBe(false);
    expect(G.unlocked.has(G.idx(gx, gy))).toBe(false);
    expectSame(H, G, [0, 1, 2]);
  });
});

describe('ChunkSyncGuest 興趣範圍 / reset / writtenSince', () => {
  it('離開範圍會忘掉、回來重送 sum', () => {
    const { H, s } = pair();
    const first = s.updateInterest(64);
    expect(first.map((r) => r.cx)).toEqual([0, 1, 2]);           // −4..8 裡常駐的
    for (const r of first) { const m = viaBulk(answerSum(H, r.cx, r.sums)); s.onCol(m.head, m.payload); }
    const [x, y] = cell(0);
    H.setFg(x, y, T.WOOD); run(H, s);
    const k = H.chunkIndex(2, 0);
    expect(s.state(k)).toBe('live');
    expect(s.rev(k)).toBeGreaterThan(0);
    expect(s.updateInterest(64)).toEqual([]);                      // 已在同步集合：不重送
    expect(s.updateInterest(64 + 32 * 20)).toEqual([]);
    for (const cx of [0, 1, 2]) expect(s.state(H.chunkIndex(cx, 0))).toBe('unsynced');
    expect(s.rev(k)).toBe(0);
    const back = s.updateInterest(64);
    expect(back.map((r) => r.cx)).toEqual([0, 1, 2]);
    expect(s.state(k)).toBe('pending');
  });

  it('已卸載的欄忘掉', () => {
    const { G, s } = pair();
    G.ensureColumn(4);
    expect(s.updateInterest(64).map((r) => r.cx)).toEqual([0, 1, 2, 4]);
    G.unloadColumn(4);
    expect(s.updateInterest(64)).toEqual([]);
    expect(s.state(G.chunkIndex(4, 0))).toBe('unsynced');
    G.ensureColumn(4);
    expect(s.updateInterest(64).map((r) => r.cx)).toEqual([4]);
  });

  it('過時的 col（同一欄送了兩次 sum）只套最後一則', () => {
    const { H, G, s } = pair();
    const r1 = s.updateInterest(64);
    const c1 = r1.map((r) => viaBulk(answerSum(H, r.cx, r.sums)));
    s.updateInterest(64 + 32 * 20);                                // 忘掉
    const [x, y] = cell(1);
    H.setFg(x, y, T.WOOD); H.edits.drain();
    const r2 = s.updateInterest(64);
    const c2 = r2.map((r) => viaBulk(answerSum(H, r.cx, r.sums)));
    for (const m of c1) s.onCol(m.head, m.payload);
    expect(s.state(H.chunkIndex(2, 1))).toBe('pending');
    for (const m of c2) s.onCol(m.head, m.payload);
    expect(s.state(H.chunkIndex(2, 1))).toBe('live');
    expectSame(H, G, [0, 1, 2]);
  });

  it('reset 清空 rev 表', () => {
    const { H, s } = pair();
    interest(H, s, 64);
    const [x, y] = cell(0);
    H.setFg(x, y, T.WOOD); run(H, s);
    const k = H.chunkIndex(2, 0);
    expect(s.state(k)).toBe('live');
    expect(s.rev(k)).toBeGreaterThan(0);
    s.reset();
    expect(s.state(k)).toBe('unsynced');
    expect(s.rev(k)).toBe(0);
    expect(s.updateInterest(64).map((r) => r.cx)).toEqual([0, 1, 2]);
  });

  it('writtenSince', () => {
    const { H, s } = pair();
    interest(H, s, 64);
    const before = s.writes;
    H.setFg(3, 4, H.getFg(3, 4) === T.WOOD ? T.STONE : T.WOOD);
    run(H, s);
    expect(s.writes).toBe(before + 1);
    expect(s.writtenSince(3, 4, before)).toBe(true);
    expect(s.writtenSince(3, 5, before)).toBe(false);
    expect(s.writtenSince(3, 4, s.writes)).toBe(false);
  });
});

describe('液體訊框', () => {
  it('液體與結冰', () => {
    const { H, G } = pair();
    H.drainNetLiquid(); G.drainNetLiquid();
    const ka = H.chunkIndex(2, 0), kb = H.chunkIndex(2, 2);
    for (let i = 0; i < 4; i++) H.setLiquid(64 + i, 10, 200, LIQ.WATER);
    H.setLiquid(70, 11, 90, LIQ.LAVA);
    H.setFrozen(80, 70, true);
    const keys = H.drainNetLiquid();
    expect(new Set(keys)).toEqual(new Set([ka, kb]));
    const m = viaBulk(encodeLiq(H, keys));
    expect(m.head).toEqual({ t: 'liq', chunks: keys });
    const editsBefore = G.edits.pending();
    applyLiq(G, m.head, m.payload);
    expect(G.edits.pending()).toBe(editsBefore);                // 不進日誌
    for (const k of [ka, kb]) {
      const { cx, cy } = H.chunkCoords(k);
      const a = H.readChunk(cx, cy)!, b = G.readChunk(cx, cy)!;
      for (const L of ['liquid', 'liquidType', 'frozen'] as const) expect(Buffer.from(b[L]).equals(Buffer.from(a[L])), L).toBe(true);
    }
    expect(G.isFrozen(80, 70)).toBe(true);
    // 設成同值 → 不加進集合
    H.setFrozen(80, 70, true);
    expect(H.drainNetLiquid()).toEqual([]);
    H.setFrozen(80, 70, false);
    expect(H.drainNetLiquid()).toEqual([kb]);
  });

  it('applyLiq 只寫常駐欄；壞掉的 payload 不拋', () => {
    const { H, G } = pair();
    H.ensureColumn(6);
    H.setLiquid(6 * 32 + 1, 5, 100, LIQ.WATER);
    const keys = H.drainNetLiquid();
    const m = encodeLiq(H, keys);
    applyLiq(G, m.head, m.payload);
    expect(G.isResident(6)).toBe(false);
    expect(() => applyLiq(G, { t: 'liq', chunks: [G.chunkIndex(2, 0)] }, new Uint8Array([9, 0, 0, 0, 1]))).not.toThrow();
  });
});
