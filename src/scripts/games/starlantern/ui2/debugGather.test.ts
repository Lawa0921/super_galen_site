// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GATHER_SWITCH } from '../data/gather';
import { GATHER_TEXT } from '../data/gather.zh-TW';
import { gatherHandle } from './debugGather';

/**
 * Gathering plan ruling 12: the switch is on the debug handle so the e2e can measure the screens before PR D turns it on. As
 * the guild's and the roster's, a dev build's only (the e2e runs the Astro dev server), never a production one.
 */
describe('the debug handle and gathering (gathering plan Task B1)', () => {
  it("gathering's switch is a dev build's only", () => {
    expect(gatherHandle(false)).toEqual({});
    expect(gatherHandle(true).gather?.GATHER_SWITCH).toBe(GATHER_SWITCH);
    expect(gatherHandle(true).gather?.GATHER_TEXT).toBe(GATHER_TEXT);
  });

  it('main.ts hands it out through import.meta.env.DEV alone', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'main.ts'), 'utf8');
    expect(src).toMatch(/\.\.\.gatherHandle\(import\.meta\.env\.DEV\)/);
    expect(src).not.toMatch(/gather:\s*\{\s*GATHER_SWITCH/);
  });
});
