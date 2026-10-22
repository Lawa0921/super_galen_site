// tiles.test.ts
import { describe, it, expect } from 'vitest';
import { T, W, TILES, WALLS, tileDef, isSolidTile, blocksLight } from './tiles';
import { ITEMS, itemDef } from './items';

describe('tiles', () => {
  it('必要 tile 都有定義且 id 與索引一致', () => {
    const keys = ['AIR', 'DIRT', 'GRASS', 'STONE', 'SAND', 'WOOD', 'LEAVES', 'PLANKS', 'COPPER_ORE', 'IRON_ORE', 'TORCH', 'WORKBENCH'] as const;
    for (const k of keys) {
      const id = T[k];
      expect(TILES[id].id).toBe(id);
      expect(TILES[id].name.en.length).toBeGreaterThan(0);
      expect(TILES[id].name.zh.length).toBeGreaterThan(0);
    }
    expect(WALLS[W.DIRT_WALL].id).toBe(W.DIRT_WALL);
    expect(WALLS[W.STONE_WALL].id).toBe(W.STONE_WALL);
  });
  it('實心 / 擋光 / 發光屬性', () => {
    expect(isSolidTile(T.AIR)).toBe(false);
    expect(isSolidTile(T.STONE)).toBe(true);
    expect(isSolidTile(T.WOOD)).toBe(false);
    expect(isSolidTile(T.LEAVES)).toBe(false);
    expect(isSolidTile(T.TORCH)).toBe(false);
    expect(blocksLight(T.DIRT)).toBe(true);
    expect(blocksLight(T.AIR)).toBe(false);
    expect(tileDef(T.TORCH).light).toBeGreaterThan(0.9);
    expect(tileDef(T.STONE).light).toBe(0);
  });
  it('挖掘硬度：石頭比泥土硬、礦更硬；掉落物存在於道具表', () => {
    expect(tileDef(T.STONE).hardness).toBeGreaterThan(tileDef(T.DIRT).hardness);
    expect(tileDef(T.IRON_ORE).hardness).toBeGreaterThan(tileDef(T.STONE).hardness);
    for (const t of TILES) {
      if (t.drop) expect(ITEMS[t.drop]).toBeDefined();
    }
    expect(tileDef(T.GRASS).drop).toBe('dirt');
  });
  it('道具表：可放置物指回 tile、鎬有速度與等級', () => {
    expect(itemDef('dirt').place).toBe(T.DIRT);
    expect(itemDef('torch').place).toBe(T.TORCH);
    expect(itemDef('workbench').place).toBe(T.WORKBENCH);
    expect(itemDef('wood_pickaxe').pick?.speed).toBe(1);
    expect(itemDef('copper_pickaxe').pick?.speed).toBe(2);
    expect(itemDef('iron_pickaxe').pick?.speed).toBe(3);
    expect(itemDef('wood_pickaxe').maxStack).toBe(1);
    expect(itemDef('dirt').maxStack).toBe(999);
  });
});
