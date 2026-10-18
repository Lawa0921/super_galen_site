import { describe, it, expect } from 'vitest';
import { CHARACTER_IDS } from '../characters';
import { ITEMS } from '../items';
import { MATERIALS } from '../materials';
import { REGIONS } from '../regions';
import { MEETINGS } from '../meetings';
import { numeral, STORY, PLACEHOLDERS, NPC_NAMES, MAX_LINE_CHARS, MEMORY_GUESTS, STORY_MOODS, linesWhen, type LineWhen, type ScriptLine } from '../story.zh-TW';
import { CHAINS, HERO_TOPUP, chainLength, whenHolds } from './chains';
import { TOWN_FRAGMENTS, shardGrade, isFragmentItem, fragmentName, SHARD_PRICE, SHARD_DROP, TOWN_DROP, PERKS, ABSORB_GAIN } from './fragments';
import { memoryPace } from '../../engine/story/expect';
import { ACT_DEPTHS, CHAT_COUNT, CHAT_GATE, SCENE_IDS, STAGES, MAJOR_SCENES, isSceneId, lineCap, memScene, sceneKind, type SceneId, type Stage } from './scenes';

const COMPANIONS = CHARACTER_IDS.filter((id) => id !== 'hero' && id !== 'rin');

describe('story data', () => {
  it('every chain is as long as the spec says', () => {
    expect(chainLength('hero')).toBe(10);
    expect(chainLength('rin')).toBe(7);
    for (const id of COMPANIONS) expect(chainLength(id)).toBe(5);
    expect(CHARACTER_IDS.reduce((n, id) => n + chainLength(id), 0)).toBe(57);
  });

  it("the story chains keep the spec's fixed points of depth", () => {
    // The pacing knobs (plan 6c Task 1) may move every other minDepth; these are the spec's and the user's.
    const hero = CHAINS.hero.pieces;
    expect(HERO_TOPUP).toEqual([{ depth: 25, to: 9 }, { depth: 30, to: 10 }]);
    expect(hero[8].bossOnly).toBe(true);
    expect(hero[9].bossOnly).toBe(true);
    expect([hero[8].minDepth, hero[9].minDepth]).toEqual(HERO_TOPUP.map((t) => t.depth));
    expect(hero.slice(0, 8).every((p) => !p.bossOnly)).toBe(true);
    // The hero's 8th piece drops before the depth-25 top-up could pay it together with the 9th.
    const heroPace = memoryPace('hero');
    expect(heroPace[7]).toBeGreaterThanOrEqual(19);
    expect(heroPace[7]).toBeLessThanOrEqual(23);
    const rin = CHAINS.rin.pieces;
    expect(rin[0].minDepth).toBe(1);   // her first piece waits in a glimmer on the first floor
    expect(rin[1].minDepth).toBe(3);   // spec §7.3: the depth-3 boss
    expect(rin[6].minDepth).toBeGreaterThan(ACT_DEPTHS.act3);
    expect(rin[6].minDepth).toBeLessThanOrEqual(25);
    expect(memoryPace('rin')[6]).toBeLessThanOrEqual(27);   // her choice can come before the finale
    expect(CHAINS.hero.key && CHAINS.rin.key).toBe(true);
  });

  it("a companion's last two pieces wait for depth 6, and no chain's depths go back", () => {
    for (const id of COMPANIONS) {
      const p = CHAINS[id].pieces;
      expect(p[3].minDepth).toBeGreaterThanOrEqual(6);
      expect(p[4].minDepth).toBeGreaterThanOrEqual(6);
      expect(CHAINS[id].key).toBe(false);
    }
    for (const id of CHARACTER_IDS) {
      const d = CHAINS[id].pieces.map((p) => p.minDepth);
      expect(d.every((x) => Number.isInteger(x) && x >= 1), id).toBe(true);
      expect(d, id).toEqual([...d].sort((a, b) => a - b));
    }
  });

  it('the hero and Rin drop only on the main road; every chain names a real region', () => {
    for (const id of ['hero', 'rin'] as const) for (const p of CHAINS[id].pieces) expect(p.regions).toEqual(['mainline']);
    for (const id of CHARACTER_IDS) {
      for (const p of CHAINS[id].pieces) {
        expect(p.regions.length).toBeGreaterThan(0);
        for (const r of p.regions) expect(REGIONS[r]).toBeDefined();
      }
    }
  });

  it('companion chains drop every piece from all of their regions, and gain the spec stat', () => {
    const spec: Record<string, { regions: string[]; gain: Record<string, number> }> = {
      selene: { regions: ['mainline', 'frost'], gain: { wil: 2 } }, chizuru: { regions: ['frost', 'mainline'], gain: { str: 2 } },
      safira: { regions: ['blaze'], gain: { agi: 2 } }, sylvie: { regions: ['mire'], gain: { agi: 2 } },
      noel: { regions: ['storm'], gain: { int: 2 } }, bobby: { regions: ['mainline', 'iron'], gain: { int: 2 } },
      liz: { regions: ['shade'], gain: { agi: 2 } }, scarlet: { regions: ['iron'], gain: { str: 2 } },
    };
    for (const [id, want] of Object.entries(spec)) {
      const chain = CHAINS[id as keyof typeof CHAINS];
      for (const p of chain.pieces) expect(p.regions).toEqual(want.regions);
      expect(chain.gain).toEqual(want.gain);
    }
    // Plan 6c Task 1 fallback (U2): the hero's earlier pieces made the depth-4 geared band too easy, so each is worth half.
    expect(CHAINS.hero.gain).toEqual({ str: 0.5, int: 0.5, agi: 0.5, wil: 0.5 });
    expect(CHAINS.rin.gain).toEqual({ agi: 2 });
  });

  it('the fragment tables match the brief', () => {
    expect(SHARD_PRICE).toEqual({ dim: 30, clear: 80, vivid: 200 });
    expect(SHARD_DROP).toEqual({ boss: 1, elite: 0.5, chest: 0.08, vault: 0.5 });
    expect(TOWN_DROP).toEqual({ boss: 0.25, elite: 0.15, chest: 0.03, vault: 0.2 });
    expect(PERKS).toEqual({ shopDiscountPct: 10, meal: { stat: 'def', pct: 5 }, shardPriceMul: 1.25, setRecipeLess: 2 });
    expect(ABSORB_GAIN.dim).toEqual({ hp: 6, tp: 2, atk: 1, def: 1, mag: 1, res: 1, spd: 1 });
    expect(ABSORB_GAIN.clear).toEqual({ hp: 12, tp: 4, atk: 2, def: 2, mag: 2, res: 2, spd: 2 });
    expect(ABSORB_GAIN.vivid).toEqual({ hp: 18, tp: 6, atk: 3, def: 3, mag: 3, res: 3, spd: 3 });
    const row = (id: string) => TOWN_FRAGMENTS.find((f) => f.id === id)!;
    expect(TOWN_FRAGMENTS.map((f) => f.id)).toEqual(['orik', 'marta', 'anna', 'glen', 'doran']);
    expect([row('orik').regions, row('orik').minDepth, row('orik').reward, row('orik').perk, row('orik').questHook]).toEqual([['shade'], 4, { gold: 300 }, 'shop-discount', 'orik-hat']);
    expect([row('marta').regions, row('marta').minDepth, row('marta').reward, row('marta').perk, row('marta').questHook]).toEqual([['mainline'], 5, { items: { phoenix: 2 } }, 'inn-meal', 'marta-diary']);
    expect([row('anna').regions, row('anna').minDepth, row('anna').reward, row('anna').perk, row('anna').questHook]).toEqual(['any', 8, { items: { 'star-tear': 1 } }, 'shard-price', 'anna-name']);
    expect([row('glen').regions, row('glen').minDepth, row('glen').reward, row('glen').perk, row('glen').questHook]).toEqual([['mainline'], 15, { gold: 500 }, 'portal-reroll', 'glen-first']);
    expect([row('doran').regions, row('doran').minDepth, row('doran').reward, row('doran').perk, row('doran').questHook]).toEqual([['iron'], 4, { items: { 'king-scale': 1 } }, 'set-recipe', 'doran-master']);
  });

  it('when always holds before the calendar exists', () => {
    const p = CHAINS.selene.pieces;
    expect(p[1].when?.moon).toEqual(['full']);
    expect(p[3].when?.moon).toEqual(['full']);
    expect(p[4].when?.moon).toEqual(['new']);
    for (const i of [1, 3, 4]) expect(whenHolds(p[i].when)).toBe(true);
    expect(whenHolds(undefined)).toBe(true);
  });

  it('the catalogue covers 57 memories, the acts, Rin, the finale, chats and returns', () => {
    expect(SCENE_IDS.filter((s) => s.startsWith('mem:')).length).toBe(57);
    const chats = CHARACTER_IDS.reduce((n, id) => n + CHAT_COUNT[id], 0);
    expect(SCENE_IDS.filter((s) => s.startsWith('chat:')).length).toBe(chats);
    expect(SCENE_IDS.filter((s) => s.startsWith('town:')).length).toBe(5);
    for (const s of ['prologue', 'act1-after', 'act2', 'act3', 'act4', 'rin-reveal', 'finale'] as const) expect(SCENE_IDS).toContain(s);
    expect(new Set(SCENE_IDS).size).toBe(SCENE_IDS.length);
    expect(memScene('rin', 3)).toBe('mem:rin:3');
    expect(MAJOR_SCENES.every((s) => sceneKind(s) === 'major')).toBe(true);
  });

  it('isSceneId rejects what the catalogue lacks', () => {
    for (const v of ['mem:hero:11', 'mem:rin:0', 'chat:noel:3', 'town:x', 'nope', 3, null]) expect(isSceneId(v)).toBe(false);
    for (const s of SCENE_IDS) expect(isSceneId(s)).toBe(true);
  });

  it('every scene has a title, a summary and lines', () => {
    const speakers = new Set<string>([...CHARACTER_IDS, ...Object.keys(NPC_NAMES), 'narrator']);
    expect(lineCap('act1-after')).toBe(3);
    expect(lineCap('mem:hero:9')).toBe(12);
    expect(lineCap('mem:rin:7')).toBe(12);
    expect(lineCap('mem:hero:1')).toBe(4);
    expect(lineCap('chat:noel:1')).toBe(3);
    expect(lineCap('town:orik')).toBe(8);
    expect(lineCap('act2')).toBe(12);
    for (const id of SCENE_IDS) {
      const sc = STORY.scenes[id];
      expect(sc.title.trim()).not.toBe('');
      expect(sc.summary.trim()).not.toBe('');
      expect(sc.summary).not.toMatch(/TODO/);
      expect(sc.lines.length).toBeGreaterThanOrEqual(1);   // the cap is checked on the lines that play, by the combination test below
      for (const l of sc.lines) {
        expect(l.text.trim()).not.toBe('');
        expect(l.text).not.toMatch(/TODO/);
        expect(speakers.has(l.who)).toBe(true);
      }
    }
  });

  it('every town fragment has a person, a story, a result and a quest hook', () => {
    expect(TOWN_FRAGMENTS.length).toBe(5);
    for (const f of TOWN_FRAGMENTS) {
      expect(f.item).toBe(`tf-${f.id}`);
      expect(f.npc.trim()).not.toBe('');
      expect(f.reward.gold !== undefined || Object.keys(f.reward.items ?? {}).length > 0).toBe(true);
      for (const it of Object.keys(f.reward.items ?? {})) expect(ITEMS[it] ?? MATERIALS[it]).toBeDefined();
      expect(STORY.town[f.id].lost.trim()).not.toBe('');
      expect(STORY.town[f.id].after.trim()).not.toBe('');
      expect(f.questHook.trim()).not.toBe('');
      expect(SCENE_IDS).toContain(`town:${f.id}`);
    }
  });

  it('every stage has town lines and every facility greets in every stage', () => {
    for (const st of STAGES) {
      expect(STORY.townLines[st].length).toBeGreaterThanOrEqual(3);
      for (const f of ['guild', 'shop', 'inn', 'gate', 'forge'] as const) expect(STORY.greet[f][st].length).toBeGreaterThanOrEqual(2);
      expect(STORY.truths[st].trim()).not.toBe('');
    }
    expect(STORY.absorb.length).toBeGreaterThanOrEqual(1);
    for (const id of CHARACTER_IDS) expect(STORY.people[id].length).toBe(3);
  });

  it('town lines and greetings start from the current copy (as literals, not references)', () => {
    expect(STORY.townLines.prologue.slice(0, 3)).toEqual(['暮霧又濃了些。冒險者們，今天要往哪裡去？', '聽說迷宮深處有星燈的光。', '補給品記得在出發前備齊。']);
    expect(STORY.greet.guild.act1).toEqual(['歡迎回來，要整頓隊伍嗎？', '今天也請平安歸來。']);
    expect(STORY.greet.forge.after).toEqual(['爐火正旺。要拆、要打，還是要重新鍛一回？', '帶素材來了嗎？好鐵配好手藝。']);
    expect(STORY.greet.guild.act1).not.toBe(STORY.greet.guild.act2);
  });

  it('shards deepen with depth', () => {
    for (const r of [0, 0.5, 0.99]) expect(shardGrade(1, r)).toBe('dim');
    expect(shardGrade(40, 0)).toBe('vivid');
    expect(shardGrade(8, 0.1)).toBe('clear');
  });

  it('fragment items are recognised and named', () => {
    expect(isFragmentItem('shard-dim')).toBe(true);
    expect(isFragmentItem('tf-anna')).toBe(true);
    expect(isFragmentItem('phoenix')).toBe(false);
    expect(fragmentName('shard-vivid')).toBe('鮮明的碎片');
    expect(fragmentName('tf-orik')).toBe(`${TOWN_FRAGMENTS[0].npc}的記憶碎片`);
    expect(fragmentName('phoenix')).toBeUndefined();
  });

  it('placeholders are registered', () => {
    expect(PLACEHOLDERS.size).toBeGreaterThan(0);
    expect(PLACEHOLDERS.has(STORY.scenes.prologue.lines[0].text)).toBe(true);
  });

  it("the finale's wait, Rin's oath lines, the bellkeeper and the merchant are story copy", () => {
    const texts = storyTexts();
    const keys = (prefix: string) => texts.filter((t) => t.key === prefix || t.key.startsWith(`${prefix}.`));
    expect(keys('finaleWait').length).toBeGreaterThanOrEqual(1);
    expect(keys('finaleWait').length).toBeLessThanOrEqual(2);
    expect(STORY.finaleWait.every((l) => l.who !== undefined && PLACEHOLDERS.has(l.text))).toBe(true);
    expect(keys('rinOath').length).toBe(STORY.rinOath.length);
    expect(STORY.rinOath.length).toBeGreaterThan(0);
    expect(keys('bellkeeper.oath').length).toBe(STORY.bellkeeper.oath.length);
    expect(keys('bellkeeper.after').length).toBe(STORY.bellkeeper.after.length);
    expect(STORY.bellkeeper.oath.length).toBeGreaterThan(0);
    expect(STORY.bellkeeper.after.length).toBeGreaterThan(0);
    expect(keys('merchant').map((t) => t.key).sort()).toEqual(['merchant.found', 'merchant.lost']);
    for (const t of [...keys('rinOath'), ...keys('bellkeeper'), ...keys('merchant'), ...keys('finaleWait')]) {
      expect(PLACEHOLDERS.has(t.text), t.key).toBe(true);
      expect(() => position(t.key), t.key).not.toThrow();
    }
    // Rin's oath lines and the bellkeeper's first lines are for after her choice; the wait is for act 4 at the earliest.
    expect(position('rinOath.0')).toBe(rinSeventh());
    expect(position('bellkeeper.oath.0')).toBe(rinSeventh());
    expect(position('bellkeeper.after.0')).toBe('after');
    expect(position('finaleWait.0.text')).toBe('act4');
  });

  it('the milestone cards and the survive line are story copy, found by the placeholder sweep', () => {
    for (const t of [STORY.survived, STORY.act1Card.title, STORY.act1Card.body, STORY.endingTitle]) expect(PLACEHOLDERS.has(t), t).toBe(true);
  });
});

// ---- The gates every line of the script must pass (plan 6c Task 2) ----

interface Text { key: string; text: string; line?: ScriptLine }
/** Every string leaf of STORY, keyed by its path; a scene line's text carries its ScriptLine. Skips who, mood, if and scene titles (interface labels). */
function storyTexts(): Text[] {
  const out: Text[] = [];
  const walk = (v: unknown, path: string[], line?: ScriptLine): void => {
    if (typeof v === 'string') { out.push({ key: path.join('.'), text: v, ...(line ? { line } : {}) }); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, [...path, String(i)])); return; }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const isLine = typeof o.who === 'string' && typeof o.text === 'string';
      for (const [k, x] of Object.entries(o)) {
        if (k === 'who' || k === 'mood' || k === 'if') continue;
        if (k === 'title' && path.length === 2 && path[0] === 'scenes') continue;
        walk(x, [...path, k], isLine && k === 'text' ? (o as unknown as ScriptLine) : undefined);
      }
    }
  };
  for (const [k, v] of Object.entries(STORY)) walk(v, [k]);
  return out;
}

/** The keys that are finished copy. Each entry is a prefix ending in "." or ":" (so `town.` never eats `townLines`) or one whole leaf key. */
const WRITTEN: string[] = [];
const writtenBy = (written: string[], key: string): boolean => written.some((w) => (/[.:]$/.test(w) ? key.startsWith(w) : key === w));
const isWritten = (key: string): boolean => writtenBy(WRITTEN, key);
// The WRITTEN-only gates are pure functions of their arrays, so they can be tested with an injected list while WRITTEN is empty.
/** Keys that are finished copy but still carry placeholder text. */
const placeholdersIn = (texts: Text[], written: string[], placeholders: ReadonlySet<string>): string[] =>
  texts.filter((t) => writtenBy(written, t.key) && placeholders.has(t.text)).map((t) => t.key);
/** WRITTEN entries that match no key at all (a typo would leave its placeholder gate inert), and prefixes that do not end at a separator. */
const strayEntries = (texts: Text[], written: string[]): string[] =>
  written.filter((w) => (/[.:]$/.test(w) ? !texts.some((t) => t.key.startsWith(w)) : !texts.some((t) => t.key === w)));
/** Spec quotes missing from a category that is entirely written (every key under the prefix, so narrower entries count too). */
const missingQuotes = (texts: Text[], written: string[], quotes: [string, string][]): string[] =>
  quotes.filter(([prefix, quote]) => {
    const under = texts.filter((t) => t.key.startsWith(prefix));
    return under.length === 0 || (under.every((t) => writtenBy(written, t.key)) && !under.some((t) => t.text.includes(quote)));
  }).map(([prefix, quote]) => `${prefix} ${texts.some((t) => t.key.startsWith(prefix)) ? `lacks 「${quote}」` : 'matches no key'}`);
/** The zh-TW typography rules a text breaks: Latin letters or digits, ASCII quotes, `...`, half-width `,!?:;` and half-width `. - ~ ( )`. */
const typographyBreaks = (text: string): string[] => [
  /[A-Za-z0-9]/, /["'`]/, /\.\.\./, /[,!?:;]/, /[.\-~()]/,
].filter((re) => re.test(text)).map((re) => String(re));

const stageIdx = (s: Stage): number => STAGES.indexOf(s);
const later = (a: Stage, b: Stage): Stage => (stageIdx(a) >= stageIdx(b) ? a : b);
/** The stage a mainline depth belongs to, built from ACT_DEPTHS and STAGES. */
function stageOf(d: number): Stage {
  if (d >= ACT_DEPTHS.act4) return 'act4';
  if (d >= ACT_DEPTHS.act3) return 'act3';
  if (d >= ACT_DEPTHS.act2) return 'act2';
  return d >= 2 ? 'act1' : 'prologue';
}
const rinSeventh = (): Stage => stageOf(CHAINS.rin.pieces[chainLength('rin') - 1].minDepth);
/** When a companion is first met: on the main road at her depth, else (another region) from the start. */
const metStage = (c: string): Stage => {
  const m = MEETINGS.find((x) => x.id === c);
  return m && m.region === 'mainline' ? stageOf(m.depth) : 'prologue';
};
const fragmentStage = (id: string): Stage => {
  const f = TOWN_FRAGMENTS.find((x) => x.id === id)!;
  return Array.isArray(f.regions) && f.regions.length === 1 && f.regions[0] === 'mainline' ? stageOf(f.minDepth) : 'prologue';
};
const isStage = (v: string): v is Stage => (STAGES as string[]).includes(v);

/** The earliest stage a text can be seen in. */
function position(key: string): Stage {
  const [top, a, b] = key.split('.');
  switch (top) {
    case 'scenes': {
      const id = a as SceneId;
      if (id === 'prologue') return 'prologue';
      if (id === 'act1-after') return 'act1';
      if (id === 'act2' || id === 'act3' || id === 'act4') return id;
      if (id === 'rin-reveal') return rinSeventh();
      if (id === 'finale') return 'after';
      const [kind, c, n] = id.split(':');
      if (kind === 'town') return fragmentStage(c);
      if (kind === 'mem') {
        if (c === 'hero' || c === 'rin') return stageOf(CHAINS[c].pieces[Number(n) - 1].minDepth);
        return metStage(c);
      }
      // A chat: when she is met, or later if it is gated.
      const base = c === 'hero' || c === 'rin' ? 'prologue' : metStage(c);
      const gate = CHAT_GATE[id];
      let st = gate?.stage ? later(base, gate.stage) : base;
      if (gate?.oath) st = later(st, rinSeventh());
      return st;
    }
    case 'townLines': case 'greet': case 'rinLines': case 'truths': {
      const st = top === 'greet' ? b : a;
      if (!isStage(st)) throw new Error(`no stage in ${key}`);
      return st;
    }
    case 'act1Card': return 'act1';
    case 'finaleBossName': case 'finaleWait': return 'act4';
    case 'endingTitle': case 'finale': return 'after';
    case 'rinOath': return rinSeventh();
    case 'bellkeeper': return a === 'after' ? 'after' : a === 'oath' ? rinSeventh() : 'act3';   // the bellkeeper shows up after act 3 (spec §8.4)
    case 'meet': return metStage(a);
    case 'people': {
      if (a === 'hero' || a === 'rin') {
        const c = a as 'hero' | 'rin';
        const n = chainLength(c);
        if (b === '0') return 'prologue';
        return stageOf(CHAINS[c].pieces[(b === '1' ? Math.ceil(n / 2) : n) - 1].minDepth);
      }
      return metStage(a);
    }
    case 'town': return fragmentStage(a);
    case 'absorb': case 'merchant': case 'survived': return 'prologue';
    default: throw new Error(`no position for ${key}`);
  }
}

const SPOILERS: { terms: string[]; allowed: (key: string, line?: ScriptLine) => boolean; why: string }[] = [
  {
    terms: ['守燈人'],
    allowed: (key) => stageIdx(position(key)) >= stageIdx('act4') || key.startsWith('scenes.mem:hero:9.') || key.startsWith('scenes.mem:hero:10.'),
    why: 'spec §8.4: the lamp keeper is named from act 4 on, or in the hero memories that tell of it',
  },
  {
    terms: ['靜鐘會'],
    allowed: (key) => stageIdx(position(key)) >= stageIdx('act3'),
    why: 'spec §8.4: the Silent Bell society is named from act 3 on',
  },
];

const SPEC_QUOTES: [string, string][] = [
  ['scenes.rin-reveal.', '我被派來殺你。我現在選擇不要。'],
  ['scenes.rin-reveal.', '明天也一起回來吧。'],
  ['scenes.rin-reveal.', '這個名字是我自己決定要用的。'],
  ['scenes.mem:rin:', '從深處走出來的，不是人'],
  ['scenes.mem:scarlet:', '你不是盾，你是我的朋友。活下去。'],
  ['scenes.mem:safira:', '你要繼續跳。'],
  ['scenes.mem:bobby:', '祖先造錯的東西，我來修好。'],
  ['scenes.mem:selene:', '我想看見'],
  ['scenes.town:marta.', '現在想記住的事變多了'],
  ['act1Card.', '第一幕　星燈重新亮起'],
  ['finaleBossName', '燈喰之母'],
];

const SPEAKERS = new Set<string>([...CHARACTER_IDS, ...Object.keys(NPC_NAMES), 'narrator']);
const sceneLines = (): { id: SceneId; line: ScriptLine; key: string }[] =>
  storyTexts().filter((t) => t.line && t.key.startsWith('scenes.')).map((t) => ({ id: t.key.split('.')[1] as SceneId, line: t.line!, key: t.key }));
/** The companion a scene belongs to: her memory, her chat or her meeting. */
const ownerOf = (key: string): string | undefined => {
  const [top, a] = key.split('.');
  if (top === 'meet') return a;
  if (top === 'scenes') { const [kind, c] = a.split(':'); return kind === 'mem' || kind === 'chat' ? c : undefined; }
  return undefined;
};

describe('the script gates', () => {
  it('no scene plays more lines than its cap, in any party', () => {
    const subsets = Array.from({ length: 1 << COMPANIONS.length }, (_, mask) => COMPANIONS.filter((_, i) => mask & (1 << i)));
    const returnedAll = TOWN_FRAGMENTS.map((f) => f.id);
    for (const id of SCENE_IDS) {
      const lines = STORY.scenes[id].lines;
      const cap = lineCap(id);
      for (const met of subsets) {
        for (const full of [[], met]) {
          for (const returned of [[], returnedAll]) {
            for (const oath of id === 'finale' ? [true] : [false, true]) {
              const w: LineWhen = { met: ['hero', 'rin', ...met], full: full.length ? ['hero', 'rin', ...full] : [], returned, oath };
              const n = linesWhen(lines, w).length;
              if (n < 1 || n > cap) throw new Error(`${id} plays ${n} lines (cap ${cap}) for ${JSON.stringify(w)}`);
            }
          }
        }
      }
    }
  });

  it('no line is longer than MAX_LINE_CHARS', () => {
    expect(MAX_LINE_CHARS).toBe(60);
    for (const { key, text } of storyTexts()) {
      expect(text.trim() !== '', `${key} is empty`).toBe(true);
      expect([...text].length, key).toBeLessThanOrEqual(MAX_LINE_CHARS);
      expect(text, key).not.toMatch(/TODO|TBD|[\r\n]/);
    }
  });

  it('story text uses zh-TW typography', () => {
    for (const { key, text } of storyTexts()) expect(typographyBreaks(text), key).toEqual([]);
  });

  it('the typography gate rejects half-width punctuation and Latin text', () => {
    for (const bad of ['好.', '好-好', '好~', '(好)', '好)', '好...', '好,好', '好!', 'a', '7', '"好"', '好:好']) expect(typographyBreaks(bad), bad).not.toEqual([]);
    for (const ok of ['好。', '好──好', '好～', '（好）', '好……', '「好」，好！']) expect(typographyBreaks(ok), ok).toEqual([]);
  });

  it('speakers and moods are valid', () => {
    for (const { key, line } of storyTexts().filter((t) => t.line)) {
      const l = line!;
      expect(SPEAKERS.has(l.who), `${key}: ${l.who}`).toBe(true);
      if (l.mood !== undefined) expect(STORY_MOODS, key).toContain(l.mood);
      if (!(CHARACTER_IDS as string[]).includes(l.who)) expect(l.mood, key).toBeUndefined();   // narrator and the town people have no face to change
    }
  });

  it('nobody unmet speaks', () => {
    for (const { key, line } of storyTexts().filter((t) => t.line)) {
      const who = line!.who;
      if (!(COMPANIONS as string[]).includes(who) || who === ownerOf(key)) continue;
      const c = line!.if;
      expect(c?.met === who || c?.full === who, `${key}: ${who} speaks without being met`).toBe(true);
    }
  });

  it('memories are told by their owner', () => {
    for (const { id, line, key } of sceneLines().filter((x) => x.id.startsWith('mem:'))) {
      const owner = id.split(':')[1];
      const ok = new Set<string>([owner, 'hero', 'narrator', ...(MEMORY_GUESTS[id] ?? [])]);
      expect(ok.has(line.who), `${key}: ${line.who}`).toBe(true);
    }
    for (const t of storyTexts().filter((x) => x.line && x.key.startsWith('meet.'))) {
      const c = ownerOf(t.key)!;
      expect([c, 'hero', 'rin', 'narrator'], t.key).toContain(t.line!.who);
      expect(t.line!.if, t.key).toBeUndefined();   // meet lines are played unfiltered
    }
    for (const id of Object.keys(MEMORY_GUESTS)) expect(isSceneId(id) && id.startsWith('mem:'), id).toBe(true);
  });

  it('meetings say one to four lines before and after', () => {
    for (const m of MEETINGS) {
      const { before, after } = STORY.meet[m.id];
      expect(before.length, m.id).toBeGreaterThanOrEqual(1);
      expect(before.length, m.id).toBeLessThanOrEqual(4);
      expect(after.length, m.id).toBeGreaterThanOrEqual(0);   // Task 10 raises this to 1
      expect(after.length, m.id).toBeLessThanOrEqual(4);
    }
  });

  it('people and truths are one to three sentences', () => {
    const sentences = (t: string) => (t.match(/[^。！？]+[。！？]+/g) ?? []).length;
    for (const { key, text } of storyTexts().filter((t) => t.key.startsWith('people.') || t.key.startsWith('truths.'))) {
      expect(sentences(text), key).toBeGreaterThanOrEqual(1);
      expect(sentences(text), key).toBeLessThanOrEqual(3);
    }
  });

  it('WRITTEN entries never reach into another category', () => {
    expect(strayEntries(storyTexts(), WRITTEN)).toEqual([]);
  });

  it('written categories hold no placeholder', () => {
    expect(placeholdersIn(storyTexts(), WRITTEN, PLACEHOLDERS)).toEqual([]);
  });

  it('spec quotes appear verbatim', () => {
    expect(missingQuotes(storyTexts(), WRITTEN, SPEC_QUOTES)).toEqual([]);
  });

  it('the WRITTEN-only gates catch what they guard', () => {
    const t = (key: string, text: string): Text => ({ key, text });
    const texts = [t('town.orik.lost', '甲'), t('townLines.act1.0', '乙'), t('scenes.mem:rin:1.lines.0.text', '丙'), t('scenes.mem:rin:2.lines.0.text', '丁'), t('survived', '戊')];
    // a written key that still holds a placeholder is caught; an unwritten one is not
    expect(placeholdersIn(texts, ['town.'], new Set(['甲']))).toEqual(['town.orik.lost']);
    expect(placeholdersIn(texts, ['town.'], new Set(['乙']))).toEqual([]);   // `town.` does not eat `townLines`
    expect(placeholdersIn(texts, ['survived'], new Set(['戊']))).toEqual(['survived']);
    expect(placeholdersIn(texts, [], new Set(['甲', '乙', '戊']))).toEqual([]);
    // an entry that matches nothing is caught
    expect(strayEntries(texts, ['town.', 'scenes.mem:rin:1.', 'survived'])).toEqual([]);
    expect(strayEntries(texts, ['scene.town:', 'town', 'surviv', 'scenes.mem:rin:9.'])).toEqual(['scene.town:', 'town', 'surviv', 'scenes.mem:rin:9.']);
    // a quote must be in a category once all of it is written, whether by one broad entry or by narrower ones
    const q: [string, string][] = [['scenes.mem:rin:', '我想看見']];
    expect(missingQuotes(texts, ['scenes.mem:rin:'], q)).toEqual(['scenes.mem:rin: lacks 「我想看見」']);
    expect(missingQuotes(texts, ['scenes.mem:rin:1.', 'scenes.mem:rin:2.'], q)).toEqual(['scenes.mem:rin: lacks 「我想看見」']);
    expect(missingQuotes(texts, ['scenes.mem:rin:1.'], q)).toEqual([]);   // rin 2 is not written yet
    expect(missingQuotes(texts, [], q)).toEqual([]);
    expect(missingQuotes(texts, [], [['scene.mem:rin:', '我想看見']])).toEqual(['scene.mem:rin: matches no key']);   // a typo in a quote prefix is not skipped
    const withQuote = [...texts, t('scenes.mem:rin:3.lines.0.text', '她說：我想看見。')];
    expect(missingQuotes(withQuote, ['scenes.mem:rin:'], q)).toEqual([]);
  });

  it('numeral counts one to ten and throws elsewhere', () => {
    expect([1, 2, 10].map(numeral)).toEqual(['一', '二', '十']);
    for (const n of [0, 11, -1, 1.5, NaN]) expect(() => numeral(n), String(n)).toThrow();
  });

  it('an unknown bellkeeper line is placed after act 3, and the known ones as before', () => {
    expect(position('bellkeeper.greeting.0')).toBe('act3');
    expect(position('bellkeeper.oath.0')).toBe(rinSeventh());
    expect(position('bellkeeper.after.0')).toBe('after');
    expect(() => position('nope.0')).toThrow();
  });

  it('spoilers stay behind their owner', () => {
    for (const sp of SPOILERS) {
      for (const { key, text, line } of storyTexts()) {
        if (sp.terms.some((term) => text.includes(term))) expect(sp.allowed(key, line), `${key}: ${sp.why}`).toBe(true);
      }
    }
  });

  it('the first chat of anyone is never gated', () => {
    for (const c of CHARACTER_IDS) expect(CHAT_GATE[`chat:${c}:1`], c).toBeUndefined();
  });
});
