// legacyFixture.ts — 測試用場景：把「拆存檔」要動到的每個欄位都填上確定值，序列化成 format-9 存檔。
// 凍結出的 __fixtures__/format9.delve 由 legacyFixture.freeze.test.ts 在 format 改動「之前」產生，之後用來證明遷移無損。
// 全部確定：不用 Math.random，時間 / 種子 / 位置都是常數。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DelveGame } from '../engine/game';
import { MAX_BREATH } from '../engine/game';
import { T, W } from '../engine/tiles';
import { FIXED_DT } from '../engine/constants';
import { buildHouse } from '../engine/houseFixture';

export const FIXTURE_NOW = 1_760_000_000_000;
export const FIXTURE_SEED = 'fixture-v9';
export const FIXTURE_SIZE = { width: 200, height: 100 };
export const FIXTURE_CHEST = { x: 56, y: 58 };
const GROUND = 60;

export function buildLegacyFixtureGame(): DelveGame {
  const g = new DelveGame({ seed: FIXTURE_SEED, ...FIXTURE_SIZE, peaceful: true });
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) { w.setFg(x, y, y >= GROUND ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); w.setLiquid(x, y, 0, 0); }
  g.teleport(60, GROUND - 1);
  g.setDate({ hour: 12 });
  for (let i = 0; i < 5; i++) g.step(FIXED_DT);
  g.drainEvents();

  // 角色
  g.setAppearance({ ...g.appearance, race: 3 }); // 貓族
  g.giveGear('gold_sword', 4, { affixes: [{ id: 'blazing', tier: 5, value: 30 }], plus: 3 });
  g.toggleLock(g.inventory.slots.findIndex((s) => s?.item === 'gold_sword'));
  g.giveGear('iron_chestplate', 2, { affixes: [{ id: 'stout', tier: 2, value: 3 }] });
  g.equipFromInventory(g.inventory.slots.findIndex((s) => s?.item === 'iron_chestplate'));
  g.give('torch', 23);
  g.vanity.set('body', 'sailor_top');
  g.levels.gain(500);
  g.giveBuff('bless');
  g.fishLog = { silver_minnow: 3 };
  g.observeGear();
  g.undyingCd = 42;
  g.hp = 63.5;

  // 世界
  buildHouse(w, 50, GROUND - 6, 8, 5);
  g.give('hearth', 1);
  const hi = g.inventory.slots.findIndex((s) => s?.item === 'hearth');
  g.inventory.swap(hi, 0);
  g.selectSlot(0);
  if (!g.tryPlace(60, GROUND - 1)) throw new Error('fixture: hearth placement failed');
  if (!g.setSpawnCore(g.settle.cores[0].id)) throw new Error('fixture: setSpawnCore failed');
  w.setFg(FIXTURE_CHEST.x, FIXTURE_CHEST.y, T.CHEST);
  const ci = FIXTURE_CHEST.y * w.width + FIXTURE_CHEST.x;
  const slots = w.chests.get(ci);
  if (!slots) throw new Error('fixture: chest slots missing');
  slots[0] = { item: 'copper_coin', count: 37 };
  slots[1] = { item: 'silver_bow', count: 1, gear: { rarity: 3, ilvl: 3, plus: 1, affixes: [{ id: 'keen', tier: 3, value: 12 }] } };
  g.kills = { gel_blob: 4 };

  // visit
  g.toggleMarker(70, 50);
  g.toggleMarker(80, 40);
  g.explored.revealDisc(100, 50, 12);
  g.breath = MAX_BREATH - 3;
  g.teleport(64, GROUND - 1);
  return g;
}

/** 凍結檔路徑（vitest 的 jsdom 環境下 import.meta.url 不是 file: URL，所以從 repo 根目錄解析） */
export const FIXTURE_PATH = resolve(process.cwd(), 'src/scripts/games/delve/save/__fixtures__/format9.delve');

export function readLegacyFixture(): Uint8Array {
  return readFileSync(FIXTURE_PATH);
}
