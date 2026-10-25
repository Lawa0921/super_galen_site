// worldBoot.ts — DelveGame 的世界開機：把「生成 → 世界與生成資訊」包成 WorldContent，建構子只讀它。
//   · legacy：舊生成器（generateWorld 的 GenResult）→ World.fromGen（中央 arrays 模式）+ 外圍 OuterGen（無限世界）。
//   · gen2：不建中央、什麼都不生成（欄由 Gen2Source 在 ensureColumn 時生成）；開局先建家鄉全部藍圖（BlueprintIndex.homePlans，Q9，
//     客人副本也一樣——只算藍圖），再由 gen2/home.ts 的 homeContent（Q11，Task 14）填：sites（家鄉聚落，居民開局就在）、tablets（14 塊石碑，
//     日誌古碑 0 / 14、碑文 id）、relics、landmarks（日誌的地標總數）、structures（地下背景：蘑菇林 / 地城）。
//     villages / halls / dungeon 仍給空的（舊世界的 legacySites / 地城提示走它們；gen2 的聚落走 sites），regions 仍是 []（中央沒有地區清單）；
//     地區（Task 15）：outer = gen2Regions、known = gen2HomeRegions（家鄉地塊地區 + 家鄉藍圖的結構地區，開局 Discovery.know——家鄉全知）、
//     resolveRegion = gen2RegionById（讀檔把 trackOuter 存的外圍已知地區反查回來）。
//   · baked（烘焙過的舊世界，Task 16）：不跑舊生成器；中央的格子全在存檔裡（讀檔蓋上），每欄資料 / 生成資訊 / 地區清單取存檔的
//     LegacyMeta；欄由 BakedSource 分段生成（舊外圍 = v1、接縫外 = gen2）。
import { World, type ColumnSource } from './world';
import type { WorldBounds } from './coords';
import { OuterGen } from './legacy/chunkgen';
import type { GenResult } from './legacy/worldgen';
import type { BiomeSegment, Structure, Landform, ReservedZone, GenLayers, GenRelic, DungeonInfo, VillageInfo, HallInfo, LandmarkInfo, GenSite } from './genTypes';
import type { SpringSpec } from './liquid';
import { outerRegions, gen2Regions, gen2RegionById, gen2HomeRegions, regionFromJSON, type Region } from './discovery';
import { bakedLandQuery, gen2LandQuery, v1LandQuery, type LandQuery } from './waystones';
import { BakedSource } from './bakedSource';
import type { BakeInfo } from '../save/bake';
import type { LegacyMeta } from '../save/legacyMeta';
import { Gen2Source } from './gen2';
import { homeContent } from './gen2/home';
import { LockTable, type LockJSON } from './gen2/locks';
import { SPAWN_X } from './gen2/layout';
import { SEA_Y, CAVERN_BASE, MOLTEN_BASE } from './gen2/profile';
import { WORLD_W, WORLD_H } from './constants';

/** 世界怎麼生成（DelveOptions.worldGen；省略 = legacy）。locks = 存檔的地塊鎖表；baked = 烘焙過的舊世界（存檔的 bake + legacy） */
export type WorldGenSpec = { kind: 'legacy' } | { kind: 'gen2'; locks?: LockJSON } | { kind: 'baked'; locks?: LockJSON; bake: BakeInfo; meta: LegacyMeta };

export interface WorldContent {
  world: World;
  spawn: { x: number; y: number };
  biomes: BiomeSegment[];
  structures: Structure[];
  landforms: Landform[];
  dungeonZone: ReservedZone | null;
  layers: GenLayers | null;
  dungeon: DungeonInfo | null;
  tablets: { x: number; y: number; id: number }[];
  relics: GenRelic[];
  springs: SpringSpec[];
  villages: VillageInfo[];
  halls: HallInfo[];
  landmarks: LandmarkInfo[];
  /** 開局就登錄的聚落（gen2 家鄉的 homeSites；legacy / baked 給 []，舊世界的聚落由 villages / halls / dungeon 經 legacySites 登錄） */
  sites: GenSite[];
  /** null = 建構子照舊 buildRegions（舊世界） */
  regions: Region[] | null;
  /** 外圍 / gen2 地區查詢（legacy = outerRegions、gen2 = gen2Regions） */
  outer: ((x: number, y: number) => Region[]) | null;
  /** 開局就知道的地區（Discovery.know；gen2 = gen2HomeRegions、legacy / baked = []——舊世界的已知表 = 中央 regions） */
  known: Region[];
  /** 地區 id 反查（Discovery.setResolver；gen2 = gen2RegionById、legacy / baked = null） */
  resolveRegion: ((id: number) => Region | null) | null;
  /** 傳送碑的陸地查詢（null = 有界世界，只有出生點那顆） */
  land: LandQuery | null;
}

/** 舊世界：生成結果 → 欄儲存的世界（中央 arrays 模式；source = OuterGen 時有外圍地區與外圍傳送碑） */
export function bootLegacy(seed: string, gen: GenResult, opts: { bounds: WorldBounds; source: ColumnSource | null }): WorldContent {
  const { bounds, source } = opts;
  // fromGen 也設好每欄深度層線（world.layers = gen.layers）
  const world = World.fromGen(gen.world, gen.layers, { bounds, source });
  const outer = source instanceof OuterGen ? source.profile : null;
  return {
    world,
    spawn: gen.spawn,
    biomes: gen.biomes,
    structures: gen.structures,
    landforms: gen.landforms,
    dungeonZone: gen.dungeonZone,
    layers: gen.layers,
    dungeon: gen.dungeon,
    tablets: gen.tablets,
    relics: gen.relics,
    springs: gen.springs,
    villages: gen.villages ?? [],
    halls: gen.halls ?? [],
    landmarks: gen.landmarks ?? [],
    sites: [],
    regions: null,
    outer: outer ? outerRegions(seed, outer) : null,
    known: [],
    resolveRegion: null,
    land: outer ? v1LandQuery(outer) : null,
  };
}

/**
 * gen2 世界：正式尺寸、無限、中央也由 Gen2Source 生成（central 'source'：建構時不建任何欄、不 pin）。
 * 鎖表必須在 Gen2Source 建構前載好（Layout 會快取地塊）；客人副本（replica）的鎖表凍結、不記新鎖。
 */
export function bootGen2(seed: string, spec: Extract<WorldGenSpec, { kind: 'gen2' }>, replica: boolean): WorldContent {
  const source = new Gen2Source(seed, { locks: LockTable.fromJSON(spec.locks ?? [], { frozen: replica }), recordLocks: !replica });
  const world = new World(WORLD_W, WORLD_H, { bounds: 'infinite', source, central: 'source' });
  source.blueprints.homePlans();
  // 遊戲會改自己的陣列：給複本（homeContent 依 source 快取）
  const hc = structuredClone(homeContent(source));
  // HUD / 後備用的全域層線（每欄的真實層線一律問 source.layersAt）
  world.surfaceY = SEA_Y + 30;
  world.rockY = SEA_Y + 60;
  world.cavernY = CAVERN_BASE - 16;
  world.moltenY = MOLTEN_BASE - 12;
  return {
    world,
    spawn: { x: SPAWN_X, y: source.surfaceAt(SPAWN_X) - 1 },
    biomes: [], structures: hc.structures, landforms: [],
    dungeonZone: null, layers: null, dungeon: null,
    tablets: hc.tablets, relics: hc.relics, springs: [],
    villages: [], halls: [], landmarks: hc.landmarks,
    sites: hc.sites,
    regions: [],
    outer: gen2Regions(seed, source),
    known: gen2HomeRegions(seed, source),
    resolveRegion: gen2RegionById(seed, source),
    land: gen2LandQuery(source),
  };
}

/**
 * 烘焙過的舊世界：World（central 'source'）+ BakedSource。中央每欄資料讀 LegacyMeta（= 舊生成器的輸出），
 * 地區清單由 RegionJSON 重建（id 不變）；外圍地區 / 傳送碑：舊範圍內 = v1（id、名字、位置與舊世界相同），接縫外 = gen2。
 * 中央的格子不在這裡：讀檔時存檔的 chunk 整塊蓋上（restoreGame）。bake.quiet → world.bakedQuiet（不喚醒的中央 chunk）
 */
export function bootBaked(seed: string, spec: Extract<WorldGenSpec, { kind: 'baked' }>, replica: boolean): WorldContent {
  const m = spec.meta, bake = spec.bake;
  const source = new BakedSource(seed, m, bake, LockTable.fromJSON(spec.locks ?? [], { frozen: replica }), !replica);
  const world = new World(m.frame.width, m.frame.height, { bounds: 'infinite', source, central: 'source' });
  world.surfaceY = m.surfaceY;
  world.rockY = m.rockY;
  world.cavernY = m.cavernY;
  world.moltenY = m.moltenY;
  for (const [k, d] of m.potDrops) world.potDrops.set(k, d.map((q) => ({ ...q })));
  let k = 0;
  for (const d of bake.quiet) { k += d; world.bakedQuiet.add(k); }
  const v1 = outerRegions(seed, source.v1.profile), g2 = gen2Regions(seed, source.gen2);
  return {
    world,
    spawn: { ...m.spawn },
    biomes: m.biomes, structures: m.structures, landforms: m.landforms,
    dungeonZone: m.dungeonZone, layers: m.layers, dungeon: m.dungeon,
    tablets: m.tablets, relics: m.relics, springs: m.springs,
    villages: m.villages, halls: m.halls, landmarks: m.landmarks,
    sites: [],
    regions: m.regions.map((j) => regionFromJSON(j, m.layers, m.frame.height)),
    outer: (x, y) => (source.inLegacy(x) ? v1(x, y) : g2(x, y)),
    known: [],
    resolveRegion: null,
    land: bakedLandQuery(m.frame.width, bake.west.x, bake.east.x, v1LandQuery(source.v1.profile), gen2LandQuery(source.gen2)),
  };
}
