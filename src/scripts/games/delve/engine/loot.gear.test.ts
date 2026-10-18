// loot.gear.test.ts — 箱子裡的裝備（獨立亂數流、確定性）、背包 / 裝備欄搬移時詞條跟著走。
import { describe, it, expect } from 'vitest';
import { chestGear, chestLoot } from './loot';
import { Inventory } from './inventory';
import { Equipment } from './equipment';
import type { Gear } from './gear';

describe('箱子裝備', () => {
  it('同 seed / 座標 → 同一份；寶藏室兩件、珍寶箱一件；地城系至少等級 4', () => {
    expect(chestGear('s', 10, 20, 'cabin', 0.2)).toEqual(chestGear('s', 10, 20, 'cabin', 0.2));
    expect(chestGear('s', 10, 20, 'treasure', 0.5)).toHaveLength(2);
    expect(chestGear('s', 10, 20, 'relic', 0.5)).toHaveLength(1);
    for (const st of chestGear('s', 3, 4, 'treasure', 0.1)) expect(st.gear!.ilvl).toBeGreaterThanOrEqual(4);
  });
  it('約 45% 的一般箱子有裝備，而且接在原本的戰利品後面（不影響原本內容）', () => {
    let n = 0;
    for (let x = 0; x < 400; x++) n += chestGear('t', x, 7, 'cabin', 0.3).length;
    expect(n / 400).toBeGreaterThan(0.35);
    expect(n / 400).toBeLessThan(0.55);
    const slots = chestLoot('t', 1, 7, 'cabin', 0.3);
    const firstGear = slots.findIndex((s) => s?.gear);
    if (firstGear >= 0) expect(slots.slice(0, firstGear).every((s) => s !== null && !s.gear)).toBe(true);
  });
});

describe('詞條跟著搬', () => {
  const G: Gear = { rarity: 2, ilvl: 2, plus: 1, affixes: [{ id: 'keen', tier: 2, value: 7 }] };
  it('背包：帶 gear 的一件放進空格；toJSON / fromJSON 保留；不合法的 gear 丟掉', () => {
    const inv = new Inventory();
    expect(inv.add('iron_sword', 1, G)).toBe(0);
    const i = inv.slots.findIndex((s) => s?.item === 'iron_sword');
    expect(inv.slots[i]!.gear).toEqual(G);
    const back = Inventory.fromJSON(inv.toJSON());
    expect(back.slots[i]!.gear).toEqual(G);
    const j = inv.toJSON();
    (j.slots[i]!.gear as Gear).rarity = 99;
    expect(Inventory.fromJSON(j).slots[i]!.gear).toBeUndefined();
  });
  it('最好的鎬看實際速度（強化 / 勤掘）', () => {
    const inv = new Inventory();
    inv.add('gold_pickaxe', 1);
    inv.add('silver_pickaxe', 1, { rarity: 3, ilvl: 3, plus: 5, affixes: [{ id: 'delving', tier: 5, value: 45 }] });
    expect(inv.slots[inv.bestPickSlot()]!.item).toBe('silver_pickaxe');
  });
  it('裝備欄：裝上 / 交換 / 卸下時詞條跟著走；gearJSON / fromJSON 往返', () => {
    const inv = new Inventory(), eq = new Equipment();
    inv.add('iron_helmet', 1, G);
    inv.add('gold_helmet', 1);
    const a = inv.slots.findIndex((s) => s?.item === 'iron_helmet');
    expect(eq.equipFrom(inv, a, 'head')).toBe(true);
    expect(eq.gearAt('head')).toEqual(G);
    const b = inv.slots.findIndex((s) => s?.item === 'gold_helmet');
    expect(eq.equipFrom(inv, b, 'head')).toBe(true);
    expect(inv.slots[b]!.item).toBe('iron_helmet');
    expect(inv.slots[b]!.gear).toEqual(G);
    const e2 = Equipment.fromJSON(eq.toJSON(), eq.gearJSON());
    expect(e2.get('head')).toBe('gold_helmet');
    expect(e2.gearAt('head')).toBeUndefined();
    eq.unequipTo(inv, 'head');
    expect(eq.get('head')).toBeNull();
  });
});
