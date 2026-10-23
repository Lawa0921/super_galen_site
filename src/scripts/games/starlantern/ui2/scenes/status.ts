import { CHARACTERS, titleOf } from '../../data/characters';
import { artIdOf } from '../../ui/art';
import { T } from '../../data/text.zh-TW';
import { activeIds } from '../../engine/party';
import type { CharacterId } from '../../engine/types';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import type { Scene, SceneCtx } from '../scene';
import { backControl, win } from '../widgets';
import { STATUS_TABS, cueFrame, updateCues } from './statusTabs';

/** The pages that take the sheet's whole width, the standee hidden: their columns need it at 12px (legibility ruling 6). */
export const WIDE_TABS: ReadonlySet<string> = new Set(['tree', 'talent']);

/** Character sheet: a large standee on the left, tabbed pages on the right; Q/E (or the arrows) page through the members. */
export class StatusScene implements Scene {
  private id!: CharacterId;
  private tab = 0;
  /** Member whose picture is up; the entrance plays only when this changes, not on every tab switch. */
  private shownId: CharacterId | null = null;
  /** Page last drawn; a redraw of the same page keeps its scroll position, a new tab or member starts at the top. */
  private drawn: { tab: number; id: CharacterId } | null = null;
  /** Set on exit: a stale redraw (a click on a node of the closed sheet) does nothing. */
  private closed = false;
  private hintEl!: HTMLElement;
  private standee!: HTMLElement;
  private nameEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private sceneEl!: HTMLElement;

  constructor(private ctx: SceneCtx) {}

  enter(root: HTMLElement): void {
    const p = this.ctx.game.state.party;
    const arg = this.ctx.arg ?? '';
    // `tab:<id>` (the guild's skill-tree and talent entries) or `tab:<id>:<member>` (back from the workshop, plan 8g).
    const [, tabId, who] = arg.startsWith('tab:') ? arg.split(':') : ['', '', arg];
    this.id = p.recruited.includes(who as CharacterId) ? (who as CharacterId) : (p.recruited.includes('hero') ? 'hero' : (activeIds(p)[0] ?? p.recruited[0]));
    // Open that page, with its kept cursor brought into view.
    const want = tabId ? STATUS_TABS.findIndex((t) => t.id === tabId) : -1;
    if (want >= 0) { this.tab = want; STATUS_TABS[want].reveal?.(); }
    this.standee = el('div', { class: 'slx-status-art' });
    const arrow = (cls: string, text: string, a: UiAction) => {
      const b = el('span', { class: `slx-status-arrow ${cls}`, text, attrs: { role: 'button' } });
      b.addEventListener('click', () => this.onAction(a));
      return b;
    };
    this.nameEl = el('div', { class: 'slx-status-name' });
    this.tabsEl = el('div', { class: 'slx-tabs', attrs: { role: 'tablist' } });
    this.bodyEl = el('div', { class: 'slx-status-body', attrs: { role: 'tabpanel' } });
    this.hintEl = el('p', { class: 'slx-hint' });
    root.append(this.sceneEl = el('div', { class: 'slx-scene slx-status-scene' }, [
      this.standee,
      win('slx-status-plate', [arrow('slx-status-prev', '←', 'prev'), this.nameEl, arrow('slx-status-next', '→', 'next')]),
      // The page pages with ▲/▼ cues, never a native scrollbar; the sheet keeps its place itself (render), so `keep` is idle.
      win('slx-status-panel', [this.tabsEl, cueFrame('slx-status-frame', this.bodyEl, () => {}), this.hintEl]),
      backControl(() => this.onAction('cancel')),
    ]));
    this.render();
  }

  exit(): void {
    this.closed = true;
    if (this.drawn) STATUS_TABS[this.drawn.tab].leave?.();
  }

  onAction(a: UiAction): void {
    const n = STATUS_TABS.length;
    if (a !== 'prev' && a !== 'next' && a !== 'cancel' && STATUS_TABS[this.tab].onAction?.(a, this.ctx, this.id)) { this.render(); return; }
    if (a === 'left' || a === 'right') { this.tab = (this.tab + (a === 'right' ? 1 : n - 1)) % n; this.ctx.sfx.cursor(); this.render(); return; }
    if (a === 'prev' || a === 'next') { this.page(a === 'next' ? 1 : -1); return; }
    if (a === 'up' || a === 'down') {
      this.bodyEl.scrollTop = Math.max(0, this.bodyEl.scrollTop + (a === 'down' ? 32 : -32));
      updateCues(this.bodyEl);
      return;
    }
    // Back from the workshop (or the suggested builds) the sheet does not return to it: to the labyrinth or the guild, whichever opened them.
    if (a === 'cancel') {
      this.ctx.sfx.cancel();
      const g = this.ctx.game;
      const from = this.ctx.from === 'workshop' || this.ctx.from === 'builds' ? (g.phase === 'map' && !!g.run ? 'dungeon' : 'guild') : this.ctx.from;
      this.ctx.go(from ?? 'guild');
    }
  }

  private page(d: 1 | -1): void {
    const list = this.ctx.game.state.party.recruited;
    this.id = list[(list.indexOf(this.id) + d + list.length) % list.length];
    this.ctx.sfx.cursor();
    this.render();
  }

  /** Light rays and an aura in the member's colour behind the standee, rising motes in front; CSS animates them. */
  private drawStandee(): void {
    this.shownId = this.id;
    const face = artIdOf(this.ctx.game.state.party.roster[this.id]);
    const src = this.ctx.art.has(art.standee(face)) ? art.standee(face) : this.ctx.art.has(art.portrait(face, 'normal')) ? art.portrait(face, 'normal') : null;
    this.standee.className = `slx-status-art slx-aura-${this.id}`;
    this.standee.replaceChildren(
      el('div', { class: 'slx-status-rays' }),
      el('div', { class: 'slx-status-glow' }),
      ...(src ? [el('img', { class: 'slx-status-standee', attrs: { src, alt: CHARACTERS[this.id].name } })] : []),
      ...[0, 1, 2, 3, 4, 5].map((i) => el('span', { class: `slx-mote slx-mote-${i}`, attrs: { 'aria-hidden': 'true' } })),
    );
  }

  private render(): void {
    if (this.closed) return;
    const def = CHARACTERS[this.id];
    const m = this.ctx.game.state.party.roster[this.id];
    if (this.shownId !== this.id) this.drawStandee();
    this.nameEl.replaceChildren(el('span', { class: 'slx-status-title', text: titleOf(m) }), el('b', { text: def.name }), el('span', { text: `Lv ${m.level}` }));
    this.tabsEl.replaceChildren(...STATUS_TABS.map((t, i) => {
      const b = el('span', { class: i === this.tab ? 'slx-tab slx-tab-sel' : 'slx-tab', text: t.label, attrs: { role: 'tab', 'data-tab': t.id, 'aria-selected': String(i === this.tab) } });
      b.addEventListener('click', () => { this.tab = i; this.ctx.sfx.cursor(); this.render(); });
      return b;
    }));
    const tab = STATUS_TABS[this.tab];
    this.sceneEl.classList.toggle('slx-status-wide', WIDE_TABS.has(tab.id));
    const same = this.drawn?.tab === this.tab && this.drawn.id === this.id;
    if (this.drawn && !same) STATUS_TABS[this.drawn.tab]?.leave?.();
    const top = this.bodyEl.scrollTop;
    this.hintEl.textContent = tab.hint ?? T.ui2.status.hint;
    this.bodyEl.replaceChildren(tab.render(this.ctx, this.id, (change) => {
      if (this.closed) return;
      change?.();
      this.render();
    }));
    this.bodyEl.scrollTop = same ? top : 0;
    this.drawn = { tab: this.tab, id: this.id };
    tab.shown?.(this.bodyEl);
    updateCues(this.bodyEl);
  }
}
