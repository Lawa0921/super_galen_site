// icons.test.ts — 每個道具都有手繪圖示（非空、只用統一色票）；新裝飾物件每個 style 都畫得出來
import { describe, it, expect } from 'vitest';
import { ITEMS, type ItemId } from '../engine/items';
import { T } from '../engine/tiles';
import { ICON_ORDER, paintIcon } from './textures';
import { decorBmp, texMaterial } from './decor';
import { DECOR_STYLES } from './autotile';
import { inPalette, snapBmp, Bmp } from './pixel';

const opaque = (b: Bmp): number => { let n = 0; for (const v of b.px) if (v >>> 24) n++; return n; };

describe('道具圖示', () => {
  it('每個道具都在圖示表裡、不重複', () => {
    const ids = Object.keys(ITEMS) as ItemId[];
    for (const id of ids) expect(ICON_ORDER, id).toContain(id);
    expect(new Set(ICON_ORDER).size).toBe(ICON_ORDER.length);
  });
  it('每個圖示都有足夠的不透明像素，吸附後全在色票上', () => {
    for (const id of ICON_ORDER) {
      const b = paintIcon(id);
      expect(opaque(b), id).toBeGreaterThan(20);
      const s = snapBmp(b.clone());
      for (const v of s.px) if (v >>> 24) expect(inPalette(Bmp.unpack(v))).toBe(true);
    }
  });
});

describe('新材質與物件', () => {
  it('深度層與地城磚都有 3 個變體材質（彼此不同）', () => {
    for (const id of [T.DEEP_STONE, T.BASALT, T.ASH, T.OBSIDIAN, T.MAGMA_ROCK, T.DUNGEON_BRICK_BLUE, T.DUNGEON_BRICK_GREEN, T.DUNGEON_BRICK_PINK]) {
      const v = [0, 1, 2].map((k) => texMaterial(id, k));
      for (const b of v) { expect(b, `tile ${id}`).not.toBeNull(); expect(opaque(b!)).toBe(256); }
      expect(v[0]!.px.join()).not.toBe(v[1]!.px.join());
    }
  });
  it('地城物件每個 style 都畫得出來', () => {
    for (const id of [T.PLATFORM, T.DOOR_CLOSED, T.DOOR_OPEN, T.DOOR_LOCKED, T.LOCKED_CHEST, T.CHAIN, T.BANNER, T.CANDLE, T.LANTERN, T.BOOKSHELF, T.BONES, T.LORE_TABLET]) {
      const n = DECOR_STYLES[id];
      expect(n, `styles ${id}`).toBeGreaterThan(0);
      for (let s = 0; s < n; s++) expect(opaque(decorBmp(id, s)), `${id}/${s}`).toBeGreaterThan(8);
    }
  });
});
