// expectSameGame.ts — 測試輔助：逐欄比較兩個 DelveGame 的存檔內容（角色 + 世界 + 這個角色在這個世界的 visit）。
// visit: false → 跳過 visit 組（位置 / 床 / 重生核心 / 探索 / 標記 / 發現 / 呼吸燃燒蜂蜜），用在同一個角色換世界時。
// settle.spawnCore 屬於 visit 組：世界組比較據點時把它抹成 null。
// 比較範圍 = snapshotGame 存的每一個欄位，除了 savedAt（不是遊戲狀態）與 bossActive（怪物不存，讀檔改成退還召喚道具）。
// 掉落物位置以存檔精度（0.01 px，同 snapshotGame 的 r2）比較。
import { expect } from 'vitest';
import type { DelveGame } from '../engine/game';

const r2 = (v: number): number => Math.round(v * 100) / 100;
const dropsOf = (g: DelveGame) => g.drops.list.map((d) => ({
  item: d.item, count: d.count, gear: d.gear, tint: d.tint, x: r2(d.body.x + d.body.w / 2), y: r2(d.body.y + d.body.h / 2),
}));
const settleOf = (g: DelveGame) => ({ ...g.settle.toJSON(), spawnCore: null });

export function expectSameGame(a: DelveGame, b: DelveGame, o: { visit?: boolean } = {}): void {
  // 角色
  expect(b.inventory.toJSON()).toEqual(a.inventory.toJSON());
  expect(b.equipment.toJSON()).toEqual(a.equipment.toJSON());
  expect(b.equipment.gearJSON()).toEqual(a.equipment.gearJSON());
  expect(b.vanity.toJSON()).toEqual(a.vanity.toJSON());
  expect(b.appearance).toEqual(a.appearance);
  expect(b.levels.toJSON()).toEqual(a.levels.toJSON());
  expect(b.codex.toJSON()).toEqual(a.codex.toJSON());
  expect(b.fishLog).toEqual(a.fishLog);
  expect(b.hp).toBe(a.hp);
  expect(b.baseMaxHp).toBe(a.baseMaxHp);
  expect(b.mana).toBe(a.mana);
  expect(b.maxHp()).toBe(a.maxHp());
  expect(b.undyingCd).toBe(a.undyingCd);
  const ba = a.activeBuffs(), bb = b.activeBuffs();
  expect(bb.map((x) => x.kind)).toEqual(ba.map((x) => x.kind));
  bb.forEach((x, i) => expect(x.left).toBeCloseTo(ba[i].left, 6));
  // 世界
  const wa = a.world, wb = b.world;
  expect(b.seed).toBe(a.seed);
  expect([wb.width, wb.height]).toEqual([wa.width, wa.height]);
  expect(wb.fg).toEqual(wa.fg);
  expect(wb.wall).toEqual(wa.wall);
  expect(wb.half).toEqual(wa.half);
  expect(wb.liquid).toEqual(wa.liquid);
  expect(wb.liquidType).toEqual(wa.liquidType);
  expect(wb.frozen).toEqual(wa.frozen);
  expect(b.weatherOverride).toEqual(a.weatherOverride);
  expect([...wb.chests]).toEqual([...wa.chests]);
  expect(wb.unlocked).toEqual(wa.unlocked);
  expect(wb.keysUsed).toBe(wa.keysUsed);
  expect(dropsOf(b)).toEqual(dropsOf(a));
  expect(b.bossesDefeated).toEqual(a.bossesDefeated);
  expect(b.kills).toEqual(a.kills);
  expect(b.peaceful).toBe(a.peaceful);
  expect(b.time).toBe(a.time);
  expect(b.tick).toBe(a.tick);
  expect(settleOf(b)).toEqual(settleOf(a));
  expect(b.folk.toJSON()).toEqual(a.folk.toJSON());
  expect(b.quests.toJSON()).toEqual(a.quests.toJSON());
  expect(b.scoutMarks).toEqual(a.scoutMarks);
  expect(b.perkDays).toEqual(a.perkDays);
  expect([...b.scouted]).toEqual([...a.scouted]);
  expect([...b.minedIce]).toEqual([...a.minedIce]);
  expect(b.rngState()).toEqual(a.rngState());
  if (o.visit === false) return;
  // visit
  expect(b.player.x).toBe(a.player.x);
  expect(b.player.y).toBe(a.player.y);
  expect(b.player.vx).toBe(a.player.vx);
  expect(b.player.vy).toBe(a.player.vy);
  expect(b.bed).toEqual(a.bed);
  expect(b.settle.spawnCore).toBe(a.settle.spawnCore);
  expect(b.explored.encode()).toEqual(a.explored.encode());
  expect(b.markers).toEqual(a.markers);
  expect(b.discovery.toJSON()).toEqual(a.discovery.toJSON());
  expect(b.breath).toBe(a.breath);
  expect(b.burning).toBe(a.burning);
  expect(b.honeyT).toBe(a.honeyT);
}
