// cosmeticSources.test.ts — 每件外觀（時裝道具）從哪裡拿得到：spec C8 的來源規則。
import { describe, it, expect } from 'vitest';
import { cosmeticSources, type CosmeticSource } from './cosmeticSources';
import { ACC_ITEMS, OUTFIT_ITEMS, VANITY_ITEMS, type ItemId } from './items';
import { RECIPES } from './crafting';
import { ENEMIES } from './enemies';
import { CHEST_FASHION, CHEST_FASHION_CHANCE, chestLoot, type ChestKind } from './loot';
import { BOSS_FASHION } from './game';

/** 開局附近就拿得到的材料（spec C8：新角色 10 分鐘內做得出來） */
const STARTER = new Set<ItemId>(['wood', 'planks', 'gel', 'dirt', 'stone', 'mushroom', 'feather']);
/** Task 2 新增的 26 件（8 套服裝 × 2 + 9 個頭飾 + 眼鏡） */
const OLD_OUTFITS = ['explorer', 'sailor', 'miko', 'hoodie', 'coat', 'maid'];
const NEW_ITEMS: ItemId[] = [
  ...Object.entries(OUTFIT_ITEMS).filter(([o]) => !OLD_OUTFITS.includes(o)).flatMap(([, p]) => p),
  ...Object.values(ACC_ITEMS),
];
/** Task 3 之前的 21 件與它們當時的來源（新的來源集合必須是超集合） */
const BEFORE: Record<string, CosmeticSource[]> = {
  sailor_top: ['craft'], sailor_skirt: ['craft'], miko_robe: ['craft'], miko_hakama: ['craft'],
  hoodie_top: ['craft'], hoodie_shorts: ['craft'], travel_coat: ['craft', 'shop'], coat_trousers: ['craft'],
  explorer_vest: ['craft', 'chest'], explorer_shorts: ['craft'],
  maid_dress: ['chest'], maid_skirt: ['chest'], maid_headdress: ['chest'],
  straw_hat: ['craft', 'chest'], witch_hat: ['chest', 'shop'], beret: ['craft', 'chest'], flower_crown: ['craft', 'chest', 'shop'],
  travel_cape: ['craft'], feather_wings: ['chest', 'shop'], ribbon_bow: ['chest'],
  miner_helmet: ['shop'],
};
const starterCraftable = (id: ItemId): boolean => RECIPES.some((r) => r.out.item === id
  && (r.station === 'workbench' || r.station === null) && r.inputs.every((a) => STARTER.has(a.item)));

describe('時裝的取得來源（spec C8）', () => {
  it('every cosmetic has a source', () => {
    expect(VANITY_ITEMS.length).toBe(47);
    for (const id of VANITY_ITEMS) expect(cosmeticSources(id).length, id).toBeGreaterThan(0);
  });

  it('every cosmetic obtainable without enemies（和平模式：只算製作 / 箱子 / 商店）', () => {
    for (const id of VANITY_ITEMS) {
      expect(cosmeticSources(id).some((s) => s === 'craft' || s === 'chest' || s === 'shop'), id).toBe(true);
    }
  });

  it('new cosmetics obtainable in an already-generated world（箱子在建世界時就生成，新池子只影響新世界；舊的箱子款本來就在舊箱子裡）', () => {
    for (const id of NEW_ITEMS) {
      expect(cosmeticSources(id).some((s) => s !== 'chest'), id).toBe(true);
    }
  });

  it('at least one cosmetic craftable from starter materials（含至少一件新物品）', () => {
    expect(VANITY_ITEMS.some(starterCraftable)).toBe(true);
    expect(NEW_ITEMS.filter(starterCraftable).length).toBeGreaterThan(0);
  });

  it('existing sources kept（現有 21 件的來源不減少；礦工頭燈盔仍只在商店）', () => {
    expect(Object.keys(BEFORE).length).toBe(21);
    for (const [id, was] of Object.entries(BEFORE)) {
      const now = cosmeticSources(id as ItemId);
      for (const s of was) expect(now, `${id} 失去 ${s}`).toContain(s);
    }
    expect(cosmeticSources('miner_helmet')).toEqual(['shop']);
  });

  it('約三分之一的新物品可以製作', () => {
    const crafted = NEW_ITEMS.filter((id) => cosmeticSources(id).includes('craft')).length;
    expect(NEW_ITEMS.length).toBe(26);
    expect(crafted).toBeGreaterThanOrEqual(7);
    expect(crafted).toBeLessThanOrEqual(11);
  });

  it('怪物掉的時裝都是個位數百分比；主題怪掉主題款', () => {
    for (const e of Object.values(ENEMIES)) {
      for (const d of e.drops) if (VANITY_ITEMS.includes(d.item)) expect(d.chance, `${e.kind} → ${d.item}`).toBeLessThan(0.1);
    }
    const drops = (k: keyof typeof ENEMIES): ItemId[] => ENEMIES[k].drops.map((d) => d.item);
    expect(drops('bone_knight')).toEqual(expect.arrayContaining(['knight_top', 'knight_bottom']));
    expect(drops('cursed_skull')).toEqual(expect.arrayContaining(['gothic_top', 'gothic_bottom']));
    expect(drops('ember_imp')).toEqual(expect.arrayContaining(['qipao_top', 'qipao_bottom']));
  });

  it('高稀有款（小皇冠 / 偶像舞台裝 / 哥德洋裝）：首領 + 寶藏室或珍寶箱', () => {
    for (const id of ['acc_crown', 'idol_top', 'idol_bottom', 'gothic_top', 'gothic_bottom'] as ItemId[]) {
      expect(BOSS_FASHION, id).toContain(id);
      expect(CHEST_FASHION.treasure.includes(id) || CHEST_FASHION.relic.includes(id), id).toBe(true);
      expect(cosmeticSources(id), id).not.toContain('craft');
    }
  });

  it('一套服裝的上身與下身來源相同', () => {
    for (const [o, [top, bottom]] of Object.entries(OUTFIT_ITEMS)) {
      if (OLD_OUTFITS.includes(o)) continue;
      expect(cosmeticSources(bottom), o).toEqual(cosmeticSources(top));
      for (const e of Object.values(ENEMIES)) {
        const ct = e.drops.find((d) => d.item === top)?.chance, cb = e.drops.find((d) => d.item === bottom)?.chance;
        expect(cb, `${e.kind} ${o}`).toBe(ct);
      }
      for (const k of Object.keys(CHEST_FASHION) as ChestKind[]) expect(CHEST_FASHION[k].includes(bottom), `${k} ${o}`).toBe(CHEST_FASHION[k].includes(top));
    }
  });

  it('箱子池子裡的每件都真的開得出來；原本的箱子時裝留在原本的箱子種類', () => {
    const seen = new Set<ItemId>();
    for (const k of Object.keys(CHEST_FASHION) as ChestKind[]) {
      expect(CHEST_FASHION_CHANCE[k], k).toBeGreaterThan(0);
      for (let i = 0; i < 400; i++) for (const s of chestLoot('src', i, 3, k, 0.6)) if (s && VANITY_ITEMS.includes(s.item)) seen.add(s.item);
    }
    for (const k of Object.keys(CHEST_FASHION) as ChestKind[]) for (const id of CHEST_FASHION[k]) expect(seen.has(id), id).toBe(true);
    const deep: ChestKind[] = ['dungeon', 'treasure', 'secret', 'relic'];
    for (const k of deep) for (const id of ['maid_dress', 'maid_skirt', 'maid_headdress', 'witch_hat', 'feather_wings', 'ribbon_bow'] as ItemId[]) expect(CHEST_FASHION[k], k).toContain(id);
    for (const k of ['cabin', 'mineshaft', 'ruin', 'cavern', 'sky'] as ChestKind[]) for (const id of ['straw_hat', 'beret', 'explorer_vest', 'flower_crown'] as ItemId[]) expect(CHEST_FASHION[k], k).toContain(id);
  });
});
