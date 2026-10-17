// inventory.ts — 40 格背包，前 10 格為快捷欄。
import { INV_SIZE, HOTBAR_SIZE } from './constants';
import { ITEMS, isItemId, type ItemId, type PickStats } from './items';

export interface Stack { item: ItemId; count: number; }
export interface InventoryJSON { slots: (Stack | null)[]; selected: number; }

export class Inventory {
  slots: (Stack | null)[] = new Array<Stack | null>(INV_SIZE).fill(null);
  selected = 0;

  /** 加入道具，回傳放不下的數量。先補既有堆，再用第一個空格。 */
  add(item: ItemId, n: number): number {
    const max = ITEMS[item].maxStack;
    let left = Math.max(0, Math.floor(n));
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.item === item && s.count < max) {
        const k = Math.min(left, max - s.count);
        s.count += k; left -= k;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i] === null) {
        const k = Math.min(left, max);
        this.slots[i] = { item, count: k }; left -= k;
      }
    }
    return left;
  }

  canAdd(item: ItemId, n: number): boolean {
    const max = ITEMS[item].maxStack;
    let room = 0;
    for (const s of this.slots) {
      if (s === null) room += max;
      else if (s.item === item) room += max - s.count;
      if (room >= n) return true;
    }
    return room >= n;
  }

  /** 一組道具是否能全部放進背包（模擬依序加入，彼此會搶空格）。 */
  canAddAll(items: ReadonlyMap<ItemId, number>): boolean {
    const sim = new Inventory();
    sim.slots = this.slots.map((s) => (s ? { ...s } : null));
    for (const [item, n] of items) if (sim.add(item, n) > 0) return false;
    return true;
  }

  count(item: ItemId): number {
    let c = 0;
    for (const s of this.slots) if (s && s.item === item) c += s.count;
    return c;
  }
  has(item: ItemId, n: number): boolean { return this.count(item) >= n; }

  /** 全有或全無地移除；從背包後段開始扣，盡量保留快捷欄的堆。 */
  remove(item: ItemId, n: number): boolean {
    if (!this.has(item, n)) return false;
    let left = n;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (!s || s.item !== item) continue;
      const k = Math.min(left, s.count);
      s.count -= k; left -= k;
      if (s.count === 0) this.slots[i] = null;
    }
    return true;
  }

  takeFromSlot(i: number, n: number): boolean {
    const s = this.slots[i];
    if (!s || s.count < n) return false;
    s.count -= n;
    if (s.count === 0) this.slots[i] = null;
    return true;
  }

  /** 背包 UI 拖放：把 a 格移到 b 格。同物品可堆疊時合併進 b（放不下的留在 a），否則交換。 */
  swap(a: number, b: number): boolean {
    const n = this.slots.length;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n || a === b) return false;
    const sa = this.slots[a], sb = this.slots[b];
    if (sa && sb && sa.item === sb.item) {
      const max = ITEMS[sa.item].maxStack;
      const k = Math.min(sa.count, max - sb.count);
      if (k > 0) {
        sb.count += k; sa.count -= k;
        if (sa.count === 0) this.slots[a] = null;
        return true;
      }
    }
    this.slots[a] = sb;
    this.slots[b] = sa;
    return true;
  }
  select(i: number): void {
    if (Number.isInteger(i) && i >= 0 && i < HOTBAR_SIZE) this.selected = i;
  }
  selectedStack(): Stack | null { return this.slots[this.selected]; }

  /** 背包中最好的鎬（依速度）；沒有則 null。 */
  bestPick(): PickStats | null {
    let best: PickStats | null = null;
    for (const s of this.slots) {
      const p = s ? ITEMS[s.item].pick : undefined;
      if (p && (!best || p.speed > best.speed)) best = p;
    }
    return best;
  }

  toJSON(): InventoryJSON {
    return { slots: this.slots.map((s) => (s ? { item: s.item, count: s.count } : null)), selected: this.selected };
  }

  static fromJSON(j: unknown): Inventory {
    const inv = new Inventory();
    if (!j || typeof j !== 'object') return inv;
    const o = j as { slots?: unknown; selected?: unknown };
    if (Array.isArray(o.slots)) {
      for (let i = 0; i < Math.min(INV_SIZE, o.slots.length); i++) {
        const s = o.slots[i] as { item?: unknown; count?: unknown } | null;
        if (!s || !isItemId(s.item) || typeof s.count !== 'number' || !Number.isInteger(s.count)) continue;
        if (s.count < 1) continue;
        inv.slots[i] = { item: s.item, count: Math.min(s.count, ITEMS[s.item].maxStack) };
      }
    }
    if (typeof o.selected === 'number') inv.select(o.selected);
    return inv;
  }
}

export function starterInventory(): Inventory {
  const inv = new Inventory();
  inv.add('wood_pickaxe', 1);
  inv.add('torch', 10);
  inv.add('wood_sword', 1);
  return inv;
}
