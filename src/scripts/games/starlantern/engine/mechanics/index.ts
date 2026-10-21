/**
 * Character mechanics (spec §8, plan 8c): one small module per mechanic, reached only through the hooks below, so a
 * combatant without a mechanic walks every path it walked before. battle.ts, skills.ts and sim.ts call these
 * dispatchers and nothing else; each module acts only on the combatants whose `mech` (or state) is its own.
 *
 * No hook draws from the fight's rng unless the plan's 「亂數」 list names it.
 */
import { skillCost, type Action, type BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { DEVICE, type MechState } from '../mech';
import type { Rng } from '../rng';
import type { EffectContext } from '../skills';
import type { CharacterId, SkillDef, UltimateDef } from '../types';
import { heat } from './heat';
import { mark } from './mark';
import { barrier } from './barrier';
import { moon } from './moon';
import { coins } from './coins';
import { aim } from './aim';
import { embers } from './embers';
import { beat } from './beat';
import { devices } from './devices';
import { echo } from './echo';

/** A mechanic's colour on the battle screen (`$slx-mech` in the stylesheet, MECH_FILL for the Pixi picture). */
/** `plain`: a moment no mechanic claims, in the ink colour. */
export type MechTone = 'heat' | 'expose' | 'mark' | 'veil' | 'ward' | 'purify' | 'moon' | 'coins' | 'aim' | 'embers' | 'beat' | 'devices' | 'plain';
/** A mechanic's word on the battle screen: 「熱度3」, 「暗記」. */
/** `setup`: one the party put on a foe on purpose (暗記, 瞄準, 估價, 弱點): it comes before a foe's other words and ailments. */
export interface MechWord { tone: MechTone; text: string; setup?: true }
/** A mechanic's moment, popped over the member and logged: Noel's overload, Rin's 還有。. */
/** `no-barrier`: the great barrier cast with no barrier up; `counter`: Scarlet's 贖火; `misstep`, `finale`: Safira's beat. */
export type MechCue = 'overload' | 'again' | 'no-barrier' | 'counter' | 'misstep' | 'finale';
/** What an action cast: a skill (as its mechanics rewrote it) or an ultimate that fired. */
export type CastDef = SkillDef | UltimateDef;

export interface MechModule {
  /** At createBattle, for each member (after MECH_OF has given her her state). */
  init?(s: BattleState, c: Combatant): void;
  /** The skill as `c` would cast it now; pure, draws nothing, never changes `def`. */
  castDef?(s: BattleState, c: Combatant, def: SkillDef): SkillDef;
  /** The TP `c` would pay now for skill `id`, given what she pays without mechanics. */
  castCost?(s: BattleState, c: Combatant, cost: number, id: string): number;
  /** After the TP and HP are paid, before the effects. */
  pay?(s: BattleState, c: Combatant, def: SkillDef, ctx: EffectContext): void;
  /** After every landed hit of `applyEffect`. */
  onHit?(actor: Combatant, target: Combatant, ctx: EffectContext): void;
  /** After each party action in resolveRound; `def` is the skill as cast (castDef), null for anything else. */
  after?(s: BattleState, c: Combatant, act: Action, def: CastDef | null, ctx: EffectContext): void;
  /** Before a party member's action: what `extraAction` will need to compare against. */
  watch?(s: BattleState, c: Combatant): unknown;
  /** After a party member's action (and `after`): one more action now, or null. It logs its own moment. */
  extraAction?(s: BattleState, c: Combatant, act: Action, ctx: EffectContext, seen: unknown): Action | null;
  /**
   * After a foe's action; `from` is where its events start in the log, `idle` who was frozen or asleep as it began (Scarlet's
   * 贖火 answers a blow on her, unless she could not stir).
   */
  afterFoe?(s: BattleState, foe: Combatant, ctx: EffectContext, from: number, idle: readonly string[]): void;
  /** At the round's end, before any tick (the purifying barrier heals and cures here). */
  beforeTicks?(s: BattleState, ctx: EffectContext, rng: Rng): void;
  /** At the round's end, after every tick: countdowns, clean-ups. */
  roundEnd?(s: BattleState, ctx: EffectContext, rng: Rng): void;
  /** The word a moment of this mechanic pops (its colour is the mechanic's). */
  cue?(cue: MechCue): MechWord | undefined;
  /** Why `c` cannot cast `def` now (it would spend an empty resource for nothing), or null. */
  unusable?(s: BattleState, c: Combatant, def: SkillDef): string | null;
  /** Words under a member, over a foe, and over the whole field. */
  words?(s: BattleState, c: Combatant): MechWord[];
  foeWords?(s: BattleState, e: Combatant): MechWord[];
  fieldWords?(s: BattleState): MechWord[];
}

/** In hook order. Read lazily: the modules and the engine import each other, so the list is built on first use. */
let MODULES_CACHE: MechModule[] | null = null;
const modules = (): MechModule[] => (MODULES_CACHE ??= [heat, mark, barrier, moon, coins, aim, beat, embers, devices, echo]);

/** Each character's mechanic as a fight opens it; a member without an entry has none. */
export const MECH_OF: Partial<Record<CharacterId, () => MechState>> = {
  noel: () => ({ kind: 'heat', heat: 0 }),
  rin: () => ({ kind: 'mark', marks: [], cap: 1 }),
  chizuru: () => ({ kind: 'barrier' }),
  liz: () => ({ kind: 'coins', coins: 0 }),
  sylvie: () => ({ kind: 'aim', target: null, stacks: 0 }),
  scarlet: () => ({ kind: 'embers', embers: 0 }),
  safira: () => ({ kind: 'beat', beat: 0, last: null }),
  bobby: () => ({ kind: 'devices', devices: [], cap: DEVICE.cap }),
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
  return modules().reduce((n, m) => (m.castCost ? m.castCost(s, c, n, id) : n), skillCost(c, id));
}

export function payMech(s: BattleState, c: Combatant, def: SkillDef, ctx: EffectContext): void {
  for (const m of modules()) m.pay?.(s, c, def, ctx);
}

export function onLandedHit(actor: Combatant, target: Combatant, ctx: EffectContext): void {
  for (const m of modules()) m.onHit?.(actor, target, ctx);
}

export function afterAction(s: BattleState, c: Combatant, act: Action, def: CastDef | null, ctx: EffectContext): void {
  for (const m of modules()) m.after?.(s, c, act, def, ctx);
}

/** Each module's look before a party member's action, in module order, for `extraAction`. */
export function watchAction(s: BattleState, c: Combatant): unknown[] {
  return modules().map((m) => m.watch?.(s, c));
}

/** The first extra action a module grants after `c`'s action, or null. */
export function extraAction(s: BattleState, c: Combatant, act: Action, ctx: EffectContext, seen: unknown[]): Action | null {
  const ms = modules();
  for (let i = 0; i < ms.length; i++) {
    const a = ms[i].extraAction?.(s, c, act, ctx, seen[i]);
    if (a) return a;
  }
  return null;
}

/** The first reason a mechanic gives why `c` cannot cast `def` now (the menu greys it, the sim skips it), or null. */
export function whyNot(s: BattleState, c: Combatant, def: SkillDef): string | null {
  for (const m of modules()) {
    const why = m.unusable?.(s, c, def);
    if (why) return why;
  }
  return null;
}

/** After each foe's action. */
export function afterFoe(s: BattleState, foe: Combatant, ctx: EffectContext, from: number, idle: readonly string[] = []): void {
  for (const m of modules()) m.afterFoe?.(s, foe, ctx, from, idle);
}

/** At the start of endOfRound, before any tick. */
export function mechBeforeTicks(s: BattleState, ctx: EffectContext, rng: Rng): void {
  for (const m of modules()) m.beforeTicks?.(s, ctx, rng);
}

/** At the end of endOfRound, after every tick. */
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

/** The word a cue pops over its member, from the mechanic it belongs to. */
export function cueWord(cue: MechCue): MechWord {
  for (const m of modules()) {
    const w = m.cue?.(cue);
    if (w) return w;
  }
  return { tone: 'plain', text: cue };
}
