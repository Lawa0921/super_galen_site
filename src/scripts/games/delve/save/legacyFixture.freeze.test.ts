// 只在 DELVE_FREEZE_FIXTURE=1 時寫檔：用「目前」的序列化器凍結 format-9 fixture。
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { SAVE_FORMAT, serializeGame } from './serialize';
import { FIXTURE_NOW, FIXTURE_PATH, buildLegacyFixtureGame } from './legacyFixture';

it.runIf(process.env.DELVE_FREEZE_FIXTURE === '1')('freeze format-9 fixture', () => {
  expect(SAVE_FORMAT).toBe(9); // 防呆：格式變了就不准再凍結
  writeFileSync(FIXTURE_PATH, serializeGame(buildLegacyFixtureGame(), FIXTURE_NOW));
});
