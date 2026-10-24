import { el } from '../ui/dom';
import { T } from '../data/text.zh-TW';
import type { UiAction } from './input';

/** How long after a tap outside its click is still taken (a touch's click follows its pointerdown at once). */
const SWALLOW_MS = 600;

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
 * command), and on cancel (Esc), which it takes. Closed, it takes no input at all.
 */
export class MorePopover {
  readonly el = el('div', { class: 'slx-more-pop', attrs: { role: 'dialog', 'aria-label': T.ailmentAll, hidden: '' } });
  private id: string | null = null;
  private anchor: HTMLElement | null = null;
  private swallowUntil = 0;
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
    if (Date.now() >= this.swallowUntil) this.listen(false);
  }

  /** The scene's keys come here first: cancel closes an open list and is used up; any other key closes it and goes on. */
  onAction(a: UiAction): boolean {
    if (this.id === null) return false;
    this.close();
    return a === 'cancel';
  }

  /** The scene is leaving: closed, and no listener left on the document. */
  dispose(): void {
    this.swallowUntil = 0;
    this.close();
    this.el.remove();
    this.listen(false);
  }

  private onDown = (e: Event): void => {
    if (this.id === null) return;
    const t = e.target as Element | null;
    if (t && (this.el.contains(t) || t.closest?.('[aria-haspopup="dialog"]'))) return;   // inside, or a +N: its click decides
    this.swallowUntil = Date.now() + SWALLOW_MS;
    this.close();
  };

  private onClick = (e: Event): void => {
    if (Date.now() >= this.swallowUntil) { if (this.id === null) this.listen(false); return; }
    this.swallowUntil = 0;
    e.stopPropagation();
    e.preventDefault();
    if (this.id === null) this.listen(false);
  };

  private listen(on: boolean): void {
    if (on === this.listening || typeof document === 'undefined') return;
    this.listening = on;
    if (on) {
      document.addEventListener('pointerdown', this.onDown, true);
      document.addEventListener('click', this.onClick, true);
    } else {
      document.removeEventListener('pointerdown', this.onDown, true);
      document.removeEventListener('click', this.onClick, true);
    }
  }
}
