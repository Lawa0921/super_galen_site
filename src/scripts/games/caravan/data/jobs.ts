import type { Move, PartyMember } from '../combat';
import type { CompanionRecord } from '../save';
import type { StatBlock } from '../types';
import {
  unlockedMoves,
  equipmentBonus,
  effectiveStats,
  traitById,
  specById,
  bondTier,
  BOND_HP_PER_TIER,
} from '../roster';
import { ITEMS } from './items';
import { adjustMovesForArmory, armoryProfile, type ArmoryProfile } from './armory';

export type JobId = 'swordsman' | 'ranger' | 'mage' | 'cleric';

export interface JobDef {
  id: JobId;
  name: string;
  baseStats: StatBlock;
  baseMaxHp: number;
  defense: number;
  moves: Move[];
  /** 職業立繪路徑（M5 美術） */
  art?: string;
}

export interface ArmoryPartyMemberRuntime {
  mysticCapacityBonus?: { mana: number; favor: number };
  armoryBurden?: number;
  armoryCapacity?: number;
  armoryOverload?: number;
  armoryWarnings?: string[];
  armoryProfile?: ArmoryProfile;
}

/** M18：每名角色最多攜帶四招，讓升級後的技能選擇形成構築取捨。 */
export const MOVE_LOADOUT_CAP = 4;

/** 通用「揮擊」：所有職業都會的基礎武器攻擊，備用招式 */
const universalStrike: Move = {
  id: 'strike', element: 'blunt', name: '揮擊', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 1, sides: 6, bonusStat: 'str' },
  narration: '{actor}掄起手中武器揮向{target}，造成 {amount} 點傷害！',
};

export const JOBS: Record<JobId, JobDef> = {
  swordsman: {
    art: '/assets/games/caravan/job-swordsman.webp',
    id: 'swordsman', name: '劍士',
    baseStats: { str: 14, dex: 10, int: 8, cha: 10, con: 14 },
    baseMaxHp: 26, defense: 14,
    moves: [
      { id: 'heavy-slash', element: 'slash', name: '重斬', kind: 'attack', target: 'enemy', hitStat: 'str',
        damage: { dice: 1, sides: 10, bonusStat: 'str' },
        narration: '{actor}掄起重劍朝{target}狠狠劈下，造成 {amount} 點傷害！' },
      { id: 'guard', name: '架盾', kind: 'guard', target: 'self', hitStat: 'str',
        narration: '{actor}舉盾穩守，蓄勢以待。' },
      { id: 'whirlwind-slash', element: 'slash', name: '旋風斬', kind: 'attack', target: 'enemy', hitStat: 'str',
        area: true, damage: { dice: 1, sides: 6, bonusStat: 'str' },
        narration: '{actor}轉身畫出一道凌厲弧光，橫掃{target}，造成 {amount} 點傷害！',
        minLevel: 2 },
      { id: 'breaking-combo', element: 'slash', name: '破陣連擊', kind: 'attack', target: 'enemy', hitStat: 'str',
        damage: { dice: 2, sides: 8, bonusStat: 'str' },
        narration: '{actor}連環劈斬撕開{target}的守勢，造成 {amount} 點傷害！',
        minLevel: 3 },
      universalStrike,
    ],
  },
  ranger: {
    art: '/assets/games/caravan/job-ranger.webp',
    id: 'ranger', name: '游俠',
    baseStats: { str: 10, dex: 16, int: 10, cha: 10, con: 10 },
    baseMaxHp: 20, defense: 13,
    moves: [
      { id: 'quick-shot', element: 'pierce', name: '疾射', kind: 'attack', target: 'enemy', hitStat: 'dex',
        damage: { dice: 1, sides: 8, bonusStat: 'dex' },
        narration: '{actor}拉弓疾射，箭矢直取{target}，造成 {amount} 點傷害！' },
      { id: 'aimed-shot', element: 'pierce', name: '瞄準射擊', kind: 'attack', target: 'enemy', hitStat: 'dex',
        hitBonus: 3, damage: { dice: 1, sides: 6, bonusStat: 'dex' },
        narration: '{actor}屏息瞄準，一箭正中{target}要害，造成 {amount} 點傷害！' },
      { id: 'venom-arrow', element: 'pierce', name: '毒箭', kind: 'attack', target: 'enemy', hitStat: 'dex',
        damage: { dice: 1, sides: 6, bonusStat: 'dex' },
        applyStatus: { kind: 'poison', duration: 2, potency: 2 },
        narration: '{actor}射出淬毒之箭，扎進{target}，造成 {amount} 點傷害！',
        minLevel: 2 },
      { id: 'piercing-arrow', element: 'pierce', name: '穿甲箭', kind: 'attack', target: 'enemy', hitStat: 'dex',
        damage: { dice: 1, sides: 10, bonusStat: 'dex' },
        narration: '{actor}換上破甲箭矢，一擊貫穿{target}的護具，造成 {amount} 點傷害！',
        minLevel: 2 },
      { id: 'arrow-storm', element: 'pierce', name: '驟雨連射', kind: 'attack', target: 'enemy', hitStat: 'dex',
        area: true, damage: { dice: 1, sides: 4, bonusStat: 'dex' },
        narration: '{actor}連珠箭雨如驟雨般落向{target}，造成 {amount} 點傷害！',
        minLevel: 3 },
      universalStrike,
    ],
  },
  mage: {
    art: '/assets/games/caravan/job-mage.webp',
    id: 'mage', name: '法師',
    baseStats: { str: 8, dex: 10, int: 16, cha: 10, con: 8 },
    baseMaxHp: 16, defense: 11,
    moves: [
      { id: 'fireball', element: 'fire', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int',
        damage: { dice: 2, sides: 6, bonusStat: 'int' },
        narration: '{actor}擲出灼熱火球，在{target}身邊炸裂，造成 {amount} 點傷害！' },
      { id: 'ice-spike', element: 'frost', name: '冰刺', kind: 'attack', target: 'enemy', hitStat: 'int',
        damage: { dice: 1, sides: 8, bonusStat: 'int' },
        narration: '{actor}召喚寒冰尖刺貫穿{target}，造成 {amount} 點傷害！' },
      { id: 'gravity-crush', element: 'blunt', name: '重力壓', kind: 'attack', target: 'enemy', hitStat: 'int',
        area: true, damage: { dice: 1, sides: 6, bonusStat: 'int' },
        narration: '{actor}扭曲空間化作無形巨力，重重壓向{target}，造成 {amount} 點傷害！',
        minLevel: 2 },
      { id: 'frost-bind', element: 'frost', name: '寒冰束縛', kind: 'attack', target: 'enemy', hitStat: 'int',
        damage: { dice: 1, sides: 4, bonusStat: 'int' },
        applyStatus: { kind: 'stun', duration: 1 },
        narration: '{actor}召出冰晶纏上{target}，造成 {amount} 點傷害並將其凍結！',
        minLevel: 3 },
      { id: 'meteor-fall', element: 'fire', name: '隕石墜', kind: 'attack', target: 'enemy', hitStat: 'int',
        area: true, damage: { dice: 2, sides: 6, bonusStat: 'int' },
        narration: '{actor}召喚熾焰隕石轟然墜落，砸向{target}，造成 {amount} 點傷害！',
        minLevel: 3 },
      universalStrike,
    ],
  },
  cleric: {
    art: '/assets/games/caravan/job-cleric.webp',
    id: 'cleric', name: '教士',
    baseStats: { str: 10, dex: 8, int: 12, cha: 16, con: 12 },
    baseMaxHp: 22, defense: 12,
    moves: [
      { id: 'holy-strike', element: 'holy', name: '聖擊', kind: 'attack', target: 'enemy', hitStat: 'cha',
        damage: { dice: 1, sides: 6, bonusStat: 'cha' },
        narration: '{actor}以聖杖之光擊向{target}，造成 {amount} 點傷害！' },
      { id: 'heal', name: '治癒', kind: 'support', target: 'ally', hitStat: 'cha',
        heal: { dice: 1, sides: 8, bonusStat: 'cha' },
        narration: '{actor}的祝禱化為柔光，為{target}恢復 {amount} 點生命。' },
      { id: 'holy-nova', element: 'holy', name: '聖光爆', kind: 'attack', target: 'enemy', hitStat: 'cha',
        area: true, damage: { dice: 1, sides: 6, bonusStat: 'cha' },
        narration: '{actor}引動聖光轟然爆裂，擊向{target}，造成 {amount} 點傷害！',
        minLevel: 2 },
      { id: 'battle-hymn', name: '戰吟', kind: 'support', target: 'ally', hitStat: 'cha',
        applyStatus: { kind: 'strength', duration: 2, potency: 3 },
        narration: '{actor}高聲吟唱戰歌，{target}的鬥志熊熊燃起！',
        minLevel: 2 },
      { id: 'greater-heal', name: '聖光治癒術', kind: 'support', target: 'ally', hitStat: 'cha',
        heal: { dice: 2, sides: 6, bonusStat: 'cha' },
        narration: '{actor}引來聖潔光輝籠罩{target}，恢復 {amount} 點生命。',
        minLevel: 3 },
      universalStrike,
    ],
  },
};

/** 包含等級解鎖、武器招式與專精招式的完整已知戰技清單。 */
export function availableMovesFromRecord(record: CompanionRecord): Move[] {
  const moves = unlockedMoves(record);
  const weaponId = record.equipment.weapon;
  const weaponMove = weaponId ? ITEMS[weaponId]?.equip?.move : undefined;
  const baseMoves = weaponMove ? [weaponMove, ...moves.slice(1)] : moves;
  const spec = specById(record.specialization);
  return spec
    ? [...baseMoves.slice(0, 2), spec.move, ...baseMoves.slice(2)]
    : baseMoves;
}

function weaponMoveIds(): Set<string> {
  const ids = new Set<string>();
  for (const item of Object.values(ITEMS)) {
    if (item.equip?.slot === 'weapon' && item.equip.move) ids.add(item.equip.move.id);
  }
  return ids;
}

function normalizePreparedMoveIds(record: CompanionRecord): Set<string> {
  const raw = record.preparedMoveIds;
  if (!Array.isArray(raw)) return new Set<string>();
  const requested = new Set(raw.filter((id): id is string => typeof id === 'string'));
  const classWeaponMove = unlockedMoves(record)[0];
  const equippedWeaponId = record.equipment.weapon;
  const equippedWeaponMove = equippedWeaponId ? ITEMS[equippedWeaponId]?.equip?.move : undefined;
  const allWeaponMoveIds = weaponMoveIds();
  const hadWeaponSlot = !!classWeaponMove && (
    requested.has(classWeaponMove.id) ||
    [...requested].some((id) => allWeaponMoveIds.has(id))
  );

  if (hadWeaponSlot) {
    requested.delete(classWeaponMove.id);
    for (const id of allWeaponMoveIds) requested.delete(id);
    const replacement = equippedWeaponMove ?? classWeaponMove;
    if (replacement) requested.add(replacement.id);
  }
  return requested;
}

export function preparedMovesFromRecord(record: CompanionRecord): Move[] {
  const available = availableMovesFromRecord(record);
  if (available.length === 0) return [];
  if (!Array.isArray(record.preparedMoveIds) || record.preparedMoveIds.length === 0) {
    return available.slice(0, MOVE_LOADOUT_CAP);
  }

  const requested = normalizePreparedMoveIds(record);
  const prepared = available
    .filter((move) => requested.has(move.id))
    .slice(0, MOVE_LOADOUT_CAP);
  return prepared.length > 0 ? prepared : available.slice(0, MOVE_LOADOUT_CAP);
}

export function setPreparedMoves(record: CompanionRecord, moveIds: string[]): string[] {
  const known = availableMovesFromRecord(record);
  const requested = new Set(moveIds);
  const prepared = known.filter((move) => requested.has(move.id));
  if (
    moveIds.some((id) => typeof id !== 'string') ||
    moveIds.length !== requested.size ||
    prepared.length === 0 ||
    prepared.length > MOVE_LOADOUT_CAP ||
    prepared.length !== requested.size
  ) {
    throw new Error(`戰技配置必須是 1～${MOVE_LOADOUT_CAP} 個不重複的已解鎖招式`);
  }
  record.preparedMoveIds = prepared.map((move) => move.id);
  return [...record.preparedMoveIds];
}

/**
 * 將角色成長、裝備、特質、專精、武裝熟練與戰技配置整合成實際戰鬥成員。
 * M43 不禁止跨職裝備，而是把不合訓練的代價公開轉成命中、屬性、負重與施法上限。
 */
export function memberFromRecord(record: CompanionRecord): PartyMember {
  const job = JOBS[record.job];
  const bonus = equipmentBonus(record);
  const armory = armoryProfile(record);
  const stats: StatBlock = effectiveStats(record);
  for (const stat of Object.keys(armory.statAdjustments) as Array<keyof StatBlock>) {
    stats[stat] += armory.statAdjustments[stat] ?? 0;
  }
  const trait = traitById(record.trait);
  const spec = specById(record.specialization);
  const bondHp = bondTier(record.bond) * BOND_HP_PER_TIER;
  const maxHp = Math.max(1, record.maxHp + bonus.maxHp + (trait?.maxHpBonus ?? 0)
    + (spec?.maxHp ?? 0) + bondHp + armory.maxHpAdjustment);

  const member: PartyMember & ArmoryPartyMemberRuntime = {
    id: record.id,
    name: record.name,
    stats,
    maxHp,
    hp: maxHp,
    defense: Math.max(1, job.defense + bonus.defense + (spec?.defense ?? 0) + armory.defenseAdjustment),
    moves: adjustMovesForArmory(record, preparedMovesFromRecord(record)),
    damageBonus: (bonus.damageBonus ?? 0) + armory.damageAdjustment,
    isProtagonist: record.id === 'protagonist',
    mysticCapacityBonus: armory.mysticCapacity,
    armoryBurden: armory.burden,
    armoryCapacity: armory.capacity,
    armoryOverload: armory.overload,
    armoryWarnings: [...armory.warnings],
    armoryProfile: armory,
  };
  return member;
}
