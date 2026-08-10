import {
  legalEnemyTargetsForMove,
  partyTargetAvailability,
  targetCoverForecast,
  type CombatState,
  type CombatantBase,
  type Move,
  type PartyMember,
} from '../combat';
import { projectileCoverProfile, type BattlefieldSide } from './battlefieldTerrain.m55';

export interface TacticalTargetChoice {
  id: string;
  label: string;
  allowed: boolean;
  reason: string;
  targetCount: number;
  coverHitModifier: number;
}

function rowLabel(row: CombatantBase & { formationRow?: 'front' | 'back' }): '前排' | '後排' {
  return row.formationRow === 'back' ? '後排' : '前排';
}

function livingFrontline(state: CombatState, side: BattlefieldSide): boolean {
  const units = side === 'party' ? state.party : state.enemies;
  return units.some((unit) => unit.hp > 0 && unit.formationRow !== 'back');
}

function coverLabel(modifier: number): string {
  return modifier <= -2 ? `強掩體 ${modifier}` : `掩體 ${modifier}`;
}

/**
 * M56 player information contract for a visible combatant card.
 * It intentionally describes only rules the engine already enforces; no page should infer rows or cover itself.
 */
export function tacticalUnitSummary(
  state: CombatState,
  side: BattlefieldSide,
  unit: CombatantBase & { formationRow?: 'front' | 'back' },
): string {
  if (unit.hp <= 0) return '倒下';
  const row = rowLabel(unit);
  if (row === '前排') return '前排｜正面接戰';

  const frontlineAlive = livingFrontline(state, side);
  const cover = projectileCoverProfile(
    state.terrain,
    side,
    unit.formationRow,
    'ranged',
    false,
    frontlineAlive,
  );
  const parts = ['後排'];
  if (frontlineAlive) parts.push('受前線保護');
  if (cover.applies) parts.push(coverLabel(cover.hitModifier));
  return parts.join('｜');
}

function attackTargetLabel(state: CombatState, move: Move, target: CombatState['enemies'][number], allowed: boolean): string {
  const parts = [rowLabel(target)];
  const cover = targetCoverForecast(state, move, target);
  if (!allowed && target.formationRow === 'back') parts.push('前線保護');
  if (cover.applies) parts.push(coverLabel(cover.hitModifier));
  return `${target.name}【${parts.join('｜')}】`;
}

function areaTargetChoice(state: CombatState, move: Move): TacticalTargetChoice[] {
  const legal = legalEnemyTargetsForMove(state, move);
  if (legal.length === 0) return [];
  const alive = state.enemies.filter((enemy) => enemy.hp > 0);
  const frontlineOnly = legal.length < alive.length && legal.every((enemy) => enemy.formationRow !== 'back');
  const covered = legal.filter((enemy) => targetCoverForecast(state, move, enemy).applies);
  const coverText = covered.length > 0 ? `｜${covered.length} 名受掩體影響` : '';
  return [{
    id: legal[0].id,
    label: `${frontlineOnly ? '敵方前排全體' : '敵方全體'}（${legal.length}）${coverText}`,
    allowed: true,
    reason: '',
    targetCount: legal.length,
    coverHitModifier: covered.length > 0
      ? Math.min(...covered.map((enemy) => targetCoverForecast(state, move, enemy).hitModifier))
      : 0,
  }];
}

/**
 * The reusable M56 UI source of truth.
 * - blocked rear targets remain visible but disabled, so the player can understand *why* they cannot be selected;
 * - ranged / mystic attacks expose the legal rear option;
 * - area actions report the exact engine target set rather than pretending every AoE hits every rank;
 * - ally/self actions remain compatible with the original combat loop.
 */
export function tacticalTargetChoices(
  state: CombatState,
  actor: PartyMember,
  move: Move,
): TacticalTargetChoice[] {
  if (move.target === 'self' || move.kind === 'guard') {
    return [{ id: actor.id, label: actor.name, allowed: true, reason: '', targetCount: 1, coverHitModifier: 0 }];
  }

  if (move.target === 'ally') {
    return state.party
      .filter((member) => member.hp > 0)
      .map((member) => ({
        id: member.id,
        label: `${member.name}【${rowLabel(member)}｜HP ${member.hp}/${member.maxHp}】`,
        allowed: true,
        reason: '',
        targetCount: 1,
        coverHitModifier: 0,
      }));
  }

  if (move.kind === 'attack' && move.area) return areaTargetChoice(state, move);

  return state.enemies
    .filter((enemy) => enemy.hp > 0)
    .map((enemy) => {
      const availability = partyTargetAvailability(state, actor, move, enemy);
      const cover = targetCoverForecast(state, move, enemy);
      return {
        id: enemy.id,
        label: attackTargetLabel(state, move, enemy, availability.allowed),
        allowed: availability.allowed,
        reason: availability.reason,
        targetCount: 1,
        coverHitModifier: cover.hitModifier,
      };
    });
}
