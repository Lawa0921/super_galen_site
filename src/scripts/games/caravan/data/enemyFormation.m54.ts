import type { FormationRow } from '../save';
import type { EnemyUnit, Move } from '../combat';
import { mysticRuleForMove } from './arcana';
import type { BattlefieldTerrain } from './battlefieldTerrain.m55';
import {
  attackDeliveryForMove,
  lineOfEffectProfile,
  moveCanBypassFrontline,
} from './battlefieldLineOfEffect.m57';
import { engagementForMove, type EngagementBand } from './martialEngagement.m49';

export interface EnemyLineGate {
  allowed: boolean;
  reason: string;
  engagement: EngagementBand | null;
}

/**
 * Two pre-M49 enemy arrows were authored before element/engagement metadata existed.
 * Their names/narration are unambiguously bows, so M54 repairs them at combat-runtime
 * instead of letting them remain fake melee attacks forever.
 */
const LEGACY_RANGED_BOW_IDS = new Set(['ridge-arrow', 'bone-arrow']);

export function normalizeEnemyWeaponSemantics(enemy: EnemyUnit): void {
  for (const move of enemy.moves) {
    if (!LEGACY_RANGED_BOW_IDS.has(move.id)) continue;
    move.engagement = 'ranged';
    move.element ??= 'pierce';
  }
}

function attackEngagement(move: Move): EngagementBand | null {
  if (move.kind !== 'attack') return null;
  return engagementForMove(move, !!mysticRuleForMove(move));
}

/**
 * A rear missile troop may carry an authored melee sidearm without becoming a frontliner.
 * Once physically forced into the front rank, switch its future intent deck to those
 * existing melee attacks. This never invents a weapon: pure archers keep shooting under
 * the normal -2 close-pressure penalty, and real spellcasters keep their magic plan.
 */
function switchPromotedMissileTroopToSidearm(enemy: EnemyUnit): void {
  const attackBands = enemy.moves
    .map((move) => ({ move, engagement: attackEngagement(move) }))
    .filter((entry): entry is { move: Move; engagement: EngagementBand } => entry.engagement !== null);
  if (!attackBands.some((entry) => entry.engagement === 'ranged')) return;
  if (attackBands.some((entry) => entry.engagement === 'mystic')) return;
  const meleeFallbacks = attackBands.filter((entry) => entry.engagement === 'melee').map((entry) => entry.move);
  if (meleeFallbacks.length === 0) return;
  enemy.intents = meleeFallbacks.map((move) => ({
    weight: enemy.intents.find((intent) => intent.moveId === move.id)?.weight ?? 1,
    moveId: move.id,
  }));
}

/**
 * M54 enemy formation inference is deliberately conservative:
 * - any real melee attack makes the unit a frontline candidate;
 * - guard-only units also prefer the front;
 * - pure ranged/reach/mystic/support units prefer the rear;
 * - explicit authored formationRow always wins. This lets authored rear skirmishers carry
 *   a sidearm without pretending that dagger is their preferred opening battlefield role.
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
    normalizeEnemyWeaponSemantics(enemy);
    enemy.formationRow = preferredEnemyRow(enemy);
  }
  return collapseEnemyFrontLine(enemies);
}

/**
 * M54 mirrors M49 frontline collapse: once every living enemy frontliner is gone,
 * all surviving rear units are forced into close engagement.
 *
 * Missile troops with an explicitly authored melee sidearm change their future intent
 * deck after promotion. The already telegraphed current shot is not rewritten mid-turn;
 * after that committed volley they draw the sidearm for subsequent actions.
 */
export function collapseEnemyFrontLine(enemies: EnemyUnit[]): { promoted: string[] } {
  const alive = enemies.filter((enemy) => enemy.hp > 0);
  if (alive.length === 0 || alive.some((enemy) => enemy.formationRow !== 'back')) return { promoted: [] };
  const promoted = alive.map((enemy) => enemy.id);
  for (const enemy of alive) {
    enemy.formationRow = 'front';
    switchPromotedMissileTroopToSidearm(enemy);
  }
  return { promoted };
}

export function enemyFormationLabel(enemy: Pick<EnemyUnit, 'formationRow'>): '前排' | '後排' {
  return enemy.formationRow === 'back' ? '後排' : '前排';
}

export function livingEnemyFrontExists(enemies: EnemyUnit[]): boolean {
  return enemies.some((enemy) => enemy.hp > 0 && enemy.formationRow !== 'back');
}

/**
 * M54/M57 enemy-line gate.
 * A protected rear target can be reached only if the attack's delivery can cross the frontline;
 * even then, a direct attack may still be stopped by a solid authored battlefield obstruction.
 * This is intentionally symmetric for mundane and mystical attacks: "magic" alone never means
 * contactless, wall-piercing or overhead.
 */
export function enemyLineGate(
  enemies: EnemyUnit[],
  move: Move,
  target: EnemyUnit,
  terrain?: BattlefieldTerrain,
): EnemyLineGate {
  if (move.kind !== 'attack' || target.hp <= 0) {
    return { allowed: target.hp > 0, reason: target.hp > 0 ? '' : '目標已經倒下。', engagement: null };
  }
  const engagement = engagementForMove(move, !!mysticRuleForMove(move));
  const frontlineAlive = livingEnemyFrontExists(enemies);
  if (target.formationRow !== 'back' || !frontlineAlive) {
    return { allowed: true, reason: '', engagement };
  }

  if (!moveCanBypassFrontline(move)) {
    const delivery = attackDeliveryForMove(move);
    const label = engagement === 'reach'
      ? '長柄武器'
      : engagement === 'mystic' && delivery === 'contact'
        ? '貼身法術／聖技'
        : '近戰武器';
    return {
      allowed: false,
      reason: `${target.name}仍在敵方後排，前線尚未突破；${label}必須先處理仍存活的前排敵人。`,
      engagement,
    };
  }

  const line = lineOfEffectProfile(terrain, target.formationRow, frontlineAlive, move);
  if (line.blocked) return { allowed: false, reason: line.message, engagement };
  return { allowed: true, reason: '', engagement };
}

/** Party attacks that can legally reach the enemy line and any authored solid obstruction. */
export function legalEnemyTargets(
  enemies: EnemyUnit[],
  move: Move,
  terrain?: BattlefieldTerrain,
): EnemyUnit[] {
  const alive = enemies.filter((enemy) => enemy.hp > 0);
  if (move.kind !== 'attack') return alive;
  return alive.filter((enemy) => enemyLineGate(alive, move, enemy, terrain).allowed);
}

/**
 * Enemy targeting uses the same delivery logic in reverse.
 * Contact attacks stay on the player's frontline; direct/overhead attacks may cross the line,
 * after which M57 terrain obstruction is checked per target by the combat engine.
 */
export function enemyCanBypassPartyFront(move: Move): boolean {
  return moveCanBypassFrontline(move);
}
