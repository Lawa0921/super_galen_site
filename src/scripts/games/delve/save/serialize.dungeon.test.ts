// serialize.dungeon.test.ts — 存檔格式 3：門開關、用掉的鑰匙（門解鎖 / 金寶箱已解鎖 / keysUsed）、金寶箱內容的來回
import { describe, it, expect } from 'vitest';
import { DelveGame } from '../engine/game';
import { T } from '../engine/tiles';
import { encodeSave, decodeSave, serializeGame, restoreGame, snapshotGame, SAVE_FORMAT, SaveFormatError } from './serialize';

const SMALL = { width: 160, height: 100 };

function scene(): DelveGame {
  const g = new DelveGame({ seed: 'save-dungeon', ...SMALL });
  const w = g.world;
  for (let y = 0; y < 100; y++) for (let x = 0; x < 160; x++) { w.setFg(x, y, y >= 60 ? T.STONE : T.AIR); w.setWall(x, y, 0); }
  // 三扇門：一扇關、一扇開、一扇上鎖；一個金寶箱
  for (let y = 57; y < 60; y++) { w.setFg(30, y, T.DOOR_CLOSED); w.setFg(40, y, T.DOOR_CLOSED); w.setFg(50, y, T.DOOR_LOCKED); }
  w.setFg(60, 59, T.LOCKED_CHEST);
  w.chests.get(w.idx(60, 59))![0] = { item: 'rune_pickaxe', count: 1 };
  w.chests.get(w.idx(60, 59))![1] = { item: 'gold_ore', count: 20 };
  g.teleport(37, 59);
  return g;
}

describe('存檔格式 3（地城狀態）', () => {
  it('格式版本 3', () => {
    expect(SAVE_FORMAT).toBe(3);
    expect(snapshotGame(scene()).header.format).toBe(3);
  });
  it('門開 / 關、用鑰匙解鎖的門、金寶箱已解鎖、已用鑰匙數、寶箱剩下的內容都能存回來', () => {
    const g = scene(), w = g.world;
    expect(g.interact(40, 58)).toBe(true); // 開門
    g.teleport(47, 59);
    g.give('dungeon_key', 1);
    expect(g.interact(50, 58)).toBe(true); // 解鎖
    g.teleport(58, 59);
    g.give('golden_key', 1);
    expect(g.interact(60, 59)).toBe(true); // 金寶箱
    expect(g.takeChestSlot(1)).toBe(true); // 拿走金礦、留下符文鎬
    g.closeChest();
    expect(w.keysUsed).toBe(2);
    const r = restoreGame(serializeGame(g));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const h = r.game.world;
    for (let y = 57; y < 60; y++) {
      expect(h.getFg(30, y)).toBe(T.DOOR_CLOSED);
      expect(h.getFg(40, y)).toBe(T.DOOR_OPEN);
      expect(h.getFg(50, y)).toBe(T.DOOR_OPEN);
    }
    expect(h.keysUsed).toBe(2);
    expect(h.unlocked.has(h.idx(60, 59))).toBe(true);
    const slots = h.chests.get(h.idx(60, 59))!;
    expect(slots[0]).toEqual({ item: 'rune_pickaxe', count: 1 });
    expect(slots[1]).toBeNull();
    expect(r.game.inventory.count('gold_ore')).toBe(20);
    // 已解鎖的金寶箱：還原後不用金鑰匙就能再開
    r.game.teleport(58, 59);
    expect(r.game.inventory.count('golden_key')).toBe(0);
    expect(r.game.interact(60, 59)).toBe(true);
  });
  it('沒解鎖的金寶箱：還原後仍要金鑰匙；內容保持', () => {
    const g = scene();
    g.world.setFg(5, 5, T.PLANKS); // 讓存檔有東西
    const r = restoreGame(serializeGame(g));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const h = r.game.world;
    expect(h.unlocked.size).toBe(0);
    r.game.teleport(58, 59);
    expect(r.game.interact(60, 59)).toBe(false);
    expect(h.chests.get(h.idx(60, 59))![0]).toEqual({ item: 'rune_pickaxe', count: 1 });
  });
  it('舊格式（2，沒有 unlocked / keysUsed）仍可解碼，預設為空', () => {
    const g = scene();
    const snap = snapshotGame(g);
    const h = snap.header as unknown as Record<string, unknown>;
    h.format = 2;
    delete h.unlocked; delete h.keysUsed;
    const d = decodeSave(encodeSave(snap));
    expect(d.header.unlocked).toEqual([]);
    expect(d.header.keysUsed).toBe(0);
    const r = restoreGame(d);
    expect(r.ok).toBe(true);
  });
  it('unlocked / keysUsed 欄位不合法 → 存檔損毀', () => {
    const g = scene();
    const bad = (patch: Record<string, unknown>): void => {
      const snap = snapshotGame(g);
      Object.assign(snap.header as unknown as Record<string, unknown>, patch);
      expect(() => decodeSave(encodeSave(snap))).toThrow(SaveFormatError);
    };
    bad({ unlocked: [-1] });
    bad({ unlocked: 'x' });
    bad({ unlocked: [1.5] });
    bad({ keysUsed: -3 });
    bad({ keysUsed: 'many' });
  });
  it('真實地城：開門後存檔 → 還原，門的狀態相同、鑰匙 / 寶箱位置不變', () => {
    const g = new DelveGame({ seed: 'alpha' });
    const d = g.dungeon!;
    const dr = d.doors.find((x) => !x.locked)!;
    g.teleport(dr.x - 1, dr.y + 2);
    if (g.world.getFg(dr.x - 1, dr.y + 2) !== T.AIR) g.teleport(dr.x + 1, dr.y + 2);
    expect(g.interact(dr.x, dr.y)).toBe(true);
    const r = restoreGame(serializeGame(g));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.world.getFg(dr.x, dr.y)).toBe(T.DOOR_OPEN);
    expect(JSON.stringify(r.game.dungeon!.keys)).toBe(JSON.stringify(d.keys));
  });
});
