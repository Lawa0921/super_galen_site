import type { RuneRef } from '../data/runes';
import type { Mark } from './runeArt';

/**
 * `cls` is added to the label (a rarity colour, say); `rightClass` to the right-hand text (`slx-lack`, say); `iconCls` to
 * the icon (`slx-gear-ico` for gear art, which keeps its own size).
 */
export interface MenuItem {
  id: string; label: string; disabled?: boolean; note?: string; icon?: string; iconCls?: string; right?: string; rightClass?: string; cls?: string;
  /** Icons right after the label at 14px (plan 8g Task 7, art step 9: each working rune on a skill in the battle menu). */
  marks?: Mark[];
  /** Icons on the right at 14px, in place of `right` (art step 9: a skill's slots in the workshop's skill list). */
  rightMarks?: Mark[];
  /** A rune row (art step 9): the rune's 20 x 20 cell (its 16px icon in its tier frame) before the label. */
  rune?: RuneRef;
  /** The label's last part, never cut when the label is (a rune's 「（魔法）」, plan 8g final review); styled as the label. */
  tail?: string;
}

/** Cursor over a list: skips disabled items, wraps at both ends, never loops when nothing is selectable. */
export class Menu {
  cursor = -1;

  constructor(readonly items: MenuItem[], start = 0) {
    const n = items.length;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (!items[i].disabled) { this.cursor = i; break; }
    }
  }

  current(): MenuItem | null {
    return this.cursor >= 0 ? this.items[this.cursor] : null;
  }

  move(delta: 1 | -1): boolean {
    if (this.cursor < 0) return false;
    const n = this.items.length;
    for (let k = 1; k < n; k++) {
      const i = (this.cursor + delta * k + n * k) % n;
      if (!this.items[i].disabled) { this.cursor = i; return true; }
    }
    return false;
  }

  setCursor(i: number): boolean {
    if (i < 0 || i >= this.items.length || this.items[i].disabled || i === this.cursor) return i === this.cursor && i >= 0;
    this.cursor = i;
    return true;
  }
}
