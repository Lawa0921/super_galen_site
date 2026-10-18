// game.loot.test.ts — 裝備詞條接上遊戲：掉落（含稀有度）、撿起保留詞條、裝備 / 卸下、詞條效果（傷害 / 生命 / 攻速 /
// 移動 / 雙段跳 / 荊棘 / 不滅 / 連鎖 / 冰凍）、箱子、合成、分解（單件 / 全部 / 鎖定）、洗煉 / 強化 / 升階（要鐵砧）、圖鑑。
import { describe, it, expect } from 'vitest';
import { DelveGame, type DelveEvent } from './game';
import { T, W } from './tiles';
import { FIXED_DT, TILE_SIZE as S } from './constants';
import { ITEMS, type ItemId } from './items';
import { salvageYield, upgradeCost, affixDef, ilvlForDepth, type Affix } from './gear';

const SMALL = { width: 160, height: 100 };
function arena(opts: { px?: number; floorY?: number; seed?: string } = {}): DelveGame {
  const { px = 60, floorY = 60, seed = 'loot' } = opts;
  const g = new DelveGame({ seed, ...SMALL, peaceful: true });
  // 這些測試假設 1 級角色（小世界裡走幾步就會發現地區、升級）：不拿經驗
  g.levels.locked = true;
  const w = g.world;
  for (let i = 0; i < w.liquid.length; i++) { w.liquid[i] = 0; w.liquidType[i] = 0; }
  for (let y = 0; y < w.height; y++) for (let x = 30; x < 100; x++) { w.setFg(x, y, y >= floorY ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  g.teleport(px, floorY - 1);
  run(g, 0.1);
  g.drainEvents();
  return g;
}
function run(g: DelveGame, seconds: number): void { for (let i = 0, n = Math.round(seconds / FIXED_DT); i < n; i++) g.step(FIXED_DT); }
const slotOf = (g: DelveGame, item: ItemId): number => g.inventory.slots.findIndex((s) => s?.item === item);
function holdGear(g: DelveGame, item: ItemId, rarity: number, affixes: Affix[], plus = 0): void {
  g.giveGear(item, rarity, { affixes, plus });
  g.inventory.swap(slotOf(g, item), 1);
  g.selectSlot(1);
}
const A = (id: Affix['id'], value: number, tier = 3): Affix => ({ id, tier, value });

describe('掉落與撿起', () => {
  it('怪物掉的裝備帶稀有度；撿起來後背包那格保留同一份詞條', () => {
    const g = arena();
    g.debugGearChance = 1;
    const e = g.spawnEnemy('gel_blob', 64, 59);
    g.debugDamage(e.id, 999);
    const ev = g.drainEvents();
    const loot = ev.find((x): x is Extract<DelveEvent, { type: 'loot' }> => x.type === 'loot');
    expect(loot).toBeTruthy();
    const drop = g.drops.list.find((d) => d.gear);
    expect(drop).toBeTruthy();
    const gear = JSON.parse(JSON.stringify(drop!.gear));
    run(g, 3);
    const i = slotOf(g, drop!.item);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(g.inventory.slots[i]!.gear).toEqual(gear);
    expect(g.drainEvents().some((x) => x.type === 'pickup' && x.rarity === gear.rarity)).toBe(true);
  });
  it('一般機率：數百隻凝膠團大約掉 5% 裝備；物品等級跟著深度', () => {
    const g = arena();
    let n = 0;
    for (let k = 0; k < 400; k++) {
      const e = g.spawnEnemy('gel_blob', 64, 59);
      g.debugDamage(e.id, 999);
      n += g.drainEvents().filter((x) => x.type === 'loot').length;
    }
    expect(n).toBeGreaterThan(8);
    expect(n).toBeLessThan(40);
    for (const d of g.drops.list) if (d.gear) expect(d.gear.ilvl).toBe(ilvlForDepth(g.depthFrac(64, 59)));
  });
  it('首領必掉：燈脈之刃 / 守望之心至少稀有，外加兩件隨機裝備', () => {
    const g = arena();
    const b = g.summonBoss()!;
    g.debugDamage(b.id, 99999);
    const gear = g.drops.list.filter((d) => d.gear);
    expect(gear.length).toBeGreaterThanOrEqual(4);
    for (const d of gear) expect(d.gear!.rarity).toBeGreaterThanOrEqual(2);
  });
});

describe('裝備 / 數值', () => {
  it('裝上帶「強健的」的防具 → 生命上限增加；卸下 → 回來，詞條還在', () => {
    const g = arena();
    g.giveGear('iron_chestplate', 1, { affixes: [A('hale', 15)] });
    const i = slotOf(g, 'iron_chestplate');
    expect(g.maxHp()).toBe(100);
    expect(g.equipFromInventory(i)).toBe(true);
    expect(g.maxHp()).toBe(115);
    expect(g.getState().defense).toBe(ITEMS.iron_chestplate.armor!.defense);
    expect(g.unequip('body')).toBe(true);
    expect(g.maxHp()).toBe(100);
    expect(g.inventory.slots[slotOf(g, 'iron_chestplate')]!.gear!.affixes[0]).toEqual(A('hale', 15));
  });
  it('防具強化 +3 → 防禦 +2；「堅韌的」再加防禦', () => {
    const g = arena();
    g.giveGear('iron_helmet', 2, { affixes: [A('stout', 3)], plus: 3 });
    g.equipFromInventory(slotOf(g, 'iron_helmet'));
    expect(g.getState().defense).toBe(ITEMS.iron_helmet.armor!.defense + 2 + 3);
  });
  it('「鋒銳的」武器：拿在手上才算；打怪傷害變高', () => {
    const plain = arena(), sharp = arena();
    holdGear(plain, 'iron_sword', 0, []);
    holdGear(sharp, 'iron_sword', 2, [A('keen', 50)]);
    expect(sharp.stats().damageMul).toBeCloseTo(1.5, 6);
    sharp.selectSlot(0);
    expect(sharp.stats().damageMul).toBeCloseTo(1, 6);
    sharp.selectSlot(1);
    const hit = (g: DelveGame): number => {
      const e = g.spawnEnemy('rock_crab', 62, 59);
      e.hp = 9999;
      g.setAim(62, 59); g.setMining(true);
      run(g, 0.3); g.setMining(false);
      return g.drainEvents().filter((x): x is Extract<DelveEvent, { type: 'hit' }> => x.type === 'hit' && !x.crit)[0]?.amount ?? 0;
    };
    expect(hit(sharp)).toBeGreaterThan(hit(plain));
  });
  it('「迅捷」縮短攻擊間隔', () => {
    const g = arena();
    holdGear(g, 'iron_sword', 2, [A('swift', 15)]);
    g.setAim(62, 59); g.setMining(true);
    run(g, 0.05);
    expect(g.attack!.dur).toBeCloseTo(ITEMS.iron_sword.weapon!.useTime / 1.15, 6);
  });
  it('「疾風」跑得更快；全身加總有上限', () => {
    const g = arena();
    g.giveGear('iron_greaves', 2, { affixes: [A('gale', 16)] });
    g.equipFromInventory(slotOf(g, 'iron_greaves'));
    expect(g.moveStats().runMul).toBeCloseTo(1.16, 6);
    for (const it of ['chitin_buckler', 'fang_charm', 'feather_charm'] as ItemId[]) { g.giveGear(it, 2, { affixes: [A('gale', 16)] }); g.equipFromInventory(slotOf(g, it)); }
    expect(g.moveStats().runMul).toBeCloseTo(1.4, 6);
  });
  it('凌雲：空中可以再跳一次', () => {
    const g = arena();
    g.giveGear('iron_greaves', 4, { affixes: [A('skyleap', 1, 5)] });
    g.equipFromInventory(slotOf(g, 'iron_greaves'));
    g.setJump(true); run(g, 0.3); g.setJump(false); run(g, 0.05);
    const vy0 = g.player.vy;
    g.setJump(true); run(g, FIXED_DT * 2);
    expect(g.player.vy).toBeLessThan(Math.min(vy0, -200));
    expect(g.drainEvents().some((e) => e.type === 'airjump')).toBe(true);
  });
  it('荊棘：怪物撞到玩家時自己受傷', () => {
    const g = arena();
    g.giveGear('iron_chestplate', 2, { affixes: [A('thorned', 15)] });
    g.equipFromInventory(slotOf(g, 'iron_chestplate'));
    const e = g.spawnEnemy('rock_crab', 60, 59);
    const hp0 = e.hp;
    run(g, 0.2);
    expect(e.hp).toBeLessThan(hp0);
  });
  it('不滅：致命傷以 1 點生命撐住，冷卻中再受致命傷才會死', () => {
    const g = arena();
    g.giveGear('iron_chestplate', 4, { affixes: [A('undying', 90, 5)] });
    g.equipFromInventory(slotOf(g, 'iron_chestplate'));
    g.hurtPlayer(9999, 0);
    expect(g.dead).toBe(false);
    expect(g.hp).toBe(1);
    expect(g.drainEvents().some((e) => e.type === 'undying')).toBe(true);
    run(g, 2);
    g.hurtPlayer(9999, 0);
    expect(g.dead).toBe(true);
  });
  it('奔雷：連鎖閃電打到旁邊的怪（事件帶折線）', () => {
    const g = arena();
    holdGear(g, 'iron_sword', 4, [A('stormcall', 100, 5)]);
    const a = g.spawnEnemy('rock_crab', 62, 59), b = g.spawnEnemy('rock_crab', 66, 59);
    a.hp = b.hp = 9999;
    const hb = b.hp;
    g.setAim(62, 59); g.setMining(true); run(g, 0.2); g.setMining(false);
    const ch = g.drainEvents().find((e): e is Extract<DelveEvent, { type: 'chain' }> => e.type === 'chain');
    expect(ch).toBeTruthy();
    expect(ch!.pts.length).toBeGreaterThanOrEqual(2);
    expect(b.hp).toBeLessThan(hb);
  });
  it('霜寒：命中後怪物冰凍（動作變慢）', () => {
    const g = arena();
    holdGear(g, 'iron_sword', 2, [A('rime', 100)]);
    const e = g.spawnEnemy('rock_crab', 62, 59);
    e.hp = 9999;
    g.setAim(62, 59); g.setMining(true);
    // 命中冰凍機率上限 50%：揮幾下一定會凍到
    let frozen = false;
    for (let k = 0; k < 240 && !frozen; k++) { g.step(FIXED_DT); frozen = e.frost > 0; }
    expect(frozen).toBe(true);
  });
});

describe('箱子 / 合成', () => {
  it('從箱子拿裝備保留詞條；放回箱子也是', () => {
    const g = arena();
    g.world.setFg(62, 59, T.CHEST);
    const gear = { rarity: 3, ilvl: 3, plus: 0, affixes: [A('keen', 12)] };
    g.world.chests.set(g.world.idx(62, 59), [{ item: 'gold_sword', count: 1, gear }, ...new Array(19).fill(null)]);
    expect(g.interact(62, 59)).toBe(true);
    expect(g.takeChestSlot(0)).toBe(true);
    const i = slotOf(g, 'gold_sword');
    expect(g.inventory.slots[i]!.gear).toEqual(gear);
    expect(g.depositToChest(i)).toBe(true);
    expect(g.chestSlots()![0]!.gear).toEqual(gear);
  });
  it('箱子裡沒擲過的珍寶：第一次拿的時候擲，至少稀有、同一個箱子結果固定', () => {
    const take = (): number => {
      const g = arena();
      g.world.setFg(62, 59, T.CHEST);
      g.world.chests.set(g.world.idx(62, 59), [{ item: 'jump_boots', count: 1 }, ...new Array(19).fill(null)]);
      g.interact(62, 59); g.takeChestSlot(0);
      return g.inventory.slots[slotOf(g, 'jump_boots')]!.gear!.rarity;
    };
    const r = take();
    expect(r).toBeGreaterThanOrEqual(2);
    expect(take()).toBe(r);
  });
  it('合成的裝備會擲稀有度（帶 gear）；材料類不帶', () => {
    const g = arena();
    g.world.setFg(58, 59, T.WORKBENCH);
    g.give('planks', 60);
    expect(g.craft('wood_sword').ok).toBe(true);
    const st = g.inventory.slots.filter((s) => s?.item === 'wood_sword').find((s) => s!.gear);
    expect(st?.gear).toBeTruthy();
    expect(g.craft('platform').ok).toBe(true);
    expect(g.inventory.slots.find((s) => s?.item === 'platform')!.gear).toBeUndefined();
  });
});

describe('分解 / 鍛造 / 圖鑑', () => {
  it('分解一件 → 碎晶（數量 = salvageYield）；鎖定的不能分解', () => {
    const g = arena();
    const gear = g.giveGear('iron_sword', 3)!;
    const i = slotOf(g, 'iron_sword');
    expect(g.toggleLock(i)).toBe(true);
    expect(g.salvage(i)).toBeNull();
    expect(g.toggleLock(i)).toBe(false);
    const y = g.salvage(i)!;
    expect(y).toEqual(salvageYield({ ...gear, locked: undefined }));
    expect(g.inventory.count('gear_shard')).toBe(y.shard);
    expect(g.inventory.count('stardust')).toBe(y.dust);
    expect(slotOf(g, 'iron_sword')).toBe(-1);
  });
  it('分解全部普通：只動快捷欄以外、沒鎖定的普通裝備', () => {
    const g = arena();
    // 快捷欄先塞滿 → 之後給的裝備都在背包區
    for (let i = 0; i < 10; i++) if (!g.inventory.slots[i]) g.inventory.slots[i] = { item: 'stone', count: 1 };
    for (let k = 0; k < 3; k++) g.giveGear('copper_sword', 0);
    g.giveGear('iron_sword', 2);
    g.giveGear('copper_helmet', 0);
    const lockAt = slotOf(g, 'copper_helmet');
    g.toggleLock(lockAt);
    const r = g.salvageAll(0);
    expect(r.count).toBe(3);
    expect(g.inventory.count('copper_sword')).toBe(0);
    expect(g.inventory.count('iron_sword')).toBe(1);
    expect(g.inventory.count('copper_helmet')).toBe(1);
    expect(g.inventory.count('wood_sword')).toBe(1); // 快捷欄的起始劍不動
  });
  it('強化 / 洗煉 / 升階：要在鐵砧旁、材料夠才行，扣材料、改詞條', () => {
    const g = arena();
    g.giveGear('iron_sword', 3, { affixes: [A('keen', 10), A('savage', 5), A('swift', 6)] });
    const i = slotOf(g, 'iron_sword');
    expect(g.upgrade(i)).toEqual({ ok: false, reason: 'station' });
    g.world.setFg(58, 59, T.ANVIL);
    expect(g.upgrade(i)).toEqual({ ok: false, reason: 'cost' });
    g.give('gear_shard', 500); g.give('stardust', 100);
    const c = upgradeCost(g.gearAt(i))!;
    expect(g.upgrade(i)).toEqual({ ok: true });
    expect(g.gearAt(i)!.plus).toBe(1);
    expect(g.inventory.count('gear_shard')).toBe(500 - c.shard);
    const before = g.gearAt(i)!.affixes.map((a) => a.id);
    expect(g.reroll(i, 1)).toEqual({ ok: true });
    const after = g.gearAt(i)!.affixes.map((a) => a.id);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(g.ascend(i)).toEqual({ ok: true });
    expect(g.gearAt(i)!.rarity).toBe(4);
    expect(g.gearAt(i)!.affixes.some((a) => affixDef(a.id).kind === 'unique')).toBe(true);
    expect(g.ascend(i)).toEqual({ ok: false, reason: 'max' });
    const u = g.gearAt(i)!.affixes.findIndex((a) => affixDef(a.id).kind === 'unique');
    expect(g.reroll(i, u)).toEqual({ ok: false, reason: 'unique' });
    expect(g.drainEvents().filter((e) => e.type === 'forge').length).toBe(3);
  });
  it('圖鑑：拿到的裝備詞條收錄（新詞條發事件），記住每種基底的最高稀有度', () => {
    const g = arena();
    g.giveGear('iron_sword', 2, { affixes: [A('blazing', 12, 2), A('swift', 4, 2)] });
    run(g, 0.5);
    const ev = g.drainEvents().filter((e): e is Extract<DelveEvent, { type: 'codex' }> => e.type === 'codex').map((e) => e.affix).sort();
    expect(ev).toEqual(['blazing', 'swift']);
    expect(g.codex.items.get('iron_sword')).toBe(2);
    expect(g.codex.affixes.get('blazing')).toBe(2);
    g.giveGear('iron_sword', 4, { affixes: [A('blazing', 30, 5)] });
    run(g, 0.5);
    expect(g.codex.affixes.get('blazing')).toBe(5);
    expect(g.codex.items.get('iron_sword')).toBe(4);
  });
});

describe('驗收修正', () => {
  it('合成的裝備帶 crafted 旗標；合成的普通裝備分解 = 0 碎晶（砍樹 → 合成 → 分解刷不了材料）', () => {
    const g = arena();
    g.world.setFg(58, 59, T.WORKBENCH);
    g.give('planks', 700);
    let shards = 0;
    for (let k = 0; k < 40; k++) {
      expect(g.craft('wood_sword').ok).toBe(true);
      const i = g.inventory.slots.findIndex((s) => s?.item === 'wood_sword' && s.gear?.crafted);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(g.gearAt(i)!.rarity).toBeLessThanOrEqual(2);
      shards += g.salvage(i)!.shard;
    }
    // 40 把木劍（280 木板 = 70 木材）最多換到個位數碎晶
    expect(shards).toBeLessThan(15);
  });
  it('裝備中的也能鍛造 / 鎖定 / 分解（用裝備槽指定）', () => {
    const g = arena();
    g.giveGear('iron_chestplate', 2, { affixes: [A('hale', 15), A('mending', 0.5)] });
    g.equipFromInventory(slotOf(g, 'iron_chestplate'));
    g.world.setFg(58, 59, T.ANVIL);
    g.give('gear_shard', 300); g.give('stardust', 50);
    const def0 = g.getState().defense;
    expect(g.upgrade('body')).toEqual({ ok: true });
    expect(g.equipment.gearAt('body')!.plus).toBe(1);
    expect(g.getState().defense).toBe(def0 + 1);
    expect(g.reroll('body', 0)).toEqual({ ok: true });
    expect(g.toggleLock('body')).toBe(true);
    expect(g.salvage('body')).toBeNull();
    g.toggleLock('body');
    expect(g.salvage('body')).not.toBeNull();
    expect(g.equipment.get('body')).toBeNull();
    expect(g.maxHp()).toBe(100);
  });
  it('卸下 / 放回背包時是同一個 Stack 物件（介面追蹤的是物件，不是格子號碼）', () => {
    const g = arena();
    g.giveGear('iron_helmet', 2);
    const st = g.inventory.slots[slotOf(g, 'iron_helmet')]!;
    g.equipFromInventory(slotOf(g, 'iron_helmet'));
    expect(g.equipment.getStack('head')).toBe(st);
    g.unequip('head');
    expect(g.inventory.slots[slotOf(g, 'iron_helmet')]).toBe(st);
    expect(g.stackAt(slotOf(g, 'iron_helmet'))).toBe(st);
    expect(g.locate(st)).toBe(slotOf(g, 'iron_helmet'));
    g.equipFromInventory(slotOf(g, 'iron_helmet'));
    expect(g.locate(st)).toBe('head');
  });
  it('使用中的鎬 = 最快那把（自動）；它的一般詞條要拿在手上才算', () => {
    const g = arena();
    g.giveGear('gold_pickaxe', 3, { affixes: [A('fortune', 20), A('gale', 10)] });
    g.giveGear('iron_pickaxe', 1, { affixes: [A('delving', 10)] });
    g.selectSlot(2); // 起始的木劍
    expect(g.stats().gear.luck).toBe(0);
    expect(g.stats().gear.move).toBe(0);
    expect(g.activePick()!.item).toBe('gold_pickaxe');
    const gi = slotOf(g, 'gold_pickaxe');
    g.inventory.swap(gi, 5); g.selectSlot(5);
    expect(g.stats().gear.luck).toBe(20);
    // 拿著比較慢的鐵鎬：挖礦仍用金鎬，但金鎬的幸運 / 疾風不算
    const ii = slotOf(g, 'iron_pickaxe');
    g.inventory.swap(ii, 6); g.selectSlot(6);
    expect(g.activePick()!.item).toBe('gold_pickaxe');
    expect(g.stats().gear.luck).toBe(0);
  });
  it('不滅的冷卻寫進 getState（HUD 用）', () => {
    const g = arena();
    g.giveGear('iron_chestplate', 4, { affixes: [A('undying', 90, 5)] });
    g.equipFromInventory(slotOf(g, 'iron_chestplate'));
    g.hurtPlayer(9999, 0);
    expect(g.getState().undyingCd).toBeCloseTo(90, 0);
    expect(g.getState().gear.undying).toBe(90);
  });
});

describe('平衡', () => {
  it('開局的起始裝備是普通、沒有詞條數值', () => {
    const g = arena();
    expect(g.getState().gear.dmg).toBe(0);
    expect(g.stats().damageMul).toBe(1);
  });
  it('掉落物彈出位置在怪物附近（px）', () => {
    const g = arena();
    g.debugGearChance = 1;
    const e = g.spawnEnemy('gel_blob', 64, 59);
    g.debugDamage(e.id, 999);
    const d = g.drops.list.find((x) => x.gear)!;
    expect(Math.abs(d.body.x - 64 * S)).toBeLessThan(3 * S);
  });
});
