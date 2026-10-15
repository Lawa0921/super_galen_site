export interface MenuItem { id: string; label: string; disabled?: boolean; note?: string; icon?: string; right?: string }

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
