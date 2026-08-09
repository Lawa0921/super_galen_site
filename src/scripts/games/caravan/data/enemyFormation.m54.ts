import type { FormationRow } from '../save';
import type { EnemyUnit, Move } from '../combat';
import { mysticRuleForMove } from './arcana';
import { engagementForMove, type EngagementBand } from './martialEngagement.m49';

export interface EnemyLineGate {
  allowed: boolean;
  reason: string;
  engagement: EngagementBand | null;
}

function attackEngagement(move: Move): EngagementBand | null {
  if (move.kind !== 'attack') return null;
  return engagementForMove(move, !!mysticRuleForMove(move));
}

/**
 * M54 enemy formation inference is deliberately conservative:
 * - any real melee attack makes the unit a frontline candidate;
 * - guard-only units also prefer the front;
 * - pure ranged/reach/mystic/support units prefer the rear;
 * - explicit authored formationRow always wins.
 */
export function preferredEnemyRow(enemy: EnemyUnit): FormationRow {
  if (enemy.formationRow === 'front' || enemy.formationRow === 'back') return enemy.formationRow;
  const engagements = enemy.moves
    .map(attackEngagement)
    .filter((value): value is EngagementBand => value !== null);
  if (engagements.includes('melee')) return 'front';
  if (enemy.moves.some((move) => move.kind === 'guard')) return 'front';
  return 'back';
}

/**
 * Fill missing enemy rows, then forbid an all-rear phantom screen.
 * If an encounter truly has no frontline body, every survivor is exposed in front rank.
 */
export function initializeEnemyFormation(enemies: EnemyUnit[]): { promoted: string[] } {
  for (const enemy of enemies) {
    enemy.formationRow = preferredEnemyRow(enemy);
  }
  return collapseEnemyFrontLine(enemies);
}

/**
 * M54 mirrors M49 frontline collapse: once every living enemy frontliner is gone,
 * all surviving rear units are forced into close engagement.
 */
export function collapseEnemyFrontLine(enemies: EnemyUnit[]): { promoted: string[] } {
  const alive = enemies.filter((enemy) => enemy.hp > 0);
  if (alive.length === 0 || alive.some((enemy) => enemy.formationRow !== 'back')) return { promoted: [] };
  const promoted = alive.map((enemy) => enemy.id);
  for (const enemy of alive) enemy.formationRow = 'front';
  return { promoted };
}

export function enemyFormationLabel(enemy: Pick<EnemyUnit, 'formationRow'>): '前排' | '後排' {
  return enemy.formationRow === 'back' ? '後排' : '前排';
}

export function livingEnemyFrontExists(enemies: EnemyUnit[]): boolean {
  return enemies.some((enemy) => enemy.hp > 0 && enemy.formationRow !== 'back');
}

/**
 * A living enemy frontline physically protects rear targets from close-combat attacks.
 * Ranged weapons and true magic can bypass the line; melee and reach must break it first.
 * This is a hard target gate, but rejected attempts must not spend the player's turn.
 */
export function enemyLineGate(enemies: EnemyUnit[], move: Move, target: EnemyUnit): EnemyLineGate {
  if (move.kind !== 'attack' || target.hp <= 0) {
    return { allowed: target.hp > 0, reason: target.hp > 0 ? '' : '目標已經倒下。', engagement: null };
  }
  const engagement = engagementForMove(move, !!mysticRuleForMove(move));
  if (target.formationRow !== 'back' || !livingEnemyFrontExists(enemies)) {
    return { allowed: true, reason: '', engagement };
  }
  if (engagement === 'ranged' || engagement === 'mystic') {
    return { allowed: true, reason: '', engagement };
  }
  const label = engagement === 'reach' ? '長柄武器' : '近戰武器';
  return {
    allowed: false,
    reason: `${target.name}仍在敵方後排，前線尚未突破；${label}必須先處理仍存活的前排敵人。`,
    engagement,
  };
}

/** Party attacks that can legally reach the enemy line. Used by both single-target and area attacks. */
export function legalEnemyTargets(enemies: EnemyUnit[], move: Move): EnemyUnit[] {
  const alive = enemies.filter((enemy) => enemy.hp > 0);
  if (move.kind !== 'attack') return alive;
  return alive.filter((enemy) => enemyLineGate(alive, move, enemy).allowed);
}

/**
 * Enemy targeting uses the same line logic in reverse.
 * Close combat attacks the player's frontline; ranged/mystic attacks may threaten anyone.
 */
export function enemyCanBypassPartyFront(move: Move): boolean {
  if (move.kind !== 'attack') return false;
  const engagement = engagementForMove(move, !!mysticRuleForMove(move));
  return engagement === 'ranged' || engagement === 'mystic';
}
