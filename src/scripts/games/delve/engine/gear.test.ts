// gear.test.ts — 裝備詞條系統：稀有度權重、確定性擲骰、詞條池過濾、數值彙總、分解產出、洗煉 / 強化 / 升階成本。
import { describe, it, expect } from 'vitest';
import { Rng } from './rng';
import {
  AFFIXES, AFFIX_IDS, RARITIES, MAX_PLUS, MAX_ASCEND, STAT_CAPS,
  affixDef, gearSlot, rollGear, rollRarity, rarityWeights, gearName, tierRange, ilvlForDepth,
  emptyTotals, addGearTotals, capTotals, salvageYield, upgradeCost, ascendCost, rerollCost,
  rerollAffix, upgradeGear, ascendGear, weaponDamage, armorDefense, pickSpeed, dropPool, rollDropItem,
  validGear, type Gear, type LootSource,
} from './gear';
import { ITEMS, type ItemId } from './items';

const roll = (item: ItemId, rarity: number, seed = 's', ilvl = 5): Gear => rollGear(item, new Rng(seed), { rarity, ilvl });

describe('稀有度', () => {
  it('六階：普通 / 優良 / 稀有 / 史詩 / 傳說 / 神話，顏色都在色票上的 hex', () => {
    expect(RARITIES.map((r) => r.zh)).toEqual(['普通', '優良', '稀有', '史詩', '傳說', '神話']);
    for (const r of RARITIES) expect(r.color).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('每種來源的權重加總為 1；首領不掉普通；合成九成以上是普通 / 優良', () => {
    const srcs: LootSource[] = ['craft', 'enemy', 'chest', 'dungeon', 'fish', 'boss'];
    for (const s of srcs) {
      const w = rarityWeights(s, 0.5, 0);
      expect(w).toHaveLength(6);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
    expect(rarityWeights('boss', 0, 0)[0]).toBe(0);
    const c = rarityWeights('craft', 0, 0);
    expect(c[0] + c[1]).toBeGreaterThan(0.9);
    expect(c[4] + c[5]).toBe(0);
  });
  it('越深、運氣越高 → 期望稀有度越高', () => {
    const ev = (w: number[]): number => w.reduce((a, p, k) => a + p * k, 0);
    expect(ev(rarityWeights('enemy', 1, 0))).toBeGreaterThan(ev(rarityWeights('enemy', 0, 0)));
    expect(ev(rarityWeights('enemy', 0, 50))).toBeGreaterThan(ev(rarityWeights('enemy', 0, 0)));
  });
  it('rollRarity 依權重抽（同 seed 同結果；大量抽樣接近權重）', () => {
    const a = rollRarity(new Rng('x'), 'chest', 0.3, 0), b = rollRarity(new Rng('x'), 'chest', 0.3, 0);
    expect(a).toBe(b);
    const r = new Rng('many'), n = 20000, hist = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) hist[rollRarity(r, 'enemy', 0, 0)]++;
    const w = rarityWeights('enemy', 0, 0);
    for (let k = 0; k < 6; k++) expect(Math.abs(hist[k] / n - w[k])).toBeLessThan(0.015);
  });
  it('深度 → 物品等級 1..5', () => {
    expect(ilvlForDepth(0)).toBe(1);
    expect(ilvlForDepth(0.5)).toBe(3);
    expect(ilvlForDepth(1)).toBe(5);
  });
});

describe('裝備槽分類', () => {
  it('武器 / 防具 / 飾品 / 工具；可堆疊的（飛刀）與材料不是裝備', () => {
    expect(gearSlot('iron_sword')).toBe('weapon');
    expect(gearSlot('iron_helmet')).toBe('armor');
    expect(gearSlot('fang_charm')).toBe('accessory');
    expect(gearSlot('iron_pickaxe')).toBe('tool');
    expect(gearSlot('throwing_knife')).toBeNull();
    expect(gearSlot('dirt')).toBeNull();
    expect(gearSlot('gear_shard')).toBeNull();
  });
});

describe('擲詞條', () => {
  it('同 seed → 完全相同；不同 seed → 通常不同', () => {
    expect(roll('iron_sword', 3, 'a')).toEqual(roll('iron_sword', 3, 'a'));
    const diff = ['b', 'c', 'd', 'e'].some((s) => JSON.stringify(roll('iron_sword', 3, s)) !== JSON.stringify(roll('iron_sword', 3, 'a')));
    expect(diff).toBe(true);
  });
  it('詞條數：普通 0、優良 1、稀有 2、史詩 3、傳說 3 + 傳奇詞條、神話 4 + 傳奇詞條', () => {
    for (let s = 0; s < 40; s++) {
      const seed = `n${s}`;
      expect(roll('iron_sword', 0, seed).affixes).toHaveLength(0);
      expect(roll('iron_sword', 1, seed).affixes).toHaveLength(1);
      expect(roll('iron_sword', 2, seed).affixes).toHaveLength(2);
      expect(roll('iron_sword', 3, seed).affixes).toHaveLength(3);
      const L = roll('iron_sword', 4, seed);
      expect(L.affixes).toHaveLength(4);
      expect(L.affixes.filter((a) => affixDef(a.id).kind === 'unique')).toHaveLength(1);
      const M = roll('iron_sword', 5, seed);
      expect(M.affixes).toHaveLength(5);
    }
  });
  it('詞條不重複、前綴 / 後綴各最多 2、元素（燃燒 / 冰霜 / 劇毒）最多一種', () => {
    for (let s = 0; s < 200; s++) {
      for (const item of ['iron_sword', 'gold_chestplate', 'fang_charm', 'gold_pickaxe'] as ItemId[]) {
        const g = roll(item, 5, `u${s}`);
        const ids = g.affixes.map((a) => a.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.filter((id) => affixDef(id).kind === 'prefix').length).toBeLessThanOrEqual(2);
        expect(ids.filter((id) => affixDef(id).kind === 'suffix').length).toBeLessThanOrEqual(2);
        expect(ids.filter((id) => affixDef(id).group === 'element').length).toBeLessThanOrEqual(1);
      }
    }
  });
  it('詞條池依裝備槽過濾：武器不會出防禦、防具不會出燃燒、工具會出挖掘速度', () => {
    const seen: Record<string, Set<string>> = { weapon: new Set(), armor: new Set(), tool: new Set(), accessory: new Set() };
    const items: Record<string, ItemId> = { weapon: 'iron_sword', armor: 'iron_chestplate', tool: 'iron_pickaxe', accessory: 'chitin_buckler' };
    for (let s = 0; s < 300; s++) for (const k of Object.keys(items)) for (const a of roll(items[k], 4, `p${s}`).affixes) seen[k].add(a.id);
    for (const k of Object.keys(seen)) for (const id of seen[k]) expect(affixDef(id as never).slots, `${k}:${id}`).toContain(k);
    expect(seen.weapon.has('stout')).toBe(false);
    expect(seen.armor.has('blazing')).toBe(false);
    expect(seen.tool.has('delving')).toBe(true);
  });
  it('數值在該階範圍內；早期（物品等級 1）最高只到 T2', () => {
    for (let s = 0; s < 200; s++) {
      const g = roll('wood_sword', 3, `t${s}`, 1);
      for (const a of g.affixes) {
        const d = affixDef(a.id);
        if (d.kind === 'unique') continue;
        expect(a.tier).toBeLessThanOrEqual(2);
        const [lo, hi] = d.tiers[a.tier - 1];
        expect(a.value).toBeGreaterThanOrEqual(lo);
        expect(a.value).toBeLessThanOrEqual(hi);
      }
    }
  });
  it('階數範圍隨稀有度上升', () => {
    expect(tierRange(1, 5)).toEqual([1, 2]);
    expect(tierRange(3, 5)).toEqual([2, 4]);
    expect(tierRange(5, 5)).toEqual([4, 5]);
    expect(tierRange(5, 1)[1]).toBe(2);
  });
  it('每個詞條有 5 階、中文名稱，前綴以「的」結尾', () => {
    expect(AFFIX_IDS.length).toBeGreaterThanOrEqual(20);
    for (const d of AFFIXES) {
      if (d.kind !== 'unique') expect(d.tiers).toHaveLength(5);
      if (d.kind === 'prefix' || d.kind === 'unique') expect(d.word.endsWith('的')).toBe(true);
      expect(d.word).toMatch(/[一-鿿]/);
    }
  });
  it('雙段跳只出在腿部防具 / 飾品；連鎖閃電只出在武器', () => {
    expect(affixDef('skyleap').slots).not.toContain('weapon');
    expect(affixDef('stormcall').slots).toEqual(['weapon']);
    for (let s = 0; s < 80; s++) {
      expect(roll('iron_helmet', 4, `h${s}`).affixes.some((a) => a.id === 'skyleap')).toBe(false);
    }
  });
});

describe('名稱', () => {
  it('「前綴的 基底 · 後綴 +強化」', () => {
    const g: Gear = { rarity: 2, ilvl: 2, plus: 0, affixes: [{ id: 'blazing', tier: 2, value: 10 }, { id: 'swift', tier: 1, value: 3 }] };
    expect(gearName('iron_sword', g)).toBe('熾焰的 鐵劍 · 迅捷');
    expect(gearName('iron_sword', { ...g, plus: 3 })).toBe('熾焰的 鐵劍 · 迅捷 +3');
    expect(gearName('iron_sword', undefined)).toBe('鐵劍');
  });
  it('有傳奇詞條時以傳奇詞條命名', () => {
    const g: Gear = { rarity: 4, ilvl: 5, plus: 0, affixes: [{ id: 'keen', tier: 4, value: 18 }, { id: 'stormcall', tier: 5, value: 25 }] };
    expect(gearName('gold_sword', g)).toBe('奔雷的 金劍');
  });
});

describe('數值彙總', () => {
  it('同一屬性相加；強化放大飾品詞條；上限封頂', () => {
    const t = emptyTotals();
    addGearTotals(t, 'fang_charm', { rarity: 2, ilvl: 3, plus: 0, affixes: [{ id: 'savage', tier: 3, value: 6 }] });
    addGearTotals(t, 'chitin_buckler', { rarity: 2, ilvl: 3, plus: 5, affixes: [{ id: 'savage', tier: 3, value: 10 }] });
    expect(t.crit).toBeCloseTo(6 + 10 * 1.4, 6);
    t.def = 999; t.atkspd = 999;
    const c = capTotals(t);
    expect(c.def).toBe(STAT_CAPS.def);
    expect(c.atkspd).toBe(STAT_CAPS.atkspd);
  });
  it('傳奇詞條記成旗標', () => {
    const t = emptyTotals();
    addGearTotals(t, 'iron_greaves', { rarity: 4, ilvl: 3, plus: 0, affixes: [{ id: 'skyleap', tier: 5, value: 1 }] });
    expect(t.djump).toBe(1);
  });
  it('強化：武器傷害每級 +6%、防具防禦 +1/+1/+2/+2/+3、鎬速 +5%', () => {
    const base = ITEMS.iron_sword.weapon!.damage;
    expect(weaponDamage('iron_sword', undefined)).toBe(base);
    expect(weaponDamage('iron_sword', { rarity: 0, ilvl: 1, plus: 5, affixes: [] })).toBeCloseTo(base * 1.3, 6);
    const d = ITEMS.iron_chestplate.armor!.defense;
    expect([0, 1, 2, 3, 4, 5].map((p) => armorDefense('iron_chestplate', { rarity: 0, ilvl: 1, plus: p, affixes: [] }) - d)).toEqual([0, 1, 1, 2, 2, 3]);
    expect(pickSpeed('iron_pickaxe', { rarity: 0, ilvl: 1, plus: 2, affixes: [{ id: 'delving', tier: 1, value: 10 }] })).toBeCloseTo(ITEMS.iron_pickaxe.pick!.speed * 1.1 * 1.1, 6);
  });
});

describe('分解 / 洗煉 / 強化 / 升階', () => {
  it('分解產出隨稀有度上升（史詩以上給星塵）；強化過的退還部分材料', () => {
    const y = [0, 1, 2, 3, 4, 5].map((r) => salvageYield({ rarity: r, ilvl: 1, plus: 0, affixes: [] }));
    for (let r = 1; r < 6; r++) expect(y[r].shard).toBeGreaterThan(y[r - 1].shard);
    expect(y[0].dust).toBe(0);
    expect(y[3].dust).toBeGreaterThan(0);
    expect(salvageYield(undefined)).toEqual(y[0]);
    expect(salvageYield({ rarity: 2, ilvl: 1, plus: 3, affixes: [] }).shard).toBeGreaterThan(y[2].shard);
  });
  it('強化成本逐級上升；+5 之後不能再強化', () => {
    let prev = 0;
    for (let p = 0; p < MAX_PLUS; p++) {
      const c = upgradeCost({ rarity: 2, ilvl: 3, plus: p, affixes: [] })!;
      expect(c.shard).toBeGreaterThan(prev);
      prev = c.shard;
    }
    expect(upgradeCost({ rarity: 2, ilvl: 3, plus: MAX_PLUS, affixes: [] })).toBeNull();
  });
  it('升階到傳說為止；神話不能再升', () => {
    expect(ascendCost({ rarity: 0, ilvl: 1, plus: 0, affixes: [] })!.shard).toBeGreaterThan(0);
    expect(ascendCost({ rarity: MAX_ASCEND, ilvl: 1, plus: 0, affixes: [] })).toBeNull();
    expect(ascendCost({ rarity: 5, ilvl: 1, plus: 0, affixes: [] })).toBeNull();
  });
  it('洗煉成本隨次數上升', () => {
    const g: Gear = { rarity: 3, ilvl: 3, plus: 0, affixes: [] };
    expect(rerollCost({ ...g, rerolls: 3 }).shard).toBeGreaterThan(rerollCost(g).shard);
  });
  it('洗煉只換掉指定那條（同類型、不重複），其他不變；傳奇詞條不能洗', () => {
    const g = roll('iron_sword', 3, 'rr');
    const r = rerollAffix('iron_sword', g, 1, new Rng('q'));
    expect(r).not.toBeNull();
    const n = r!;
    expect(n.affixes[0]).toEqual(g.affixes[0]);
    expect(n.affixes[2]).toEqual(g.affixes[2]);
    expect(n.affixes[1].id).not.toBe(g.affixes[1].id);
    expect(affixDef(n.affixes[1].id).kind).toBe(affixDef(g.affixes[1].id).kind);
    expect(new Set(n.affixes.map((a) => a.id)).size).toBe(3);
    expect(n.rerolls).toBe(1);
    expect(rerollAffix('iron_sword', n, 1, new Rng('q'))).toEqual(rerollAffix('iron_sword', n, 1, new Rng('q')));
    const L = roll('iron_sword', 4, 'leg');
    const ui = L.affixes.findIndex((a) => affixDef(a.id).kind === 'unique');
    expect(rerollAffix('iron_sword', L, ui, new Rng('q'))).toBeNull();
  });
  it('強化 +1；升階 → 稀有度 +1、多一條詞條（升到傳說時是傳奇詞條）', () => {
    const g = roll('iron_sword', 3, 'up');
    expect(upgradeGear(g).plus).toBe(1);
    const a = ascendGear('iron_sword', g, new Rng('asc'));
    expect(a!.rarity).toBe(4);
    expect(a!.affixes).toHaveLength(4);
    expect(a!.affixes.some((x) => affixDef(x.id).kind === 'unique')).toBe(true);
  });
});

describe('掉落池', () => {
  it('依物品等級挑基底：等級 1 只有木 / 銅；不會掉珍寶', () => {
    const p1 = dropPool(1);
    expect(p1.length).toBeGreaterThan(3);
    for (const id of p1) expect(id.startsWith('wood') || id.startsWith('copper') || id === 'feather_charm').toBe(true);
    for (let l = 1; l <= 5; l++) for (const id of dropPool(l)) expect(ITEMS[id].unique).toBeFalsy();
    expect(dropPool(5).some((id) => id.startsWith('molten'))).toBe(true);
    const r = new Rng('d');
    for (let i = 0; i < 50; i++) expect(dropPool(2)).toContain(rollDropItem(r, 2));
  });
});

describe('驗證（存檔）', () => {
  it('合法 → 回傳副本；壞資料 → null', () => {
    const g = roll('iron_sword', 4, 'v');
    expect(validGear('iron_sword', g)).toEqual(g);
    expect(validGear('iron_sword', { ...g, rarity: 9 })).toBeNull();
    expect(validGear('iron_sword', { ...g, affixes: [{ id: 'nope', tier: 1, value: 1 }] })).toBeNull();
    expect(validGear('dirt', g)).toBeNull();
    expect(validGear('iron_sword', null)).toBeNull();
    expect(validGear('iron_sword', { ...g, locked: true })!.locked).toBe(true);
  });
});
