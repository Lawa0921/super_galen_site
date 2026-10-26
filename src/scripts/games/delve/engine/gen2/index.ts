// gen2 — 無限世界生成器 v2：Layout（版面）→ Profile2（每欄側寫）→ BlueprintIndex（結構藍圖）→ Filler2（寫格子）。World 的 ColumnSource。
//
// 版本閘門慣例（GEN2_VERSION / 地塊鎖）：
// - 每片地塊第一次被 fill 涉及時上鎖（LockTable 記 [side, i, ver, culture]），之後永遠用那個 ver 的規則生成，
//   所以同一個世界改版後，已經去過的地方不會變；沒鎖的地塊用 latestVer（預設 GEN2_VERSION）。
// - 新功能寫 if (ctx.ver >= N) 分支；改既有功能要保留舊分支（ver 0 在 M1 期間尚未凍結，M2 起凍結）。
// - GEN2_MIN_VERSION = 還支援讀取的最舊 ver；舊於它的鎖要先遷移。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import type { Column, ColumnLayers, ColumnSource, GenChest, GenExtras } from '../column';
import type { RegionInfo } from '../regionInfo';
import { WORLD_H } from '../constants';
import { Layout, newWorldOrigin, type Landmass, type LayoutOrigin } from './layout';
import { LockTable } from './locks';
import { Profile2, SEA_Y } from './profile';
import { Filler2, FILL_REACH } from './fill';
import { BlueprintIndex, depthFrac } from './blueprint';
import { chestLoot, withExtras } from '../loot';

export const GEN2_VERSION = 0, GEN2_MIN_VERSION = 0;

// 新世界的陸地 shore（只有烘焙世界的接縫會用到 shore；新世界兩側都從海開始）
const NEW_SHORE = SEA_Y - 7;

export interface Gen2Options {
  // 版面原點（預設新世界：家鄉 [0, 4200)、兩側從海開始）
  origin?: LayoutOrigin;
  // 存檔的鎖表（預設空表）；必須在建構前就載好（Layout 會快取地塊）
  locks?: LockTable;
  // fill 時記錄新鎖（預設 true；重播 / 客人副本傳 false）
  recordLocks?: boolean;
  // 沒鎖的地塊用的版本（預設 GEN2_VERSION）
  latestVer?: number;
}

export class Gen2Source implements ColumnSource {
  readonly version: number = GEN2_VERSION;
  readonly layout: Layout;
  readonly profile: Profile2;
  readonly locks: LockTable;
  readonly blueprints: BlueprintIndex;
  private readonly filler: Filler2;
  private readonly recordLocks: boolean;

  constructor(readonly seed: string, opts: Gen2Options = {}) {
    this.locks = opts.locks ?? new LockTable();
    this.recordLocks = opts.recordLocks ?? true;
    this.layout = new Layout(seed, opts.origin ?? newWorldOrigin(SEA_Y, NEW_SHORE), this.locks, opts.latestVer ?? GEN2_VERSION);
    this.profile = new Profile2(seed, this.layout, WORLD_H);
    this.blueprints = new BlueprintIndex(seed, this.layout, this.profile);
    this.filler = new Filler2(seed, this.layout, this.profile, this.blueprints);
  }

  // 寫入第 col.cx 欄中 world x ∈ [x0, x1) 的格（任意子範圍；col 是新建的空欄）。先把這段讀得到的地塊上鎖
  fill(col: Column, x0: number, x1: number): void {
    if (x1 <= x0) return;
    if (this.recordLocks) {
      this.lock(this.layout.landmassAt(x0 - FILL_REACH));
      this.lock(this.layout.landmassAt(x0));
      this.lock(this.layout.landmassAt(x1 - 1));
      this.lock(this.layout.landmassAt(x1 - 1 + FILL_REACH));
    }
    this.filler.fill(col, x0, x1);
  }

  private lock(m: Landmass | null): void {
    if (m) this.locks.lock(m.side, m.i, { ver: m.ver, culture: m.culture });
  }

  // 地表 = 側寫的地表被 SURFACE 層藍圖的地面覆寫（遺跡的底等；與 BpCtx.groundAt 同一個函式，Q4）
  surfaceAt(x: number): number { return this.blueprints.groundAt(x); }
  biomeAt(x: number): number { return this.profile.biomeAt(x); }
  layersAt(x: number): ColumnLayers { return this.profile.layersAt(x); }
  waterTopAt(x: number): number | null { return this.profile.waterTopAt(x); }
  // gen2 範圍外丟 RangeError（BakedSource 只在範圍內問）
  regionAt(x: number): RegionInfo {
    const r = this.profile.regionAt(x);
    if (!r) throw new RangeError(`gen2: x ${x} is outside gen2`);
    return r;
  }
  // 生成物件：與 [x0 − FILL_REACH, x1 + FILL_REACH) 相交的藍圖裡 x ∈ [x0, x1) 的箱子（坑道底藏物的外框可能伸出自己的槽 ≤ SHAFT_REACH 欄，Task 14；
  // 同 fill 的查詢範圍），內容 = chestLoot(seed, x, y, kind, depthFrac) + 附加物品（每次回新的 slots）
  objectsIn(x0: number, x1: number): GenChest[] {
    const out: GenChest[] = [];
    for (const b of this.blueprints.overlapping(x0 - FILL_REACH, x1 + FILL_REACH)) for (const c of b.chests) {
      if (c.x >= x0 && c.x < x1) out.push({ x: c.x, y: c.y, slots: withExtras(chestLoot(this.seed, c.x, c.y, c.kind, depthFrac(this.profile, c.x, c.y)), c.extra ?? []) });
    }
    return out;
  }
  // 其他生成物件：與 [x0 − FILL_REACH, x1 + FILL_REACH) 相交的藍圖裡 x ∈ [x0, x1) 的陶罐掉落 / 石碑 / 地標，與錨點（外框 x）在 [x0, x1) 內的聚落（每次回新物件）
  extrasIn(x0: number, x1: number): GenExtras {
    const out: GenExtras = { pots: [], tablets: [], landmarks: [], sites: [] };
    const inside = (x: number): boolean => x >= x0 && x < x1;
    for (const b of this.blueprints.overlapping(x0 - FILL_REACH, x1 + FILL_REACH)) {
      for (const p of b.pots) if (inside(p.x)) out.pots.push({ x: p.x, y: p.y, drops: p.drops.map((d) => ({ ...d })) });
      for (const t of b.tablets) if (inside(t.x)) out.tablets.push({ ...t });
      for (const l of b.landmarks) if (inside(l.x)) out.landmarks.push({ ...l });
      if (b.site && inside(b.x)) out.sites.push(structuredClone(b.site));
    }
    return out;
  }
  // 這一欄是不是地表洞穴入口（陸地欄、義大利麵從地表就開始挖）
  isEntrance(x: number): boolean { return this.filler.isEntrance(x); }
}
