// items.ts — 道具表。方塊類道具用 place 指回 tile id；鎬用 pick。
import { T, type LocalName } from './tiles';
import { MAX_STACK } from './constants';

export type ItemId =
  | 'dirt' | 'stone' | 'sand' | 'wood' | 'planks' | 'copper_ore' | 'iron_ore'
  | 'torch' | 'workbench' | 'wood_pickaxe' | 'copper_pickaxe' | 'iron_pickaxe';

export interface PickStats { speed: number; tier: number; }
export interface ItemDef {
  id: ItemId;
  name: LocalName;
  maxStack: number;
  place?: number;
  pick?: PickStats;
}

const block = (id: ItemId, zh: string, en: string, place: number): ItemDef =>
  ({ id, name: { zh, en }, maxStack: MAX_STACK, place });
const pick = (id: ItemId, zh: string, en: string, speed: number, tier: number): ItemDef =>
  ({ id, name: { zh, en }, maxStack: 1, pick: { speed, tier } });

export const ITEMS: Record<ItemId, ItemDef> = {
  dirt: block('dirt', '泥土', 'Dirt', T.DIRT),
  stone: block('stone', '石頭', 'Stone', T.STONE),
  sand: block('sand', '沙', 'Sand', T.SAND),
  wood: { id: 'wood', name: { zh: '木材', en: 'Wood' }, maxStack: MAX_STACK },
  planks: block('planks', '木板', 'Planks', T.PLANKS),
  copper_ore: block('copper_ore', '銅礦', 'Copper Ore', T.COPPER_ORE),
  iron_ore: block('iron_ore', '鐵礦', 'Iron Ore', T.IRON_ORE),
  torch: block('torch', '火把', 'Torch', T.TORCH),
  workbench: block('workbench', '工作台', 'Workbench', T.WORKBENCH),
  wood_pickaxe: pick('wood_pickaxe', '木鎬', 'Wooden Pickaxe', 1, 1),
  copper_pickaxe: pick('copper_pickaxe', '銅鎬', 'Copper Pickaxe', 2, 2),
  iron_pickaxe: pick('iron_pickaxe', '鐵鎬', 'Iron Pickaxe', 3, 3),
};

export function isItemId(v: unknown): v is ItemId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, v);
}
export function itemDef(id: ItemId): ItemDef { return ITEMS[id]; }
