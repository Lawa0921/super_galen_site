// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from './characters';
import { NPC_NAMES } from './story.zh-TW';

/** The starlantern folder: this file sits in its `data/`. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every source file the player's words can come from (story polish Task 2): each `.ts` under `data/`, `ui2/` and `engine/`
 * that is not a test, with its path from the starlantern folder. Task 4 and Task 15 add their checks over the same texts.
 */
function sourceTexts(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push({ file: relative(ROOT, path).replace(/\\/g, '/'), text: readFileSync(path, 'utf8') });
    }
  };
  for (const top of ['data', 'ui2', 'engine']) walk(join(ROOT, top));
  return out;
}

/** Misspellings of the cast's names, as they have turned up or easily could (audit A4, A5). */
const NAME_TYPOS = [
  '諾艾爾', '鮑比', '波波', '莉絲', '莉姿', '絲佳蕾', '絲嘉麗', '希爾維', '席爾薇', '莎菲娜', '沙菲拉', '賽蕾', '塞蕾',
  '羅恩', '洛因', '葛蘭', '多朗', '瑪沙', '歐力克',
];

describe('terms (story polish)', () => {
  it('names are spelled as CHARACTERS and NPC_NAMES spell them', () => {
    const real = [...Object.values(CHARACTERS).map((c) => c.name), ...Object.values(NPC_NAMES)];
    for (const typo of NAME_TYPOS) expect(real, typo).not.toContain(typo);   // the list never bans a real name
    const texts = sourceTexts();
    expect(texts.length).toBeGreaterThan(50);
    expect(texts.some((t) => t.file === 'data/gear.ts')).toBe(true);
    expect(texts.some((t) => t.file.endsWith('.test.ts'))).toBe(false);
    const found = texts.flatMap(({ file, text }) => NAME_TYPOS.filter((typo) => text.includes(typo)).map((typo) => `${file}: ${typo}`));
    expect(found).toEqual([]);
  });
});
