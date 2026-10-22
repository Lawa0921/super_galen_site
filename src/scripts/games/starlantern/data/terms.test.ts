// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHARACTERS, CHARACTER_IDS } from './characters';
import { NPC_NAMES, STORY } from './story.zh-TW';
import { SCENE_IDS } from './story/scenes';

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

  it('banned forms stay out of the game text', () => {
    // Style bible §4.2's 「不要寫成」 column, §4.3, and the Taiwanese forms of story polish ruling 8 (菁英, 回復).
    const BANNED: (string | RegExp)[] = [
      '盧米亞', '露米婭', '星之燈', '星燈塔', '星燈地城', '黃昏之霧', '暮色霧氣', '傳送廣場', '門前廣場', '月光旅館', '冒險公會', '鐵匠鋪',
      '雜貨店', '碎片市場', '記憶結晶', '記憶水晶', '失憶名冊', '靜之鐘會', '寂鐘會', '守鐘人', '艾斯特拉城', '食燈獸', '燈食之獸', '守燈者',
      /(?<!點)燈守(?!夜)/, '燈之鑰', '回城燈', '藥水', '回歸者', '空殼人', '破鐘之刺客', '冰原', '火山',
      '精英', '恢復', '視頻', '信息', '質量', '土豆', '靠譜', '給力', '大丈夫', '歐尼醬',
    ];
    // the gate catches what it guards, and lets the compound through
    expect(/(?<!點)燈守(?!夜)/.test('守燈人不叫燈守')).toBe(true);
    expect(/(?<!點)燈守(?!夜)/.test('他點燈守夜')).toBe(false);
    const found = sourceTexts().flatMap(({ file, text }) =>
      BANNED.filter((b) => (typeof b === 'string' ? text.includes(b) : b.test(text))).map((b) => `${file}: ${String(b)}`));
    expect(found).toEqual([]);
  });

  it('past figures speak to her as 妳', () => {
    // A woman's memories: what the narrator quotes the past saying to her; her handbook page's quotes (story polish ruling 8).
    const out: string[] = [];
    const quotes = (t: string): string[] => [...t.matchAll(/「([^」]*)」/g)].map((m) => m[1]);
    for (const c of CHARACTER_IDS.filter((id) => id !== 'hero')) {
      for (const id of SCENE_IDS.filter((s) => s.startsWith(`mem:${c}:`))) {
        for (const l of STORY.scenes[id].lines) if (l.who === 'narrator') for (const q of quotes(l.text)) if (q.includes('你')) out.push(`${id}: ${q}`);
      }
      for (const [i, t] of STORY.people[c].entries()) for (const q of quotes(t)) if (q.includes('你')) out.push(`people.${c}.${i}: ${q}`);
    }
    expect(out).toEqual([]);
  });
});
