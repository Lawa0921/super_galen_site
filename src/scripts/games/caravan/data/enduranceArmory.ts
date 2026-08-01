import type { CombatState } from '../combat';
import type { Rng } from '../rng';
import type { SaveData } from '../save';
import { armoryProfile, partyArmoryLoad, type ArmoryProfile } from './armory';
import * as base from './endurance';

export type EnduranceCampChoice = base.EnduranceCampChoice;
export type EndurancePhase = base.EndurancePhase;
export type CampOption = base.CampOption;
export type EnduranceReward = base.EnduranceReward;

export const ARMORY_ENDURANCE_VERSION = 1;

export interface ArmoryEnduranceRun extends base.EnduranceRun {
  armoryVersion: 1;
  armory: Record<string, ArmoryProfile>;
  partyBurden: number;
  partyCapacity: number;
  partyOverload: number;
}

export type EnduranceRun = ArmoryEnduranceRun;

function memberRecord(save: SaveData, id: string) {
  return id === save.protagonist.id
    ? save.protagonist
    : save.companions.find((member) => member.id === id);
}

function validArmoryProfile(value: unknown): value is ArmoryProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<ArmoryProfile>;
  return Number.isFinite(profile.burden) && profile.burden! >= 0
    && Number.isFinite(profile.capacity) && profile.capacity! >= 1
    && Number.isFinite(profile.overload) && profile.overload! >= 0
    && Number.isFinite(profile.weaponHitBonus)
    && Number.isFinite(profile.damageAdjustment)
    && Number.isFinite(profile.defenseAdjustment)
    && Number.isFinite(profile.maxHpAdjustment)
    && !!profile.statAdjustments && typeof profile.statAdjustments === 'object'
    && !!profile.mysticCapacity && typeof profile.mysticCapacity === 'object'
    && Array.isArray(profile.warnings);
}

export function isEnduranceRun(value: unknown): value is ArmoryEnduranceRun {
  if (!base.isEnduranceRun(value) || !value || typeof value !== 'object') return false;
  const run = value as Partial<ArmoryEnduranceRun>;
  if (run.armoryVersion !== ARMORY_ENDURANCE_VERSION
    || !run.armory || typeof run.armory !== 'object'
    || !Number.isFinite(run.partyBurden) || run.partyBurden! < 0
    || !Number.isFinite(run.partyCapacity) || run.partyCapacity! < 1
    || !Number.isFinite(run.partyOverload) || run.partyOverload! < 0) return false;
  const memberIds = Object.keys(run.members ?? {});
  return memberIds.length >= 3
    && memberIds.every((id) => validArmoryProfile(run.armory![id]));
}

export function createEnduranceRun(save: SaveData): ArmoryEnduranceRun {
  const run = base.createEnduranceRun(save);
  const memberIds = Object.keys(run.members);
  const load = partyArmoryLoad(save, memberIds);
  const armory: Record<string, ArmoryProfile> = {};
  for (const id of memberIds) {
    const record = memberRecord(save, id);
    if (!record) throw new Error(`朝聖武裝名冊缺少成員「${id}」。`);
    armory[id] = armoryProfile(record);
  }
  return {
    ...run,
    armoryVersion: ARMORY_ENDURANCE_VERSION,
    armory,
    partyBurden: load.burden,
    partyCapacity: load.capacity,
    partyOverload: load.overload,
  };
}

export const enduranceAccess = base.enduranceAccess;
export const enduranceReceiptForMarket = base.enduranceReceiptForMarket;
export const enduranceReward = base.enduranceReward;
export const claimEnduranceReward = base.claimEnduranceReward;

export function beginEnduranceBattle(run: ArmoryEnduranceRun, save: SaveData, rng: Rng): CombatState {
  if (!isEnduranceRun(run)) throw new Error('朝聖武裝快照已失效，請重新整備並開始新試煉。');
  return base.beginEnduranceBattle(run, save, rng);
}

export function checkpointEnduranceBattle(run: ArmoryEnduranceRun, combat: CombatState): void {
  base.checkpointEnduranceBattle(run, combat);
}

export function finishEnduranceBattle(run: ArmoryEnduranceRun, combat: CombatState): void {
  base.finishEnduranceBattle(run, combat);
}

export function enduranceCampOptions(run: ArmoryEnduranceRun, save: SaveData): CampOption[] {
  return base.enduranceCampOptions(run, save).map((option) => {
    if (option.id === 'ration-rest') {
      return {
        ...option,
        description: `${option.description} 重裝者需要卸甲保養，實際恢復會依個人負重下降。`,
      };
    }
    if (option.id === 'arcane-vigil') {
      return {
        ...option,
        description: `${option.description} 鎖甲與超載會降低休息成效。`,
      };
    }
    if (option.id === 'sacred-vigil') {
      return {
        ...option,
        description: `${option.description} 重裝者仍需處理擦傷與護具，治療效率較低。`,
      };
    }
    return {
      ...option,
      description: `${option.description} 並立即承受依個人負重計算的行軍疲勞；超載施法者可能增加秘法灼傷。`,
    };
  });
}

function livingHp(run: ArmoryEnduranceRun): number {
  return Object.values(run.members).filter((member) => member.hp > 0).length;
}

function reduceCampRecovery(
  run: ArmoryEnduranceRun,
  before: Record<string, number>,
): void {
  for (const [id, state] of Object.entries(run.members)) {
    if (state.hp <= 0 || before[id] <= 0) continue;
    const gained = Math.max(0, state.hp - before[id]);
    const profile = run.armory[id];
    const efficiency = Math.max(0.5, 1 - profile.burden * 0.07 - profile.overload * 0.12);
    state.hp = Math.min(state.maxHp, before[id] + Math.max(1, Math.round(gained * efficiency)));
  }
}

function applyForcedMarchFatigue(run: ArmoryEnduranceRun): void {
  for (const [id, state] of Object.entries(run.members)) {
    if (state.hp <= 0) continue;
    const profile = run.armory[id];
    const ratio = 0.015 + profile.burden * 0.012 + profile.overload * 0.025;
    const fatigue = Math.max(1, Math.ceil(state.maxHp * ratio));
    state.hp = Math.max(0, state.hp - fatigue);
    if (state.hp > 0 && state.mystic?.kind === 'mana' && (profile.burden >= 4 || profile.overload > 0)) {
      state.mystic.strain = Math.min(5, state.mystic.strain + 1);
    }
  }
  if (livingHp(run) === 0) run.phase = 'defeat';
}

export function applyEnduranceCamp(
  run: ArmoryEnduranceRun,
  save: SaveData,
  choice: EnduranceCampChoice,
): void {
  if (!isEnduranceRun(run)) throw new Error('朝聖武裝快照已失效，請重新整備並開始新試煉。');
  const before = Object.fromEntries(Object.entries(run.members).map(([id, state]) => [id, state.hp]));
  base.applyEnduranceCamp(run, save, choice);
  if (choice === 'forced-march') applyForcedMarchFatigue(run);
  else reduceCampRecovery(run, before);
}

export function enduranceRunSummary(run: ArmoryEnduranceRun): string {
  const baseSummary = base.enduranceRunSummary(run);
  const overload = run.partyOverload > 0 ? `｜超載 ${run.partyOverload}` : '';
  return `${baseSummary}｜負重 ${run.partyBurden}/${run.partyCapacity}${overload}`;
}
