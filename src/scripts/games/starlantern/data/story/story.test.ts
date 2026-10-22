import { describe, it, expect } from 'vitest';
import { CHARACTERS, CHARACTER_IDS } from '../characters';
import { ITEMS } from '../items';
import { MATERIALS } from '../materials';
import { REGIONS } from '../regions';
import { MEETINGS } from '../meetings';
import { FOUND_LINE, introIndex, numeral, STORY, PLACEHOLDERS, NPC_NAMES, MAX_LINE_CHARS, MEMORY_GUESTS, moodAllowed, linesWhen, type LineWhen, type ScriptLine } from '../story.zh-TW';
import { CHAINS, HERO_TOPUP, chainLength, whenHolds } from './chains';
import { pinBeat, storyTexts, type Text } from './voiceGates';
import { T } from '../text.zh-TW';
import type { CharacterId } from '../../engine/types';
import { TOWN_FRAGMENTS, type TownFragmentId, shardGrade, isFragmentItem, fragmentName, SHARD_PRICE, SHARD_DROP, TOWN_DROP, PERKS, ABSORB_GAIN } from './fragments';
import { memoryPace } from '../../engine/story/expect';
import { leadOpen } from '../../engine/story/leads';
import type { StoryMood } from '../../render/artPaths';
import { ACT_DEPTHS, BANTER_COUNT, BANTER_GATE, BANTER_PAIRS, CHAT_COUNT, CHAT_GATE, HOME_OWNERS, SCENE_IDS, STAGES, MAJOR_SCENES, homeScene, isSceneId, lineCap, memScene, sceneKind, type SceneId, type Stage } from './scenes';

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
    // continuity fix 2: the four endings spec §6 places in the town; fix 4: the bellkeeper's arrival
    expect(SCENE_IDS.filter((s) => s.startsWith('home:'))).toEqual(['home:chizuru', 'home:safira', 'home:sylvie', 'home:liz']);
    expect(HOME_OWNERS.every((c) => sceneKind(homeScene(c)) === 'home')).toBe(true);
    // B1: the town banters, `banter:<a>-<b>:<n>` for each pair, in the pairs' fixed order
    const banters = BANTER_PAIRS.flatMap((p) => Array.from({ length: BANTER_COUNT[p]! }, (_, i) => `banter:${p}:${i + 1}`));
    expect(SCENE_IDS.filter((s) => s.startsWith('banter:'))).toEqual(banters);
    expect(banters.every((id) => sceneKind(id as SceneId) === 'banter')).toBe(true);
    for (const s of ['prologue', 'prologue-inn', 'first-return', 'act1-after', 'act2', 'act3', 'act4', 'rin-reveal', 'bellkeeper-arrives', 'finale'] as const) expect(SCENE_IDS).toContain(s);
    expect(new Set(SCENE_IDS).size).toBe(SCENE_IDS.length);
    expect(memScene('rin', 3)).toBe('mem:rin:3');
    expect(MAJOR_SCENES.every((s) => sceneKind(s) === 'major')).toBe(true);
  });

  it('isSceneId rejects what the catalogue lacks', () => {
    for (const v of ['mem:hero:11', 'mem:rin:0', 'chat:noel:3', 'town:x', 'home:selene', 'home:hero', 'nope', 3, null]) expect(isSceneId(v)).toBe(false);
    for (const v of ['banter:sylvie-safira:1', 'banter:noel-rin:0', 'banter:noel-rin:9', 'banter:hero-rin:1', 'banter:noel-rin']) expect(isSceneId(v), v).toBe(false);
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
    expect(lineCap('prologue')).toBe(12);
    expect(lineCap('prologue-inn')).toBe(10);
    expect(lineCap('first-return')).toBe(10);
    expect(lineCap('bellkeeper-arrives')).toBe(6);
    for (const c of HOME_OWNERS) expect(lineCap(homeScene(c))).toBe(4);
    expect(lineCap('banter:noel-rin:1')).toBe(4);
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
    // Rin's fourth page is her choice, opened by her oath (continuity fix 3); everyone else has three.
    for (const id of CHARACTER_IDS) expect(STORY.people[id].length, id).toBe(id === 'rin' ? 4 : 3);
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

  it('no placeholder is left: plan 6c has written the whole script (Task 14)', () => {
    expect(PLACEHOLDERS.size).toBe(0);
    expect(PLACEHOLDERS.has(STORY.endingTitle)).toBe(false);
  });

  it("the finale's wait, Rin's oath lines, the bellkeeper and the merchant are story copy", () => {
    const texts = storyTexts();
    const keys = (prefix: string) => texts.filter((t) => t.key === prefix || t.key.startsWith(`${prefix}.`));
    expect(keys('finaleWait').length).toBeGreaterThanOrEqual(1);
    expect(keys('finaleWait').length).toBeLessThanOrEqual(2);
    expect(STORY.finaleWait.every((l) => l.who !== undefined && !PLACEHOLDERS.has(l.text))).toBe(true);   // written in Task 14
    expect(keys('rinOath').length).toBe(STORY.rinOath.length);
    expect(STORY.rinOath.length).toBeGreaterThanOrEqual(3);   // Task 7 writes them: at least three
    expect(keys('bellkeeper.oath').length).toBe(STORY.bellkeeper.oath.length);
    expect(keys('bellkeeper.after').length).toBe(STORY.bellkeeper.after.length);
    expect(STORY.bellkeeper.oath.length).toBeGreaterThan(0);
    expect(STORY.bellkeeper.after.length).toBeGreaterThan(0);
    expect(keys('merchant').map((t) => t.key).sort()).toEqual(['merchant.found', 'merchant.lost']);
    for (const t of keys('finaleWait')) {
      expect(PLACEHOLDERS.has(t.text), t.key).toBe(false);
      expect(() => position(t.key), t.key).not.toThrow();
    }
    // Task 11 writes the bellkeeper (three lines at least while he waits, two after) and the merchant.
    for (const t of [...keys('bellkeeper'), ...keys('merchant')]) expect(() => position(t.key), t.key).not.toThrow();
    expect(STORY.bellkeeper.oath.length).toBeGreaterThanOrEqual(3);
    expect(STORY.bellkeeper.after.length).toBeGreaterThanOrEqual(2);
    for (const t of keys('rinOath')) expect(() => position(t.key), t.key).not.toThrow();   // written in Task 7
    // Rin's oath lines and the bellkeeper's first lines are for after her choice; the wait is for act 4 at the earliest.
    expect(position('rinOath.0')).toBe(rinSeventh());
    expect(position('bellkeeper.oath.0')).toBe(rinSeventh());
    expect(position('bellkeeper.after.0')).toBe('after');
    expect(position('finaleWait.0.text')).toBe('act4');
  });
});

// ---- The gates every line of the script must pass (plan 6c Task 2) ----

const writtenBy = (written: string[], key: string): boolean => written.some((w) => (/[.:]$/.test(w) ? key.startsWith(w) : key === w));
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
      if (id === 'prologue' || id === 'prologue-inn' || id === 'first-return') return 'prologue';   // the first return can come before depth 2
      if (id === 'act1-after') return 'act1';
      if (id === 'act2' || id === 'act3' || id === 'act4') return id;
      if (id === 'rin-reveal' || id === 'bellkeeper-arrives') return rinSeventh();   // the arrival follows her choice
      if (id === 'finale') return 'after';
      const [kind, c, n] = id.split(':');
      if (kind === 'town') return fragmentStage(c);
      if (kind === 'banter') {   // B1: once both of the pair are met, or later if it is gated
        const [a1, b1] = c.split('-');
        const gate = BANTER_GATE[id];
        let st = later(metStage(a1), metStage(b1));
        if (gate?.stage) st = later(st, gate.stage);
        if (gate?.oath) st = later(st, rinSeventh());
        return st;
      }
      if (kind === 'home') return metStage(c);   // after her last piece; placed like the rest of her story (I-58)
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
    case 'leads': {   // the guild's lead for her: from the stage it opens at (engine/story/leads.ts, lore ledger I-124)
      const m = MEETINGS.find((x) => x.id === a);
      if (!m) throw new Error(`no meeting for ${key}`);
      return STAGES.find((st) => leadOpen(m, st))!;
    }
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

/** Words that give away Rin's secret: 「凜」 is a code name, the bell is the society's token, she is an assassin sent to kill. */
const RIN_SECRET_TERMS = ['代號', '信物', '刺客', '派來殺', '派去殺', '去殺', '要殺的人'];
/**
 * Where Rin's secret may be said: her 6th and 7th pieces, the reveal, her oath lines, the bellkeeper, the finale and the
 * after stage, her last handbook segment (it unlocks with the 7th piece; it never tells her choice), a line that plays only
 * after her choice (`if.oath: true`), and a chat of hers gated on the oath.
 */
const rinSecretAllowed = (key: string, line?: ScriptLine): boolean => {
  if (['scenes.mem:rin:6.', 'scenes.mem:rin:7.', 'scenes.rin-reveal.', 'rinOath.', 'bellkeeper.', 'people.rin.2'].some((p) => key === p || key.startsWith(p))) return true;
  if (line?.if?.oath === true) return true;
  const id = key.split('.')[1];
  if (key.startsWith('scenes.chat:rin:') && CHAT_GATE[id as SceneId]?.oath === true) return true;
  return position(key) === 'after';
};

/**
 * Rin may be shown looking away only once she has started to (lore ledger I-11, I-29): from act 3 on, in her 4th piece or a
 * later one (a memory plays when it is found, so the 4th is in hand), or in a line that plays only after her choice.
 * `if.oath: false` does not count: it says nothing about her 4th piece (chat:rin:2 waits only for act 2).
 */
const avertedAllowed = (key: string, line: ScriptLine): boolean => {
  if (stageIdx(position(key)) >= stageIdx('act3')) return true;
  const mem = /^scenes\.mem:rin:(\d+)\./.exec(key);
  if (mem && Number(mem[1]) >= 4) return true;
  return line.if?.oath === true;
};

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
  {
    terms: RIN_SECRET_TERMS,
    allowed: rinSecretAllowed,
    why: "spec §5.1: Rin's code name, her bell and her errand are told by her 6th and 7th pieces, and after them (lore ledger, 揭露表)",
  },
];

const SPEC_QUOTES: [string, string][] = [
  // Story polish ruling 10: the user approved the sample's wording over the spec's (lore ledger, 2026-10-22); the spec stays.
  ['scenes.rin-reveal.', '我是被派來殺你的'],
  ['scenes.rin-reveal.', '這是我自己決定的'],
  ['scenes.rin-reveal.', '明天也一起回來吧。'],
  ['scenes.rin-reveal.', '這個名字是我自己決定要用的。'],
  ['scenes.mem:rin:', '從深處走出來的，不是人'],
  ['scenes.mem:scarlet:', '妳不是盾，妳是我的朋友。活下去。'],   // story polish ruling 8: 妳
  ['scenes.mem:safira:', '妳要繼續跳。'],
  ['scenes.mem:bobby:', '祖先造錯的東西，我來修好。'],
  ['scenes.mem:selene:', '我想看見'],
  ['scenes.town:marta.', '現在想記住的事變多了'],
  ['act1Card.', '第一幕　星燈重新亮起'],
  ['finaleBossName', '燈喰之母'],
];

const SPEAKERS = new Set<string>([...CHARACTER_IDS, ...Object.keys(NPC_NAMES), 'narrator']);
const sceneLines = (): { id: SceneId; line: ScriptLine; key: string }[] =>
  storyTexts().filter((t) => t.line && t.key.startsWith('scenes.')).map((t) => ({ id: t.key.split('.')[1] as SceneId, line: t.line!, key: t.key }));
/** The two of a banter (B1): its gate guarantees both are met, so neither needs `if.met`. Empty for any other key. */
const banterTwo = (key: string): string[] => {
  const [top, a] = key.split('.');
  return top === 'scenes' && a.startsWith('banter:') ? a.split(':')[1].split('-') : [];
};
/** The companion a scene belongs to: her memory, her chat or her meeting. */
const ownerOf = (key: string): string | undefined => {
  const [top, a] = key.split('.');
  if (top === 'meet') return a;
  if (top === 'scenes') { const [kind, c] = a.split(':'); return kind === 'mem' || kind === 'chat' || kind === 'home' ? c : undefined; }
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
      expect(moodAllowed(l.who, l.mood), `${key}: ${l.who} ${l.mood}`).toBe(true);   // narrator and the town people have no face to change
    }
  });

  it('a mood belongs to its speaker', () => {
    expect(moodAllowed('selene', 'smug')).toBe(false);
    expect(moodAllowed('noel', 'smug')).toBe(true);
    expect(moodAllowed('rin', 'averted')).toBe(true);
    expect(moodAllowed('hero', 'averted')).toBe(false);
    expect(moodAllowed('anna', 'smile')).toBe(false);
    expect(moodAllowed('narrator', undefined)).toBe(true);
    expect(moodAllowed('scarlet', 'down')).toBe(true);
    expect(moodAllowed('scarlet', 'attack' as string as StoryMood)).toBe(false);   // battle faces never speak
  });

  it('Rin looks away only once she has started to', () => {
    for (const { key, line } of storyTexts().filter((t) => t.line)) {
      if (line!.who === 'rin' && line!.mood === 'averted') expect(avertedAllowed(key, line!), key).toBe(true);
    }
    const rin = (c?: ScriptLine['if']): ScriptLine => ({ who: 'rin', mood: 'averted', text: '甲', ...(c ? { if: c } : {}) });
    expect(avertedAllowed('scenes.chat:rin:2.lines.3.text', rin({ oath: false }))).toBe(false);   // act 2: her 4th piece may not be found yet
    expect(avertedAllowed('scenes.mem:rin:4.lines.2.text', rin())).toBe(true);
    expect(avertedAllowed('scenes.mem:rin:3.lines.2.text', rin())).toBe(false);
    expect(avertedAllowed('scenes.act4.lines.0.text', rin())).toBe(true);
    expect(avertedAllowed('scenes.chat:rin:2.lines.3.text', rin({ oath: true }))).toBe(true);
  });

  it('the written scenes wear their faces', () => {
    // Task 7.5 retag pins, found by content.
    const face = (id: SceneId, who: string, has: string, oath?: boolean): StoryMood | undefined => {
      const hits = STORY.scenes[id].lines.filter((l) => l.who === who && l.text.includes(has) && (oath === undefined || l.if?.oath === oath));
      expect(hits, `${id} ${who} ${has}`).toHaveLength(1);
      return hits[0].mood;
    };
    expect(face('mem:rin:6', 'rin', '別看我')).toBe('averted');
    expect(face('mem:rin:7', 'rin', '那把劍')).toBe('surprised');
    expect(face('mem:hero:10', 'hero', '是燈鑰')).toBe('resolve');
    expect(face('rin-reveal', 'rin', '派來殺你')).toBe('serious');   // story polish Task 2: the choice line, by its beat
    expect(face('chat:rin:3', 'rin', '', true)).toBe('blush');
    expect(face('prologue', 'rin', '')).toBe('guarded');
  });

  it('nobody unmet speaks', () => {
    for (const { key, line } of storyTexts().filter((t) => t.line)) {
      const who = line!.who;
      if (!(COMPANIONS as string[]).includes(who) || who === ownerOf(key) || banterTwo(key).includes(who)) continue;
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
      expect(after.length, m.id).toBeGreaterThanOrEqual(1);   // raised from 0 in Task 10: every companion joins in words
      expect(after.length, m.id).toBeLessThanOrEqual(4);
    }
  });

  it('every meeting opens on FOUND_LINE, names her nowhere before she says it, and has her self-introduction', () => {
    expect(FOUND_LINE).toBe('有人被怪物圍住了！');
    for (const name of Object.values(CHARACTERS).map((c) => c.name)) expect(FOUND_LINE, name).not.toContain(name);
    for (const { id } of MEETINGS) {
      const { before, after } = STORY.meet[id];
      const name = CHARACTERS[id].name;
      expect(before[0].text, id).toBe(FOUND_LINE);
      const intro = introIndex(id);
      expect(intro, `${id} says her own name after the fight`).toBeGreaterThanOrEqual(0);
      expect(after[intro].who, id).toBe(id);
      expect(after[intro].text, id).toContain(name);
      for (const l of [...before, ...after.slice(0, intro)]) expect(l.text, `${id}: ${l.text}`).not.toContain(name);
    }
    // Liz says her own name now (story polish Task 1, ruling 2), by its beats (Task 3, ruling 11): the ration in the
    // narration, her name in her own line, the family she cannot picture, the cover-up.
    const liz = STORY.meet.liz.after;
    expect(liz.length).toBeLessThanOrEqual(4);
    expect(liz.filter((l) => l.who === 'narrator' && /乾糧/.test(l.text))).toHaveLength(1);
    expect(liz[introIndex('liz')].text).toMatch(/我是莉茲/);
    expect(liz.filter((l) => l.who === 'liz' && l.mood === 'hushed' && /家人的臉/.test(l.text))).toHaveLength(1);
    expect(liz.filter((l) => l.who === 'liz' && /老大/.test(l.text))).toHaveLength(1);
    // introIndex finds her first line that says her name, and nothing else.
    expect(introIndex('selene')).toBe(STORY.meet.selene.after.findIndex((l) => l.who === 'selene' && l.text.includes(CHARACTERS.selene.name)));
  });

  it('people and truths are one to three sentences', () => {
    const sentences = (t: string) => (t.match(/[^。！？]+[。！？]+/g) ?? []).length;
    for (const { key, text } of storyTexts().filter((t) => t.key.startsWith('people.') || t.key.startsWith('truths.'))) {
      expect(sentences(text), key).toBeGreaterThanOrEqual(1);
      expect(sentences(text), key).toBeLessThanOrEqual(3);
    }
  });

  it('spec quotes appear verbatim', () => {
    expect(missingQuotes(storyTexts(), storyTexts().map((t) => t.key), SPEC_QUOTES)).toEqual([]);
  });

  it('the spec-quote gate catches what it guards', () => {
    const t = (key: string, text: string): Text => ({ key, text });
    const texts = [t('town.orik.lost', '甲'), t('townLines.act1.0', '乙'), t('scenes.mem:rin:1.lines.0.text', '丙'), t('scenes.mem:rin:2.lines.0.text', '丁'), t('survived', '戊')];
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

  it("Rin's secret stays behind her sixth piece", () => {
    const oathLine: ScriptLine = { who: 'rin', text: '甲', if: { oath: true } };
    for (const n of [1, 2, 3, 4, 5]) expect(rinSecretAllowed(`scenes.mem:rin:${n}.lines.0.text`), `mem:rin:${n}`).toBe(false);
    for (const k of ['scenes.prologue.lines.0.text', 'scenes.act3.lines.0.text', 'scenes.act4.lines.0.text', 'truths.act4', 'people.rin.1', 'scenes.chat:rin:1.lines.0.text', 'rinLines.act4.0', 'greet.inn.act4.0']) {
      expect(rinSecretAllowed(k), k).toBe(false);
    }
    expect(rinSecretAllowed('scenes.act4.lines.0.text', { who: 'rin', text: '甲', if: { oath: false } })).toBe(false);
    for (const k of ['scenes.mem:rin:6.lines.0.text', 'scenes.mem:rin:7.summary', 'scenes.rin-reveal.lines.0.text', 'rinOath.0', 'bellkeeper.oath.0', 'people.rin.2', 'scenes.finale.lines.0.text', 'townLines.after.0', 'truths.after']) {
      expect(rinSecretAllowed(k), k).toBe(true);
    }
    expect(rinSecretAllowed('scenes.act4.lines.0.text', oathLine)).toBe(true);
    expect(RIN_SECRET_TERMS.length).toBeGreaterThan(0);
  });

  it("act 4 reads right before and after Rin's choice", () => {
    // Act 4 is the one act that may play before or after her reveal (U1): every line she speaks there knows which.
    const rin = STORY.scenes.act4.lines.filter((l) => l.who === 'rin');
    expect(rin.length).toBeGreaterThan(0);
    for (const l of rin) expect(typeof l.if?.oath, l.text).toBe('boolean');
    expect(rin.some((l) => l.if?.oath === true)).toBe(true);
    expect(rin.some((l) => l.if?.oath === false)).toBe(true);
    // and both readings play her
    for (const oath of [false, true]) {
      const w: LineWhen = { met: ['hero', 'rin'], full: [], returned: [], oath };
      expect(linesWhen(STORY.scenes.act4.lines, w).some((l) => l.who === 'rin'), String(oath)).toBe(true);
    }
  });

  it("Lorne's chats wait for their acts, and only his last two pieces say who he is", () => {
    // Task 6: his chats follow the acts (lore ledger, CHAT_GATE); piece 9 names the lamp keeper, piece 10 the lamp key.
    expect(CHAT_GATE['chat:hero:2']).toEqual({ stage: 'act2' });
    expect(CHAT_GATE['chat:hero:3']).toEqual({ stage: 'act3' });
    expect(CHAT_GATE['chat:hero:4']).toEqual({ stage: 'act4' });
    const text = (id: SceneId) => STORY.scenes[id].lines.map((l) => l.text).join('');
    expect(text('mem:hero:9')).toContain('守燈人');
    expect(text('mem:hero:10')).toContain('燈鑰');
    for (let n = 1; n <= 8; n++) {
      for (const word of ['守燈人', '燈鑰']) expect(text(memScene('hero', n)), `mem:hero:${n}`).not.toContain(word);
    }
    // His last chat may play before or after Rin's choice: each line of hers knows which, and both readings play her.
    const rin = STORY.scenes['chat:hero:4'].lines.filter((l) => l.who === 'rin');
    for (const l of rin) expect(typeof l.if?.oath, l.text).toBe('boolean');
    for (const oath of [false, true]) {
      const w: LineWhen = { met: ['hero', 'rin'], full: [], returned: [], oath };
      expect(linesWhen(STORY.scenes['chat:hero:4'].lines, w).some((l) => l.who === 'rin'), String(oath)).toBe(true);
    }
  });

  it("Lorne's canon holds: the sword never leaves him, the bell rings before the blade, the first chat claims no memory", () => {
    // Task 6 fix round 1 (lore ledger I-45, I-49): every round he carries the sword; a distant bell rings days or a season before the blade.
    const lines = (id: SceneId) => STORY.scenes[id].lines.map((l) => l.text);
    for (let n = 1; n <= 10; n++) for (const t of lines(memScene('hero', n))) expect(t, `mem:hero:${n}`).not.toMatch(/兩手空空|空著手/);
    // continuity fix 6: a death leaves decades in the dark, so the registry's entries stay decades apart (I-33, I-45)
    expect(lines('mem:hero:9').join('')).toMatch(/躺了幾十年/);
    expect(lines('mem:hero:9').join('')).not.toMatch(/好幾年/);
    expect(lines('mem:hero:5')[0]).toContain('鐘');
    expect(lines('mem:hero:5')[0]).not.toMatch(/刀|背後/);   // the bell rings first, alone
    // continuity fix 7 (I-49): it rings while he climbs and stops as he steps out, so he hears its end as he comes out
    expect(lines('mem:hero:5')[0]).toMatch(/走出迷宮|走上來/);
    expect(lines('mem:hero:7')[0]).toMatch(/一季|幾天|後/);
    // chat:hero:1 can play before mem:hero:1 (d3): it may not tell that he walked up toward the light.
    expect(lines('chat:hero:1').join('')).not.toMatch(/走出來|走上來/);
  });

  it("Rin's last chat waits for her choice", () => {
    // Task 7: her chats follow the acts; the avoidance chat waits for act 3 (after her 4th piece), the last for the oath.
    expect(CHAT_GATE['chat:rin:2']).toEqual({ stage: 'act2' });
    expect(CHAT_GATE['chat:rin:3']).toEqual({ stage: 'act3' });
    expect(CHAT_GATE['chat:rin:4']).toEqual({ oath: true });
    // Chats 2 and 3 can be delayed past her choice (one chat per return, the least-heard first): both readings play her.
    for (const id of ['chat:rin:2', 'chat:rin:3'] as SceneId[]) {
      for (const oath of [false, true]) {
        const w: LineWhen = { met: ['hero', 'rin'], full: [], returned: [], oath };
        expect(linesWhen(STORY.scenes[id].lines, w).some((l) => l.who === 'rin'), `${id} ${oath}`).toBe(true);
      }
    }
  });

  it("Rin avoids his eyes only from her fourth piece, and never after her choice", () => {
    // Controller ruling (lore ledger I-11, I-29): she first looks away in mem:rin:4 (depth 8-9). Act 2 can play from depth 4.
    const AVOID = /視線|移開|避開|別開|不看|別看|看路|看著地|低著頭/;
    const early = storyTexts().filter((t) => t.key.startsWith('rinLines.act2.') || t.key.startsWith('scenes.chat:rin:1.') || t.key.startsWith('scenes.chat:rin:2.'));
    expect(early.length).toBeGreaterThan(0);
    for (const t of early) expect(t.text, t.key).not.toMatch(AVOID);
    expect(STORY.rinLines.act3!.some((x) => AVOID.test(x))).toBe(true);   // act 3 is where her town lines start looking away
    // Each chat is read as it plays (linesWhen), so a malformed condition cannot drop a line out of the check unseen.
    const reading = (n: number, oath: boolean) => linesWhen(STORY.scenes[`chat:rin:${n}` as SceneId].lines, { met: ['hero', 'rin'], full: [], returned: [], oath });
    // Before her choice, chat 3 (act 3) is where she looks away, in all three lines it plays.
    expect(reading(3, false).length).toBe(3);
    expect(reading(3, false).some((l) => l.who === 'narrator' && AVOID.test(l.text))).toBe(true);
    // After her choice she looks at him: the oath lines and every chat as it plays then.
    for (const t of STORY.rinOath) expect(t).not.toMatch(AVOID);
    expect(reading(3, true).length).toBe(3);
    for (let n = 1; n <= 4; n++) {
      for (const l of reading(n, true)) expect(l.text, `chat:rin:${n}`).not.toMatch(/避開|別開|不看|別看|落回/);
    }
    expect(STORY.rinLines.after).toBeUndefined();   // after the finale she has always chosen (U3): only rinOath plays
  });

  it("Rin never says his name before her choice, and the reveal keeps the finale's truths", () => {
    // Style bible: before rin-reveal she calls him 「你」 or 「喂」; the reveal is the first 「洛恩」 (lore ledger I-20).
    const chosen = (key: string, line?: ScriptLine) => line?.if?.oath === true || key.startsWith('scenes.rin-reveal.')
      || key.startsWith('scenes.bellkeeper-arrives.')   // it plays only after her choice (continuity fix 4)
      || key.startsWith('scenes.finale.') || (key.startsWith('scenes.chat:rin:') && CHAT_GATE[key.split('.')[1] as SceneId]?.oath === true)
      || (key.startsWith('scenes.banter:') && BANTER_GATE[key.split('.')[1] as SceneId]?.oath === true);   // B1: a banter that waits for her choice
    for (const { key, text, line } of storyTexts()) {
      if (key.startsWith('rinLines.')) expect(text, key).not.toContain('洛恩');
      if (line?.who === 'rin' && !chosen(key, line)) expect(text, key).not.toContain('洛恩');
    }
    const reveal = STORY.scenes['rin-reveal'].lines;
    expect(reveal.some((l) => l.who === 'rin' && l.text.includes('洛恩'))).toBe(true);
    expect(STORY.rinOath.some((t) => t.includes('洛恩'))).toBe(true);
    // The reveal plays before the hero's 9th piece as a rule (d22 against d25): it does not confirm he is the keeper,
    // and the society's real crime is the finale's (spec §3.6).
    const all = [...reveal.map((l) => l.text), STORY.scenes['rin-reveal'].summary].join('');
    expect(all).not.toMatch(/守燈人|燈鑰|晚一次|殺的一直是/);
    expect(reveal.every((l) => l.if === undefined)).toBe(true);   // her choice is not the player's: one version
  });

  it('every line condition is well formed', () => {
    // Task 7 fix round 1: a condition object passed where a flag was meant made `if.oath` an object, and linesWhen dropped the line in every reading.
    const KEYS = ['met', 'notMet', 'returned', 'notReturned', 'full', 'notFull', 'oath'];
    for (const { key, line } of storyTexts().filter((t) => t.line)) {
      const c = line!.if;
      if (c === undefined) continue;
      expect(typeof c, key).toBe('object');
      for (const k of Object.keys(c)) expect(KEYS, `${key}: if.${k}`).toContain(k);
      if ('oath' in c) expect(typeof c.oath, `${key}: if.oath`).toBe('boolean');
      for (const k of ['met', 'notMet', 'returned', 'notReturned', 'full', 'notFull'] as const) if (k in c) expect(typeof c[k], `${key}: if.${k}`).toBe('string');
    }
    // and every line of every scene plays in at least one reading (Task 10: with no fragment returned too, for `notReturned`)
    for (const id of SCENE_IDS) {
      const lines = STORY.scenes[id].lines;
      const everyone: LineWhen = { met: [...CHARACTER_IDS], full: [...CHARACTER_IDS], returned: TOWN_FRAGMENTS.map((f) => f.id), oath: false };
      const readings: LineWhen[] = [everyone, { ...everyone, full: [] }].flatMap((w) => [w, { ...w, returned: [] }]);
      const played = new Set([true, false].flatMap((oath) => readings.flatMap((w) => linesWhen(lines, { ...w, oath }))));
      for (const l of lines) if (!l.if?.notMet) expect(played.has(l), `${id}: ${l.text}`).toBe(true);
    }
  });

  it('the first chat of anyone is never gated', () => {
    for (const c of CHARACTER_IDS) expect(CHAT_GATE[`chat:${c}:1`], c).toBeUndefined();
  });
});

/**
 * What a companion's pieces undo and reveal (Task 8 fix round 1, Task 9, Task 10): the chats' spoiler tables, shared with
 * B1's banters. `UNDONE`: a line undone by an earlier piece may not play at all; one undone by her last piece needs `notFull`.
 * `REVEALED`: a line her pieces reveal needs `full`. `heard`: the row is also checked against the narration.
 */
const UNDONE: { who: string; re: RegExp; piece: number }[] = [
  { who: 'selene', re: /洛恩先生/, piece: 5 },                       // I-22: plain 「洛恩」 from her last piece
  { who: 'chizuru', re: /不記得是何時|記不得是何時/, piece: 5 },      // the bell is explained by her last piece
  { who: 'chizuru', re: /趕回去|回神社覆命|回神社/, piece: 4 },       // the shrine is gone from her fourth piece
  // Task 9
  { who: 'sylvie', re: /該睡的人|不配/, piece: 5 },                 // she thinks she has no right to live until her last piece
  { who: 'noel', re: /歸來者/, piece: 5 },                          // I-25: 「洛恩」 from her last piece
  { who: 'noel', re: /小氣|怕本小姐/, piece: 4 },                   // she thinks her teacher is stingy until her fourth piece
  { who: 'noel', re: /忘了.{0,4}(怎麼|為什麼).{0,4}(進來|迷宮)/, piece: 2 },   // her second piece tells how she came in
  // Task 10
  { who: 'liz', re: /臉.{0,2}想不起來|一定有人在等/, piece: 5 },         // she remembers her father's face in her last piece
  { who: 'scarlet', re: /洛恩閣下/, piece: 5 },                       // I-26: plain 「洛恩」 from her last piece
  { who: 'scarlet', re: /騎士的(本分|職責)|欠著(誰|某個人)/, piece: 5 },          // her last piece: she guards by choice, she owes no one a flight
];
// `heard`: the row is also checked against the narration of her chats (what the scene shows, not only what she says).
const REVEALED: { who: string; re: RegExp; piece: number; heard?: true }[] = [
  { who: 'selene', re: /洛恩(?!先生)/, piece: 5 },
  { who: 'selene', re: /我想看見|新月/, piece: 5 },
  { who: 'chizuru', re: /不在了/, piece: 4 },
  { who: 'chizuru', re: /託付/, piece: 5 },
  { who: 'safira', re: /團長|[你妳]要繼續跳|做決定的/, piece: 4 },
  // Task 9
  { who: 'sylvie', re: /林子|守林|帶出去|帶出來|種子|種下|空地|新綠|發芽/, piece: 1, heard: true },   // the mire was her forest (1); the seed and its clearing (5) (fix round 1)
  { who: 'noel', re: /洛恩/, piece: 5 },
  { who: 'noel', re: /星火|燒掉|燒光|為薪|保護|商人/, piece: 3 },
  { who: 'bobby', re: /祖先|一族|構造圖|都能裝|錯了|閥|道歉|修好/, piece: 1 },
  // Task 10: the shop, the debt, the hat, the lamp's light, the vault and her father (1-5); she is Orik's daughter (5)
  { who: 'liz', re: /櫃檯|估價的本事|瓶罐|債|借據|賒|帽子|星燈|光柱|麵包.{0,4}焦|焦.{0,4}麵包|寶庫的門|爸爸|父親|歐里克|臉想起來/, piece: 1, heard: true },
  { who: 'scarlet', re: /洛恩(?!閣下)/, piece: 5 },
  // her oath, her kingdom, her turning away, the princess and the retreat (1-5)
  { who: 'scarlet', re: /起誓|立誓|誓言|國家|王國|王城|轉身|逃|號角|公主|殿下|朋友|活下去|撤退|密道/, piece: 1, heard: true },
];

describe('Task 8: Selene, Chizuru and Safira', () => {
  const linesOf = (id: SceneId) => STORY.scenes[id].lines;
  const textOf = (id: SceneId) => linesOf(id).map((l) => l.text).join('');
  /** Every line a companion speaks anywhere: her memories, chats and meeting. */
  const spokenBy = (c: string) => storyTexts().filter((t) => t.line?.who === c);

  it('each meeting opens on the found line, then she speaks; she joins after the fight', () => {
    for (const c of ['selene', 'chizuru', 'safira'] as const) {
      const { before, after } = STORY.meet[c];
      expect(before[0].who, c).toBe('narrator');
      expect(before[0].text, c).toBe(FOUND_LINE);   // story polish Task 1: the found line names nobody (ruling 2)
      expect(before.some((l) => l.who === c), c).toBe(true);
      expect(after.length, c).toBeGreaterThanOrEqual(1);
      expect(after.some((l) => l.who === c), c).toBe(true);
    }
  });

  it("Selene's bright ending is the full moon's (2, 4), the dark one the new moon's (5), and 「我想看見」 waits for her last piece", () => {
    expect(textOf('mem:selene:2')).toContain('滿月');
    expect(textOf('mem:selene:4')).toContain('滿月');
    expect(textOf('mem:selene:5')).toContain('新月');
    expect(textOf('mem:selene:5')).toMatch(/熄/);
    for (const n of [1, 2, 3, 4]) expect(textOf(memScene('selene', n)), `mem:selene:${n}`).not.toContain('新月');
    for (const t of storyTexts()) if (t.text.includes('我想看見')) expect(t.key, t.key).toMatch(/^scenes\.mem:selene:5\./);
    // She calls him 「洛恩先生」 until her memories are whole; her last piece is the first plain 「洛恩」 (style bible, I-22).
    for (const t of spokenBy('selene')) {
      if (t.key.startsWith('scenes.mem:selene:5.') || t.line?.if?.full === 'selene') continue;
      for (const m of t.text.matchAll(/洛恩(.?)/g)) expect(m[1], t.key).toBe('先');
    }
    expect(linesOf('mem:selene:5').some((l) => l.who === 'selene' && /洛恩(?!先生)/.test(l.text))).toBe(true);
  });

  it("Chizuru calls him 「洛恩大人」, and only her fourth piece on knows the shrine is gone", () => {
    for (const t of spokenBy('chizuru')) for (const m of t.text.matchAll(/洛恩(.?.?)/g)) expect(m[1], t.key).toBe('大人');
    const GONE = /不在了|早就不在|已經不在/;
    for (const t of storyTexts()) {
      if (!GONE.test(t.text) || !/chizuru/.test(t.key)) continue;
      expect(/^scenes\.mem:chizuru:[45]\.|^people\.chizuru\.2$/.test(t.key), t.key).toBe(true);
    }
    expect(textOf('mem:chizuru:4')).toMatch(GONE);
    expect(textOf('mem:chizuru:5')).toContain('鈴');
    expect(textOf('mem:chizuru:5')).toContain('祠');
  });

  it('Safira finds one member of her troupe in each piece, the leader last, and calls him 「小洛」', () => {
    const MEMBERS = ['鼓手', '吹笛', '縫衣裳', '牽駱駝', '團長'];
    MEMBERS.forEach((who, i) => {
      const own = textOf(memScene('safira', i + 1));
      expect(own, `mem:safira:${i + 1}`).toContain(who);
      // nobody is found before her own piece; the leader may stand beside the camel driver in piece 4 (she decides there)
      for (const other of MEMBERS.slice(i + 1)) if (!(i === 3 && other === '團長')) expect(own, `mem:safira:${i + 1} ${other}`).not.toContain(other);
    });
    expect(textOf('mem:safira:4')).not.toMatch(/[你妳]要繼續跳/);
    for (const t of spokenBy('safira')) expect(t.text, t.key).not.toContain('洛恩');
    expect(spokenBy('safira').some((t) => t.text.includes('小洛'))).toBe(true);
  });

  it('a chat never says what her pieces undo, nor what they reveal, in any piece state (fix round 1)', () => {
    // Chats play one per return and are not ordered against pieces (nextChat), and Selene's and Chizuru's pieces also drop on
    // the main road. The only piece state a line can see is `full` (all five): a line undone or revealed by an earlier piece
    // may not be in a chat at all; one undone by her last piece needs `notFull`. A revealed line needs `full` (I-58).
    for (const c of ['selene', 'chizuru', 'safira', 'sylvie', 'noel', 'bobby', 'liz', 'scarlet'] as const) {
      for (let n = 1; n <= CHAT_COUNT[c]; n++) {
        for (const full of [false, true]) {
          for (const oath of [false, true]) {
           // V2 fix 1: also with only her met, so the stand-in lines a guest leaves behind (`if.notMet`) are read too
           for (const met of [[...CHARACTER_IDS], ['hero', 'rin', c]] as CharacterId[][]) {
            const id = `chat:${c}:${n}` as SceneId;
            const played = linesWhen(STORY.scenes[id].lines, { met, full: full ? [c] : [], returned: [], oath });
            const said = played.filter((l) => l.who === c).map((l) => l.text).join('');
            const heard = played.filter((l) => l.who === c || l.who === 'narrator').map((l) => l.text).join('');
            const tag = `${id} full=${full} met=${met.length}`;
            for (const r of UNDONE.filter((x) => x.who === c)) if (full || r.piece < 5) expect(said, `${tag} ${r.re}`).not.toMatch(r.re);
            for (const r of REVEALED.filter((x) => x.who === c)) if (!full) expect(r.heard ? heard : said, `${tag} ${r.re}`).not.toMatch(r.re);
           }
          }
        }
      }
    }
    // the variants exist: before her last piece and after it, each chat still plays her
    for (const [id, c] of [['chat:selene:2', 'selene'], ['chat:chizuru:2', 'chizuru'], ['chat:sylvie:2', 'sylvie'], ['chat:noel:2', 'noel'], ['chat:liz:2', 'liz'], ['chat:scarlet:2', 'scarlet']] as const) {
      const lines = STORY.scenes[id].lines;
      expect(lines.some((l) => l.if?.notFull === c), id).toBe(true);
      expect(lines.some((l) => l.if?.full === c), id).toBe(true);
      for (const full of [false, true]) {
        const got = linesWhen(lines, { met: [...CHARACTER_IDS], full: full ? [c] : [], returned: [], oath: false });
        expect(got.some((l) => l.who === c), `${id} ${full}`).toBe(true);
        expect(got.length, `${id} ${full}`).toBe(3);
      }
    }
    // the condition itself
    const l = (ifc: ScriptLine['if']): ScriptLine => ({ who: 'narrator', text: '甲', if: ifc });
    const w = (full: string[]): LineWhen => ({ met: [], full: full as LineWhen['full'], returned: [], oath: false });
    expect(linesWhen([l({ notFull: 'selene' })], w([])).length).toBe(1);
    expect(linesWhen([l({ notFull: 'selene' })], w(['selene'])).length).toBe(0);
    expect(linesWhen([l({ notFull: 'selene' })], w(['chizuru'])).length).toBe(1);
  });

  it("Rin's line in Safira's ungated chat wears no face reserved for after her oath", () => {
    // Ruling (fix round 1): post-oath `guarded` belongs to the bellkeeper; an ungated companion chat may play after her oath.
    const rin = STORY.scenes['chat:safira:2'].lines.filter((l) => l.who === 'rin');
    expect(rin.length).toBeGreaterThan(0);
    for (const x of rin) if (x.if?.oath !== false) expect(x.mood ?? 'normal', x.text).not.toMatch(/guarded|averted/);
  });

  it("Safira's last piece knows the blaze is the desert the labyrinth swallowed (spec §6)", () => {
    expect(textOf('mem:safira:5')).toMatch(/火海.*沙漠|沙漠.*火海/);
  });

  it('their chats wait where the lore ledger says', () => {
    expect(CHAT_GATE['chat:selene:2']).toEqual({ stage: 'act3' });
    expect(CHAT_GATE['chat:chizuru:2']).toBeUndefined();
    expect(CHAT_GATE['chat:safira:2']).toBeUndefined();
  });
});

describe('Task 9: Sylvie, Noel and Bobby', () => {
  const linesOf = (id: SceneId) => STORY.scenes[id].lines;
  const textOf = (id: SceneId) => linesOf(id).map((l) => l.text).join('');
  const spokenBy = (c: string) => storyTexts().filter((t) => t.line?.who === c);
  const THREE = ['sylvie', 'noel', 'bobby'] as const;

  it('each meeting opens on the found line, then she speaks; she joins after the fight', () => {
    for (const c of THREE) {
      const { before, after } = STORY.meet[c];
      expect(before[0].who, c).toBe('narrator');
      expect(before[0].text, c).toBe(FOUND_LINE);   // story polish Task 1: the found line names nobody (ruling 2)
      expect(before.some((l) => l.who === c), c).toBe(true);
      expect(after.length, c).toBeGreaterThanOrEqual(1);
      expect(after.some((l) => l.who === c), c).toBe(true);
    }
    // the spec's pictures (§6): one arrow left and still shooting; lightning everywhere; mending a fallen machine soldier
    expect(STORY.meet.sylvie.before.map((l) => l.text).join('')).toMatch(/一支箭/);
    expect(STORY.meet.noel.before.map((l) => l.text).join('')).toMatch(/雷/);
    expect(STORY.meet.bobby.before.map((l) => l.text).join('')).toMatch(/機兵/);
    // Rin's line in a meeting is unfiltered and may come after her oath: no face reserved for before it
    for (const c of THREE) for (const l of [...STORY.meet[c].before, ...STORY.meet[c].after]) {
      if (l.who === 'rin') expect(l.mood ?? 'normal', `${c}: ${l.text}`).not.toMatch(/guarded|averted/);
    }
  });

  it('Sylvie calls him 「洛恩」, never says she brought them out before her last piece, and her seed waits for it', () => {
    for (const t of spokenBy('sylvie')) for (const m of t.text.matchAll(/洛恩(.?)/g)) expect(m[1], t.key).not.toMatch(/先|大|哥|閣/);
    // style bible: 「我把人帶出去了」 is hers only in the last piece; Lorne may say it for her before that
    for (const t of spokenBy('sylvie')) if (/帶出去了|帶出來了/.test(t.text)) expect(t.key, t.key).toMatch(/^scenes\.mem:sylvie:5\./);
    expect(linesOf('mem:sylvie:5').some((l) => l.who === 'sylvie' && /帶出去了/.test(l.text))).toBe(true);
    expect(textOf('mem:sylvie:1')).toMatch(/沼澤/);
    expect(textOf('mem:sylvie:1')).toMatch(/林子/);
    expect(textOf('mem:sylvie:5')).toContain('種子');
    for (const n of [1, 2, 3, 4]) expect(textOf(memScene('sylvie', n)), `mem:sylvie:${n}`).not.toContain('種子');
  });

  it("Noel says 「喂，歸來者」 until her memories are whole, then 「洛恩」 with a blush; her teacher is the merchant in her last piece", () => {
    const full = (key: string, line?: ScriptLine) => key.startsWith('scenes.mem:noel:5.') || line?.if?.full === 'noel';
    for (const t of spokenBy('noel')) {
      if (t.text.includes('洛恩')) expect(full(t.key, t.line), t.key).toBe(true);
      if (t.text.includes('歸來者')) expect(full(t.key, t.line), t.key).toBe(false);
    }
    const named = spokenBy('noel').filter((t) => t.text.includes('洛恩'));
    expect(named.length).toBeGreaterThan(0);
    for (const t of named) expect(t.line!.mood, t.key).toBe('blush');
    expect(spokenBy('noel').some((t) => t.text.includes('喂，歸來者'))).toBe(true);
    // the spec's line of memories: the stolen book, the star fire that burns her own memory, the teacher who protected her
    expect(textOf('mem:noel:1')).toMatch(/書/);
    expect(textOf('mem:noel:3')).toMatch(/星火/);
    expect(textOf('mem:noel:4')).toMatch(/老師/);
    for (const n of [1, 2]) expect(textOf(memScene('noel', n)), `mem:noel:${n}`).not.toMatch(/燒掉|燒光|為薪/);
    // the merchant speaks in her last piece, in his recovered voice (style bible): her name, no scolding for the book.
    // Fix round 1: later tasks (Task 11's merchant lines) may give him lines elsewhere; he never speaks in her story before it.
    const reunion = linesOf('mem:noel:5').filter((l) => l.who === 'merchant');
    expect(reunion.length).toBeGreaterThan(0);
    expect(reunion.some((l) => l.text.includes('諾艾兒'))).toBe(true);
    for (const l of reunion) expect(l.text).not.toMatch(/偷|本小姐/);
    for (const l of reunion) expect(PLACEHOLDERS.has(l.text), l.text).toBe(false);   // not the greeting still waiting for Task 11
    const beforeReunion = (key: string) => /^scenes\.mem:noel:[1-4]\.|^scenes\.chat:noel:|^meet\.noel\.|^people\.noel\.[01]$/.test(key);
    for (const t of storyTexts()) {
      if (beforeReunion(t.key)) expect(t.line?.who, t.key).not.toBe('merchant');
      if (beforeReunion(t.key) && t.line?.who === 'noel') expect(t.text, t.key).not.toMatch(/商人/);
    }
  });

  it("Bobby calls him 「洛恩哥」, and her last piece ends on the spec's line, said nowhere else", () => {
    for (const t of spokenBy('bobby')) for (const m of t.text.matchAll(/洛恩(.?)/g)) expect(m[1], t.key).toBe('哥');
    expect(spokenBy('bobby').some((t) => t.text.includes('洛恩哥'))).toBe(true);
    const QUOTE = '祖先造錯的東西，我來修好。';
    const last = linesOf('mem:bobby:5').slice(-1)[0];
    expect(last.who).toBe('bobby');
    expect(last.text).toBe(`「${QUOTE}」`);
    // Fix round 1: the finale (Task 14) may echo it; nothing of hers before her last piece says it.
    const beforeLast = (key: string) => /^scenes\.mem:bobby:[1-4]\.|^scenes\.chat:bobby:|^meet\.bobby\.|^people\.bobby\.[01]$/.test(key)
      || (key.startsWith('scenes.mem:bobby:5.') && key !== 'scenes.mem:bobby:5.lines.3.text');
    for (const t of storyTexts()) if (beforeLast(t.key)) expect(t.text, t.key).not.toContain(QUOTE);
    expect(textOf('mem:bobby:3')).toMatch(/什麼記憶都能裝|無論何種記憶/);   // spec §6: the ancestors' guilt
    for (const t of spokenBy('bobby')) expect(t.text, t.key).not.toContain('修不好');   // style bible: never says it can't be fixed
  });

  it("their pages and pieces keep to her own story: no act content (I-58)", () => {
    const ACT = /登記簿|靜鐘會|艾斯特拉|守燈人|燈鑰|燈喰/;
    for (const t of storyTexts()) {
      if (THREE.some((c) => ownerOf(t.key) === c || t.key.startsWith(`people.${c}.`))) expect(t.text, t.key).not.toMatch(ACT);
    }
  });

  it('their chats are open as soon as she is met', () => {
    for (const c of THREE) expect(CHAT_GATE[`chat:${c}:2`], c).toBeUndefined();
  });
});

describe('Task 10: Liz, Scarlet and the survive line', () => {
  const linesOf = (id: SceneId) => STORY.scenes[id].lines;
  const textOf = (id: SceneId) => linesOf(id).map((l) => l.text).join('');
  const spokenBy = (c: string) => storyTexts().filter((t) => t.line?.who === c);
  const TWO = ['liz', 'scarlet'] as const;
  const read = (id: SceneId, returned: boolean) =>
    linesWhen(linesOf(id), { met: [...CHARACTER_IDS], full: [...CHARACTER_IDS], returned: returned ? ['orik'] : [], oath: false });

  it('a line can wait for a fragment not yet returned', () => {
    const l = (ifc: ScriptLine['if']): ScriptLine => ({ who: 'narrator', text: '甲', if: ifc });
    const w = (returned: string[]): LineWhen => ({ met: [], full: [], returned: returned as LineWhen['returned'], oath: false });
    expect(linesWhen([l({ notReturned: 'orik' })], w([])).length).toBe(1);
    expect(linesWhen([l({ notReturned: 'orik' })], w(['orik'])).length).toBe(0);
    expect(linesWhen([l({ notReturned: 'orik' })], w(['marta'])).length).toBe(1);
    expect(linesWhen([l({ returned: 'orik' })], w([])).length).toBe(0);
  });

  it('each meeting opens on the found line, then she speaks; she joins after the fight', () => {
    for (const c of TWO) {
      const { before, after } = STORY.meet[c];
      expect(before[0].who, c).toBe('narrator');
      expect(before[0].text, c).toBe(FOUND_LINE);   // story polish Task 1: the found line names nobody (ruling 2)
      expect(before.some((l) => l.who === c), c).toBe(true);
      expect(after.length, c).toBeGreaterThanOrEqual(1);
      expect(after.some((l) => l.who === c), c).toBe(true);
    }
    // the spec's pictures (§6): a locked vault, gold, too hungry to stand; a gate, her and the fortress's machine soldiers
    const liz = STORY.meet.liz.before.map((l) => l.text).join('');
    for (const word of ['寶庫', '金幣', '餓']) expect(liz, word).toContain(word);
    const scarlet = STORY.meet.scarlet.before.map((l) => l.text).join('');
    for (const word of ['城門', '機兵']) expect(scarlet, word).toContain(word);
    // style bible: Liz bargains, she never begs
    for (const l of [...STORY.meet.liz.before, ...STORY.meet.liz.after]) if (l.who === 'liz') expect(l.text).not.toMatch(/求求|拜託/);
  });

  it("the survive line ends Scarlet's story fight in her own name, as story copy", () => {
    expect(PLACEHOLDERS.has(STORY.survived)).toBe(false);
    expect(STORY.survived).toContain(CHARACTERS.scarlet.name);
    expect(STORY.survived).toMatch(/劍/);
    expect(STORY.survived).not.toMatch(/公主|朋友|逃|洛恩/);   // she has remembered nothing yet, and does not know his name
  });

  it("Liz calls him 「老大」, goes quiet at her family, and never names her father before the reveal", () => {
    for (const t of spokenBy('liz')) expect(t.text, t.key).not.toContain('洛恩');
    expect(spokenBy('liz').some((t) => t.text.includes('老大'))).toBe(true);
    expect(spokenBy('liz').some((t) => t.line!.mood === 'hushed')).toBe(true);
    expect(spokenBy('liz').some((t) => t.line!.mood === 'scheming')).toBe(true);
    // Reveal table: she is Orik's daughter only in the lines that know both halves are back (mem:liz:5 with orik returned).
    for (const t of storyTexts()) {
      if (!(ownerOf(t.key) === 'liz' || t.key.startsWith('people.liz.') || t.key === 'survived')) continue;
      if (t.key.startsWith('scenes.home:liz.')) continue;   // after her last piece: its own test (continuity fix 2)
      expect(t.text, t.key).not.toContain('爸爸的店');
      if (/歐里克/.test(t.text)) expect(t.key.startsWith('scenes.mem:liz:5.') && t.line?.if?.returned === 'orik', t.key).toBe(true);
      if (t.line?.who === 'orik') expect(t.line.if?.returned, t.key).toBe('orik');
    }
    for (const n of [1, 2, 3, 4]) expect(textOf(memScene('liz', n)), `mem:liz:${n}`).not.toMatch(/歐里克|道具店|露米亞/);
    expect(STORY.scenes['mem:liz:5'].summary).not.toMatch(/歐里克|道具店/);
  });

  it("Liz's last piece is whole either way: her father's face, and the reunion only once Orik's fragment is back", () => {
    const alone = read('mem:liz:5', false);
    const both = read('mem:liz:5', true);
    expect(alone.length).toBe(4);
    expect(both.length).toBe(4);
    for (const r of [alone, both]) expect(r.map((l) => l.text).join('')).toMatch(/臉/);
    expect(alone.map((l) => l.text).join('')).not.toMatch(/歐里克/);
    expect(alone.some((l) => l.who === 'orik')).toBe(false);
    expect(both.some((l) => l.who === 'orik')).toBe(true);
    expect(both.map((l) => l.text).join('')).toMatch(/歐里克/);
    expect(both.filter((l) => l.who === 'liz').map((l) => l.text).join('')).toMatch(/爸爸/);
    // spec §6 「父女…認出彼此」 (fix round 1): Orik's half too, by the red hat she hung behind the door (piece 3)
    const orik = both.filter((l) => l.who === 'orik').map((l) => l.text).join('');
    expect(orik).toMatch(/紅帽子/);
    expect(orik).toMatch(/認得/);
    expect(textOf('mem:liz:3')).toMatch(/紅帽子.*門後|門後.*紅帽子/);
    // the reading without Orik promises no particular next return (fix round 1)
    expect(alone.map((l) => l.text).join('')).not.toMatch(/回城以後|下次回城|陪我去/);
    for (const r of [alone, both]) expect(r[r.length - 1].who, 'she has the last word').toBe('liz');
    // every conditional line there belongs to one reading
    for (const l of linesOf('mem:liz:5')) if (l.if) expect(Object.keys(l.if).every((k) => k === 'returned' || k === 'notReturned'), l.text).toBe(true);
  });

  it("Scarlet says 「洛恩閣下」 until her memories are whole; the princess's words live in her last piece alone", () => {
    for (const t of spokenBy('scarlet')) {
      if (t.key.startsWith('scenes.mem:scarlet:5.') || t.line?.if?.full === 'scarlet') continue;
      for (const m of t.text.matchAll(/洛恩(.?.?)/g)) expect(m[1], t.key).toBe('閣下');
    }
    expect(spokenBy('scarlet').some((t) => t.text.includes('洛恩閣下'))).toBe(true);
    expect(linesOf('mem:scarlet:5').some((l) => l.who === 'scarlet' && /洛恩(?!閣下)/.test(l.text))).toBe(true);
    const QUOTE = '妳不是盾，妳是我的朋友。活下去。';
    for (const t of storyTexts()) if (t.text.includes(QUOTE)) expect(t.key, t.key).toMatch(/^scenes\.mem:scarlet:5\./);
    expect(textOf('mem:scarlet:5')).toContain(QUOTE);
    for (const n of [1, 2, 3, 4]) expect(textOf(memScene('scarlet', n)), `mem:scarlet:${n}`).not.toMatch(/朋友|活下去|撤退/);
    // spec §6: she believes she fled (her third piece); she swears by her sword
    expect(textOf('mem:scarlet:3')).toMatch(/逃/);
    expect(textOf('mem:scarlet:3')).toMatch(/號角/);   // the horns she runs from are the retreat of her last piece
    expect(textOf('mem:scarlet:5')).toMatch(/撤退的號角/);
    expect(spokenBy('scarlet').some((t) => t.line!.mood === 'vow')).toBe(true);
    expect(spokenBy('scarlet').some((t) => t.line!.mood === 'shaken')).toBe(true);
  });

  it('their pages and pieces keep to her own story: no act content, and each page waits for its pieces (I-58)', () => {
    const ACT = /登記簿|靜鐘會|艾斯特拉|守燈人|燈鑰|燈喰/;
    for (const t of storyTexts()) {
      if (TWO.some((c) => ownerOf(t.key) === c || t.key.startsWith(`people.${c}.`)) || t.key === 'survived') expect(t.text, t.key).not.toMatch(ACT);
    }
    // page 1 is the meeting, page 2 pieces 1-3, page 3 pieces 4-5
    expect(STORY.people.liz[0]).not.toMatch(/櫃檯|債|帽子|星燈|爸爸|父親/);
    expect(STORY.people.liz[1]).not.toMatch(/寶庫的門|麵包|父親|爸爸|歐里克/);
    expect(STORY.people.liz[2]).not.toMatch(/歐里克|道具店/);
    expect(STORY.people.scarlet[0]).not.toMatch(/誓|國家|逃|公主|朋友/);
    expect(STORY.people.scarlet[1]).not.toMatch(/公主|朋友|撤退|活下去/);
  });

  it('their chats are open as soon as she is met', () => {
    for (const c of TWO) expect(CHAT_GATE[`chat:${c}:2`], c).toBeUndefined();
  });
});

describe('Task 10b: why the two of them go down together', () => {
  const OPENING = ['prologue-inn', 'first-return'] as const;
  const lines = (id: SceneId) => STORY.scenes[id].lines;
  const said = (id: SceneId, who: string) => lines(id).filter((l) => l.who === who).map((l) => l.text);

  it('the approved prologue is untouched: twelve lines, from the dawn plaza to 「歸來者」', () => {
    const p = lines('prologue');
    expect(p).toHaveLength(12);
    expect(p[0].text).toBe('黎明前的傳送門廣場。暮霧貼著石板流動，西邊高地上的星燈，淡得像快燒盡的燭火。');
    expect(p[2].text).toBe('「沒人走進去，門卻自己亮了。這小子抓著那女孩的手腕，把她拖了出來，走了三步就倒了。」');
    expect(p[10].text).toBe('「回復藥五瓶，歸還之燈一盞。在下面迷路了就點燈，星燈會把你們拉回來。」');
    expect(p[11].text).toBe('從那天起，鎮上的人叫他「歸來者」──唯一從迷宮深處走出來的人。');
  });

  it('each scene is ten lines at most, one reading, spoken by the two of them and the narrator', () => {
    for (const id of OPENING) {
      expect(lines(id).length, id).toBeGreaterThanOrEqual(4);
      expect(lines(id).length, id).toBeLessThanOrEqual(10);
      for (const l of lines(id)) {
        expect(['hero', 'rin', 'narrator'], `${id}: ${l.who}`).toContain(l.who);
        expect(l.if, `${id}: ${l.text}`).toBeUndefined();   // the same for every party: nothing here depends on who is met
      }
    }
  });

  it("every spoken line wears a face of its speaker's, and Rin never looks away here", () => {
    for (const id of OPENING) {
      for (const l of lines(id)) {
        if (l.who === 'narrator') { expect(l.mood, `${id}: ${l.text}`).toBeUndefined(); continue; }
        expect(l.mood, `${id}: ${l.text} is tagged`).toBeDefined();
        expect(moodAllowed(l.who, l.mood), `${id}: ${l.who} ${l.mood}`).toBe(true);
        if (l.who === 'rin') expect(l.mood, `${id}: ${l.text}`).not.toBe('averted');
      }
      // Her eyes turn away first in her fourth piece (I-11, I-54): no line here, hers or the narrator's, shows it.
      for (const l of lines(id)) expect(l.text, `${id}: ${l.text}`).not.toMatch(/視線|移開|避開|別開|不看|別看|看路|看著地|低著頭|低頭/);
    }
  });

  it("before her reveal Rin names neither him nor 「我們」, nor the bell, the society or an order", () => {
    const BELL = ['鐘', '結社', '教團', '教義', '修會', '靜鐘', '師父', ...RIN_SECRET_TERMS];
    for (const id of OPENING) {
      for (const t of said(id, 'rin')) {
        expect(t, `${id}: ${t}`).not.toContain('洛恩');
        expect(t, `${id}: ${t}`).not.toContain('我們');
        expect(t, `${id}: ${t}`).not.toMatch(/！/);   // no exclamation before her choice
        for (const term of BELL) expect(t, `${id}: ${t}`).not.toContain(term);
      }
      // Nothing here tells what her seventh piece or the finale will: the knife, the floors she followed him, the keeper, the key.
      const all = [...lines(id).map((l) => l.text), STORY.scenes[id].summary].join('');
      expect(all, id).not.toMatch(/守燈人|燈鑰|後頸|刀尖|跟了好幾層|追了|目標|殺/);
    }
  });

  it('the inn night carries the grip, the lead, the lamp, the debt and the pull, and ends on her choice to go', () => {
    const inn = lines('prologue-inn');
    const text = inn.map((l) => l.text).join('');
    expect(text).toMatch(/指痕/);   // 1. the grip: Glen could not pry his fingers off
    expect(text).toMatch(/掰/);
    expect(text).toMatch(/線索/);   // 2. each other's only lead
    expect(text).toMatch(/同一盞燈/);   // 3. one lamp for the two of them (I-83)
    expect(text).toMatch(/欠/);   // 4. the debt, and only the depths pay it
    expect(text).toMatch(/碎片/);
    expect(text).toMatch(/睡不著/);   // 5. she cannot sleep without knowing where he is
    const go = inn.findIndex((l) => l.who === 'rin' && l.text.includes('我跟你去'));
    const why = inn.findIndex((l) => l.who === 'hero' && l.text.includes('為什麼'));
    const left = inn.findIndex((l) => l.who === 'rin' && l.text.includes('只剩迷宮'));   // story polish Task 2 (audit A7)
    expect(go).toBeGreaterThanOrEqual(0);
    expect(why).toBeGreaterThan(go);
    expect(left).toBeGreaterThan(why);
    // and then one line: the way he walks seems familiar (her seventh piece pays it off; I-85)
    expect(inn.slice(left + 1)).toHaveLength(1);
    expect(inn[inn.length - 1].who).toBe('rin');
    expect(inn[inn.length - 1].text).toMatch(/走路/);
  });

  it("review fixes: the lamp has its own line and its consequence, the sleepless beat is the narrator's, and the reasons are spread", () => {
    const inn = lines('prologue-inn');
    // The lamp, the strongest reason, answers 「為什麼？」 alone: one lamp for those who go down together, none for one alone.
    const why = inn.findIndex((l) => l.who === 'hero' && l.text.includes('為什麼'));
    const lamp = inn[why + 1];
    expect(lamp.who).toBe('rin');
    expect(lamp.text).toMatch(/同一盞燈/);
    expect(lamp.text).toMatch(/一個人下去/);
    expect(lamp.text).not.toMatch(/線索|只剩/);
    // The lead and the debt come before her choice, each in a line of its own.
    const lead = inn.findIndex((l) => l.who === 'rin' && l.text.includes('線索'));
    const debt = inn.findIndex((l) => l.who === 'hero' && l.text.includes('欠'));
    const go = inn.findIndex((l) => l.text.includes('我跟你去'));
    expect(lead).toBeGreaterThanOrEqual(0);
    expect(lead).toBeLessThan(go);
    expect(debt).toBeLessThan(go);
    expect(inn[lead].text).not.toMatch(/燈|欠/);
    // Pre-reveal Rin does not confess her sleeplessness; the narrator shows it.
    for (const t of said('prologue-inn', 'rin')) expect(t).not.toMatch(/睡/);
    expect(inn.some((l) => l.who === 'narrator' && /睡不著/.test(l.text))).toBe(true);
  });

  it('review fixes: the first-return scene never claims to be the first return, and leaves the window to the inn night', () => {
    const fr = STORY.scenes['first-return'];
    for (const t of [fr.title, fr.summary, ...fr.lines.map((l) => l.text)]) expect(t).not.toMatch(/第一次|頭一次|初次/);
    for (const l of fr.lines) expect(l.text).not.toMatch(/窗/);
    expect(lines('prologue-inn').some((l) => /窗/.test(l.text))).toBe(true);
    // Rin's first chat builds on the bruise the inn night showed, instead of telling the drag as news.
    const chat = said('chat:rin:1', 'rin').join('');
    expect(chat).not.toMatch(/葛倫說/);
    expect(chat).toMatch(/手腕/);
  });

  it("the first return is her first trust in a fight: 「身體自己動的。」, and she will not take his thanks", () => {
    const fr = lines('first-return');
    expect(said('first-return', 'rin').some((t) => t.includes('身體自己動的。'))).toBe(true);
    expect(said('first-return', 'hero').some((t) => t.includes('謝'))).toBe(true);
    // Her bell may be touched once, unexplained: only the narrator says so, and only once across the two scenes.
    const bells = OPENING.flatMap((id) => lines(id).filter((l) => l.text.includes('鐘')));
    expect(bells.length).toBeLessThanOrEqual(1);
    for (const l of bells) expect(l.who).toBe('narrator');
    // A skipper still learns what happened, and no more than the scene says.
    expect(STORY.scenes['first-return'].summary).toMatch(/身體自己動/);
    expect(fr.length).toBeLessThanOrEqual(10);
  });
});

describe('Task 11: the townsfolk, the merchant and the bellkeeper', () => {
  const linesOf = (id: SceneId) => STORY.scenes[id].lines;
  const textOf = (lines: ScriptLine[]) => lines.map((l) => l.text).join('');
  const when = (w: Partial<LineWhen>): LineWhen => ({ met: ['hero', 'rin'], full: [], returned: [], oath: false, ...w });
  const isLiz = (l: ScriptLine) => l.who === 'liz' || l.text.includes('莉茲');
  const isOrik = (l: ScriptLine) => l.who === 'orik' || l.text.includes('歐里克');
  const OWNERS = TOWN_FRAGMENTS.map((f) => f.id);

  it('father and daughter meet once, in whichever comes second', () => {
    // Liz's last piece: the reunion only once Orik's fragment is back.
    expect(linesWhen(linesOf('mem:liz:5'), when({ met: ['hero', 'rin', 'liz'], full: ['liz'] })).some(isOrik)).toBe(false);
    expect(linesWhen(linesOf('mem:liz:5'), when({ met: ['hero', 'rin', 'liz'], full: ['liz'], returned: ['orik'] })).some(isOrik)).toBe(true);
    // Orik's return: Liz is not there unless her memories are whole, met or not.
    for (const met of [['hero', 'rin'], ['hero', 'rin', 'liz']] as CharacterId[][]) {
      expect(linesWhen(linesOf('town:orik'), when({ met, full: [], returned: ['orik'] })).some(isLiz), met.join()).toBe(false);
    }
    const reunion = linesWhen(linesOf('town:orik'), when({ met: ['hero', 'rin', 'liz'], full: ['liz'], returned: ['orik'] }));
    expect(reunion.some(isLiz)).toBe(true);
    expect(reunion.some((l) => l.who === 'liz' && /爸爸/.test(l.text))).toBe(true);
    // Every reunion line in town:orik waits for her full memories, so a half-remembered Liz is never recognised.
    for (const l of linesOf('town:orik')) if (isLiz(l) || /認得/.test(l.text)) expect(l.if?.full, l.text).toBe('liz');
  });

  it("Orik tells Lorne of the daughter he lost and the red hat behind the door, in every reading (mem:liz:5's 「歐里克說過」)", () => {
    for (const full of [[], ['liz']] as CharacterId[][]) {
      const lines = linesWhen(linesOf('town:orik'), when({ met: ['hero', 'rin', 'liz'], full, returned: ['orik'] }));
      const orik = textOf(lines.filter((l) => l.who === 'orik'));
      expect(orik, full.join()).toMatch(/女兒/);
      expect(orik, full.join()).toMatch(/臉/);
      expect(orik, full.join()).toMatch(/紅帽子/);
      expect(orik, full.join()).toMatch(/門後/);
    }
    // the parts that play without her never name her, nor echo her pieces 2-3 (fix round 1: the debt, the IOUs, 「回家再戴」)
    const alone = textOf(linesOf('town:orik').filter((l) => !l.if));
    expect(alone).not.toMatch(/莉茲/);
    expect(alone).not.toMatch(/債|借據|賒|帳|回家再戴|說好/);
    // I-75 (一): the face he gets back is the little girl's of the year she left, so he cannot know the grown Liz in town
    expect(alone).toMatch(/出門那年/);
    expect(STORY.scenes['town:orik'].summary).not.toMatch(/債/);
    // fix round 2: he has only the little girl's face back, so he never claims to know the grown face; he knows her by the hat
    for (const id of ['town:orik', 'mem:liz:5'] as SceneId[]) {
      for (const l of linesOf(id).filter((x) => x.who === 'orik')) expect(l.text, id).not.toMatch(/認得[^。！？]{0,3}臉/);
    }
    const knows = (id: SceneId) => linesOf(id).filter((l) => l.who === 'orik' && /認得/.test(l.text));
    for (const id of ['town:orik', 'mem:liz:5'] as SceneId[]) expect(knows(id).some((l) => /帽子/.test(l.text)), id).toBe(true);
    expect(knows('town:orik')[0].text).not.toBe(knows('mem:liz:5')[0].text);
    expect(STORY.scenes['town:orik'].summary).not.toMatch(/莉茲/);
    expect(STORY.town.orik.lost + STORY.town.orik.after).not.toMatch(/莉茲/);
  });

  it('each return is told by its owner, who changes, and the reward has a reason', () => {
    for (const id of OWNERS) {
      const lines = linesOf(`town:${id}`);
      expect(lines.filter((l) => l.who === id).length, id).toBeGreaterThanOrEqual(3);
      for (const l of lines) expect(['narrator', 'hero', id, ...(id === 'orik' ? ['liz'] : [])], `${id}: ${l.who}`).toContain(l.who);
      for (const l of lines.filter((x) => x.who === 'hero' || x.who === 'liz')) expect(l.mood, `${id}: ${l.text}`).toBeDefined();
    }
    const said = (id: TownFragmentId) => textOf(linesOf(`town:${id}`));
    expect(said('orik')).toMatch(/便宜一成/);               // PERKS.shopDiscountPct
    expect(said('marta')).toMatch(/日記/);
    expect(said('marta')).toMatch(/復活羽毛/);              // her reward, and where it comes from
    expect(said('anna')).toMatch(/冒險者/);                 // spec §7.5: she was an adventurer
    expect(said('anna')).toMatch(/收購價/);
    expect(said('anna')).toMatch(/名字總要有一個/);          // the words she gave Lorne were given to her first
    expect(said('glen')).toMatch(/洛恩/);                   // he calls him by name from now on
    expect(said('glen')).toMatch(/換/);                     // the portal reroll
    expect(said('doran')).toMatch(/洛恩/);
    expect(said('doran')).toMatch(/配方/);
    // fix round 1: every fixed reward has its source in the scene (guild.ts shows it right after)
    expect(said('orik')).toMatch(/三百金幣/);
    expect(said('anna')).toMatch(/星燈之淚/);
    expect(said('glen')).toMatch(/五百金幣/);
    expect(said('doran')).toMatch(/王者之鱗/);
    expect(PERKS.shopDiscountPct).toBe(10);
  });

  it('nothing before its time: Anna and Glen keep their secrets until returned, Glen does not name the keeper', () => {
    expect(STORY.town.anna.lost).not.toMatch(/冒險者/);
    expect(STORY.town.glen.lost).not.toMatch(/洛恩|走出來|見過/);
    // Glen's fragment can be returned before the hero's 9th piece (d15 against d25): a man like you, nothing more.
    const glen = textOf(linesOf('town:glen')) + STORY.scenes['town:glen'].summary + STORY.town.glen.after;
    expect(glen).not.toMatch(/守燈人|燈鑰|燈芯|點燈/);
    expect(glen).toMatch(/像/);
    // Orik, Anna and Doran can be returned before the act nodes (other regions): no registry history, no society.
    for (const id of ['orik', 'anna', 'doran'] as const) expect(textOf(linesOf(`town:${id}`)), id).not.toMatch(/靜鐘會|登記簿|艾斯特拉|守燈人/);
  });

  it("the bellkeeper waits in fear, not malice, and keeps the finale's truths for the finale", () => {
    // bellkeeper.oath plays from Rin's choice until the finale, maybe before the hero's 9th piece.
    for (const t of STORY.bellkeeper.oath) {
      expect(t).not.toMatch(/守燈人|燈鑰|殺的一直是|晚一次|解散|散了/);
      expect(t).not.toMatch(/殺了他|洛恩/);   // doctrine, not a grudge; before the finale he does not use the name
    }
    expect(STORY.bellkeeper.oath.some((t) => /那孩子/.test(t))).toBe(true);
    expect(STORY.bellkeeper.oath.some((t) => /從深處走出來的人/.test(t))).toBe(true);
    expect(STORY.bellkeeper.oath.some((t) => /怕/.test(t))).toBe(true);
    // Rin keeps her flattened bell until the finale hands it over (I-51): he does not take it.
    for (const t of [...STORY.bellkeeper.oath, ...STORY.bellkeeper.after]) expect(t).not.toMatch(/交給了我|收下了|拿走/);
    expect(STORY.bellkeeper.after.some((t) => /散/.test(t))).toBe(true);
    expect(STORY.bellkeeper.after.some((t) => /洛恩/.test(t))).toBe(true);
  });

  it("unconditional town strings never tell Rin's choice or the society's end", () => {
    const texts = [...OWNERS.flatMap((id) => [STORY.town[id].lost, STORY.town[id].after]), STORY.merchant.lost, STORY.merchant.found];
    for (const t of texts) expect(t).not.toMatch(/解散|散了|選擇|靜鐘會|刺客/);
  });

  it("the merchant: vague while lost, Noel's teacher once found (I-68)", () => {
    expect(STORY.merchant.lost).not.toMatch(/諾艾兒|魔法|書|年輕人/);
    expect(STORY.merchant.lost).toMatch(/客人/);
    expect(STORY.merchant.found).toMatch(/諾艾兒/);
    expect(STORY.merchant.found).toMatch(/年輕人/);
    expect(STORY.merchant.found).not.toMatch(/偷/);
    // fix round 1: a greeting plays on its own, so it answers no question nobody asked
    for (const t of [STORY.merchant.lost, STORY.merchant.found, ...STORY.bellkeeper.oath, ...STORY.bellkeeper.after]) expect(t).not.toMatch(/^「?[^。！？]{0,6}？/);
    const reunion = STORY.scenes['mem:noel:5'].lines.find((l) => l.who === 'merchant')!.text;
    expect(STORY.merchant.found).not.toBe(reunion);
  });
});

describe("Task 12: the town's days, stage by stage", () => {
  const FACILITIES = ['guild', 'shop', 'inn', 'gate', 'forge'] as const;
  const before = STAGES.filter((s) => s !== 'after');
  const AVOID = /視線|移開|避開|別開|不看|別看|看路|看著地|低著頭|不抬頭/;

  it('each stage sounds different', () => {
    for (let i = 1; i < STAGES.length; i++) {
      const prev = new Set(STORY.townLines[STAGES[i - 1]]);
      for (const t of STORY.townLines[STAGES[i]]) expect(prev.has(t), `${STAGES[i]}: ${t}`).toBe(false);
      for (const f of FACILITIES) {
        const g = new Set(STORY.greet[f][STAGES[i - 1]]);
        for (const t of STORY.greet[f][STAGES[i]]) expect(g.has(t), `${f} ${STAGES[i]}: ${t}`).toBe(false);
      }
    }
    expect(STORY.greet.guild.act1).not.toBe(STORY.greet.guild.act2);   // literals, not one shared array
  });

  it("act 2 shows that Lorne has noticed Rin, without her looking away yet (I-57, I-54)", () => {
    const act2 = STORY.townLines.act2;
    expect(act2.filter((t) => /凜|那孩子|那丫頭/.test(t)).length).toBeGreaterThanOrEqual(2);
    expect(act2.some((t) => /洛恩|小子|你/.test(t) && /凜|那孩子|那丫頭/.test(t))).toBe(true);
    for (const t of [...act2, ...FACILITIES.flatMap((f) => STORY.greet[f].act2)]) expect(t).not.toMatch(AVOID);
    for (const st of ['prologue', 'act1'] as Stage[]) {
      for (const t of [...STORY.townLines[st], ...FACILITIES.flatMap((f) => STORY.greet[f][st])]) expect(t, st).not.toMatch(AVOID);
    }
  });

  it("before the after stage, nothing tells Rin's choice, the society's end, or who Lorne is", () => {
    for (const st of before) {
      for (const t of [...STORY.townLines[st], ...FACILITIES.flatMap((f) => STORY.greet[f][st])]) {
        expect(t, st).not.toMatch(/解散|散了|選擇|刺客|鐘守|燈鑰|殺的一直是|晚一次/);
        expect(t, st).not.toMatch(/守燈人/);   // the legend may be told in act 4, never named as him
      }
    }
    // Rin may choose during act 4: the act-4 town says nothing that her choice would undo
    for (const t of STORY.townLines.act4) expect(t).not.toMatch(AVOID);
  });

  it('the guild crosses off the debt early (I-84)', () => {
    const early = [...STORY.greet.guild.act1, ...STORY.greet.guild.act2, ...STORY.townLines.act1, ...STORY.townLines.act2];
    expect(early.some((t) => /藥錢|房錢/.test(t) && /劃掉/.test(t))).toBe(true);
    // fix round 1: a single trip from depth 1 to 4 skips act 1, and a greeting is one of several: act 2 closes it too
    expect(STORY.greet.guild.act2.some((t) => /帳/.test(t) && /乾淨|清/.test(t))).toBe(true);
    for (const st of STAGES) for (const t of [...STORY.townLines[st], ...STORY.greet.guild[st]]) expect(t, st).not.toMatch(/欠(公會|著|的|錢|帳)/);   // once crossed off, never owed again
  });

  it('a greeting holds whether or not its speaker has her fragment back', () => {
    const say = (f: (typeof FACILITIES)[number]) => STAGES.flatMap((st) => STORY.greet[f][st]).join('|');
    expect(say('shop')).not.toMatch(/女兒|丫頭|帽子/);
    expect(say('guild')).not.toMatch(/緹雅|冒險者的時候|當過|隊長/);
    expect(say('gate')).not.toMatch(/見過|上一輪|錯覺|耳熟|十七/);
    expect(say('forge')).not.toMatch(/拿劍的|洛恩|師父|聽鐵|鐵唱|火候差/);
    expect(say('inn')).not.toMatch(/丈夫|他走的|路上小心/);
  });

  it('fix round 1: the town narrates Lorne in the third person, and greetings replay', () => {
    // narration outside quotes never says 你 (style bible §1.1); a greeting is not a one-time event
    for (const st of STAGES) for (const t of STORY.townLines[st]) expect(t.replace(/「[^」]*」/g, ''), st).not.toMatch(/你/);
    for (const st of STAGES) for (const f of FACILITIES) for (const t of STORY.greet[f][st]) expect(t, `${f} ${st}`).not.toMatch(/今天剛|剛醒來|今天說給你聽/);
    const opens = FACILITIES.map((f) => STORY.greet[f].prologue.filter((t) => /燈帶/.test(t)).length);
    expect(opens.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1);
  });

  it('the town names no companion but Rin, so it holds for any party', () => {
    const names = CHARACTER_IDS.filter((id) => id !== 'hero' && id !== 'rin').map((id) => CHARACTERS[id].name);
    for (const st of STAGES) {
      for (const t of [...STORY.townLines[st], ...FACILITIES.flatMap((f) => STORY.greet[f][st])]) {
        for (const n of names) expect(t, st).not.toContain(n);
      }
    }
  });
});

describe("Task 13: strangers' memories", () => {
  it('thirty strangers, no names', () => {
    const lines = STORY.absorb;
    expect(lines.length).toBeGreaterThanOrEqual(30);
    expect(new Set(lines).size).toBe(lines.length);
    const names = [...CHARACTER_IDS.map((c) => CHARACTERS[c].name), ...Object.values(NPC_NAMES)];
    for (const t of lines) {
      for (const n of names) expect(t, n).not.toContain(n);
      expect(t.length, t).toBeLessThanOrEqual(MAX_LINE_CHARS);
      expect(/\n/.test(t), t).toBe(false);
    }
  });

  it("a stranger's memory says nothing of the lamp, the bell, the mist or the deep (spec §7.4: mood, not lore)", () => {
    for (const t of STORY.absorb) expect(t).not.toMatch(/燈|鐘|鑰|霧|迷宮|深處|碎片|靜鐘會|守燈人|刺客|代號/);
  });
});

describe('Task 14: the finale', () => {
  const lines = () => STORY.scenes.finale.lines;
  /** Every reading the finale can play in: any companions met, any of those whole, any fragments returned; always after her choice. */
  const readings = function* (): Generator<LineWhen> {
    const returnedAll = TOWN_FRAGMENTS.map((f) => f.id);
    for (let mask = 0; mask < 1 << COMPANIONS.length; mask++) {
      const met = COMPANIONS.filter((_, i) => mask & (1 << i));
      for (let sub = mask; ; sub = (sub - 1) & mask) {
        const full = COMPANIONS.filter((_, i) => sub & (1 << i));
        for (const returned of [[], returnedAll]) yield { met: ['hero', 'rin', ...met], full: ['hero', 'rin', ...full], returned, oath: true };
        if (sub === 0) break;
      }
    }
  };

  it('the finale names every companion, met or not', () => {
    for (const c of COMPANIONS) {
      const own = lines().filter((l) => l.if?.met === c);
      expect(own.length, c).toBeGreaterThan(0);
      for (const l of own) expect(l.who, c).toBe(c);   // a met companion gives her own memory of him, in her own voice
      const named = lines().filter((l) => l.if?.notMet === c);
      expect(named.length, c).toBe(1);
      expect(named[0].who, c).toBe('hero');   // an unmet one is named by Lorne (spec §8.4)
      expect(named[0].text, c).toContain(CHARACTERS[c].name);
    }
  });

  it('the finale assumes her choice', () => {
    for (const l of lines()) expect(l.if?.oath, l.text).toBeUndefined();   // U3: it always follows her choice
  });

  it('every party hears twelve lines, one for each companion, and the beats in order', () => {
    let n = 0;
    for (const w of readings()) {
      const played = linesWhen(lines(), w);
      expect(played.length, JSON.stringify(w)).toBe(12);
      for (const c of COMPANIONS) expect(played.filter((l) => l.if?.met === c || l.if?.notMet === c).length, `${c} ${JSON.stringify(w)}`).toBe(1);
      // 1 Lorne the wick; 2 the eight; 3 the lamp, dawn and each other; 4 the bell; 5 Rin closes the game (coordinator ruling)
      expect(played[0].who).toBe('hero');
      expect(played[11].who).toBe('rin');
      const lamp = played.findIndex((l) => l.text.includes('燈穩了下來'));
      expect(lamp, 'the lamp line plays').toBe(9);
      expect(played.slice(0, lamp + 1).some((l) => l.who !== 'hero' && (l.who !== 'narrator' || /凜/.test(l.text))), 'he is not alone at the lamp').toBe(true);
      for (const i of [0, 9, 10, 11]) expect(played[i].if, `${i}`).toBeUndefined();
      expect(played.slice(1, 9).every((l) => l.if !== undefined)).toBe(true);
      expect(played[8].if?.met === 'bobby' || played[8].if?.notMet === 'bobby', 'Bobby closes the eight with the valve').toBe(true);
      n++;
    }
    expect(n).toBeGreaterThan(1000);
  });

  it("each beat says what the spec says: the wick, the valve, the light, the bell, each other", () => {
    const L = lines();
    expect(L[0].text).toMatch(/燈芯/);   // he means to burn this round's days, as every round (I-45)
    // Bobby's line is the wick repair (I-69): whole, she echoes her last piece; unmet, Lorne tells the mechanism.
    const bobby = L.filter((l) => l.if?.met === 'bobby');
    for (const l of bobby) expect(l.text).toMatch(/閥/);
    expect(bobby.some((l) => l.if?.full === 'bobby' && /祖先造錯的東西/.test(l.text) && /修好/.test(l.text))).toBe(true);
    for (const l of bobby) if (l.if?.full !== 'bobby') expect(l.text).not.toMatch(/祖先/);   // her ancestors are her pieces' to tell
    const lorne = L.find((l) => l.if?.notMet === 'bobby')!;
    expect(lorne.text).toMatch(/閥/);
    expect(lorne.text).toMatch(/燒盡/);
    const tail = L.slice(-3).map((l) => l.text);
    expect(tail[0]).toMatch(/碎片的光/);
    expect(tail[0]).toMatch(/暮霧/);
    expect(tail[0]).toMatch(/天亮/);
    // fix round 1 (§8.4, the wick): he is never alone when the lamp takes. Rin, met in every reading, puts her hand on his
    // in the same line, before the lamp steadies; each other is shown, not stated (style bible §1.1)
    expect(tail[0]).toMatch(/^凜的手/);
    expect(tail[0].indexOf('凜')).toBeLessThan(tail[0].indexOf('燈穩'));
    expect(tail[0]).not.toMatch(/找回了自己|選擇了彼此/);
    // the finale's truths are said here first (spec §3.6), as the bellkeeper hears them, with her bell and his last one
    expect(tail[1]).toMatch(/凜/);
    expect(tail[1]).toMatch(/鐘守/);
    expect(tail[1]).toMatch(/殺的一直是守燈人/);
    expect(tail[1]).toMatch(/晚一次點亮/);
    expect(tail[1]).toMatch(/最後一聲/);
    expect(tail[1]).toMatch(/結社的鐘|靜鐘會的鐘/);   // fix round 1: the society's own bell; her flattened one never rings (I-51)
    expect(tail[1]).toMatch(/散/);
    // Rin's last word echoes Lorne's from her reveal (「明天也一起回來吧。」), for everyone: after her choice she names him
    const rin = L[L.length - 1];
    expect(rin.who).toBe('rin');
    expect(rin.if).toBeUndefined();
    expect(rin.text).toMatch(/洛恩/);
    expect(rin.text).toMatch(/明天/);
    expect(rin.text).toMatch(/一起回來吧/);
    expect(rin.text).toMatch(/大家|我們/);
    expect(['smile', 'normal', 'blush', 'serious', 'sad']).toContain(rin.mood);
    expect(L.filter((l) => l.who === 'rin').length).toBe(1);
    // no companion speaks a line nobody else gets: one line each, and none of her pieces' verbatim lines but Bobby's echo
    for (const q of ['我想看見', '妳要繼續跳', '妳不是盾，妳是我的朋友。活下去。']) for (const l of L) expect(l.text).not.toContain(q);
  });

  it('the ending card stands alone, under the finale boss and the ending title', () => {
    expect(STORY.finaleBossName).toBe('燈喰之母');
    expect(STORY.endingTitle).toBe('終幕　點燈');
    const s = STORY.scenes.finale.summary;
    expect(s).toMatch(/燈喰之母/);
    expect(s).toMatch(/星燈/);
    expect(s).toMatch(/回來/);
    expect(s).toContain('從深處走出來的，再也不是一個人。');   // the closing image, bookending the prologue
  });

  it("the finale's wait points back to the town and to Rin, and gives nothing away", () => {
    const wait = STORY.finaleWait;
    expect(wait.length).toBeGreaterThanOrEqual(1);
    expect(wait.length).toBeLessThanOrEqual(2);
    const all = wait.map((l) => l.text).join('');
    expect(all).toMatch(/少了/);
    expect(all).toMatch(/凜/);
    expect(all).toMatch(/回去|回鎮|回城/);
    // it plays in act 4 before her choice, maybe before her 6th and 7th pieces: no secret, no choice, no keeper
    for (const t of [...RIN_SECRET_TERMS, '守燈人', '燈鑰', '靜鐘會', '鐘守', '選擇', '殺', '刀']) expect(all, t).not.toContain(t);
    for (const l of wait) {
      expect(l.if, l.text).toBeUndefined();   // played unfiltered
      if (l.who === 'rin') {
        expect(l.mood ?? 'normal', l.text).not.toBe('averted');
        expect(l.text).not.toContain('洛恩');
      }
    }
  });
});

describe('continuity fixes (plan 6c Task 15 Step 6)', () => {
  const linesOf = (id: SceneId) => STORY.scenes[id].lines;
  const textOf = (lines: ScriptLine[]) => lines.map((l) => l.text).join('');
  const reading = (id: SceneId, w: Partial<LineWhen>) =>
    linesWhen(linesOf(id), { met: [...CHARACTER_IDS], full: [...CHARACTER_IDS], returned: [], oath: true, ...w });

  it("fix 2: each ending spec §6 puts in the town is played, in four lines at most, by its owner", () => {
    const want: Record<string, RegExp[]> = {
      chizuru: [/祠/, /鈴/],                 // 「在露米亞的鎮邊掛起這個鈴，蓋了一座小小的祠」
      safira: [/廣場/, /鎮上的人/, /跳完/],   // 「在露米亞的廣場跳完舞團最後的那支舞，鎮上的人都來看」
      sylvie: [/發芽/, /空地/],               // 「一顆種子，在露米亞的空地發芽」
      liz: [/店門/, /紅帽子/],                // 「父女在店門口認出彼此」
    };
    for (const c of HOME_OWNERS) {
      for (const returned of [[], ['orik']] as TownFragmentId[][]) {
        const played = reading(homeScene(c), { returned });
        expect(played.length, `${c} ${returned}`).toBeGreaterThanOrEqual(2);
        expect(played.length, `${c} ${returned}`).toBeLessThanOrEqual(4);
        expect(played.some((l) => l.who === c), c).toBe(true);
        for (const re of want[c]) expect(textOf(played), `${c} ${returned} ${re}`).toMatch(re);
        for (const l of played) expect(['narrator', 'hero', c, ...(c === 'liz' ? ['orik'] : [])], `${c}: ${l.who}`).toContain(l.who);
      }
    }
    // the sprout is the homecoming's now: her chat no longer says it a second time
    for (const full of [[], ['sylvie']] as CharacterId[][]) expect(textOf(reading('chat:sylvie:2', { full })), String(full)).not.toMatch(/發芽/);
  });

  it("fix 2: Liz at the shop door reads both ways, and the hat stays behind his door until he remembers", () => {
    const without = reading('home:liz', { returned: [] });
    const withOrik = reading('home:liz', { returned: ['orik'] });
    expect(without).toHaveLength(4);
    expect(withOrik).toHaveLength(4);
    for (const l of linesOf('home:liz')) expect(Object.keys(l.if ?? {}).every((k) => k === 'returned' || k === 'notReturned'), l.text).toBe(true);
    // Without his fragment: he cannot place her face, knows the hat belongs behind his door, and she hangs it back to wait.
    const orik = textOf(without.filter((l) => l.who === 'orik'));
    expect(orik).toMatch(/門後/);
    expect(orik).toMatch(/想不起/);
    expect(orik).not.toMatch(/丫頭|女兒|爸爸|認得/);
    expect(textOf(without.filter((l) => l.who === 'liz'))).not.toMatch(/爸爸|歐里克/);
    expect(without[without.length - 1].text).toMatch(/掛回門後/);   // town:orik's 「門後還掛著」 stays true for his return
    // With it: the two know each other at the door, by the hat; not mem:liz:5's words again.
    expect(textOf(withOrik.filter((l) => l.who === 'orik'))).toMatch(/丫頭/);
    expect(textOf(withOrik)).toMatch(/紅帽子|帽子/);
    const earlier = new Set([...linesOf('mem:liz:5'), ...linesOf('town:orik')].map((l) => l.text));
    for (const l of withOrik) expect(earlier.has(l.text), l.text).toBe(false);
    // and town:orik, for her full memories, finishes it: the hat she hung back is still behind his door, waiting for her
    expect(textOf(linesOf('town:orik').filter((x) => x.if?.full === 'liz'))).toMatch(/門後那頂紅帽子/);
    expect(textOf(linesOf('town:orik').filter((x) => x.if?.full === 'liz'))).toMatch(/等著妳戴/);
  });

  it("fix 4: the bellkeeper comes to town afraid, says how the society knew, and keeps the finale's truths", () => {
    const lines = linesOf('bellkeeper-arrives');
    expect(lines.length).toBeLessThanOrEqual(6);
    for (const l of lines) expect(l.if, l.text).toBeUndefined();   // one reading: it always follows her choice
    const his = textOf(lines.filter((l) => l.who === 'bellkeeper'));
    expect(his).toMatch(/那孩子/);
    expect(his).toMatch(/沒有應|不應/);   // her flattened bell no longer answers the society's: that is how they know
    expect(his).toMatch(/從深處走出來的人/);
    expect(his).not.toMatch(/洛恩/);
    const all = textOf(lines) + STORY.scenes['bellkeeper-arrives'].summary;
    expect(all).toMatch(/發抖|怕/);
    expect(all).not.toMatch(/守燈人|燈鑰|殺的一直是|晚一次|解散|散了|殺了他/);
    // Rin may name him now, and wear the face kept for the bellkeeper
    expect(lines.some((l) => l.who === 'rin' && l.mood === 'guarded')).toBe(true);
  });

  it('fix 8: before her sixth piece Rin never knows the society by name', () => {
    for (const t of storyTexts()) {
      if (!t.key.startsWith('rinLines.') && t.line?.who !== 'rin') continue;
      if (/^scenes\.(mem:rin:[67]|rin-reveal|bellkeeper-arrives|finale)\./.test(t.key) || t.line?.if?.oath === true) continue;
      if (t.key.startsWith('scenes.chat:rin:') && CHAT_GATE[t.key.split('.')[1] as SceneId]?.oath === true) continue;
      expect(t.text, t.key).not.toContain('靜鐘會');
    }
    expect(STORY.rinLines.act3!.some((x) => x.includes('鐘'))).toBe(true);   // she still hears a bell
  });

  it("fix 9: the inn night gives Lorne a reason of his own: why he walked out of the deep", () => {
    const hero = linesOf('prologue-inn').filter((l) => l.who === 'hero').map((l) => l.text);
    const own = hero.find((t) => t.includes('欠'))!;
    expect(own).toMatch(/走出來/);
    expect(own).toMatch(/怎麼會/);   // not 「為什麼」: that word is his question to her, answered by the lamp
    expect(own).toMatch(/下面/);
    expect(linesOf('prologue-inn').length).toBeLessThanOrEqual(10);
  });

  it('fix 10: the two share one room, so nothing in town gives him a room of his own', () => {
    for (const t of storyTexts()) expect(t.text, t.key).not.toMatch(/你房裡|你的房間|他的房間|她的房間|凜的房間|各自的房/);
  });

  it('fix 11: Rin wears no face kept for before or after her oath in any meeting (they play unfiltered)', () => {
    for (const m of MEETINGS) for (const l of [...STORY.meet[m.id].before, ...STORY.meet[m.id].after]) {
      if (l.who === 'rin') expect(l.mood ?? 'normal', `${m.id}: ${l.text}`).not.toMatch(/guarded|averted/);
    }
  });

  it('re-review: the hat is taken from behind his door in both readings; no 「我等」; no dawn tied to the reveal', () => {
    for (const returned of [[], ['orik']] as TownFragmentId[][]) {
      expect(reading('home:liz', { returned })[0].text, String(returned)).toMatch(/門後.{0,2}取下|取下門後/);
    }
    for (const l of linesOf('home:chizuru')) if (l.who === 'chizuru') expect(l.text).not.toMatch(/我等/);
    expect(linesOf('bellkeeper-arrives')[0].text).not.toMatch(/天剛亮/);
    expect(linesOf('bellkeeper-arrives')[0].text).toMatch(/幾天後/);
  });

  it("fix 15: no stranger's memory reads as Liz's home", () => {
    for (const t of STORY.absorb) expect(t).not.toMatch(/麵包|焦/);
  });
});

describe("the guild's leads (6c Task 16)", () => {
  it('every companion has one lead: the region in words and the depth in numerals, never her name', () => {
    expect(Object.keys(STORY.leads).sort()).toEqual(MEETINGS.map((m) => m.id).sort());
    for (const m of MEETINGS) {
      const t = STORY.leads[m.id];
      expect(typeof t, m.id).toBe('string');
      expect(t, m.id).toContain(m.region === 'mainline' ? '本道' : REGIONS[m.region].name);
      expect(t, m.id).toContain(`第${numeral(m.depth)}層`);
      for (const id of CHARACTER_IDS) expect(t, `${m.id} names ${id}`).not.toContain(CHARACTERS[id].name);
    }
  });

  it('a lead is placed where it can first be heard: the main road from the prologue, the regions from act 1', () => {
    expect(position('leads.selene')).toBe('prologue');
    expect(position('leads.bobby')).toBe('prologue');
    expect(position('leads.chizuru')).toBe('act1');
    expect(position('leads.scarlet')).toBe('act1');
    expect(() => position('leads.nobody')).toThrow();
  });
});

describe('V1 voice pass: the two of them, livelier (style bible §2.2 to §2.5)', () => {
  const dots = (t: string): number => (t.match(/……/g) ?? []).length;
  const opensOnDots = (t: string): boolean => /^「?……/.test(t);
  const readings = (id: SceneId): ScriptLine[][] => [false, true].map((oath) =>
    linesWhen(STORY.scenes[id].lines, { met: [...CHARACTER_IDS], full: [], returned: [], oath }));
  /** What a light scene, as played, breaks: more than one 「……」 in the scene, or a line that opens on one (§2.3). */
  const lightBreaks = (played: ScriptLine[]): string[] => [
    ...(dots(played.map((l) => l.text).join('')) > 1 ? ['more than one 「……」'] : []),
    ...played.filter((l) => opensOnDots(l.text)).map((l) => `opens on 「……」: ${l.text}`),
  ];
  /** What a heavy scene, as played, breaks: a line with two 「……」, or 「……」 in more than half of the spoken lines (§2.3). */
  const heavyBreaks = (played: ScriptLine[]): string[] => {
    const spoken = played.filter((l) => l.who !== 'narrator');
    return [
      ...played.filter((l) => dots(l.text) > 1).map((l) => `two 「……」: ${l.text}`),
      ...(spoken.filter((l) => dots(l.text) > 0).length * 2 > spoken.length ? ['「……」 in more than half the spoken lines'] : []),
    ];
  };
  /** The light scenes V1 rewrote, and the heavy ones it touched (style bible §2.2: Rin's and Lorne's chats 2–4 are heavy). */
  const LIGHT: SceneId[] = ['prologue-inn', 'first-return', 'chat:hero:1', 'chat:rin:1'];
  const HEAVY: SceneId[] = ['chat:hero:2', 'chat:hero:3', 'chat:hero:4', 'chat:rin:2', 'chat:rin:3', 'chat:rin:4'];
  const line = (who: ScriptLine['who'], text: string): ScriptLine => ({ who, text });

  it('a light scene spends one 「……」 at most, and no line opens on one', () => {
    for (const id of LIGHT) for (const played of readings(id)) expect(lightBreaks(played), id).toEqual([]);
    // the gate catches what it guards: the pre-V1 inn night (three 「……」, two of them openers) and a single opener
    const oldInn = [line('rin', '「……我什麼都不記得。你是我唯一的線索。」'), line('rin', '「……我也只剩下面了。」'), line('rin', '「……還有。你走路的樣子，我好像在哪裡看過。」')];
    expect(lightBreaks(oldInn)).toHaveLength(4);
    expect(lightBreaks([line('rin', '「……後面。」')])).toEqual(['opens on 「……」: 「……後面。」']);
    expect(lightBreaks([line('rin', '「吵是吵。……反正，我也只剩下面了。」'), line('narrator', '她走了。')])).toEqual([]);
  });

  it('a heavy chat keeps one 「……」 a line at most, in half its spoken lines at most', () => {
    for (const id of HEAVY) for (const played of readings(id)) expect(heavyBreaks(played), id).toEqual([]);
    expect(heavyBreaks([line('rin', '「……沒事。……不要問。」')])).toHaveLength(2);
    expect(heavyBreaks([line('rin', '「……沒事。」'), line('hero', '「……嗯。」'), line('rin', '「不要問。」')])).toEqual(['「……」 in more than half the spoken lines']);
    expect(heavyBreaks([line('rin', '「……沒事。」'), line('hero', '「嗯。」')])).toEqual([]);
  });

  it("Rin's town lines keep her shadow within the heavy budget, and her oath lines within the light one", () => {
    for (const [stage, lines] of Object.entries(STORY.rinLines)) {
      expect(heavyBreaks((lines ?? []).map((t) => line('rin', t))), stage).toEqual([]);
    }
    expect(lightBreaks(STORY.rinOath.map((t) => line('rin', t)))).toEqual([]);
  });

  it("Rin's lines in the meetings are deadpan: no 「……」, no face kept for either side of her oath", () => {
    const rin = MEETINGS.flatMap((m) => [...STORY.meet[m.id].before, ...STORY.meet[m.id].after]).filter((l) => l.who === 'rin');
    expect(rin.length).toBeGreaterThanOrEqual(3);
    for (const l of rin) {
      expect(dots(l.text), l.text).toBe(0);
      expect(l.mood ?? 'normal', l.text).not.toMatch(/guarded|averted/);
    }
  });

  it("a chat line of Rin's that plays on both sides of her oath wears neither guarded nor averted", () => {
    for (const id of SCENE_IDS.filter((x) => /^chat:(hero|rin):/.test(x))) {
      if (CHAT_GATE[id]?.oath === true) continue;
      for (const l of STORY.scenes[id].lines) {
        if (l.who === 'rin' && l.if?.oath === undefined) expect(l.mood ?? 'normal', `${id}: ${l.text}`).not.toMatch(/guarded|averted/);
      }
    }
  });

  it('before her choice Rin uses no sentence-final particle and no exclamation in her town lines, the opening and the chats she may say before it', () => {
    const PARTICLE = /[呢吧啦喔囉嘛耶]|！/;
    for (const t of Object.values(STORY.rinLines).flat()) expect(t, t).not.toMatch(PARTICLE);
    for (const id of ['prologue-inn', 'first-return', 'chat:rin:1', 'chat:hero:2'] as SceneId[]) {
      const rin = linesWhen(STORY.scenes[id].lines, { met: [...CHARACTER_IDS], full: [], returned: [], oath: false }).filter((l) => l.who === 'rin');
      expect(rin.length, id).toBeGreaterThan(0);
      for (const l of rin) expect(l.text, `${id}: ${l.text}`).not.toMatch(PARTICLE);
    }
  });

});

/** What a companion never says where her own memories may not be whole: a chat guest's line (V2) or a banter's (B1). */
const GUEST_NEVER: Record<string, RegExp> = {
  selene: /洛恩先生|新月|我想看見/, chizuru: /不在了|託付|回神社/, safira: /團長|做決定的|洛恩/, sylvie: /林子|守林|種子|發芽|帶出去/,
  noel: /歸來者|洛恩|星火|燒掉|老師|商人|小氣/, bobby: /祖先|一族|構造圖|閥|道歉|修好/, liz: /洛恩|債|帽子|櫃檯|星燈|光柱|爸爸/,
  scarlet: /洛恩閣下|起誓|誓言|國家|逃|公主|朋友|活下去/,
};
/** The loud ones: only they may shout (V2, bible §2.3). */
const LOUD = new Set(['noel', 'bobby', 'safira', 'liz', 'orik']);

describe('V2 voice pass: the companions sound like themselves (style bible §2.2 to §2.5, §3)', () => {
  const C = COMPANIONS;
  const dots = (t: string): number => (t.match(/……/g) ?? []).length;
  const join = (ls: ScriptLine[]): string => ls.map((l) => l.text).join('');
  /** Every way a V2 scene can play: who is met, her memories whole or not, Orik back or not, before or after Rin's choice. */
  const readings = (lines: ScriptLine[], c: CharacterId): ScriptLine[][] => {
    const out: ScriptLine[][] = [];
    for (const met of [[...CHARACTER_IDS], ['hero', 'rin', c]] as CharacterId[][]) {
      for (const full of [[], [c]] as CharacterId[][]) {
        for (const returned of [[], ['orik']] as TownFragmentId[][]) {
          for (const oath of [false, true]) out.push(linesWhen(lines, { met, full, returned, oath }));
        }
      }
    }
    return out;
  };
  /** The light scenes V2 rewrote, as they play: each meeting (before and after are one scene), chats 1-2, the homecoming. */
  const light = (): { id: string; c: CharacterId; played: ScriptLine[] }[] => C.flatMap((c) => {
    const m = STORY.meet[c as keyof typeof STORY.meet];
    const scenes: { id: string; lines: ScriptLine[] }[] = [
      { id: `meet.${c}`, lines: [...m.before, ...m.after] },
      ...[1, 2].map((n) => ({ id: `chat:${c}:${n}`, lines: STORY.scenes[`chat:${c}:${n}` as SceneId].lines })),
      ...((HOME_OWNERS as string[]).includes(c) ? [{ id: `home:${c}`, lines: STORY.scenes[homeScene(c as typeof HOME_OWNERS[number])].lines }] : []),
    ];
    return scenes.flatMap((s) => readings(s.lines, c).map((played) => ({ id: s.id, c, played })));
  });
  const chatLines = (): { id: SceneId; owner: string; line: ScriptLine }[] =>
    C.flatMap((c) => [1, 2].flatMap((n) => {
      const id = `chat:${c}:${n}` as SceneId;
      return STORY.scenes[id].lines.map((line) => ({ id, owner: c as string, line }));
    }));

  it('a light scene spends one 「……」 at most, and no line opens on one (carry from V1: meet.selene, meet.bobby)', () => {
    for (const { id, played } of light()) {
      expect(dots(join(played)), `${id}: ${join(played)}`).toBeLessThanOrEqual(1);
      for (const l of played) expect(l.text, id).not.toMatch(/^「?……/);
    }
  });

  it('exclamation marks: three a scene at most, and only the loud ones use them', () => {
    for (const { id, played } of light()) {
      // spoken lines only: the meeting's found line (`FOUND_LINE`) is narration and not anyone's voice
      const spoken = join(played.filter((l) => l.who !== 'narrator'));
      expect((spoken.match(/！/g) ?? []).length, `${id}: ${spoken}`).toBeLessThanOrEqual(3);
      for (const l of played) if (l.text.includes('！') && l.who !== 'narrator') expect(LOUD.has(l.who), `${id}: ${l.who} ${l.text}`).toBe(true);
    }
  });

  it('the companions talk to each other: a guest in a chat is met first, and keeps her own reveal rules', () => {
    const guests = chatLines().filter(({ owner, line }) => (C as string[]).includes(line.who) && line.who !== owner);
    expect(new Set(guests.map((g) => g.id)).size).toBeGreaterThanOrEqual(3);
    // a guest line never changes with her own memories, so it never names him in a form that changes (I-22, I-25, I-26)
    for (const { id, line } of guests) {
      expect(line.if?.met, `${id}: ${line.text}`).toBe(line.who);
      expect(line.text, `${id}: ${line.who}`).not.toMatch(GUEST_NEVER[line.who]);
    }
    // and a guest line has a stand-in for the parties that have not met her, so no chat goes thin (V2 fix 1: each one played)
    for (const { id, owner, line } of guests) {
      const lines = STORY.scenes[id].lines;
      const g = line.who as CharacterId;
      for (const full of [[], [owner]] as CharacterId[][]) {
        for (const oath of [false, true]) {
          const withHer = linesWhen(lines, { met: [...CHARACTER_IDS], full, returned: [], oath });
          const without = linesWhen(lines, { met: CHARACTER_IDS.filter((x) => x !== g), full, returned: [], oath });
          const tag = `${id} without ${g} full=${full.length > 0}`;
          expect(without.some((l) => l.who === g), tag).toBe(false);
          expect(without.length, tag).toBe(withHer.length);
          expect(without.some((l) => l.who === owner), tag).toBe(true);
          expect(without.some((l) => l.if?.notMet === g), tag).toBe(true);
          for (const l of without) if ((C as string[]).includes(l.who) && l.who !== owner) expect(l.if?.met, `${tag}: ${l.text}`).toBe(l.who);
        }
      }
    }
  });

  it('Scarlet never swears and Sylvie never says 「林子」 in any chat line, hers or anyone\'s narration of her', () => {
    for (const n of [1, 2]) {
      for (const l of STORY.scenes[`chat:scarlet:${n}` as SceneId].lines) if (l.if?.full !== 'scarlet') expect(l.text).not.toMatch(/起誓|誓言/);
      for (const l of STORY.scenes[`chat:sylvie:${n}` as SceneId].lines) if (l.if?.full !== 'sylvie') expect(l.text).not.toMatch(/林子/);
    }
    for (const { line } of chatLines()) if (line.who === 'scarlet') expect(line.text).not.toMatch(/起誓/);
    for (const { line } of chatLines()) if (line.who === 'sylvie') expect(line.text).not.toMatch(/林子/);
  });

  it("Rin's deadpan in the companions' scenes keeps every rule from before her choice", () => {
    const rin = [
      ...MEETINGS.flatMap((m) => [...STORY.meet[m.id].before, ...STORY.meet[m.id].after]),
      ...chatLines().map((x) => x.line),
    ].filter((l) => l.who === 'rin' && l.if?.oath !== true);
    expect(rin.length).toBeGreaterThanOrEqual(6);
    for (const l of rin) {
      expect(l.text, l.text).not.toMatch(/洛恩|我們|[呢吧啦喔囉嘛耶]|！|……|還有/);
      expect(l.mood ?? 'normal', l.text).not.toMatch(/guarded|averted/);
    }
  });

  it("forms of address between companions: Bobby's 「〇〇姊」 (a habit like 「洛恩哥」, not an age), Chizuru's 「姑娘」, Scarlet's 「小姐」", () => {
    const FORM: Record<string, string[]> = { bobby: ['姊'], chizuru: ['姑娘'], scarlet: ['小姐'] };
    const names = C.map((c) => CHARACTERS[c].name);
    let bobbyNamed = 0;
    for (const { key, text, line } of storyTexts()) {
      if (!line || !(line.who in FORM)) continue;
      for (const name of names) {
        if (name === CHARACTERS[line.who as CharacterId].name) continue;
        for (const m of text.matchAll(new RegExp(`${name}(.{0,2})`, 'g'))) {
          expect(FORM[line.who].some((f) => m[1].startsWith(f)), `${key}: ${m[0]}`).toBe(true);
          if (line.who === 'bobby') bobbyNamed++;
        }
      }
    }
    expect(bobbyNamed).toBeGreaterThanOrEqual(1);
  });

  it('the meetings keep what the finale remembers of them (lore ledger I-110)', () => {
    const all = (c: keyof typeof STORY.meet) => join([...STORY.meet[c].before, ...STORY.meet[c].after]);
    const hero = (c: keyof typeof STORY.meet) => join([...STORY.meet[c].before, ...STORY.meet[c].after].filter((l) => l.who === 'hero'));
    expect(all('selene')).toMatch(/上弦/);
    expect(all('selene')).toContain('今晚，也許會有人經過吧');
    expect(hero('chizuru')).toContain('站得起來嗎？');
    expect(all('safira')).toContain('陪我跳完一整首');
    expect(all('sylvie')).toMatch(/割斷了毒藤/);
    expect(hero('noel')).toContain('一起回去吧');
    expect(hero('scarlet')).toMatch(/守/);
    expect(all('liz')).toContain('乾糧');
  });

  it("a quiet beat keeps its own line: Liz's family line carries no joke, and her cover-up comes in the next box after a turn (bible §2.2)", () => {
    // V2 fix 1 (controller ruling): the sample's cover-up stays, as its own box after a turn word, never in the quiet line.
    // Final review issue 1: the box must exist and open on a turn word, and the quiet line before it carries no joke.
    const TURN = /^「?(好啦|再說|話說回來|算了|──)/;
    const JOKE = /老大|成交|分紅|商量|銅板|估/;
    const coverUpBreaks = (after: ScriptLine[]): string[] => {
      const i = after.findIndex((l) => l.who === 'liz' && l.mood === 'hushed' && /臉/.test(l.text));
      if (i < 0) return ['no quiet line'];
      const out: string[] = [];
      if (JOKE.test(after[i].text)) out.push('the quiet line carries a joke');
      const next = after[i + 1];
      if (!next) return [...out, 'no cover-up box'];
      if (!TURN.test(next.text)) out.push('the cover-up box opens without a turn word');
      if (!/老大|分紅|商量/.test(next.text)) out.push('the next box is not the cover-up');   // the cover-up itself (sample §5.6)
      return out;
    };
    const after = STORY.meet.liz.after;
    expect(coverUpBreaks(after)).toEqual([]);
    // the gate catches what it guards
    const i = after.findIndex((l) => l.who === 'liz' && l.mood === 'hushed');
    expect(coverUpBreaks(after.slice(0, i + 1))).toEqual(['no cover-up box']);   // the box deleted
    const sample = '「得把錢帶回家。……家人的臉，卻想不起來。老大，讓我跟著你們，分紅好商量。」';   // the sample's one-line form
    expect(coverUpBreaks([{ who: 'liz', mood: 'hushed', text: sample }])).toEqual(['the quiet line carries a joke', 'no cover-up box']);
    const noTurn = [...after.slice(0, i + 1), { ...after[i + 1], text: '「老大，讓我跟著你們吧，分紅好商量。」' }];
    expect(coverUpBreaks(noTurn)).toEqual(['the cover-up box opens without a turn word']);
  });

  it("Lorne's straight man has more than one move: one counting joke at most across V2's scenes", () => {
    // V2 fix 1: 第三十支, 第三塊, 第三遍, 第七道 had become a template. Understatement, a literal reading, a deadpan question.
    const COUNT = /第[一二三四五六七八九十]+[支塊遍道次口]|[一二三四五六七八九十]+遍了/;
    const lorne = light().flatMap(({ played }) => played).filter((l) => l.who === 'hero');
    const counting = new Set(lorne.filter((l) => COUNT.test(l.text)).map((l) => l.text));
    expect([...counting].length, [...counting].join(' / ')).toBeLessThanOrEqual(1);
    expect(COUNT.test('「那是第七道了。」') && COUNT.test('「第三遍了。」')).toBe(true);
  });

  it("Safira's own register: 唷 and 呀, not Bobby's 喔 or Liz's 啦, and 「跟上拍子囉」 is her one 囉", () => {
    const hers = light().flatMap(({ played }) => played).filter((l) => l.who === 'safira').map((l) => l.text);
    expect(hers.length).toBeGreaterThan(0);
    for (const t of hers) {
      expect(t, t).not.toMatch(/[喔啦嘛]/);
      expect(t.replace(/跟上拍子囉/g, ''), t).not.toMatch(/囉/);
    }
    expect(hers.some((t) => /[唷呀]/.test(t))).toBe(true);
  });
});

describe('V3 voice pass: the town talks (style bible §2.2 to §2.5, §3 townsfolk)', () => {
  const FACILITIES = ['guild', 'shop', 'inn', 'gate', 'forge'] as const;
  type Facility = (typeof FACILITIES)[number];
  const OWNER: Record<Facility, TownFragmentId> = { guild: 'anna', shop: 'orik', inn: 'marta', gate: 'glen', forge: 'doran' };
  const dots = (t: string): number => (t.match(/……/g) ?? []).length;
  const opens = (t: string): boolean => /^「?……/.test(t);
  /** What a counter can say in a stage: the stage's greetings and, once she has her fragment back, her thanks (facility.ts). */
  const pool = (f: Facility, st: Stage): string[] => [...STORY.greet[f][st], STORY.town[OWNER[f]].after];
  /** Everything a townsperson says at her counter, every stage. */
  const said = (f: Facility): string[] => [...STAGES.flatMap((st) => STORY.greet[f][st]), STORY.town[OWNER[f]].after];

  it('a counter spends one 「……」 a stage at most, her thanks included; the town one a stage; none opens a line', () => {
    for (const f of FACILITIES) {
      for (const st of STAGES) {
        expect(dots(pool(f, st).join('')), `${f} ${st}`).toBeLessThanOrEqual(1);
        for (const t of pool(f, st)) expect(opens(t), t).toBe(false);
      }
    }
    for (const st of STAGES) {
      expect(dots(STORY.townLines[st].join('')), st).toBeLessThanOrEqual(1);
      for (const t of STORY.townLines[st]) expect(opens(t), t).toBe(false);
    }
    // the light side: the merchant, the bellkeeper after the finale, the guild's leads
    for (const t of [STORY.merchant.lost, STORY.merchant.found, ...STORY.bellkeeper.after, ...Object.values(STORY.leads)]) {
      expect(dots(t), t).toBeLessThanOrEqual(1);
      expect(opens(t), t).toBe(false);
    }
    // the bellkeeper while he waits is the heavy side: one a line, in half his lines at most
    for (const t of STORY.bellkeeper.oath) expect(dots(t), t).toBeLessThanOrEqual(1);
    expect(STORY.bellkeeper.oath.filter((t) => dots(t) > 0).length * 2).toBeLessThanOrEqual(STORY.bellkeeper.oath.length);
    // the gate catches what it guards: Martha's act 4 pool before V3 (her stage line and her thanks)
    const oldInn = ['孩子，臉色好差。……不想說就別說，湯先喝了。', '今天多添了一道菜。吃飽了，身子才擋得住。……等一下，今天的事說給我聽。'];
    expect(dots(oldInn.join(''))).toBe(2);
  });

  it('only Orik shouts at his counter, three a stage at most; the bellkeeper never shouts or laughs', () => {
    for (const f of FACILITIES.filter((x) => x !== 'shop')) for (const t of said(f)) expect(t, f).not.toMatch(/！/);
    for (const st of STAGES) expect((STORY.greet.shop[st].join('').match(/！/g) ?? []).length, st).toBeLessThanOrEqual(3);
    for (const t of [...STORY.bellkeeper.oath, ...STORY.bellkeeper.after]) expect(t).not.toMatch(/！|哈哈/);
  });

  it('every townsperson has a running bit in most stages, and every greeting of Orik is a pitch', () => {
    const BIT: Record<Facility, RegExp> = {
      guild: /紅筆|打勾|勾|欄|表格|蓋章|規章|登記/,   // Anna: forms, checkboxes, the red pen
      shop: /好貨|算你|價|老頭子我/,                    // Orik: the pitch
      inn: /湯|日記|吃/,                                 // Martha: soup and the diary
      gate: /別逞強|呵欠/,                              // Glen: 「別逞強」 and his yawn
      forge: /鐵|爐/,                                    // Doran: iron and the fire
    };
    const MIN: Record<Facility, number> = { guild: 5, shop: 6, inn: 6, gate: 5, forge: 5 };
    for (const f of FACILITIES) {
      const stages = STAGES.filter((st) => STORY.greet[f][st].some((t) => BIT[f].test(t)));
      expect(stages.length, `${f}: ${stages.join()}`).toBeGreaterThanOrEqual(MIN[f]);
    }
    for (const st of STAGES) for (const t of STORY.greet.shop[st]) expect(t, st).toMatch(/好貨|算你|價|買|賣|帶|囤|挑|拿|光臨/);
    expect(STAGES.filter((st) => STORY.greet.gate[st].some((t) => /別逞強/.test(t))).length).toBeGreaterThanOrEqual(4);
  });

  it('a running bit comes back changed: no two greetings of one townsperson share a clause, her catchphrases aside', () => {
    // the catchphrases are meant to recur (style bible §3); what follows them must not
    const CATCH = new Set(['今天也請平安歸來', '門還開著', '好鐵配好手藝', '爐火正旺', '歡迎光臨', '歡迎回來', '去吧']);
    const clauses = (t: string): string[] => t.replace(/[「」『』]/g, '').split(/[。！？，：、]|──/).filter((c) => c.length >= 4 && !CATCH.has(c));
    for (const f of FACILITIES) {
      const seen = new Map<string, string>();
      for (const t of said(f)) {
        for (const c of new Set(clauses(t))) {
          expect(seen.get(c), `${f}: 「${c}」 in ${seen.get(c)} and ${t}`).toBeUndefined();
          seen.set(c, t);
        }
      }
    }
    // the splitter: the catchphrase and short beats are not counted, the clauses around them are
    expect(clauses('下去之前，燈帶了嗎？……好。今天也請平安歸來。')).toEqual(['下去之前', '燈帶了嗎']);
  });

  it('Doran says it in few words', () => {
    for (const t of said('forge')) expect([...t].length, t).toBeLessThanOrEqual(28);
  });

  it("the leads keep each sighting's picture (lore ledger I-127 to I-134), whatever Anna adds", () => {
    const PICTURE: Record<string, string[]> = {
      selene: ['水晶洞窟', '看見了月光', '照不到天的洞裡', '跪著一個人影', '登記表上，還沒有這個人'],
      chizuru: ['霜凍之地回來的人', '冰裡', '握長槍的人', '姿勢像在做什麼儀式'],
      safira: ['火海', '一個人跳著劍舞', '那拍子像在等誰跟上'],
      sylvie: ['一直有弓弦的聲音', '一響就有怪物倒下', '箭，總有用完的時候'],
      noel: ['岩台上', '雷整天亂劈', '雷光裡有個小小的人影', '連自己腳邊都劈', '撐不了多久'],
      bobby: ['星燈神殿', '一直傳出扳手的聲音', '倒下的古代機兵身上趴著一個人', '怪物圍過來也不抬頭'],
      liz: ['寶庫的鎖被撬開了', '金幣堆成小山', '旁邊靠著一個人', '一直沒有站起來'],
      scarlet: ['一位騎士舉著燃燒的劍', '守在城門前', '靠近的人，全被趕了回來', '把隊伍整好'],
    };
    for (const m of MEETINGS) for (const p of PICTURE[m.id]) expect(STORY.leads[m.id], m.id).toContain(p);
  });
});

describe('B1: town banter, two companions on their own (voice-pass sample §6)', () => {
  type Gate = { stage?: Stage; oath?: true; full?: CharacterId };
  const dots = (t: string): number => (t.match(/……/g) ?? []).length;
  const PRE_OATH_RIN = /洛恩|我們|[呢吧啦喔囉嘛耶]|！|……|還有/;
  const RIN_AVOID = /視線|移開|避開|別開|不看|別看|低著頭/;
  const banterIds = (): SceneId[] => SCENE_IDS.filter((id) => sceneKind(id) === 'banter');
  /**
   * What a banter breaks, in every reading its gate allows: the cap; speakers (its two, Lorne, the narrator); Lorne once at
   * most; both of the two speak; the light budget (one 「……」, none opening a line); three 「！」 and only from the loud;
   * faces; Rin's rules before her choice; each one's reveal rules while her memories may not be whole; Safira's and Sylvie's
   * registers.
   */
  const banterBreaks = (id: SceneId, lines: ScriptLine[], gate: Gate = {}): string[] => {
    const out: string[] = [];
    const [a, b] = id.split(':')[1].split('-') as CharacterId[];
    const two = [a, b];
    const others = COMPANIONS.filter((c) => !two.includes(c));
    const returnedAll = TOWN_FRAGMENTS.map((f) => f.id);
    const metOf = (extra: CharacterId[]): CharacterId[] => [...new Set<CharacterId>(['hero', 'rin', ...two, ...extra])];
    for (const met of [[...CHARACTER_IDS], metOf([]), metOf(others.slice(0, 3))]) {
      // B2 fix 1: with a `full` gate, also the reading where only she is full: her partner's memories may not be whole
      for (const full of [[], ...(gate.full ? [[gate.full]] : []), two, [...CHARACTER_IDS]] as CharacterId[][]) {
        if (gate.full && !full.includes(gate.full)) continue;
        for (const returned of [[], returnedAll] as TownFragmentId[][]) {
          for (const oath of gate.oath ? [true] : [false, true]) {
            const played = linesWhen(lines, { met, full, returned, oath });
            const tag = `${id} (oath ${oath}, full ${full.length})`;
            if (played.length < 1 || played.length > lineCap(id)) out.push(`${tag}: plays ${played.length} lines`);
            const spoken = played.filter((l) => l.who !== 'narrator');
            for (const l of played) {
              if (![...two, 'hero', 'narrator'].includes(l.who)) out.push(`${tag}: ${l.who} speaks`);
              if (!moodAllowed(l.who, l.mood)) out.push(`${tag}: ${l.who} wears ${l.mood}`);
              if (/^「?……/.test(l.text)) out.push(`${tag}: opens on 「……」: ${l.text}`);
              if (l.text.includes('！') && l.who !== 'narrator' && !LOUD.has(l.who)) out.push(`${tag}: ${l.who} shouts`);
              if (l.who === 'rin' && !oath) {
                if (PRE_OATH_RIN.test(l.text)) out.push(`${tag}: Rin before her choice: ${l.text}`);
                if (/guarded|averted/.test(l.mood ?? '')) out.push(`${tag}: Rin wears ${l.mood} before her choice`);
              }
              const never = GUEST_NEVER[l.who];
              if (never && !full.includes(l.who as CharacterId) && never.test(l.text)) out.push(`${tag}: ${l.who} tells her own story: ${l.text}`);
              if (l.who === 'safira' && (/[喔啦嘛]/.test(l.text) || /囉/.test(l.text.replace(/跟上拍子囉/g, '')))) out.push(`${tag}: Safira in someone else's register: ${l.text}`);
              if (l.who === 'sylvie' && /[呢吧啦喔囉嘛耶唷呀～]/.test(l.text)) out.push(`${tag}: Sylvie uses a particle: ${l.text}`);
            }
            // fix round 1: the chats' spoiler tables, for both of the two; the narration and Lorne's lines too (fix round 2),
            // except for her forms of address (they may name anyone)
            const narration = played.filter((l) => l.who === 'narrator' || l.who === 'hero').map((l) => l.text).join('');
            for (const c of two.filter((x) => x !== 'rin')) {
              const fullC = full.includes(c);
              const said = played.filter((l) => l.who === c).map((l) => l.text).join('');
              for (const r of UNDONE.filter((x) => x.who === c)) if ((fullC || r.piece < 5) && r.re.test(said)) out.push(`${tag}: ${c} says what piece ${r.piece} undoes: ${r.re}`);
              // B2 fix 1: her partner may not tell her secrets either
              const partner = played.filter((l) => l.who !== c && (two as string[]).includes(l.who)).map((l) => l.text).join('');
              for (const r of REVEALED.filter((x) => x.who === c)) {
                if (fullC) continue;
                if (r.re.test(said)) out.push(`${tag}: ${c} says what her pieces reveal: ${r.re}`);
                if (!r.re.source.startsWith('洛恩') && r.re.test(narration)) out.push(`${tag}: the narration or Lorne tells what ${c}'s pieces reveal: ${r.re}`);
                if (!r.re.source.startsWith('洛恩') && r.re.test(partner)) out.push(`${tag}: her partner tells what ${c}'s pieces reveal: ${r.re}`);
              }
            }
            if (spoken.filter((l) => l.who === 'hero').length > 1) out.push(`${tag}: Lorne says more than one line`);
            for (const c of two) if (!spoken.some((l) => l.who === c)) out.push(`${tag}: ${c} says nothing`);
            if (dots(played.map((l) => l.text).join('')) > 1) out.push(`${tag}: more than one 「……」`);
            if ((spoken.map((l) => l.text).join('').match(/！/g) ?? []).length > 3) out.push(`${tag}: more than three 「！」`);
          }
        }
      }
    }
    // fix round 1: Rin in a banter her oath does not gate wears only normal or serious (sample §3), and looks away only
    // where her fourth piece is in hand (a gate to act 3 or later) or her choice is made
    const avoidOk = !!gate.oath || (!!gate.stage && STAGES.indexOf(gate.stage) >= STAGES.indexOf('act3'));
    for (const l of lines) {
      if (l.who !== 'rin' || l.if?.oath === true) continue;
      if (!gate.oath && !['normal', 'serious'].includes(l.mood ?? 'normal')) out.push(`${id}: Rin wears ${l.mood} in a banter her oath does not gate`);
      if (!avoidOk && RIN_AVOID.test(l.text)) out.push(`${id}: Rin looks away before her fourth piece: ${l.text}`);
    }
    return [...new Set(out)];
  };
  const L = (who: ScriptLine['who'], text: string, mood?: StoryMood, c?: ScriptLine['if']): ScriptLine => ({ who, text, ...(mood ? { mood } : {}), ...(c ? { if: c } : {}) });
  const N = (text: string): ScriptLine => ({ who: 'narrator', text });

  it('every banter is two companions, sorted, with a cap of four lines, and a title that names both', () => {
    expect(banterIds().length).toBeGreaterThanOrEqual(3);
    for (const id of banterIds()) {
      const m = /^banter:([a-z]+)-([a-z]+):(\d+)$/.exec(id);
      expect(m, id).not.toBeNull();
      const [, a, b] = m!;
      expect(a < b, id).toBe(true);
      expect([...COMPANIONS, 'rin']).toEqual(expect.arrayContaining([a, b]));
      expect(lineCap(id)).toBe(4);
      expect(STORY.scenes[id].title).toContain(CHARACTERS[a as CharacterId].name);
      expect(STORY.scenes[id].title).toContain(CHARACTERS[b as CharacterId].name);
    }
    for (const id of Object.keys(BANTER_GATE)) expect(sceneKind(id as SceneId), id).toBe('banter');
  });

  it('every banter passes its gates in every reading: speakers met by the gate, Lorne once, the light budget, Rin before her choice, faces, registers', () => {
    for (const id of banterIds()) expect(banterBreaks(id, STORY.scenes[id].lines, BANTER_GATE[id])).toEqual([]);
  });

  it('the banter gate catches what it guards', () => {
    const id = 'banter:noel-rin:1' as SceneId;
    const ok = [L('noel', '「喂，凜！」', 'smug'), L('rin', '「嗯。」', 'normal')];
    expect(banterBreaks(id, ok)).toEqual([]);
    const breaks = (lines: ScriptLine[], gate?: Gate) => banterBreaks(id, lines, gate).join(' | ');
    expect(breaks([...ok, L('selene', '「也許呢。」')])).toMatch(/selene speaks/);
    expect(breaks([...ok, L('hero', '「好。」'), L('hero', '「走吧。」')])).toMatch(/Lorne says more than one line/);
    expect(breaks([L('noel', '「喂，凜！」', 'smug')])).toMatch(/rin says nothing/);
    expect(breaks([...ok, L('narrator', '一。'), L('narrator', '二。'), L('narrator', '三。')])).toMatch(/plays 5 lines/);
    expect(breaks([L('noel', '「喂……凜。」'), L('rin', '「嗯……」')])).toMatch(/more than one 「……」/);
    expect(breaks([L('noel', '「……喂。」'), L('rin', '「嗯。」')])).toMatch(/opens on/);
    expect(breaks([L('noel', '「喂！喂！喂！喂！」'), L('rin', '「嗯。」')])).toMatch(/more than three/);
    expect(breaks([L('noel', '「喂。」'), L('rin', '「洛恩，走。」')])).toMatch(/Rin before her choice/);
    expect(breaks([L('noel', '「喂。」'), L('rin', '「我們走。」')])).toMatch(/Rin before her choice/);
    expect(breaks([L('noel', '「喂。」'), L('rin', '「嗯。」', 'guarded')])).toMatch(/Rin wears guarded/);
    expect(breaks([L('noel', '「喂。」'), L('rin', '「嗯。」', 'smug')])).toMatch(/rin wears smug/);
    expect(breaks([L('noel', '「老師說的。」'), L('rin', '「嗯。」')])).toMatch(/noel tells her own story/);
    // an oath-gated banter, or a line that waits for her choice, may let Rin say his name
    expect(banterBreaks(id, [L('noel', '「喂。」'), L('rin', '「洛恩，走。」')], { oath: true })).toEqual([]);
    expect(banterBreaks(id, [L('noel', '「喂。」'), L('rin', '「洛恩，走。」', undefined, { oath: true }), L('rin', '「走。」', undefined, { oath: false })])).toEqual([]);
    // a line that waits for her full memories may tell her story
    expect(banterBreaks(id, [L('noel', '「老師說的。」', undefined, { full: 'noel' }), L('noel', '「喂。」', undefined, { notFull: 'noel' }), L('rin', '「嗯。」')])).toEqual([]);
    // fix round 1: the spoiler tables, for both of the two and the narration
    const ls = 'banter:liz-scarlet:1' as SceneId;
    expect(banterBreaks(ls, [L('liz', '「歐里克那邊的貨，我去看過了。」'), L('scarlet', '「收到。」')]).join(' | ')).toMatch(/liz says what her pieces reveal/);
    expect(banterBreaks(ls, [N('遠處傳來號角聲。'), L('liz', '「走吧。」'), L('scarlet', '「收到。」')]).join(' | ')).toMatch(/the narration or Lorne tells what scarlet's pieces reveal/);
    expect(banterBreaks(ls, [L('liz', '「走吧。」'), L('hero', '「妳是歐里克的女兒吧。」'), L('scarlet', '「收到。」')]).join(' | ')).toMatch(/the narration or Lorne tells what liz's pieces reveal/);
    expect(banterBreaks(ls, [L('liz', '「走吧。」'), L('hero', '「絲嘉蕾，莉茲，走吧。」'), L('scarlet', '「收到。」')])).toEqual([]);   // he may say anyone's name
    expect(breaks([L('noel', '「老師最小氣了。」'), L('rin', '「嗯。」')])).toMatch(/noel says what piece 4 undoes/);
    const sn = 'banter:noel-selene:1' as SceneId;   // a pair B2 may write: her plain 「洛恩」 waits for her last piece
    expect(banterBreaks(sn, [L('selene', '「洛恩，月亮好圓。」'), L('noel', '「喂！」')]).join(' | ')).toMatch(/selene says what her pieces reveal/);
    expect(banterBreaks(sn, [L('selene', '「洛恩，月亮好圓。」', undefined, { full: 'selene' }), L('selene', '「月亮好圓呢。」', undefined, { notFull: 'selene' }), L('noel', '「喂！」')])).toEqual([]);
    expect(banterBreaks(ls, [N('洛恩看著兩人。'), L('liz', '「走吧。」'), L('scarlet', '「收到。」')])).toEqual([]);   // the narration may name him
    // B2 fix 1: a banter gated on one's full memories is still read with her partner's not whole
    expect(banterBreaks(ls, [L('liz', '「歐里克那邊的貨，我去看過了。」'), L('scarlet', '「收到。」')], { full: 'scarlet' }).join(' | ')).toMatch(/liz says what her pieces reveal/);
    expect(banterBreaks(ls, [L('liz', '「走吧。」'), L('scarlet', '「收到。」')], { full: 'scarlet' })).toEqual([]);
    // B2 fix 1: and her partner may not tell her secret (his name still may be said by anyone)
    expect(banterBreaks(ls, [L('liz', '「走吧。」'), L('scarlet', '「莉茲小姐，妳父親在等妳吧。」')]).join(' | ')).toMatch(/her partner tells what liz's pieces reveal/);
    expect(banterBreaks(id, [L('noel', '「喂。」'), L('rin', '「別去找那個商人。」')]).join(' | ')).toMatch(/her partner tells what noel's pieces reveal/);
    // fix round 1: Rin's faces and her eyes in a banter her oath does not gate
    expect(breaks([L('noel', '「喂。」'), L('rin', '「嗯。」', 'smile')])).toMatch(/Rin wears smile in a banter/);
    expect(breaks([L('noel', '「喂。」'), L('rin', '「嗯。」', 'serious')])).not.toMatch(/Rin wears/);
    expect(breaks([L('noel', '「喂。」'), L('rin', '「不看。」')])).toMatch(/Rin looks away/);
    expect(breaks([L('noel', '「喂。」'), L('rin', '「不看。」')], { stage: 'act3' })).not.toMatch(/Rin looks away/);
    expect(breaks([L('noel', '「喂。」'), L('rin', '「嗯。」', 'smile')], { oath: true })).not.toMatch(/Rin wears/);
    const s2 = 'banter:safira-sylvie:1' as SceneId;
    expect(banterBreaks(s2, [L('safira', '「來嘛。」'), L('sylvie', '「好。」')]).join(' | ')).toMatch(/Safira in someone else's register/);
    expect(banterBreaks(s2, [L('safira', '「來呀～」'), L('sylvie', '「好吧。」')]).join(' | ')).toMatch(/Sylvie uses a particle/);
    expect(banterBreaks(s2, [L('safira', '「來呀～」'), L('sylvie', '「好！」')]).join(' | ')).toMatch(/sylvie shouts/);
  });

  it('nobody but the two speaks besides Lorne and the narrator, and no line waits on anyone else being met', () => {
    for (const id of banterIds()) {
      const [a, b] = id.split(':')[1].split('-');
      for (const l of STORY.scenes[id].lines) {
        expect([a, b, 'hero', 'narrator'], `${id}: ${l.who}`).toContain(l.who);
        expect(l.if?.met === undefined || l.if.met === a || l.if.met === b, `${id}: ${l.text}`).toBe(true);
      }
    }
  });

  it('the three sample banters (§6), in the V2 voices', () => {
    const lines = (id: SceneId) => STORY.scenes[id].lines;
    // Safira drags Sylvie onto the square: her 唷 / 呀 / ～ and her nickname 「小希」; Sylvie answers in a few words
    const ss = lines('banter:safira-sylvie:1');
    expect(ss.filter((l) => l.who === 'safira').map((l) => l.text).join('')).toContain('小希');
    expect(ss.filter((l) => l.who === 'safira').some((l) => /[唷呀～]/.test(l.text))).toBe(true);
    for (const l of ss.filter((x) => x.who === 'sylvie')) expect([...l.text].length, l.text).toBeLessThanOrEqual(12);
    // Noel and Rin: the same four lines before and after her choice, with Rin's deadpan surrender
    const read = (oath: boolean) => linesWhen(lines('banter:noel-rin:1'), { met: [...CHARACTER_IDS], full: [], returned: [], oath });
    expect(read(false)).toEqual(read(true));
    expect(read(false)).toHaveLength(4);
    expect(read(false).filter((l) => l.who === 'rin').map((l) => l.text)).toEqual(['「服。」', '「好。不甘心。」']);
    expect(BANTER_GATE['banter:noel-rin:1']).toBeUndefined();
    // Liz and Scarlet: street talk against a knight's report; Liz calls her 「騎士大姊」
    const ls = lines('banter:liz-scarlet:1');
    expect(ls.filter((l) => l.who === 'liz').map((l) => l.text).join('')).toContain('騎士大姊');
    expect(ls.filter((l) => l.who === 'scarlet').map((l) => l.text).join('')).toContain('回報');
  });
});

describe('B2: what they say to each other (the banter content)', () => {
  const ids = (): SceneId[] => SCENE_IDS.filter((id) => sceneKind(id) === 'banter');
  const twoOf = (id: SceneId): string[] => id.split(':')[1].split('-');
  const FIXTURES: SceneId[] = ['banter:liz-scarlet:1', 'banter:noel-rin:1', 'banter:safira-sylvie:1'];

  it('sixteen new banters at least, nineteen in all, over many pairs; every companion and Rin is in three or more', () => {
    for (const f of FIXTURES) expect(ids(), f).toContain(f);   // shipped ids are frozen (B1)
    expect(ids().filter((id) => !FIXTURES.includes(id)).length).toBeGreaterThanOrEqual(16);
    expect(ids().length).toBeGreaterThanOrEqual(19);
    expect(new Set(ids().map((id) => id.split(':')[1])).size).toBeGreaterThanOrEqual(15);
    for (const c of [...COMPANIONS, 'rin']) expect(ids().filter((id) => twoOf(id).includes(c)).length, c).toBeGreaterThanOrEqual(3);
  });

  it('relationships move: some banters wait for a stage, some for Rin\'s choice, some for a full memory', () => {
    const gates = Object.entries(BANTER_GATE);
    expect(gates.some(([, g]) => g?.stage)).toBe(true);
    expect(gates.some(([, g]) => g?.oath)).toBe(true);
    expect(gates.some(([, g]) => g?.full)).toBe(true);
    for (const [id, g] of gates) {
      expect(ids(), id).toContain(id);
      if (g?.full) expect(twoOf(id as SceneId), id).toContain(g.full);
    }
    // the fixtures keep playing as they did: no gate was put on them
    for (const f of FIXTURES) expect(BANTER_GATE[f], f).toBeUndefined();
  });

  it('after her choice Rin teases Noel back: the second banter of the two waits for it, and she speaks like the Rin who chose', () => {
    expect(BANTER_GATE['banter:noel-rin:2']).toEqual({ oath: true });
    const rin = STORY.scenes['banter:noel-rin:2'].lines.filter((l) => l.who === 'rin');
    expect(rin.length).toBeGreaterThan(0);
    expect(rin.some((l) => /吧|我們|洛恩/.test(l.text))).toBe(true);   // story polish ruling 5: 吧, never 呢
    // and every other Rin banter that waits for nothing keeps her from before (story.test B1 checks each reading)
    for (const id of ids().filter((x) => twoOf(x).includes('rin') && !BANTER_GATE[x]?.oath)) {
      for (const l of STORY.scenes[id].lines.filter((x) => x.who === 'rin')) expect(l.text, id).not.toMatch(/洛恩|我們|[呢吧啦喔囉嘛耶]|！|……|還有/);
    }
  });

  it('light text: Scarlet never swears, Sylvie never says 「林子」, in any banter line or the narration around them', () => {
    for (const id of ids()) {
      const two = twoOf(id);
      for (const l of STORY.scenes[id].lines) {
        if (l.who === 'scarlet' || (two.includes('scarlet') && l.who === 'narrator')) expect(l.text, id).not.toMatch(/起誓|誓言/);
        if (l.who === 'sylvie' || (two.includes('sylvie') && l.who === 'narrator')) expect(l.text, id).not.toMatch(/林子/);
      }
    }
  });

  it('no line is said twice across the banters, and Lorne never counts (his counting joke is used up)', () => {
    const all = ids().flatMap((id) => STORY.scenes[id].lines.map((l) => l.text));
    expect(new Set(all).size).toBe(all.length);
    const COUNT = /第[一二三四五六七八九十]+[支塊遍道次口個隻]|[一二三四五六七八九十]+遍了/;
    for (const id of ids()) for (const l of STORY.scenes[id].lines.filter((x) => x.who === 'hero')) expect(l.text, id).not.toMatch(COUNT);
  });

  it('no one runs on one bit (B2 fix 1): Scarlet\'s report in two banters at most, 「一下下」 is Bobby\'s, and Safira\'s 「小嘉」 is not 「小蕾」', () => {
    const said = (id: SceneId, who: string): string => STORY.scenes[id].lines.filter((l) => l.who === who).map((l) => l.text).join('');
    expect(ids().filter((id) => /回報/.test(said(id, 'scarlet'))).length).toBeLessThanOrEqual(2);
    for (const id of ids()) {
      for (const l of STORY.scenes[id].lines) if (l.who !== 'bobby') expect(l.text, id).not.toContain('一下下');
      expect(said(id, 'safira'), id).not.toContain('小蕾');   // 小蕾 reads as Selene (瑟蕾)
      expect(said(id, 'chizuru'), id).not.toContain('有靈附身');   // the bible's description, not her line
    }
    // Selene's first future said and kept is her full-gated banter: before it she hedges or blames the moon
    for (const id of ids().filter((x) => twoOf(x).includes('selene') && BANTER_GATE[x]?.full !== 'selene')) expect(said(id, 'selene'), id).not.toMatch(/(?<!不)是我說的|不收回/);   // 「是月亮說的，不是我說的」 is her catchphrase
    expect(said('banter:noel-selene:2', 'selene')).toContain('不收回');
  });

  it('each banter is two voices: both speak, and the last line is one of the two or the narration (a button, not Lorne)', () => {
    for (const id of ids()) {
      const lines = linesWhen(STORY.scenes[id].lines, { met: [...CHARACTER_IDS], full: [...CHARACTER_IDS], returned: [], oath: true });
      expect(lines.at(-1)!.who, id).not.toBe('hero');
    }
  });
});

describe('story polish Task 4: numerals in titles and notices', () => {
  it('scene titles carry no Arabic digits', () => {
    for (const id of SCENE_IDS) expect(STORY.scenes[id].title, id).not.toMatch(/[0-9]/);
    expect(STORY.scenes['mem:selene:1'].title).toBe('瑟蕾・第一片');
    expect(STORY.scenes['mem:hero:10'].title).toBe('洛恩・第十片');
    expect(STORY.scenes['chat:selene:1'].title.endsWith('・對話一')).toBe(true);
    const banter = SCENE_IDS.find((id) => id.startsWith('banter:') && id.endsWith(':1'))!;
    expect(STORY.scenes[banter].title.endsWith('・閒聊一')).toBe(true);
  });

  it('the memory notice counts in Chinese numerals', () => {
    expect(T.ui2.memory.piece('凜', 2)).toBe('找回了凜的記憶（第二片）。');
    expect(T.ui2.memory.piece('洛恩', 10)).toBe('找回了洛恩的記憶（第十片）。');
  });
});

describe('story polish Task 2: the S1 lines', () => {
  const ALL: LineWhen = { met: [...CHARACTER_IDS], full: [], returned: [], oath: false };
  /** The line `who` says in `scene` that is exactly `text` (narration may hold it as one of its sentences). */
  const said = (scene: SceneId, who: ScriptLine['who'], text: string): ScriptLine[] =>
    STORY.scenes[scene].lines.filter((l) => l.who === who && (who === 'narrator' ? l.text.includes(text) : l.text === text));

  it('the S1 lines read whole (story polish Task 2)', () => {
    // Task 3 (ruling 11): each final pinned by its beat, a key noun or fact, not by its wording.
    const beats: [SceneId, Partial<LineWhen>, RegExp][] = [
      ['prologue-inn', {}, /發青的指痕/],
      ['prologue-inn', {}, /線索.*夢話/],
      ['prologue-inn', {}, /只剩迷宮/],
      ['rin-reveal', {}, /派來殺你/],
      ['mem:bobby:4', {}, /祖先.*道.*歉/],
      ['chat:bobby:2', {}, /彈簧/],
      ['mem:hero:9', {}, /想回來/],
      ['chat:scarlet:2', {}, /欠著/],
      ['chat:sylvie:2', { full: ['sylvie'] }, /睡床/],
      ['mem:liz:5', {}, /鎮上見過/],
      ['mem:liz:5', { returned: ['orik'] }, /紅帽子/],
    ];
    for (const [scene, reading, re] of beats) expect(() => pinBeat(scene, reading, re), `${scene} ${re}`).not.toThrow();
    expect(said('chat:sylvie:2', 'sylvie', '「新芽，我看過了。今晚我睡床。換你守窗。」')).toHaveLength(1);   // TELEGRAPH_OK holds it word for word
    // The old wordings are gone (audit A3, A6–A10).
    const all = storyTexts().map((t) => t.text).join('｜');
    for (const old of ['只剩下面', '彈簧上太緊', '看過了。今晚，去睡床', '原來我一直，想回來', '我被派來殺你。我現在選擇不要', '像是不知道他在哪裡，就睡不著']) expect(all, old).not.toContain(old);
    // Each reading of Liz's fifth piece: four lines; with Orik back, his line speaks from now, not from the day she left.
    const liz = STORY.scenes['mem:liz:5'].lines;
    const back = linesWhen(liz, { ...ALL, returned: ['orik'] });
    const notBack = linesWhen(liz, ALL);
    expect(back).toHaveLength(4);
    expect(notBack).toHaveLength(4);
    const orik = back.filter((l) => l.who === 'orik');
    expect(orik).toHaveLength(1);
    expect(orik[0].text).not.toContain('還掛在門後，等妳回來戴');
    expect(orik[0].text).toMatch(/紅帽子/);
    expect(notBack.some((l) => l.text.includes('最近好像在鎮上見過'))).toBe(true);
    expect(back.some((l) => l.text.includes('最近好像在鎮上見過'))).toBe(false);
  });
});
