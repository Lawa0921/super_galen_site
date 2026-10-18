// serialize.v7.test.ts — 存檔格式 7：死亡中存檔（重生點 + 地上的錢）、首領戰中存檔（退還召喚道具）、
// 呼吸 / 燃燒 / 蜂蜜計時、匯入尺寸上限、探索位元圖編碼快取、v6 → v7 遷移。
import { describe, it, expect, vi } from 'vitest';
import { DelveGame } from '../engine/game';
import { T, W } from '../engine/tiles';
import { LIQ } from '../engine/liquidKind';
import { ITEMS } from '../engine/items';
import { CHUNK, TILE_SIZE as S } from '../engine/constants';
import {
  encodeSave, decodeSave, serializeGame, restoreGame, snapshotGame, SAVE_FORMAT, MAX_WORLD_W, MAX_WORLD_H, MAX_WORLD_AREA,
} from './serialize';

const SMALL = { width: 160, height: 100 };

/** 小世界：清空液體，x 20..140 清成空氣，第 60 列以下石頭 */
function flat(seed = 'save-v7'): DelveGame {
  const g = new DelveGame({ seed, ...SMALL, peaceful: true });
  const w = g.world;
  for (let i = 0; i < w.liquid.length; i++) { w.liquid[i] = 0; w.liquidType[i] = 0; }
  for (let y = 0; y < 100; y++) for (let x = 20; x < 140; x++) { w.setFg(x, y, y >= 60 ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  g.teleport(40, 59);
  return g;
}
const run = (g: DelveGame, sec: number): void => { for (let i = 0; i < Math.round(sec * 60); i++) g.step(); };
const feet = (g: DelveGame): { x: number; y: number } => g.feetTile();

describe('存檔格式 7', { timeout: 120_000 }, () => {
  it('格式版本（7 起有 vitals / drops；8 起有裝備詞條；9 起有角色外觀）', () => {
    expect(SAVE_FORMAT).toBe(9);
    expect(snapshotGame(flat()).header.format).toBe(SAVE_FORMAT);
  });

  it('死亡中存檔 → 讀回來在重生點（床）、滿血；死亡地點掉的錢還在地上', () => {
    const g = flat();
    // 床在 x=100（重生點）
    g.world.setFg(100, 59, T.BED_HEAD); g.world.setFg(101, 59, T.BED_FOOT);
    g.bed = { x: 100, y: 59 };
    g.give('copper_coin', 80);
    g.teleport(40, 59);
    g.hurtPlayer(9999, 0);
    expect(g.dead).toBe(true);
    const onGround = g.drops.list.filter((d) => d.item === 'copper_coin').reduce((a, d) => a + d.count, 0);
    expect(onGround).toBe(40);
    const r = restoreGame(serializeGame(g));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const h = r.game;
    expect(h.dead).toBe(false);
    expect(feet(h)).toEqual({ x: 100, y: 59 });
    expect(h.getState().hp).toBe(h.getState().maxHp);
    expect(h.inventory.count('copper_coin')).toBe(40);
    const saved = h.drops.list.filter((d) => d.item === 'copper_coin');
    expect(saved.reduce((a, d) => a + d.count, 0)).toBe(40);
    // 錢在死亡地點附近（x≈40），不是在床邊
    for (const d of saved) expect(Math.abs((d.body.x + d.body.w / 2) / S - 40)).toBeLessThan(6);
  });

  it('沒有床：死亡中存檔 → 讀回來在出生點', () => {
    const g = flat();
    g.hurtPlayer(9999, 0);
    const r = restoreGame(serializeGame(g));
    expect(r.ok && feet(r.game)).toEqual(g.respawnPoint());
  });

  it('死在熔岩裡存檔 → 讀回來不在熔岩、不會一直死', () => {
    const g = flat();
    const w = g.world;
    // 床在地板上（這個測試世界把出生點的地面清掉了，從出生點重生會摔死）
    w.setFg(100, 59, T.BED_HEAD); w.setFg(101, 59, T.BED_FOOT);
    g.bed = { x: 100, y: 59 };
    // 地板下挖一個熔岩坑（x 30..50、y 60..65），玩家在坑裡
    for (let x = 30; x < 50; x++) for (let y = 60; y < 66; y++) { w.setFg(x, y, T.AIR); w.liquid[w.idx(x, y)] = 255; w.liquidType[w.idx(x, y)] = LIQ.LAVA; }
    g.teleport(40, 65);
    for (let i = 0; i < 60 * 20 && !g.dead; i++) g.step();
    expect(g.dead).toBe(true);
    const r = restoreGame(serializeGame(g));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const h = r.game;
    expect(feet(h)).toEqual(h.respawnPoint());
    let died = false;
    for (let i = 0; i < 60 * 10; i++) { h.step(); if (h.dead) died = true; }
    expect(died).toBe(false);
  });

  it('地上的掉落物存回來（道具 / 數量 / 位置）；壞資料 → 格式錯誤', () => {
    const g = flat();
    g.drops.spawn('iron_ore', 7, 70 * S, 50 * S, 0, 0);
    const snap = snapshotGame(g);
    expect(snap.header.drops).toEqual([{ item: 'iron_ore', count: 7, x: 70 * S, y: 50 * S }]);
    const r = restoreGame(encodeSave(snap));
    expect(r.ok && r.game.drops.list.map((d) => [d.item, d.count])).toEqual([['iron_ore', 7]]);
    const bad = snapshotGame(g);
    bad.header.drops = [{ item: 'nope' as never, count: 1, x: 0, y: 0 }];
    expect(restoreGame(encodeSave(bad)).ok).toBe(false);
  });

  it('首領戰中存檔 → 讀回來退還召喚道具（燈芯祭品），首領不在', () => {
    const g = flat();
    g.summonBoss();
    expect(g.bossEnemy()).not.toBeNull();
    const before = g.inventory.count('wick_offering');
    const snap = snapshotGame(g);
    expect(snap.header.bossActive).toBe('lantern_warden');
    const r = restoreGame(encodeSave(snap));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.bossEnemy()).toBeNull();
    expect(r.game.inventory.count('wick_offering')).toBe(before + 1);
    // 沒有首領的存檔不退
    const r2 = restoreGame(serializeGame(flat()));
    expect(r2.ok && r2.game.inventory.count('wick_offering')).toBe(0);
  });

  it('首領戰中存檔、背包滿 → 祭品掉在玩家腳邊', () => {
    const g = flat();
    for (let i = 0; i < g.inventory.slots.length; i++) g.inventory.slots[i] = g.inventory.slots[i] ?? { item: 'dirt', count: ITEMS.dirt.maxStack };
    g.summonBoss();
    const r = restoreGame(serializeGame(g));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const got = r.game.inventory.count('wick_offering') + r.game.drops.list.filter((d) => d.item === 'wick_offering').length;
    expect(got).toBe(1);
  });

  it('呼吸 / 燃燒 / 蜂蜜計時存得回來（水下讀檔不會補滿氣）', () => {
    const g = flat();
    g.breath = 3.25; g.burning = 4.5; g.honeyT = 6;
    const snap = snapshotGame(g);
    expect(snap.header.vitals).toEqual({ breath: 3.25, burning: 4.5, honey: 6 });
    const r = restoreGame(encodeSave(snap));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.breath).toBeCloseTo(3.25);
    expect(r.game.burning).toBeCloseTo(4.5);
    expect(r.game.honeyT).toBeCloseTo(6);
    // 範圍外的值夾住
    snap.header.vitals = { breath: 999, burning: -3, honey: 1e9 };
    const r2 = restoreGame(encodeSave(snap));
    expect(r2.ok).toBe(true);
    if (r2.ok) { expect(r2.game.breath).toBe(10); expect(r2.game.burning).toBe(0); expect(r2.game.honeyT).toBeLessThanOrEqual(10); }
  });

  it('v6 存檔（沒有 vitals / drops / bossActive）讀進來 = 滿氣、沒燒、沒有掉落物；往返一致', () => {
    const g = flat();
    g.breath = 2;
    const data = snapshotGame(g);
    data.header.format = 6;
    delete data.header.vitals; delete data.header.drops; delete data.header.bossActive;
    const r = restoreGame(decodeSave(encodeSave(data)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.breath).toBe(10);
    expect(r.game.burning).toBe(0);
    expect(r.game.drops.list.length).toBe(0);
    const again = snapshotGame(r.game);
    expect(again.header.format).toBe(SAVE_FORMAT);
    const r3 = restoreGame(encodeSave(again));
    expect(r3.ok).toBe(true);
  });

  it('尺寸上限：寬 > 8400 / 高 > 2400 / 面積過大 → size；液體 chunk 數超過世界 → 格式錯誤（先驗再配置）', () => {
    expect(MAX_WORLD_W).toBe(8400);
    expect(MAX_WORLD_H).toBe(2400);
    expect(MAX_WORLD_AREA).toBeLessThanOrEqual(21_000_000);
    const g = flat();
    for (const [width, height] of [[8401, 200], [400, 2401], [8400, 2600], [8192, 2560]]) {
      const d = snapshotGame(g);
      d.header.width = width; d.header.height = height; delete d.header.explored;
      const r = restoreGame(encodeSave(d));
      expect(r.ok, `${width}x${height}`).toBe(false);
    }
    // 液體 chunk 清單比世界的 chunk 總數還多：不能配置 n*1024 再發現
    const d = snapshotGame(g);
    const total = Math.ceil(SMALL.width / CHUNK) * Math.ceil(SMALL.height / CHUNK);
    d.header.liquids = { chunks: Array.from({ length: total + 1 }, (_, i) => i % total), data: '' };
    const r = restoreGame(encodeSave(d));
    expect(r.ok).toBe(false);
    const huge = snapshotGame(g);
    huge.header.liquids = { chunks: Array.from({ length: 200_000 }, () => 0), data: '' };
    expect(() => decodeSave(encodeSave(huge))).toThrow();
  });

  it('自動存檔：探索沒變時不重新編碼整張迷霧圖', () => {
    const g = flat();
    const spy = vi.spyOn(g.explored, 'encode');
    const a = snapshotGame(g).header.explored;
    const b = snapshotGame(g).header.explored;
    expect(b).toBe(a);
    expect(spy).toHaveBeenCalledTimes(1);
    g.explored.reveal(150, 5);
    const c = snapshotGame(g).header.explored;
    expect(c).not.toBe(a);
    expect(spy).toHaveBeenCalledTimes(2);
    // 換了一張新的探索圖（讀檔）也要重新編碼
    const r = restoreGame(serializeGame(g));
    expect(r.ok && snapshotGame(r.game).header.explored).toBe(c);
  });
});
