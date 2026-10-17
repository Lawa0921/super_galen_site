// serialize.gear.test.ts — 存檔格式 8：背包 / 裝備欄 / 箱子 / 地上掉落物的裝備詞條、鎖定、圖鑑都能往返；壞的 gear = 損毀。
import { describe, it, expect } from 'vitest';
import { DelveGame } from '../engine/game';
import { T, W } from '../engine/tiles';
import { encodeSave, decodeSave, serializeGame, restoreGame, snapshotGame } from './serialize';
import type { Affix } from '../engine/gear';

const SMALL = { width: 160, height: 100 };
function flat(seed = 'save-gear'): DelveGame {
  const g = new DelveGame({ seed, ...SMALL, peaceful: true });
  const w = g.world;
  for (let i = 0; i < w.liquid.length; i++) { w.liquid[i] = 0; w.liquidType[i] = 0; }
  for (let y = 0; y < 100; y++) for (let x = 20; x < 140; x++) { w.setFg(x, y, y >= 60 ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  g.teleport(40, 59);
  return g;
}
const A = (id: Affix['id'], value: number, tier = 3): Affix => ({ id, tier, value });
const slotOf = (g: DelveGame, item: string): number => g.inventory.slots.findIndex((s) => s?.item === item);

describe('存檔格式 8：裝備詞條', { timeout: 120_000 }, () => {
  it('背包 + 裝備欄 + 箱子 + 地上掉落物的詞條、強化、鎖定、洗煉次數、圖鑑 全部往返一致', () => {
    const g = flat();
    const sword = g.giveGear('gold_sword', 4, { affixes: [A('blazing', 30, 5), A('stormcall', 25, 5), A('swift', 12, 5)], plus: 3 })!;
    const si = slotOf(g, 'gold_sword');
    g.toggleLock(si);
    g.inventory.slots[si]!.gear!.rerolls = 2;
    g.giveGear('iron_chestplate', 2, { affixes: [A('hale', 15), A('mending', 0.6)] });
    g.equipFromInventory(slotOf(g, 'iron_chestplate'));
    g.giveGear('fang_charm', 3, { affixes: [A('savage', 8, 4)] });
    g.equipFromInventory(slotOf(g, 'fang_charm'));
    // 箱子
    g.world.setFg(50, 59, T.CHEST);
    g.world.chests.set(g.world.idx(50, 59), [{ item: 'silver_bow', count: 1, gear: { rarity: 3, ilvl: 3, plus: 1, affixes: [A('keen', 12)] } }, ...new Array(19).fill(null)]);
    // 地上
    g.dropGear('molten_helmet', 5, 70, 55);
    g.observeGear();
    const maxHp = g.maxHp();
    const r = restoreGame(serializeGame(g));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const h = r.game;
    const st = h.inventory.slots[slotOf(h, 'gold_sword')]!;
    expect(st.gear).toEqual({ ...sword, locked: true, rerolls: 2 });
    expect(h.equipment.gearAt('body')!.affixes).toEqual([A('hale', 15), A('mending', 0.6)]);
    expect(h.equipment.gearAt('acc0')!.affixes).toEqual([A('savage', 8, 4)]);
    expect(h.maxHp()).toBe(maxHp);
    expect(h.world.chests.get(h.world.idx(50, 59))![0]!.gear!.affixes).toEqual([A('keen', 12)]);
    const drop = h.drops.list.find((d) => d.item === 'molten_helmet')!;
    expect(drop.gear!.rarity).toBe(5);
    expect(drop.gear).toEqual(g.drops.list.find((d) => d.item === 'molten_helmet')!.gear);
    expect(h.codex.toJSON()).toEqual(g.codex.toJSON());
    // 再存一次：位元一致
    expect(JSON.stringify(snapshotGame(h, 0).header.inventory)).toBe(JSON.stringify(snapshotGame(g, 0).header.inventory));
  });
  it('gear 結構壞掉 → 格式錯誤（不是靜靜吃掉）', () => {
    const g = flat();
    g.giveGear('iron_sword', 2);
    const data = snapshotGame(g);
    const s = data.header.inventory.slots.find((x) => x?.item === 'iron_sword')!;
    (s.gear as unknown as { rarity: number }).rarity = 42;
    const r = restoreGame(encodeSave(data));
    expect(r.ok).toBe(false);
  });
  it('非裝備帶 gear → 格式錯誤；舊存檔（沒有 gear / codex）讀進來 = 普通、圖鑑空', () => {
    const g = flat();
    g.give('dirt', 5);
    const data = snapshotGame(g);
    const d = data.header.inventory.slots.find((x) => x?.item === 'dirt')!;
    (d as { gear?: unknown }).gear = { rarity: 1, ilvl: 1, plus: 0, affixes: [] };
    expect(restoreGame(encodeSave(data)).ok).toBe(false);
    const old = snapshotGame(flat());
    old.header.format = 7;
    delete old.header.extra!.codex;
    delete old.header.combat!.equipGear;
    const r = restoreGame(decodeSave(encodeSave(old)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.game.codex.affixes.size).toBe(0);
  });
});
