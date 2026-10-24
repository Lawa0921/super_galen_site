// legacyFixture11.ts — 1b M1 的「正式尺寸 v7」測試場景：format 11、GEN_VERSION 7、舊生成器、正式尺寸 4200×1200。
// 凍結出的 __fixtures__/format11-v7.delve 由 worldSave.v11v7.freeze.test.ts 產生，Task 16（舊世界烘焙）用它證明「玩家改動保留」。
// 全部確定：常數座標、不用亂數。
import { resolve } from 'node:path';
import { DelveGame } from '../engine/game';
import { T } from '../engine/tiles';
import { FIXED_DT, WORLD_W } from '../engine/constants';
import { SEA_W } from '../engine/legacy/chunkgen';
import type { Stack } from '../engine/inventory';

export const FIXTURE11_SEED = 'fixture-v11';
export const FIXTURE11_PATH = resolve(process.cwd(), 'src/scripts/games/delve/save/__fixtures__/format11-v7.delve');
export const FIXTURE11_WHO = { id: 'fixture-char', nick: '旅人', createdAt: 1, rev: 1 };
export const FIXTURE11_WHERE = { worldId: 'fixture-world', worldName: 'fixture-v11', visits: {} };

const CHEST_X = 2055;
const EAST_X = WORLD_W + SEA_W + 300; // 東外圍 v1 陸地段（海之後）
const WEST_X = -700;                  // 西外圍陸地

const CENTRAL_SURFACE = 229; // 中央 x=2050..2060 的地表 y（種子 fixture-v11 的舊生成器，測試會驗證）
const centralDug: [number, number][] = [];
for (let x = 2050; x <= 2060; x++) for (let y = CENTRAL_SURFACE - 3; y <= CENTRAL_SURFACE; y++) if (!(x === CHEST_X && y === CENTRAL_SURFACE)) centralDug.push([x, y]);

/**
 * buildLegacyFixture11 做的改動的確切座標與內容（凍結常數；Task 16 驗「改動保留」）。
 * dug 只含真的是 AIR 的格（箱子那格不在其中）；planks 是 PLANKS；箱子在 (chest.x, chest.y)。
 */
export const FIXTURE11_EDITS: Readonly<{
  dug: readonly (readonly [x: number, y: number])[];
  planks: readonly (readonly [x: number, y: number])[];
  chest: Readonly<{ x: number; y: number; items: readonly Stack[] }>;
}> = Object.freeze({
  dug: Object.freeze([...centralDug, [WEST_X, 243] as const]),
  planks: Object.freeze([0, 1, 2, 3, 4].map((i) => [EAST_X + i, 305] as const)),
  chest: Object.freeze({
    x: CHEST_X, y: CENTRAL_SURFACE,
    items: Object.freeze([
      { item: 'copper_coin', count: 37 },
      { item: 'silver_bow', count: 1, gear: { rarity: 3, ilvl: 3, plus: 1, affixes: [{ id: 'keen', tier: 3, value: 12 }] } },
    ] as Stack[]),
  }),
});

export function buildLegacyFixture11(): DelveGame {
  const g = new DelveGame({ seed: FIXTURE11_SEED, peaceful: true });
  const w = g.world;
  g.drainAll();
  // 中央 x=2050..2060：地表以上 3 格到地表挖空，放一個箱子（地表那格 = 箱子所在）
  for (let x = 2050; x <= 2060; x++) g.ensureAround(x);
  for (let x = 2050; x <= 2060; x++) {
    const s = w.surfaceAt(x);
    if (s !== CENTRAL_SURFACE) throw new Error(`fixture11: surface(${x}) = ${s}`);
    for (let y = s - 3; y <= s; y++) w.setFg(x, y, T.AIR);
  }
  const { x: cx, y: cy } = FIXTURE11_EDITS.chest;
  w.setFg(cx, cy, T.CHEST);
  const slots = w.chests.get(w.idx(cx, cy));
  if (!slots) throw new Error('fixture11: chest slots missing');
  FIXTURE11_EDITS.chest.items.forEach((st, k) => { slots[k] = structuredClone(st); });

  // 東外圍：5 格木板
  g.ensureAround(EAST_X + 10);
  for (const [x, y] of FIXTURE11_EDITS.planks) w.setFg(x, y, T.PLANKS);

  // 西外圍：挖一格地表
  g.ensureAround(WEST_X);
  const [wx, wy] = FIXTURE11_EDITS.dug[FIXTURE11_EDITS.dug.length - 1];
  w.setFg(wx, wy, T.AIR);

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
