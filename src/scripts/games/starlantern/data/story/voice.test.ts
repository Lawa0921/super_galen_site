import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../characters';
import { MEETINGS } from '../meetings';
import { GATHER_TEXT, type GatherText } from '../gather.zh-TW';
import { STORY, type ScriptLine, type Speaker, flatLines } from '../story.zh-TW';
import { BANTER_GATE, CHAT_GATE, SCENE_IDS, type SceneId } from './scenes';
import {
  AFTER_CHOICE, CHIZURU_ARCHAIC, CHIZURU_NEVER, CONNECTIVES, ELLIPSIS, SYLVIE_WORLD, INTERJECTIONS, SENTENCE_PARTICLE, TELEGRAPH_OK, VOCATIVES, VOICE, WORD_LISTS_AT_TASK3,
  dots, heavyScene, opensOnDots, pinBeat, readingsOf, sceneReadings, speakerOf, storyTexts, telegraphBreaks, type Text,
} from './voiceGates';

/** The gathering slots with one stand-in line in each (gathering plan Task B1): the real ones are empty until written. */
const gatherFilled = (): GatherText => {
  const t = structuredClone(GATHER_TEXT);
  const fill = (v: unknown): void => { for (const x of Object.values(v as object)) { if (Array.isArray(x)) x.push('「好。」'); else fill(x); } };
  fill(t);
  return t;
};

/**
 * The keys the story polish has rewritten (plan 2026-10-23, style bible 2026-10-22 revision). Each rewrite task adds its own
 * key prefixes here: adding them is that task's red, its rewrite the green. Task 16 makes it cover the whole script.
 */
const POLISHED: string[] = [
  // Task 5: the opening and the first return
  'scenes.prologue.', 'scenes.prologue-inn.', 'scenes.first-return.', 'scenes.act1-after.', 'scenes.chat:hero:1.', 'scenes.chat:rin:1.', 'act1Card.',
  // Task 6: Rin's line
  'scenes.mem:rin:', 'scenes.chat:rin:2.', 'scenes.chat:rin:3.', 'scenes.chat:rin:4.', 'scenes.rin-reveal.', 'scenes.bellkeeper-arrives.', 'rinLines.', 'rinOath.', 'people.rin.',
  // Task 7: Lorne's memories and the acts
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `scenes.mem:hero:${n}.`), 'scenes.chat:hero:2.', 'scenes.chat:hero:3.', 'scenes.chat:hero:4.', 'scenes.act2.', 'scenes.act3.', 'scenes.act4.', 'people.hero.', 'truths.',
  // Task 8: Selene and Chizuru (story depth plan Task 8)
  'meet.selene.', 'meet.chizuru.', 'scenes.mem:selene:', 'scenes.mem:chizuru:', 'scenes.chat:selene:', 'scenes.chat:chizuru:', 'scenes.home:chizuru.', 'people.selene.', 'people.chizuru.',
  // Task 9: Safira and Sylvie (story depth plan Task 9)
  'meet.safira.', 'meet.sylvie.', 'scenes.mem:safira:', 'scenes.mem:sylvie:', 'scenes.chat:safira:', 'scenes.chat:sylvie:', 'scenes.home:safira.', 'scenes.home:sylvie.', 'people.safira.', 'people.sylvie.',
  // Task 10: Noel and Bobby (story depth plan Task 10)
  'meet.noel.', 'meet.bobby.', 'scenes.mem:noel:', 'scenes.mem:bobby:', 'scenes.chat:noel:', 'scenes.chat:bobby:', 'people.noel.', 'people.bobby.',
  // Task 11: Liz and Scarlet (story depth plan Task 11)
  'meet.liz.', 'meet.scarlet.', 'scenes.mem:liz:', 'scenes.mem:scarlet:', 'scenes.chat:liz:', 'scenes.chat:scarlet:', 'scenes.home:liz.', 'people.liz.', 'people.scarlet.', 'survived',
  // Task 12: the light banters (story depth plan Task 12)
  ...['bobby-chizuru:1', 'bobby-liz:1', 'bobby-noel:1', 'bobby-sylvie:1', 'chizuru-rin:1', 'chizuru-safira:1', 'chizuru-scarlet:1', 'liz-noel:1', 'liz-selene:1', 'liz-scarlet:1', 'noel-rin:1', 'noel-selene:1', 'rin-scarlet:1', 'safira-scarlet:1', 'safira-sylvie:1', 'scarlet-selene:1', 'selene-sylvie:1'].map((id) => `scenes.banter:${id}.`),
  // Task 13: the act 2 and act 3 friction banters (story depth plan Task 13)
  ...['chizuru-noel:1', 'liz-scarlet:2', 'safira-sylvie:2', 'rin-sylvie:1', 'rin-selene:1', 'safira-scarlet:2', 'noel-selene:2', 'bobby-chizuru:2', 'bobby-sylvie:2'].map((id) => `scenes.banter:${id}.`),
  // Task 14: Rin's confession and the lone morning (story depth plan Task 14)
  'scenes.rin-confess.', 'scenes.hero-alone.',
  // Task 15: the banters after her choice, and the payoffs (story depth plan Task 15); with it every banter is polished
  ...['rin-scarlet:2', 'rin-scarlet:3', 'rin-selene:2', 'rin-sylvie:2', 'chizuru-rin:2', 'chizuru-noel:2', 'noel-rin:2', 'safira-sylvie:3', 'liz-scarlet:3', 'noel-selene:3'].map((id) => `scenes.banter:${id}.`),
  // Task 16: the finale and the lantern festival (story depth plan Task 16)
  'finaleWait.', 'scenes.mem:hero:10.', 'scenes.finale.', 'scenes.epilogue.', 'endingTitle', 'finaleBossName',
  // Task 17: the town's daily lines (story depth plan Task 17)
  'townLines.', 'greet.', 'leads.', 'merchant.', 'absorb.', 'scenes.chat:hero:5.',
  // Task 18: the townsfolk returns and the bellkeeper (story depth plan Task 18). `town.` (each return's handbook line and
  // its thanks at the counter) was story polish Task 12a's and no depth task listed it; it belongs with the returns.
  'scenes.town:', 'bellkeeper.', 'town.',
  // Story L Task 3d: the night before the descent, its frame line (Task 8 finalizes it under the same gates)
  'scenes.finale-eve.',
  // Story L Task 8: the beats between a night's memories (the memories' present lines were polished above)
  'nightBeats.',
  // Story L Tasks 9-11: the group scenes, each as it is written and registered
  'scenes.group:',
  // Difficulty plan Task 7a: Glen's one line when Nightmare opens.
  'tierUnlock',
  // Time and moon Task 8: the spring festival at Chizuru's shrine
  'scenes.season:',
  // Bond plan Tasks 17-19: each companion's four bond scenes, as they are written
  'scenes.bond:rin:', 'scenes.bond:selene:', 'scenes.bond:chizuru:',
  'scenes.bond:safira:', 'scenes.bond:sylvie:', 'scenes.bond:noel:',
  'scenes.bond:bobby:', 'scenes.bond:liz:', 'scenes.bond:scarlet:',
  // Bond plan Task 20: the nine after-stories and the walk together
  'scenes.ending:', 'scenes.together.',
  // Bond plan Task 21: the nine romances
  'scenes.romance:',
  // Gathering plan Task B1 (ruling 10): the gathering slots (data/gather.zh-TW.ts), empty until the story is written; what
  // is written into them later passes every gate here.
  'gather.',
];

type Scope = readonly string[];
/** The scene or meeting a key belongs to (`scenes.<id>.`, `meet.<id>.`), if any. */
const unitOf = (key: string): string | undefined => {
  const [top, id] = key.split('.');
  return top === 'scenes' || top === 'meet' ? `${top}.${id}.` : undefined;
};
/** A scene or meeting is polished whole as soon as a prefix covers any of its keys (Task 3 review I3). */
const touches = (scope: Scope, unit: string): boolean => scope.some((p) => unit.startsWith(p) || p.startsWith(unit));
const isPolished = (key: string, scope: Scope = POLISHED): boolean => {
  const unit = unitOf(key);
  return scope.some((p) => key.startsWith(p)) || (unit !== undefined && touches(scope, unit));
};
const polishedTexts = (scope: Scope = POLISHED): Text[] => storyTexts().filter((t) => isPolished(t.key, scope));
/** The inside of a spoken line: the outer 「」 taken off. */
const inner = (t: string): string => t.replace(/^「/, '').replace(/」$/, '');
const spoken = (l: ScriptLine): boolean => l.who !== 'narrator';

/** Every scene the polish covers, as it plays (each reading), with whether it is heavy. A meeting is one light scene. */
const polishedScenes = (scope: Scope = POLISHED): { id: string; heavy: boolean; readings: ScriptLine[][] }[] => [
  ...SCENE_IDS.filter((id) => touches(scope, `scenes.${id}.`)).map((id) => ({ id, heavy: heavyScene(id), readings: sceneReadings(id).map((r) => r.lines) })),
  ...MEETINGS.filter((m) => touches(scope, `meet.${m.id}.`)).map((m) => ({ id: `meet.${m.id}`, heavy: false, readings: [[...STORY.meet[m.id].before, ...STORY.meet[m.id].after]] })),
];

type PlayedScene = { id: string; heavy: boolean; readings: ScriptLine[][] };
/**
 * The scene budgets of 「……」 (plan ruling 4), each reading on its own: a light scene one line at most; a heavy scene
 * `max(1, floor(spoken / 4))` lines, every line with 「……」 counting, the narrator's too (Task 3 review I1).
 */
function budgetBreaks(scope: Scope, scenes: PlayedScene[] = polishedScenes(scope)): string[] {
  const out: string[] = [];
  for (const s of scenes) for (const r of s.readings) {
    const withDots = r.filter((l) => dots(l.text) > 0);
    if (!s.heavy && withDots.length > ELLIPSIS.lightPerScene) out.push(`${s.id} (light): ${withDots.length} lines with 「……」`);
    if (s.heavy) {
      const cap = Math.max(1, Math.floor(r.filter(spoken).length * ELLIPSIS.heavyShare));
      if (withDots.length > cap) out.push(`${s.id} (heavy): ${withDots.length} lines with 「……」, cap ${cap}`);
    }
  }
  return out;
}

/** Each speaker's share of 「……」 over the whole script, for every speaker whose lines are all in `scope` (plan ruling 4). */
function speakerDotsBreaks(scope: Scope): string[] {
  const all = storyTexts().map((t) => ({ ...t, who: speakerOf(t.key, t.line) })).filter((t) => t.who && t.who !== 'narrator');
  const out: string[] = [];
  for (const who of new Set(all.map((t) => t.who!))) {
    const theirs = all.filter((t) => t.who === who);
    if (!theirs.every((t) => isPolished(t.key, scope))) continue;   // checked once all their lines are polished (Task 16: everyone)
    const cap = Math.max(1, Math.floor(theirs.length * ELLIPSIS.speakerShare));
    const n = theirs.filter((t) => dots(t.text) > 0).length;
    if (n > cap) out.push(`${who}: ${n} of ${theirs.length} lines carry 「……」, cap ${cap}`);
  }
  return out;
}

/** Each voice's particle budget over the lines in `scope` (`VOICE`, plan ruling 5); pools of plain strings count by `speakerOf`. */
function particleBreaks(scope: Scope): string[] {
  const out: string[] = [];
  const lines = polishedTexts(scope).map((t) => ({ ...t, who: speakerOf(t.key, t.line) })).filter((t) => t.who);
  for (const [who, v] of Object.entries(VOICE) as [Speaker, NonNullable<(typeof VOICE)[Speaker]>][]) {
    const theirs = lines.filter((t) => t.who === who);
    if (!theirs.length) continue;
    if (v.never) for (const t of theirs) if (v.never.test(t.text)) out.push(`${t.key}: ${who} never says ${v.never}: ${t.text}`);
    if (!v.mark) continue;
    const marked = theirs.filter((t) => v.mark!.test(t.text));
    // The share is a whole-script budget (plan ruling 5): it is checked once all their lines are in scope, as the 「……」
    // share is; until then a guest line or two would decide it (story polish Task 8: Bobby's one line in Chizuru's chat).
    const whole = storyTexts().filter((t) => speakerOf(t.key, t.line) === who);
    if (v.maxShare !== undefined && whole.every((t) => isPolished(t.key, scope))) {
      const all = whole.filter((t) => v.mark!.test(t.text));
      if (all.length > whole.length * v.maxShare) out.push(`${who}: ${all.length} of ${whole.length} lines carry ${v.mark}`);
    }
    if (v.heavyNone) for (const t of marked) {
      const [top, id] = t.key.split('.');
      if (top === 'scenes' && heavyScene(id as SceneId)) out.push(`${t.key}: ${who}'s ${v.mark} in a heavy scene: ${t.text}`);
    }
    if (v.perScene !== undefined) {
      // a scene as it plays: each reading on its own
      for (const sc of polishedScenes(scope)) for (const r of sc.readings) {
        const n = r.filter((l) => l.who === who && v.mark!.test(l.text)).length;
        if (n > v.perScene) out.push(`${sc.id}: ${who} ${n} × ${v.mark}`);
      }
    }
  }
  return out;
}

describe('voice gates: the gates themselves (story polish Task 3)', () => {
  it('telegraphBreaks flags the audit\'s choppy forms and passes natural ones', () => {
    for (const bad of ['「那就，下次也拜託了。」', '「原來我一直，想回來。」', '「退路。三條。」', '「還有。你說夢話。吵。」', '「人，我都帶出去了。」']) {
      expect(telegraphBreaks(bad), bad).not.toEqual([]);
    }
    const good = [
      '「我什麼都不記得，你是我唯一的線索。另外，你說了三次夢話。很吵。」',   // sample 1
      '「吵是吵。反正我能去的地方，也只剩迷宮了。」',                           // sample 2
      '「洛恩，我是被派來殺你的。可是我不殺了──這是我自己決定的。」',           // sample 3
      '「被殺了那麼多次，還是一直往上走。原來我一直都想回來。」',               // sample 5
      '「新芽，我看過了。今晚我睡床。換你守窗。」',                             // sample 7 (TELEGRAPH_OK)
      '「吵。」',
      '「洛恩，後面有三隻。」',
    ];
    for (const ok of good) expect(telegraphBreaks(ok), ok).toEqual([]);
  });

  it('telegraphBreaks segments as the plan says', () => {
    // A spoken line is one passage: its outer 「」 come off.
    expect(telegraphBreaks('「人，我都帶出去了。」')).toHaveLength(1);
    // Narration: each quote is a passage of its own, and the narration around it another.
    expect(telegraphBreaks('她低聲說：「人，我都帶出去了。」然後轉身走了。')).toHaveLength(1);
    expect(telegraphBreaks('她低聲說：「我都帶出去了。」人，轉身走了。')).toHaveLength(1);   // caught outside the quote
    expect(telegraphBreaks('她低聲說：「我都帶出去了。」然後轉身走了。')).toEqual([]);
    // 『』 come off and their words stay.
    expect(telegraphBreaks('「剛才那句『會有人經過』，是月亮說的。」')).toEqual([]);
    expect(telegraphBreaks('「『人』，我都帶出去了。」')).toHaveLength(1);
    // Sentences end on 。！？; clauses on ，、；： and 「──」; a clause that ends on 「──」 is broken off, not cut short.
    expect(telegraphBreaks('「你走前面。──算了，並排走。」')).toEqual([]);
    expect(telegraphBreaks('「凜──」')).toEqual([]);
    expect(telegraphBreaks('「鐘樓、名單、吐霧的石門，都說了。」')).toEqual([]);   // a list is not a cut phrase
    expect(telegraphBreaks('「好，走吧。」')).toEqual([]);                         // an interjection may stand alone in a clause
    expect(telegraphBreaks('「好啦，算你便宜。」')).toEqual([]);                   // with its particle too
    expect(telegraphBreaks('「人啦，算你便宜。」')).toHaveLength(1);               // a particle does not make a cut phrase whole
    expect(telegraphBreaks('「另外，那個繃帶纏太緊了。」')).toEqual([]);           // so may a connective
    expect(telegraphBreaks('「丫頭，回來啦。」')).toEqual([]);                     // and a vocative
    // 「……」 does not split, and comes off before the length is measured: these are two very short sentences.
    expect(telegraphBreaks('「……後面。……三隻。」')).toHaveLength(1);
    expect(telegraphBreaks('「後面……三隻。」')).toEqual([]);
    // A comma right after an adverb splits it from its verb.
    expect(telegraphBreaks('「明天大家也，一起回來吧。」')).toHaveLength(1);
    expect(telegraphBreaks('「明天，大家也一起回來吧。」')).toHaveLength(1);   // 明天 is no connective: the time word is cut out
    // 「還有。」 is caught on its own.
    expect(telegraphBreaks('「還有。指甲剪一剪。」')).toEqual(['「還有。」']);
    expect(telegraphBreaks('「還有，指甲剪一剪。」')).toEqual([]);
  });

  it('TELEGRAPH_OK has ten lines at most, each still in the script', () => {
    expect(TELEGRAPH_OK.length).toBeGreaterThanOrEqual(1);
    expect(TELEGRAPH_OK.length).toBeLessThanOrEqual(10);
    const all = new Set(storyTexts().map((t) => t.text));
    for (const t of TELEGRAPH_OK) expect(all.has(t), t).toBe(true);
    for (const t of TELEGRAPH_OK) expect(telegraphBreaks(t), t).toEqual([]);
  });

  it('the approved samples pass the telegraph gate as they stand (Task 2 finals)', () => {
    const at = (scene: SceneId, has: string): string => {
      const hits = flatLines(STORY.scenes[scene].lines).filter((l) => l.text.includes(has));
      expect(hits, `${scene} ${has}`).toHaveLength(1);
      return hits[0].text;
    };
    const finals = [
      at('prologue-inn', '發青的指痕'), at('prologue-inn', '三次夢話'), at('prologue-inn', '只剩迷宮'), at('rin-reveal', '派來殺你'),
      at('mem:bobby:4', '替祖先道一次歉'), at('chat:bobby:2', '彈簧上得太緊'), at('mem:hero:9', '一直都想回來'),
      at('chat:scarlet:2', '騎士的職責'), at('chat:sylvie:2', '新芽，我看過了'), at('mem:liz:5', '在鎮上見過'), at('mem:liz:5', '爸爸到現在都沒收'),
      at('prologue-inn', '睜著眼'),   // story polish M round 2: 「睡不著」 explained the feeling; the look shows it
    ];
    for (const t of finals) expect(telegraphBreaks(t), t).toEqual([]);
  });

  it('pinBeat passes on exactly one match', () => {
    expect(() => pinBeat('rin-reveal', {}, /派來殺你/)).not.toThrow();
    expect(() => pinBeat('rin-reveal', {}, /這一句不在劇本裡/)).toThrow(/rin-reveal.*0/);
    expect(() => pinBeat('rin-reveal', {}, /自己決定/)).toThrow(/rin-reveal.*2/);
    // the reading is part of the pin: Orik speaks in Liz's fifth piece only once his fragment is back
    expect(() => pinBeat('mem:liz:5', { returned: ['orik'] }, /紅帽子/)).not.toThrow();
    expect(() => pinBeat('mem:liz:5', {}, /爸爸到現在都沒收/)).toThrow(/mem:liz:5/);
  });

  it('the word lists keep to their kinds, and the budgets read as the plan rules', () => {
    for (const w of ['吵', '不用', '嘿嘿', '算了']) expect(INTERJECTIONS.has(w), w).toBe(true);
    for (const w of ['明天', '今晚']) expect(INTERJECTIONS.has(w) || CONNECTIVES.has(w) || VOCATIVES.has(w), w).toBe(false);
    for (const w of ['另外', '還有', '可是', '好像']) expect(CONNECTIVES.has(w), w).toBe(true);
    for (const w of ['洛恩', '凜', '歐里克', '老大', '丫頭', '團長']) expect(VOCATIVES.has(w), w).toBe(true);
    expect(ELLIPSIS).toEqual({ lightPerScene: 1, heavyShare: 1 / 4, speakerShare: 1 / 6, scriptShare: 0.08 });
    expect(dots('「……沒事。……不要問。」')).toBe(2);
    expect(opensOnDots('「……後面。」')).toBe(true);
    expect(opensOnDots('「……」')).toBe(false);
    expect(opensOnDots('「……。」')).toBe(false);
    expect(opensOnDots('「後面……。」')).toBe(false);
    expect(SENTENCE_PARTICLE('喔').test('「接上了喔！」')).toBe(true);
    expect(SENTENCE_PARTICLE('呢').test('「呢喃」')).toBe(false);
    expect(VOICE.bobby?.mark?.test('「好，接上了喔。」')).toBe(true);
    expect(VOICE.rin?.never?.test('「跟妳學的呢。」')).toBe(true);
    expect(VOICE.rin?.never?.test('「明天再比一次吧。」')).toBe(false);
    expect(VOICE.sylvie?.never?.test('「風向不對吧。」')).toBe(true);
    expect(VOICE.scarlet?.never?.test('「遵命啦。」')).toBe(true);
    expect(VOICE.chizuru?.never?.test('「甚好呀。」')).toBe(true);
    expect(heavyScene('mem:rin:1')).toBe(true);
    expect(heavyScene('town:marta')).toBe(true);
    expect(heavyScene('finale')).toBe(true);
    expect(heavyScene('chat:rin:2')).toBe(true);
    expect(heavyScene('chat:rin:1')).toBe(false);
    expect(heavyScene('prologue-inn')).toBe(false);
    expect(heavyScene('banter:noel-rin:1')).toBe(false);
  });

  it('the review cases (Task 3 review): a lone connective is caught; compound words, fillers and doubled interjections are not', () => {
    expect(telegraphBreaks('「另外。你說了三次夢話。」')).toEqual(['a connective stands alone: 「另外。」']);
    expect(telegraphBreaks('「另外，你說了三次夢話。」')).toEqual([]);
    for (const ok of ['「首先，把燈點上。」', '「這個，我想想。」', '「那個，借我看一下。」', '「嗯嗯，我知道。」', '「她的祖先，造錯了這裡。」', '「碎片交還，她就想起來了。」', '「他是個天才，你也知道。」']) {
      expect(telegraphBreaks(ok), ok).toEqual([]);
    }
    expect(telegraphBreaks('「大家也，一起回來。」')).toHaveLength(1);   // the adverb rule still bites
    expect(SENTENCE_PARTICLE('呢').test('「回來了呢……」')).toBe(true);
    expect(SENTENCE_PARTICLE('喔').test('「接上了喔──啊，那顆螺絲！」')).toBe(true);
  });

  it('speakerOf names who says a plain string', () => {
    expect(speakerOf('rinLines.act2.0')).toBe('rin');
    expect(speakerOf('rinOath.0')).toBe('rin');
    expect(speakerOf('greet.guild.act1.0')).toBe('anna');
    expect(speakerOf('greet.forge.after.0')).toBe('doran');
    expect(speakerOf('town.marta.after')).toBe('marta');
    expect(speakerOf('town.marta.lost')).toBeUndefined();
    expect(speakerOf('bellkeeper.oath.0')).toBe('bellkeeper');
    expect(speakerOf('people.rin.0')).toBeUndefined();
    expect(speakerOf('scenes.prologue.lines.0.text', { who: 'narrator', text: '…' })).toBe('narrator');
  });

  it("the plain-string pools count in the voice gates: a 「呢」 in Rin's town line is hers (Task 6 fixed the real one)", () => {
    const saved = STORY.rinOath[0];
    STORY.rinOath[0] = '洛恩，我們今天也回來了呢。';   // the line as it was before Task 6
    try {
      expect(particleBreaks(['rinOath.']).some((x) => x.startsWith('rinOath.0:'))).toBe(true);
      expect(particleBreaks([])).toEqual([]);
    } finally {
      STORY.rinOath[0] = saved;
    }
    expect(particleBreaks(['rinOath.'])).toEqual([]);
  });

  it("budgetBreaks counts the narrator's 「……」 in a heavy scene, against a cap from the spoken lines (Task 4 review)", () => {
    const say = (text: string): ScriptLine => ({ who: 'rin', text });
    const tell = (text: string): ScriptLine => ({ who: 'narrator', text });
    const four = [say('「一。」'), say('「二。」'), say('「三。」'), say('「四……」')];   // four spoken lines: the cap is one
    expect(budgetBreaks([], [{ id: 'heavy', heavy: true, readings: [[tell('風停了。'), ...four]] }])).toEqual([]);
    expect(budgetBreaks([], [{ id: 'heavy', heavy: true, readings: [[tell('風……停了。'), ...four]] }])).toEqual(['heavy (heavy): 2 lines with 「……」, cap 1']);
    expect(budgetBreaks([], [{ id: 'light', heavy: false, readings: [[tell('風……停了。'), ...four]] }])).toEqual(['light (light): 2 lines with 「……」']);
    expect(budgetBreaks([])).toEqual([]);   // nothing in scope, nothing to check
  });

  it("a particle share is checked over all of a speaker's lines, once they are all in scope", () => {
    const share = /^bobby: \d+ of \d+ lines/;
    // a guest's one line does not decide her share
    expect(particleBreaks(['scenes.chat:chizuru:']).some((x) => share.test(x))).toBe(false);
    // all of Bobby's keys but one: still not checked
    const hers = storyTexts().filter((t) => speakerOf(t.key, t.line) === 'bobby').map((t) => t.key);
    const left = hers.find((k) => !isPolished(k, hers.filter((x) => x !== k)));
    expect(left, 'a key of hers that only it puts in scope').toBeDefined();
    expect(particleBreaks(hers.filter((x) => x !== left)).some((x) => share.test(x))).toBe(false);
    // the whole script in scope: the gate says so exactly when her share is over the budget, whatever the data is today
    const everything = [''];   // every key starts with it
    const said = storyTexts().filter((t) => speakerOf(t.key, t.line) === 'bobby');
    const marked = said.filter((t) => VOICE.bobby!.mark!.test(t.text)).length;
    const over = marked > said.length * VOICE.bobby!.maxShare!;
    expect(particleBreaks(everything).some((x) => share.test(x))).toBe(over);
    expect(particleBreaks(everything).includes(`bobby: ${marked} of ${said.length} lines carry ${VOICE.bobby!.mark}`)).toBe(over);
  });

  it('Sylvie may say 啦 or 欸 in a fifth of her lines, none in a heavy scene (story L Task 7, spec §7.1)', () => {
    const v = VOICE.sylvie!;
    expect(v.mark?.test('「這個能吃啦。」')).toBe(true);
    expect(v.mark?.test('「欸，蘿蔔切太大塊了。」')).toBe(true);
    expect(v.maxShare).toBe(1 / 5);
    expect(v.heavyNone).toBe(true);
    expect(v.never?.test('「風向不對吧。」')).toBe(true);   // the other particles stay out of her mouth
    expect(v.never?.test('「這個能吃啦。」')).toBe(false);
    // the budget as it bites, on her real lines: one 啦 in a light scene passes, one in a heavy scene does not, and past a
    // fifth of all her lines the share fails
    const hers = storyTexts().filter((t) => t.line && t.line.who === 'sylvie' && t.key.startsWith('scenes.'));
    const heavy = (t: Text) => heavyScene(t.key.split('.')[1] as SceneId);
    const light = hers.filter((t) => !heavy(t));
    const grave = hers.find(heavy)!;
    const whole = storyTexts().filter((t) => speakerOf(t.key, t.line) === 'sylvie');
    const all = whole.length;
    const already = whole.filter((t) => v.mark!.test(t.text)).length;   // the ones she says today, in the beats too
    const over = Math.floor(all / 5) + 1;
    const unmarked = light.filter((t) => !v.mark!.test(t.text));
    expect(unmarked.length, 'enough light lines of hers to go over a fifth').toBeGreaterThanOrEqual(over - already);
    const saved = hers.map((t) => t.line!.text);
    const say = (ts: Text[]) => { for (const t of ts) t.line!.text = '「這個能吃啦。」'; };
    const sylvieBreaks = () => particleBreaks(POLISHED).filter((x) => x.includes('sylvie'));
    try {
      say([unmarked[0]]);
      expect(already + 1, 'one more is still within a fifth').toBeLessThanOrEqual(all / 5);
      expect(sylvieBreaks()).toEqual([]);
      say([grave]);
      expect(sylvieBreaks().some((x) => x.includes('in a heavy scene'))).toBe(true);
      hers.forEach((t, i) => { t.line!.text = saved[i]; });
      say(unmarked.slice(0, over - already));
      expect(sylvieBreaks().some((x) => x.startsWith(`sylvie: ${over} of ${all} lines carry`))).toBe(true);
    } finally {
      hers.forEach((t, i) => { t.line!.text = saved[i]; });
    }
    expect(sylvieBreaks()).toEqual([]);
  });

  it('readings cover a seen condition (story depth Task 1)', () => {
    const lines: ScriptLine[] = [
      { who: 'rin', text: '「看過了。」', if: { seen: 'banter:rin-sylvie:1' } },
      { who: 'rin', text: '「還沒看過。」', if: { notSeen: 'banter:rin-sylvie:1' } },
    ];
    const readings = readingsOf(lines);
    expect(readings).toHaveLength(2);
    expect(readings.map((r) => r.lines.map((l) => l.text))).toEqual([['「還沒看過。」'], ['「看過了。」']]);
    expect(readings.map((r) => r.when.seen)).toEqual([[], ['banter:rin-sylvie:1']]);
  });

  it('the scenes after her choice read only after it (story depth Task 2)', () => {
    expect([...AFTER_CHOICE].sort()).toEqual(['bellkeeper-arrives', 'epilogue', 'finale', 'hero-alone', 'rin-confess']);
    for (const id of AFTER_CHOICE) for (const r of sceneReadings(id)) expect(r.when.oath, id).toBe(true);
    for (const id of ['rin-confess', 'hero-alone', 'epilogue'] as SceneId[]) expect(heavyScene(id), id).toBe(true);
  });

  it('a scene is polished whole once any key of it is', () => {
    const one = ['scenes.prologue-inn.lines.3'];
    expect(isPolished('scenes.prologue-inn.lines.0.text', one)).toBe(true);
    expect(isPolished('scenes.prologue-inn.summary', one)).toBe(true);
    expect(isPolished('scenes.first-return.lines.0.text', one)).toBe(false);
    expect(polishedScenes(one).map((s) => s.id)).toEqual(['prologue-inn']);
    expect(polishedScenes(['meet.selene.after.0']).map((s) => s.id)).toEqual(['meet.selene']);
    expect(polishedScenes(['scenes.mem:rin:']).length).toBe(7);
  });

  it('the word lists grow by ten words at most after Task 3 (plan ruling 6)', () => {
    const now = { interjections: INTERJECTIONS.size, connectives: CONNECTIVES.size, vocatives: VOCATIVES.size };
    const grown = (Object.keys(now) as (keyof typeof now)[]).map((k) => now[k] - WORD_LISTS_AT_TASK3[k]);
    for (const g of grown) expect(g).toBeGreaterThanOrEqual(0);   // a list never shrinks below where Task 3 left it
    expect(grown.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(10);
    expect(WORD_LISTS_AT_TASK3).toEqual({ interjections: 32, connectives: 29, vocatives: 31 });
  });

  it('sceneReadings plays every reading once, and the finale only after her choice', () => {
    const liz = sceneReadings('mem:liz:5');
    expect(liz).toHaveLength(2);
    for (const r of liz) expect(r.lines).toHaveLength(4);
    for (const r of sceneReadings('finale')) expect(r.when.oath).toBe(true);
    expect(sceneReadings('prologue')).toHaveLength(1);
  });
});

/** Story L spec §8: what points a memory's present line at the labyrinth. 「這裡」 and Chizuru's 「此處」 are let be. */
const LABYRINTH_HERE = /這片|這座|腳下|這一層|天頂/;
/** The memory lines said now (not `past`) that point at the labyrinth, though a memory is told at night in town. */
const labyrinthBreaks = (texts: Text[]): string[] =>
  texts.filter((t) => t.key.startsWith('scenes.mem:') && t.line && !t.line.past && LABYRINTH_HERE.test(t.text)).map((t) => `${t.key}: ${t.text}`);

describe('voice gates over the polished script (story polish)', () => {
  it("a memory's present lines do not point at the labyrinth (story L Task 8)", () => {
    // the gate itself: a present line that stands in the labyrinth is caught; the past, 「這裡」 and 「此處」 are not
    const t = (key: string, line: ScriptLine): Text => ({ key, text: line.text, line });
    const now = (text: string): ScriptLine => ({ who: 'narrator', text });
    expect(labyrinthBreaks([t('scenes.mem:safira:5.lines.2.text', now('腳下這片火海，原來就是那片沙漠。'))])).toHaveLength(1);
    expect(labyrinthBreaks([t('scenes.mem:sylvie:1.lines.2.text', { who: 'sylvie', text: '「這箭頭是我刻的。那時候，這片沼澤還是林子。」' })])).toHaveLength(1);
    expect(labyrinthBreaks([t('scenes.mem:chizuru:1.lines.3.text', now('千鶴抬頭看了看迷宮的天頂。'))])).toHaveLength(1);
    expect(labyrinthBreaks([t('scenes.mem:safira:5.lines.0.text', { who: 'narrator', text: '腳下這片沙漠燒了起來。', past: true })])).toEqual([]);
    expect(labyrinthBreaks([t('scenes.mem:scarlet:5.lines.3.text', { who: 'scarlet', text: '「從今天起，我站這裡。」' })])).toEqual([]);
    expect(labyrinthBreaks([t('scenes.mem:chizuru:5.lines.3.text', { who: 'chizuru', text: '「為此處的人掛上這枚鈴。」' })])).toEqual([]);
    expect(labyrinthBreaks([t('scenes.act2.lines.0.text', now('腳下這片石板。'))])).toEqual([]);   // only memories
    // the script: every memory's present half is said at night in town (spec §8)
    expect(labyrinthBreaks(storyTexts())).toEqual([]);
  });

  it('polished lines are whole sentences', () => {
    const out = polishedTexts().flatMap((t) => telegraphBreaks(t.text).map((why) => `${t.key}: ${why}: ${t.text}`));
    expect(out).toEqual([]);
  });

  it('no polished line opens on 「……」 or carries two', () => {
    const out: string[] = [];
    for (const t of polishedTexts()) {
      if (dots(t.text) > 1) out.push(`${t.key}: two 「……」: ${t.text}`);
      if (opensOnDots(t.text)) out.push(`${t.key}: opens on 「……」: ${t.text}`);
    }
    // a line that is only 「……」 (a beat of silence): one a scene at most
    for (const s of polishedScenes()) for (const r of s.readings) {
      const silent = r.filter((l) => /^「?……。?」?$/.test(l.text)).length;
      if (silent > 1) out.push(`${s.id}: ${silent} silent lines`);
    }
    expect(out).toEqual([]);
  });

  it('every reading of a polished scene keeps its budget', () => {
    expect(budgetBreaks(POLISHED)).toEqual([]);
  });

  it('handbook, summary and absorb text spends no 「……」', () => {
    const out = polishedTexts()
      .filter((t) => /^(people|truths|absorb)\./.test(t.key) || t.key.endsWith('.summary'))
      .filter((t) => dots(t.text) > 0)
      .map((t) => `${t.key}: ${t.text}`);
    expect(out).toEqual([]);
  });

  it('each speaker keeps to their share of 「……」', () => {
    expect(speakerDotsBreaks(POLISHED)).toEqual([]);
  });

  it('each speaker keeps their particle budget', () => {
    expect(particleBreaks(POLISHED)).toEqual([]);
  });

  it('「還有。」 is retired', () => {
    const out = storyTexts().filter((t) => t.text.includes('還有。')).map((t) => `${t.key}: ${t.text}`);
    expect(out).toEqual([]);
  });

  it('no line opens on 「洛恩。」, and one 「洛恩，」 opener a scene at most', () => {
    const out = polishedTexts().filter((t) => t.text.startsWith('「洛恩。')).map((t) => `${t.key}: ${t.text}`);
    for (const s of polishedScenes()) for (const r of s.readings) {
      const n = r.filter((l) => l.text.startsWith('「洛恩，')).length;
      if (n > 1) out.push(`${s.id}: ${n} lines open on 「洛恩，」`);
    }
    expect(out).toEqual([]);
  });

  it('two-character lines belong to Rin, Doran and the interjections', () => {
    const out: string[] = [];
    for (const t of polishedTexts()) {
      const l = t.line;
      if (!l || !spoken(l)) continue;
      const words = inner(l.text).replace(/[。！？～……──、，]/g, '');
      if ([...words].length > 2) continue;
      if (l.who === 'sylvie') { if (l.text !== '「不用。」') out.push(`${t.key}: Sylvie's only short line is 「不用。」: ${l.text}`); continue; }
      if (l.who === 'rin' || l.who === 'doran' || INTERJECTIONS.has(words)) continue;
      out.push(`${t.key}: ${l.who}: ${l.text}`);
    }
    expect(out).toEqual([]);
  });

  it('「一起回來」 three times at most, 「交給燈」 three times at most in the finale', () => {
    const together = polishedTexts().filter((t) => t.text.includes('一起回來'));
    expect(together.length, together.map((t) => t.key).join(' ')).toBeLessThanOrEqual(3);
    if (isPolished('scenes.finale.')) {
      for (const r of sceneReadings('finale')) expect(r.lines.filter((l) => l.text.includes('交給燈')).length).toBeLessThanOrEqual(3);
    }
  });

  it('in banter, 你 goes only to the hero', () => {
    const TO_HIM = /洛恩|小洛|老大|洛恩哥|閣下|大人|歸來者|先生/;
    const out = polishedTexts()
      .filter((t) => t.key.startsWith('scenes.banter:') && t.line && spoken(t.line))
      .filter((t) => t.text.replace(/你們/g, '').includes('你') && !TO_HIM.test(t.text))
      .map((t) => `${t.key}: ${t.text}`);
    expect(out).toEqual([]);
  });

  it('every banter is polished (story depth Task 15)', () => {
    const banters = SCENE_IDS.filter((id) => id.startsWith('banter:'));
    expect(banters.length).toBeGreaterThan(30);
    for (const id of banters) expect(isPolished(`scenes.${id}.lines.0.text`), id).toBe(true);
  });

  it('the polish covers the whole script (story depth Task 20)', () => {
    const left = storyTexts().filter((t) => !isPolished(t.key)).map((t) => t.key);
    expect(left).toEqual([]);
    // the whole script's share of strings with 「……」 (bible §2.3), and 「一起回來」 three times at most over all of it
    const all = storyTexts();
    const withDots = all.filter((t) => dots(t.text) > 0).length;
    expect(withDots / all.length, `${withDots} of ${all.length}`).toBeLessThanOrEqual(ELLIPSIS.scriptShare);
    expect(all.filter((t) => t.text.includes('一起回來')).length).toBeLessThanOrEqual(3);
  });

  it('POLISHED names real keys', () => {
    // The gathering slots are empty today (gathering spec §9.2): their keys are walked with one stand-in line in each.
    const keys = [...storyTexts(), ...storyTexts(gatherFilled()).filter((t) => t.key.startsWith('gather.'))].map((t) => t.key);
    for (const p of POLISHED) expect(keys.some((k) => k.startsWith(p)), p).toBe(true);
    expect(CHARACTER_IDS.length).toBe(10);
  });
});

// Story L Tasks 12 and 13 (spec §7.1, §7.2): Sylvie and Chizuru no longer share Rin's and Scarlet's deadpan. Sylvie is a
// grumbling hunter (food, weather, tracks); Chizuru's joke is the year she fell asleep in, said politely, not classically.
describe('story L: Sylvie and Chizuru in their new voices (Tasks 12, 13)', () => {
  /** Every string a speaker says, with whether the scene it plays in is heavy (a meeting and a night beat are light). */
  const saidBy = (who: Speaker): (Text & { heavy: boolean })[] => storyTexts()
    .filter((t) => speakerOf(t.key, t.line) === who)
    .map((t) => {
      const [top, id] = t.key.split('.');
      return { ...t, heavy: top === 'scenes' && heavyScene(id as SceneId) };
    });

  it("Sylvie's light lines talk food, weather, wind, tracks or prey in a third of them (Task 12)", () => {
    // the gate itself
    for (const ok of ['「又是乾糧。」', '「風轉北了。」', '「這腳印還是濕的。」', '「湯太鹹。」']) expect(SYLVIE_WORLD.test(ok), ok).toBe(true);
    for (const no of ['「不用。」', '「找退路。」', '「沒有。在看貓。」']) expect(SYLVIE_WORLD.test(no), no).toBe(false);
    const light = saidBy('sylvie').filter((t) => !t.heavy);
    expect(light.length).toBeGreaterThanOrEqual(15);
    const world = light.filter((t) => SYLVIE_WORLD.test(t.text));
    expect(world.length * 3, `${world.length} of ${light.length}:\n${light.filter((t) => !SYLVIE_WORLD.test(t.text)).map((t) => t.text).join('\n')}`).toBeGreaterThanOrEqual(light.length);
    // and not only in the night beats (written for it in Task 8): her meeting, chats and banters too
    const scenes = light.filter((t) => !t.key.startsWith('nightBeats.'));
    const inScenes = scenes.filter((t) => SYLVIE_WORLD.test(t.text));
    expect(inScenes.length * 3, `${inScenes.length} of ${scenes.length}:\n${scenes.filter((t) => !SYLVIE_WORLD.test(t.text)).map((t) => t.text).join('\n')}`).toBeGreaterThanOrEqual(scenes.length);
    // she grumbles out loud: 啦 or 欸 in a few light lines (within her fifth, `VOICE.sylvie`)
    expect(light.filter((t) => VOICE.sylvie!.mark!.test(t.text)).length).toBeGreaterThanOrEqual(3);
  });

  it("Sylvie is no clipped deadpan: 「另外，」 is Rin's, and only 「不用。」 is two characters (Task 12)", () => {
    for (const t of saidBy('sylvie')) expect(t.text, t.key).not.toMatch(/另外，/);
    // her light lines are mostly whole sentences with something in them: no more than a quarter of them under eight characters
    const light = saidBy('sylvie').filter((t) => !t.heavy && t.line);
    const clipped = light.filter((t) => [...inner(t.text).replace(/[。！？，、]/g, '')].length < 8);
    expect(clipped.length * 4, clipped.map((t) => t.text).join(' ')).toBeLessThanOrEqual(light.length);
  });

  it('chat:sylvie:2 waits for her memories told whole; chat:sylvie:1 reads one way and keeps the bed (Task 12, spec §10)', () => {
    expect(CHAT_GATE['chat:sylvie:2']).toEqual({ full: 'sylvie' });
    for (const n of [1, 2]) for (const l of flatLines(STORY.scenes[`chat:sylvie:${n}` as SceneId].lines)) expect(l.if, `chat:sylvie:${n}: ${l.text}`).toBeUndefined();
    expect(flatLines(STORY.scenes['chat:sylvie:1'].lines).some((l) => l.who === 'bobby')).toBe(false);
    expect(flatLines(STORY.scenes['chat:sylvie:1'].lines).map((l) => l.text).join('')).toMatch(/床/);
    expect(() => pinBeat('chat:sylvie:2', { full: ['sylvie'] }, /睡床/)).not.toThrow();
  });

  it("Chizuru's old-style markers are at most one a line and a quarter of her lines (Task 13)", () => {
    const hers = saidBy('chizuru');
    const count = (t: string) => (t.match(new RegExp(CHIZURU_ARCHAIC.source, 'g')) ?? []).length;
    expect(count('「此處便是此處。」')).toBe(2);   // the gate itself
    for (const t of hers) expect(count(t.text), `${t.key}: ${t.text}`).toBeLessThanOrEqual(1);
    const marked = hers.filter((t) => count(t.text) > 0);
    expect(marked.length * 4, marked.map((t) => t.text).join('\n')).toBeLessThanOrEqual(hers.length);
  });

  it('Chizuru never says 吾等, 謹以 or 奉於 (Task 13)', () => {
    expect(CHIZURU_NEVER.test('「謹以此段，奉於燈前。」')).toBe(true);
    for (const t of saidBy('chizuru')) expect(t.text, t.key).not.toMatch(CHIZURU_NEVER);
  });

  it('before her third piece is told she never says decades (Task 13, spec §7.2)', () => {
    // a chat or banter line of hers that can play before her third piece: neither her full chain, nor a gate on three pieces
    const before = (id: SceneId, l: ScriptLine): boolean => {
      const gate = CHAT_GATE[id] ?? BANTER_GATE[id];
      if (gate?.full === 'chizuru' || (gate?.pieces?.chizuru ?? 0) >= 3) return false;
      return l.if?.full !== 'chizuru';
    };
    const ids = SCENE_IDS.filter((id) => /^chat:chizuru:|^banter:.*chizuru/.test(id));
    expect(ids.length).toBeGreaterThanOrEqual(8);
    for (const id of ids) for (const l of flatLines(STORY.scenes[id].lines)) {
      if (l.who === 'chizuru' && before(id, l)) expect(l.text, `${id}: ${l.text}`).not.toMatch(/幾十年|好幾十年|數十年/);
    }
    for (const l of [...STORY.meet.chizuru.before, ...STORY.meet.chizuru.after]) expect(l.text).not.toMatch(/幾十年|數十年/);
  });

  it('chat:chizuru:2 waits for Bobby, and so reads no way without her (Task 13, spec §10)', () => {
    expect(CHAT_GATE['chat:chizuru:2']).toEqual({ met: ['bobby'] });
    const lines = flatLines(STORY.scenes['chat:chizuru:2'].lines);
    expect(lines.some((l) => l.if?.notMet === 'bobby')).toBe(false);
    expect(lines.filter((l) => l.if).length).toBe(2);   // her bell, before and after her last piece
  });

  it("Chizuru's joke is the year she fell asleep in: her light lines say so, and she says 東西, not 玩意兒 (Task 13)", () => {
    const light = saidBy('chizuru').filter((t) => !t.heavy);
    const ERA = /我們那時候|我們那裡|最近|近來|去年|今年|城裡.{0,4}(流行|改|新)/;
    const era = light.filter((t) => ERA.test(t.text));
    expect(era.length * 3, `${era.length} of ${light.length}`).toBeGreaterThanOrEqual(light.length);
    for (const t of saidBy('chizuru')) expect(t.text, t.key).not.toMatch(/玩意兒/);
  });
});
