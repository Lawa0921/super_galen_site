/**
 * Character mechanics (spec §8, plan 8c): one small module per mechanic, reached only through the hooks below, so a
 * combatant without a mechanic walks every path it walked before. battle.ts, skills.ts and sim.ts call these
 * dispatchers and nothing else; each module acts only on the combatants whose `mech` (or state) is its own.
 *
 * No hook draws from the fight's rng unless the plan's 「亂數」 list names it.
 */
import { skillCost, type Action, type BattleState } from '../battle';
import type { Combatant } from '../combatant';
import type { MechState } from '../mech';
import type { Rng } from '../rng';
import type { EffectContext } from '../skills';
import type { CharacterId, SkillDef } from '../types';
import { T } from '../../data/text.zh-TW';
import { heat } from './heat';
import { mark } from './mark';

/** A mechanic's colour on the battle screen (`$slx-mech` in the stylesheet, MECH_FILL for the Pixi picture). */
export type MechTone = 'heat' | 'expose' | 'mark' | 'veil';
/** A mechanic's word on the battle screen: 「熱度3」, 「暗記」. */
export interface MechWord { tone: MechTone; text: string }
/** A mechanic's moment, popped over the member and logged: Noel's overload, Rin's 還有。. */
export type MechCue = 'overload' | 'again';

export interface MechModule {
  /** At createBattle, for each member (after MECH_OF has given her her state). */
  init?(s: BattleState, c: Combatant): void;
  /** The skill as `c` would cast it now; pure, draws nothing, never changes `def`. */
  castDef?(s: BattleState, c: Combatant, def: SkillDef): SkillDef;
  /** The TP `c` would pay now, given what she pays without mechanics. */
  castCost?(s: BattleState, c: Combatant, cost: number): number;
  /** After the TP and HP are paid, before the effects. */
  pay?(s: BattleState, c: Combatant, def: SkillDef, ctx: EffectContext): void;
  /** After every landed hit of `applyEffect`. */
  onHit?(actor: Combatant, target: Combatant, ctx: EffectContext): void;
  /** After each party action in resolveRound; `def` is the skill as cast (castDef), null for anything else. */
  after?(s: BattleState, c: Combatant, act: Action, def: SkillDef | null, ctx: EffectContext): void;
  /** At the very start of the round's end. */
  roundEnd?(s: BattleState, ctx: EffectContext, rng: Rng): void;
  /** Words under a member, over a foe, and over the whole field. */
  words?(s: BattleState, c: Combatant): MechWord[];
  foeWords?(s: BattleState, e: Combatant): MechWord[];
  fieldWords?(s: BattleState): MechWord[];
}

/** In hook order. Read lazily: the modules and the engine import each other, so the list is built on first use. */
let MODULES_CACHE: MechModule[] | null = null;
const modules = (): MechModule[] => (MODULES_CACHE ??= [heat, mark]);

/** Each character's mechanic as a fight opens it; a member without an entry has none. */
export const MECH_OF: Partial<Record<CharacterId, () => MechState>> = {
  noel: () => ({ kind: 'heat', heat: 0 }),
  rin: () => ({ kind: 'mark', marks: [], cap: 1 }),
};

/** Every member with an entry in MECH_OF gets a fresh mechanic; nothing carries over from an earlier fight. */
export function initMechs(s: BattleState): void {
  for (const c of s.party) {
    const make = c.side === 'party' ? MECH_OF[c.defId as CharacterId] : undefined;
    if (make) c.mech = make();
    else delete c.mech;
  }
  for (const c of s.party) for (const m of modules()) m.init?.(s, c);
}

export function castDef(s: BattleState, c: Combatant, def: SkillDef): SkillDef {
  return modules().reduce((d, m) => (m.castDef ? m.castDef(s, c, d) : d), def);
}

export function castCost(s: BattleState, c: Combatant, id: string): number {
  return modules().reduce((n, m) => (m.castCost ? m.castCost(s, c, n) : n), skillCost(c, id));
}

export function payMech(s: BattleState, c: Combatant, def: SkillDef, ctx: EffectContext): void {
  for (const m of modules()) m.pay?.(s, c, def, ctx);
}

export function onLandedHit(actor: Combatant, target: Combatant, ctx: EffectContext): void {
  for (const m of modules()) m.onHit?.(actor, target, ctx);
}

export function afterAction(s: BattleState, c: Combatant, act: Action, def: SkillDef | null, ctx: EffectContext): void {
  for (const m of modules()) m.after?.(s, c, act, def, ctx);
}

export function mechRoundEnd(s: BattleState, ctx: EffectContext, rng: Rng): void {
  for (const m of modules()) m.roundEnd?.(s, ctx, rng);
}

export function memberWords(s: BattleState, c: Combatant): MechWord[] {
  return modules().flatMap((m) => m.words?.(s, c) ?? []);
}

export function foeWords(s: BattleState, e: Combatant): MechWord[] {
  return modules().flatMap((m) => m.foeWords?.(s, e) ?? []);
}

export function fieldWords(s: BattleState): MechWord[] {
  return modules().flatMap((m) => m.fieldWords?.(s) ?? []);
}

/** The word a cue pops over its member. */
export function cueWord(cue: MechCue): MechWord {
  return cue === 'overload' ? { tone: 'heat', text: T.mech.cue.overload } : { tone: 'mark', text: T.mech.cue.again };
}
