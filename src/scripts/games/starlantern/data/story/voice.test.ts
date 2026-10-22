import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../characters';
import { MEETINGS } from '../meetings';
import { STORY, type ScriptLine, type Speaker } from '../story.zh-TW';
import { SCENE_IDS, type SceneId } from './scenes';
import {
  AFTER_CHOICE, CONNECTIVES, ELLIPSIS, INTERJECTIONS, SENTENCE_PARTICLE, TELEGRAPH_OK, VOCATIVES, VOICE, WORD_LISTS_AT_TASK3,
  dots, heavyScene, opensOnDots, pinBeat, readingsOf, sceneReadings, speakerOf, storyTexts, telegraphBreaks, type Text,
} from './voiceGates';

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
      const hits = STORY.scenes[scene].lines.filter((l) => l.text.includes(has));
      expect(hits, `${scene} ${has}`).toHaveLength(1);
      return hits[0].text;
    };
    const finals = [
      at('prologue-inn', '發青的指痕'), at('prologue-inn', '三次夢話'), at('prologue-inn', '只剩迷宮'), at('rin-reveal', '派來殺你'),
      at('mem:bobby:4', '替祖先道一次歉'), at('chat:bobby:2', '彈簧上得太緊'), at('mem:hero:9', '一直都想回來'),
      at('chat:scarlet:2', '騎士的職責'), at('chat:sylvie:2', '新芽，我看過了'), at('mem:liz:5', '在鎮上見過'), at('mem:liz:5', '爸爸到現在都沒收'),
      at('prologue-inn', '睡不著'),
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

describe('voice gates over the polished script (story polish)', () => {
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

  it('POLISHED names real keys', () => {
    const keys = storyTexts().map((t) => t.key);
    for (const p of POLISHED) expect(keys.some((k) => k.startsWith(p)), p).toBe(true);
    expect(CHARACTER_IDS.length).toBe(10);
  });
});
