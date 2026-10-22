// The style bible's testable rules (story polish Task 3, bible 2026-10-22 revision): choppy-line detection, the 「……」
// budget, the particle budgets, the word lists, light or heavy, and the walk over the whole script. Pure functions, no DOM.
// Read by `voice.test.ts` (the gates), `story.test.ts` (pins) and `readAloud.ts` (the read-aloud dump).
import type { CharacterId } from '../../engine/types';
import { CHARACTERS, CHARACTER_IDS } from '../characters';
import { NPC_NAMES, STORY, linesWhen, type LineWhen, type NpcId, type ScriptLine, type Speaker } from '../story.zh-TW';
import type { TownFragmentId } from './fragments';
import { sceneKind, type SceneId } from './scenes';

export interface Text { key: string; text: string; line?: ScriptLine }
/** Every string leaf of STORY, keyed by its path; a scene line's text carries its ScriptLine. Skips who, mood, if and scene titles (interface labels). */
export function storyTexts(): Text[] {
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

/** The townsperson who keeps each facility, and so says its greeting. */
const FACILITY_KEEPER: Record<string, NpcId> = { guild: 'anna', shop: 'orik', inn: 'marta', gate: 'glen', forge: 'doran' };
/**
 * Who says the text at `key`: a scene line's own speaker, and for the pools of plain strings the one whose words they are
 * (Rin's town lines, a facility's greeting, a townsperson's line once returned, the bellkeeper, the merchant, Anna's leads).
 * `undefined` for narration-only pools (people, truths, summaries, absorb lines, the town's day line).
 */
export function speakerOf(key: string, line?: ScriptLine): Speaker | undefined {
  if (line) return line.who;
  const [top, a, b] = key.split('.');
  if (top === 'rinLines' || top === 'rinOath') return 'rin';
  if (top === 'greet') return FACILITY_KEEPER[a];
  if (top === 'town' && b === 'after' && a in NPC_NAMES) return a as NpcId;
  if (top === 'bellkeeper' || top === 'merchant') return top;
  if (top === 'leads') return 'anna';
  return undefined;
}

// ---- 「……」 (bible §2.3, plan ruling 4) ----

/** How many 「……」 a text spends. */
export const dots = (t: string): number => (t.match(/……/g) ?? []).length;
/** Whether a line opens on 「……」. A line that is only 「……」 (or 「……。」), a beat of silence, does not count. */
export const opensOnDots = (t: string): boolean => {
  const inside = t.replace(/^「/, '').replace(/」$/, '');
  if (/^……。?$/.test(inside)) return false;
  return inside.startsWith('……');
};
/** The 「……」 budgets: a light scene, a heavy scene's share of spoken lines, a speaker's share, the whole script's share. */
export const ELLIPSIS = { lightPerScene: 1, heavyShare: 1 / 4, speakerShare: 1 / 6, scriptShare: 0.08 } as const;

// ---- Word lists (plan ruling 6). After Task 3 the three lists may grow by ten words at most across the whole plan; each
// addition gets a `// +<word>：Task <N>，<reason>` comment. ----

/** Words that may stand alone in a short sentence or clause: replies, calls, one-word verdicts. Time words are left out. */
export const INTERJECTIONS: ReadonlySet<string> = new Set([
  '嗯', '好', '喂', '是', '不', '啊', '咦', '哼', '欸', '哈', '嘿嘿', '唔', '噢', '哦', '哎', '是嗎', '對', '沒事', '奇怪', '吵', '可以',
  '不要', '不行', '不用', '服', '不服', '早', '說', '放著',
  '算了',   // Task 3 (plan's own example 「你走前面。──算了，並排走。」 must pass): a change of mind, said on its own
  '這個', '那個',   // Task 3 review: fillers before a pause (「這個，我想想。」); the controller's ruling, so they cut nothing out
]);
/** Words that open a sentence and hand it on: they may stand before a comma. */
export const CONNECTIVES: ReadonlySet<string> = new Set([
  '另外', '還有', '可是', '不過', '所以', '而且', '然後', '只是', '反正', '其實', '但是', '因為', '如果', '結果', '總之', '對了', '那麼',
  '何況', '再說', '畢竟', '至少', '當然', '雖然', '原來', '難怪', '果然', '看來', '好像',
  '首先',   // Task 3 review: 「首先，」 opens a list of steps
]);
/** What one calls someone by: the cast's names, the town's, and the nicknames and titles of the script. */
export const VOCATIVES: ReadonlySet<string> = new Set([
  ...Object.values(CHARACTERS).map((c) => c.name), ...Object.values(NPC_NAMES),
  '小洛', '小希', '凜凜', '老大', '松鼠', '小魔女', '丫頭', '孩子', '小子', '客人', '年輕人', '師父', '老師', '團長',
]);

/** The three lists' sizes when Task 3 closed (with its review fixes): from here they may grow by ten words at most, together. */
export const WORD_LISTS_AT_TASK3 = { interjections: 32, connectives: 29, vocatives: 31 } as const;

// ---- Choppy lines (plan ruling 6) ----

/** Lines that read naturally though the gate would flag them (a topic said first). Ten at most, each still in the script. */
export const TELEGRAPH_OK: readonly string[] = [
  '「新芽，我看過了。今晚我睡床。換你守窗。」',   // Task 2 final 7 (chat:sylvie:2, full), approved by the user
];

/**
 * The adverbs a comma must not cut from their verb. The character must be the adverb, not the end of a word: 首先、祖先、
 * 交還、剛才、成就、首都 and their like are not cut from anything.
 */
const ADVERB_COMMA = /(一直|也|(?<![成造將遷])就|(?<![首古國])都|(?<![交歸償奉退送])還|(?<![剛方天人適])才|再|又|(?<![首原事預優起祖])先)，/;
/** A clause's length once its marks are off: 「」『』……──～ and white space do not count. */
const len = (s: string): number => [...s.replace(/[「」『』～\s]|……|──/g, '')].length;
const bare = (s: string): string => s.replace(/[「」『』～\s]|……|──/g, '');
/** Whether a word may stand alone: an interjection, a connective or a vocative, with or without a particle after it (好啦、好吧). */
const standsAlone = (w: string, sets: ReadonlySet<string>[]): boolean => {
  const head = w.replace(/[呢吧啦喔囉嘛耶唷呀啊]$/, '');
  const chars = [...w];
  if (chars.length === 2 && chars[0] === chars[1] && INTERJECTIONS.has(chars[0])) return true;   // 嗯嗯、哈哈
  return sets.some((set) => set.has(w) || (head !== w && head.length > 0 && set.has(head)));
};

/**
 * The passages a line holds: a spoken line is one (its outer 「」 off); in narration each 「…」 quote is one, and the
 * narration around them another. 『』 come off and their words stay.
 */
function passages(text: string): string[] {
  const t = text.replace(/[『』]/g, '');
  if (t.startsWith('「') && t.endsWith('」') && t.indexOf('」') === t.length - 1) return [t.slice(1, -1)];
  const quotes = [...t.matchAll(/「([^」]*)」/g)].map((m) => m[1]);
  const around = t.replace(/「[^」]*」/g, '。');
  return [...quotes, around];
}

/**
 * Why a line reads as if words were dropped (plan ruling 6), or [] when it reads whole. Three forms, the ones a machine can
 * see: 「還有。」; two or more very short sentences (two characters or fewer, not an interjection) in one passage; a phrase
 * of two characters or fewer cut out by a comma (not an interjection, connective or vocative), or a comma right after an
 * adverb that cuts it from its verb. A clause that ends on 「──」 is broken off, not cut short. Lines in TELEGRAPH_OK pass.
 */
export function telegraphBreaks(text: string): string[] {
  if (TELEGRAPH_OK.includes(text)) return [];
  const out: string[] = [];
  if (text.includes('還有。')) out.push('「還有。」');
  for (const p of passages(text)) {
    // a connective said as a whole sentence (「另外。」) hands on to nothing; 「還有。」 is told above
    for (const [, s, end] of p.matchAll(/([^。！？]*)([。！？])/g)) {
      const w = bare(s);
      if (end === '。' && w !== '還有' && CONNECTIVES.has(w)) out.push(`a connective stands alone: 「${w}。」`);
    }
    const sentences = p.split(/[。！？]/).filter((s) => len(s) > 0);
    const tiny = sentences.filter((s) => len(s) <= 2 && !standsAlone(bare(s), [INTERJECTIONS]) && bare(s) !== '還有');
    if (tiny.length >= 2) out.push(`very short sentences: ${tiny.map(bare).join('／')}`);
    for (const s of sentences) {
      if (ADVERB_COMMA.test(s.replace(/……/g, ''))) out.push(`a comma cuts the adverb from its verb: ${s}`);
      // clauses with the mark that ends each one; a clause that ends on 「──」 is broken off, and only a comma cuts a
      // phrase out (a list's 、 does not)
      const parts = [...s.matchAll(/([^，、；：]*?)(──|[，、；：]|$)/g)].filter((m) => m[0] !== '');
      for (const [, clause, mark] of parts) {
        if (mark !== '，') continue;
        const words = bare(clause);
        if (words.length === 0 || [...words].length > 2) continue;
        if (standsAlone(words, [INTERJECTIONS, CONNECTIVES, VOCATIVES])) continue;
        out.push(`a comma cuts out 「${words}」: ${s}`);
      }
    }
  }
  return out;
}

// ---- Light or heavy (bible §2.2) ----

const HEAVY_SCENES = new Set<SceneId>([
  'prologue', 'act2', 'act3', 'act4', 'rin-reveal', 'rin-confess', 'bellkeeper-arrives', 'hero-alone', 'finale', 'epilogue',
  'chat:rin:2', 'chat:rin:3', 'chat:rin:4', 'chat:hero:2', 'chat:hero:3', 'chat:hero:4',
]);
/** Whether a scene is heavy: every memory, every townsfolk return, and the scenes the bible names. */
export function heavyScene(id: SceneId): boolean {
  const kind = sceneKind(id);
  return kind === 'memory' || kind === 'town' || HEAVY_SCENES.has(id);
}

// ---- Particles and voices (bible §3, plan ruling 5) ----

/** A sentence particle `p` (a character or a class) at the end of a sentence or clause. */
export const SENTENCE_PARTICLE = (p: string): RegExp => new RegExp(`${p}(?=[。！？～」，]|……|──)`);
const ALL_PARTICLES = '[呢吧啦喔囉嘛耶唷呀]';

/** Each voice's particle budget: `mark` at most `maxShare` of their lines, `perScene` a scene, none in a heavy scene; `never` at all. */
export const VOICE: Partial<Record<Speaker, { mark?: RegExp; maxShare?: number; perScene?: number; heavyNone?: boolean; never?: RegExp }>> = {
  bobby: { mark: SENTENCE_PARTICLE('喔'), maxShare: 1 / 3, heavyNone: true },
  selene: { mark: SENTENCE_PARTICLE('呢'), maxShare: 1 / 3, perScene: 1 },
  liz: { mark: SENTENCE_PARTICLE('啦'), maxShare: 1 / 3 },
  rin: { never: SENTENCE_PARTICLE('呢') },
  sylvie: { never: SENTENCE_PARTICLE(ALL_PARTICLES) },
  scarlet: { never: SENTENCE_PARTICLE('[喔啦唷呀耶嘛]') },
  chizuru: { never: SENTENCE_PARTICLE('[喔啦唷呀耶嘛]') },
};

// ---- Readings ----

const BASE: LineWhen = { met: [...CHARACTER_IDS], full: [], returned: [], oath: false };

/**
 * Every different way `lines` can play: each condition its lines name, on and off (a companion met or not, her memories
 * whole or not, a townsfolk piece back or not, Rin's choice made or not, a scene seen or not), a full chain counting as met.
 * `oath` fixes the choice when the scene only plays on one side of it. Each different run of lines comes once, with the
 * first `when` that plays it; every `when` names its `seen` (empty when nothing is).
 */
export function readingsOf(lines: ScriptLine[], oath?: boolean): { when: LineWhen; lines: ScriptLine[] }[] {
  type Atom = { kind: 'met' | 'full'; id: CharacterId } | { kind: 'returned'; id: TownFragmentId } | { kind: 'oath' } | { kind: 'seen'; id: SceneId };
  const atoms: Atom[] = [];
  const add = (a: Atom) => { if (!atoms.some((b) => JSON.stringify(b) === JSON.stringify(a))) atoms.push(a); };
  for (const l of lines) {
    const c = l.if;
    if (!c) continue;
    if (c.met) add({ kind: 'met', id: c.met });
    if (c.notMet) add({ kind: 'met', id: c.notMet });
    if (c.full) add({ kind: 'full', id: c.full });
    if (c.notFull) add({ kind: 'full', id: c.notFull });
    if (c.returned) add({ kind: 'returned', id: c.returned });
    if (c.notReturned) add({ kind: 'returned', id: c.notReturned });
    if (c.oath !== undefined && oath === undefined) add({ kind: 'oath' });
    if (c.seen) add({ kind: 'seen', id: c.seen });
    if (c.notSeen) add({ kind: 'seen', id: c.notSeen });
  }
  const out: { when: LineWhen; lines: ScriptLine[] }[] = [];
  const seen = new Set<string>();
  for (let mask = 0; mask < 1 << atoms.length; mask++) {
    const w: LineWhen = { met: [...BASE.met], full: [], returned: [], oath: oath ?? false, seen: [] };
    atoms.forEach((a, i) => {
      if (!(mask & (1 << i))) return;
      if (a.kind === 'met') w.met = w.met.filter((x) => x !== a.id);   // on: not met
      else if (a.kind === 'full') w.full.push(a.id);
      else if (a.kind === 'returned') w.returned.push(a.id);
      else if (a.kind === 'seen') w.seen!.push(a.id);
      else w.oath = true;
    });
    if (w.full.some((c) => !w.met.includes(c))) continue;   // a full chain is a met companion's
    const played = linesWhen(lines, w);
    const sig = played.map((l) => lines.indexOf(l)).join(',');
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({ when: w, lines: played });
  }
  return out;
}
/**
 * The scenes that only ever play after Rin's choice (story depth plan ruling 14): their readings fix `oath: true`. The story
 * tests' line caps read the same set.
 */
export const AFTER_CHOICE: ReadonlySet<SceneId> = new Set<SceneId>(['finale', 'rin-confess', 'bellkeeper-arrives', 'hero-alone', 'epilogue']);
/** Every reading of a scene as it can play; the scenes after her choice (`AFTER_CHOICE`) only after it. */
export const sceneReadings = (id: SceneId): { when: LineWhen; lines: ScriptLine[] }[] =>
  readingsOf(STORY.scenes[id].lines, AFTER_CHOICE.has(id) ? true : undefined);

// ---- Pins (plan ruling 11) ----

/**
 * Pins a beat, not a wording: in scene `id` read as `reading` (everyone met, nothing full or returned, no choice yet,
 * unless it says), exactly one line matches `re`. Throws, naming the scene, the reading and the count, otherwise.
 */
export function pinBeat(id: SceneId, reading: Partial<LineWhen>, re: RegExp): void {
  const w: LineWhen = { ...BASE, ...reading };
  const hits = linesWhen(STORY.scenes[id].lines, w).filter((l) => re.test(l.text));
  if (hits.length !== 1) throw new Error(`pinBeat: ${id} ${JSON.stringify(reading)} has ${hits.length} lines matching ${re}${hits.map((h) => `\n  ${h.text}`).join('')}`);
}
