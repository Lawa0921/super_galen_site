import { CHARACTERS } from '../../data/characters';
import { EQUIPMENT } from '../../data/equipment';
import { T } from '../../data/text.zh-TW';
import { activeIds, statsOf } from '../../engine/party';
import { equip, unequip } from '../../engine/town';
import type { CharacterId, Slot } from '../../engine/types';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu, type MenuItem } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { MenuView, backControl, win } from '../widgets';
import { SLOT_ORDER, STAT_ORDER, bonusText } from './statusTabs';

/** Equipment: the member's three slots on the left, what the chosen slot can take on the right, and a before/after comparison below. */
export class EquipScene implements Scene {
  private id!: CharacterId;
  private focus: 'slots' | 'items' = 'slots';
  private slotCursor = 0;
  private slotsView!: MenuView;
  private itemsView: MenuView | null = null;
  private head!: HTMLElement;
  private slotsWin!: HTMLElement;
  private itemsWin!: HTMLElement;
  private compare!: HTMLElement;

  constructor(private ctx: SceneCtx) {}

  enter(root: HTMLElement): void {
    const p = this.ctx.game.state.party;
    this.id = p.recruited.includes(this.ctx.arg as CharacterId) ? (this.ctx.arg as CharacterId) : (activeIds(p)[0] ?? p.recruited[0]);
    this.head = win('slx-equip-head');
    this.slotsWin = win('slx-equip-slots');
    this.itemsWin = win('slx-equip-items');
    this.compare = win('slx-compare');
    const bg = this.ctx.art.has(art.scene('guild')) ? [el('img', { class: 'slx-bg slx-bg-dim', attrs: { src: art.scene('guild'), alt: '' } })] : [];
    root.append(el('div', { class: 'slx-scene slx-equip-scene' }, [
      ...bg, this.head, this.slotsWin, this.itemsWin, this.compare,
      el('p', { class: 'slx-keyhint', text: T.ui2.equip.hint }), backControl(() => this.onAction('cancel')),
    ]));
    this.render();
  }

  exit(): void {}

  onAction(a: UiAction): void {
    if (a === 'prev' || a === 'next') { this.page(a === 'next' ? 1 : -1); return; }
    if (this.focus === 'items') {
      if (a === 'cancel') { this.ctx.sfx.cancel(); this.focus = 'slots'; this.render(); return; }
      this.itemsView?.onAction(a);
      return;
    }
    if (a === 'cancel') { this.ctx.sfx.cancel(); this.ctx.go(this.ctx.from ?? 'guild'); return; }
    this.slotsView.onAction(a);
  }

  private get member() { return this.ctx.game.state.party.roster[this.id]; }
  private get slot(): Slot { return SLOT_ORDER[this.slotCursor]; }

  private page(d: 1 | -1): void {
    const list = this.ctx.game.state.party.recruited;
    this.id = list[(list.indexOf(this.id) + d + list.length) % list.length];
    this.focus = 'slots';
    this.ctx.sfx.cursor();
    this.render();
  }

  /** Owned items for the slot, plus 卸下 when something is worn. */
  private candidates(): MenuItem[] {
    const inv = this.ctx.game.state.inventory;
    const items: MenuItem[] = Object.entries(inv).filter(([eid, n]) => EQUIPMENT[eid]?.slot === this.slot && n > 0)
      .map(([eid, n]) => ({ id: eid, label: EQUIPMENT[eid].name, right: `×${n}`, icon: this.ctx.art.has(art.icon(eid)) ? art.icon(eid) : undefined }));
    if (this.member.equip[this.slot]) items.push({ id: '', label: T.ui2.equip.unequip });
    return items;
  }

  private render(): void {
    const def = CHARACTERS[this.id];
    const m = this.member;
    const face = this.ctx.art.has(art.portrait(this.id, 'normal')) ? [el('img', { class: 'slx-equip-face', attrs: { src: art.portrait(this.id, 'normal'), alt: '' } })] : [];
    const arrow = (text: string, a: UiAction) => { const b = el('span', { class: 'slx-status-arrow', text, attrs: { role: 'button' } }); b.addEventListener('click', () => this.onAction(a)); return b; };
    this.head.replaceChildren(arrow('◀', 'prev'), ...face,
      el('div', { class: 'slx-equip-name' }, [el('span', { class: 'slx-status-title', text: def.title }), el('b', { text: def.name }), el('span', { text: `Lv ${m.level}` })]),
      arrow('▶', 'next'), el('span', { class: 'slx-equip-title', text: T.ui2.equip.title }));

    this.slotsView = new MenuView(new Menu(SLOT_ORDER.map((slot) => ({
      id: slot, label: T.slot[slot], right: m.equip[slot] ? EQUIPMENT[m.equip[slot]!].name : T.ui2.status.none,
    })), this.slotCursor), {
      pick: () => this.openItems(),
      moved: () => { this.slotCursor = this.slotsView.menu.cursor; this.ctx.sfx.cursor(); this.renderItems(); },
    });
    this.slotsWin.replaceChildren(this.slotsView.el);
    this.renderItems();
  }

  private renderItems(): void {
    const items = this.candidates();
    const active = this.focus === 'items';
    this.itemsView = null;
    const head = el('div', { class: 'slx-who', text: T.slot[this.slot] });
    if (!items.length) {
      this.itemsWin.replaceChildren(head, el('p', { class: 'slx-desc', text: T.ui2.equip.nothing }));
    } else {
      const v = new MenuView(new Menu(items), {
        pick: (it) => this.wear(it.id),
        moved: () => { this.ctx.sfx.cursor(); this.renderCompare(v.menu.current()?.id); },
      }, 8);
      this.itemsView = v;
      this.itemsWin.replaceChildren(head, v.el);
    }
    this.itemsWin.toggleAttribute('inert', !active);
    this.slotsWin.toggleAttribute('inert', active);
    this.renderCompare(active ? this.itemsView?.menu.current()?.id : undefined);
  }

  private openItems(): void {
    this.slotCursor = this.slotsView.menu.cursor;
    if (!this.candidates().length) { this.ctx.sfx.error(); this.renderItems(); return; }
    this.ctx.sfx.confirm();
    this.focus = 'items';
    this.renderItems();
  }

  /** Current numbers against the numbers with `eid` worn ('' = slot emptied, undefined = no change). */
  private renderCompare(eid: string | undefined): void {
    const m = this.member;
    const now = statsOf(m);
    const after = eid === undefined ? now : statsOf({ ...m, equip: { ...m.equip, [this.slot]: eid || undefined } });
    const rows = STAT_ORDER.map((k) => {
      const d = after[k] - now[k];
      return el('div', { class: `slx-cmp-row${d > 0 ? ' slx-up' : d < 0 ? ' slx-down' : ''}`, attrs: { 'data-stat': k } }, [
        el('span', { class: 'slx-cmp-label', text: T.stat[k] }),
        el('span', { class: 'slx-cmp-now', text: String(now[k]) }),
        el('span', { class: 'slx-cmp-arrow', text: d ? '→' : '' }),
        el('span', { class: 'slx-cmp-after', text: d ? `${after[k]} ${d > 0 ? '▲' : '▼'}` : '' }),
      ]);
    });
    const note = eid ? bonusText(EQUIPMENT[eid].bonus) : '';
    this.compare.replaceChildren(el('div', { class: 'slx-cmp-grid' }, rows), ...(note ? [el('p', { class: 'slx-desc', text: note })] : []));
  }

  private wear(eid: string): void {
    const s = this.ctx.game.state;
    const r = this.ctx.game.apply(eid ? equip(s, this.id, eid) : unequip(s, this.id, this.slot));
    if (!r.ok) { this.ctx.sfx.error(); return; }
    this.ctx.sfx.confirm();
    this.focus = 'slots';
    this.render();
  }
}
