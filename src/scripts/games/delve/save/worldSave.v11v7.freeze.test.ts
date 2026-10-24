// 只在 DELVE_FREEZE_FIXTURE=1 時寫檔：用「目前」的世界檔序列化器凍結 format-11 / genVersion-7 的正式尺寸 fixture（1b M1 烘焙前產生）。
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { WORLD_FORMAT, encodeWorld, saveSplitGame } from './worldSave';
import { GEN_VERSION } from '../engine/constants';
import { FIXTURE_NOW } from './legacyFixture';
import { FIXTURE11_PATH, FIXTURE11_WHO, FIXTURE11_WHERE, buildLegacyFixture11 } from './legacyFixture11';

it.runIf(process.env.DELVE_FREEZE_FIXTURE === '1')('freeze format-11 / v7 world fixture', () => {
  expect(WORLD_FORMAT).toBe(11); // 防呆：格式變了就不准再凍結
  expect(GEN_VERSION).toBe(7);
  const { world } = saveSplitGame(buildLegacyFixture11(), FIXTURE11_WHO, FIXTURE11_WHERE, FIXTURE_NOW);
  writeFileSync(FIXTURE11_PATH, encodeWorld(world));
}, 120_000);
