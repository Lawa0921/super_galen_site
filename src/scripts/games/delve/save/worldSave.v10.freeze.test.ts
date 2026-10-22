// 只在 DELVE_FREEZE_FIXTURE=1 時寫檔：用「目前」的世界檔序列化器凍結 format-10 fixture（升 format 11 之前產生）。
// 場景 = buildLegacyFixtureGame()（200×100：200 不是 32 的倍數，chunk 6 = x 192..223 跨出中央；payload 在 x ≥ 200 補 0）。
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { WORLD_FORMAT, encodeWorld, saveSplitGame } from './worldSave';
import { FIXTURE_NOW, buildLegacyFixtureGame } from './legacyFixture';

export const FIXTURE10_PATH = resolve(process.cwd(), 'src/scripts/games/delve/save/__fixtures__/format10.delve');
export const FIXTURE10_WHO = { id: 'fixture-char', nick: '旅人', createdAt: 1, rev: 1 };
export const FIXTURE10_WHERE = { worldId: 'fixture-world', worldName: 'fixture-v9', visits: {} };

it.runIf(process.env.DELVE_FREEZE_FIXTURE === '1')('freeze format-10 world fixture', () => {
  expect(WORLD_FORMAT).toBe(10); // 防呆：格式變了就不准再凍結
  const { world } = saveSplitGame(buildLegacyFixtureGame(), FIXTURE10_WHO, FIXTURE10_WHERE, FIXTURE_NOW);
  writeFileSync(FIXTURE10_PATH, encodeWorld(world));
});
