// chunkgen — 外圍分區塊生成器（B9）：中央 [0, width) 以外的欄由這裡產生，任一格只由 (seed, x, y) 決定。
// World 以 ColumnSource 的身分呼叫 fill(col, x0, x1)（中央區已由呼叫端排除），每欄資料（地表 / 生態 / 深度層）也問這裡。
import type { Column, ColumnLayers, ColumnSource } from '../column';
import { OuterProfile, type CentralFrame } from './profile';
import { OuterFiller } from './fill';

export { OuterProfile, frameOf, SEA_W, SEG_W, SEG_JITTER, SEA_DEPTH, SHORE_RAMP } from './profile';
export type { CentralFrame, OuterSegment, OuterZone } from './profile';

// 外圍生成器版本：寫進存檔（1b 換生成器時判斷用）
export const OUTER_GEN_VERSION = 1;

export class OuterGen implements ColumnSource {
  readonly version = OUTER_GEN_VERSION;
  readonly profile: OuterProfile;
  private readonly filler: OuterFiller;

  constructor(seed: string, frame: CentralFrame) {
    this.profile = new OuterProfile(seed, frame);
    this.filler = new OuterFiller(seed, this.profile);
  }

  fill(col: Column, x0: number, x1: number): void { this.filler.fill(col, x0, x1); }
  surfaceAt(x: number): number { return this.profile.surfaceAt(x); }
  biomeAt(x: number): number { return this.profile.biomeAt(x); }
  layersAt(x: number): ColumnLayers { return this.profile.layersAt(x); }
  waterTopAt(x: number): number | null { return this.profile.waterTopAt(x); }
  // 這一欄是不是地表洞穴入口（義大利麵從地表就開始挖）
  isEntrance(x: number): boolean { return this.filler.isEntrance(x); }
}
