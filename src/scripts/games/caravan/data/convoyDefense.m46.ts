import {
  advanceTurn,
  currentActor,
  partyAct,
  startCombat,
  type CombatState,
  type EnemyUnit,
  type Move,
  type PartyActionResult,
  type PartyMember,
} from '../combat';
import { statMod } from '../check';
import type { Rng } from '../rng';
import type { CompanionRecord, SaveData } from '../save';
import { armorProtectionForDiscipline } from './armorProfiles.m48';
import { memberFromRecord } from './jobs';
import { ritualEnemyAct } from './rituals.m45';

export const CONVOY_DEFENSE_MIN_REPUTATION = 12;
export const CONVOY_DEFENSE_HOLD_ROUNDS = 4;
export const CONVOY_WAGON_MAX_HP = 30;
export const CONVOY_DEFENSE_RECEIPT_PREFIX = 'contract:split-banner-convoy';

const ATTEMPT_PREFIX = 'convoy-defense:attempt';
const ABANDON_PREFIX = 'convoy-defense:abandon';
const THREAT: Record<string, number> = {
  'convoy-reaver-captain': 3,
  'convoy-hook-raider': 3,
  'convoy-ash-arsonist': 4,
};

export interface ConvoyDefenseAccess {
  allowed: boolean;
  reason: string;
  partySize: number;
}

export interface ConvoyAttemptResult {
  abandonmentCount: number;
  startingWagonHp: number;
  penalty: string | null;
}

export interface ConvoyDefenseBattle {
  combat: CombatState;
  wagon: { name: string; maxHp: number; hp: number };
  holdRounds: number;
  completedRounds: number;
  protection: number;
  suppressedEnemies: Set<string>;
  lastPressure: { raw: number; blocked: number; damage: number } | null;
}

export interface ConvoyBraceResult {
  acted: boolean;
  addedProtection: number;
  reason?: string;
}

export interface ConvoyReward {
  gold: number;
  reputation: number;
  pristineBonus: boolean;
}

function defaultRow(record: CompanionRecord): 'front' | 'back' {
  return record.job === 'swordsman' || record.job === 'cleric' ? 'front' : 'back';
}

/**
 * M46 uses the same current expedition plan as ordinary adventure combat. Wounded companions
 * are excluded and the captain is always present; this keeps objective fights about party
 * construction rather than a separate challenge roster.
 */
export function buildConvoyParty(save: SaveData): PartyMember[] {
  const healthy = save.companions.filter((member) => member.injuredForTrips <= 0);
  const healthyById = new Map(healthy.map((member) => [member.id, member]));
  const planned = (save.expeditionPlan?.activeIds ?? [])
    .filter((id) => id !== save.protagonist.id)
    .map((id) => healthyById.get(id))
    .filter((member): member is CompanionRecord => !!member);
  const selected = new Map<string, CompanionRecord>();
  for (const member of [...planned, ...healthy]) {
    if (selected.size >= 3) break;
    selected.set(member.id, member);
  }
  return [save.protagonist, ...selected.values()].map((record) => {
    const member = memberFromRecord(record);
    member.formationRow = save.expeditionPlan?.positions[record.id] ?? defaultRow(record);
    return member;
  });
}

export function convoyRewardReceipt(marketSeed: number): string {
  return `${CONVOY_DEFENSE_RECEIPT_PREFIX}:${marketSeed}`;
}

function attemptReceipt(marketSeed: number): string {
  return `${ATTEMPT_PREFIX}:${marketSeed}`;
}

function abandonmentPrefix(marketSeed: number): string {
  return `${ABANDON_PREFIX}:${marketSeed}:`;
}

export function convoyAttemptActive(save: SaveData): boolean {
  return save.flags[attemptReceipt(save.marketSeed)] === true;
}

export function convoyAbandonmentCount(save: SaveData): number {
  const prefix = abandonmentPrefix(save.marketSeed);
  return Object.keys(save.flags).filter((key) => key.startsWith(prefix) && save.flags[key] === true).length;
}

export function convoyDefenseAccess(save: SaveData): ConvoyDefenseAccess {
  const party = buildConvoyParty(save);
  if (save.protagonist.injuredForTrips > 0) {
    return { allowed: false, reason: '隊長仍在養傷，無法接受護運急件。', partySize: party.length };
  }
  if (save.reputation < CONVOY_DEFENSE_MIN_REPUTATION) {
    return {
      allowed: false,
      reason: `裂旗商路護運需要聲望 ${CONVOY_DEFENSE_MIN_REPUTATION}；行會不會把黑蠟急件交給尚未證明自己的隊伍。`,
      partySize: party.length,
    };
  }
  if (party.length < 2) {
    return { allowed: false, reason: '至少需要兩名健康出征成員才能護住馬車。', partySize: party.length };
  }
  if (save.flags[convoyRewardReceipt(save.marketSeed)] === true) {
    return {
      allowed: false,
      reason: '本市場週期的裂旗商路護運已完成；完成一般遠征、等待新一輪行情後才會有下一張急件。',
      partySize: party.length,
    };
  }
  return { allowed: true, reason: '黑蠟護運急件已可接受。', partySize: party.length };
}

/**
 * Refresh, closing the page, retreating, or losing cannot be a free reroll. The attempt receipt
 * is deliberately cleared only after a paid victory. Re-entering any unresolved contract consumes
 * a ration (or emergency gold) and the wagon begins increasingly damaged.
 */
export function beginConvoyAttempt(save: SaveData): ConvoyAttemptResult {
  const access = convoyDefenseAccess(save);
  if (!access.allowed) throw new Error(access.reason);
  const attempt = attemptReceipt(save.marketSeed);
  let penalty: string | null = null;
  if (save.flags[attempt] === true) {
    const next = convoyAbandonmentCount(save) + 1;
    save.flags[`${abandonmentPrefix(save.marketSeed)}${next}`] = true;
    if ((save.inventory['dried-rations'] ?? 0) > 0) {
      save.inventory['dried-rations'] -= 1;
      if (save.inventory['dried-rations'] <= 0) delete save.inventory['dried-rations'];
      penalty = '上一趟護運沒有完成：重新整隊消耗乾糧 1，馬車也留下額外損傷。';
    } else {
      const paid = Math.min(8, save.gold);
      save.gold -= paid;
      penalty = `上一趟護運沒有完成：沒有乾糧，只能支付 ${paid} G 緊急整備，馬車也留下額外損傷。`;
    }
  }
  save.flags[attempt] = true;
  const count = convoyAbandonmentCount(save);
  return {
    abandonmentCount: count,
    startingWagonHp: Math.max(12, CONVOY_WAGON_MAX_HP - count * 4),
    penalty,
  };
}

export function finishConvoyAttempt(save: SaveData): void {
  delete save.flags[attemptReceipt(save.marketSeed)];
}

const reaverSlash: Move = {
  id: 'convoy-reaver-slash', name: '斷旗馬刀', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
  damage: { dice: 1, sides: 8, bonusStat: 'str' },
  narration: '{actor}踏過碎石揮下斷旗馬刀，斬中{target}，造成 {amount} 點傷害！',
};
const reaverBrace: Move = {
  id: 'convoy-reaver-brace', name: '殘盾壓陣', kind: 'guard', target: 'self', hitStat: 'con',
  narration: '{actor}把殘盾頂在肩前，逼近商隊的防線。',
};
const hookStrike: Move = {
  id: 'convoy-hook-strike', name: '鉤索斧', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'blunt',
  damage: { dice: 1, sides: 6, bonusStat: 'dex' },
  narration: '{actor}甩出鉤索拖亂陣腳，再以短斧砸向{target}，造成 {amount} 點傷害！',
};
const ashBolt: Move = {
  id: 'convoy-ash-bolt', name: '灰火箭', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 1, sides: 7, bonusStat: 'int' },
  narration: '{actor}捻碎焦黑符紙，灰火箭穿過車陣擊中{target}，造成 {amount} 點傷害！',
};

function reaverCaptain(): EnemyUnit {
  return {
    id: 'convoy-reaver-captain', name: '斷旗劫騎・領頭者',
    stats: { str: 15, dex: 12, int: 8, cha: 12, con: 15 }, maxHp: 32, hp: 32, defense: 14,
    weaknesses: ['blunt', 'holy'], resists: ['slash'], maxPoise: 3,
    armorProtection: armorProtectionForDiscipline('mail'),
    moves: [reaverSlash, reaverBrace],
    intents: [{ weight: 3, moveId: reaverSlash.id }, { weight: 1, moveId: reaverBrace.id }],
    enrage: { threshold: 0.4, potency: 2 },
  };
}

function hookRaider(): EnemyUnit {
  return {
    id: 'convoy-hook-raider', name: '鉤索掠手',
    stats: { str: 11, dex: 15, int: 8, cha: 8, con: 11 }, maxHp: 24, hp: 24, defense: 13,
    weaknesses: ['frost', 'slash'], resists: ['pierce'], maxPoise: 2,
    armorProtection: armorProtectionForDiscipline('light'),
    moves: [hookStrike], intents: [{ weight: 1, moveId: hookStrike.id }],
  };
}

function ashArsonist(): EnemyUnit {
  return {
    id: 'convoy-ash-arsonist', name: '灰火縱咒師',
    stats: { str: 7, dex: 11, int: 16, cha: 12, con: 10 }, maxHp: 24, hp: 24, defense: 12,
    weaknesses: ['frost', 'pierce'], resists: ['fire'], maxPoise: 2,
    armorProtection: armorProtectionForDiscipline('robe'),
    moves: [ashBolt], intents: [{ weight: 1, moveId: ashBolt.id }],
  };
}

export function createConvoyDefenseEncounter(): EnemyUnit[] {
  return [reaverCaptain(), hookRaider(), ashArsonist()];
}

export function createConvoyDefenseBattle(
  save: SaveData,
  rng: Rng,
  startingWagonHp = CONVOY_WAGON_MAX_HP,
): ConvoyDefenseBattle {
  const combat = startCombat(rng, buildConvoyParty(save), createConvoyDefenseEncounter());
  combat.log.push({
    kind: 'info',
    text: `護運目標：讓「白蠟貨車」撐過 ${CONVOY_DEFENSE_HOLD_ROUNDS} 輪，或提前擊潰全部伏兵。敵人存活越多，每輪突破壓力越高。`,
  });
  return {
    combat,
    wagon: { name: '白蠟貨車', maxHp: CONVOY_WAGON_MAX_HP, hp: Math.max(1, Math.min(CONVOY_WAGON_MAX_HP, startingWagonHp)) },
    holdRounds: CONVOY_DEFENSE_HOLD_ROUNDS,
    completedRounds: 0,
    protection: 0,
    suppressedEnemies: new Set<string>(),
    lastPressure: null,
  };
}

export function convoyThreatForEnemy(enemy: EnemyUnit): number {
  return THREAT[enemy.id] ?? 1;
}

function stunned(enemy: EnemyUnit): boolean {
  return (enemy.statuses ?? []).some((status) => status.kind === 'stun' && status.remaining > 0);
}

export function projectedConvoyPressure(battle: ConvoyDefenseBattle): number {
  return battle.combat.enemies
    .filter((enemy) => enemy.hp > 0 && !stunned(enemy) && !battle.suppressedEnemies.has(enemy.id))
    .reduce((sum, enemy) => sum + convoyThreatForEnemy(enemy), 0);
}

export function convoyBraceValue(actor: PartyMember): number {
  const frontBonus = actor.formationRow === 'back' ? 0 : 1;
  return Math.max(3, Math.min(7, 4 + Math.max(0, statMod(actor.stats.con)) + frontBonus));
}

function settleRoundPressure(battle: ConvoyDefenseBattle, completedRound: number): void {
  if (battle.combat.outcome !== 'ongoing') return;
  const raw = projectedConvoyPressure(battle);
  const blocked = Math.min(raw, battle.protection);
  const damage = Math.max(0, raw - blocked);
  battle.wagon.hp = Math.max(0, battle.wagon.hp - damage);
  battle.completedRounds = Math.max(battle.completedRounds, completedRound);
  battle.lastPressure = { raw, blocked, damage };
  battle.combat.log.push({
    kind: damage > 0 ? 'damage' : 'info',
    text: `第 ${completedRound} 輪護運結算：伏兵突破壓力 ${raw}，護車抵消 ${blocked}，${battle.wagon.name}損失 ${damage} 點耐久（${battle.wagon.hp}/${battle.wagon.maxHp}）。`,
  });
  battle.protection = 0;
  battle.suppressedEnemies.clear();
  if (battle.wagon.hp <= 0) {
    battle.combat.outcome = 'defeat';
    battle.combat.log.push({ kind: 'defeat', text: '馬車被拆毀，黑蠟護運失敗。' });
    return;
  }
  if (completedRound >= battle.holdRounds) {
    battle.combat.outcome = 'victory';
    battle.combat.log.push({
      kind: 'victory',
      text: '車夫終於拉開裂旗關的鎖鏈——貨車穿過隘口。即使伏兵仍在，護運也已完成！',
    });
  }
}

function settleIfRoundAdvanced(battle: ConvoyDefenseBattle, beforeRound: number): void {
  if (battle.combat.outcome !== 'ongoing') return;
  if (battle.combat.round > beforeRound) settleRoundPressure(battle, beforeRound);
}

export function convoyPartyAct(
  rng: Rng,
  battle: ConvoyDefenseBattle,
  actorId: string,
  moveId: string,
  targetId: string,
  options: { overcast?: boolean } = {},
): PartyActionResult {
  const beforeRound = battle.combat.round;
  const result = partyAct(rng, battle.combat, actorId, moveId, targetId, options);
  if (result.acted) settleIfRoundAdvanced(battle, beforeRound);
  return result;
}

/**
 * Any living member can spend their current turn physically protecting the wagon. This is a
 * real tempo cost: it uses the ordinary turn engine, respects stun, and caps stacked protection
 * so four characters cannot make the objective permanently invulnerable.
 */
export function braceConvoy(rng: Rng, battle: ConvoyDefenseBattle, actorId: string): ConvoyBraceResult {
  const actorTurn = currentActor(battle.combat);
  const actor = battle.combat.party.find((member) => member.id === actorId);
  if (!actor || actorTurn?.side !== 'party' || actorTurn.id !== actorId || battle.combat.outcome !== 'ongoing') {
    return { acted: false, addedProtection: 0, reason: '現在不是這名成員的護車行動時機。' };
  }
  const braceMove: Move = {
    id: `convoy-brace:${actor.id}`,
    name: '護住馬車', kind: 'support', target: 'self', hitStat: 'con',
    narration: '{actor}離開殺線，把肩膀、盾牌與車架一起頂進缺口，替馬車爭取通過隘口的時間。',
  };
  actor.moves.push(braceMove);
  const beforeRound = battle.combat.round;
  const result = partyAct(rng, battle.combat, actor.id, braceMove.id, actor.id);
  actor.moves = actor.moves.filter((move) => move.id !== braceMove.id);
  if (!result.acted || result.reason) {
    if (result.acted) settleIfRoundAdvanced(battle, beforeRound);
    return { acted: result.acted, addedProtection: 0, reason: result.reason };
  }
  const before = battle.protection;
  battle.protection = Math.min(10, battle.protection + convoyBraceValue(actor));
  const added = battle.protection - before;
  battle.combat.log.push({
    kind: 'info',
    text: `${actor.name}本輪替馬車建立 ${added} 點護車值（目前 ${battle.protection}/10）。`,
  });
  settleIfRoundAdvanced(battle, beforeRound);
  return { acted: true, addedProtection: added };
}

export function convoyEnemyAct(rng: Rng, battle: ConvoyDefenseBattle, enemyId: string): void {
  if (battle.combat.outcome !== 'ongoing') return;
  const enemy = battle.combat.enemies.find((candidate) => candidate.id === enemyId);
  if (!enemy) return;
  const wasStunned = stunned(enemy);
  const beforeRound = battle.combat.round;
  ritualEnemyAct(rng, battle.combat, enemyId);
  if (wasStunned) battle.suppressedEnemies.add(enemyId);
  settleIfRoundAdvanced(battle, beforeRound);
}

/** Test utility: advance a harmless turn while preserving the same round-pressure rules. */
export function convoyAdvanceTurnForTest(battle: ConvoyDefenseBattle): void {
  const beforeRound = battle.combat.round;
  advanceTurn(battle.combat);
  settleIfRoundAdvanced(battle, beforeRound);
}

export function applyConvoyBattleInjuries(save: SaveData, combat: CombatState): string[] {
  const injured: string[] = [];
  for (const member of combat.party) {
    if (member.hp > 0) continue;
    const record = member.id === save.protagonist.id
      ? save.protagonist
      : save.companions.find((candidate) => candidate.id === member.id);
    if (!record) continue;
    const trips = member.id === save.protagonist.id ? 1 : 2;
    record.injuredForTrips = Math.max(record.injuredForTrips, trips);
    injured.push(record.id);
  }
  return injured;
}

/**
 * Settlement is enforced in the data layer, not only by the battle page. A destroyed wagon,
 * retreat, defeat, or a still-running battle can never mint the contract reward.
 */
export function claimConvoyDefenseReward(save: SaveData, battle: ConvoyDefenseBattle): ConvoyReward {
  if (battle.combat.outcome !== 'victory' || battle.wagon.hp <= 0) {
    throw new Error('護運尚未成功，不能領取黑蠟急件報酬。');
  }
  const receipt = convoyRewardReceipt(save.marketSeed);
  if (save.flags[receipt] === true) throw new Error('本市場週期的護運報酬已領取。');
  const pristineBonus = battle.wagon.hp >= Math.ceil(CONVOY_WAGON_MAX_HP * 0.7);
  const reward: ConvoyReward = { gold: 42 + (pristineBonus ? 10 : 0), reputation: 2, pristineBonus };
  save.gold += reward.gold;
  save.reputation += reward.reputation;
  save.flags[receipt] = true;
  finishConvoyAttempt(save);
  return reward;
}
