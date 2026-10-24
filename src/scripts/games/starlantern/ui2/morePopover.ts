import { el } from '../ui/dom';
import { T } from '../data/text.zh-TW';
import type { UiAction } from './input';

/**
 * A row's 「+N」 that a tap opens (touch overflow): a button for the pointer, as 返回 is (`tabindex -1`: the keys stay the
 * game's, so it never steals Enter from a menu). Its label says how many it hides; its title (hover) names them. A click
 * does nothing else: it never reaches a battle command. `withText` false: a bare target laid over a +N the picture draws.
 */
export function moreTrigger(n: number, onTap: () => void, cls = 'slx-ail slx-ail-more', withText = true): HTMLElement {
  const b = el('span', { class: cls, attrs: { role: 'button', tabindex: '-1', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': T.ailmentMoreLabel(n) } });
  if (withText) b.textContent = T.ailmentMore(n);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (b.closest('[inert]') || (e.target as Element | null)?.closest?.('.slx-more-pop')) return;   // a tap inside its own open list
    onTap();
  });
  return b;
}

/**
 * The full list behind a tapped 「+N」 (touch overflow): every word of the row, each with its icon, in a small window
 * inside its host (a member's panel, a foe's hit area), placed by the stylesheet. One at a time: another +N moves it.
 * It closes on a second tap of its +N, on a tap outside (that tap does nothing else, so closing it never picks a
 * command, however long the press was held), and on cancel (Esc), which it takes. Closed, it takes no input at all
 * but the click its closing press still owes.
 */
export class MorePopover {
  readonly el = el('div', { class: 'slx-more-pop', attrs: { role: 'dialog', 'aria-label': T.ailmentAll, hidden: '' } });
  private id: string | null = null;
  private anchor: HTMLElement | null = null;
  /** A press outside closed the list: the click that ends that press is taken (a new press, or its cancel, drops it). */
  private owed = false;
  private listening = false;

  get openId(): string | null { return this.id; }

  /** A +N's tap: open its list, or close it when it is the one open. */
  toggle(id: string, anchor: HTMLElement, host: HTMLElement, words: readonly HTMLElement[]): void {
    if (this.id === id) this.close();
    else this.show(id, anchor, host, words);
  }

  /** Open (or, already open, redraw) the list for `id`: its +N, where it stands, its words. */
  show(id: string, anchor: HTMLElement, host: HTMLElement, words: readonly HTMLElement[]): void {
    if (this.anchor && this.anchor !== anchor) this.anchor.setAttribute('aria-expanded', 'false');
    this.id = id;
    this.anchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    this.el.replaceChildren(...words);
    if (this.el.parentElement !== host) host.append(this.el);
    this.el.hidden = false;
    this.listen(true);
  }

  close(): void {
    this.anchor?.setAttribute('aria-expanded', 'false');
    this.id = null;
    this.anchor = null;
    this.el.hidden = true;
    this.el.replaceChildren();
    if (!this.owed) this.listen(false);
  }

  /** The scene's keys come here first: cancel closes an open list and is used up; any other key closes it and goes on. */
  onAction(a: UiAction): boolean {
    if (this.id === null) return false;
    this.close();
    return a === 'cancel';
  }

  /** The scene is leaving: closed, and no listener left on the document. */
  dispose(): void {
    this.owed = false;
    this.close();
    this.el.remove();
    this.listen(false);
  }

  /** A new press: whatever an earlier one owed is dropped; one outside an open list closes it and owes its click. */
  private onDown = (e: Event): void => {
    this.owed = false;
    if (this.id === null) { this.listen(false); return; }
    const t = e.target as Element | null;
    if (t && (this.el.contains(t) || t.closest?.('[aria-haspopup="dialog"]'))) return;   // inside, or a +N: its click decides
    this.owed = true;
    this.close();
  };

  /** The click that ends the closing press, however long it was held: taken, so it picks nothing. */
  private onClick = (e: Event): void => {
    if (!this.owed) return;
    this.owed = false;
    e.stopPropagation();
    e.preventDefault();
    if (this.id === null) this.listen(false);
  };

  /** A press that ends without a click (a drag, a scroll): nothing is owed. */
  private onCancel = (): void => {
    this.owed = false;
    if (this.id === null) this.listen(false);
  };

  private listen(on: boolean): void {
    if (on === this.listening || typeof document === 'undefined') return;
    this.listening = on;
    if (on) {
      document.addEventListener('pointerdown', this.onDown, true);
      document.addEventListener('click', this.onClick, true);
      document.addEventListener('pointercancel', this.onCancel, true);
    } else {
      document.removeEventListener('pointerdown', this.onDown, true);
      document.removeEventListener('click', this.onClick, true);
      document.removeEventListener('pointercancel', this.onCancel, true);
    }
  }
}
