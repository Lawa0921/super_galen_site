// index.ts — DELVE engine 對外入口（render / input / page 從這裡 import）。
export * from './constants';
export { DelveGame } from './game';
export type { DelveOptions, DelveEvent, DelveState, BlockReason, MiningState } from './game';
export { World } from './world';
export { T, W, TILES, WALLS, tileDef, isSolidTile, blocksLight } from './tiles';
export type { TileDef, WallDef, TileId, WallId, LocalName } from './tiles';
export { ITEMS, itemDef, isItemId } from './items';
export type { ItemId, ItemDef, PickStats } from './items';
export { Inventory } from './inventory';
export type { Stack, InventoryJSON } from './inventory';
export { RECIPES, findRecipe, canCraft, availableRecipes } from './crafting';
export type { Recipe, CraftResult } from './crafting';
export { LightEngine, LightMap, skyBrightness } from './lighting';
export type { LightRect, PointLight } from './lighting';
export { generateWorld } from './worldgen';
export type { GenResult } from './worldgen';
