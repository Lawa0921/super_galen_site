// doll.test.ts — 紙娃娃：外觀欄（時裝）蓋過防具的樣子、防具隱藏開關、稀有度 / 強化 / 元素詞條進到外觀、
// 看得見的飾品（靴子 / 翅膀 / 小盾 / 墜飾 / 腰間小物）、快取 key、圖層順序、外觀欄的裝卸與 JSON 往返。
import { describe, it, expect } from 'vitest';
import { ACCESSORIES, DEFAULT_APPEARANCE, OUTFITS } from './appearance';
import { Equipment } from './equipment';
import { Inventory } from './inventory';
import { Vanity, fitsVanity, VANITY_SLOTS } from './vanity';
import { buildDollLook, dollKey, DOLL_LAYERS, pieceOf, plainLook } from './doll';
import { ACC_ITEMS, ITEMS, OUTFIT_ITEMS, VANITY_ITEMS } from './items';
import type { Gear } from './gear';

const gear = (rarity: number, plus = 0, affix?: string): Gear => ({ rarity, ilvl: 3, plus, affixes: affix ? [{ id: affix, tier: 1, value: 5 } as Gear['affixes'][number]] : [] });

describe('圖層順序', () => {
  // 3/4 正面：背飾蓋在後髮上面（翅膀 / 披風 / 蝴蝶結才從身體兩側露得出來）
  it('後髮 → 背飾 → 身體 → 腿 → 胸 → 手臂 → 手持 → 臉 → 前髮 → 頭飾 → 前飾品', () => {
    expect([...DOLL_LAYERS]).toEqual(['backHair', 'back', 'body', 'legs', 'chest', 'arms', 'held', 'face', 'frontHair', 'headgear', 'frontAcc']);
  });
});

describe('buildDollLook', () => {
  it('什麼都沒穿：頭 / 身 / 腿都是 null（= 用客製化的基本服裝）', () => {
    const l = buildDollLook(DEFAULT_APPEARANCE, new Equipment(), new Vanity());
    expect(l.head).toBeNull(); expect(l.body).toBeNull(); expect(l.legs).toBeNull(); expect(l.back).toBeNull();
  });
  it('穿防具：該部位顯示防具套裝，帶稀有度 / 強化 / 元素', () => {
    const e = new Equipment();
    e.set('head', 'iron_helmet', gear(4, 3, 'blazing'));
    e.set('body', 'gold_chestplate', gear(2, 0, 'rime'));
    e.set('legs', 'bone_greaves');
    const l = buildDollLook(DEFAULT_APPEARANCE, e, new Vanity());
    expect(l.head).toEqual({ look: 'armor:iron', rarity: 4, plus: 3, elem: 'fire' });
    expect(l.body).toEqual({ look: 'armor:gold', rarity: 2, plus: 0, elem: 'ice' });
    expect(l.legs).toEqual({ look: 'armor:bone', rarity: 0, plus: 0, elem: null });
  });
  it('外觀欄蓋過防具的樣子（數值仍然來自防具）', () => {
    const e = new Equipment(), v = new Vanity();
    e.set('body', 'iron_chestplate');
    v.set('body', 'sailor_top');
    v.set('head', 'witch_hat');
    const l = buildDollLook(DEFAULT_APPEARANCE, e, v);
    expect(l.body?.look).toBe('outfit:sailor');
    expect(l.head?.look).toBe('hat:witch');
    expect(e.get('body')).toBe('iron_chestplate');
  });
  it('外觀欄也可以放防具（只看樣子）：例如身上穿鐵甲、外觀穿金甲', () => {
    const e = new Equipment(), v = new Vanity();
    e.set('body', 'iron_chestplate');
    expect(v.set('body', 'gold_chestplate', gear(5))).toBe(true);
    expect(buildDollLook(DEFAULT_APPEARANCE, e, v).body).toEqual({ look: 'armor:gold', rarity: 5, plus: 0, elem: null });
  });
  it('隱藏開關：防具不顯示（回到基本服裝）；外觀欄的時裝不受隱藏影響', () => {
    const e = new Equipment(), v = new Vanity();
    e.set('head', 'gold_helmet'); e.set('legs', 'iron_greaves');
    v.hide.head = true; v.hide.legs = true;
    let l = buildDollLook(DEFAULT_APPEARANCE, e, v);
    expect(l.head).toBeNull(); expect(l.legs).toBeNull();
    v.set('legs', 'miko_hakama');
    l = buildDollLook(DEFAULT_APPEARANCE, e, v);
    expect(l.legs?.look).toBe('outfit:miko');
  });
  it('看得見的飾品：跳躍靴 / 疾行靴換鞋、輕羽墜 = 背上小翅膀、甲殼小盾背在背上、墜飾、腰間小物；外觀背飾蓋過背上的飾品', () => {
    const e = new Equipment();
    e.set('acc0', 'swift_boots'); e.set('acc1', 'feather_charm'); e.set('acc2', 'night_amulet'); e.set('acc3', 'compass');
    let l = buildDollLook(DEFAULT_APPEARANCE, e, new Vanity());
    expect(l.feet).toBe('swift'); expect(l.back?.look).toBe('back:feathers'); expect(l.neck).toBe('night'); expect(l.belt).toBe('compass');
    e.set('acc1', 'chitin_buckler');
    expect(buildDollLook(DEFAULT_APPEARANCE, e, new Vanity()).back?.look).toBe('back:buckler');
    const v = new Vanity(); v.set('back', 'travel_cape');
    l = buildDollLook(DEFAULT_APPEARANCE, e, v);
    expect(l.back?.look).toBe('back:cape');
  });
  it('dollKey：任何看得見的變化（外觀 / 防具 / 稀有度 / 強化 / 隱藏 / 時裝）都換 key；看不見的（數值）不換', () => {
    const e = new Equipment(), v = new Vanity();
    const k0 = dollKey(buildDollLook(DEFAULT_APPEARANCE, e, v));
    e.set('head', 'iron_helmet');
    const k1 = dollKey(buildDollLook(DEFAULT_APPEARANCE, e, v));
    expect(k1).not.toBe(k0);
    e.set('head', 'iron_helmet', gear(4));
    const k2 = dollKey(buildDollLook(DEFAULT_APPEARANCE, e, v));
    expect(k2).not.toBe(k1);
    v.hide.head = true;
    expect(dollKey(buildDollLook(DEFAULT_APPEARANCE, e, v))).toBe(k0);
    v.set('back', 'feather_wings');
    expect(dollKey(buildDollLook(DEFAULT_APPEARANCE, e, v))).not.toBe(k0);
    expect(dollKey(buildDollLook({ ...DEFAULT_APPEARANCE, hair: 3 }, e, v))).not.toBe(dollKey(buildDollLook(DEFAULT_APPEARANCE, e, v)));
  });
  it('pieceOf：時裝沒有詞條 = 稀有度 0；元素詞條對應（熾焰 fire、霜寒 ice、劇毒 poison、螢光 light、引雷 storm）', () => {
    expect(pieceOf({ item: 'beret', count: 1 })).toEqual({ look: 'hat:beret', rarity: 0, plus: 0, elem: null });
    expect(pieceOf({ item: 'iron_helmet', count: 1, gear: gear(1, 0, 'venom') })?.elem).toBe('poison');
    expect(pieceOf({ item: 'iron_helmet', count: 1, gear: gear(1, 0, 'glow') })?.elem).toBe('light');
    expect(pieceOf({ item: 'iron_helmet', count: 1, gear: gear(1, 0, 'stormcall') })?.elem).toBe('storm');
    expect(pieceOf({ item: 'dirt', count: 1 })).toBeNull();
  });
});

describe('Vanity（外觀欄）', () => {
  it('每件時裝都只能放進自己那一格；防具可以放進同部位的外觀格；背飾格只收背飾', () => {
    expect(VANITY_ITEMS.length).toBeGreaterThanOrEqual(15);
    for (const id of VANITY_ITEMS) {
      const s = ITEMS[id].vanity!.slot;
      for (const t of VANITY_SLOTS) expect(fitsVanity(t, id)).toBe(t === s);
    }
    expect(fitsVanity('head', 'iron_helmet')).toBe(true);
    expect(fitsVanity('body', 'iron_helmet')).toBe(false);
    expect(fitsVanity('back', 'iron_chestplate')).toBe(false);
    expect(fitsVanity('head', 'dirt')).toBe(false);
  });
  it('從背包裝上 / 卸下（交換），version 跟著變', () => {
    const inv = new Inventory(), v = new Vanity();
    inv.slots.fill(null);
    inv.slots[0] = { item: 'beret', count: 1 };
    inv.slots[1] = { item: 'straw_hat', count: 1 };
    const v0 = v.version;
    expect(v.equipFrom(inv, 0, 'head')).toBe(true);
    expect(v.get('head')).toBe('beret');
    expect(inv.slots[0]).toBeNull();
    expect(v.version).toBeGreaterThan(v0);
    expect(v.equipFrom(inv, 1, 'head')).toBe(true);
    expect(v.get('head')).toBe('straw_hat');
    expect(inv.slots[1]?.item).toBe('beret');
    expect(v.equipFrom(inv, 1, 'body')).toBe(false);
    expect(v.unequipTo(inv, 'head')).toBe(true);
    expect(v.get('head')).toBeNull();
    expect(inv.slots.some((s) => s?.item === 'straw_hat')).toBe(true);
  });
  it('toJSON / fromJSON 往返（含隱藏開關、放在外觀欄的防具詞條）；壞資料丟掉', () => {
    const v = new Vanity();
    v.set('head', 'witch_hat'); v.set('body', 'gold_chestplate', gear(3, 2)); v.set('back', 'ribbon_bow');
    v.hide.body = true; v.hide.legs = true;
    const back = Vanity.fromJSON(JSON.parse(JSON.stringify(v.toJSON())));
    expect(back.toJSON()).toEqual(v.toJSON());
    const bad = Vanity.fromJSON({ slots: { head: 'iron_chestplate', body: 'nope', legs: 'sailor_skirt', back: 'beret' }, hide: { head: 'x', body: true } });
    expect(bad.get('head')).toBeNull(); expect(bad.get('body')).toBeNull(); expect(bad.get('legs')).toBe('sailor_skirt'); expect(bad.get('back')).toBeNull();
    expect(bad.hide).toEqual({ head: false, body: true, legs: false });
    expect(Vanity.fromJSON(null).toJSON()).toEqual(new Vanity().toJSON());
  });
  it('dollKey differs by tint：同款不同顏色換 key；沒顏色 = 原本的 key', () => {
    const e = new Equipment(), v = new Vanity();
    v.set('body', 'sailor_top');
    const k0 = dollKey(buildDollLook(DEFAULT_APPEARANCE, e, v));
    expect(k0).toContain('outfit:sailor/0/0/|');
    v.set('body', 'sailor_top', undefined, [3, 7]);
    const l1 = buildDollLook(DEFAULT_APPEARANCE, e, v);
    expect(l1.body).toEqual({ look: 'outfit:sailor', rarity: 0, plus: 0, elem: null, tint: [3, 7] });
    const k1 = dollKey(l1);
    v.set('body', 'sailor_top', undefined, [3, 8]);
    const k2 = dollKey(buildDollLook(DEFAULT_APPEARANCE, e, v));
    expect(new Set([k0, k1, k2]).size).toBe(3);
    expect(pieceOf({ item: 'beret', count: 1, tint: [1, 2] })!.tint).toEqual([1, 2]);
    expect(pieceOf({ item: 'beret', count: 1 })!.tint).toBeUndefined();
  });
  it('換時裝欄裡那件的顏色（交換同款不同色）：equipFrom / unequipTo 帶著 tint', () => {
    const inv = new Inventory(), v = new Vanity();
    inv.slots[0] = { item: 'beret', count: 1, tint: [1, 2] };
    inv.slots[1] = { item: 'beret', count: 1, tint: [4, 5] };
    expect(v.equipFrom(inv, 0, 'head')).toBe(true);
    expect(v.equipFrom(inv, 1, 'head')).toBe(true);
    expect(v.getStack('head')!.tint).toEqual([4, 5]);
    expect(inv.slots[1]).toEqual({ item: 'beret', count: 1, tint: [1, 2] });
    expect(v.unequipTo(inv, 'head')).toBe(true);
    expect(inv.slots[0]).toEqual({ item: 'beret', count: 1, tint: [4, 5] });
  });
});

describe('每套服裝 / 每個頭飾 / 眼鏡都有對應的時裝物品', () => {
  it('OUTFIT_ITEMS：每套服裝（布衣除外）= 身體 + 腿兩件，look 都是 outfit:<id>；現有 6 套沿用原本的物品', () => {
    for (const o of OUTFITS) {
      if (o.id === 'plain') { expect(OUTFIT_ITEMS[o.id], 'plain 不是物品').toBeUndefined(); continue; }
      const pair = OUTFIT_ITEMS[o.id];
      expect(pair, o.id).toBeDefined();
      const [top, bottom] = pair;
      expect(ITEMS[top].vanity, top).toEqual({ slot: 'body', look: `outfit:${o.id}` });
      expect(ITEMS[bottom].vanity, bottom).toEqual({ slot: 'legs', look: `outfit:${o.id}` });
      expect(ITEMS[top].maxStack).toBe(1);
      expect(ITEMS[bottom].maxStack).toBe(1);
    }
    expect(OUTFIT_ITEMS.sailor).toEqual(['sailor_top', 'sailor_skirt']);
    expect(OUTFIT_ITEMS.miko).toEqual(['miko_robe', 'miko_hakama']);
    expect(OUTFIT_ITEMS.maid).toEqual(['maid_dress', 'maid_skirt']);
    expect(OUTFIT_ITEMS.hoodie).toEqual(['hoodie_top', 'hoodie_shorts']);
    expect(OUTFIT_ITEMS.coat).toEqual(['travel_coat', 'coat_trousers']);
    expect(OUTFIT_ITEMS.explorer).toEqual(['explorer_vest', 'explorer_shorts']);
    for (const id of ['ninja', 'mage', 'knight', 'qipao', 'pirate', 'idol', 'priest', 'gothic']) expect(OUTFIT_ITEMS[id]).toEqual([`${id}_top`, `${id}_bottom`]);
    expect(ITEMS.ninja_top.name.zh).toBe('忍者上衣');
    expect(ITEMS.ninja_bottom.name.zh).toBe('忍者褲');
  });
  it('ACC_ITEMS：9 個頭飾 + 眼鏡 = 飾品格的 10 件新物品（acc_<id>、look acc:<id>、名稱比照頭飾標籤）', () => {
    const ids = [...ACCESSORIES.filter((a) => a.id !== 'none').map((a) => a.id), 'glasses'];
    expect(Object.keys(ACC_ITEMS).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const it = ACC_ITEMS[id];
      expect(it).toBe(`acc_${id}`);
      expect(ITEMS[it].vanity, it).toEqual({ slot: 'acc', look: `acc:${id}` });
      expect(ITEMS[it].maxStack).toBe(1);
      expect(ITEMS[it].name.zh).toBe(id === 'glasses' ? '眼鏡' : ACCESSORIES.find((a) => a.id === id)!.zh);
    }
  });
});

describe('第 5 格：飾品（acc）', () => {
  it('VANITY_SLOTS 多一格 acc（排最後）；飾品格只收飾品物品、防具和其他時裝都不收', () => {
    expect([...VANITY_SLOTS]).toEqual(['head', 'body', 'legs', 'back', 'acc']);
    expect(fitsVanity('acc', 'acc_ribbon')).toBe(true);
    expect(fitsVanity('acc', 'acc_glasses')).toBe(true);
    expect(fitsVanity('head', 'acc_ribbon')).toBe(false);
    expect(fitsVanity('acc', 'beret')).toBe(false);
    expect(fitsVanity('acc', 'iron_helmet')).toBe(false);
    expect(fitsVanity('acc', 'compass')).toBe(false);
  });
  it('Vanity.fromJSON 讀舊的 4 格 JSON：不丟錯、acc = null；新 JSON 帶 acc（含顏色）往返', () => {
    const old = { slots: { head: 'beret', body: 'sailor_top', legs: null, back: 'travel_cape' }, gear: { head: null, body: null, legs: null, back: null }, tint: { head: [1, 2], body: null, legs: null, back: null }, hide: { head: false, body: true, legs: false } };
    let v: Vanity | null = null;
    expect(() => { v = Vanity.fromJSON(old); }).not.toThrow();
    expect(v!.get('acc')).toBeNull();
    expect(v!.get('head')).toBe('beret');
    expect(v!.toJSON().slots.acc).toBeNull();
    expect(v!.toJSON().tint.acc).toBeNull();
    const w = new Vanity();
    expect(w.set('acc', 'acc_hood', undefined, [2, 2])).toBe(true);
    const back = Vanity.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(back.getStack('acc')).toEqual({ item: 'acc_hood', count: 1, tint: [2, 2] });
    // 放錯格的道具丟掉
    expect(Vanity.fromJSON({ slots: { acc: 'beret' } }).get('acc')).toBeNull();
  });
  it('buildDollLook：飾品格 → DollLook.acc（acc:<id>，帶顏色）；沒戴 = null；dollKey 跟著變、沒戴時 key 和以前一樣', () => {
    const e = new Equipment(), v = new Vanity();
    const l0 = buildDollLook(DEFAULT_APPEARANCE, e, v);
    expect(l0.acc).toBeNull();
    expect(plainLook(DEFAULT_APPEARANCE).acc).toBeNull();
    const k0 = dollKey(l0);
    expect(k0.split('|').length).toBe(8);
    v.set('acc', 'acc_crown');
    const l1 = buildDollLook(DEFAULT_APPEARANCE, e, v);
    expect(l1.acc).toEqual({ look: 'acc:crown', rarity: 0, plus: 0, elem: null });
    const k1 = dollKey(l1);
    v.set('acc', 'acc_crown', undefined, [3, 3]);
    const k2 = dollKey(buildDollLook(DEFAULT_APPEARANCE, e, v));
    v.set('acc', 'acc_glasses');
    const k3 = dollKey(buildDollLook(DEFAULT_APPEARANCE, e, v));
    expect(new Set([k0, k1, k2, k3]).size).toBe(4);
  });
});

describe('時裝的取得方式', () => {
  // 每件時裝的來源規則（每件都有來源、和平模式拿得到、現有來源不減少…）在 cosmeticSources.test.ts
  it('礦工頭燈盔只有商店賣；地城箱子開得出只能撿的時裝', async () => {
    const { cosmeticSources } = await import('./cosmeticSources');
    const { LOOT_ONLY_FASHION, chestLoot } = await import('./loot');
    const { ROLES } = await import('./folkDefs');
    // 礦工頭燈盔：只有矮人礦石商（摯友）賣，不在合成表也不在箱子裡
    expect(cosmeticSources('miner_helmet')).toEqual(['shop']);
    expect(ROLES.ore_trader.shop.some((e) => e.item === 'miner_helmet')).toBe(true);
    // 女僕裝 / 魔女帽 / 羽翼 / 大蝴蝶結仍然做不出來
    for (const id of LOOT_ONLY_FASHION) expect(cosmeticSources(id), id).not.toContain('craft');
    // 地城箱子：一百個箱子裡至少開得出幾件只能撿的時裝
    let n = 0;
    for (let i = 0; i < 100; i++) for (const s of chestLoot('fashion', i, 7, 'dungeon', 0.6)) if (s && LOOT_ONLY_FASHION.includes(s.item)) n++;
    expect(n).toBeGreaterThan(10);
  });
});
