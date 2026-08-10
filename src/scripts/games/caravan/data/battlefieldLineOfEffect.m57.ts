import type { Move } from '../combat';
import type { FormationRow } from '../save';
import { mysticRuleForMove } from './arcana';
import type { BattlefieldTerrain } from './battlefieldTerrain.m55';
import { engagementForMove } from './martialEngagement.m49';

export type AttackDelivery = 'contact' | 'direct' | 'overhead';

export interface LineOfEffectProfile {
  delivery: AttackDelivery;
  bypassesFrontline: boolean;
  blocked: boolean;
  message: string;
}

/**
 * These moves predate the M57 delivery field but their authored names/narrations already make
 * the geometry unambiguous. New moves should author `delivery` directly; this compatibility map
 * prevents old content from changing fiction merely because the new rule did not exist yet.
 */
const LEGACY_OVERHEAD_MOVE_IDS = new Set([
  'arrow-storm',
  'meteor-fall',
]);
const LEGACY_CONTACT_MYSTIC_MOVE_IDS = new Set([
  'judgement-hammer',
  'reliquary-lament-touch',
]);

/**
 * M57 separates *how an attack reaches the target* from whether it is mundane or mystical.
 * Magic is therefore no longer a synonym for "ignores space": a touch spell is contact,
 * an ordinary bolt/fireball is direct, and only explicitly authored lobbed/descending attacks
 * are overhead.
 */
export function attackDeliveryForMove(move: Move): AttackDelivery {
  if (move.delivery) return move.delivery;
  if (LEGACY_OVERHEAD_MOVE_IDS.has(move.id)) return 'overhead';
  if (LEGACY_CONTACT_MYSTIC_MOVE_IDS.has(move.id)) return 'contact';
  const engagement = engagementForMove(move, !!mysticRuleForMove(move));
  if (engagement === 'melee' || engagement === 'reach') return 'contact';
  return 'direct';
}

export function moveCanBypassFrontline(move: Move): boolean {
  return move.kind === 'attack' && attackDeliveryForMove(move) !== 'contact';
}

export function solidRearObstructionActive(
  terrain: BattlefieldTerrain | undefined,
  targetRow: FormationRow | undefined,
  frontlineAlive: boolean,
): boolean {
  return !!terrain
    && terrain.rearLineObstruction === 'solid'
    && targetRow === 'back'
    && frontlineAlive;
}

/**
 * A solid M57 obstruction blocks only a *direct* line to a protected rear target.
 * Contact attacks are already governed by the frontline gate. Explicit overhead attacks may
 * pass above the obstruction, but receive no positive accuracy/damage bonus for doing so.
 */
export function lineOfEffectProfile(
  terrain: BattlefieldTerrain | undefined,
  targetRow: FormationRow | undefined,
  frontlineAlive: boolean,
  move: Move,
): LineOfEffectProfile {
  const delivery = attackDeliveryForMove(move);
  const bypassesFrontline = move.kind === 'attack' && delivery !== 'contact';
  if (
    move.kind !== 'attack'
    || !solidRearObstructionActive(terrain, targetRow, frontlineAlive)
    || delivery !== 'direct'
  ) {
    return { delivery, bypassesFrontline, blocked: false, message: '' };
  }
  return {
    delivery,
    bypassesFrontline,
    blocked: true,
    message: `${terrain!.name}的實體殘牆與車陣切斷了通往後排的直線作用線；${move.name}必須改打前排、使用明確越頂招式，或先突破戰線。`,
  };
}
