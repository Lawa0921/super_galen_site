// equipment.ts — 裝備欄：頭 / 身 / 腿（防具）+ ACC_SLOTS 個飾品槽。純資料，不碰 DOM。
// 手上的武器 / 工具 = 快捷欄選中的那格（不在這裡）。
import { ITEMS, isItemId, type ArmorSlot, type ItemId } from './items';
import type { Inventory } from './inventory';

export const ACC_SLOTS = 5;
export type EquipSlot = ArmorSlot | 'acc0' | 'acc1' | 'acc2' | 'acc3' | 'acc4';
export const EQUIP_SLOTS: readonly EquipSlot[] = ['head', 'body', 'legs', 'acc0', 'acc1', 'acc2', 'acc3', 'acc4'];
export interface EquipmentJSON { head: ItemId | null; body: ItemId | null; legs: ItemId | null; acc: (ItemId | null)[]; }

export function isAccSlot(s: EquipSlot): boolean { return s.startsWith('acc'); }
export function isEquipSlot(v: unknown): v is EquipSlot { return typeof v === 'string' && (EQUIP_SLOTS as readonly string[]).includes(v); }
/** 這件道具能不能裝在某種槽（不看是否重複） */
export function fitsSlot(slot: EquipSlot, item: ItemId): boolean {
  const d = ITEMS[item];
  if (isAccSlot(slot)) return d.accessory !== undefined;
  return d.armor?.slot === slot;
}

export class Equipment {
  private static seq = 0;
  private slots = new Map<EquipSlot, ItemId>();
  /** 每次改動 +1（快取失效用） */
  version = 0;
  /** 每個實例不同（換掉整個裝備欄時讓快取失效） */
  readonly uid = ++Equipment.seq;

  get(s: EquipSlot): ItemId | null { return this.slots.get(s) ?? null; }
  /** 直接設定（不檢查背包；null = 清空）。不合法時回傳 false。 */
  set(s: EquipSlot, item: ItemId | null): boolean {
    if (item === null) { if (this.slots.delete(s)) this.version++; return true; }
    if (!this.canEquip(s, item)) return false;
    this.slots.set(s, item);
    this.version++;
    return true;
  }
  has(item: ItemId): boolean { for (const v of this.slots.values()) if (v === item) return true; return false; }
  /** 已裝備的所有道具 */
  items(): ItemId[] { return [...this.slots.values()]; }
  accessories(): ItemId[] { return EQUIP_SLOTS.filter(isAccSlot).map((s) => this.slots.get(s)).filter((v): v is ItemId => Boolean(v)); }

  /** 能否把 item 裝到 s：槽位種類對、而且（飾品）同一件沒有裝在別的槽 */
  canEquip(s: EquipSlot, item: ItemId): boolean {
    if (!isItemId(item) || !fitsSlot(s, item)) return false;
    if (isAccSlot(s)) for (const [k, v] of this.slots) if (k !== s && v === item) return false;
    return true;
  }
  /** 這件道具會自動裝到哪一槽：防具 → 對應槽；飾品 → 第一個空的飾品槽（都滿就第一槽）；不能裝 → null */
  autoSlot(item: ItemId): EquipSlot | null {
    const d = ITEMS[item];
    if (d.armor) return d.armor.slot;
    if (d.accessory === undefined || this.has(item)) return null;
    const accs = EQUIP_SLOTS.filter(isAccSlot);
    return accs.find((s) => !this.slots.has(s)) ?? accs[0];
  }

  /** 把背包第 i 格裝到 s；原本裝著的放回背包那格（交換）。 */
  equipFrom(inv: Inventory, i: number, s: EquipSlot): boolean {
    const st = inv.slots[i];
    if (!st || !this.canEquip(s, st.item)) return false;
    const old = this.get(s);
    inv.takeFromSlot(i, 1);
    if (old) {
      if (inv.slots[i] === null) inv.slots[i] = { item: old, count: 1 };
      else if (inv.add(old, 1) > 0) { inv.add(st.item, 1); return false; }
    }
    this.slots.set(s, st.item);
    this.version++;
    return true;
  }
  /** 卸下 s 放進背包；背包放不下就不動 */
  unequipTo(inv: Inventory, s: EquipSlot): boolean {
    const it = this.get(s);
    if (!it || !inv.canAdd(it, 1)) return false;
    inv.add(it, 1);
    this.slots.delete(s);
    this.version++;
    return true;
  }

  toJSON(): EquipmentJSON {
    return {
      head: this.get('head'), body: this.get('body'), legs: this.get('legs'),
      acc: EQUIP_SLOTS.filter(isAccSlot).map((s) => this.get(s)),
    };
  }
  /** 由存檔還原；不合法項目（未知道具、放錯槽、重複飾品）丟掉 */
  static fromJSON(j: unknown): Equipment {
    const e = new Equipment();
    if (!j || typeof j !== 'object') return e;
    const o = j as Partial<Record<'head' | 'body' | 'legs' | 'acc', unknown>>;
    for (const s of ['head', 'body', 'legs'] as const) {
      const v = o[s];
      if (isItemId(v)) e.set(s, v);
    }
    if (Array.isArray(o.acc)) {
      o.acc.slice(0, ACC_SLOTS).forEach((v, k) => { if (isItemId(v)) e.set(`acc${k}` as EquipSlot, v); });
    }
    e.version = 0;
    return e;
  }
}
