// crafting.ts — 配方表與合成。station = 需在該合成站 STATION_RANGE 格內：
//   workbench 工作台（木 / 銅裝備、基本物件）、furnace 熔爐（礦 → 錠）、anvil 鐵砧（鐵 / 金 / 骸衛 / 熔心裝備、高階武器）。
import { Inventory } from './inventory';
import type { ItemId } from './items';
import type { Gear } from './gear';

/** campfire = 料理（營火或熔爐旁都可以） */
export type Station = 'workbench' | 'furnace' | 'anvil' | 'campfire';
export interface ItemAmount { item: ItemId; n: number; }
export interface Recipe {
  id: string;
  out: ItemAmount;
  inputs: readonly ItemAmount[];
  station: Station | null;
}
export interface CraftContext { nearWorkbench: boolean; nearFurnace?: boolean; nearAnvil?: boolean; nearCampfire?: boolean; }
export type CraftResult = { ok: true } | { ok: false; reason: 'unknown' | 'missing' | 'station' | 'full' };
export const STATION_NAME: Record<Station, string> = { workbench: '工作台', furnace: '熔爐', anvil: '鐵砧', campfire: '營火' };

const r = (id: string, out: ItemId, n: number, station: Station | null, ...inputs: [ItemId, number][]): Recipe =>
  ({ id, out: { item: out, n }, inputs: inputs.map(([item, k]) => ({ item, n: k })), station });

export const RECIPES: readonly Recipe[] = [
  r('planks', 'planks', 4, null, ['wood', 1]),
  r('torch', 'torch', 3, null, ['wood', 1]),
  r('workbench', 'workbench', 1, null, ['planks', 10]),
  // 鎬：銅鎬在工作台（錠來自熔爐），鐵以上要鐵砧
  r('copper_pickaxe', 'copper_pickaxe', 1, 'workbench', ['planks', 4], ['copper_bar', 5]),
  r('iron_pickaxe', 'iron_pickaxe', 1, 'anvil', ['planks', 4], ['iron_bar', 6]),
  r('silver_pickaxe', 'silver_pickaxe', 1, 'anvil', ['planks', 4], ['silver_bar', 7]),
  r('gold_pickaxe', 'gold_pickaxe', 1, 'anvil', ['planks', 4], ['gold_bar', 8]),
  r('chest', 'chest', 1, 'workbench', ['planks', 8], ['iron_ore', 2]),
  r('stone_brick', 'stone_brick', 2, 'workbench', ['stone', 2]),
  r('torch_crystal', 'torch', 6, null, ['wood', 1], ['crystal', 1]),
  r('torch_gel', 'torch', 5, null, ['wood', 1], ['gel', 1]),
  r('silver_coin', 'silver_coin', 1, null, ['copper_coin', 100]),
  r('platform', 'platform', 2, null, ['planks', 1]),
  r('wooden_door', 'wooden_door', 1, 'workbench', ['planks', 6]),
  // ── 探索工具 ──
  r('rope', 'rope', 8, null, ['wood', 1]),
  r('bed', 'bed', 1, 'workbench', ['planks', 15]),
  r('recall_stone', 'recall_stone', 1, 'workbench', ['crystal', 3], ['stone', 20]),
  r('compass', 'compass', 1, 'workbench', ['iron_ore', 6], ['copper_ore', 2]),
  r('depth_meter', 'depth_meter', 1, 'workbench', ['copper_ore', 8], ['stone', 10]),
  // ── 合成站 ──
  r('furnace', 'furnace', 1, 'workbench', ['stone', 20], ['wood', 4], ['torch', 3]),
  r('anvil', 'anvil', 1, 'workbench', ['iron_bar', 5]),
  // ── 熔爐：礦 → 錠 ──
  r('copper_bar', 'copper_bar', 1, 'furnace', ['copper_ore', 3]),
  r('iron_bar', 'iron_bar', 1, 'furnace', ['iron_ore', 3]),
  r('silver_bar', 'silver_bar', 1, 'furnace', ['silver_ore', 4]),
  r('gold_bar', 'gold_bar', 1, 'furnace', ['gold_ore', 4]),
  r('molten_bar', 'molten_bar', 1, 'furnace', ['magma_rock', 3], ['obsidian', 1], ['ember', 1]),
  // ── 武器 ──
  r('wood_sword', 'wood_sword', 1, 'workbench', ['planks', 7]),
  r('copper_sword', 'copper_sword', 1, 'workbench', ['copper_bar', 6]),
  r('iron_sword', 'iron_sword', 1, 'anvil', ['iron_bar', 7]),
  r('gold_sword', 'gold_sword', 1, 'anvil', ['gold_bar', 8]),
  r('iron_spear', 'iron_spear', 1, 'anvil', ['iron_bar', 6], ['planks', 3]),
  r('wood_bow', 'wood_bow', 1, 'workbench', ['wood', 10]),
  r('silver_bow', 'silver_bow', 1, 'anvil', ['silver_bar', 7]),
  r('throwing_knife', 'throwing_knife', 15, 'anvil', ['iron_bar', 1]),
  r('wood_boomerang', 'wood_boomerang', 1, 'workbench', ['wood', 12], ['gel', 3]),
  r('crystal_staff', 'crystal_staff', 1, 'anvil', ['crystal', 8], ['gold_bar', 4]),
  r('wooden_arrow', 'wooden_arrow', 10, 'workbench', ['wood', 1], ['stone', 1]),
  r('wooden_arrow_f', 'wooden_arrow', 15, 'workbench', ['wood', 1], ['feather', 1]),
  r('flaming_arrow', 'flaming_arrow', 5, null, ['wooden_arrow', 5], ['torch', 1]),
  // ── 防具 ──
  r('wood_helmet', 'wood_helmet', 1, 'workbench', ['planks', 15]),
  r('wood_chestplate', 'wood_chestplate', 1, 'workbench', ['planks', 20]),
  r('wood_greaves', 'wood_greaves', 1, 'workbench', ['planks', 18]),
  r('copper_helmet', 'copper_helmet', 1, 'workbench', ['copper_bar', 8]),
  r('copper_chestplate', 'copper_chestplate', 1, 'workbench', ['copper_bar', 12]),
  r('copper_greaves', 'copper_greaves', 1, 'workbench', ['copper_bar', 10]),
  r('iron_helmet', 'iron_helmet', 1, 'anvil', ['iron_bar', 10]),
  r('iron_chestplate', 'iron_chestplate', 1, 'anvil', ['iron_bar', 15]),
  r('iron_greaves', 'iron_greaves', 1, 'anvil', ['iron_bar', 12]),
  r('gold_helmet', 'gold_helmet', 1, 'anvil', ['gold_bar', 12]),
  r('gold_chestplate', 'gold_chestplate', 1, 'anvil', ['gold_bar', 18]),
  r('gold_greaves', 'gold_greaves', 1, 'anvil', ['gold_bar', 15]),
  r('bone_helmet', 'bone_helmet', 1, 'anvil', ['bone', 20], ['iron_bar', 4]),
  r('bone_chestplate', 'bone_chestplate', 1, 'anvil', ['bone', 30], ['iron_bar', 6]),
  r('bone_greaves', 'bone_greaves', 1, 'anvil', ['bone', 25], ['iron_bar', 5]),
  r('molten_helmet', 'molten_helmet', 1, 'anvil', ['molten_bar', 10]),
  r('molten_chestplate', 'molten_chestplate', 1, 'anvil', ['molten_bar', 15]),
  r('molten_greaves', 'molten_greaves', 1, 'anvil', ['molten_bar', 12]),
  // ── 消耗品 / 飾品 / 首領 ──
  r('life_core', 'life_core', 1, 'anvil', ['crystal', 4], ['gold_bar', 2]),
  r('healing_potion', 'healing_potion', 2, 'workbench', ['mushroom', 1], ['gel', 2]),
  r('healing_potion_s', 'healing_potion', 3, 'workbench', ['spore', 1], ['gel', 1]),
  r('wick_offering', 'wick_offering', 1, 'anvil', ['glow_mushroom', 6], ['gel', 5], ['gold_bar', 3]),
  r('chitin_buckler', 'chitin_buckler', 1, 'anvil', ['chitin', 10], ['iron_bar', 4]),
  r('fang_charm', 'fang_charm', 1, 'anvil', ['fang', 6], ['silver_bar', 3]),
  r('feather_charm', 'feather_charm', 1, 'workbench', ['feather', 10], ['gel', 5]),
  // ── 液體：空桶、吸水海綿、熔殼護符（黑曜石要銀鎬以上才挖得動） ──
  r('bucket', 'bucket', 1, 'workbench', ['iron_bar', 3]),
  r('sponge', 'sponge', 1, 'workbench', ['gel', 12], ['spore', 2]),
  r('magma_ward', 'magma_ward', 1, 'anvil', ['obsidian', 15], ['ember', 4]),
  // ── 釣魚：釣竿、營火、料理（營火 / 熔爐旁） ──
  r('wood_rod', 'wood_rod', 1, 'workbench', ['wood', 8], ['rope', 3]),
  r('iron_rod', 'iron_rod', 1, 'anvil', ['iron_bar', 6], ['rope', 4]),
  r('gold_rod', 'gold_rod', 1, 'anvil', ['gold_bar', 8], ['rope', 4]),
  r('cinder_rod', 'cinder_rod', 1, 'anvil', ['obsidian', 12], ['iron_bar', 4], ['ember', 3]),
  r('campfire', 'campfire', 1, null, ['wood', 8], ['torch', 2]),
  ...(['silver_minnow', 'reed_perch', 'brook_trout', 'mud_whisker', 'sun_bream', 'frost_char', 'oasis_koi', 'mistfin', 'ember_salmon',
    'pale_blindfish', 'amber_carp', 'cinder_snapper', 'petal_koi', 'stingfin', 'thunder_ray'] as const)
    .map((f) => r(`grilled_fish_${f}`, 'grilled_fish', 1, 'campfire', [f, 1])),
  r('smoked_eel', 'smoked_eel', 1, 'campfire', ['moonlit_eel', 1]),
  r('smoked_eel_obsidian', 'smoked_eel', 2, 'campfire', ['obsidian_eel', 1]),
  r('fish_stew', 'fish_stew', 1, 'campfire', ['brook_trout', 1], ['reed_perch', 1], ['mushroom', 1]),
  r('fish_stew_salmon', 'fish_stew', 1, 'campfire', ['ember_salmon', 1], ['mushroom', 1]),
  r('fish_stew_deep', 'fish_stew', 1, 'campfire', ['gloom_angler', 1]),
  r('fish_stew_squid', 'fish_stew', 1, 'campfire', ['lantern_squid', 1], ['prism_shrimp', 1]),
  // ── 家具 ──
  r('table', 'table', 1, 'workbench', ['planks', 8]),
  r('chair', 'chair', 1, 'workbench', ['planks', 4]),
  r('bookshelf', 'bookshelf', 1, 'workbench', ['planks', 12]),
  r('banner', 'banner', 1, 'workbench', ['planks', 1], ['gel', 3]),
  r('candle', 'candle', 3, 'workbench', ['gel', 2]),
  r('lantern_post', 'lantern_post', 1, 'anvil', ['iron_bar', 2], ['torch', 2]),
  r('plank_wall', 'plank_wall', 4, null, ['planks', 1]),
  // ── 建築：方塊 / 人造牆（熔爐燒磚、瓦、玻璃） ──
  r('dark_planks', 'dark_planks', 4, 'workbench', ['planks', 4], ['torch', 1]),
  r('pale_planks', 'pale_planks', 4, 'workbench', ['planks', 4], ['sand', 1]),
  r('red_brick', 'red_brick', 2, 'furnace', ['clay', 2]),
  r('roof_red', 'roof_red', 4, 'furnace', ['clay', 2]),
  r('roof_slate', 'roof_slate', 4, 'furnace', ['stone', 2], ['clay', 1]),
  r('glass', 'glass', 2, 'furnace', ['sand', 2]),
  r('fence', 'fence', 4, 'workbench', ['planks', 2]),
  r('wood_beam', 'wood_beam', 2, 'workbench', ['wood', 1]),
  r('dark_plank_wall', 'dark_plank_wall', 4, null, ['dark_planks', 1]),
  r('pale_plank_wall', 'pale_plank_wall', 4, null, ['pale_planks', 1]),
  r('stone_brick_wall', 'stone_brick_wall', 4, 'workbench', ['stone_brick', 1]),
  r('red_brick_wall', 'red_brick_wall', 4, 'workbench', ['red_brick', 1]),
  r('glass_wall', 'glass_wall', 4, 'workbench', ['glass', 1]),
  r('plaster_wall', 'plaster_wall', 4, 'workbench', ['sand', 1], ['stone', 1]),
  // ── 家具（舒適度見 engine/furniture.ts） ──
  r('sofa', 'sofa', 1, 'workbench', ['planks', 10], ['banner', 2]),
  r('fireplace', 'fireplace', 1, 'workbench', ['stone_brick', 10], ['torch', 2]),
  r('shelf', 'shelf', 1, 'workbench', ['planks', 4]),
  r('chandelier', 'chandelier', 1, 'workbench', ['copper_bar', 3], ['candle', 3]),
  r('table_lamp', 'table_lamp', 1, 'workbench', ['planks', 2], ['torch', 1]),
  r('rug', 'rug', 1, 'workbench', ['banner', 1], ['gel', 1]),
  r('potted_plant', 'potted_plant', 1, 'workbench', ['clay', 2], ['dirt', 2]),
  r('bench', 'bench', 1, 'workbench', ['planks', 6]),
  // 梳妝台：鏡子 = 玻璃（熔爐燒沙，開局就做得到；和平模式也拿得到，不靠打怪的凝膠）
  r('vanity_table', 'vanity_table', 1, 'workbench', ['planks', 6], ['glass', 2]),
  // ── 據點：爐心（宣告據點範圍）、建築木槌 ──
  r('hearth', 'hearth', 1, null, ['stone', 15], ['wood', 5], ['torch', 3]),
  r('builder_hammer', 'builder_hammer', 1, 'workbench', ['wood', 6], ['stone', 4]),
  // ── 時裝（工作台；布 = 旗幟、染料 = 凝膠 / 餘燼 / 螢光菇）。女僕裝、魔女帽、羽翼、大蝴蝶結只在地城 / 密室箱子裡找得到 ──
  r('sailor_top', 'sailor_top', 1, 'workbench', ['banner', 2], ['gel', 4]),
  r('sailor_skirt', 'sailor_skirt', 1, 'workbench', ['banner', 2], ['gel', 2]),
  r('miko_robe', 'miko_robe', 1, 'workbench', ['banner', 3]),
  r('miko_hakama', 'miko_hakama', 1, 'workbench', ['banner', 2], ['ember', 2]),
  r('hoodie_top', 'hoodie_top', 1, 'workbench', ['banner', 2], ['gel', 2], ['feather', 2]),
  r('hoodie_shorts', 'hoodie_shorts', 1, 'workbench', ['banner', 1], ['gel', 2]),
  r('travel_coat', 'travel_coat', 1, 'workbench', ['banner', 3], ['chitin', 2]),
  r('coat_trousers', 'coat_trousers', 1, 'workbench', ['banner', 2], ['chitin', 1]),
  r('explorer_vest', 'explorer_vest', 1, 'workbench', ['banner', 1], ['planks', 4]),
  r('explorer_shorts', 'explorer_shorts', 1, 'workbench', ['banner', 1], ['planks', 2]),
  r('straw_hat', 'straw_hat', 1, 'workbench', ['wood', 6]),
  r('beret', 'beret', 1, 'workbench', ['banner', 1], ['gel', 1]),
  r('flower_crown', 'flower_crown', 1, 'workbench', ['mushroom', 2], ['glow_mushroom', 2]),
  r('travel_cape', 'travel_cape', 1, 'workbench', ['banner', 3], ['feather', 2]),
  // 其他服裝與飾品（來源總表見 plan 的 Source table）：忍者 = 布 + 獠牙；騎士 = 布 + 鐵錠（鐵砧）；小花只要蘑菇和凝膠（開局就做得出來）
  r('ninja_top', 'ninja_top', 1, 'workbench', ['banner', 2], ['fang', 2]),
  r('ninja_bottom', 'ninja_bottom', 1, 'workbench', ['banner', 1], ['fang', 2]),
  r('knight_top', 'knight_top', 1, 'anvil', ['banner', 2], ['iron_bar', 4]),
  r('knight_bottom', 'knight_bottom', 1, 'anvil', ['banner', 1], ['iron_bar', 3]),
  r('acc_flower', 'acc_flower', 1, 'workbench', ['mushroom', 2], ['gel', 1]),
  r('acc_ribbon', 'acc_ribbon', 1, 'workbench', ['banner', 1], ['gel', 2]),
  r('acc_hood', 'acc_hood', 1, 'workbench', ['banner', 2], ['feather', 1]),
  r('acc_glasses', 'acc_glasses', 1, 'workbench', ['glass', 2], ['copper_bar', 1]),
];

export function findRecipe(id: string): Recipe | undefined {
  return RECIPES.find((q) => q.id === id);
}

function hasInputs(inv: Inventory, rc: Recipe): boolean {
  return rc.inputs.every((a) => inv.has(a.item, a.n));
}
export function stationOk(rc: Recipe, ctx: CraftContext): boolean {
  switch (rc.station) {
    case null: return true;
    case 'workbench': return ctx.nearWorkbench;
    case 'furnace': return Boolean(ctx.nearFurnace);
    case 'anvil': return Boolean(ctx.nearAnvil);
    case 'campfire': return Boolean(ctx.nearCampfire || ctx.nearFurnace);
  }
}

export function canCraft(inv: Inventory, rc: Recipe, ctx: CraftContext): boolean {
  return stationOk(rc, ctx) && hasInputs(inv, rc);
}

export function availableRecipes(inv: Inventory, ctx: CraftContext): Recipe[] {
  return RECIPES.filter((q) => canCraft(inv, q, ctx));
}

/** 合成一次。失敗時背包不變。makeGear = 產出是裝備時替它擲詞條（省略 = 普通）。 */
export function craft(inv: Inventory, recipeId: string, ctx: CraftContext, makeGear?: (item: ItemId) => Gear | undefined): CraftResult {
  const rc = findRecipe(recipeId);
  if (!rc) return { ok: false, reason: 'unknown' };
  if (!stationOk(rc, ctx)) return { ok: false, reason: 'station' };
  if (!hasInputs(inv, rc)) return { ok: false, reason: 'missing' };
  // 先在副本上試，確保產出放得下才提交
  const trial = Inventory.fromJSON(inv.toJSON());
  for (const a of rc.inputs) trial.remove(a.item, a.n);
  const gear = rc.out.n === 1 && makeGear ? makeGear(rc.out.item) : undefined;
  if (trial.add(rc.out.item, rc.out.n, gear) > 0) return { ok: false, reason: 'full' };
  inv.slots = trial.slots;
  return { ok: true };
}
