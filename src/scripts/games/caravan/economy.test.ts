import { describe, it, expect } from 'vitest';
import {
  buyPrice, sellPrice, tradeSellPrice, cargoCapacity, wagonUpgradeCost, totalWage,
} from './economy';
import type { TownDef } from './economy';
import { applyMarket } from './economy';
import { TOWNS } from './data/towns';
import { ITEMS } from './data/items';
import { newGame } from './save';
import type { CompanionRecord } from './save';

function makeTown(overrides: Partial<TownDef> = {}): TownDef {
  return {
    id: 'test-town',
    name: '測試鎮',
    desc: '測試用城鎮。',
    priceModifiers: {},
    stock: [],
    ...overrides,
  };
}

function makeCompanion(overrides: Partial<CompanionRecord> = {}): CompanionRecord {
  return {
    id: 'c1', name: '傭兵', job: 'swordsman', level: 1, xp: 0,
    stats: { str: 14, dex: 10, int: 8, cha: 10, con: 14 },
    maxHp: 26, injuredForTrips: 0,
    equipment: { weapon: null, armor: null, trinket: null },
    ...overrides,
  };
}

describe('economy（經濟系統）', () => {
  // -----------------------------------------------------------------
  // buyPrice
  // -----------------------------------------------------------------
  describe('buyPrice', () => {
    it('未列於 priceModifiers 的物品，係數視為 1.0（round(value)）', () => {
      const town = makeTown();
      expect(buyPrice(town, 'ore')).toBe(12); // ITEMS.ore.value = 12
    });

    it('依 priceModifiers 係數計價並四捨五入', () => {
      const town = makeTown({ priceModifiers: { ore: 1.5 } });
      expect(buyPrice(town, 'ore')).toBe(18); // round(12*1.5)=18
    });

    it('找不到物品時丟 Error', () => {
      const town = makeTown();
      expect(() => buyPrice(town, 'not-a-real-item')).toThrow();
    });
  });

  // -----------------------------------------------------------------
  // sellPrice（原鎮賣回）
  // -----------------------------------------------------------------
  describe('sellPrice', () => {
    it('= round(buyPrice × 0.5)', () => {
      const town = makeTown();
      expect(buyPrice(town, 'herb')).toBe(5); // ITEMS.herb.value = 5
      expect(sellPrice(town, 'herb')).toBe(3); // round(5*0.5)=round(2.5)=3
    });

    it('boss 遺寶（高價物）賣回約為 value 的一半，商店收購折扣通用', () => {
      const town = makeTown();
      // ITEMS['den-idol'].value = 70 -> buyPrice=70 -> sellPrice=round(35)=35
      expect(sellPrice(town, 'den-idol')).toBe(35);
    });
  });

  // -----------------------------------------------------------------
  // tradeSellPrice（異鎮轉賣）
  // -----------------------------------------------------------------
  describe('tradeSellPrice', () => {
    it('= round(ITEMS.value × 係數 × 0.9)', () => {
      const town = makeTown({ priceModifiers: { ore: 1.5 } });
      expect(tradeSellPrice(town, 'ore')).toBe(16); // round(12*1.5*0.9)=round(16.2)=16
    });

    it('未列於 priceModifiers 時係數視為 1.0', () => {
      const town = makeTown();
      expect(tradeSellPrice(town, 'herb')).toBe(5); // round(5*1*0.9)=round(4.5)=5
    });

    it('找不到物品時丟 Error', () => {
      const town = makeTown();
      expect(() => tradeSellPrice(town, 'not-a-real-item')).toThrow();
    });

    it('equip 類物品（如 den-idol）不吃異鎮 0.9 係數也不吃城鎮 priceModifiers，固定 round(value×0.5)（M5 套利修正）', () => {
      // 即使城鎮給了溢價係數，equip 物品也一律無視，避免異鎮套利
      const town = makeTown({ priceModifiers: { 'den-idol': 2 } });
      expect(tradeSellPrice(town, 'den-idol')).toBe(35); // round(70*0.5)=35
      expect(tradeSellPrice(town, 'den-idol')).toBe(sellPrice(makeTown(), 'den-idol'));
    });
  });

  // -----------------------------------------------------------------
  // cargoCapacity / wagonUpgradeCost
  // -----------------------------------------------------------------
  describe('cargoCapacity', () => {
    it('= 6 + wagonLevel×4', () => {
      expect(cargoCapacity(0)).toBe(6);
      expect(cargoCapacity(1)).toBe(10);
      expect(cargoCapacity(3)).toBe(18);
    });
  });

  describe('wagonUpgradeCost', () => {
    it('= 120 + wagonLevel×180', () => {
      expect(wagonUpgradeCost(0)).toBe(120);
      expect(wagonUpgradeCost(1)).toBe(300);
      expect(wagonUpgradeCost(2)).toBe(480);
    });
  });

  // -----------------------------------------------------------------
  // totalWage
  // -----------------------------------------------------------------
  describe('totalWage', () => {
    it('無傭兵時為 0', () => {
      const save = newGame();
      expect(totalWage(save)).toBe(0);
    });

    it('加總未重傷（injuredForTrips===0）傭兵的 wagePerTrip；重傷者不計入', () => {
      const save = newGame();
      save.companions = [
        makeCompanion({ level: 1, injuredForTrips: 0 }), // wage=8+4=12
        makeCompanion({ level: 2, injuredForTrips: 0 }), // wage=8+8=16
        makeCompanion({ level: 3, injuredForTrips: 1 }), // 重傷不計
      ];
      expect(totalWage(save)).toBe(28);
    });

    it('全隊重傷時為 0', () => {
      const save = newGame();
      save.companions = [makeCompanion({ level: 2, injuredForTrips: 2 })];
      expect(totalWage(save)).toBe(0);
    });
  });
});

describe('市場行情波動（M7）', () => {
  const base = TOWNS['riverbend-town'];

  it('同 seed 決定性；不同 seed 產生不同行情', () => {
    const a1 = applyMarket(base, 7);
    const a2 = applyMarket(base, 7);
    expect(a1.priceModifiers).toEqual(a2.priceModifiers);
    const b = applyMarket(base, 8);
    expect(JSON.stringify(a1.priceModifiers)).not.toBe(JSON.stringify(b.priceModifiers));
  });

  it('行情係數把基準乘上 0.75-1.35 浮動，且不動原物件', () => {
    const m = applyMarket(base, 3);
    expect(m).not.toBe(base);
    for (const [itemId, mod] of Object.entries(m.priceModifiers)) {
      const baseMod = base.priceModifiers[itemId] ?? 1;
      const ratio = mod / baseMod;
      expect(ratio, `${itemId} 行情比例超界`).toBeGreaterThanOrEqual(0.75);
      expect(ratio, `${itemId} 行情比例超界`).toBeLessThanOrEqual(1.35);
    }
    expect(base.priceModifiers.ore).toBe(1.5); // 原 town 不被改
  });

  it('裝備物品不吃行情（套利裁決延伸）；一般 stock 品項有行情', () => {
    const salt = TOWNS['salt-spring-city'];
    const m = applyMarket(salt, 11);
    for (const itemId of Object.keys(m.priceModifiers)) {
      if (ITEMS[itemId]?.equip) {
        expect(m.priceModifiers[itemId], `裝備 ${itemId} 不應浮動`).toBe(salt.priceModifiers[itemId] ?? 1);
      }
    }
    // 非裝備 stock 品項應獲得行情條目（即使基準為 1）
    expect(m.priceModifiers.herb).toBeDefined();
  });

  it('newGame 有 marketSeed；行情 town 可直接餵 buyPrice/sellPrice', () => {
    const save = newGame();
    expect(typeof save.marketSeed).toBe('number');
    const m = applyMarket(base, save.marketSeed);
    expect(buyPrice(m, 'ore')).toBeGreaterThan(0);
    expect(sellPrice(m, 'ore')).toBeGreaterThan(0);
  });
});
