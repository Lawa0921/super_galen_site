// column.ts — 區塊欄（B2）：32 格寬 × height 格高，每層一個 Uint8Array(32*height)，索引 (y << 5) | (x & 31)。
// 一個 chunk 剛好是欄內連續的 1024 bytes（subarray(cy*1024, (cy+1)*1024)）：網路層 / 存檔要一個 chunk 就是一段 subarray。
import { CHUNK } from './constants';

/** 材質變體 0..2（座標雜湊；任何座標都有值，包括世界外） */
export function variantHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % 3;
}

/** 欄內索引：(y << 5) | (x & 31)（x 是世界座標；負 x 一樣取低 5 bit） */
export const li = (x: number, y: number): number => (y << 5) | (x & 31);

/** 欄的層數（fg / wall / liquid / liquidType / frozen / half / variant） */
export const COLUMN_LAYERS = 7;

export class Column {
  readonly cx: number;
  readonly height: number;
  readonly fg: Uint8Array;
  readonly wall: Uint8Array;
  readonly liquid: Uint8Array;
  readonly liquidType: Uint8Array;
  readonly frozen: Uint8Array;
  readonly half: Uint8Array;
  /** 材質變體 0..2（與扁平世界相同的座標雜湊；非存檔內容） */
  readonly variant: Uint8Array;
  /** 七層共用的 buffer（依上面的順序，第 k 層從 k*32*height 開始）：world.window 批次複製用 */
  readonly view: DataView;

  /** hashVariant = false：variant 先留 0，呼叫端自己填（World.fromGen 直接複製生成格已算好的） */
  constructor(cx: number, height: number, hashVariant = true) {
    this.cx = cx;
    this.height = height;
    const n = CHUNK * height, buf = new ArrayBuffer(n * COLUMN_LAYERS);
    this.fg = new Uint8Array(buf, 0, n);
    this.wall = new Uint8Array(buf, n, n);
    this.liquid = new Uint8Array(buf, 2 * n, n);
    this.liquidType = new Uint8Array(buf, 3 * n, n);
    this.frozen = new Uint8Array(buf, 4 * n, n);
    this.half = new Uint8Array(buf, 5 * n, n);
    this.variant = new Uint8Array(buf, 6 * n, n);
    this.view = new DataView(buf);
    if (!hashVariant) return;
    const x0 = cx * CHUNK, V = this.variant;
    for (let y = 0; y < height; y++) {
      const o = y << 5;
      for (let lx = 0; lx < CHUNK; lx++) V[o | lx] = variantHash(x0 + lx, y);
    }
  }
}

/** 欄的深度層線（第一個屬於該層的 y） */
export interface ColumnLayers { rock: number; deep: number; molten: number; }

/** 中央以外的欄由誰生成（Task 7 的外圍生成器；測試用簡單的雜湊來源） */
export interface ColumnSource {
  readonly version: number;
  /** 寫入第 col.cx 欄中 world x ∈ [x0, x1) 的格（呼叫端已排除中央區） */
  fill(col: Column, x0: number, x1: number): void;
  surfaceAt(x: number): number;
  biomeAt(x: number): number;
  layersAt(x: number): ColumnLayers;
  /** 第 x 欄的水面 y（海；沒有水 = null）。選用：畫面的遠景地平線用（海上看得到的是水面、不是海床） */
  waterTopAt?(x: number): number | null;
}

/** 一個 chunk 的六層（各 CHUNK*CHUNK，索引 ly*CHUNK + lx；網路層 / 存檔 / 停放用） */
export interface ChunkData {
  fg: Uint8Array; wall: Uint8Array; liquid: Uint8Array; liquidType: Uint8Array; frozen: Uint8Array; half: Uint8Array;
}
