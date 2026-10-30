// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GUILD_SWITCH } from '../data/guild';
import { GUILD_TEXT } from '../data/guild.zh-TW';
import { guildHandle } from './debugGuild';

/**
 * Guild quests PR B: the board's switch is on the debug handle so the e2e can open the board before PR D turns it on. Like
 * the roster's (PR C review L1), it is a dev build's only (the e2e runs the Astro dev server), never a production one.
 */
describe('the debug handle and the guild board (guild quests PR B)', () => {
  it("the board's switch is a dev build's only", () => {
    expect(guildHandle(false)).toEqual({});
    expect(guildHandle(true).guild?.GUILD_SWITCH).toBe(GUILD_SWITCH);
    expect(guildHandle(true).guild?.GUILD_TEXT).toBe(GUILD_TEXT);   // the e2e measures the detail with PR C's longest note
  });

  it('main.ts hands it out through import.meta.env.DEV alone', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'main.ts'), 'utf8');
    expect(src).toMatch(/\.\.\.guildHandle\(import\.meta\.env\.DEV\)/);
    expect(src).not.toMatch(/guild:\s*\{\s*GUILD_SWITCH/);
  });
});
