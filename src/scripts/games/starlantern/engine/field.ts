/**
 * The labyrinth's field actions (plan 6f): pure rules, no draws. A recovery skill cast outside battle goes through the
 * battle's own path (fromMember, skillFor, skillCost, applyEffect), so it heals as much and costs as much TP as in a
 * fight. Only heal, revive and restore apply; none of them draws, and the rng handed to them throws if anything tries.
 * The simulation and battle never import this module (engine/field.test.ts guards it): the balance bands start every
 * fight full, which is as far as a field heal can push a member. Gear changes from the run pack live here too.
 */
import { fromMember, skillCost, skillFor } from './battle';
import type { Combatant } from './combatant';
import { BAG_SIZE } from './loot/bag';
import { activeIds } from './party';
import { learnedSkills, pctMod, skillRank } from './progression';
import type { Rng } from './rng';
import { abyssPct } from './scaling';
import { applyEffect, patchSkill, type EffectContext } from './skills';
import type { GameState } from './state';
import { takeOffInto, wearFrom, type WearResult } from './town';
import { SKILLS } from '../data/skills';
import type { CharacterId, Effect, ItemInstance, Member, Party, Slot } from './types';

/** The rng every field action hands on: a field action never draws, so any call is a bug. */
export const noDraw: Rng = () => { throw new Error('field actions never draw'); };

export type FieldFail = 'invalid' | 'down' | 'not-learned' | 'tp' | 'no-effect';
/** One member a field cast helped: HP gained (the revived count from 0) and whether they were raised. */
export interface FieldGain { id: CharacterId; hp: number; revived: boolean }

/** The effects a field cast applies; every other kind (cure, buff, taunt, turret, damage, inflict) only means something in a fight. */
const FIELD_EFFECTS: ReadonlySet<Effect['kind']> = new Set(['heal', 'revive', 'restore']);

/** The field skills a member has learned, in learnedSkills order. */
export function fieldSkills(m: Member): string[] {
  return learnedSkills(m).filter((id) => SKILLS[id]?.field);
}

/**
 * TP a member pays for `skill` outside battle: the battle price, through fromMember (so teachers-gift counts) and
 * skillCost (tree, powers). The cell only places the combatant on the grid; it never changes a price.
 */
export function fieldCost(m: Member, skill: string): number {
  return skillCost(fromMember(m, 0), skill);
}

const cellOf = (p: Party, id: CharacterId): number => Math.max(0, p.grid.indexOf(id));

/**
 * Whom the caster can choose for a single-target skill, in field order: the standing for `ally`, the fallen for
 * `deadAlly`. A skill that needs no choice (`allies`, `self`) gives none. The target is the skill as the caster casts it
 * (skillFor), so a worn power that turns it on the whole party asks for nobody.
 */
export function fieldTargets(p: Party, caster: CharacterId, skill: string): CharacterId[] {
  const def = skillFor(fromMember(p.roster[caster], cellOf(p, caster)), skill);
  const ids = activeIds(p);
  switch (def?.target) {
    case 'ally': return ids.filter((id) => p.roster[id].hp > 0);
    case 'deadAlly': return ids.filter((id) => p.roster[id].hp <= 0);
    default: return [];
  }
}

export type FieldCast =
  | { ok: true; state: GameState; gains: FieldGain[]; cost: number }
  | { ok: false; reason: FieldFail };

/**
 * A recovery skill cast outside battle by a standing member on the field. Pure: `s` is never touched.
 * - The caster must be on the field (`invalid`), standing (`down`), casting a `field` skill (`invalid`) they have learned
 *   (`not-learned`) and can pay for at the battle price (`tp`).
 * - The skill is the one the caster casts in battle (skillFor), with the abyss bonus for `depth` as a fight there gets it.
 * - Targets: `ally` and `deadAlly` take `o.target` from fieldTargets; `allies` the standing on the field, and the fallen
 *   too when the skill revives; `self` the caster. Anything else is `invalid`.
 * - HP only rises: a member above their sheet's max (an altar's leftover) keeps it. TP is spent only when someone gains
 *   HP or is raised (else `no-effect`). The gauge and the targets' TP are never written.
 */
export function castField(
  s: GameState, o: { caster: CharacterId; skill: string; target?: CharacterId; depth: number },
): FieldCast {
  const fail = (reason: FieldFail): FieldCast => ({ ok: false, reason });
  const p = s.party;
  const ids = activeIds(p);
  if (!ids.includes(o.caster)) return fail('invalid');
  const m = p.roster[o.caster];
  if (m.hp <= 0) return fail('down');
  if (!SKILLS[o.skill]?.field) return fail('invalid');
  if (skillRank(m.tree ?? {}, o.skill) <= 0) return fail('not-learned');

  const team = new Map<CharacterId, Combatant>();
  p.grid.forEach((id, cell) => { if (id) team.set(id, fromMember(p.roster[id], cell)); });
  const caster = team.get(o.caster)!;
  let def = skillFor(caster, o.skill);
  if (!def) return fail('invalid');
  const abyss = abyssPct(o.depth);
  if (def.abyss && abyss > 0) {
    const bonus = pctMod(def.id, 100 + abyss);
    if (bonus) def = patchSkill(def, bonus);
  }
  const cost = skillCost(caster, o.skill);
  if (caster.tp < cost) return fail('tp');

  let targets: CharacterId[];
  switch (def.target) {
    case 'ally': case 'deadAlly':
      if (!o.target || !fieldTargets(p, o.caster, o.skill).includes(o.target)) return fail('invalid');
      targets = [o.target];
      break;
    case 'allies': {
      const revives = def.effects.some((e) => e.kind === 'revive');
      targets = ids.filter((id) => revives || p.roster[id].hp > 0);
      break;
    }
    case 'self': targets = [o.caster]; break;
    default: return fail('invalid');
  }

  // The battle's order: the HP price first, then the effects.
  if (def.hpCost) caster.hp = Math.max(1, caster.hp - Math.floor(caster.max.hp * def.hpCost));
  const prior = new Map<CharacterId, { hp: number; alive: boolean }>();
  for (const [id, c] of team) prior.set(id, { hp: c.hp, alive: c.alive });
  const ctx: EffectContext = { rng: noDraw, itemBoost: false, revealed: {}, log: [] };
  for (const id of targets) {
    const t = team.get(id)!;
    for (const eff of def.effects) if (FIELD_EFFECTS.has(eff.kind)) applyEffect(caster, t, eff, ctx);
  }

  const gains: FieldGain[] = [];
  const hpAfter = new Map<CharacterId, number>();
  for (const id of targets) {
    const t = team.get(id)!;
    const was = prior.get(id)!;
    const revived = !was.alive && t.alive;
    // gainHp caps at the sheet's max, which would lower an altar's leftover: HP only ever rises here.
    const hp = revived ? t.hp : Math.max(was.hp, t.hp);
    hpAfter.set(id, hp);
    const before = p.roster[id].hp;
    if (revived || hp > before) gains.push({ id, hp: hp - Math.max(0, before), revived });
  }
  if (!gains.length) return fail('no-effect');

  const state = structuredClone(s);
  const roster = state.party.roster;
  for (const [id, hp] of hpAfter) roster[id].hp = hp;
  const self = roster[o.caster];
  self.tp -= cost;
  if (def.hpCost && !hpAfter.has(o.caster)) self.hp = caster.hp;
  return { ok: true, state, gains, cost };
}

/** A change of gear from the run pack: the new state and the new pack, or why not. */
export type PackResult<F extends string> = { ok: true; state: GameState; pack: ItemInstance[] } | { ok: false; reason: F };

const toPack = <F extends string>(r: WearResult<F>): PackResult<F> => (r.ok ? { ok: true, state: r.state, pack: r.list } : r);

/**
 * Wears piece `uid` from the run pack through town's own slot swap (`wearFrom`): in `slot`, or where defaultSlotFor puts
 * it; what the slot held goes back into the pack, so the pack keeps its count or loses one. Only a member on the field
 * may (`invalid`); the bench is in town. Pure: `s` and `pack` are never touched.
 */
export function packEquip(
  s: GameState, pack: ItemInstance[], member: CharacterId, uid: number, slot?: Slot,
): PackResult<'invalid' | 'stock'> {
  if (!activeIds(s.party).includes(member)) return { ok: false, reason: 'invalid' };
  return toPack(wearFrom(s, pack, member, uid, slot));
}

/**
 * Takes off what a member on the field wears in `slot` and puts it in the run pack (town's `takeOffInto`). The bag and
 * the pack together never pass BAG_SIZE (`full`): a piece with no slot at home would be lost on the way back. Pure.
 */
export function packUnequip(
  s: GameState, pack: ItemInstance[], member: CharacterId, slot: Slot,
): PackResult<'invalid' | 'full'> {
  if (!activeIds(s.party).includes(member)) return { ok: false, reason: 'invalid' };
  return toPack(takeOffInto(s, pack, member, slot, BAG_SIZE - s.bag.length));
}
