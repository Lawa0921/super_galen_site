import { RUNES, TAGS, exclusiveGroupOf, type RuneId, type RuneRef, type Tag } from '../data/runes';
import { T } from '../data/text.zh-TW';
import type { Effect, Element, SkillDef } from './types';

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
  const hint = own === 'ailment' && needs.some((way) => way.some((t) => ELEMENT_TAGS.includes(t)));
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
