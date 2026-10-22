// cosmeticSources.ts — 每件時裝道具從哪裡拿得到（彙整合成表、怪物掉落、箱子池、首領掉落、商店表；測試與文件用）。
import type { ItemId } from './items';
import { RECIPES } from './crafting';
import { ENEMIES } from './enemies';
import { CHEST_FASHION, CHEST_FASHION_CHANCE, GENERATED_CHEST_KINDS } from './loot';
import { BOSS_DROPS, BOSS_FASHION } from './game';
import { NPCS } from './npcs';
import { PEDDLER_POOL, ROLES } from './folkDefs';

export type CosmeticSource = 'craft' | 'enemy' | 'chest' | 'boss' | 'shop';

/** item 的取得方式（順序固定：craft → enemy → chest → boss → shop） */
export function cosmeticSources(item: ItemId): CosmeticSource[] {
  const out: CosmeticSource[] = [];
  const enemies = Object.values(ENEMIES);
  const dropsIt = (e: (typeof enemies)[number]): boolean => e.drops.some((d) => d.item === item && d.chance > 0);
  if (RECIPES.some((r) => r.out.item === item)) out.push('craft');
  if (enemies.some((e) => !e.boss && !e.minion && dropsIt(e))) out.push('enemy');
  // 只算世界生成真的會放的箱子種類
  if (GENERATED_CHEST_KINDS.some((k) => (CHEST_FASHION_CHANCE[k] ?? 0) > 0 && (CHEST_FASHION[k] ?? []).includes(item))) out.push('chest');
  if (enemies.some((e) => e.boss && dropsIt(e)) || BOSS_DROPS.some((d) => d.item === item) || BOSS_FASHION.includes(item)) out.push('boss');
  const shops = [...Object.values(NPCS).flatMap((n) => n.shop), ...Object.values(ROLES).flatMap((r) => r.shop), ...PEDDLER_POOL];
  if (shops.some((e) => e.item === item)) out.push('shop');
  return out;
}
