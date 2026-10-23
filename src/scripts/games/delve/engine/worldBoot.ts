// worldBoot.ts — DelveGame 的世界開機：把「生成 → 世界與生成資訊」包成 WorldContent，建構子只讀它。
//   · legacy：舊生成器（generateWorld 的 GenResult）→ World.fromGen（中央 arrays 模式）+ 外圍 OuterGen（無限世界）。
//   · gen2：不建中央、什麼都不生成（欄由 Gen2Source 在 ensureColumn 時生成）；其餘生成資訊空陣列 / null。
import { World, type ColumnSource } from './world';
import type { WorldBounds } from './coords';
import { OuterGen } from './legacy/chunkgen';
import type { GenResult, BiomeSegment, Structure, Landform, ReservedZone, GenLayers } from './legacy/worldgen';
import type { DungeonInfo } from './legacy/gen/dungeon';
import type { VillageInfo, HallInfo } from './legacy/gen/settlements';
import type { LandmarkInfo } from './legacy/gen/landmarks';
import type { SpringSpec } from './liquid';
import { outerRegions, type Region } from './discovery';
import { gen2LandQuery, v1LandQuery, type LandQuery } from './waystones';
import { Gen2Source } from './gen2';
import { LockTable, type LockJSON } from './gen2/locks';
import { SPAWN_X } from './gen2/layout';
import { SEA_Y, CAVERN_BASE, MOLTEN_BASE } from './gen2/profile';
import { WORLD_W, WORLD_H } from './constants';

/** 世界怎麼生成（DelveOptions.worldGen；省略 = legacy）。locks = 存檔的地塊鎖表 */
export type WorldGenSpec = { kind: 'legacy' } | { kind: 'gen2'; locks?: LockJSON };

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
  relics: GenResult['relics'];
  springs: SpringSpec[];
  villages: VillageInfo[];
  halls: HallInfo[];
  landmarks: LandmarkInfo[];
  /** null = 建構子照舊 buildRegions（舊世界） */
  regions: Region[] | null;
  /** 外圍 / gen2 地區查詢（legacy = outerRegions、gen2 = null；Task 14 接 gen2） */
  outer: ((x: number, y: number) => Region[]) | null;
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
    regions: null,
    outer: outer ? outerRegions(seed, outer) : null,
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
  // HUD / 後備用的全域層線（每欄的真實層線一律問 source.layersAt）
  world.surfaceY = SEA_Y + 30;
  world.rockY = SEA_Y + 60;
  world.cavernY = CAVERN_BASE - 16;
  world.moltenY = MOLTEN_BASE - 12;
  return {
    world,
    spawn: { x: SPAWN_X, y: source.surfaceAt(SPAWN_X) - 1 },
    biomes: [], structures: [], landforms: [],
    dungeonZone: null, layers: null, dungeon: null,
    tablets: [], relics: [], springs: [],
    villages: [], halls: [], landmarks: [],
    regions: [],
    outer: null,
    land: gen2LandQuery(source),
  };
}
