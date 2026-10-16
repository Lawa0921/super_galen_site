// content.test.ts — 新材料 / 裝飾物件 / 道具 / 配方 / 戰利品表
import { describe, it, expect } from 'vitest';
import { T, W, TILES, WALLS, tileDef, isSolidTile } from './tiles';
import { ITEMS, itemDef, isItemId, type ItemId } from './items';
import { RECIPES, findRecipe } from './crafting';
import { potLoot, chestLoot, CHEST_SLOTS } from './loot';

const MATERIALS = ['SILVER_ORE', 'GOLD_ORE', 'CLAY', 'GRAVEL', 'GRANITE', 'MARBLE', 'SANDSTONE', 'SNOW', 'ICE', 'MUD', 'JUNGLE_GRASS', 'STONE_BRICK', 'MUSHROOM_GRASS'] as const;
const DECOR = ['FLOWER', 'TALL_GRASS', 'MUSHROOM', 'SMALL_ROCK', 'BUSH', 'PUMPKIN', 'CACTUS', 'DEAD_BUSH', 'SNOW_SHRUB', 'FERN',
  'VINE', 'GLOW_MUSHROOM', 'CRYSTAL', 'STALACTITE', 'STALAGMITE', 'COBWEB', 'POT', 'CHEST', 'BEAM'] as const;

describe('新 tile', () => {
  it('材料 tile 皆為實心、可挖、掉落已知道具', () => {
    for (const k of MATERIALS) {
      const d = tileDef(T[k]);
      expect(d.id).toBe(T[k]);
      expect(isSolidTile(T[k])).toBe(true);
      expect(d.hardness).toBeGreaterThan(0);
      expect(d.drop && isItemId(d.drop)).toBe(true);
      expect(d.name.zh.length).toBeGreaterThan(0);
    }
    expect(tileDef(T.JUNGLE_GRASS).drop).toBe('mud');
    expect(tileDef(T.MUSHROOM_GRASS).drop).toBe('mud');
  });
  it('id 與陣列索引一致、全部 < 256', () => {
    TILES.forEach((t, i) => expect(t.id).toBe(i));
    WALLS.forEach((w, i) => expect(w.id).toBe(i));
    expect(TILES.length).toBeLessThan(256);
  });
  it('裝飾物件：非實心、不擋光、很快就挖掉', () => {
    for (const k of DECOR) {
      const d = tileDef(T[k]);
      expect(isSolidTile(T[k])).toBe(false);
      expect(d.blocksLight).toBe(false);
      expect(d.hardness).toBeGreaterThan(0);
      if (k !== 'CHEST' && k !== 'BEAM') expect(d.hardness).toBeLessThanOrEqual(0.4);
    }
  });
  it('支撐種類：地面植物 floor、垂吊物 ceiling', () => {
    expect(tileDef(T.FLOWER).support).toBe('floor');
    expect(tileDef(T.POT).support).toBe('floor');
    expect(tileDef(T.CHEST).support).toBe('floor');
    expect(tileDef(T.CACTUS).support).toBe('floor');
    expect(tileDef(T.VINE).support).toBe('ceiling');
    expect(tileDef(T.STALACTITE).support).toBe('ceiling');
    expect(tileDef(T.TORCH).support).toBe('any');
    expect(tileDef(T.STONE).support).toBe('none');
    expect(tileDef(T.TORCH).needsSupport).toBe(true);
    expect(tileDef(T.STONE).needsSupport).toBe(false);
  });
  it('發光：螢光菇微光、水晶較亮、都比火把暗', () => {
    const gm = tileDef(T.GLOW_MUSHROOM).light, cr = tileDef(T.CRYSTAL).light;
    expect(gm).toBeGreaterThan(0.2);
    expect(cr).toBeGreaterThan(gm);
    expect(cr).toBeLessThan(tileDef(T.TORCH).light);
  });
  it('可替換的植物（放方塊時直接蓋掉）', () => {
    expect(tileDef(T.TALL_GRASS).replaceable).toBe(true);
    expect(tileDef(T.FLOWER).replaceable).toBe(true);
    expect(tileDef(T.CHEST).replaceable).toBe(false);
    expect(tileDef(T.STONE).replaceable).toBe(false);
  });
  it('挖掘等級：銀需鐵鎬、金需銀鎬', () => {
    expect(tileDef(T.SILVER_ORE).minTier).toBe(3);
    expect(tileDef(T.GOLD_ORE).minTier).toBe(4);
    expect(tileDef(T.GOLD_ORE).hardness).toBeGreaterThan(tileDef(T.SILVER_ORE).hardness);
  });
  it('生態區背景牆', () => {
    for (const k of ['PLANK_WALL', 'SANDSTONE_WALL', 'SNOW_WALL', 'ICE_WALL', 'MUD_WALL'] as const) {
      expect(WALLS[W[k]].id).toBe(W[k]);
    }
  });
});

describe('新道具', () => {
  it('方塊道具放回對應 tile', () => {
    const pairs: [ItemId, number][] = [
      ['silver_ore', T.SILVER_ORE], ['gold_ore', T.GOLD_ORE], ['clay', T.CLAY], ['gravel', T.GRAVEL],
      ['granite', T.GRANITE], ['marble', T.MARBLE], ['sandstone', T.SANDSTONE], ['snow', T.SNOW],
      ['ice', T.ICE], ['mud', T.MUD], ['stone_brick', T.STONE_BRICK], ['chest', T.CHEST],
      ['pumpkin', T.PUMPKIN], ['glow_mushroom', T.GLOW_MUSHROOM],
    ];
    for (const [item, tile] of pairs) expect(itemDef(item).place).toBe(tile);
  });
  it('鎬：銀 > 鐵、金 > 銀（速度與等級）', () => {
    const fe = itemDef('iron_pickaxe').pick!, ag = itemDef('silver_pickaxe').pick!, au = itemDef('gold_pickaxe').pick!;
    expect(ag.speed).toBeGreaterThan(fe.speed);
    expect(au.speed).toBeGreaterThan(ag.speed);
    expect(ag.tier).toBe(4);
    expect(au.tier).toBe(5);
  });
  it('硬幣與素材', () => {
    for (const id of ['copper_coin', 'silver_coin', 'mushroom', 'crystal', 'cactus'] as const) {
      expect(isItemId(id)).toBe(true);
      expect(ITEMS[id].place).toBeUndefined();
    }
  });
});

describe('新配方', () => {
  it('銀鎬 / 金鎬 / 箱子 / 石磚 需要工作台', () => {
    for (const id of ['silver_pickaxe', 'gold_pickaxe', 'chest', 'stone_brick']) {
      const r = findRecipe(id);
      expect(r, id).toBeDefined();
      expect(r!.station).toBe('workbench');
    }
    expect(findRecipe('silver_pickaxe')!.inputs.some((a) => a.item === 'silver_ore')).toBe(true);
    expect(findRecipe('gold_pickaxe')!.inputs.some((a) => a.item === 'gold_ore')).toBe(true);
  });
  it('所有配方的輸入輸出都是已知道具、id 唯一', () => {
    const ids = new Set<string>();
    for (const r of RECIPES) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(isItemId(r.out.item)).toBe(true);
      for (const a of r.inputs) expect(isItemId(a.item)).toBe(true);
    }
  });
});

describe('戰利品', () => {
  it('陶罐：同 seed + 座標 → 同掉落；至少一樣東西', () => {
    const a = potLoot('s', 100, 300, 0.4), b = potLoot('s', 100, 300, 0.4);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    for (const s of a) { expect(isItemId(s.item)).toBe(true); expect(s.n).toBeGreaterThan(0); }
    // 不同座標通常不同
    const many = new Set<string>();
    for (let x = 0; x < 40; x++) many.add(JSON.stringify(potLoot('s', x, 300, 0.4)));
    expect(many.size).toBeGreaterThan(5);
  });
  it('陶罐會掉硬幣或火把', () => {
    let coins = 0, torches = 0;
    for (let x = 0; x < 200; x++) for (const s of potLoot('k', x, 50, 0.5)) {
      if (s.item === 'copper_coin' || s.item === 'silver_coin') coins++;
      if (s.item === 'torch') torches++;
    }
    expect(coins).toBeGreaterThan(50);
    expect(torches).toBeGreaterThan(20);
  });
  it('箱子：固定格數、確定性、越深越有價值', () => {
    const a = chestLoot('w', 10, 20, 'cabin', 0.2);
    expect(a.length).toBe(CHEST_SLOTS);
    expect(chestLoot('w', 10, 20, 'cabin', 0.2)).toEqual(a);
    expect(a.some((s) => s !== null)).toBe(true);
    const value = (depth: number): number => {
      let v = 0;
      for (let x = 0; x < 60; x++) for (const s of chestLoot('w', x, 7, 'cabin', depth)) {
        if (s && (s.item === 'gold_ore' || s.item === 'silver_ore' || s.item === 'silver_coin' || s.item === 'crystal')) v += s.count;
      }
      return v;
    };
    expect(value(0.9)).toBeGreaterThan(value(0.05));
  });
});
