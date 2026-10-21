// edits.ts — 世界編輯日誌（co-op M-B2；spec §5.2、§10 D5）：以 chunk 鍵記「改完之後的狀態」，給房主送增量用。
// 同一批裡同一格只留一筆（順序是第一次被改的順序）；rev(chunk) 每記一次 +1、drain 不歸零（0 = 沒改過）。
// 待取格子總數上限 cap（EDIT_CAP）：滿了以後被改到的 chunk 改標 full（丟掉它的格子清單，rev 照加），
// 接收端整塊重抓。沒人取的日誌（單機玩很久）因此有上限。液體與結冰不進日誌（World.drainNetLiquid）。

/** 待取格子總數上限 */
export const EDIT_CAP = 4096;

/** 一個 chunk 這一批的編輯；tiles 每 5 個數字一組 [x, y, fg, wall, half]（改完後的狀態，同格一筆） */
export interface EditBatch { chunk: number; rev: number; tiles: number[]; chests: number[]; full: boolean; }

/** 格子鍵 → tiles 位置用的鍵：(x + 2**21) * 4096 + y（對 ±X_LIMIT、0 ≤ y < 4096 是單射） */
const CELL_OFF = 2 ** 21, CELL_Y = 4096;

interface Pending {
  tiles: number[];
  chests: number[];
  full: boolean;
  /** 格子鍵 → tiles 裡該組的起點（full 之後清空） */
  pos: Map<number, number>;
  chestSet: Set<number>;
}

export class EditJournal {
  private readonly cap: number;
  /** 待取的 chunk（Map 的插入順序 = 第一次被改的順序） */
  private pend = new Map<number, Pending>();
  /** 每個 chunk 的 rev（drain 不清） */
  private readonly revs = new Map<number, number>();
  /** 待取格子總數 */
  private count = 0;

  constructor(cap: number = EDIT_CAP) { this.cap = cap; }

  private entry(chunk: number): Pending {
    let p = this.pend.get(chunk);
    if (!p) {
      p = { tiles: [], chests: [], full: false, pos: new Map(), chestSet: new Set() };
      this.pend.set(chunk, p);
    }
    this.revs.set(chunk, (this.revs.get(chunk) ?? 0) + 1);
    return p;
  }

  private drop(p: Pending): void {
    this.count -= p.tiles.length / 5;
    p.tiles = [];
    p.pos.clear();
    p.full = true;
  }

  /** 記一格改完之後的狀態（同一批同格覆寫那一筆） */
  record(chunk: number, x: number, y: number, fg: number, wall: number, half: number): void {
    const p = this.entry(chunk);
    if (p.full) return;
    const key = (x + CELL_OFF) * CELL_Y + y;
    const at = p.pos.get(key);
    if (at !== undefined) {
      p.tiles[at + 2] = fg; p.tiles[at + 3] = wall; p.tiles[at + 4] = half;
      return;
    }
    if (this.count + 1 > this.cap) { this.drop(p); return; }
    p.pos.set(key, p.tiles.length);
    p.tiles.push(x, y, fg, wall, half);
    this.count++;
  }

  /** 箱子內容 / 解鎖變了（tile 鍵；同一 tile 鍵一批只留一次） */
  chest(chunk: number, tileKey: number): void {
    const p = this.entry(chunk);
    if (p.chestSet.has(tileKey)) return;
    p.chestSet.add(tileKey);
    p.chests.push(tileKey);
  }

  /** 整塊被覆寫：接收端要整塊重抓 */
  markFull(chunk: number): void {
    const p = this.entry(chunk);
    if (!p.full) this.drop(p);
  }

  /** chunk 的 rev（0 = 沒改過） */
  rev(chunk: number): number { return this.revs.get(chunk) ?? 0; }

  /** 待取的 chunk 數 */
  pending(): number { return this.pend.size; }

  /** 取走所有待取的 batch（chunk 依第一次被改的順序）；rev 保留 */
  drain(): EditBatch[] {
    const out: EditBatch[] = [];
    for (const [chunk, p] of this.pend) {
      out.push({ chunk, rev: this.revs.get(chunk) ?? 0, tiles: p.tiles, chests: p.chests, full: p.full });
    }
    this.pend = new Map();
    this.count = 0;
    return out;
  }
}
