import type { SkillMod } from '../data/gear';
import { RUNES, TAGS, exclusiveGroupOf, tiersOf, type RuneId, type RuneMod, type RuneRef, type Tag } from '../data/runes';
import { HIT_DESC, SKILLS } from '../data/skills';
import { T } from '../data/text.zh-TW';
import type { AilmentId } from './ailments';
import type { Combatant } from './combatant';
import { ELEMENT_AILMENT, patchSkill, pctOf } from './skills';
import type { Effect, Element, RuneRules, SkillDef, Target } from './types';

/**
 * Runes on skills (spec §6, plan 8e): a skill's tags, whether a rune fits it, and why not. Pure functions over a skill as
 * `skillFor` builds it (tree, mastery, legendary powers and their `extra` all in, no rune yet: spec §6.2).
 */

/** The element each element rune gives an ailment rune's need (spec §6.2's one exception; 星燈輪轉 gives none, ruling 10). */
const GIVES: Partial<Record<RuneId, Element>> = { flame: 'fire', rime: 'ice', thunderclap: 'thunder' };
const ELEMENT_TAGS: readonly Tag[] = ['fire', 'ice', 'thunder'];

const isBuff = (e: Effect) => (e.kind === 'buff' && e.pct > 0) || e.kind === 'barrier';
const isDebuff = (e: Effect) => (e.kind === 'buff' && e.pct < 0) || e.kind === 'expose';

/**
 * A skill's tags (spec §6.2), in TAGS order: 增益 is a buff for us or a barrier, 減益 a debuff on them or an exposure (plan
 * 8e ruling 6); a revive counts as 治療 and its fallen ally as 單體; 消耗 TP is a skill that costs TP at all.
 */
export function skillTags(def: SkillDef): Tag[] {
  const has = new Set<Tag>();
  const fx = def.effects;
  if (fx.some((e) => e.kind === 'damage')) has.add('damage');
  if (fx.some((e) => e.kind === 'heal' || e.kind === 'revive')) has.add('heal');
  if (fx.some(isBuff)) has.add('buff');
  if (fx.some(isDebuff)) has.add('debuff');
  if (fx.some((e) => e.kind === 'inflict')) has.add('ailment');
  if (fx.some((e) => e.kind === 'device')) has.add('device');
  if (def.target === 'enemy' || def.target === 'ally' || def.target === 'deadAlly') has.add('single');
  if (def.target === 'enemies' || def.target === 'allies') has.add('all');
  if (def.target === 'self') has.add('self');
  for (const e of fx) {
    if (e.kind !== 'damage') continue;
    if ((e.hits ?? 1) >= 2) has.add('multi');
    has.add(e.melee ? 'melee' : 'ranged');
    has.add(e.scale === 'atk' ? 'attack' : 'spell');
    has.add(e.element);
  }
  if (def.tp > 0) has.add('tp');
  return TAGS.filter((t) => has.has(t));
}

/** Why a rune does not fit a skill; `hint`: the need names an element an element rune could give. */
export type RuneMiss =
  | { kind: 'needs'; needs: Tag[][]; hint?: true }
  | { kind: 'group'; other: RuneId }
  | { kind: 'same'; id: RuneId }
  | { kind: 'revive' } | { kind: 'scatter' } | { kind: 'pure' } | { kind: 'no-heal' };

/** The structural reasons beyond tags (plan 8e ruling 7), or null. */
function structural(def: SkillDef, rune: RuneId): RuneMiss | null {
  if (rune === 'spread' && def.target === 'deadAlly') return { kind: 'revive' };
  if ((rune === 'spread' || rune === 'focus' || rune === 'bounce') && def.effects.some((e) => e.kind === 'damage' && e.scatter)) {
    return { kind: 'scatter' };
  }
  if (rune === 'share' && !def.effects.every((e) => e.kind === 'buff' && e.pct > 0)) return { kind: 'pure' };
  if (rune === 'lasting' && !def.effects.every(isBuff)) return { kind: 'pure' };
  if (rune === 'spill-shield' && !def.effects.some((e) => e.kind === 'heal')) return { kind: 'no-heal' };
  return null;
}

/**
 * Whether `rune` fits `def` beside the skill's other runes `others` (null: it fits). `def` is the skill before runes;
 * `core` the same skill without its `extra` effects, whose tags alone 延長 reads (plan 8e ruling 18). Checked in order:
 * the same rune twice, an exclusive group taken, the structural reasons, then the needed tags; an ailment rune's element
 * may come from an element rune among `others` (spec §6.2).
 */
export function runeFits(def: SkillDef, rune: RuneId, others: readonly RuneId[], core: SkillDef = def): RuneMiss | null {
  if (others.includes(rune)) return { kind: 'same', id: rune };
  const group = exclusiveGroupOf(rune);
  const other = group && others.find((o) => exclusiveGroupOf(o) === group);
  if (other) return { kind: 'group', other };
  const why = structural(def, rune);
  if (why) return why;
  const { needs, group: own } = RUNES[rune];
  if (!needs.length) return null;
  const tags = new Set<Tag>(skillTags(rune === 'extend' ? core : def));
  if (own === 'ailment') for (const o of others) if (GIVES[o]) tags.add(GIVES[o]!);
  if (needs.some((way) => way.every((t) => tags.has(t)))) return null;
  // The hint only where an element rune could help: they need a damage skill themselves.
  const hint = own === 'ailment' && tags.has('damage') && needs.some((way) => way.some((t) => ELEMENT_TAGS.includes(t)));
  return { kind: 'needs', needs: needs.map((way) => [...way]), ...(hint ? { hint: true as const } : {}) };
}

/** The one line a rune that does not fit shows (spec §6.8). */
export function runeWhy(m: RuneMiss): string {
  const W = T.rune.why;
  switch (m.kind) {
    case 'needs': return W.needs(m.needs.map((way) => way
      .map((t) => `${T.rune.tag[t]}${m.hint && ELEMENT_TAGS.includes(t) ? W.fromRune : ''}`).join(W.and)));
    case 'group': return W.group(RUNES[m.other].name);
    case 'same': return W.same(RUNES[m.id].name);
    case 'revive': return W.revive;
    case 'scatter': return W.scatter;
    case 'pure': return W.pure;
    case 'no-heal': return W.noHeal;
  }
}

/**
 * Each socketed rune and whether it works, judged against all the skill's other runes. An element rune that does not
 * work gives no element: the element runes are judged first, and the rest see only the ones that work.
 */
export function runeStates(def: SkillDef, refs: readonly RuneRef[], core: SkillDef = def): { ref: RuneRef; miss: RuneMiss | null }[] {
  const ids = refs.map((r) => r.id);
  const othersOf = (i: number) => ids.filter((_, j) => j !== i);
  const elementMiss = new Map<number, RuneMiss | null>();
  refs.forEach((r, i) => { if (exclusiveGroupOf(r.id) === 'element') elementMiss.set(i, runeFits(def, r.id, othersOf(i), core)); });
  return refs.map((ref, i) => {
    if (elementMiss.has(i)) return { ref, miss: elementMiss.get(i)! };
    // A failing element rune (a miss, not null or absent) is left out.
    const others = refs.flatMap((o, j) => (j === i || elementMiss.get(j) ? [] : [o.id]));
    return { ref, miss: runeFits(def, ref.id, others, core) };
  });
}

const RUNE_ORDER = Object.keys(RUNES) as RuneId[];
type Damage = Extract<Effect, { kind: 'damage' }>;
type Ailment = { status: AilmentId; chance: number };

/** Percent factors multiplied in a fixed order (sorted), so the result never depends on the slots (plan 8e ruling 5). */
const product = (factors: number[]): number => [...factors].sort((a, b) => a - b).reduce((acc, f) => (acc * f) / 100, 100);
/** TP after runes (plan 8e ruling 4): percents add, then flat, at least 1; a free skill stays free. */
const runeTp = (tp: number, pct: number, flat: number): number => (tp > 0 ? Math.max(1, Math.round((tp * (100 + pct)) / 100) + flat) : 0);
/** A skill's words for a number of hits, rewritten when every damage effect went from one count to another. */
const HIT_WORDS = (v: number) => [`${v} 段`, `${v} 次`, `${v} 枚`, `${v} 支`];

/**
 * A skill's words for its target, by 「old>new」 target (plan 8g ruling 14): when a rune really changes the target, only
 * that pair's words are rewritten, the longer ones first, every place they stand.
 */
export const TARGET_WORDS: Partial<Record<string, [string, string][]>> = {
  'enemy>enemies': [['一名敵人', '全體敵人'], ['單體', '全體'], ['牠', '牠們']],
  'ally>allies': [['一名隊友', '我方全體'], ['單體', '全體']],
  'enemies>enemy': [['全體敵人', '一名敵人'], ['敵方全體', '一名敵人'], ['全體', '單體'], ['牠們', '牠']],
  'allies>ally': [['我方全體', '一名隊友'], ['全隊', '一名隊友'], ['全體', '單體']],
  'self>allies': [['自身', '我方全體']],
};

/** A variant's clause that changes the target: 「改為對我方全體，」 of 「改為對我方全體，威力 65%。」 (the rest stays). */
const TARGET_NOTE = /改為[對打][^，。]*[，。]/g;

/** `desc` with the target words of `from` made `to`'s; a word already said the new way (牠們 for 牠) stays. */
function targetWords(desc: string, from: Target, to: Target): string {
  for (const [a, b] of TARGET_WORDS[`${from}>${to}`] ?? []) {
    desc = desc.replace(new RegExp(b.startsWith(a) ? `${a}(?!${b.slice(a.length)})` : a, 'g'), b);
  }
  return desc;
}

/**
 * The skill with its runes (spec §6.6, plan 8e Task 3): `core` is the skill after tree, mastery and legendary powers
 * without their `extra` effects, which come in `extra`. Only the runes that work count (runeStates), taken in RUNES
 * order, so any slot order gives the same skill. One patchSkill call: the shape's target, the hits, the element, the
 * power (every power and effect factor multiplied), the buff percent (the effect factors), the rounds; TP is set as
 * ruling 4 says. Then the per-hit rune fields on each damage effect, a cast-once ailment or cure as an effect of its
 * own (an ailment the skill already has merges into the rune's, highest chance), 化盾 on each heal, 血之代價's HP, and
 * the rules battle reads (`runeRules`); `extra` comes last. With no working rune: the 8d skill exactly.
 */
export function applyRunes(core: SkillDef, extra: Effect[], refs: readonly RuneRef[]): SkillDef {
  const working = runeStates({ ...core, effects: [...core.effects, ...extra] }, refs, core)
    .filter((x) => x.miss === null).map((x) => x.ref)
    .sort((a, b) => RUNE_ORDER.indexOf(a.id) - RUNE_ORDER.indexOf(b.id));
  if (!working.length) return extra.length ? patchSkill(core, { extra }) : core;
  const mods = working.map((r) => ({ id: r.id, mod: RUNES[r.id].mod(r.tier) }));

  const powers: number[] = [], effects: number[] = [];
  let tpPct = 0, tpFlat = 0, plainPct = 0, turns = 0;
  const onHit: Ailment[] = [], once: Ailment[] = [];
  const rules: RuneRules = {};
  const perHit: Partial<Damage> = {};
  let shape: RuneMod['shape'], hits: RuneMod['hits'], element: Element | undefined, cure = false, overflow: number | undefined, blood: number | undefined;
  for (const { id, mod } of mods) {
    if (mod.power !== undefined) powers.push(mod.power);
    if (mod.effect !== undefined) effects.push(mod.effect);
    tpPct += mod.tpPct ?? 0;
    tpFlat += mod.tpFlat ?? 0;
    if (id !== 'twin-cast') plainPct += mod.tpPct ?? 0;
    turns += mod.turns ?? 0;
    if (mod.shape) shape = mod.shape;
    if (mod.hits) hits = mod.hits;
    if (mod.element === 'wheel') rules.wheel = true;
    else if (mod.element) element = mod.element;
    if (mod.onHit) onHit.push({ ...mod.onHit });
    if (mod.inflict) once.push({ ...mod.inflict });
    if (mod.aftermath) perHit.aftermath = true;
    if (mod.armorBreak) perHit.armorBreak = true;
    if (mod.drainPct !== undefined) perHit.drainPct = mod.drainPct;
    if (mod.tpPerHit !== undefined) perHit.tpPerHit = mod.tpPerHit;
    if (mod.cure) cure = true;
    if (mod.overflowPct !== undefined) overflow = mod.overflowPct;
    if (mod.bloodPct !== undefined) blood = mod.bloodPct;
    if (mod.bounce) rules.bounce = { ...mod.bounce };
    if (mod.trigger) rules.trigger = { ...mod.trigger, rune: id };
    if (mod.twice) rules.twice = true;
    if (mod.sync !== undefined) rules.sync = mod.sync;
    if (mod.reprise !== undefined) rules.reprise = mod.reprise;
    if (mod.lasting) rules.lasting = { ...mod.lasting };
  }

  // 連擊 and 重擊 change each damage effect's own hits first: 重擊 folds every hit into one, its power the sum (exact).
  const damages = core.effects.filter((e): e is Damage => e.kind === 'damage');
  const base: SkillDef = hits ? {
    ...core,
    effects: core.effects.map((e): Effect => (e.kind !== 'damage' ? e
      : hits === 'plus1' ? { ...e, hits: (e.hits ?? 1) + 1 } : { ...e, power: e.power * (e.hits ?? 1), hits: 1 })),
  } : core;
  const target = shape === 'spread' ? ({ enemy: 'enemies', ally: 'allies' } as const)[core.target as 'enemy' | 'ally']
    : shape === 'focus' ? ({ enemies: 'enemy', allies: 'ally' } as const)[core.target as 'enemies' | 'allies']
      : shape === 'share' ? 'allies' as const : undefined;
  const patch: SkillMod = {
    ...(target ? { target } : {}), ...(element ? { element } : {}), ...(turns ? { turnsDelta: turns } : {}),
    ...(powers.length || effects.length ? { powerPct: product([...powers, ...effects]) } : {}),
    ...(effects.length ? { buffPct: product(effects) } : {}),
  };
  const out = patchSkill(base, patch);
  // The hits' words follow when every damage effect went from one count to one other: words that count them in Chinese
  // numerals are written again whole (HIT_DESC), any other has its 「n 段／次／枚」 changed, every place it stands.
  const was = new Set(damages.map((e) => e.hits ?? 1)), now = new Set(out.effects.filter((e): e is Damage => e.kind === 'damage').map((e) => e.hits ?? 1));
  if (hits && was.size === 1 && now.size === 1) {
    const [a] = was, [b] = now;
    const whole = HIT_DESC[core.id];
    if (whole && out.desc === whole(a)) out.desc = whole(b);
    // A one-hit skill names no count of hits: its 「1 次」 is something else (轉印's jumps, 追命's 還有。).
    else if (a > 1) {
      // 重擊 folds a variant's per-hit note into one hit at the whole power, the runes' own percent in it (rounded as
      // the engine rounds a power).
      if (b === 1) {
        out.desc = out.desc.replace(new RegExp(T.rune.perHitNote(a, '×([0-9.]+)'), 'g'),
          (_, p: string) => T.rune.foldedHits(b, pctOf(a * Math.round(Number(p) * 100), patch.powerPct)));
      }
      // A whole number only: 「2 次」 never matches inside 「12 次」.
      HIT_WORDS(a).forEach((w, i) => { out.desc = out.desc.replace(new RegExp(`(?<![0-9])${w}`, 'g'), HIT_WORDS(b)[i]); });
    }
  }
  // The target's and the element's words follow when they really changed (plan 8g ruling 14). A rune that takes the
  // target back to the skill's own drops the variant's clause that changed it (Task 2 reviews).
  if (out.target !== core.target) {
    if (out.target === SKILLS[core.id]?.target) out.desc = out.desc.replace(TARGET_NOTE, '');
    out.desc = targetWords(out.desc, core.target, out.target);
  }
  if (element) {
    for (const el of new Set(damages.map((e) => e.element))) {
      if (el !== element) out.desc = out.desc.split(T.rune.elementWord(T.element[el])).join(T.rune.elementWord(T.element[element]));
    }
  }

  // An ailment the skill (or its extra) already has is folded into the rune's of the same ailment, highest chance.
  const runeStatus = new Set([...onHit, ...once].map((a) => a.status));
  const folded = (list: Effect[]) => list.filter((e) => {
    if (e.kind !== 'inflict' || !runeStatus.has(e.status)) return true;
    for (const a of [...onHit, ...once]) if (a.status === e.status) a.chance = Math.max(a.chance, e.chance);
    return false;
  });
  const extraOut = folded(extra.map((e) => ({ ...e })));
  const effectsOut = folded(out.effects).map((e): Effect => {
    if (e.kind === 'damage') return { ...e, ...(onHit.length ? { onHit: onHit.map((a) => ({ ...a })) } : {}), ...perHit };
    if (e.kind === 'heal' && overflow !== undefined) return { ...e, overflowPct: Math.max(e.overflowPct ?? 0, overflow) };
    return e;
  });
  out.effects = [
    ...effectsOut,
    ...once.map((a): Effect => ({ kind: 'inflict', status: a.status, chance: a.chance })),
    ...(cure ? [{ kind: 'cure' } as Effect] : []),
    ...extraOut,
  ];

  out.tp = runeTp(core.tp, tpPct, tpFlat);
  if (blood !== undefined) {
    out.hpCost = (Math.round((core.hpCost ?? 0) * 100) + out.tp * blood) / 100;
    out.tp = 0;
  }
  if (rules.twice || blood !== undefined) {
    rules.plain = { tp: runeTp(core.tp, plainPct, tpFlat), ...(core.hpCost !== undefined ? { hpCost: core.hpCost } : {}) };
  }
  if (Object.keys(rules).length) out.runeRules = rules;
  return out;
}

/**
 * Where 彈射 goes next (plan 8e ruling 8, no draw): the next standing foe in line after `from` (the first target),
 * wrapping round, that this cast has not hit yet; none, undefined.
 */
export function bounceNext(enemies: readonly Combatant[], from: string, hit: ReadonlySet<string>): Combatant | undefined {
  const at = enemies.findIndex((c) => c.key === from);
  for (let i = 1; i <= enemies.length; i++) {
    const c = enemies[(at + i) % enemies.length];
    if (c.alive && !hit.has(c.key)) return c;
  }
  return undefined;
}

/**
 * What a rune says beyond its own sentence when it sits on this skill (plan 8g ruling 15); `def` is the skill before
 * runes, `others` the skill's other working runes. 常駐 on a barrier skill (plan 8e Task 7); an ailment rune whose ailment
 * the skill already has, at the skill's own chance (the higher one counts, applyRunes); 餘波 with the ailment it brings
 * on this skill's element, an element rune's among `others` first. Every number from `def`.
 */
export function runeNotes(def: SkillDef, id: RuneId, others: readonly RuneId[] = []): string[] {
  const out: string[] = [];
  if (id === 'lasting' && def.effects.some((e) => e.kind === 'barrier')) out.push(T.rune.lastingBarrier);
  const mod = RUNES[id].mod(tiersOf(id)[0]);
  const status = mod.onHit?.status ?? mod.inflict?.status;
  if (status) {
    const own = def.effects.flatMap((e) => (e.kind === 'inflict' ? [e] : e.kind === 'damage' ? e.onHit ?? [] : [])).filter((a) => a.status === status);
    const pct = Math.round(Math.max(...own.map((a) => a.chance)) * 100);
    if (own.length) out.push(pct >= 100 ? T.rune.notes.sure(T.ailment[status]) : T.rune.notes.merged(pct, T.ailment[status]));
  }
  if (id === 'aftermath') {
    const el = others.map((o) => GIVES[o]).find((e) => e !== undefined) ?? def.effects.find((e): e is Damage => e.kind === 'damage')?.element;
    if (el) out.push(T.rune.notes.aftermath(T.element[el], T.ailment[ELEMENT_AILMENT[el]]));
  }
  return out;
}
