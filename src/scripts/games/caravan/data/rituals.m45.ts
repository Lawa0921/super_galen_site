import {
  advanceTurn,
  enemyAct,
  type CombatState,
  type EnemyUnit,
  type Move,
} from '../combat';
import type { Rng } from '../rng';

export interface RitualRule {
  moveId: string;
  label: string;
  telegraph: string;
  interruptHint: string;
}

export interface RitualCharge {
  enemyId: string;
  moveId: string;
  startedRound: number;
}

export type RitualEnemyActionResult =
  | { kind: 'normal'; moveId: string }
  | { kind: 'prepared'; moveId: string }
  | { kind: 'resolved'; moveId: string }
  | { kind: 'interrupted'; moveId: string };

/**
 * M45 intentionally limits rituals to dangerous, readable encounter-defining moves.
 * Ordinary attacks and minor spells still resolve immediately so combat does not become sluggish.
 */
export const RITUAL_RULES: Record<string, RitualRule> = {
  'reliquary-silent-chorus': {
    moveId: 'reliquary-silent-chorus',
    label: '無聲聖歌儀式',
    telegraph: '無舌領唱者仰起被縫死的臉，整座唱詩窟的死寂正向它胸腔聚攏。',
    interruptHint: '在它下次行動前造成暈眩，或用弱點打空護勢使其破防。',
  },
  'reliquary-ember-breath': {
    moveId: 'reliquary-ember-breath',
    label: '心火吐息蓄勢',
    telegraph: '龍燼化身收攏胸腔中的古龍心火，裂縫間的火光開始灼白。',
    interruptHint: '在它下次行動前造成暈眩，或以冰／聖弱點擊破護勢。',
  },
};

const charges = new WeakMap<CombatState, Map<string, RitualCharge>>();

function chargeMap(state: CombatState): Map<string, RitualCharge> {
  let map = charges.get(state);
  if (!map) {
    map = new Map<string, RitualCharge>();
    charges.set(state, map);
  }
  return map;
}

export function ritualRuleForMove(moveId: string | undefined): RitualRule | null {
  return moveId ? RITUAL_RULES[moveId] ?? null : null;
}

export function ritualChargeFor(state: CombatState, enemyId: string): RitualCharge | null {
  return chargeMap(state).get(enemyId) ?? null;
}

export function clearRitualCharge(state: CombatState, enemyId: string): void {
  chargeMap(state).delete(enemyId);
}

function hasStun(enemy: EnemyUnit): boolean {
  return (enemy.statuses ?? []).some((status) => status.kind === 'stun' && status.remaining > 0);
}

function preparationMove(rule: RitualRule, source: Move): Move {
  return {
    id: `ritual-preparation:${source.id}`,
    name: `準備・${rule.label}`,
    kind: 'support',
    target: 'self',
    hitStat: source.hitStat,
    narration: rule.telegraph,
  };
}

/**
 * UI-facing intent text. The first phase announces preparation; once charged, the player
 * sees that the ritual will resolve on the caster's next action and how to interrupt it.
 */
export function ritualIntentText(state: CombatState, enemy: EnemyUnit): string {
  const charged = ritualChargeFor(state, enemy.id);
  if (charged) {
    const move = enemy.moves.find((candidate) => candidate.id === charged.moveId);
    const rule = ritualRuleForMove(charged.moveId)!;
    return `即將完成：${move?.name ?? rule.label}｜可中斷：${rule.interruptHint}`;
  }
  const intended = state.enemyIntents[enemy.id];
  const rule = ritualRuleForMove(intended);
  if (!rule) {
    const move = enemy.moves.find((candidate) => candidate.id === intended);
    return move?.name ?? '未知意圖';
  }
  return `準備儀式：${rule.label}｜${rule.interruptHint}`;
}

/**
 * M45 wrapper around the existing fair M44 enemy turn.
 *
 * - A ritual's first turn performs a harmless, visible preparation action.
 * - The original move remains the public next intent.
 * - Stun (including weakness/poise break) before the next turn cancels the charge.
 * - If not interrupted, the ordinary M44 enemyAct executes the real move and pays its
 *   normal mana/favor cost. No duplicate damage/resource implementation lives here.
 */
export function ritualEnemyAct(
  rng: Rng,
  state: CombatState,
  enemyId: string,
): RitualEnemyActionResult {
  const enemy = state.enemies.find((candidate) => candidate.id === enemyId);
  if (!enemy || state.outcome !== 'ongoing') return { kind: 'normal', moveId: '' };

  const map = chargeMap(state);
  const charged = map.get(enemyId);
  if (charged) {
    if (hasStun(enemy)) {
      const rule = ritualRuleForMove(charged.moveId);
      map.delete(enemyId);
      state.log.push({
        kind: 'info',
        text: `${enemy.name}的${rule?.label ?? '儀式'}被打斷了！`,
      });
      enemyAct(rng, state, enemyId);
      return { kind: 'interrupted', moveId: charged.moveId };
    }

    state.enemyIntents[enemyId] = charged.moveId;
    enemyAct(rng, state, enemyId);
    map.delete(enemyId);
    return { kind: 'resolved', moveId: charged.moveId };
  }

  const intendedId = state.enemyIntents[enemyId] ?? enemy.moves[0]?.id ?? '';
  const rule = ritualRuleForMove(intendedId);
  if (!rule || hasStun(enemy)) {
    enemyAct(rng, state, enemyId);
    return { kind: 'normal', moveId: intendedId };
  }

  const source = enemy.moves.find((move) => move.id === intendedId);
  if (!source) {
    enemyAct(rng, state, enemyId);
    return { kind: 'normal', moveId: intendedId };
  }

  const prep = preparationMove(rule, source);
  enemy.moves.push(prep);
  state.enemyIntents[enemyId] = prep.id;
  enemyAct(rng, state, enemyId);
  enemy.moves = enemy.moves.filter((move) => move.id !== prep.id);

  // Poison or another start-of-turn effect may have killed the caster during preparation.
  if (enemy.hp <= 0 || state.outcome !== 'ongoing') {
    map.delete(enemyId);
    return { kind: 'normal', moveId: intendedId };
  }

  map.set(enemyId, { enemyId, moveId: intendedId, startedRound: state.round });
  state.enemyIntents[enemyId] = intendedId;
  state.log.push({
    kind: 'info',
    text: `${rule.label}已經成形——${rule.interruptHint}`,
  });
  return { kind: 'prepared', moveId: intendedId };
}

/** Test helper: consume a preparation turn without needing UI or page logic. */
export function forceRitualPreparation(
  state: CombatState,
  enemyId: string,
  moveId: string,
): void {
  if (!RITUAL_RULES[moveId]) throw new Error(`未知儀式招式「${moveId}」`);
  chargeMap(state).set(enemyId, { enemyId, moveId, startedRound: state.round });
  state.enemyIntents[enemyId] = moveId;
  advanceTurn(state);
}
