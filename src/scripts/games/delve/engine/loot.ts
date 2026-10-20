// loot.ts — 陶罐 / 箱子的確定性戰利品（seed + 座標 → 同一份）。depth 為 0（地表）..1（世界底部）。
import { Rng } from './rng';
import type { ItemId } from './items';
import { ITEMS } from './items';
import type { Stack } from './inventory';
import { ilvlForDepth, rollDropItem, rollGear, rollRarity, type LootSource } from './gear';

export const CHEST_SLOTS = 20;
export type ChestKind = 'cabin' | 'mineshaft' | 'ruin' | 'cavern' | 'sky' | 'dungeon' | 'treasure'
  /** 密室（裂紋石後面）/ 難到達處的珍寶箱：比一般箱子好 */
  | 'secret' | 'relic';
export interface Drop { item: ItemId; n: number; }

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 打破陶罐的掉落（1–3 樣） */
export function potLoot(seed: string, x: number, y: number, depth: number): Drop[] {
  const r = new Rng(`${seed}:pot:${x}:${y}`);
  const d = clamp01(depth);
  const out: Drop[] = [];
  const add = (item: ItemId, n: number): void => {
    const e = out.find((o) => o.item === item);
    if (e) e.n += n; else out.push({ item, n });
  };
  add('copper_coin', r.int(3, 12) + Math.floor(d * 30));
  if (r.chance(2)) add('torch', r.int(2, 7));
  if (r.next() < 0.1 + d * 0.3) add('silver_coin', r.int(1, 3));
  if (r.chance(4)) {
    const ore: ItemId = d > 0.6 && r.chance(2) ? 'silver_ore' : d > 0.3 ? 'iron_ore' : 'copper_ore';
    add(ore, r.int(2, 6));
  }
  if (d > 0.45 && r.chance(6)) add('crystal', 1);
  return out;
}

/**
 * 箱子裡的裝備（獨立亂數流 seed:chestgear:x:y，不影響原本的戰利品）：
 * 一般箱子 45% 一件、地城箱 60% 一件、密室 / 珍寶箱一件、寶藏室兩件；地城系來源的稀有度表比較好。
 */
export function chestGear(seed: string, x: number, y: number, kind: ChestKind, depth: number): Stack[] {
  const r = new Rng(`${seed}:chestgear:${x}:${y}`);
  const d = clamp01(depth);
  const deep = kind === 'dungeon' || kind === 'treasure' || kind === 'secret' || kind === 'relic';
  const src: LootSource = deep ? 'dungeon' : 'chest';
  const n = kind === 'treasure' ? 2 : kind === 'secret' || kind === 'relic' ? 1 : r.next() < (kind === 'dungeon' ? 0.6 : 0.45) ? 1 : 0;
  const ilvl = kind === 'dungeon' || kind === 'treasure' ? Math.max(4, ilvlForDepth(d)) : Math.min(5, ilvlForDepth(d) + (kind === 'sky' || deep ? 1 : 0));
  const out: Stack[] = [];
  for (let k = 0; k < n; k++) {
    const item = rollDropItem(r, ilvl);
    out.push({ item, count: 1, gear: rollGear(item, r, { rarity: rollRarity(r, src, d, 0), ilvl }) });
  }
  return out;
}

/** 箱子內容（CHEST_SLOTS 格，前面幾格有東西；最後接上 chestGear 的裝備） */
export function chestLoot(seed: string, x: number, y: number, kind: ChestKind, depth: number): (Stack | null)[] {
  const slots = baseChestLoot(seed, x, y, kind, depth);
  for (const g of [...chestGear(seed, x, y, kind, depth), ...chestFashion(seed, x, y, kind)]) {
    const i = slots.indexOf(null);
    if (i < 0) break;
    slots[i] = g;
  }
  return slots;
}

/** 只在箱子裡找得到的時裝（收集目標） */
export const LOOT_ONLY_FASHION: readonly ItemId[] = ['maid_dress', 'maid_skirt', 'maid_headdress', 'witch_hat', 'feather_wings', 'ribbon_bow'];
/** 一般箱子的時裝：工作台做得出來的那幾件 */
const COMMON_FASHION: readonly ItemId[] = ['straw_hat', 'beret', 'explorer_vest', 'flower_crown'];
/** 各種箱子開得出的時裝（每件來源見 docs/superpowers/plans/2026-10-20-delve-cosmetic-collection.md 的 Source table） */
export const CHEST_FASHION: Readonly<Record<ChestKind, readonly ItemId[]>> = {
  cabin: [...COMMON_FASHION, 'acc_catears'],
  mineshaft: [...COMMON_FASHION, 'acc_headphones'],
  ruin: [...COMMON_FASHION, 'pirate_top', 'pirate_bottom', 'acc_foxmask', 'acc_hairpin'],
  cavern: [...COMMON_FASHION, 'mage_top', 'mage_bottom', 'pirate_top', 'pirate_bottom'],
  sky: [...COMMON_FASHION, 'priest_top', 'priest_bottom', 'acc_clip'],
  dungeon: [...LOOT_ONLY_FASHION, 'gothic_top', 'gothic_bottom'],
  treasure: [...LOOT_ONLY_FASHION, 'idol_top', 'idol_bottom', 'gothic_top', 'gothic_bottom', 'acc_crown'],
  secret: [...LOOT_ONLY_FASHION, 'qipao_top', 'qipao_bottom', 'acc_hairpin'],
  relic: [...LOOT_ONLY_FASHION, 'idol_top', 'idol_bottom', 'qipao_top', 'qipao_bottom', 'gothic_top', 'gothic_bottom', 'acc_crown'],
};
/** 箱子開出一件時裝的機率 */
export const CHEST_FASHION_CHANCE: Readonly<Record<ChestKind, number>> = {
  cabin: 0.1, mineshaft: 0.1, ruin: 0.1, cavern: 0.1, sky: 0.1, dungeon: 0.3, treasure: 0.8, secret: 0.3, relic: 0.3,
};
/**
 * 箱子裡的時裝（獨立亂數流 seed:chestfashion:x:y，不影響原本的戰利品）：依箱子種類從 CHEST_FASHION 抽一件。
 * 地城 / 寶藏室 / 密室 / 珍寶箱機率高、開得出只能撿到的款式；一般箱子很少。
 */
export function chestFashion(seed: string, x: number, y: number, kind: ChestKind): Stack[] {
  const r = new Rng(`${seed}:chestfashion:${x}:${y}`);
  if (r.next() >= CHEST_FASHION_CHANCE[kind]) return [];
  const pool = CHEST_FASHION[kind];
  return [{ item: pool[Math.floor(r.next() * pool.length) % pool.length], count: 1 }];
}

function baseChestLoot(seed: string, x: number, y: number, kind: ChestKind, depth: number): (Stack | null)[] {
  const r = new Rng(`${seed}:chest:${x}:${y}`);
  const d = clamp01(depth);
  const slots: (Stack | null)[] = new Array<Stack | null>(CHEST_SLOTS).fill(null);
  let k = 0;
  const put = (item: ItemId, count: number): void => {
    if (k >= CHEST_SLOTS || count <= 0) return;
    slots[k++] = { item, count: Math.min(count, ITEMS[item].maxStack) };
  };
  if (kind === 'dungeon' || kind === 'treasure') return dungeonLoot(r, kind, slots);
  if (kind === 'secret' || kind === 'relic') {
    put(d > 0.5 || r.chance(2) ? 'gold_ore' : 'silver_ore', r.int(8, 18));
    put('silver_coin', r.int(6, 16) + Math.floor(d * 20));
    put('crystal', r.int(2, 6));
    put('rope', r.int(12, 30));
    put('torch', r.int(10, 25));
    if (kind === 'relic') put('obsidian', r.int(4, 10));
    return slots;
  }
  // 主獎：越深越好的礦
  const main: ItemId = kind === 'sky' ? (r.chance(2) ? 'gold_ore' : 'silver_ore') : d > 0.7 && r.chance(2) ? 'gold_ore' : d > 0.45 ? 'silver_ore' : d > 0.2 ? 'iron_ore' : 'copper_ore';
  put(main, r.int(6, 14));
  if (kind === 'ruin' || r.chance(3)) put(r.chance(2) ? 'iron_ore' : 'copper_ore', r.int(4, 10));
  put('torch', r.int(6, 20));
  put('copper_coin', r.int(20, 60) + Math.floor(d * 80));
  if (r.next() < 0.35 + d * 0.5) put('silver_coin', r.int(1, 4) + Math.floor(d * 6));
  if (kind === 'mineshaft') put('planks', r.int(10, 30));
  if (kind === 'cabin') put(r.chance(2) ? 'mushroom' : 'glow_mushroom', r.int(1, 4));
  if (kind === 'cavern' || kind === 'sky' || d > 0.5) put('crystal', r.int(1, 4));
  if (kind === 'sky') put('silver_coin', r.int(3, 9));
  if (r.chance(5)) put('chest', 1);
  return slots;
}

/** 地城箱子：硬幣、火把、銀 / 金礦、水晶、偶爾平台或木門；寶藏室：大量金礦與銀幣 */
function dungeonLoot(r: Rng, kind: 'dungeon' | 'treasure', slots: (Stack | null)[]): (Stack | null)[] {
  let k = 0;
  const put = (item: ItemId, count: number): void => {
    if (k >= CHEST_SLOTS || count <= 0) return;
    slots[k++] = { item, count: Math.min(count, ITEMS[item].maxStack) };
  };
  if (kind === 'treasure') {
    put('gold_ore', r.int(20, 36));
    put('silver_coin', r.int(25, 60));
    put('crystal', r.int(6, 12));
    put('obsidian', r.int(8, 16));
    put('torch', r.int(20, 40));
    return slots;
  }
  put(r.chance(2) ? 'gold_ore' : 'silver_ore', r.int(6, 14));
  put('copper_coin', r.int(40, 90));
  put('silver_coin', r.int(2, 9));
  put('torch', r.int(8, 20));
  if (r.chance(2)) put('crystal', r.int(1, 4));
  if (r.chance(3)) put(r.chance(2) ? 'platform' : 'wooden_door', r.int(2, 8));
  // 家具戰利品：古畫、燈柱
  if (r.chance(4)) put('painting', 1);
  if (r.chance(8)) put('lantern_post', 1);
  return slots;
}
