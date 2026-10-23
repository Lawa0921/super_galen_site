// world.stream.test.ts — 區塊欄儲存：常駐 / 停放 / 卸載（B2、B7、B8）。
// 用測試用 ColumnSource（依座標雜湊寫 STONE / DIRT / AIR）建 bounds: 'infinite' 的小世界。
import { describe, it, expect } from 'vitest';
import { World, LIQ } from './world';
import { GenGrid } from './legacy/gen/grid';
import { Column, li, variantHash, type ColumnSource, type ColumnLayers } from './column';
import { T, W } from './tiles';
import { CHUNK } from './constants';
import { X_LIMIT } from './coords';

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

const H = 100; // chunksY = 4（最後一列 chunk 只有 4 列格）
const mk = (src = new TestSource(), width = 64): World => new World(width, H, { bounds: 'infinite', source: src });
const LAYERS = ['fg', 'wall', 'liquid', 'liquidType', 'frozen', 'half', 'variant'] as const;
function sameColumn(a: Column, b: Column): void {
  for (const k of LAYERS) expect(Buffer.from(a[k]).equals(Buffer.from(b[k])), k).toBe(true);
}

describe('World 區塊欄儲存', () => {
  it('預設 legacy 有界：xMin 0 / xMax width，中央欄全部常駐', () => {
    const w = new World(100, 70);
    expect(w.bounds).toBe('legacy');
    expect(w.xMin).toBe(0);
    expect(w.xMax).toBe(100);
    expect(w.residentColumns()).toEqual([0, 1, 2, 3]);
    expect(w.isSolid(-1, 5)).toBe(true);
    expect(w.isSolid(100, 5)).toBe(true);
    expect(w.getFg(100, 5)).toBe(T.STONE);
    expect(() => w.ensureColumn(4)).toThrow();
  });

  it('infinite：xMin / xMax = ±X_LIMIT；ensureColumn 後讀到 source 的值', () => {
    const src = new TestSource(), w = mk(src);
    expect(w.bounds).toBe('infinite');
    expect(w.xMin).toBe(-X_LIMIT);
    expect(w.xMax).toBe(X_LIMIT);
    w.ensureColumn(-3);
    expect(w.isResident(-3)).toBe(true);
    expect(w.getFg(-90, 40)).toBe(srcFg(-90, 40));
    expect(w.getWall(-90, 40)).toBe(srcWall(-90, 40));
    expect(src.fills).toEqual([[-3, -96, -64]]);
    expect(w.columnAt(-90)?.cx).toBe(-3);
    expect(w.variantAt(-90, 40)).toBe(variantHash(-90, 40));
  });

  it('沒常駐的欄：讀回 STONE、isSolid 為真、寫入丟掉（回 false）', () => {
    const w = mk();
    expect(w.isResident(15)).toBe(false);
    expect(w.columnAt(500)).toBeNull();
    expect(w.getFg(500, 40)).toBe(T.STONE);
    expect(w.getWall(500, 40)).toBe(0);
    expect(w.getLiquid(500, 40)).toBe(0);
    expect(w.getLiquidType(500, 40)).toBe(LIQ.NONE);
    expect(w.isSolid(500, 40)).toBe(true);
    expect(w.isFrozen(500, 40)).toBe(false);
    expect(w.setFg(500, 40, T.DIRT)).toBe(false);
    expect(w.setWall(500, 40, W.DIRT_WALL)).toBe(false);
    expect(w.setLiquid(500, 40, 255, LIQ.WATER)).toBe(false);
    expect(w.variantAt(500, 40)).toBe(variantHash(500, 40));
    expect(w.isResident(15)).toBe(false);
    expect(w.modifiedChunks.size).toBe(0);
  });

  it('改過的欄卸載 → 停放；載回來那格還在、其他格等於 source', () => {
    const w = mk();
    w.ensureColumn(-3);
    expect(w.setFg(-90, 40, T.WOOD)).toBe(true);
    w.setLiquid(-70, 90, 200, LIQ.LAVA);
    const ck = w.chunkIndex(-3, 1), ck2 = w.chunkIndex(-3, 2);
    expect(w.unloadColumn(-3)).toBe(true);
    expect(w.isResident(-3)).toBe(false);
    expect(w.getFg(-90, 40)).toBe(T.STONE);
    expect(w.parkedChunks().sort((a, b) => a - b)).toEqual([ck, ck2].sort((a, b) => a - b));
    const back = w.ensureColumn(-3);
    expect(w.getFg(-90, 40)).toBe(T.WOOD);
    expect(w.getLiquid(-70, 90)).toBe(200);
    expect(w.getLiquidType(-70, 90)).toBe(LIQ.LAVA);
    for (let y = 0; y < H; y++) for (let x = -96; x < -64; x++) {
      if ((x === -90 && y === 40)) continue;
      expect(back.fg[li(x, y)]).toBe(srcFg(x, y));
      if (!(x === -70 && y === 90)) expect(back.liquid[li(x, y)]).toBe(0);
    }
    // 載回來後由欄本身持有；停放清單清掉，modifiedChunks 照舊
    expect(w.parkedChunks()).toEqual([]);
    expect(w.modifiedChunks.has(ck)).toBe(true);
    // 再卸載一次照樣停放
    expect(w.unloadColumn(-3)).toBe(true);
    expect(w.parkedChunks()).toContain(ck);
  });

  it('沒改過的欄卸載再載入：逐格相同、不停放', () => {
    const w = mk();
    const a = w.ensureColumn(7);
    const snap = new Column(7, H);
    for (const k of LAYERS) snap[k].set(a[k]);
    expect(w.unloadColumn(7)).toBe(true);
    expect(w.parkedChunks()).toEqual([]);
    sameColumn(w.ensureColumn(7), snap);
  });

  it('readChunk → 同 source 的另一個世界 writeChunk：該 chunk 每層相同（網路層的形狀）', () => {
    const a = mk(), b = mk();
    a.ensureColumn(-2);
    a.setFg(-50, 70, T.WOOD);
    a.setWall(-49, 70, W.DIRT_WALL);
    a.setLiquid(-48, 71, 99, LIQ.WATER);
    a.setFrozen(-47, 72, true);
    a.setFg(-46, 73, T.STONE); a.setHalf(-46, 73, true);
    const d = a.readChunk(-2, 2);
    expect(d).not.toBeNull();
    expect(b.isResident(-2)).toBe(false);
    b.writeChunk(-2, 2, d!);
    expect(b.isResident(-2)).toBe(true);
    expect(b.modifiedChunks.has(b.chunkIndex(-2, 2))).toBe(true);
    const e = b.readChunk(-2, 2)!;
    for (const k of ['fg', 'wall', 'liquid', 'liquidType', 'frozen', 'half'] as const) expect(Buffer.from(e[k]).equals(Buffer.from(d![k])), k).toBe(true);
    expect(b.getFg(-50, 70)).toBe(T.WOOD);
    expect(b.isHalf(-46, 73)).toBe(true);
    // 沒常駐、沒停放 → null；停放 → 回停放的內容
    expect(b.readChunk(40, 0)).toBeNull();
    a.unloadColumn(-2);
    expect(a.readChunk(-2, 2)!.fg[(70 - 64) * CHUNK + (-50 & 31)]).toBe(T.WOOD);
    // 最後一列 chunk 只有 4 列格：其餘補 0
    a.ensureColumn(-2);
    const last = a.readChunk(-2, 3)!;
    expect(last.fg.length).toBe(CHUNK * CHUNK);
    expect(last.fg.subarray(4 * CHUNK).every((v) => v === 0)).toBe(true);
  });

  it('peekColumn 不改變常駐清單；會蓋上停放的內容', () => {
    const w = mk();
    const before = w.residentColumns();
    const p = w.peekColumn(9);
    expect(p.fg[li(9 * 32 + 3, 10)]).toBe(srcFg(9 * 32 + 3, 10));
    expect(w.residentColumns()).toEqual(before);
    expect(w.isResident(9)).toBe(false);
    w.ensureColumn(9);
    w.setFg(9 * 32 + 3, 10, T.WOOD);
    expect(w.peekColumn(9)).toBe(w.columnAt(9 * 32));
    w.unloadColumn(9);
    expect(w.peekColumn(9).fg[li(9 * 32 + 3, 10)]).toBe(T.WOOD);
    expect(w.isResident(9)).toBe(false);
    expect(w.parkedChunks()).toEqual([w.chunkIndex(9, 0)]);
  });

  it('中央欄與 pinned 欄 unloadColumn 回 false', () => {
    const w = mk();
    expect(w.unloadColumn(0)).toBe(false);
    expect(w.unloadColumn(1)).toBe(false);
    w.ensureColumn(5);
    w.pin(5);
    expect(w.unloadColumn(5)).toBe(false);
    w.unpin(5);
    expect(w.unloadColumn(5)).toBe(true);
    w.unpin(0);
    expect(w.unloadColumn(0)).toBe(false);
    expect(w.unloadColumn(123)).toBe(false); // 本來就沒常駐
  });

  it('載入順序無關：[−5..5] 正序與亂序 ensure，所有常駐欄位元組相同', () => {
    const a = mk(), b = mk();
    const order = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
    for (const cx of order) a.ensureColumn(cx);
    for (const cx of [3, -1, 5, -5, 0, 2, -3, 4, -2, 1, -4]) b.ensureColumn(cx);
    expect(a.residentColumns()).toEqual(order);
    expect(b.residentColumns()).toEqual(order);
    for (const cx of order) sameColumn(a.peekColumn(cx), b.peekColumn(cx));
  });

  it('中央欄 x ≥ width 的格（width 不是 32 的倍數）由 source 填；x < width 是空氣', () => {
    const src = new TestSource(), w = mk(src, 50);
    expect(src.fills).toEqual([[1, 50, 64]]);
    expect(w.getFg(49, 10)).toBe(T.AIR);
    expect(w.getFg(55, 10)).toBe(srcFg(55, 10));
    // 沒有 source：空氣
    const z = new World(50, H, { bounds: 'infinite' });
    expect(z.getFg(55, 10)).toBe(T.AIR);
    expect(z.ensureColumn(-1).fg.every((v) => v === 0)).toBe(true);
  });

  it('surfaceAt / biomeAt / layersAt：中央讀每欄陣列，中央以外問 source', () => {
    const w = mk();
    w.surface[3] = 44; w.biome[3] = 3;
    expect(w.surfaceAt(3)).toBe(44);
    expect(w.biomeAt(3)).toBe(3);
    expect(w.surfaceAt(-5)).toBe(30 + (-5 & 3));
    expect(w.biomeAt(-5)).toBe(2);
    expect(w.biomeAt(70)).toBe(1);
    expect(w.layersAt(-7)).toEqual({ rock: 51, deep: 70, molten: 90 });
  });

  it('window 跨欄：常駐欄複製、沒常駐的欄 = STONE + variant 雜湊', () => {
    const w = mk();
    w.ensureColumn(-1);
    const win = w.window(-40, 5, 80, 6);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 80; c++) {
      const x = -40 + c, y = 5 + r, i = r * 80 + c;
      expect(win.fg[i]).toBe(w.getFg(x, y));
      expect(win.variant[i]).toBe(variantHash(x, y));
      if (x < -32) expect(win.fg[i]).toBe(T.STONE);
    }
    // 32 寬、對齊欄界（chunk 烘焙的形狀）與不對齊的短列段
    w.setLiquid(-20, 7, 50, LIQ.WATER);
    for (const [x0, y0, ww, hh] of [[-32, 3, 32, 10], [-31, 98, 32, 5], [-3, -2, 7, 4]]) {
      const v = w.window(x0, y0, ww, hh, win);
      for (let r = 0; r < hh; r++) for (let c = 0; c < ww; c++) {
        const x = x0 + c, y = y0 + r, i = r * ww + c;
        expect([x, y, v.fg[i], v.wall[i], v.liquid[i], v.variant[i]]).toEqual([x, y, w.getFg(x, y), w.getWall(x, y), w.getLiquid(x, y), variantHash(x, y)]);
      }
    }
  });

  it('forEachChunk / markAllDirty 走常駐欄；touch 的鄰 chunk dirty 跨負 x 欄界', () => {
    const w = mk();
    w.ensureColumn(-1);
    const seen: string[] = [];
    w.forEachChunk((cx, cy) => { if (cy === 0) seen.push(String(cx)); });
    expect(seen).toEqual(['-1', '0', '1']);
    w.drainDirty();
    w.setFg(-32, 10, T.WOOD); // 欄 −1 的最左格：鄰欄 −2 沒常駐，照樣標（重畫邊界）
    const d = w.drainDirty();
    expect(d).toContain(w.chunkIndex(-1, 0));
    expect(d).toContain(w.chunkIndex(-2, 0));
    w.setFg(-1, 10, T.WOOD); // 欄 −1 的最右格 → 欄 0
    expect(w.drainDirty()).toEqual(expect.arrayContaining([w.chunkIndex(-1, 0), w.chunkIndex(0, 0)]));
    w.markAllDirty();
    expect(w.drainDirty().length).toBe(3 * 4);
  });

  it('drainColumnEvents：ensure / unload 的欄', () => {
    const w = mk();
    w.drainColumnEvents();
    w.ensureColumn(-4); w.ensureColumn(6); w.ensureColumn(6);
    w.unloadColumn(-4);
    expect(w.drainColumnEvents()).toEqual({ loaded: [-4, 6], unloaded: [-4] });
    expect(w.drainColumnEvents()).toEqual({ loaded: [], unloaded: [] });
  });

  it('載入一欄 → 常駐的左右鄰欄整欄 chunk 標 dirty（接縫重烘焙）；卸載 → 它的 chunk 從 dirty / liquidDirty 拿掉', () => {
    const w = mk();
    w.ensureColumn(-2);
    w.drainDirty(); w.drainLiquidDirty();
    w.ensureColumn(-1);
    const d = new Set(w.drainDirty());
    for (let cy = 0; cy < w.chunksY; cy++) {
      for (const cx of [-2, -1, 0]) expect(d.has(w.chunkIndex(cx, cy)), `${cx},${cy}`).toBe(true);
      expect(d.has(w.chunkIndex(-3, cy))).toBe(false);
    }
    w.setFg(-40, 10, T.AIR);
    w.setLiquid(-40, 12, 100, LIQ.WATER);
    w.setFg(-60, 10, T.AIR);
    expect(w.unloadColumn(-2)).toBe(true);
    const dirty = w.drainDirty(), liq = w.drainLiquidDirty();
    for (let cy = 0; cy < w.chunksY; cy++) {
      expect(dirty).not.toContain(w.chunkIndex(-2, cy));
      expect(liq).not.toContain(w.chunkIndex(-2, cy));
    }
    // 停放的仍在（存檔 / 回來時蓋回）
    expect(w.parkedChunks()).toContain(w.chunkIndex(-2, 0));
  });

  it('停放蓋回來的 chunk → drainRestoredChunks；parkChunk 只停放沒常駐的欄', () => {
    const w = mk();
    w.ensureColumn(-3);
    w.setFg(-90, 40, T.WOOD);
    const k = w.chunkIndex(-3, 1);
    w.unloadColumn(-3);
    expect(w.drainRestoredChunks()).toEqual([]);
    w.ensureColumn(-3);
    expect(w.drainRestoredChunks()).toEqual([k]);
    expect(w.getFg(-90, 40)).toBe(T.WOOD);
    const d = w.readChunk(-3, 1)!;
    expect(w.parkChunk(-3, 1, d)).toBe(false);
    w.unloadColumn(-3);
    const e = { ...d, fg: d.fg.slice() };
    e.fg[(40 % CHUNK) * CHUNK + (-90 & 31)] = T.GLASS;
    expect(w.parkChunk(-3, 1, e)).toBe(true);
    w.ensureColumn(-3);
    expect(w.getFg(-90, 40)).toBe(T.GLASS);
  });

  it('flaggedTiles 含常駐與停放的外圍格（升冪）', () => {
    const w = mk();
    w.ensureColumn(-1);
    w.setFg(-5, 7, T.STONE); w.setHalf(-5, 7, true);
    w.setFg(3, 7, T.STONE); w.setHalf(3, 7, true);
    const keys = [w.idx(3, 7), w.idx(-5, 7)].sort((a, b) => a - b);
    expect(w.flaggedTiles('half')).toEqual(keys);
    w.unloadColumn(-1);
    expect(w.flaggedTiles('half')).toEqual(keys);
  });

  it('fromGen：複製中央各層、箱子 / 陶罐 / 金寶箱、每欄陣列與深度層', () => {
    const g = new GenGrid(70, 40);
    g.fg[5 * 70 + 66] = T.DIRT; g.wall[6 * 70 + 1] = W.DIRT_WALL;
    g.liquid[7 * 70 + 2] = 77; g.liquidType[7 * 70 + 2] = LIQ.HONEY;
    g.half[8 * 70 + 3] = 1; g.frozen[9 * 70 + 4] = 1;
    g.chests.set(11, [null]); g.potDrops.set(12, []); g.unlocked.add(13);
    g.surface[4] = 21; g.biome[4] = 2;
    g.surfaceY = 9; g.rockY = 19; g.cavernY = 29; g.moltenY = 35;
    const layers = { rock: new Int16Array(70).fill(19), deep: new Int16Array(70).fill(29), molten: new Int16Array(70).fill(35) };
    const w = World.fromGen(g, layers);
    expect(w.bounds).toBe('legacy');
    expect(w.getFg(66, 5)).toBe(T.DIRT);
    expect(w.getWall(1, 6)).toBe(W.DIRT_WALL);
    expect(w.getLiquid(2, 7)).toBe(77);
    expect(w.getLiquidType(2, 7)).toBe(LIQ.HONEY);
    expect(w.isHalf(3, 8)).toBe(true);
    expect(w.isFrozen(4, 9)).toBe(true);
    expect(w.getFg(69, 39)).toBe(T.AIR);
    expect([...w.chests.keys()]).toEqual([11]);
    expect([...w.potDrops.keys()]).toEqual([12]);
    expect([...w.unlocked]).toEqual([13]);
    expect(w.surfaceAt(4)).toBe(21);
    expect(w.biomeAt(4)).toBe(2);
    expect([w.surfaceY, w.rockY, w.cavernY, w.moltenY]).toEqual([9, 19, 29, 35]);
    expect(w.layers).toBe(layers);
    // variant：整欄從生成格複製、最後一欄（不滿 32）x ≥ width 的格照座標雜湊
    for (const [x, y] of [[0, 0], [5, 5], [40, 39], [69, 20], [75, 3], [95, 39]]) expect(w.peekColumn(x >> 5).variant[li(x, y)], `${x},${y}`).toBe(variantHash(x, y));
    // 世界與生成格各自獨立
    w.setFg(66, 5, T.AIR);
    expect(g.fg[5 * 70 + 66]).toBe(T.DIRT);
  });
});
