import { el } from '../ui/dom';
import type { UiAction } from './input';
import { Menu, type MenuItem } from './menu';

export function win(cls: string, children: Node[] = []): HTMLElement {
  return el('div', { class: `slx-win ${cls}` }, children);
}

export class MenuView {
  readonly el: HTMLElement;
  private list: HTMLElement;

  constructor(readonly menu: Menu, private on: { pick(item: MenuItem): void; moved?(): void; cancel?(): void }) {
    this.list = el('ul', { class: 'slx-menu', attrs: { role: 'listbox' } });
    this.el = this.list;
    this.render();
  }

  render(): void {
    this.list.replaceChildren(...this.menu.items.map((item, i) => {
      const li = el('li', { class: i === this.menu.cursor ? 'slx-opt slx-sel' : 'slx-opt', text: item.label, attrs: {
        role: 'option', 'aria-selected': String(i === this.menu.cursor), 'aria-disabled': String(!!item.disabled), 'data-id': item.id,
      } });
      li.addEventListener('pointerenter', () => {
        const before = this.menu.cursor;
        if (this.menu.setCursor(i) && this.menu.cursor !== before) { this.render(); this.on.moved?.(); }
      });
      li.addEventListener('click', () => { if (!item.disabled && this.menu.setCursor(i)) { this.render(); this.on.pick(item); } });
      return li;
    }));
  }

  onAction(a: UiAction): boolean {
    if (a === 'up' || a === 'down') {
      if (this.menu.move(a === 'down' ? 1 : -1)) { this.render(); this.on.moved?.(); }
      return true;
    }
    if (a === 'confirm') { const it = this.menu.current(); if (it) this.on.pick(it); return true; }
    if (a === 'cancel' && this.on.cancel) { this.on.cancel(); return true; }
    return false;
  }
}

export class Dialogue {
  readonly el: HTMLElement;
  private name = el('b', { class: 'slx-name' });
  private text = el('span', { class: 'slx-text' });
  private full = '';
  private timer: ReturnType<typeof setInterval> | null = null;
  private resolve: (() => void) | null = null;

  constructor(private charsPerSecond: number) {
    this.el = win('slx-talk', [this.name, this.text]);
    this.el.hidden = true;
    this.el.setAttribute('aria-live', 'polite');
  }

  busy(): boolean { return this.resolve !== null; }

  say(name: string, text: string): Promise<void> {
    this.stop();
    this.full = text;
    this.name.textContent = name;
    this.name.hidden = !name;
    this.el.hidden = false;
    if (!Number.isFinite(this.charsPerSecond)) this.text.textContent = text;
    else {
      let n = 0;
      this.text.textContent = '';
      this.timer = setInterval(() => {
        n += 1;
        this.text.textContent = [...this.full].slice(0, n).join('');
        if (n >= [...this.full].length) this.stop();
      }, 1000 / this.charsPerSecond);
    }
    return new Promise((r) => { this.resolve = r; });
  }

  onAction(a: UiAction): boolean {
    if (!this.resolve || a !== 'confirm') return false;
    if (this.timer) { this.stop(); this.text.textContent = this.full; return true; }
    const r = this.resolve;
    this.resolve = null;
    this.el.hidden = true;
    r();
    return true;
  }

  private stop(): void {
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
