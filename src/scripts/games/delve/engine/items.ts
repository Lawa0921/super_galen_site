// items.ts — 道具表。方塊類道具用 place 指回 tile id；鎬用 pick。
import { T, type LocalName } from './tiles';
import { LIQ } from './liquidKind';
import { MAX_STACK } from './constants';

export type ItemId =
  | 'dirt' | 'stone' | 'sand' | 'wood' | 'planks' | 'copper_ore' | 'iron_ore'
  | 'torch' | 'workbench' | 'wood_pickaxe' | 'copper_pickaxe' | 'iron_pickaxe'
  // ── 新材料 ──
  | 'silver_ore' | 'gold_ore' | 'clay' | 'gravel' | 'granite' | 'marble' | 'sandstone'
  | 'snow' | 'ice' | 'mud' | 'stone_brick'
  // ── 物件 / 素材 / 錢 ──
  | 'chest' | 'pumpkin' | 'glow_mushroom' | 'mushroom' | 'crystal' | 'cactus'
  | 'copper_coin' | 'silver_coin'
  | 'silver_pickaxe' | 'gold_pickaxe'
  // ── 深度層 / 地城 ──
  | 'deep_stone' | 'basalt' | 'ash' | 'obsidian' | 'magma_rock'
  | 'dungeon_brick_blue' | 'dungeon_brick_green' | 'dungeon_brick_pink'
  | 'platform' | 'wooden_door' | 'dungeon_key' | 'golden_key'
  | 'lantern' | 'rune_pickaxe' | 'explorer_map'
  // ── 探索工具 / 飾品 ──
  | 'rope' | 'bed' | 'recall_stone' | 'compass' | 'depth_meter'
  | 'jump_boots' | 'swift_boots' | 'night_amulet' | 'magnet'
  // ── 戰鬥：怪物素材 / 錠 / 合成站 ──
  | 'gel' | 'bone' | 'feather' | 'fang' | 'chitin' | 'stinger' | 'spore' | 'ember'
  | 'copper_bar' | 'iron_bar' | 'silver_bar' | 'gold_bar' | 'molten_bar'
  | 'furnace' | 'anvil'
  // ── 武器 / 彈藥 ──
  | 'wood_sword' | 'copper_sword' | 'iron_sword' | 'gold_sword' | 'iron_spear' | 'bone_greatsword' | 'lumen_blade'
  | 'wood_bow' | 'silver_bow' | 'throwing_knife' | 'wood_boomerang' | 'crystal_staff'
  | 'wooden_arrow' | 'flaming_arrow'
  // ── 防具（頭 / 身 / 腿） ──
  | 'wood_helmet' | 'wood_chestplate' | 'wood_greaves'
  | 'copper_helmet' | 'copper_chestplate' | 'copper_greaves'
  | 'iron_helmet' | 'iron_chestplate' | 'iron_greaves'
  | 'gold_helmet' | 'gold_chestplate' | 'gold_greaves'
  | 'bone_helmet' | 'bone_chestplate' | 'bone_greaves'
  | 'molten_helmet' | 'molten_chestplate' | 'molten_greaves'
  // ── 消耗品 / 戰鬥飾品 / 首領 ──
  | 'life_core' | 'healing_potion' | 'wick_offering'
  | 'chitin_buckler' | 'fang_charm' | 'feather_charm' | 'warden_heart' | 'warden_trophy'
  // ── 液體：蜂巢 / 酥蜜塊、水桶、吸水海綿、熔殼護符 ──
  | 'hive' | 'crispy_honey' | 'bucket' | 'water_bucket' | 'lava_bucket' | 'honey_bucket' | 'sponge' | 'magma_ward'
  // ── 釣魚：釣竿 / 魚餌 / 魚 / 垃圾 / 木箱 / 料理 / 營火 ──
  | 'wood_rod' | 'iron_rod' | 'gold_rod' | 'cinder_rod'
  | 'worm' | 'grub' | 'grasshopper' | 'firefly' | 'sunbeetle'
  | 'silver_minnow' | 'reed_perch' | 'brook_trout' | 'mud_whisker' | 'sun_bream' | 'frost_char' | 'oasis_koi'
  | 'moonlit_eel' | 'thunder_ray' | 'mistfin' | 'ember_salmon' | 'petal_koi' | 'pale_blindfish' | 'prism_shrimp'
  | 'lantern_squid' | 'gloom_angler' | 'amber_carp' | 'stingfin' | 'cinder_snapper' | 'obsidian_eel' | 'old_whiskers'
  | 'soggy_boot' | 'wooden_crate' | 'iron_crate' | 'golden_crate'
  | 'grilled_fish' | 'smoked_eel' | 'fish_stew' | 'campfire';

/**
 * 飾品效果。移動 / 戰鬥類（jump、run、night、magnet、nofall、stat）要裝在裝備欄的飾品槽才生效；
 * 資訊類（compass、depth、map）放在背包任一格或裝在飾品槽都生效（見 INFO_ACCESSORIES）。
 *   jump 跳更高（安全落下高度 +8 格）、run 跑更快、night 身邊微光、magnet 撿拾半徑變大 + 伸手距離 +3、
 *   nofall 不受摔落傷害、stat 只有數值加成（stats）、lavaward 熔岩不傷身、不會著火、
 *   compass HUD 顯示東西座標、depth HUD 顯示深度格數、map 全地圖顯示所有地標位置。
 */
export type Accessory = 'jump' | 'run' | 'night' | 'magnet' | 'compass' | 'depth' | 'map' | 'nofall' | 'stat' | 'lavaward';
export const INFO_ACCESSORIES: readonly Accessory[] = ['compass', 'depth', 'map'];

/** 武器種類：sword 揮砍弧、broadsword 大弧重擊、spear 直刺、bow 射箭、throw 投擲（消耗本身）、boomerang 迴旋、staff 法術（耗魔） */
export type WeaponKind = 'sword' | 'broadsword' | 'spear' | 'bow' | 'throw' | 'boomerang' | 'staff';
export interface WeaponDef {
  kind: WeaponKind;
  damage: number;
  /** 每次攻擊秒數 */
  useTime: number;
  /** 擊退速度（px/s） */
  knockback: number;
  /** 基礎暴擊率 0..1 */
  crit: number;
  /** 近戰觸及（px，從身體中心算） */
  reach?: number;
  /** 投射物初速（px/s） */
  speed?: number;
  /** 每發耗魔 */
  mana?: number;
  /** 需要的彈藥 */
  ammo?: 'arrow';
  /** 揮劍時放出光刃（燈脈之刃） */
  wave?: boolean;
}
export interface AmmoDef { kind: 'arrow'; damage: number; flame?: boolean; }
export type ArmorSlot = 'head' | 'body' | 'legs';
export type ArmorSetId = 'wood' | 'copper' | 'iron' | 'gold' | 'bone' | 'molten';
export interface ArmorDef { slot: ArmorSlot; defense: number; set: ArmorSetId; }
/** 被動數值（飾品）：damage = 傷害加成比例、crit = 暴擊率加成、regen = 回血速度加成比例 */
export interface StatMods { defense?: number; maxHp?: number; damage?: number; crit?: number; regen?: number; }

export interface PickStats { speed: number; tier: number; }
export interface ItemDef {
  id: ItemId;
  name: LocalName;
  maxStack: number;
  place?: number;
  pick?: PickStats;
  /** 拿在手上時在玩家身邊發光的強度（0..1） */
  heldLight?: number;
  /** 獨特道具（地城 / 探索戰利品） */
  unique?: boolean;
  /** 飾品效果（在背包裡就生效） */
  accessory?: Accessory;
  /**
   * 主動使用（手持按「使用」）：recall = 引導後傳送回重生點、life = 永久提高最大生命、heal = 回血（有冷卻）、
   * summon = 召喚首領（夜晚或洞穴層以下）、scoop = 空桶舀起一格液體、pour = 倒出桶裡的液體（liquid 指定種類）、
   * sponge = 吸掉瞄準格（與左右）的水 / 蜂蜜（按住可連續）
   */
  use?: 'recall' | 'life' | 'heal' | 'summon' | 'scoop' | 'pour' | 'sponge'
    /** 釣竿：拋竿 / 收竿；料理：吃（回血）；木箱：打開 */
    | 'fish' | 'eat' | 'crate';
  /** 釣竿：釣力、能不能在熔岩裡釣 */
  rod?: { power: number; lava?: boolean };
  /** 魚餌的釣力 */
  bait?: number;
  /** 料理：吃了回多少血 */
  food?: number;
  /** 釣得到的魚（日誌：釣魚紀錄） */
  fish?: boolean;
  /** 桶裡裝的液體（LIQ.*；pour 用） */
  liquid?: number;
  weapon?: WeaponDef;
  ammo?: AmmoDef;
  armor?: ArmorDef;
  stats?: StatMods;
}

const block = (id: ItemId, zh: string, en: string, place: number): ItemDef =>
  ({ id, name: { zh, en }, maxStack: MAX_STACK, place });
const pick = (id: ItemId, zh: string, en: string, speed: number, tier: number): ItemDef =>
  ({ id, name: { zh, en }, maxStack: 1, pick: { speed, tier } });
const mat = (id: ItemId, zh: string, en: string): ItemDef => ({ id, name: { zh, en }, maxStack: MAX_STACK });
const wpn = (id: ItemId, zh: string, en: string, weapon: WeaponDef, extra: Partial<ItemDef> = {}): ItemDef =>
  ({ id, name: { zh, en }, maxStack: 1, weapon, ...extra });
const arm = (id: ItemId, zh: string, en: string, slot: ArmorSlot, defense: number, set: ArmorSetId): ItemDef =>
  ({ id, name: { zh, en }, maxStack: 1, armor: { slot, defense, set } });
const acc = (id: ItemId, zh: string, en: string, accessory: Accessory, stats?: StatMods, unique = false): ItemDef =>
  ({ id, name: { zh, en }, maxStack: 1, accessory, ...(stats ? { stats } : {}), ...(unique ? { unique } : {}) });

const rod = (id: ItemId, zh: string, en: string, power: number, lava = false): ItemDef =>
  ({ id, name: { zh, en }, maxStack: 1, use: 'fish', rod: lava ? { power, lava } : { power } });
const bait = (id: ItemId, zh: string, en: string, power: number): ItemDef => ({ id, name: { zh, en }, maxStack: MAX_STACK, bait: power });
const fish = (id: ItemId, zh: string, en: string): ItemDef => ({ id, name: { zh, en }, maxStack: MAX_STACK, fish: true });
const food = (id: ItemId, zh: string, en: string, heal: number): ItemDef => ({ id, name: { zh, en }, maxStack: 99, use: 'eat', food: heal });

export const ITEMS: Record<ItemId, ItemDef> = {
  dirt: block('dirt', '泥土', 'Dirt', T.DIRT),
  stone: block('stone', '石頭', 'Stone', T.STONE),
  sand: block('sand', '沙', 'Sand', T.SAND),
  wood: mat('wood', '木材', 'Wood'),
  planks: block('planks', '木板', 'Planks', T.PLANKS),
  copper_ore: block('copper_ore', '銅礦', 'Copper Ore', T.COPPER_ORE),
  iron_ore: block('iron_ore', '鐵礦', 'Iron Ore', T.IRON_ORE),
  torch: block('torch', '火把', 'Torch', T.TORCH),
  workbench: block('workbench', '工作台', 'Workbench', T.WORKBENCH),
  wood_pickaxe: pick('wood_pickaxe', '木鎬', 'Wooden Pickaxe', 1, 1),
  copper_pickaxe: pick('copper_pickaxe', '銅鎬', 'Copper Pickaxe', 2, 2),
  iron_pickaxe: pick('iron_pickaxe', '鐵鎬', 'Iron Pickaxe', 3, 3),
  silver_ore: block('silver_ore', '銀礦', 'Silver Ore', T.SILVER_ORE),
  gold_ore: block('gold_ore', '金礦', 'Gold Ore', T.GOLD_ORE),
  clay: block('clay', '黏土', 'Clay', T.CLAY),
  gravel: block('gravel', '碎石', 'Gravel', T.GRAVEL),
  granite: block('granite', '花崗岩', 'Granite', T.GRANITE),
  marble: block('marble', '大理石', 'Marble', T.MARBLE),
  sandstone: block('sandstone', '砂岩', 'Sandstone', T.SANDSTONE),
  snow: block('snow', '雪塊', 'Snow Block', T.SNOW),
  ice: block('ice', '冰塊', 'Ice Block', T.ICE),
  mud: block('mud', '泥巴', 'Mud', T.MUD),
  stone_brick: block('stone_brick', '石磚', 'Stone Brick', T.STONE_BRICK),
  chest: { ...block('chest', '箱子', 'Chest', T.CHEST), maxStack: 99 },
  pumpkin: block('pumpkin', '南瓜', 'Pumpkin', T.PUMPKIN),
  glow_mushroom: block('glow_mushroom', '螢光菇', 'Glowing Mushroom', T.GLOW_MUSHROOM),
  mushroom: mat('mushroom', '蘑菇', 'Mushroom'),
  crystal: mat('crystal', '水晶碎片', 'Crystal Shard'),
  cactus: mat('cactus', '仙人掌', 'Cactus'),
  copper_coin: mat('copper_coin', '銅幣', 'Copper Coin'),
  silver_coin: mat('silver_coin', '銀幣', 'Silver Coin'),
  silver_pickaxe: pick('silver_pickaxe', '銀鎬', 'Silver Pickaxe', 3.6, 4),
  gold_pickaxe: pick('gold_pickaxe', '金鎬', 'Gold Pickaxe', 4.4, 5),
  deep_stone: block('deep_stone', '深層岩', 'Deep Rock', T.DEEP_STONE),
  basalt: block('basalt', '玄武岩', 'Basalt', T.BASALT),
  ash: block('ash', '灰燼', 'Ash', T.ASH),
  obsidian: block('obsidian', '黑曜石', 'Obsidian', T.OBSIDIAN),
  magma_rock: block('magma_rock', '熔岩石', 'Magma Rock', T.MAGMA_ROCK),
  dungeon_brick_blue: block('dungeon_brick_blue', '藍地城磚', 'Blue Dungeon Brick', T.DUNGEON_BRICK_BLUE),
  dungeon_brick_green: block('dungeon_brick_green', '綠地城磚', 'Green Dungeon Brick', T.DUNGEON_BRICK_GREEN),
  dungeon_brick_pink: block('dungeon_brick_pink', '粉地城磚', 'Pink Dungeon Brick', T.DUNGEON_BRICK_PINK),
  platform: block('platform', '木平台', 'Wooden Platform', T.PLATFORM),
  // 木門：放置時往上佔 3 格（game.tryPlace 特別處理）
  wooden_door: { ...block('wooden_door', '木門', 'Wooden Door', T.DOOR_CLOSED), maxStack: 99 },
  dungeon_key: { ...mat('dungeon_key', '地城鑰匙', 'Dungeon Key'), maxStack: 99 },
  golden_key: { ...mat('golden_key', '金鑰匙', 'Golden Key'), maxStack: 99 },
  lantern: { id: 'lantern', name: { zh: '探險提燈', en: "Delver's Lantern" }, maxStack: 1, heldLight: 1, unique: true },
  rune_pickaxe: { ...pick('rune_pickaxe', '符文鎬', 'Rune Pickaxe', 5.6, 5), unique: true },
  explorer_map: { id: 'explorer_map', name: { zh: '探險家地圖', en: "Explorer's Map" }, maxStack: 1, unique: true, accessory: 'map' },
  rope: block('rope', '繩索', 'Rope', T.ROPE),
  // 床：放置時佔兩格（床頭 + 右邊床尾，game.tryPlace 特別處理）
  bed: { ...block('bed', '床', 'Bed', T.BED_HEAD), maxStack: 99 },
  recall_stone: { id: 'recall_stone', name: { zh: '傳送石', en: 'Recall Stone' }, maxStack: 1, use: 'recall' },
  compass: { id: 'compass', name: { zh: '指南針', en: 'Compass' }, maxStack: 1, accessory: 'compass' },
  depth_meter: { id: 'depth_meter', name: { zh: '深度計', en: 'Depth Gauge' }, maxStack: 1, accessory: 'depth' },
  jump_boots: { id: 'jump_boots', name: { zh: '跳躍靴', en: 'Springstep Boots' }, maxStack: 1, unique: true, accessory: 'jump' },
  swift_boots: { id: 'swift_boots', name: { zh: '疾行靴', en: 'Windrunner Boots' }, maxStack: 1, unique: true, accessory: 'run' },
  night_amulet: { id: 'night_amulet', name: { zh: '夜視護符', en: 'Owl-Eye Amulet' }, maxStack: 1, unique: true, accessory: 'night' },
  magnet: { id: 'magnet', name: { zh: '磁石', en: 'Lodestone' }, maxStack: 1, unique: true, accessory: 'magnet' },
  // ── 怪物素材 ──
  gel: mat('gel', '凝膠', 'Gel'),
  bone: mat('bone', '骨頭', 'Bone'),
  feather: mat('feather', '羽毛', 'Feather'),
  fang: mat('fang', '獠牙', 'Fang'),
  chitin: mat('chitin', '甲殼', 'Chitin'),
  stinger: mat('stinger', '蜂刺', 'Stinger'),
  spore: mat('spore', '菇孢', 'Spore Pod'),
  ember: mat('ember', '餘燼', 'Ember'),
  // ── 錠 / 合成站 ──
  copper_bar: mat('copper_bar', '銅錠', 'Copper Bar'),
  iron_bar: mat('iron_bar', '鐵錠', 'Iron Bar'),
  silver_bar: mat('silver_bar', '銀錠', 'Silver Bar'),
  gold_bar: mat('gold_bar', '金錠', 'Gold Bar'),
  molten_bar: mat('molten_bar', '熔心錠', 'Moltenheart Bar'),
  furnace: { ...block('furnace', '熔爐', 'Furnace', T.FURNACE), maxStack: 99 },
  anvil: { ...block('anvil', '鐵砧', 'Anvil', T.ANVIL), maxStack: 99 },
  // ── 武器 ──
  wood_sword: wpn('wood_sword', '木劍', 'Wooden Sword', { kind: 'sword', damage: 7, useTime: 0.42, knockback: 170, crit: 0.04, reach: 32 }),
  copper_sword: wpn('copper_sword', '銅劍', 'Copper Sword', { kind: 'sword', damage: 10, useTime: 0.38, knockback: 190, crit: 0.04, reach: 34 }),
  iron_sword: wpn('iron_sword', '鐵劍', 'Iron Sword', { kind: 'sword', damage: 13, useTime: 0.36, knockback: 210, crit: 0.05, reach: 36 }),
  gold_sword: wpn('gold_sword', '金劍', 'Gold Sword', { kind: 'sword', damage: 18, useTime: 0.33, knockback: 240, crit: 0.06, reach: 38 }),
  iron_spear: wpn('iron_spear', '鐵矛', 'Iron Spear', { kind: 'spear', damage: 15, useTime: 0.5, knockback: 230, crit: 0.05, reach: 60 }),
  bone_greatsword: wpn('bone_greatsword', '碎骨大劍', 'Bonecleaver', { kind: 'broadsword', damage: 26, useTime: 0.5, knockback: 380, crit: 0.06, reach: 46 }, { unique: true }),
  lumen_blade: wpn('lumen_blade', '燈脈之刃', 'Lumen Vein Blade', { kind: 'sword', damage: 30, useTime: 0.3, knockback: 260, crit: 0.08, reach: 42, wave: true, speed: 420 }, { unique: true, heldLight: 0.7 }),
  wood_bow: wpn('wood_bow', '木弓', 'Wooden Bow', { kind: 'bow', damage: 5, useTime: 0.55, knockback: 90, crit: 0.04, speed: 520, ammo: 'arrow' }),
  silver_bow: wpn('silver_bow', '銀弓', 'Silver Bow', { kind: 'bow', damage: 10, useTime: 0.45, knockback: 110, crit: 0.06, speed: 640, ammo: 'arrow' }),
  throwing_knife: { ...wpn('throwing_knife', '飛刀', 'Throwing Knife', { kind: 'throw', damage: 11, useTime: 0.3, knockback: 60, crit: 0.08, speed: 560 }), maxStack: MAX_STACK },
  wood_boomerang: wpn('wood_boomerang', '迴旋木刃', 'Whirlwood', { kind: 'boomerang', damage: 12, useTime: 0.4, knockback: 160, crit: 0.04, speed: 440 }),
  crystal_staff: wpn('crystal_staff', '晶光法杖', 'Prism Staff', { kind: 'staff', damage: 17, useTime: 0.36, knockback: 120, crit: 0.05, speed: 480, mana: 6 }, { heldLight: 0.5 }),
  wooden_arrow: { ...mat('wooden_arrow', '木箭', 'Wooden Arrow'), ammo: { kind: 'arrow', damage: 5 } },
  flaming_arrow: { ...mat('flaming_arrow', '火焰箭', 'Flaming Arrow'), ammo: { kind: 'arrow', damage: 8, flame: true } },
  // ── 防具 ──
  wood_helmet: arm('wood_helmet', '木頭盔', 'Wooden Helmet', 'head', 1, 'wood'),
  wood_chestplate: arm('wood_chestplate', '木胸甲', 'Wooden Breastplate', 'body', 1, 'wood'),
  wood_greaves: arm('wood_greaves', '木護脛', 'Wooden Greaves', 'legs', 0, 'wood'),
  copper_helmet: arm('copper_helmet', '銅頭盔', 'Copper Helmet', 'head', 1, 'copper'),
  copper_chestplate: arm('copper_chestplate', '銅胸甲', 'Copper Breastplate', 'body', 2, 'copper'),
  copper_greaves: arm('copper_greaves', '銅護脛', 'Copper Greaves', 'legs', 1, 'copper'),
  iron_helmet: arm('iron_helmet', '鐵頭盔', 'Iron Helmet', 'head', 2, 'iron'),
  iron_chestplate: arm('iron_chestplate', '鐵胸甲', 'Iron Breastplate', 'body', 3, 'iron'),
  iron_greaves: arm('iron_greaves', '鐵護脛', 'Iron Greaves', 'legs', 2, 'iron'),
  gold_helmet: arm('gold_helmet', '金頭盔', 'Gold Helmet', 'head', 3, 'gold'),
  gold_chestplate: arm('gold_chestplate', '金胸甲', 'Gold Breastplate', 'body', 5, 'gold'),
  gold_greaves: arm('gold_greaves', '金護脛', 'Gold Greaves', 'legs', 3, 'gold'),
  bone_helmet: arm('bone_helmet', '骸衛頭盔', 'Ossuary Helm', 'head', 4, 'bone'),
  bone_chestplate: arm('bone_chestplate', '骸衛胸甲', 'Ossuary Mail', 'body', 5, 'bone'),
  bone_greaves: arm('bone_greaves', '骸衛護脛', 'Ossuary Greaves', 'legs', 4, 'bone'),
  molten_helmet: arm('molten_helmet', '熔心頭盔', 'Moltenheart Helm', 'head', 5, 'molten'),
  molten_chestplate: arm('molten_chestplate', '熔心胸甲', 'Moltenheart Plate', 'body', 7, 'molten'),
  molten_greaves: arm('molten_greaves', '熔心護脛', 'Moltenheart Greaves', 'legs', 5, 'molten'),
  // ── 消耗品 ──
  life_core: { ...mat('life_core', '生命晶核', 'Vital Core'), maxStack: 99, use: 'life' },
  healing_potion: { ...mat('healing_potion', '治療藥水', 'Healing Draught'), maxStack: 99, use: 'heal' },
  wick_offering: { ...mat('wick_offering', '燈芯祭品', 'Wick Offering'), maxStack: 20, use: 'summon' },
  // ── 戰鬥飾品 ──
  chitin_buckler: acc('chitin_buckler', '甲殼小盾', 'Chitin Buckler', 'stat', { defense: 3 }),
  fang_charm: acc('fang_charm', '狼牙墜', 'Fang Pendant', 'stat', { crit: 0.06, damage: 0.04 }),
  feather_charm: acc('feather_charm', '輕羽墜', 'Featherfall Charm', 'nofall'),
  warden_heart: acc('warden_heart', '守望之心', "Warden's Heart", 'stat', { maxHp: 20, defense: 2, regen: 0.5 }, true),
  warden_trophy: { id: 'warden_trophy', name: { zh: '守望者戰利品', en: 'Warden Trophy' }, maxStack: 1, unique: true },
  // ── 液體 ──
  hive: block('hive', '蜂巢殼', 'Hive Comb', T.HIVE),
  crispy_honey: block('crispy_honey', '酥蜜塊', 'Crisp Honey Block', T.CRISPY_HONEY),
  bucket: { ...mat('bucket', '空桶', 'Empty Pail'), maxStack: 99, use: 'scoop' },
  water_bucket: { ...mat('water_bucket', '水桶', 'Pail of Water'), maxStack: 99, use: 'pour', liquid: LIQ.WATER },
  lava_bucket: { ...mat('lava_bucket', '熔岩桶', 'Pail of Lava'), maxStack: 99, use: 'pour', liquid: LIQ.LAVA },
  honey_bucket: { ...mat('honey_bucket', '蜂蜜桶', 'Pail of Honey'), maxStack: 99, use: 'pour', liquid: LIQ.HONEY },
  sponge: { id: 'sponge', name: { zh: '吸水海綿', en: 'Soak Sponge' }, maxStack: 1, use: 'sponge' },
  magma_ward: acc('magma_ward', '熔殼護符', 'Cinderguard Charm', 'lavaward'),
  // ── 釣魚 ──
  wood_rod: rod('wood_rod', '柳木釣竿', 'Willow Rod', 10),
  iron_rod: rod('iron_rod', '鐵線釣竿', 'Ironline Rod', 22),
  gold_rod: rod('gold_rod', '鎏金釣竿', 'Gilded Rod', 36),
  cinder_rod: rod('cinder_rod', '燼線釣竿', 'Cinderline Rod', 30, true),
  worm: bait('worm', '蚯蚓', 'Earthworm', 10),
  grub: bait('grub', '肥蛆', 'Fat Grub', 18),
  grasshopper: bait('grasshopper', '蚱蜢', 'Grasshopper', 15),
  firefly: bait('firefly', '螢火蟲', 'Firefly', 24),
  sunbeetle: bait('sunbeetle', '金曦甲蟲', 'Sunbeetle', 45),
  silver_minnow: fish('silver_minnow', '銀米諾', 'Silver Minnow'),
  reed_perch: fish('reed_perch', '蘆葦鱸', 'Reed Perch'),
  brook_trout: fish('brook_trout', '溪鱒', 'Brook Trout'),
  mud_whisker: fish('mud_whisker', '泥鬚鯰', 'Mud Whisker'),
  sun_bream: fish('sun_bream', '曬日鯛', 'Sun Bream'),
  frost_char: fish('frost_char', '霜鱒', 'Frost Char'),
  oasis_koi: fish('oasis_koi', '綠洲錦鯉', 'Oasis Koi'),
  moonlit_eel: fish('moonlit_eel', '月光鰻', 'Moonlit Eel'),
  thunder_ray: fish('thunder_ray', '雷紋魟', 'Thunder Ray'),
  mistfin: fish('mistfin', '霧鰭', 'Mistfin'),
  ember_salmon: fish('ember_salmon', '餘燼鮭', 'Ember Salmon'),
  petal_koi: fish('petal_koi', '花瓣錦鯉', 'Petal Koi'),
  pale_blindfish: fish('pale_blindfish', '蒼白盲魚', 'Pale Blindfish'),
  prism_shrimp: fish('prism_shrimp', '稜光蝦', 'Prism Shrimp'),
  lantern_squid: fish('lantern_squid', '提燈魷', 'Lantern Squid'),
  gloom_angler: fish('gloom_angler', '幽暗鮟鱇', 'Gloom Angler'),
  amber_carp: fish('amber_carp', '琥珀鯉', 'Amber Carp'),
  stingfin: fish('stingfin', '刺鰭蜂魚', 'Stingfin'),
  cinder_snapper: fish('cinder_snapper', '燼鱗鯛', 'Cinder Snapper'),
  obsidian_eel: fish('obsidian_eel', '黑曜鰻', 'Obsidian Eel'),
  old_whiskers: { ...fish('old_whiskers', '老鬚王', 'Old Whiskers'), unique: true },
  soggy_boot: mat('soggy_boot', '泡爛的靴子', 'Soggy Boot'),
  wooden_crate: { ...mat('wooden_crate', '漂流木箱', 'Driftwood Crate'), maxStack: 99, use: 'crate' },
  iron_crate: { ...mat('iron_crate', '鐵皮箱', 'Ironbound Crate'), maxStack: 99, use: 'crate' },
  golden_crate: { ...mat('golden_crate', '金邊寶箱', 'Gilded Crate'), maxStack: 99, use: 'crate' },
  grilled_fish: food('grilled_fish', '烤魚', 'Grilled Fish', 30),
  smoked_eel: food('smoked_eel', '燻鰻', 'Smoked Eel', 45),
  fish_stew: food('fish_stew', '魚湯', "Fisherman's Stew", 80),
  campfire: { ...block('campfire', '營火', 'Campfire', T.CAMPFIRE), maxStack: 99 },
};

/** 套裝組成（頭 / 身 / 腿），順序 = 等級 */
export const ARMOR_SETS: Record<ArmorSetId, readonly [ItemId, ItemId, ItemId]> = {
  wood: ['wood_helmet', 'wood_chestplate', 'wood_greaves'],
  copper: ['copper_helmet', 'copper_chestplate', 'copper_greaves'],
  iron: ['iron_helmet', 'iron_chestplate', 'iron_greaves'],
  gold: ['gold_helmet', 'gold_chestplate', 'gold_greaves'],
  bone: ['bone_helmet', 'bone_chestplate', 'bone_greaves'],
  molten: ['molten_helmet', 'molten_chestplate', 'molten_greaves'],
};

export function isItemId(v: unknown): v is ItemId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, v);
}
export function itemDef(id: ItemId): ItemDef { return ITEMS[id]; }
