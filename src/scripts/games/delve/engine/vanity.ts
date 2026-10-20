// vanity.ts — 外觀欄（時裝）：頭 / 身 / 腿 / 背四格 + 三個防具的「隱藏」開關。純資料，不碰 DOM。
//   外觀欄只改樣子（沒有任何數值，也不算進防禦 / 套裝）；頭 / 身 / 腿格也可以放同部位的防具（拿來當樣子用，詞條保留）。
//   背格收背飾時裝（斗篷 / 翅膀 / 大蝴蝶結）。隱藏開關：該部位的防具不畫（外觀欄有東西時照樣畫外觀欄）。
import { ITEMS, isItemId, type ItemId, type VanitySlot } from './items';
import { type Inventory, type Stack } from './inventory';
import { cloneGear, validGear, type Gear } from './gear';
import { cloneTint, isTintable, validTint, type Tint } from './tint';

export type { VanitySlot };
export const VANITY_SLOTS: readonly VanitySlot[] = ['head', 'body', 'legs', 'back'];
export type HideSlot = 'head' | 'body' | 'legs';
/** tint = 每格時裝的顏色（null = 原色）；舊存檔沒有這欄 → 全部原色 */
export interface VanityJSON {
  slots: Record<VanitySlot, ItemId | null>;
  gear: Record<VanitySlot, Gear | null>;
  tint: Record<VanitySlot, Tint | null>;
  hide: Record<HideSlot, boolean>;
}

/** 這件道具能不能放進外觀欄的 slot：同格的時裝，或（頭 / 身 / 腿）同部位的防具 */
export function fitsVanity(slot: VanitySlot, item: ItemId): boolean {
  const d = ITEMS[item];
  if (!d) return false;
  if (d.vanity) return d.vanity.slot === slot;
  return slot !== 'back' && d.armor?.slot === slot;
}

export class Vanity {
  private slots = new Map<VanitySlot, Stack>();
  hide: Record<HideSlot, boolean> = { head: false, body: false, legs: false };
  /** 每次改動 +1（紙娃娃快取用；改 hide 請用 setHide 或自己 touch） */
  version = 0;

  get(s: VanitySlot): ItemId | null { return this.slots.get(s)?.item ?? null; }
  getStack(s: VanitySlot): Stack | null { return this.slots.get(s) ?? null; }
  set(s: VanitySlot, item: ItemId | null, gear?: Gear, tint?: Tint): boolean {
    if (item === null) { if (this.slots.delete(s)) this.version++; return true; }
    if (!isItemId(item) || !fitsVanity(s, item)) return false;
    const st: Stack = { item, count: 1 };
    if (gear) st.gear = gear;
    if (tint && isTintable(item)) st.tint = cloneTint(tint);
    this.slots.set(s, st);
    this.version++;
    return true;
  }
  setHide(s: HideSlot, on: boolean): void { if (this.hide[s] !== on) { this.hide[s] = on; this.version++; } }
  touch(): void { this.version++; }

  /** 背包第 i 格放進外觀欄 s；原本的放回背包那格（交換） */
  equipFrom(inv: Inventory, i: number, s: VanitySlot): boolean {
    const st = inv.slots[i];
    if (!st || !fitsVanity(s, st.item)) return false;
    const old = this.slots.get(s) ?? null;
    const moving: Stack = st.count > 1 ? { item: st.item, count: 1 } : st;
    if (st.count > 1) st.count--; else inv.slots[i] = null;
    if (old) {
      if (inv.slots[i] === null) inv.slots[i] = old;
      else if (inv.addStack(old) > 0) { if (moving === st) inv.slots[i] = st; else st.count++; return false; }
    }
    this.slots.set(s, moving);
    this.version++;
    return true;
  }
  /** 外觀欄 s 卸下放回背包；放不下就不動 */
  unequipTo(inv: Inventory, s: VanitySlot): boolean {
    const st = this.slots.get(s);
    if (!st || !inv.slots.includes(null)) return false;
    inv.addStack(st);
    this.slots.delete(s);
    this.version++;
    return true;
  }

  toJSON(): VanityJSON {
    const slots = {} as VanityJSON['slots'], gear = {} as VanityJSON['gear'], tint = {} as VanityJSON['tint'];
    for (const s of VANITY_SLOTS) {
      const st = this.slots.get(s);
      slots[s] = st?.item ?? null;
      gear[s] = st?.gear ? cloneGear(st.gear) : null;
      tint[s] = st?.tint ? cloneTint(st.tint) : null;
    }
    return { slots, gear, tint, hide: { ...this.hide } };
  }
  /** 由存檔還原：不合法 / 放錯格的道具丟掉、詞條 / 顏色不合法就當普通 / 原色（外觀不會讓存檔壞掉） */
  static fromJSON(j: unknown): Vanity {
    const v = new Vanity();
    if (!j || typeof j !== 'object') return v;
    const o = j as Partial<{ slots: unknown; gear: unknown; tint: unknown; hide: unknown }>;
    const slots = (o.slots && typeof o.slots === 'object' ? o.slots : {}) as Record<string, unknown>;
    const gear = (o.gear && typeof o.gear === 'object' ? o.gear : {}) as Record<string, unknown>;
    const tint = (o.tint && typeof o.tint === 'object' ? o.tint : {}) as Record<string, unknown>;
    for (const s of VANITY_SLOTS) {
      const it = slots[s];
      if (isItemId(it) && fitsVanity(s, it)) v.set(s, it, validGear(it, gear[s]) ?? undefined, validTint(tint[s]) ?? undefined);
    }
    const h = (o.hide && typeof o.hide === 'object' ? o.hide : {}) as Record<string, unknown>;
    for (const s of ['head', 'body', 'legs'] as const) v.hide[s] = h[s] === true;
    v.version = 0;
    return v;
  }
}
