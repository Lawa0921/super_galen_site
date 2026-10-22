// inventory.ts — 40 格背包，前 10 格為快捷欄。裝備（武器 / 防具 / 飾品 / 鎬）每件可帶自己的詞條資料（gear）；
//   時裝每件可帶自己的顏色（tint）。兩者都是「單件實例資料」：帶著的那格不和別格合併。
import { INV_SIZE, HOTBAR_SIZE } from './constants';
import { ITEMS, isItemId, type ItemId, type PickStats } from './items';
import { cloneGear, pickSpeed, validGear, type Gear } from './gear';
import { cloneTint, isTintable, validTint, type Tint } from './tint';

/** gear = 這件裝備的詞條 / 稀有度 / 強化（沒有 = 普通、無詞條）；tint = 時裝的主色 / 副色（沒有 = 款式原色） */
export interface Stack { item: ItemId; count: number; gear?: Gear; tint?: Tint; }
/** 複製一格（gear / tint 深複製） */
export function cloneStack(s: Stack): Stack {
  const o: Stack = { item: s.item, count: s.count };
  if (s.gear) o.gear = cloneGear(s.gear);
  if (s.tint) o.tint = cloneTint(s.tint);
  return o;
}
export interface InventoryJSON { slots: (Stack | null)[]; selected: number; }

export class Inventory {
  slots: (Stack | null)[] = new Array<Stack | null>(INV_SIZE).fill(null);
  selected = 0;

  /** 加入道具，回傳放不下的數量。先補既有堆，再用第一個空格。gear / tint = 帶詞條的單件裝備 / 帶顏色的時裝（放進第一個空格）。 */
  add(item: ItemId, n: number, gear?: Gear, tint?: Tint): number {
    const max = ITEMS[item].maxStack;
    let left = Math.max(0, Math.floor(n));
    if ((gear || tint) && left > 0) {
      const i = this.slots.indexOf(null);
      if (i < 0) return left;
      const st: Stack = { item, count: 1 };
      if (gear) st.gear = gear;
      if (tint) st.tint = cloneTint(tint);
      this.slots[i] = st;
      left--;
      if (left <= 0) return 0;
    }
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

  /** 放進一整格（保留 gear / tint），回傳放不下的數量 */
  addStack(st: Stack): number {
    // 帶詞條 / 顏色的單件：放進同一個物件（介面 / 鍛造台追蹤的是物件）
    if ((st.gear || st.tint) && st.count === 1) {
      const i = this.slots.indexOf(null);
      if (i < 0) return 1;
      this.slots[i] = st;
      return 0;
    }
    return this.add(st.item, st.count, st.gear, st.tint);
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

  /** 背包中最好的鎬（依實際速度：含強化 / 挖掘詞條）；沒有則 null。 */
  bestPick(): PickStats | null {
    const i = this.bestPickSlot();
    if (i < 0) return null;
    const s = this.slots[i]!, p = ITEMS[s.item].pick!;
    return s.gear ? { speed: pickSpeed(s.item, s.gear), tier: p.tier } : p;
  }
  /** 最好的鎬在第幾格（-1 = 沒有） */
  bestPickSlot(): number {
    let best = -1, bs = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s || !ITEMS[s.item].pick) continue;
      const sp = pickSpeed(s.item, s.gear);
      if (best < 0 || sp > bs) { best = i; bs = sp; }
    }
    return best;
  }

  toJSON(): InventoryJSON {
    return { slots: this.slots.map((s) => (s ? cloneStack(s) : null)), selected: this.selected };
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
        const st: Stack = { item: s.item, count: Math.min(s.count, ITEMS[s.item].maxStack) };
        const g = validGear(s.item, (s as { gear?: unknown }).gear);
        if (g) st.gear = g;
        const t = isTintable(s.item) ? validTint((s as { tint?: unknown }).tint) : null;
        if (t) st.tint = t;
        inv.slots[i] = st;
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
