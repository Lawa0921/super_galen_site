import type { CombatState, MysticPower, PartyMember } from '../combat';
import { startCombat } from '../combat';
import type { Rng } from '../rng';
import type { SaveData } from '../save';
import { buildReliquaryParty, createReliquaryEncounter } from './ashenReliquaryCombat';
import type { ReliquaryBattleStage } from './ashenReliquaryCombat';

export const ENDURANCE_RUN_VERSION = 1;
export const ENDURANCE_MIN_REPUTATION = 20;
export const ENDURANCE_RECEIPT = 'endurance:ember-pilgrimage:claimed';

export type EndurancePhase = 'battle' | 'camp' | 'victory' | 'defeat';
export type EnduranceCampChoice = 'ration-rest' | 'arcane-vigil' | 'sacred-vigil' | 'forced-march';

export interface EnduranceMemberState {
  hp: number;
  maxHp: number;
  mystic?: MysticPower;
}

export interface EnduranceRun {
  version: 1;
  saveCreatedAt: number;
  stage: ReliquaryBattleStage;
  phase: EndurancePhase;
  members: Record<string, EnduranceMemberState>;
  forcedMarches: number;
  camps: EnduranceCampChoice[];
  battleOpen: boolean;
  abandonmentCount: number;
  claimed: boolean;
}

export interface EnduranceAccess {
  allowed: boolean;
  reason: string;
  partySize: number;
}

export interface CampOption {
  id: EnduranceCampChoice;
  name: string;
  description: string;
  eligible: boolean;
  blocker: string | null;
}

export interface EnduranceReward {
  gold: number;
  reputation: number;
  inventory: Record<string, number>;
}

function cloneMystic(power: MysticPower | undefined): MysticPower | undefined {
  return power ? { ...power } : undefined;
}

function healthyParty(save: SaveData): PartyMember[] {
  return buildReliquaryParty(save);
}

export function enduranceAccess(save: SaveData): EnduranceAccess {
  const party = healthyParty(save);
  if (save.reputation < ENDURANCE_MIN_REPUTATION) {
    return {
      allowed: false,
      reason: `餘燼朝聖需要聲望 ${ENDURANCE_MIN_REPUTATION}。`,
      partySize: party.length,
    };
  }
  if (party.length < 3) {
    return {
      allowed: false,
      reason: '至少需要三名健康出征成員。',
      partySize: party.length,
    };
  }
  return { allowed: true, reason: '遠征隊已可接受餘燼朝聖。', partySize: party.length };
}

function initialMemberState(member: PartyMember): EnduranceMemberState {
  return {
    hp: member.maxHp,
    maxHp: member.maxHp,
    mystic: cloneMystic(member.mystic),
  };
}

/** M42 不提供舊格式遷移；格式不符時直接要求開始新試煉。 */
export function isEnduranceRun(value: unknown): value is EnduranceRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as Partial<EnduranceRun>;
  return run.version === ENDURANCE_RUN_VERSION
    && Number.isInteger(run.saveCreatedAt)
    && (run.stage === 1 || run.stage === 2 || run.stage === 3)
    && (run.phase === 'battle' || run.phase === 'camp' || run.phase === 'victory' || run.phase === 'defeat')
    && !!run.members && typeof run.members === 'object'
    && Number.isInteger(run.forcedMarches)
    && Array.isArray(run.camps)
    && typeof run.battleOpen === 'boolean'
    && Number.isInteger(run.abandonmentCount)
    && typeof run.claimed === 'boolean';
}

export function createEnduranceRun(save: SaveData): EnduranceRun {
  const access = enduranceAccess(save);
  if (!access.allowed) throw new Error(access.reason);
  const members = Object.fromEntries(healthyParty(save).map((member) => [member.id, initialMemberState(member)]));
  return {
    version: ENDURANCE_RUN_VERSION,
    saveCreatedAt: save.createdAt,
    stage: 1,
    phase: 'battle',
    members,
    forcedMarches: 0,
    camps: [],
    battleOpen: false,
    abandonmentCount: 0,
    claimed: false,
  };
}

function memberAverageHp(run: EnduranceRun): number {
  const states = Object.values(run.members);
  if (states.length === 0) return 0;
  return states.reduce((sum, state) => sum + state.hp / Math.max(1, state.maxHp), 0) / states.length;
}

function applyRunState(run: EnduranceRun, party: PartyMember[]): void {
  for (const member of party) {
    const stored = run.members[member.id];
    if (!stored) continue;
    member.hp = Math.max(1, Math.min(member.maxHp, stored.hp));
    if (member.mystic && stored.mystic && member.mystic.kind === stored.mystic.kind) {
      member.mystic.current = Math.max(0, Math.min(member.mystic.max, stored.mystic.current));
      member.mystic.strain = Math.max(0, Math.min(5, stored.mystic.strain));
    }
  }
}

function scaleThreat(run: EnduranceRun, combat: CombatState): void {
  if (run.forcedMarches <= 0) return;
  for (const enemy of combat.enemies) {
    const multiplier = 1 + run.forcedMarches * 0.12;
    enemy.maxHp = Math.max(1, Math.round(enemy.maxHp * multiplier));
    enemy.hp = enemy.maxHp;
    enemy.statuses ??= [];
    enemy.statuses.push({ kind: 'strength', remaining: 99, potency: run.forcedMarches });
  }
  combat.log.push({
    kind: 'info',
    text: `強行軍使遠征隊搶得先機，但第 ${run.stage} 戰的敵人也得到 +${run.forcedMarches} 攻勢與額外生命。`,
  });
}

/**
 * 開戰時若上一場仍標記為進行中，代表重新整理／關頁後重開。
 * 不回溯舊戰鬥，而是直接施加全隊 10% 疲勞與秘法灼傷，防止免費重骰。
 */
export function beginEnduranceBattle(run: EnduranceRun, save: SaveData, rng: Rng): CombatState {
  if (run.saveCreatedAt !== save.createdAt) throw new Error('這份試煉不屬於目前的遊戲存檔。');
  if (run.phase !== 'battle') throw new Error('目前不是戰鬥階段。');
  const party = healthyParty(save).filter((member) => run.members[member.id]);
  if (party.length < 1) throw new Error('遠征隊已沒有可戰鬥成員。');
  const combat = startCombat(rng, party, createReliquaryEncounter(run.stage));
  applyRunState(run, combat.party);
  if (run.battleOpen) {
    run.abandonmentCount += 1;
    for (const member of combat.party) {
      const fatigue = Math.max(1, Math.ceil(member.maxHp * 0.1));
      member.hp = Math.max(1, member.hp - fatigue);
      if (member.mystic?.kind === 'mana') member.mystic.strain = Math.min(5, member.mystic.strain + 1);
    }
    combat.log.push({ kind: 'info', text: '上一次戰鬥被中途放棄：全隊承受 10% 疲勞，法師秘法灼傷 +1。' });
  }
  run.battleOpen = true;
  scaleThreat(run, combat);
  return combat;
}

function captureMembers(run: EnduranceRun, combat: CombatState): void {
  for (const member of combat.party) {
    run.members[member.id] = {
      hp: Math.max(0, member.hp),
      maxHp: member.maxHp,
      mystic: cloneMystic(member.mystic),
    };
  }
}

export function finishEnduranceBattle(run: EnduranceRun, combat: CombatState): void {
  if (run.phase !== 'battle') throw new Error('目前沒有可結算的試煉戰鬥。');
  if (combat.outcome === 'ongoing') throw new Error('戰鬥尚未結束。');
  captureMembers(run, combat);
  run.battleOpen = false;
  if (combat.outcome !== 'victory') {
    run.phase = 'defeat';
    return;
  }
  if (run.stage === 3) {
    run.phase = 'victory';
    return;
  }
  run.stage = (run.stage + 1) as ReliquaryBattleStage;
  run.phase = 'camp';
}

function hasMystic(run: EnduranceRun, kind: MysticPower['kind']): boolean {
  return Object.values(run.members).some((member) => member.mystic?.kind === kind && member.hp > 0);
}

export function enduranceCampOptions(run: EnduranceRun, save: SaveData): CampOption[] {
  if (run.phase !== 'camp') return [];
  return [
    {
      id: 'ration-rest',
      name: '分糧紮營',
      description: '消耗乾糧 1；全隊恢復 35% 生命、秘法 +2、神恩 +1、秘法灼傷 -1。',
      eligible: (save.inventory['dried-rations'] ?? 0) >= 1,
      blocker: (save.inventory['dried-rations'] ?? 0) >= 1 ? null : '缺少乾糧。',
    },
    {
      id: 'arcane-vigil',
      name: '秘法守夜',
      description: '需要法師並消耗藥草 1；秘法回滿，但法師灼傷 +1，全隊只恢復 10% 生命。',
      eligible: hasMystic(run, 'mana') && (save.inventory.herb ?? 0) >= 1,
      blocker: !hasMystic(run, 'mana') ? '隊伍沒有仍可行動的法師。' : (save.inventory.herb ?? 0) < 1 ? '缺少藥草。' : null,
    },
    {
      id: 'sacred-vigil',
      name: '聖禱守夜',
      description: '需要教士並消耗藥草 1；神恩回滿，全隊恢復 22% 生命。',
      eligible: hasMystic(run, 'favor') && (save.inventory.herb ?? 0) >= 1,
      blocker: !hasMystic(run, 'favor') ? '隊伍沒有仍可行動的教士。' : (save.inventory.herb ?? 0) < 1 ? '缺少藥草。' : null,
    },
    {
      id: 'forced-march',
      name: '熄火強行軍',
      description: '不消耗補給也不恢復；最終報酬提高，但所有後續敵人獲得額外生命與攻勢。',
      eligible: true,
      blocker: null,
    },
  ];
}

function healState(state: EnduranceMemberState, ratio: number): void {
  const amount = Math.max(1, Math.round(state.maxHp * ratio));
  state.hp = Math.min(state.maxHp, state.hp + amount);
}

export function applyEnduranceCamp(run: EnduranceRun, save: SaveData, choice: EnduranceCampChoice): void {
  if (run.phase !== 'camp') throw new Error('目前不能進行營地選擇。');
  const option = enduranceCampOptions(run, save).find((entry) => entry.id === choice);
  if (!option) throw new Error(`未知營地選項「${choice}」。`);
  if (!option.eligible) throw new Error(option.blocker ?? '目前不能選擇此營地行動。');

  if (choice === 'ration-rest') {
    save.inventory['dried-rations'] -= 1;
    for (const state of Object.values(run.members)) {
      if (state.hp <= 0) continue;
      healState(state, 0.35);
      if (state.mystic?.kind === 'mana') {
        state.mystic.current = Math.min(state.mystic.max, state.mystic.current + 2);
        state.mystic.strain = Math.max(0, state.mystic.strain - 1);
      } else if (state.mystic?.kind === 'favor') {
        state.mystic.current = Math.min(state.mystic.max, state.mystic.current + 1);
      }
    }
  } else if (choice === 'arcane-vigil') {
    save.inventory.herb -= 1;
    for (const state of Object.values(run.members)) {
      if (state.hp <= 0) continue;
      healState(state, 0.1);
      if (state.mystic?.kind === 'mana') {
        state.mystic.current = state.mystic.max;
        state.mystic.strain = Math.min(5, state.mystic.strain + 1);
      }
    }
  } else if (choice === 'sacred-vigil') {
    save.inventory.herb -= 1;
    for (const state of Object.values(run.members)) {
      if (state.hp <= 0) continue;
      healState(state, 0.22);
      if (state.mystic?.kind === 'favor') state.mystic.current = state.mystic.max;
    }
  } else {
    run.forcedMarches += 1;
  }
  run.camps.push(choice);
  run.phase = 'battle';
}

export function enduranceReward(run: EnduranceRun): EnduranceReward {
  if (run.phase !== 'victory') return { gold: 0, reputation: 0, inventory: {} };
  return {
    gold: 80 + run.forcedMarches * 35,
    reputation: 6 + run.forcedMarches * 2,
    inventory: run.forcedMarches >= 2
      ? { 'war-tonic': 2, ore: 3 }
      : run.forcedMarches === 1
        ? { 'war-tonic': 1, ore: 2 }
        : { herb: 2, bandage: 2 },
  };
}

export function claimEnduranceReward(run: EnduranceRun, save: SaveData): EnduranceReward {
  if (run.phase !== 'victory') throw new Error('尚未完成餘燼朝聖。');
  if (run.claimed || save.flags[ENDURANCE_RECEIPT] === true) throw new Error('餘燼朝聖獎勵已領取。');
  const reward = enduranceReward(run);
  save.gold += reward.gold;
  save.reputation += reward.reputation;
  for (const [itemId, count] of Object.entries(reward.inventory)) {
    save.inventory[itemId] = (save.inventory[itemId] ?? 0) + count;
  }
  save.flags[ENDURANCE_RECEIPT] = true;
  run.claimed = true;
  return reward;
}

export function enduranceRunSummary(run: EnduranceRun): string {
  const hp = Math.round(memberAverageHp(run) * 100);
  return `第 ${run.stage} 戰｜${run.phase}｜平均生命 ${hp}%｜強行軍 ${run.forcedMarches}｜放棄戰鬥 ${run.abandonmentCount}`;
}
