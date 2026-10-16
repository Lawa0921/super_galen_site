import { CHARACTERS } from '../../data/characters';
import { T } from '../../data/text.zh-TW';
import { activeIds } from '../../engine/party';
import type { CharacterId } from '../../engine/types';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import type { Scene, SceneCtx } from '../scene';
import { backControl, win } from '../widgets';
import { STATUS_TABS } from './statusTabs';

/** Character sheet: a large standee on the left, tabbed pages on the right; Q/E (or the arrows) page through the members. */
export class StatusScene implements Scene {
  private id!: CharacterId;
  private tab = 0;
  /** Member whose picture is up; the entrance plays only when this changes, not on every tab switch. */
  private shownId: CharacterId | null = null;
  /** Page last drawn; a redraw of the same page keeps its scroll position, a new tab or member starts at the top. */
  private drawn: { tab: number; id: CharacterId } | null = null;
  private standee!: HTMLElement;
  private nameEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private bodyEl!: HTMLElement;

  constructor(private ctx: SceneCtx) {}

  enter(root: HTMLElement): void {
    const p = this.ctx.game.state.party;
    this.id = p.recruited.includes(this.ctx.arg as CharacterId) ? (this.ctx.arg as CharacterId) : (activeIds(p)[0] ?? p.recruited[0]);
    this.standee = el('div', { class: 'slx-status-art' });
    const arrow = (cls: string, text: string, a: UiAction) => {
      const b = el('span', { class: `slx-status-arrow ${cls}`, text, attrs: { role: 'button' } });
      b.addEventListener('click', () => this.onAction(a));
      return b;
    };
    this.nameEl = el('div', { class: 'slx-status-name' });
    this.tabsEl = el('div', { class: 'slx-tabs', attrs: { role: 'tablist' } });
    this.bodyEl = el('div', { class: 'slx-status-body', attrs: { role: 'tabpanel' } });
    root.append(el('div', { class: 'slx-scene slx-status-scene' }, [
      this.standee,
      win('slx-status-plate', [arrow('slx-status-prev', '◀', 'prev'), this.nameEl, arrow('slx-status-next', '▶', 'next')]),
      win('slx-status-panel', [this.tabsEl, this.bodyEl, el('p', { class: 'slx-hint', text: T.ui2.status.hint })]),
      backControl(() => this.onAction('cancel')),
    ]));
    this.render();
  }

  exit(): void {}

  onAction(a: UiAction): void {
    const n = STATUS_TABS.length;
    if (a !== 'prev' && a !== 'next' && a !== 'cancel' && STATUS_TABS[this.tab].onAction?.(a, this.ctx, this.id)) { this.render(); return; }
    if (a === 'left' || a === 'right') { this.tab = (this.tab + (a === 'right' ? 1 : n - 1)) % n; this.ctx.sfx.cursor(); this.render(); return; }
    if (a === 'prev' || a === 'next') { this.page(a === 'next' ? 1 : -1); return; }
    if (a === 'up' || a === 'down') { this.bodyEl.scrollTop = Math.max(0, this.bodyEl.scrollTop + (a === 'down' ? 32 : -32)); return; }
    if (a === 'cancel') { this.ctx.sfx.cancel(); this.ctx.go(this.ctx.from ?? 'guild'); }
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
    const src = this.ctx.art.has(art.standee(this.id)) ? art.standee(this.id) : this.ctx.art.has(art.portrait(this.id, 'normal')) ? art.portrait(this.id, 'normal') : null;
    this.standee.className = `slx-status-art slx-aura-${this.id}`;
    this.standee.replaceChildren(
      el('div', { class: 'slx-status-rays' }),
      el('div', { class: 'slx-status-glow' }),
      ...(src ? [el('img', { class: 'slx-status-standee', attrs: { src, alt: CHARACTERS[this.id].name } })] : []),
      ...[0, 1, 2, 3, 4, 5].map((i) => el('span', { class: `slx-mote slx-mote-${i}`, attrs: { 'aria-hidden': 'true' } })),
    );
  }

  private render(): void {
    const def = CHARACTERS[this.id];
    const m = this.ctx.game.state.party.roster[this.id];
    if (this.shownId !== this.id) this.drawStandee();
    this.nameEl.replaceChildren(el('span', { class: 'slx-status-title', text: def.title }), el('b', { text: def.name }), el('span', { text: `Lv ${m.level}` }));
    this.tabsEl.replaceChildren(...STATUS_TABS.map((t, i) => {
      const b = el('span', { class: i === this.tab ? 'slx-tab slx-tab-sel' : 'slx-tab', text: t.label, attrs: { role: 'tab', 'data-tab': t.id, 'aria-selected': String(i === this.tab) } });
      b.addEventListener('click', () => { this.tab = i; this.ctx.sfx.cursor(); this.render(); });
      return b;
    }));
    const tab = STATUS_TABS[this.tab];
    const same = this.drawn?.tab === this.tab && this.drawn.id === this.id;
    const top = this.bodyEl.scrollTop;
    this.bodyEl.replaceChildren(tab.render(this.ctx, this.id, () => this.render()));
    this.bodyEl.scrollTop = same ? top : 0;
    this.drawn = { tab: this.tab, id: this.id };
    tab.shown?.(this.bodyEl);
  }
}
