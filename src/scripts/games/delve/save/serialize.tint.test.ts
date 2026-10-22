// serialize.tint.test.ts — 時裝顏色（tint）的存檔驗證：只有時裝能帶，壞的 / 放錯物品 = 存檔損毀（比照 gear）。
import { describe, it, expect } from 'vitest';
import { SaveFormatError, validStack, validDrops, validChests, validInventory } from './serialize';
import { Inventory } from '../engine/inventory';
import { Vanity } from '../engine/vanity';

describe('validStack：tint', () => {
  it('時裝帶合法 tint → 保留', () => {
    expect(validStack({ item: 'sailor_top', count: 1, tint: [3, 7] }, 'x')).toEqual({ item: 'sailor_top', count: 1, tint: [3, 7] });
    expect(validStack({ item: 'sailor_top', count: 1 }, 'x')).toEqual({ item: 'sailor_top', count: 1 });
    expect(validStack({ item: 'sailor_top', count: 1, tint: null }, 'x')).toEqual({ item: 'sailor_top', count: 1 });
  });
  it('validStack rejects tint on non-vanity item', () => {
    expect(() => validStack({ item: 'dirt', count: 5, tint: [3, 7] }, 'x')).toThrow(SaveFormatError);
    expect(() => validStack({ item: 'iron_chestplate', count: 1, tint: [3, 7] }, 'x')).toThrow(SaveFormatError);
  });
  it('壞的 tint → 損毀', () => {
    for (const tint of [[3], [3, 99], [-1, 0], 'red', [1.5, 2]]) {
      expect(() => validStack({ item: 'beret', count: 1, tint }, 'x'), JSON.stringify(tint)).toThrow(SaveFormatError);
    }
  });
  it('背包 / 箱子 / 掉落物都走同一套檢查', () => {
    expect(() => validInventory({ slots: [{ item: 'stone', count: 1, tint: [1, 1] }], selected: 0 })).toThrow(SaveFormatError);
    expect(() => validChests([{ i: 0, slots: [{ item: 'stone', count: 1, tint: [1, 1] }] }])).toThrow(SaveFormatError);
    expect(() => validDrops([{ item: 'stone', count: 1, x: 1, y: 1, tint: [1, 1] }])).toThrow(SaveFormatError);
    expect(validDrops([{ item: 'beret', count: 1, x: 1, y: 2, tint: [1, 4] }])).toEqual([{ item: 'beret', count: 1, x: 1, y: 2, tint: [1, 4] }]);
  });
});

describe('寬鬆還原（Inventory / Vanity fromJSON）', () => {
  it('Inventory.fromJSON：時裝保留 tint、非時裝 / 壞的 tint 丟掉', () => {
    const inv = Inventory.fromJSON({ slots: [{ item: 'beret', count: 1, tint: [2, 5] }, { item: 'dirt', count: 3, tint: [1, 1] }, { item: 'beret', count: 1, tint: [99, 0] }], selected: 0 });
    expect(inv.slots[0]).toEqual({ item: 'beret', count: 1, tint: [2, 5] });
    expect(inv.slots[1]).toEqual({ item: 'dirt', count: 3 });
    expect(inv.slots[2]).toEqual({ item: 'beret', count: 1 });
  });
  it('Vanity：tint 往返；舊存檔沒有 tint 欄位 → 原色', () => {
    const v = new Vanity();
    v.set('head', 'witch_hat', undefined, [4, 0]);
    v.set('body', 'iron_chestplate');
    const j = JSON.parse(JSON.stringify(v.toJSON()));
    expect(j.tint).toEqual({ head: [4, 0], body: null, legs: null, back: null, acc: null });
    const back = Vanity.fromJSON(j);
    expect(back.getStack('head')).toEqual({ item: 'witch_hat', count: 1, tint: [4, 0] });
    const old = Vanity.fromJSON({ slots: { head: 'witch_hat', body: null, legs: null, back: null }, gear: {}, hide: {} });
    expect(old.getStack('head')).toEqual({ item: 'witch_hat', count: 1 });
    // 防具當樣子用：tint 不合法 → 丟掉
    const bad = Vanity.fromJSON({ slots: { body: 'iron_chestplate', head: 'beret' }, tint: { body: [1, 1], head: 'x' } });
    expect(bad.getStack('body')).toEqual({ item: 'iron_chestplate', count: 1 });
    expect(bad.getStack('head')).toEqual({ item: 'beret', count: 1 });
  });
});
