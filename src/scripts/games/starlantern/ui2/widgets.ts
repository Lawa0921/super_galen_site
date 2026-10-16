import { el } from '../ui/dom';
import type { UiAction } from './input';
import { Menu, type MenuItem } from './menu';

export function win(cls: string, children: Node[] = []): HTMLElement {
  return el('div', { class: `slx-win ${cls}` }, children);
}

export class MenuView {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private top = 0;

  /** `rows` limits how many options are on screen; the window scrolls to keep the cursor visible. */
  constructor(readonly menu: Menu, private on: { pick(item: MenuItem): void; moved?(): void; cancel?(): void }, private rows = Infinity) {
    this.list = el('ul', { class: 'slx-menu', attrs: { role: 'listbox' } });
    this.el = this.list;
    this.render();
  }

  render(): void {
    const n = this.menu.items.length;
    const c = Math.max(0, this.menu.cursor);
    if (c < this.top) this.top = c;
    if (c >= this.top + this.rows) this.top = c - this.rows + 1;
    this.top = Math.max(0, Math.min(this.top, n - Math.min(n, this.rows)));
    const end = Math.min(n, this.top + this.rows);
    const marker = (cls: string, text: string) => el('li', { class: `slx-more ${cls}`, text, attrs: { 'aria-hidden': 'true' } });
    const rows = this.menu.items.slice(this.top, end).map((item, k) => {
      const i = this.top + k;
      const li = el('li', { class: i === this.menu.cursor ? 'slx-opt slx-sel' : 'slx-opt', attrs: {
        role: 'option', 'aria-selected': String(i === this.menu.cursor), 'aria-disabled': String(!!item.disabled), 'data-id': item.id,
      } }, [
        ...(item.icon ? [el('img', { class: 'slx-ico', attrs: { src: item.icon, alt: '' } })] : []),
        el('span', { class: 'slx-label', text: item.label }),
        ...(item.right !== undefined ? [el('span', { class: 'slx-right', text: item.right })] : []),
      ]);
      // pointermove, not pointerenter: a window that opens under a resting mouse must not steal the keyboard cursor.
      li.addEventListener('pointermove', () => {
        if (this.locked()) return;
        const before = this.menu.cursor;
        if (this.menu.setCursor(i) && this.menu.cursor !== before) { this.render(); this.on.moved?.(); }
      });
      li.addEventListener('click', () => { if (this.locked()) return; if (!item.disabled && this.menu.setCursor(i)) { this.render(); this.flashPick(); this.on.pick(item); } });
      return li;
    });
    this.list.replaceChildren(...(this.top > 0 ? [marker('slx-more-up', '▲')] : []), ...rows, ...(end < n ? [marker('slx-more-down', '▼')] : []));
  }

  /** A quick flash on the chosen row, so a pick is felt even when the next window opens at once. */
  private flashPick(): void {
    this.list.querySelector('[aria-selected=true]')?.classList.add('slx-picked');
  }

  /** Pointer input only reaches the active window: anything inside an inert subtree (under a dialogue, a modal or a scene switch) is ignored. */
  private locked(): boolean {
    return !!this.el.closest('[inert]');
  }

  onAction(a: UiAction): boolean {
    if (a === 'up' || a === 'down') {
      if (this.menu.move(a === 'down' ? 1 : -1)) { this.render(); this.on.moved?.(); }
      return true;
    }
    if (a === 'confirm') { const it = this.menu.current(); if (it) { this.flashPick(); this.on.pick(it); } return true; }
    if (a === 'cancel' && this.on.cancel) { this.on.cancel(); return true; }
    return false;
  }
}

export class Dialogue {
  readonly el: HTMLElement;
  private name = el('b', { class: 'slx-name' });
  private text = el('span', { class: 'slx-text' });
  /** Blinking mark shown once the whole line is on screen. */
  private next = el('span', { class: 'slx-next', text: '▼', attrs: { 'aria-hidden': 'true', hidden: '' } });
  private full = '';
  private timer: ReturnType<typeof setInterval> | null = null;
  private resolve: (() => void) | null = null;

  /** `onClose` runs synchronously when a line is dismissed, so owners can unlock their windows before the next click. */
  constructor(private charsPerSecond: number, private onClose?: () => void) {
    this.el = win('slx-talk', [this.name, this.text, this.next]);
    this.el.hidden = true;
    this.el.setAttribute('aria-live', 'polite');
    // Mouse and touch: a click anywhere on the box does what the confirm key does.
    this.el.addEventListener('click', () => { if (!this.el.closest('[inert]')) this.onAction('confirm'); });
  }

  busy(): boolean { return this.resolve !== null; }

  say(name: string, text: string): Promise<void> {
    this.stop();
    // A newer line replaces the old one: settle the old promise so nothing awaits it forever.
    const old = this.resolve;
    this.resolve = null;
    old?.();
    this.full = text;
    this.name.textContent = name;
    this.name.hidden = !name;
    this.el.hidden = false;
    this.next.setAttribute('hidden', '');
    if (!Number.isFinite(this.charsPerSecond)) this.complete();
    else {
      let n = 0;
      this.text.textContent = '';
      this.el.setAttribute('aria-busy', 'true');
      this.timer = setInterval(() => {
        n += 1;
        this.text.textContent = [...this.full].slice(0, n).join('');
        if (n >= [...this.full].length) this.complete();
      }, 1000 / this.charsPerSecond);
    }
    return new Promise((r) => { this.resolve = r; });
  }

  onAction(a: UiAction): boolean {
    if (!this.resolve || a !== 'confirm') return false;
    if (this.timer) { this.complete(); return true; }
    const r = this.resolve;
    this.resolve = null;
    this.el.hidden = true;
    this.onClose?.();
    r();
    return true;
  }

  /** Whole line on screen: the ▼ mark shows and screen readers (aria-busy off) read it once. */
  private complete(): void {
    this.stop();
    this.text.textContent = this.full;
    this.next.removeAttribute('hidden');
    this.el.setAttribute('aria-busy', 'false');
  }

  /** Stops typing; owners call it on exit so no timer outlives the scene. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export function confirmBox(question: string, on: (yes: boolean) => void): { el: HTMLElement; view: MenuView } {
  const view = new MenuView(new Menu([{ id: 'yes', label: '是' }, { id: 'no', label: '否' }]), {
    pick: (it) => on(it.id === 'yes'),
    cancel: () => on(false),
  });
  return { el: win('slx-confirm', [el('p', { text: question }), view.el]), view };
}

export class QtyView {
  readonly el: HTMLElement;
  qty = 1;
  private label = el('span', { class: 'slx-qty-n' });
  private total = el('span', { class: 'slx-qty-total' });

  /** With a unit price the window also shows the total. */
  constructor(private max: number, private on: { change(qty: number): void; done(qty: number): void; cancel(): void }, private price?: number) {
    const down = el('span', { class: 'slx-qty-down', text: '◀ ' });
    const up = el('span', { class: 'slx-qty-up', text: ' ▶' });
    const row = el('div', { class: 'slx-qty-row' }, [down, this.label, up, ...(price !== undefined ? [this.total] : [])]);
    this.el = win('slx-qty', [row, el('p', { class: 'slx-hint', text: '◀▶ ±1　▲▼ ±10\n點數字 決定' })]);
    // Mouse: the arrows step by one, the number confirms.
    const tap = (a: UiAction) => () => { if (!this.el.closest('[inert]')) this.onAction(a); };
    down.addEventListener('click', tap('left'));
    up.addEventListener('click', tap('right'));
    this.label.addEventListener('click', tap('confirm'));
    this.show();
  }

  onAction(a: UiAction): boolean {
    const step = a === 'left' ? -1 : a === 'right' ? 1 : a === 'down' ? -10 : a === 'up' ? 10 : 0;
    if (step) {
      const next = Math.min(this.max, Math.max(1, this.qty + step));
      if (next !== this.qty) { this.qty = next; this.show(); this.on.change(next); }
      return true;
    }
    if (a === 'confirm') { this.on.done(this.qty); return true; }
    if (a === 'cancel') { this.on.cancel(); return true; }
    return false;
  }

  private show(): void {
    this.label.textContent = `× ${this.qty}`;
    if (this.price !== undefined) this.total.textContent = `${this.price * this.qty} G`;
  }
}

/** On-screen 返回 for mouse and touch players; the owner treats it as the cancel key. */
export function backControl(onBack: () => void): HTMLElement {
  const b = win('slx-back', [document.createTextNode('返回')]);
  b.setAttribute('role', 'button');
  b.setAttribute('tabindex', '-1');
  b.addEventListener('click', () => { if (!b.closest('[inert]')) onBack(); });
  return b;
}
