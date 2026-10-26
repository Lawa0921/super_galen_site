import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORY } from '../story.zh-TW';

/**
 * Bond plan Task 0 (spec §0 D7): the finale and the festival (`epilogue`) are written and cold-read; the bond work adds
 * scenes around them and never touches a word of either. Their lines and summaries are recorded here before that work
 * starts, and every later task must leave them equal. No task of the bond plan may record this again: a new recording
 * means the finale or the festival changed (NEEDS_CONTEXT). `FROZEN_SCENES_RECORD=1` writes the fixture; otherwise the
 * scenes must equal it, and a missing fixture fails.
 */
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'frozen-scenes.json');

const frozen = () => ({
  finale: { lines: STORY.scenes.finale.lines, summary: STORY.scenes.finale.summary },
  epilogue: { lines: STORY.scenes.epilogue.lines, summary: STORY.scenes.epilogue.summary },
});

describe('frozen scenes', () => {
  it('the finale and the festival are untouched', () => {
    const now = JSON.parse(JSON.stringify(frozen(), null, 2));
    if (process.env.FROZEN_SCENES_RECORD === '1') {
      if (!existsSync(dirname(FIXTURE))) mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, `${JSON.stringify(frozen(), null, 2)}\n`);
    }
    expect(existsSync(FIXTURE), `missing ${FIXTURE}; record it once with FROZEN_SCENES_RECORD=1`).toBe(true);
    expect(now).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')));
  });
});
