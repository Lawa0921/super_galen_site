// loot.ts — 陶罐 / 箱子的確定性戰利品（seed + 座標 → 同一份）。depth 為 0（地表）..1（世界底部）。
import { Rng } from './rng';
import type { ItemId } from './items';
import { ITEMS } from './items';
import type { Stack } from './inventory';

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

/** 箱子內容（CHEST_SLOTS 格，前面幾格有東西） */
export function chestLoot(seed: string, x: number, y: number, kind: ChestKind, depth: number): (Stack | null)[] {
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
  return slots;
}
