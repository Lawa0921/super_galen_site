// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROSTER_ART, ROSTER_LIVE } from '../data/monsters';
import { rosterHandle } from './debugRoster';

/**
 * PR C review L1: the roster's switches on the debug handle let a console turn on unreleased foes, so they are a dev
 * build's only (the e2e runs the Astro dev server, tests/e2e/support/server.mjs), never a production one.
 */
describe('the debug handle and the roster (PR C review L1)', () => {
  it("the roster switches are a dev build's only", () => {
    expect(rosterHandle(false)).toEqual({});
    const dev = rosterHandle(true);
    expect(dev.roster?.ROSTER_ART).toBe(ROSTER_ART);
    expect(dev.roster?.ROSTER_LIVE).toBe(ROSTER_LIVE);
  });

  it('main.ts hands them out through import.meta.env.DEV alone', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'main.ts'), 'utf8');
    expect(src).toMatch(/\.\.\.rosterHandle\(import\.meta\.env\.DEV\)/);
    expect(src).not.toMatch(/roster:\s*\{\s*ROSTER_ART/);
  });
});
