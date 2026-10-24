// chunkgen — 外圍分區塊生成器（B9）：中央 [0, width) 以外的欄由這裡產生，任一格只由 (seed, x, y) 決定。
// World 以 ColumnSource 的身分呼叫 fill(col, x0, x1)（中央區已由呼叫端排除），每欄資料（地表 / 生態 / 深度層）也問這裡。
import type { Column, ColumnLayers, ColumnSource } from '../../column';
import type { RegionInfo } from '../../regionInfo';
import { BIOME } from '../../world';
import { OuterProfile, SEA_W, type CentralFrame } from './profile';
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
  // 地區：海 = landmass 1（sea、OCEAN、整道海）；陸地生態段 k = landmass 2（wild、段的生態與範圍）。
  // 中央由 World 自己回 home（不會問到這裡；為完整起見也回 home）
  regionAt(x: number): RegionInfo {
    const z = this.profile.zoneAt(x), width = this.profile.frame.width;
    if (z.kind === 'central') {
      return { landmass: 0, side: 0, tier: 0, kind: 'home', culture: null, variant: 0, biome: BIOME.FOREST, index: 0, x0: 0, x1: width };
    }
    if (z.kind === 'sea') {
      const x0 = z.side === 1 ? width : -SEA_W, x1 = z.side === 1 ? width + SEA_W : 0;
      return { landmass: 1, side: z.side, tier: 0, kind: 'sea', culture: null, variant: 0, biome: BIOME.OCEAN, index: 0, x0, x1 };
    }
    const seg = z.seg;
    return { landmass: 2, side: z.side, tier: 0, kind: 'wild', culture: null, variant: 0, biome: seg.biome, index: seg.k, x0: seg.x0, x1: seg.x1 };
  }
  // 這一欄是不是地表洞穴入口（義大利麵從地表就開始挖）
  isEntrance(x: number): boolean { return this.filler.isEntrance(x); }
}
