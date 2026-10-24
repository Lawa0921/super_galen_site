import { el } from '../ui/dom';
import type { UiAction } from './input';
import type { ArtIndex } from '../render/textures';
import { artMissing, artSrc, awaitArt, bestLanded, type ArtRef } from './lateArt';
import { Menu, type MenuItem } from './menu';
import { marksEl, runeCell } from './runeArt';

/**
 * A line with coloured parts: plain text, or `{ text, cls }` drawn in a span of that class (a rarity colour, say). A part
 * with an `icon` (a piece's published gear art) shows it just before its span, from the part's first typed character; a
 * late icon (ui2/lateArt) once it has landed.
 */
export type RichPart = string | { text: string; cls: string; icon?: ArtRef };
export type Rich = RichPart[];

const partText = (p: RichPart): string => (typeof p === 'string' ? p : p.text);
export const richText = (r: string | Rich): string => (typeof r === 'string' ? r : r.map(partText).join(''));

/**
 * The first `n` characters of a rich line as nodes; each coloured part keeps its span while it types out. The url of each
 * shown part's late icon that has not landed yet goes into `missing`.
 */
export function richNodes(r: Rich, n = Infinity, missing: string[] = []): Node[] {
  const out: Node[] = [];
  let left = n;
  for (const p of r) {
    if (left <= 0) break;
    const chars = [...partText(p)];
    const shown = chars.slice(0, left).join('');
    left -= chars.length;
    if (typeof p === 'string') out.push(document.createTextNode(shown));
    else {
      const src = artSrc(p.icon);
      if (src && shown) out.push(el('img', { class: 'slx-ico slx-gear-ico', attrs: { src, alt: '' } }));
      const late = shown ? artMissing(p.icon) : undefined;
      if (late) missing.push(late);
      out.push(el('span', { class: p.cls, text: shown }));
    }
  }
  return out;
}

/** Fills `target` with the first `n` characters of a rich line; a late icon not here yet is drawn in when it lands. */
export function richInto(target: HTMLElement, r: Rich, n = Infinity): void {
  const missing: string[] = [];
  target.replaceChildren(...richNodes(r, n, missing));
  awaitArt(target, 'rich', missing, () => richInto(target, r, n));
}

export function win(cls: string, children: Node[] = []): HTMLElement {
  return el('div', { class: `slx-win ${cls}` }, children);
}

/**
 * Rows on screen for a list of gear with its 26px icons (shop goods, forge pieces, set crafting): a taller row than a text
 * row, so fewer fit in the same window (plan 5d Task 10; 8 x 26px rows, the ▲/▼ cues and the frame stay inside the
 * forge list's 260px and the screen).
 */
export const GEAR_ROWS = 8;

/** Wheel travel, in pixels, that scrolls a list by one row: about one mouse-wheel notch. */
const WHEEL_STEP = 100;
/** Pixels per wheel unit by deltaMode: pixels, lines (three lines make a notch), pages (one row each). */
const WHEEL_UNIT = [1, WHEEL_STEP / 3, WHEEL_STEP];

export class MenuView {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private top = 0;
  /** Wheel travel gathered toward the next row, so a trackpad's many small deltas move one row per notch-sized sum. */
  private wheelAcc = 0;

  /**
   * `rows` limits how many options are on screen; the window scrolls to keep the cursor visible. With `cuesInRows` the
   * ▲ and ▼ cues each take one of those rows (a cue is no taller than a row), so a window sized for `rows` rows holds the
   * rows and their cues at any scroll (the skill workshop, review 2026-10-24); without it the cues come on top of `rows`.
   */
  constructor(readonly menu: Menu, private on: { pick(item: MenuItem): void; moved?(): void; cancel?(): void }, private rows = Infinity,
    private opts: { cuesInRows?: boolean } = {}) {
    this.list = el('ul', { class: 'slx-menu', attrs: { role: 'listbox' } });
    this.el = this.list;
    // Mouse and touch reach every row of a long list: the wheel scrolls it, and the ▲/▼ markers are clickable.
    this.list.addEventListener('wheel', (e) => {
      if (this.locked() || !e.deltaY) return;
      const d = e.deltaY > 0 ? 1 : -1;
      // At an edge (or with nothing to scroll) the wheel is left alone, so the page can have it.
      if (!this.canScroll(d)) { this.wheelAcc = 0; return; }
      e.preventDefault();
      if (Math.sign(this.wheelAcc) === -d) this.wheelAcc = 0;   // turning back drops what had gathered
      this.wheelAcc += e.deltaY * (WHEEL_UNIT[e.deltaMode] ?? 1);
      while (Math.abs(this.wheelAcc) >= WHEEL_STEP && this.canScroll(d)) {
        this.wheelAcc -= d * WHEEL_STEP;
        this.scrollBy(d);
      }
    }, { passive: false });
    this.render();
  }

  /** How many options show from `top`: `rows`, less a row for each cue shown when the cues take rows. */
  private span(top: number): number {
    const n = this.menu.items.length;
    if (!this.opts.cuesInRows || n <= this.rows) return Math.min(this.rows, n - top);
    const k = this.rows - (top > 0 ? 1 : 0);
    return top + k >= n ? n - top : k - 1;
  }

  /** The last top the window can scroll to. */
  private maxTop(): number {
    const n = this.menu.items.length;
    if (n <= this.rows) return 0;
    return this.opts.cuesInRows ? n - (this.rows - 1) : n - this.rows;
  }

  /** Whether the visible window can move by `d` rows. */
  private canScroll(d: 1 | -1): boolean {
    return this.rows < this.menu.items.length && (d < 0 ? this.top > 0 : this.top < this.maxTop());
  }

  /** Move the visible window by `d` rows; the cursor follows into view when it would fall outside. */
  scrollBy(d: 1 | -1): void {
    const top = Math.max(0, Math.min(this.maxTop(), this.top + d));
    if (top === this.top) return;
    this.top = top;
    const c = this.menu.cursor;
    if (c < top || c >= top + this.span(top)) {
      const visible = [...Array(this.span(top)).keys()].map((k) => top + k);
      const next = (c < top ? visible : visible.reverse()).find((i) => !this.menu.items[i].disabled);
      if (next !== undefined && this.menu.setCursor(next)) this.on.moved?.();
    }
    this.render();
  }

  render(): void {
    const n = this.menu.items.length;
    const c = Math.max(0, this.menu.cursor);
    if (c < this.top) this.top = c;
    // The first top that shows the cursor (with cues in the rows a lower top shows fewer rows, so step down to it).
    while (c >= this.top + this.span(this.top) && this.top < this.maxTop()) this.top++;
    this.top = Math.max(0, Math.min(this.top, this.maxTop()));
    const end = this.top + this.span(this.top);
    const marker = (cls: string, text: string, d: 1 | -1) => {
      const li = el('li', { class: `slx-more ${cls}`, text, attrs: { 'aria-hidden': 'true' } });
      li.addEventListener('click', () => { if (!this.locked()) this.scrollBy(d); });
      return li;
    };
    // A row's late icon that has not landed is left out; the list draws itself again when it lands (ui2/lateArt).
    const missing: string[] = [];
    const rows = this.menu.items.slice(this.top, end).map((item, k) => {
      const i = this.top + k;
      const icon = artSrc(item.icon);
      const late = artMissing(item.icon);
      if (late) missing.push(late);
      const li = el('li', { class: i === this.menu.cursor ? 'slx-opt slx-sel' : 'slx-opt', attrs: {
        role: 'option', 'aria-selected': String(i === this.menu.cursor), 'aria-disabled': String(!!item.disabled), 'data-id': item.id,
      } }, [
        ...(icon ? [el('img', { class: item.iconCls ? `slx-ico ${item.iconCls}` : 'slx-ico', attrs: { src: icon, alt: '' } })] : []),
        // Its label beside it names the rune and its tier, so the cell's icon is decorative (alt "").
        ...(item.rune ? [runeCell(item.rune, false, true)] : []),
        el('span', { class: item.cls ? `slx-label ${item.cls}` : 'slx-label', text: item.label }),
        ...(item.tail ? [el('span', { class: item.cls ? `slx-label-tail ${item.cls}` : 'slx-label-tail', text: item.tail })] : []),
        ...(item.marks?.length ? [marksEl(item.marks, 14, 'slx-badge slx-rune-marks')] : []),
        ...(item.right !== undefined ? [el('span', { class: item.rightClass ? `slx-right ${item.rightClass}` : 'slx-right', text: item.right })]
          : item.rightMarks?.length ? [marksEl(item.rightMarks, 14, 'slx-right slx-rune-marks')] : []),
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
    this.list.replaceChildren(...(this.top > 0 ? [marker('slx-more-up', '▲', -1)] : []), ...rows, ...(end < n ? [marker('slx-more-down', '▼', 1)] : []));
    awaitArt(this.list, 'rows', missing, () => this.render());
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
  private full: Rich = [];
  private face: HTMLImageElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private resolve: (() => void) | null = null;
  /** A scene is playing (staging S4): a confirmed line leaves the box and its face up until the next line or `close()`. */
  private held = false;

  /** `onClose` runs synchronously when a line is dismissed, so owners can unlock their windows before the next click. */
  constructor(private charsPerSecond: number, private onClose?: () => void) {
    this.el = win('slx-talk', [this.name, this.text, this.next]);
    this.el.hidden = true;
    this.el.setAttribute('aria-live', 'polite');
    // Mouse and touch: a click anywhere on the box does what the confirm key does.
    this.el.addEventListener('click', () => { if (!this.el.closest('[inert]')) this.onAction('confirm'); });
  }

  busy(): boolean { return this.resolve !== null; }

  /**
   * `memory` dims the box for a remembered line; `plain` is the everyday look. Memory also fades a sepia veil in over the
   * screen behind the box (staging S5), and plain fades it out: the veil is the box's sibling, made the first time it is
   * needed in a scene, so whatever screen plays the memory (the labyrinth, a battle's result, the town) goes back in time.
   */
  setStyle(style: 'plain' | 'memory'): void {
    this.el.classList.toggle('slx-talk--memory', style === 'memory');
    this.veil('slx-veil-past', style === 'memory');
  }

  /**
   * Where the scene is (staging S6): a one-line card in the screen's top corner (where the town's place plate stands, put
   * away while a scene plays), and with `night` a veil that dims the screen. `null` takes both down.
   */
  setPlace(place: { text: string; night?: true } | null): void {
    const parent = this.el.parentElement;
    let card = this.card();
    if (!place) card?.remove();
    else if (parent) {
      if (!card) parent.insertBefore((card = win('slx-place-card', [])), this.el);
      card.textContent = place.text;
    }
    this.veil('slx-veil-night', !!place?.night);
  }

  /** The place card on the box's screen, if one is up. */
  private card(): HTMLElement | null {
    return this.el.parentElement?.querySelector<HTMLElement>(':scope > .slx-place-card') ?? null;
  }

  /** The veil `cls` just under the box (and under the place card), on or off; none is made only to be off, nor while the box has no screen. */
  private veil(cls: string, on: boolean): void {
    const parent = this.el.parentElement;
    let v = parent?.querySelector<HTMLElement>(`:scope > .${cls}`) ?? null;
    if (!v && on && parent) {
      v = el('div', { class: `slx-veil ${cls}`, attrs: { 'aria-hidden': 'true' } });
      parent.insertBefore(v, this.card() ?? this.el);
      void v.offsetWidth;   // the off state first, so the fade in runs
    }
    v?.classList.toggle('slx-on', on);
  }

  /**
   * While held (a scene playing, staging S4) the box stays up between lines: confirming a line keeps it and its face on
   * screen for the next one, so nothing blinks out. Unhold, then `close()`, when the scene is over.
   */
  hold(on: boolean): void {
    this.held = on;
    // A scene starts with no face of its own: one left on the box from before it (a labyrinth line) is not kept by its
    // first narration line (staging review 2).
    if (on) { this.face?.remove(); this.face = null; this.dropFaceWait(); }
  }

  /** Puts the box and its face away, unless a line is still waiting to be read. */
  close(): void {
    if (this.resolve) return;
    this.el.hidden = true;
    this.face?.remove();
    this.face = null;
    this.dropFaceWait();
  }

  /** A face the line put away waited for is not drawn later (`faceLater`). */
  private dropFaceWait(): void {
    awaitArt(this.el, 'face', [], () => {});
  }

  /**
   * `face` puts a portrait on the box's left or right edge for this line; a line without one shows no image. `'keep'` (a
   * narration line in a scene, staging S4) keeps the face already up, dimmed, so the speaker stays in the picture.
   */
  say(name: string, text: string | Rich, face?: { src: string; side: 'left' | 'right' } | 'keep'): Promise<void> {
    this.stop();
    this.dropFaceWait();   // a face the last line waited for is not this line's
    if (face === 'keep') this.face?.classList.add('slx-talk-face--dim');
    else {
      this.face?.remove();
      this.face = null;
    }
    if (face && face !== 'keep') {
      this.face = el('img', { class: `slx-talk-face slx-talk-face--${face.side}`, attrs: { src: face.src, alt: '', draggable: 'false' } });
      this.el.prepend(this.face);
    }
    // A newer line replaces the old one: settle the old promise so nothing awaits it forever.
    const old = this.resolve;
    this.resolve = null;
    old?.();
    this.full = typeof text === 'string' ? [text] : text;
    this.name.textContent = name;
    this.name.hidden = !name;
    this.el.hidden = false;
    this.next.setAttribute('hidden', '');
    if (!Number.isFinite(this.charsPerSecond)) this.complete();
    else {
      let n = 0;
      richInto(this.text, this.full, 0);
      this.el.setAttribute('aria-busy', 'true');
      this.timer = setInterval(() => {
        n += 1;
        richInto(this.text, this.full, n);
        if (n >= [...richText(this.full)].length) this.complete();
      }, 1000 / this.charsPerSecond);
    }
    return new Promise((r) => { this.resolve = r; });
  }

  /**
   * The line on screen takes the best of `faces` (best first) that lands while it is up (ui2/lateArt): a face that had not
   * loaded when the line was said, or a better one than it shows. The next line drops the wait.
   */
  faceLater(faces: readonly string[], side: 'left' | 'right', idx: ArtIndex): void {
    awaitArt(this.el, 'face', bestLanded(idx, faces).better, () => {
      const src = bestLanded(idx, faces).src;
      if (src && this.face) { this.face.setAttribute('src', src); this.face.classList.remove('slx-talk-face--dim'); }
      else if (src) this.el.prepend((this.face = el('img', { class: `slx-talk-face slx-talk-face--${side}`, attrs: { src, alt: '', draggable: 'false' } })));
      this.faceLater(faces, side, idx);
    });
  }

  onAction(a: UiAction): boolean {
    if (!this.resolve || a !== 'confirm') return false;
    if (this.timer) { this.complete(); return true; }
    const r = this.resolve;
    this.resolve = null;
    if (!this.held) {
      this.el.hidden = true;
      this.face?.remove();
      this.face = null;
      this.dropFaceWait();
    }
    this.onClose?.();
    r();
    return true;
  }

  /** Whole line on screen: the ▼ mark shows and screen readers (aria-busy off) read it once. */
  private complete(): void {
    this.stop();
    richInto(this.text, this.full);
    this.next.removeAttribute('hidden');
    this.el.setAttribute('aria-busy', 'false');
  }

  /** Stops typing; owners call it on exit so no timer outlives the scene. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export function confirmBox(question: string | Rich, on: (yes: boolean) => void): { el: HTMLElement; view: MenuView } {
  const view = new MenuView(new Menu([{ id: 'yes', label: '是' }, { id: 'no', label: '否' }]), {
    pick: (it) => on(it.id === 'yes'),
    cancel: () => on(false),
  });
  const q = el('p', typeof question === 'string' ? { text: question } : {});
  if (typeof question !== 'string') richInto(q, question);
  return { el: win('slx-confirm', [q, view.el]), view };
}

export class QtyView {
  readonly el: HTMLElement;
  qty = 1;
  private label = el('span', { class: 'slx-qty-n' });
  private total = el('span', { class: 'slx-qty-total' });

  /** With a unit price the window also shows the total; `note` is one more line under the count (plan 8f: 「袋子 m」). */
  constructor(private max: number, private on: { change(qty: number): void; done(qty: number): void; cancel(): void }, private price?: number, note?: string) {
    const down = el('span', { class: 'slx-qty-down', text: '←' });
    const up = el('span', { class: 'slx-qty-up', text: '→' });
    const row = el('div', { class: 'slx-qty-row' }, [down, this.label, up, ...(price !== undefined ? [this.total] : [])]);
    this.el = win('slx-qty', [row, ...(note ? [el('p', { class: 'slx-qty-note', text: note })] : []), el('p', { class: 'slx-hint', text: '←→ ±1\n↑↓ ±10\n點數字 決定' })]);
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
