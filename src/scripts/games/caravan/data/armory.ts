import type { Element, Move } from '../combat';
import type { CompanionRecord, SaveData } from '../save';
import type { StatBlock } from '../types';
import { ITEMS, type ItemDef } from './items';
import type { ProtectionProfile } from './armorProtection.m48';

export type WeaponDiscipline = 'blade' | 'bow' | 'staff' | 'mace';
export type ArmorDiscipline = 'light' | 'mail' | 'robe' | 'vestment';
export type GearFit = 'mastered' | 'trained' | 'strained';

export interface ArmoryItemRule {
  itemId: string;
  burden: number;
  weapon?: WeaponDiscipline;
  armor?: ArmorDiscipline;
  manaCapacity?: number;
  favorCapacity?: number;
  /** M48：實際受擊倍率；低於 1 是防護，高於 1 是護甲暴露面。 */
  protection?: Partial<Record<Element, number>>;
}

export interface ArmoryProfile {
  burden: number;
  capacity: number;
  overload: number;
  weaponFit: GearFit | null;
  armorFit: GearFit | null;
  weaponHitBonus: number;
  damageAdjustment: number;
  defenseAdjustment: number;
  maxHpAdjustment: number;
  statAdjustments: Partial<StatBlock>;
  mysticCapacity: { mana: number; favor: number };
  /** M48：由實際裝備物件導出的受擊輪廓，戰鬥 runtime 直接讀取。 */
  armorProtection: ProtectionProfile | null;
  warnings: string[];
}

export interface PartyArmoryLoad {
  burden: number;
  capacity: number;
  overload: number;
  members: Record<string, ArmoryProfile>;
}

const RULES: Record<string, ArmoryItemRule> = {
  'salt-crystal-blade': { itemId: 'salt-crystal-blade', burden: 2, weapon: 'blade' },
  'ancient-king-blade': { itemId: 'ancient-king-blade', burden: 2, weapon: 'blade' },
  'swordsaint-bokken': { itemId: 'swordsaint-bokken', burden: 1, weapon: 'blade' },
  'ridge-mist-bow': { itemId: 'ridge-mist-bow', burden: 2, weapon: 'bow' },
  'ghostflame-staff': { itemId: 'ghostflame-staff', burden: 1, weapon: 'staff', manaCapacity: 1 },
  'brine-crystal-staff': { itemId: 'brine-crystal-staff', burden: 1, weapon: 'staff', manaCapacity: 1 },
  'brine-blessed-mace': { itemId: 'brine-blessed-mace', burden: 2, weapon: 'mace', favorCapacity: 1 },

  'ridgeleather-vest': {
    itemId: 'ridgeleather-vest', burden: 1, armor: 'light',
    protection: { slash: 0.9, pierce: 1.1 },
  },
  'pilgrim-warded-cloak': {
    itemId: 'pilgrim-warded-cloak', burden: 2, armor: 'light',
    protection: { slash: 0.9, pierce: 1.05, fire: 0.9, frost: 0.9, holy: 0.85 },
  },
  'saltforged-mail': {
    itemId: 'saltforged-mail', burden: 3, armor: 'mail', manaCapacity: -2,
    protection: { slash: 0.7, pierce: 0.85, blunt: 1.2, fire: 1.1 },
  },
  'ashveil-robe': {
    itemId: 'ashveil-robe', burden: 1, armor: 'robe', manaCapacity: 2,
    protection: { slash: 1.15, pierce: 1.15, blunt: 1.05, fire: 0.75, frost: 0.9 },
  },
  'brinewarded-vestment': {
    itemId: 'brinewarded-vestment', burden: 1, armor: 'vestment', favorCapacity: 2,
    protection: { slash: 1.1, pierce: 1.1, blunt: 1.05, fire: 0.9, frost: 0.9, holy: 0.7 },
  },

  'overseer-ledger': { itemId: 'overseer-ledger', burden: 1 },
  'den-idol': { itemId: 'den-idol', burden: 1 },
  'wanderers-compass': { itemId: 'wanderers-compass', burden: 0 },
  'salt-crystal-core': { itemId: 'salt-crystal-core', burden: 1 },
  'royal-courier-sigil': { itemId: 'royal-courier-sigil', burden: 0, favorCapacity: 1 },
  'saltglass-talisman': { itemId: 'saltglass-talisman', burden: 0, manaCapacity: 1 },
};

const WEAPON_FIT: Record<CompanionRecord['job'], Record<WeaponDiscipline, GearFit>> = {
  swordsman: { blade: 'mastered', mace: 'trained', bow: 'trained', staff: 'strained' },
  ranger: { blade: 'trained', mace: 'strained', bow: 'mastered', staff: 'strained' },
  mage: { blade: 'trained', mace: 'strained', bow: 'strained', staff: 'mastered' },
  cleric: { blade: 'trained', mace: 'mastered', bow: 'strained', staff: 'trained' },
};

const ARMOR_FIT: Record<CompanionRecord['job'], Record<ArmorDiscipline, GearFit>> = {
  swordsman: { light: 'trained', mail: 'mastered', robe: 'strained', vestment: 'trained' },
  ranger: { light: 'mastered', mail: 'trained', robe: 'strained', vestment: 'strained' },
  mage: { light: 'trained', mail: 'strained', robe: 'mastered', vestment: 'trained' },
  cleric: { light: 'trained', mail: 'trained', robe: 'trained', vestment: 'mastered' },
};

export const GEAR_FIT_LABELS: Record<GearFit, string> = {
  mastered: '熟練',
  trained: '可用',
  strained: '勉強運用',
};

export const WEAPON_DISCIPLINE_LABELS: Record<WeaponDiscipline, string> = {
  blade: '刀劍',
  bow: '弓弩',
  staff: '法杖',
  mace: '錘杖',
};

export const ARMOR_DISCIPLINE_LABELS: Record<ArmorDiscipline, string> = {
  light: '輕甲',
  mail: '鎖甲',
  robe: '法袍',
  vestment: '聖衣',
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function memberById(save: SaveData, memberId: string): CompanionRecord | undefined {
  return memberId === save.protagonist.id
    ? save.protagonist
    : save.companions.find((member) => member.id === memberId);
}

function specializationWeaponFit(record: CompanionRecord, discipline: WeaponDiscipline, fallback: GearFit): GearFit {
  if (record.specialization === 'bulwark' && discipline === 'mace') return 'mastered';
  if (record.specialization === 'inquisitor' && (discipline === 'mace' || discipline === 'blade')) return 'mastered';
  if (record.specialization === 'hierophant' && discipline === 'staff') return 'mastered';
  if (record.specialization === 'occultist' && discipline === 'blade') return 'trained';
  return fallback;
}

function specializationArmorFit(record: CompanionRecord, discipline: ArmorDiscipline, fallback: GearFit): GearFit {
  if ((record.specialization === 'bulwark' || record.specialization === 'inquisitor') && discipline === 'mail') return 'mastered';
  if (record.specialization === 'occultist' && discipline === 'light') return 'mastered';
  if (record.specialization === 'hierophant' && discipline === 'vestment') return 'mastered';
  if (record.specialization === 'trapper' && discipline === 'mail') return 'trained';
  return fallback;
}

export function armoryRuleForItem(itemId: string | null | undefined): ArmoryItemRule | null {
  return itemId ? RULES[itemId] ?? null : null;
}

export function armoryCarryCapacity(record: CompanionRecord): number {
  const con = record.stats.con;
  const survival = record.skills?.survival ?? 0;
  const profession = record.job === 'swordsman' ? 2 : record.job === 'ranger' ? 1 : 0;
  return clamp(2 + Math.floor((con - 10) / 2) + Math.floor(survival / 2) + profession, 1, 10);
}

function protectionFromArmorRule(rule: ArmoryItemRule | null, fit: GearFit | null): ProtectionProfile | null {
  if (!rule?.protection) return null;
  const multipliers: Partial<Record<Element, number>> = {};
  for (const element of Object.keys(rule.protection) as Element[]) {
    const configured = rule.protection[element];
    if (configured === undefined) continue;
    // 勉強穿戴只會削弱「正面防護」；笨重或版型錯誤造成的暴露面不會憑空消失。
    multipliers[element] = fit === 'strained' && configured < 1
      ? 1 - (1 - configured) * 0.5
      : configured;
  }
  return {
    source: ITEMS[rule.itemId]?.name ?? rule.itemId,
    multipliers,
  };
}

export function armoryProfile(record: CompanionRecord): ArmoryProfile {
  const weaponRule = armoryRuleForItem(record.equipment.weapon);
  const armorRule = armoryRuleForItem(record.equipment.armor);
  const trinketRule = armoryRuleForItem(record.equipment.trinket);
  const weaponFit = weaponRule?.weapon
    ? specializationWeaponFit(record, weaponRule.weapon, WEAPON_FIT[record.job][weaponRule.weapon])
    : null;
  const armorFit = armorRule?.armor
    ? specializationArmorFit(record, armorRule.armor, ARMOR_FIT[record.job][armorRule.armor])
    : null;

  let burden = (weaponRule?.burden ?? 0) + (armorRule?.burden ?? 0) + (trinketRule?.burden ?? 0);
  if (weaponFit === 'strained') burden += 1;
  if (armorFit === 'strained') burden += 1;
  const capacity = armoryCarryCapacity(record);
  const overload = Math.max(0, burden - capacity);

  const statAdjustments: Partial<StatBlock> = {};
  let defenseAdjustment = 0;
  let maxHpAdjustment = 0;
  let damageAdjustment = 0;
  let mana = (weaponRule?.manaCapacity ?? 0) + (armorRule?.manaCapacity ?? 0) + (trinketRule?.manaCapacity ?? 0);
  let favor = (weaponRule?.favorCapacity ?? 0) + (armorRule?.favorCapacity ?? 0) + (trinketRule?.favorCapacity ?? 0);
  const armorProtection = protectionFromArmorRule(armorRule, armorFit);
  const warnings: string[] = [];

  if (weaponFit === 'strained') {
    damageAdjustment -= 1;
    warnings.push('武器並非本職熟悉流派：武器招式命中 -2、傷害 -1、負重 +1。');
  }
  if (armorRule?.armor === 'mail') {
    statAdjustments.dex = (statAdjustments.dex ?? 0) - 1;
    if (record.job === 'mage' && armorFit !== 'mastered') {
      statAdjustments.int = (statAdjustments.int ?? 0) - 1;
      warnings.push('鎖甲妨礙精細手勢：秘法上限降低，智力 -1。');
    }
  }
  if (armorFit === 'strained') {
    statAdjustments.dex = (statAdjustments.dex ?? 0) - 1;
    if (record.job === 'mage') mana -= 1;
    if (record.job === 'cleric') favor -= 1;
    warnings.push('護甲版型與訓練不合：敏捷 -1、負重 +1，施法者額外失去資源上限。');
    if (armorProtection && Object.values(armorRule?.protection ?? {}).some((multiplier) => (multiplier ?? 1) < 1)) {
      warnings.push('護甲訓練不足：減傷抗性只能發揮一半，原本的受擊弱點仍會完整承受。');
    }
  }
  if (armorRule?.armor === 'robe' && record.job !== 'mage') mana = Math.min(0, mana);
  if (armorRule?.armor === 'vestment' && record.job !== 'cleric') favor = Math.min(0, favor);
  if (weaponRule?.weapon === 'staff' && record.job !== 'mage') mana = Math.min(0, mana);
  if (weaponRule?.weapon === 'mace' && record.job !== 'cleric') favor = Math.min(0, favor);

  if (overload > 0) {
    statAdjustments.dex = (statAdjustments.dex ?? 0) - overload;
    maxHpAdjustment -= overload * 2;
    warnings.push(`攜行超載 ${overload}：敏捷 -${overload}、生命上限 -${overload * 2}。`);
  }

  const weaponHitBonus = weaponFit === 'mastered' ? 1 : weaponFit === 'strained' ? -2 : 0;
  if (weaponFit === 'mastered') warnings.push('武器熟練：裝備武器招式命中 +1。');

  return {
    burden,
    capacity,
    overload,
    weaponFit,
    armorFit,
    weaponHitBonus,
    damageAdjustment,
    defenseAdjustment,
    maxHpAdjustment,
    statAdjustments,
    mysticCapacity: { mana, favor },
    armorProtection,
    warnings,
  };
}

export function adjustMovesForArmory(record: CompanionRecord, moves: Move[]): Move[] {
  const weaponId = record.equipment.weapon;
  const weaponMoveId = weaponId ? ITEMS[weaponId]?.equip?.move?.id : null;
  if (!weaponMoveId) return moves.map((move) => ({ ...move }));
  const profile = armoryProfile(record);
  return moves.map((move) => move.id === weaponMoveId
    ? { ...move, hitBonus: (move.hitBonus ?? 0) + profile.weaponHitBonus }
    : { ...move });
}

export function partyArmoryLoad(save: SaveData, memberIds?: string[]): PartyArmoryLoad {
  const ids = memberIds ?? [save.protagonist.id, ...save.companions.map((member) => member.id)];
  const members: Record<string, ArmoryProfile> = {};
  let burden = 0;
  let capacity = 0;
  for (const id of ids) {
    const member = memberById(save, id);
    if (!member) continue;
    const profile = armoryProfile(member);
    members[id] = profile;
    burden += profile.burden;
    capacity += profile.capacity;
  }
  return { burden, capacity, overload: Math.max(0, burden - capacity), members };
}

export function equipArmoryItem(save: SaveData, memberId: string, itemId: string): ArmoryProfile {
  const record = memberById(save, memberId);
  if (!record) throw new Error(`找不到成員「${memberId}」。`);
  const item = ITEMS[itemId];
  if (!item?.equip) throw new Error(`「${itemId}」不是可裝備物品。`);
  if (item.equip.minLevel !== undefined && record.level < item.equip.minLevel) {
    throw new Error(`${record.name}需要 Lv${item.equip.minLevel} 才能裝備「${item.name}」。`);
  }
  if ((save.inventory[itemId] ?? 0) <= 0) throw new Error(`背包中沒有「${item.name}」。`);
  const slot = item.equip.slot;
  const previous = record.equipment[slot];
  save.inventory[itemId] -= 1;
  if (save.inventory[itemId] <= 0) delete save.inventory[itemId];
  if (previous) save.inventory[previous] = (save.inventory[previous] ?? 0) + 1;
  record.equipment[slot] = itemId;
  return armoryProfile(record);
}

export function unequipArmoryItem(save: SaveData, memberId: string, slot: keyof CompanionRecord['equipment']): ArmoryProfile {
  const record = memberById(save, memberId);
  if (!record) throw new Error(`找不到成員「${memberId}」。`);
  const previous = record.equipment[slot];
  if (previous) {
    record.equipment[slot] = null;
    save.inventory[previous] = (save.inventory[previous] ?? 0) + 1;
  }
  return armoryProfile(record);
}

export function equippableInventory(save: SaveData): Array<{ item: ItemDef; count: number }> {
  return Object.entries(save.inventory)
    .filter(([, count]) => count > 0)
    .map(([itemId, count]) => ({ item: ITEMS[itemId], count }))
    .filter((entry): entry is { item: ItemDef; count: number } => !!entry.item?.equip)
    .sort((a, b) => a.item.value - b.item.value || a.item.name.localeCompare(b.item.name));
}
