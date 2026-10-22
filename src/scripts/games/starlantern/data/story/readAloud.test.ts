import { writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { dumpStory, readAloud } from './readAloud';

describe('readAloud (story polish Task 3)', () => {
  it("prints a scene's readings with plates", () => {
    const out = readAloud(['scenes.prologue-inn.']);
    expect(out).toContain('［輕］');
    expect(out).toContain('凜：「我什麼都不記得');
    const narration = out.split('\n').filter((l) => l.includes('發青的指痕'));
    expect(narration).toHaveLength(1);
    expect(narration[0].startsWith('她手腕上')).toBe(true);   // the narrator's line has no plate before it
    expect(out).not.toContain('scenes.first-return');           // only what the prefixes ask for
  });

  it('prints a meeting with the stranger plate', () => {
    const out = readAloud(['meet.selene.']);
    expect(out).toContain('？？？：');
    expect(out).toContain('瑟蕾：「謝謝各位');   // from the line where she says her name
    expect(out).toContain('凜：');
  });

  it('prints each reading of a scene once, heavy scenes marked, and a header with the counts', () => {
    const out = readAloud(['scenes.mem:liz:5.']);
    expect(out).toContain('［重］');
    expect(out.match(/^### 讀法/gm)).toHaveLength(2);
    expect(out).toContain('歐里克：「妳出門那天');
    expect(out).toMatch(/「……」：\d+／\d+/);
    expect(out).toContain('助詞');
  });

  it('prints the pools that are not scenes, each row with its plate', () => {
    const out = readAloud(['people.rin.', 'townLines.', 'rinOath.', 'greet.guild.']);
    expect(out).toContain('people.rin');
    expect(out).toContain('townLines');
    expect(out).toMatch(/^rinOath\.0　凜：/m);
    expect(out).toMatch(/^greet\.guild\.prologue\.0　安娜：/m);
    expect(out).toMatch(/^people\.rin\.0　凜。/m);   // a handbook page has no plate
  });

  it('prints a whole scene when a prefix names one of its keys, and meetings in the order they are met', () => {
    const one = readAloud(['scenes.prologue-inn.lines.3']);
    expect(one).toContain('## scenes.prologue-inn');
    expect(one).toContain('發青的指痕');   // a line the prefix did not name
    const all = readAloud(['meet.']);
    const at = (id: string) => all.indexOf(`## meet.${id} `);
    const order = ['selene', 'chizuru', 'safira', 'sylvie', 'noel', 'bobby', 'liz', 'scarlet'].map(at);
    for (const i of order) expect(i).toBeGreaterThanOrEqual(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('writes the dump when STORY_DUMP is set', () => {
    const write = vi.fn();
    expect(dumpStory({}, write)).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(dumpStory({ STORY_DUMP: 'out.md', STORY_DUMP_KEYS: 'scenes.prologue-inn.,meet.selene.' }, write)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe('out.md');
    expect(write.mock.calls[0][1]).toBe(readAloud(['scenes.prologue-inn.', 'meet.selene.']));
    // the real run (R2 and R6 of each rewrite): writes only when asked
    dumpStory(process.env, (path, text) => writeFileSync(path, text, 'utf8'));
  });
});
