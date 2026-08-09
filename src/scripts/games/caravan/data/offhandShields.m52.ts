import type { CompanionRecord } from '../save';
import { ITEMS, type ItemDef } from './items';

export type OffhandKind = 'shield';

export interface M52OffhandEquip {
  slot: 'offhand';
  minLevel?: number;
  offhandKind: OffhandKind;
}

export interface M52OffhandItem extends Omit<ItemDef, 'equip'> {
  equip: M52OffhandEquip;
}

export interface M52EquipmentView {
  weapon: string | null;
  armor: string | null;
  trinket: string | null;
  offhand?: string | null;
}

export interface ShieldRule {
  itemId: string;
  guardBonus: number;
  burden: number;
  manaCapacity?: number;
}

export interface HandLoadoutProfile {
  weaponHands: 0 | 1 | 2;
  offhandId: string | null;
  shieldId: string | null;
  shieldReady: boolean;
  shieldGuardBonus: number;
  offhandBurden: number;
  manaCapacity: number;
  warning: string;
}

export const TWO_HANDED_WEAPONS = new Set([
  'ridge-mist-bow',
  'ghostflame-staff',
  'brine-crystal-staff',
  'swordsaint-bokken',
]);

export const SHIELD_RULES: Record<string, ShieldRule> = {
  'oak-buckler': { itemId: 'oak-buckler', guardBonus: 1, burden: 1 },
  'salt-rim-kite-shield': { itemId: 'salt-rim-kite-shield', guardBonus: 2, burden: 2, manaCapacity: -1 },
};

export const M52_OFFHAND_ITEMS: Record<string, M52OffhandItem> = {
  'oak-buckler': {
    id: 'oak-buckler',
    name: '橡木小圓盾',
    desc: '以數層橡木交錯壓合、外緣包鐵的小圓盾。真正價值不是讓人永遠更硬，而是在主動架勢時多接下一分力道。',
    value: 48,
    equip: { slot: 'offhand', offhandKind: 'shield' },
  },
  'salt-rim-kite-shield': {
    id: 'salt-rim-kite-shield',
    name: '鹽鋼鳶盾',
    desc: '鹽泉鐵匠以鹽鍛鋼包覆長鳶形木芯的軍用盾。守勢極穩，但重量與遮蔽會妨礙精細秘法手勢。',
    value: 118,
    equip: { slot: 'offhand', minLevel: 3, offhandKind: 'shield' },
  },
};

/**
 * M52 uses a soft schema extension: existing v6 saves keep the three legacy keys,
 * while the optional offhand key is persisted naturally by JSON without a save migration.
 */
export function equipmentView(record: Pick<CompanionRecord, 'equipment'>): M52EquipmentView {
  return record.equipment as M52EquipmentView;
}

export function offhandId(record: Pick<CompanionRecord, 'equipment'>): string | null {
  return equipmentView(record).offhand ?? null;
}

export function setOffhandId(record: Pick<CompanionRecord, 'equipment'>, itemId: string | null): void {
  equipmentView(record).offhand = itemId;
}

export function weaponHands(itemId: string | null | undefined): 0 | 1 | 2 {
  if (!itemId) return 0;
  const item = ITEMS[itemId];
  if (!item?.equip || item.equip.slot !== 'weapon') return 0;
  return TWO_HANDED_WEAPONS.has(itemId) ? 2 : 1;
}

export function shieldRule(itemId: string | null | undefined): ShieldRule | null {
  return itemId ? SHIELD_RULES[itemId] ?? null : null;
}

export function handLoadoutProfile(record: Pick<CompanionRecord, 'equipment'>): HandLoadoutProfile {
  const equipment = equipmentView(record);
  const hands = weaponHands(equipment.weapon);
  const offhand = equipment.offhand ?? null;
  const shield = shieldRule(offhand);
  const ready = !!shield && hands < 2;
  const warning = shield && !ready
    ? `${ITEMS[equipment.weapon!]?.name ?? '雙手武器'}佔滿雙手；${M52_OFFHAND_ITEMS[shield.itemId]?.name ?? shield.itemId}目前只能收在背帶上，守勢加成不生效。`
    : '';
  return {
    weaponHands: hands,
    offhandId: offhand,
    shieldId: shield?.itemId ?? null,
    shieldReady: ready,
    shieldGuardBonus: ready ? shield?.guardBonus ?? 0 : 0,
    offhandBurden: shield?.burden ?? 0,
    manaCapacity: shield?.manaCapacity ?? 0,
    warning,
  };
}

export function equipOffhandItem(save: { inventory: Record<string, number> }, record: CompanionRecord, itemId: string): HandLoadoutProfile {
  const item = M52_OFFHAND_ITEMS[itemId];
  if (!item) throw new Error(`「${itemId}」不是可用副手。`);
  if (item.equip.minLevel !== undefined && record.level < item.equip.minLevel) {
    throw new Error(`${record.name}需要 Lv${item.equip.minLevel} 才能裝備「${item.name}」。`);
  }
  if ((save.inventory[itemId] ?? 0) <= 0) throw new Error(`背包中沒有「${item.name}」。`);
  const previous = offhandId(record);
  save.inventory[itemId] -= 1;
  if (save.inventory[itemId] <= 0) delete save.inventory[itemId];
  if (previous) save.inventory[previous] = (save.inventory[previous] ?? 0) + 1;
  setOffhandId(record, itemId);
  return handLoadoutProfile(record);
}

export function unequipOffhandItem(save: { inventory: Record<string, number> }, record: CompanionRecord): HandLoadoutProfile {
  const previous = offhandId(record);
  if (previous) {
    setOffhandId(record, null);
    save.inventory[previous] = (save.inventory[previous] ?? 0) + 1;
  }
  return handLoadoutProfile(record);
}

// Register the two M52 items into the existing mutable item catalog without changing v6 item/save schema.
for (const [id, item] of Object.entries(M52_OFFHAND_ITEMS)) {
  (ITEMS as unknown as Record<string, ItemDef | M52OffhandItem>)[id] = item;
}
