// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHARACTERS, CHARACTER_IDS } from './characters';
import { NPC_NAMES, STORY } from './story.zh-TW';
import { SCENE_IDS } from './story/scenes';
import { dots, opensOnDots, telegraphBreaks } from './story/voiceGates';
import { T } from './text.zh-TW';
import { SPECIALS } from './gear';

/** The starlantern folder: this file sits in its `data/`. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The site's pages that host the game (their titles and loading words are the player's too). */
const PAGES = join(ROOT, '..', '..', '..', 'pages', 'games');

/**
 * Every source file the player's words can come from (story polish Task 2; widened in Task 5): each `.ts` under `data/`,
 * `ui2/`, `engine/`, `render/`, `ui/` and `audio/` that is not a test, and the game's pages `src/pages/games/starlantern*.astro`,
 * with its path from the starlantern folder (a page: from `src/`). Task 4 and Task 15 add their checks over the same texts.
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
  for (const top of ['data', 'ui2', 'engine', 'render', 'ui', 'audio']) walk(join(ROOT, top));
  for (const name of readdirSync(PAGES)) {
    if (/^starlantern.*\.astro$/.test(name)) out.push({ file: `pages/games/${name}`, text: readFileSync(join(PAGES, name), 'utf8') });
  }
  return out;
}

/**
 * What the player reads outside the script (story depth Task 19; widened in Task 20 once 8h was merged, so no key of `T` is
 * left out): every string of `T`, every template of `T` called with stand-in words (a three-character name, the number
 * 345, `true`; a call that needs an object is skipped), each scene's title as the handbook and the scene plate show it, and
 * each special's lore.
 */
function uiSentences(): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  const walk = (v: unknown, path: string): void => {
    if (typeof v === 'string') { out.push({ key: path, text: v }); return; }
    if (typeof v === 'function') {
      for (const arg of ['某某某', 345, true]) {
        try {
          const r: unknown = (v as (...a: unknown[]) => unknown)(...Array(Math.max(1, v.length)).fill(arg));
          if (typeof r === 'string' && !/undefined|object|NaN/.test(r)) out.push({ key: `${path}(${typeof arg})`, text: r });
          if (Array.isArray(r)) r.forEach((x, i) => { if (typeof x === 'string') out.push({ key: `${path}(${typeof arg}).${i}`, text: x }); });
        } catch { /* a template that needs an object */ }
      }
      return;
    }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}.${i}`)); return; }
    if (v && typeof v === 'object' && !(v instanceof RegExp)) for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(T, 'T');
  for (const id of SCENE_IDS) out.push({ key: `STORY.scenes.${id}.title`, text: STORY.scenes[id].title });
  // Story staging S6: a scene's location cards are interface text too.
  for (const id of SCENE_IDS) STORY.scenes[id].lines.forEach((l, i) => { if (l.place) out.push({ key: `STORY.scenes.${id}.lines.${i}.place`, text: l.place.text }); });
  for (const s of Object.values(SPECIALS)) out.push({ key: `SPECIALS.${s.id}.lore`, text: s.lore ?? '' });
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
    for (const top of ['render/', 'ui/', 'audio/']) expect(texts.some((t) => t.file.startsWith(top)), top).toBe(true);
    expect(texts.map((t) => t.file)).toContain('pages/games/starlantern.astro');
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

  it('interface sentences open on no 「……」 and say no 「還有。」 but Rin\'s own cue (story depth Task 19)', () => {
    // The source, so templates count too: no quote and no literal opens on 「……」.
    for (const file of ['data/text.zh-TW.ts', 'data/gear.ts']) {
      const text = sourceTexts().find((t) => t.file === file)!.text;
      expect(text.match(/「……/g) ?? [], file).toEqual([]);
      expect(text.match(/['`]……/g) ?? [], file).toEqual([]);
      // 「還有。」 is retired from her lines (story polish ruling 3), but it stays the name of her mechanic's moment (plan 8
      // ruling a): the cue that pops when she fells her mark, and its log line. Nothing else says it.
      const again = text.split('\n').filter((l) => l.includes('還有。'));
      expect(again.every((l) => /again/.test(l)), again.join('\n')).toBe(true);
      expect(again.length, file).toBe(file === 'data/text.zh-TW.ts' ? 2 : 0);
    }
    expect(T.mech.cue.again).toBe('還有。');
  });

  it('the interface\'s sentences read as whole sentences, the story text it shows too (story depth Task 19)', () => {
    const out: string[] = [];
    for (const { key, text } of uiSentences()) {
      if (key === 'T.mech.cue.again') continue;   // Rin's 「還有。」, the name of her mechanic's moment (test above)
      for (const why of telegraphBreaks(text)) out.push(`${key}: ${why}: ${text}`);
      if (dots(text) > 1) out.push(`${key}: two 「……」: ${text}`);
      if (opensOnDots(text)) out.push(`${key}: opens on 「……」: ${text}`);
    }
    expect(out).toEqual([]);
    // the walk reaches what the player reads: notices, the handbook, a scene's title, a gear's lore
    const keys = uiSentences().map((s) => s.key);
    for (const k of ['T.notices.wipe', 'T.ui2.handbook.empty', 'T.ui2.equip.full', 'STORY.scenes.rin-reveal.title', 'SPECIALS.lg-noel.lore', 'STORY.scenes.prologue-inn.lines.0.place']) expect(keys, k).toContain(k);
    // Task 20: 8h's keys, the inn's tail, templates and strings with no full stop are read too
    for (const k of ['T.rune.fuseEmpty', 'T.ui2.builds.followingNow', 'T.ui2.inn.nobodyDown', 'T.rune.got(string)', 'T.ui2.exchange.giveAsk(string)', 'T.ui2.formation.title']) expect(keys, k).toContain(k);
  });

  it("a townsperson's fragment goes back to 本人, she or he (story depth Task 19)", () => {
    // Anna and Marta are women: the exchange never says 他 of the owner.
    expect(T.ui2.exchange.giveAsk('瑪莎的記憶碎片')).not.toMatch(/他|她/);
    expect(T.ui2.exchange.giveAsk('瑪莎的記憶碎片')).toContain('瑪莎的記憶碎片');
    expect(T.ui2.exchange.giveFail.invalid).not.toMatch(/他|她/);
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
