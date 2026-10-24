// cosmeticSources.peaceful.test.ts — 和平模式（不生怪）的世界裡，每件時裝都拿得到（spec §4 反目標、C8）。
// 不用手寫的「開局材料」清單：直接生成幾個真的世界，從裡面的方塊掉落、箱子內容、陶罐、商店與配方
// 一路推出「不打怪拿得到的材料」，再看每件時裝做不做得出來；做不出來的，要靠箱子每個新世界期望至少 0.33 件。
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { generateWorld } from './legacy/worldgen';
import { tileDef } from './tiles';
import { ITEMS, VANITY_ITEMS, type ItemId } from './items';
import { RECIPES } from './crafting';
import { starterInventory } from './inventory';
import { potLoot, CHEST_FASHION, CHEST_FASHION_CHANCE, GENERATED_CHEST_KINDS, type ChestKind } from './loot';
import { NPCS } from './npcs';
import { PEDDLER_POOL, ROLES } from './folkDefs';
import { cosmeticSources } from './cosmeticSources';

// 記下世界生成時每個箱子的種類（worldgen.ts 與 gen/dungeon.ts 都經由 loot.ts 的 chestLoot 放箱子）
const placed = vi.hoisted(() => ({ kinds: [] as string[] }));
vi.mock('./loot', async (importOriginal) => {
  const m = await importOriginal<typeof import('./loot')>();
  return { ...m, chestLoot: (...a: Parameters<typeof m.chestLoot>) => { placed.kinds.push(a[3]); return m.chestLoot(...a); } };
});

const SEEDS = ['peace-1', 'peace-2', 'peace-3', 'peace-4'];
/** 每個新世界平均有幾個這種箱子（量測值） */
const avgChests: Partial<Record<ChestKind, number>> = {};
/** 不打怪拿得到的東西（世界方塊掉落 / 箱子 / 陶罐 / 商店 / 開局背包，之後再加上做得出來的） */
const found = new Set<ItemId>();
/** 世界裡出現過的方塊：[掉落物, 需要的鎬等級] */
const tileDrops = new Map<ItemId, number>();

const shopItems = (): ItemId[] => [
  ...Object.values(NPCS).flatMap((n) => n.shop), ...Object.values(ROLES).flatMap((r) => r.shop), ...PEDDLER_POOL,
].map((e) => e.item);
const vanity = new Set<ItemId>(VANITY_ITEMS);

/** 從 found + 方塊掉落 + 配方推到不動點：拿得到的材料集合（鎬的等級夠才挖得動那種方塊） */
function peacefulMaterials(): Set<ItemId> {
  const have = new Set(found);
  const pickTier = (): number => Math.max(0, ...[...have].map((id) => ITEMS[id].pick?.tier ?? 0));
  for (let changed = true; changed;) {
    changed = false;
    const add = (id: ItemId): void => { if (!have.has(id)) { have.add(id); changed = true; } };
    const tier = pickTier();
    for (const [drop, minTier] of tileDrops) if (minTier <= tier) add(drop);
    for (const r of RECIPES) {
      if (r.station && !have.has(r.station)) continue;
      if (r.inputs.every((a) => have.has(a.item))) add(r.out.item);
    }
  }
  return have;
}

describe('和平模式拿得到每件時裝（spec §4、C8）', { timeout: 300_000 }, () => {
  let have: Set<ItemId>;
  beforeAll(() => {
    const counts: Partial<Record<ChestKind, number>> = {};
    for (const seed of SEEDS) {
      placed.kinds.length = 0;
      const { world } = generateWorld(seed);
      for (const k of placed.kinds) counts[k as ChestKind] = (counts[k as ChestKind] ?? 0) + 1;
      const ids = new Set<number>();
      for (let i = 0; i < world.fg.length; i++) ids.add(world.fg[i]);
      for (const id of ids) {
        const d = tileDef(id);
        if (d.drop) tileDrops.set(d.drop, Math.min(tileDrops.get(d.drop) ?? 99, d.minTier));
      }
      // 箱子內容（不算時裝本身：它們是要檢查的對象，不是材料）
      for (const slots of world.chests.values()) for (const s of slots) if (s && !vanity.has(s.item)) found.add(s.item);
      for (const extra of world.potDrops.values()) for (const d of extra) found.add(d.item);
    }
    for (const k of Object.keys(counts) as ChestKind[]) avgChests[k] = counts[k]! / SEEDS.length;
    for (let i = 0; i < 200; i++) for (const d of potLoot('pots', i, 7, (i % 10) / 10)) found.add(d.item);
    for (const id of shopItems()) if (!vanity.has(id)) found.add(id);
    for (const s of starterInventory().slots) if (s) found.add(s.item);
    have = peacefulMaterials();
    console.log('[delve] 每個新世界平均箱子數', JSON.stringify(avgChests));
  }, 300_000);

  /** 和平模式做得出來（每個材料一路往回推都不靠怪物） */
  const peacefulCraftable = (id: ItemId): boolean => have.has(id);
  const shopSold = (id: ItemId): boolean => shopItems().includes(id);
  /** 每個新的和平世界，箱子期望開出幾件 id：Σ 箱子種類（平均個數 × 開出時裝機率 × 1 / 池子件數） */
  const chestCopies = (id: ItemId): number => GENERATED_CHEST_KINDS.reduce((sum, k) => {
    const pool = CHEST_FASHION[k] ?? [];
    return pool.includes(id) ? sum + (avgChests[k] ?? 0) * (CHEST_FASHION_CHANCE[k] ?? 0) / pool.length : sum;
  }, 0);

  it('量到的箱子種類 = 世界生成會放的種類', () => {
    expect(Object.keys(avgChests).sort()).toEqual([...GENERATED_CHEST_KINDS].sort());
  });

  it('怪物素材（獠牙 / 羽毛 / 餘燼 / 甲殼）不打怪拿不到：推導沒有把它們算進去', () => {
    for (const m of ['fang', 'feather', 'ember', 'chitin', 'bone', 'stinger', 'spore'] as ItemId[]) expect(have.has(m), m).toBe(false);
    // 反過來：開局材料、商人賣的凝膠、熔爐燒出來的玻璃與錠都推得到
    for (const m of ['wood', 'planks', 'stone', 'mushroom', 'gel', 'banner', 'glass', 'copper_bar', 'iron_bar', 'workbench', 'anvil'] as ItemId[]) {
      expect(have.has(m), m).toBe(true);
    }
  });

  it('every cosmetic obtainable without enemies（製作要一路推得到材料；否則箱子或商店）', () => {
    for (const id of VANITY_ITEMS) {
      const s = cosmeticSources(id);
      expect(peacefulCraftable(id) || s.includes('chest') || s.includes('shop'), id).toBe(true);
    }
  });

  it('做不出來、商店也不賣的時裝：每個新的和平世界，箱子期望至少 0.33 件', () => {
    const low: string[] = [];
    for (const id of VANITY_ITEMS) {
      if (peacefulCraftable(id) || shopSold(id)) continue;
      const c = chestCopies(id);
      if (c < 0.33) low.push(`${id} ${c.toFixed(3)}`);
    }
    expect(low).toEqual([]);
  });

  it('不會一個世界就刷齊：每件靠箱子的時裝，期望都低於 1.5 件 / 世界', () => {
    for (const id of VANITY_ITEMS) expect(chestCopies(id), id).toBeLessThan(1.5);
  });
});
