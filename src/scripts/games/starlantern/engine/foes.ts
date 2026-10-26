/**
 * The roster's foe mechanics (roster plan B2–B4, spec §6.2), as pure functions battle.ts calls at fixed points. Every
 * decision here is made without a draw (spec §6.1); a combatant without these fields walks every path it walked before.
 */
import type { BattleState } from './battle';
import type { Combatant } from './combatant';
import type { EnemySkill } from './types';

const living = (cs: Combatant[]) => cs.filter((c) => c.alive);
/** A foe that can stir: awake and not frozen (a sleeping or frozen guard guards no one, as Scarlet covers no one then). */
const stirs = (c: Combatant) => c.alive && c.sleep === 0 && !c.frozen;

/**
 * M2 guard: the foe a party member's single blow lands on. Another foe that covers `t` (the enemy side's `cover`) and can
 * stir takes it instead; anything else is `t` itself. Draws nothing.
 */
export function foeGuard(s: BattleState, t: Combatant): Combatant {
  if (t.side !== 'enemy') return t;
  return s.enemies.find((e) => e !== t && stirs(e) && e.cover?.ally === t.key) ?? t;
}

/**
 * M2 guard: who a foe's guard skill (target `ally`, a `cover` effect) covers: the living ally with the lowest share of HP
 * but itself (the first such, in line order). Undefined for any other skill, so it finds its targets as it always has; an
 * empty list when it stands alone.
 */
export function guardTargets(s: BattleState, actor: Combatant, sk: EnemySkill): Combatant[] | undefined {
  if (actor.side !== 'enemy' || sk.target !== 'ally' || !sk.effects.some((e) => e.kind === 'cover')) return undefined;
  const others = living(s.enemies).filter((c) => c !== actor);
  if (!others.length) return [];
  return [others.reduce((a, b) => (b.hp / b.max.hp < a.hp / a.max.hp ? b : a))];
}

/** M24 hunt: the living member called out for `round` (a hunt lands on one at a time), or undefined. */
export function huntedIn(s: BattleState, round: number): Combatant | undefined {
  return s.party.find((c) => c.alive && c.hunted === round && !c.defending);
}

/** At a round's start, once the party's defending is known: a member who defends lifts the hunt on her (M24). */
export function foesRoundStart(s: BattleState): void {
  for (const c of s.party) if (c.defending && c.hunted !== undefined) delete c.hunted;
}

/** At a round's end, after the mechanics: a foe's guard counts down its rounds (M2); a hunt for this round is over (M24). */
export function foesRoundEnd(s: BattleState): void {
  for (const e of s.enemies) {
    if (!e.cover) continue;
    if (e.cover.turns > 1) e.cover = { ...e.cover, turns: e.cover.turns - 1 };
    else delete e.cover;
  }
  for (const c of s.party) if (c.hunted !== undefined && c.hunted <= s.round) delete c.hunted;
}
