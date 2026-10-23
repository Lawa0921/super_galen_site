// legacyFixture11.ts — 1b M1 的「正式尺寸 v7」測試場景：format 11、GEN_VERSION 7、舊生成器、正式尺寸 4200×1200。
// 凍結出的 __fixtures__/format11-v7.delve 由 worldSave.v11v7.freeze.test.ts 產生，Task 16（舊世界烘焙）用它證明「玩家改動保留」。
// 全部確定：常數座標、不用亂數。
import { resolve } from 'node:path';
import { DelveGame } from '../engine/game';
import { T } from '../engine/tiles';
import { FIXED_DT, WORLD_W } from '../engine/constants';
import { SEA_W } from '../engine/chunkgen';
import type { Stack } from '../engine/inventory';

export const FIXTURE11_SEED = 'fixture-v11';
export const FIXTURE11_PATH = resolve(process.cwd(), 'src/scripts/games/delve/save/__fixtures__/format11-v7.delve');
export const FIXTURE11_WHO = { id: 'fixture-char', nick: '旅人', createdAt: 1, rev: 1 };
export const FIXTURE11_WHERE = { worldId: 'fixture-world', worldName: 'fixture-v11', visits: {} };

const CHEST_X = 2055;
const EAST_X = WORLD_W + SEA_W + 300; // 東外圍 v1 陸地段（海之後）
const WEST_X = -700;                  // 西外圍陸地

/** buildLegacyFixture11 做的改動的確切座標與內容（Task 16 驗「改動保留」）。座標在 build 時定下，之後只讀。 */
export const FIXTURE11_EDITS: {
  dug: [x: number, y: number][];
  planks: [x: number, y: number][];
  chest: { x: number; y: number; items: Stack[] };
} = {
  dug: [],
  planks: [],
  chest: {
    x: CHEST_X, y: 0, // y 於 build 時填入
    items: [
      { item: 'copper_coin', count: 37 },
      { item: 'silver_bow', count: 1, gear: { rarity: 3, ilvl: 3, plus: 1, affixes: [{ id: 'keen', tier: 3, value: 12 }] } },
    ],
  },
};

export function buildLegacyFixture11(): DelveGame {
  const g = new DelveGame({ seed: FIXTURE11_SEED, peaceful: true });
  const w = g.world;
  g.drainAll();
  const edits = FIXTURE11_EDITS;
  edits.dug.length = 0; edits.planks.length = 0;

  // 中央 x=2050..2060：地表以上 3 格到地表挖空，放一個箱子
  for (let x = 2050; x <= 2060; x++) g.ensureAround(x);
  for (let x = 2050; x <= 2060; x++) {
    const s = w.surfaceAt(x);
    for (let y = s - 3; y <= s; y++) { w.setFg(x, y, T.AIR); edits.dug.push([x, y]); }
  }
  const cy = w.surfaceAt(CHEST_X);
  w.setFg(CHEST_X, cy, T.CHEST);
  const slots = w.chests.get(w.idx(CHEST_X, cy));
  if (!slots) throw new Error('fixture11: chest slots missing');
  edits.chest.y = cy;
  edits.chest.items.forEach((s, i) => { slots[i] = structuredClone(s); });

  // 東外圍：5 格木板（落在地表上方一格）
  g.ensureAround(EAST_X + 10);
  for (let x = EAST_X; x < EAST_X + 5; x++) {
    const y = w.surfaceAt(x) - 1;
    w.setFg(x, y, T.PLANKS);
    edits.planks.push([x, y]);
  }

  // 西外圍：挖一格地表
  g.ensureAround(WEST_X);
  const wy = w.surfaceAt(WEST_X);
  w.setFg(WEST_X, wy, T.AIR);
  edits.dug.push([WEST_X, wy]);

  // 傳送碑 1 與 −1
  for (const id of [1, -1]) {
    if (!g.waystones.byId(id)) throw new Error(`fixture11: waystone ${id} missing`);
    g.stonesUnlocked.add(id);
  }

  // 玩家到東外圍陸地走 30 步，讓那段地區被發現
  const px = EAST_X + 10;
  g.ensureAround(px);
  g.teleport(px, w.surfaceAt(px) - 1);
  g.setMoveX(1);
  for (let i = 0; i < 30; i++) g.step(FIXED_DT);
  g.setMoveX(0);
  g.drainAll();
  return g;
}
