import { currentActor, type EnemyUnit, type Move, type PartyActionResult, type PartyMember } from '../combat';
import { statMod } from '../check';
import type { Rng } from '../rng';
import type { SaveData } from '../save';
import {
  claimConvoyDefenseReward,
  convoyPartyAct,
  createConvoyDefenseBattle,
  convoyRewardReceipt,
  type ConvoyDefenseBattle,
  type ConvoyReward,
} from './convoyDefense.m46';

export type MoraleDisposition = 'release' | 'disarm' | 'ransom';

export interface MoraleProfile {
  maxResolve: number;
  leader?: boolean;
}

export interface EnemyMorale {
  max: number;
  current: number;
  defiance: number;
  leader: boolean;
  routed: boolean;
}

export interface MoraleConvoyBattle extends ConvoyDefenseBattle {
  morale: Record<string, EnemyMorale>;
  routedEnemies: Set<string>;
}

export interface CommandAvailability {
  allowed: boolean;
  dc: number;
  reason: string;
}

export interface CommandResult {
  acted: boolean;
  success: boolean;
  roll: number;
  total: number;
  dc: number;
  moraleDamage: number;
  routed: boolean;
  reason?: string;
}

export interface MoraleAftermathReward {
  disposition: MoraleDisposition | null;
  routedCount: number;
  gold: number;
  reputation: number;
  rations: number;
}

export interface MoraleConvoyReward {
  base: ConvoyReward;
  aftermath: MoraleAftermathReward;
}

const MORALE_PROFILES: Record<string, MoraleProfile> = {
  'convoy-reaver-captain': { maxResolve: 8, leader: true },
  'convoy-hook-raider': { maxResolve: 6 },
  'convoy-ash-arsonist': { maxResolve: 5 },
};

const AFTERMATH_PREFIX = 'convoy-morale:aftermath';

/**
 * M47 is opt-in per enemy identity. Unknown foes are deliberately unyielding: undead, beasts,
 * constructs, dragons and future bosses do not accidentally become vulnerable to charisma.
 */
export function moraleProfileForEnemy(enemy: EnemyUnit): MoraleProfile | null {
  return MORALE_PROFILES[enemy.id] ?? null;
}

export function createMoraleConvoyDefenseBattle(
  save: SaveData,
  rng: Rng,
  startingWagonHp?: number,
): MoraleConvoyBattle {
  const base = createConvoyDefenseBattle(save, rng, startingWagonHp);
  const morale: Record<string, EnemyMorale> = {};
  for (const enemy of base.combat.enemies) {
    const profile = moraleProfileForEnemy(enemy);
    if (!profile) continue;
    morale[enemy.id] = {
      max: profile.maxResolve,
      current: profile.maxResolve,
      defiance: 0,
      leader: profile.leader === true,
      routed: false,
    };
  }
  base.combat.log.push({
    kind: 'info',
    text: '這批伏兵不是亡靈。傷亡、破勢與首領倒下會削弱戰意；先讓他們動搖，才可能以喝止迫使棄械。',
  });
  return { ...base, morale, routedEnemies: new Set<string>() };
}

function enemyStunned(enemy: EnemyUnit): boolean {
  return (enemy.statuses ?? []).some((status) => status.kind === 'stun' && status.remaining > 0);
}

function routeEnemy(battle: MoraleConvoyBattle, enemy: EnemyUnit, reason: string): boolean {
  const morale = battle.morale[enemy.id];
  if (!morale || morale.routed || enemy.hp <= 0) return false;
  morale.current = 0;
  morale.routed = true;
  battle.routedEnemies.add(enemy.id);
  enemy.hp = 0;
  battle.combat.log.push({
    kind: 'info',
    text: `${enemy.name}的戰意徹底崩潰，丟下武器退出戰列！${reason}`,
  });
  if (battle.combat.enemies.every((foe) => foe.hp <= 0)) {
    battle.combat.outcome = 'victory';
    battle.combat.log.push({ kind: 'victory', text: '仍活著的伏兵已棄械潰散——護衛隊控制了商路！' });
  }
  return true;
}

function damageResolve(
  battle: MoraleConvoyBattle,
  enemy: EnemyUnit,
  amount: number,
  reason: string,
): void {
  const morale = battle.morale[enemy.id];
  if (!morale || morale.routed || enemy.hp <= 0 || amount <= 0) return;
  const before = morale.current;
  morale.current = Math.max(0, morale.current - amount);
  if (morale.current !== before) {
    battle.combat.log.push({
      kind: 'info',
      text: `${enemy.name}戰意 ${before} → ${morale.current}/${morale.max}：${reason}`,
    });
  }
  if (morale.current <= 0) routeEnemy(battle, enemy, '他們寧願活著回去，也不願替一張斷旗送命。');
}

interface EnemySnapshot {
  hp: number;
  poise?: number;
  stunned: boolean;
}

function snapshots(battle: MoraleConvoyBattle): Record<string, EnemySnapshot> {
  return Object.fromEntries(battle.combat.enemies.map((enemy) => [enemy.id, {
    hp: enemy.hp,
    poise: enemy.poise,
    stunned: enemyStunned(enemy),
  }]));
}

/**
 * Translate visible battlefield events into morale pressure after a normal player action.
 * The event is observed after M46 has settled any round boundary, so a last-moment rout does not
 * retroactively erase breakthrough damage that already landed on the wagon that round.
 */
export function applyMoraleFromBattlefield(
  battle: MoraleConvoyBattle,
  before: Record<string, EnemySnapshot>,
): void {
  const newlyDown = battle.combat.enemies.filter((enemy) => (before[enemy.id]?.hp ?? 0) > 0 && enemy.hp <= 0 && !battle.morale[enemy.id]?.routed);
  for (const fallen of newlyDown) {
    const profile = battle.morale[fallen.id];
    const shock = profile?.leader ? 4 : 2;
    for (const witness of battle.combat.enemies.filter((enemy) => enemy.hp > 0 && battle.morale[enemy.id])) {
      damageResolve(
        battle,
        witness,
        shock,
        profile?.leader ? '領頭者倒下，斷旗底下再沒有人能保證他們活著撤走。' : '同伴倒下，伏擊已經不再像一場輕鬆搶掠。',
      );
    }
  }

  for (const enemy of battle.combat.enemies) {
    const prior = before[enemy.id];
    const morale = battle.morale[enemy.id];
    if (!prior || !morale || morale.routed || enemy.hp <= 0) continue;
    if (prior.hp > enemy.maxHp * 0.5 && enemy.hp <= enemy.maxHp * 0.5) {
      damageResolve(battle, enemy, 1, '傷勢過半，求財的念頭開始讓位給求生。');
    }
    const nowStunned = enemyStunned(enemy);
    if (!prior.stunned && nowStunned) {
      damageResolve(battle, enemy, 1, '陣腳被打散，連下一步該往哪裡站都失去把握。');
    }
  }
}

export function moraleConvoyPartyAct(
  rng: Rng,
  battle: MoraleConvoyBattle,
  actorId: string,
  moveId: string,
  targetId: string,
  options: { overcast?: boolean } = {},
): PartyActionResult {
  const before = snapshots(battle);
  const result = convoyPartyAct(rng, battle, actorId, moveId, targetId, options);
  if (result.acted) applyMoraleFromBattlefield(battle, before);
  return result;
}

function shaken(battle: MoraleConvoyBattle, target: EnemyUnit): boolean {
  const morale = battle.morale[target.id];
  if (!morale) return false;
  return morale.current < morale.max || target.hp <= target.maxHp * 0.5 || enemyStunned(target);
}

export function commandAvailability(
  battle: MoraleConvoyBattle,
  actor: PartyMember,
  target: EnemyUnit,
): CommandAvailability {
  const morale = battle.morale[target.id];
  if (!morale || morale.routed) return { allowed: false, dc: 0, reason: '這個敵人不接受戰場喝止。' };
  if (target.hp <= 0 || battle.combat.outcome !== 'ongoing') return { allowed: false, dc: 0, reason: '現在沒有可迫降的目標。' };
  if (!shaken(battle, target)) {
    return { allowed: false, dc: 0, reason: '敵軍戰意尚未動搖；先造成傷亡、重傷、暈眩或破勢。' };
  }
  const leaderPenalty = morale.leader ? 2 : 0;
  const dc = 9 + Math.ceil(morale.current / 2) + leaderPenalty + morale.defiance * 2;
  return { allowed: true, dc, reason: `喝止 DC ${dc}；失敗會讓對方更難再次威嚇。` };
}

export function commandMorale(
  rng: Rng,
  battle: MoraleConvoyBattle,
  actorId: string,
  targetId: string,
): CommandResult {
  const actorTurn = currentActor(battle.combat);
  const actor = battle.combat.party.find((member) => member.id === actorId);
  const target = battle.combat.enemies.find((enemy) => enemy.id === targetId);
  if (!actor || !target || actorTurn?.side !== 'party' || actorTurn.id !== actor.id || battle.combat.outcome !== 'ongoing') {
    return { acted: false, success: false, roll: 0, total: 0, dc: 0, moraleDamage: 0, routed: false, reason: '現在不是這名成員喝止敵軍的時機。' };
  }
  const availability = commandAvailability(battle, actor, target);
  if (!availability.allowed) {
    return { acted: false, success: false, roll: 0, total: 0, dc: availability.dc, moraleDamage: 0, routed: false, reason: availability.reason };
  }

  const commandMove: Move = {
    id: `morale-command:${actor.id}`,
    name: '戰場喝止',
    kind: 'support',
    target: 'self',
    hitStat: 'cha',
    narration: '{actor}踏前一步喝令伏兵棄械，讓每個人都聽見繼續送命與活著離開之間的差別。',
  };
  actor.moves.push(commandMove);
  const result = convoyPartyAct(rng, battle, actor.id, commandMove.id, actor.id);
  actor.moves = actor.moves.filter((move) => move.id !== commandMove.id);
  if (!result.acted || result.reason || battle.combat.outcome !== 'ongoing') {
    return {
      acted: result.acted,
      success: false,
      roll: 0,
      total: 0,
      dc: availability.dc,
      moraleDamage: 0,
      routed: false,
      reason: result.reason ?? (battle.combat.outcome !== 'ongoing' ? '護運目標已在喝止前完成。' : '喝止沒有完成。'),
    };
  }

  const roll = rng.d20();
  const presence = statMod(actor.stats.cha) + (actor.formationRow === 'back' ? 0 : 1);
  const total = roll + presence;
  const success = roll === 20 || (roll !== 1 && total >= availability.dc);
  if (!success) {
    battle.morale[target.id].defiance = Math.min(3, battle.morale[target.id].defiance + 1);
    battle.combat.log.push({
      kind: 'info',
      text: `${actor.name}喝令${target.name}棄械，但對方咬牙撐住（${roll}+${presence}=${total}，DC ${availability.dc}）。下一次喝止會更難。`,
    });
    return { acted: true, success: false, roll, total, dc: availability.dc, moraleDamage: 0, routed: false };
  }

  const moraleDamage = Math.min(6, 2 + Math.max(0, statMod(actor.stats.cha)) + (actor.formationRow === 'back' ? 0 : 1));
  const beforeMorale = battle.morale[target.id].current;
  damageResolve(battle, target, moraleDamage, `${actor.name}抓住了他們真正害怕的不是失去戰利品，而是死在裂旗關。`);
  const routed = battle.morale[target.id].routed;
  battle.combat.log.push({
    kind: 'info',
    text: `${actor.name}的喝止奏效（${roll}+${presence}=${total}，DC ${availability.dc}），削去 ${Math.min(moraleDamage, beforeMorale)} 點戰意。`,
  });
  return { acted: true, success: true, roll, total, dc: availability.dc, moraleDamage, routed };
}

export function routedEnemies(battle: MoraleConvoyBattle): EnemyUnit[] {
  return battle.combat.enemies.filter((enemy) => battle.routedEnemies.has(enemy.id));
}

export function moraleAftermathReceipt(marketSeed: number): string {
  return `${AFTERMATH_PREFIX}:${marketSeed}`;
}

export function aftermathPreview(
  save: SaveData,
  battle: MoraleConvoyBattle,
  disposition: MoraleDisposition,
): MoraleAftermathReward {
  const count = battle.routedEnemies.size;
  if (count <= 0) return { disposition: null, routedCount: 0, gold: 0, reputation: 0, rations: 0 };
  if (disposition === 'release') return { disposition, routedCount: count, gold: 0, reputation: 1, rations: 0 };
  if (disposition === 'disarm') return { disposition, routedCount: count, gold: count * 3, reputation: 0, rations: 0 };
  const available = save.inventory['dried-rations'] ?? 0;
  return { disposition, routedCount: count, gold: count * 8, reputation: 0, rations: available > 0 ? -1 : 0 };
}

/**
 * One atomic settlement entry point for the M47 page. Base convoy reward and post-rout treatment
 * are validated before any mutation so a missing ration or duplicate receipt cannot mint partial rewards.
 */
export function claimMoraleConvoyReward(
  save: SaveData,
  battle: MoraleConvoyBattle,
  disposition?: MoraleDisposition,
): MoraleConvoyReward {
  if (battle.combat.outcome !== 'victory' || battle.wagon.hp <= 0) {
    throw new Error('護運尚未成功，不能處理伏兵或領取報酬。');
  }
  if (save.flags[convoyRewardReceipt(save.marketSeed)] === true) throw new Error('本市場週期的護運報酬已領取。');
  const routedCount = battle.routedEnemies.size;
  const aftermathReceipt = moraleAftermathReceipt(save.marketSeed);
  if (save.flags[aftermathReceipt] === true) throw new Error('本市場週期的伏兵處置已完成。');
  if (routedCount > 0 && !disposition) throw new Error('仍有棄械伏兵，必須先決定如何處置。');
  if (disposition === 'ransom' && (save.inventory['dried-rations'] ?? 0) <= 0) {
    throw new Error('押送俘虜至少需要乾糧 1；不能讓俘虜在路上餓死。');
  }

  const aftermath = routedCount > 0
    ? aftermathPreview(save, battle, disposition!)
    : { disposition: null, routedCount: 0, gold: 0, reputation: 0, rations: 0 } satisfies MoraleAftermathReward;
  const base = claimConvoyDefenseReward(save, battle);
  if (aftermath.gold > 0) save.gold += aftermath.gold;
  if (aftermath.reputation > 0) save.reputation += aftermath.reputation;
  if (aftermath.rations < 0) {
    save.inventory['dried-rations'] = (save.inventory['dried-rations'] ?? 0) + aftermath.rations;
    if (save.inventory['dried-rations'] <= 0) delete save.inventory['dried-rations'];
  }
  save.flags[aftermathReceipt] = true;
  return { base, aftermath };
}
