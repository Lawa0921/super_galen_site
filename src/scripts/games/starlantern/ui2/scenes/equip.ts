import { CHARACTERS } from '../../data/characters';
import { T } from '../../data/text.zh-TW';
import { compareDelta, itemLines } from '../../engine/compare';
import { BAG_SIZE, type AutoJunk } from '../../engine/loot/bag';
import { itemName, itemSlot, itemWeight } from '../../engine/loot/item';
import { activeIds, defaultSlotFor, slotsFor, statsOf } from '../../engine/party';
import { equip, setAutoJunk, sortBagIn, toggleJunk, unequip, type TownResult } from '../../engine/town';
import type { AnyStat, CharacterId, ItemInstance, Slot, Stats } from '../../engine/types';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { gearLabel } from '../loot';
import { Menu, type MenuItem } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { MenuView, backControl, win } from '../widgets';
import { STAT_ORDER } from './statusTabs';

/** The paper doll, row by row: 項鍊 頭 副手 / 武器 身 手 / 戒指 1 腳 戒指 2. */
const DOLL: Slot[] = ['neck', 'head', 'offhand', 'weapon', 'body', 'hands', 'ring1', 'feet', 'ring2'];
const DOLL_COLS = 3;
const DOLL_ROWS = DOLL.length / DOLL_COLS;
const BAG_COLS = 10;
const BAG_ROWS = BAG_SIZE / BAG_COLS;
const SORTS = ['rarity', 'slot', 'ilvl'] as const;
const AUTOS: AutoJunk[] = ['off', 'common', 'magic'];

type Area = 'doll' | 'bag';

/** How far one click on the detail panel's ▲/▼ (or one R/F) scrolls it: three lines. */
const DETAIL_STEP = 36;
/** Pixels per wheel unit by deltaMode (pixels, lines, pages) for the detail panel; lists use widgets.ts's own. */
const DETAIL_WHEEL_UNIT = [1, 12, DETAIL_STEP];
/** Cells carry text only until gear art exists: the first four characters of the name. */
const short = (s: string): string => [...s].slice(0, 4).join('');
/** The enhance level as a small corner mark of its own: a 28px cell has no room for it after the name. Empty at +0. */
const enhTag = (it: ItemInstance): HTMLElement[] => (it.enhance > 0 ? [el('span', { class: 'slx-enh', text: T.enhanceTag(it.enhance) })] : []);
const fits = (it: ItemInstance, slot: Slot): boolean => slotsFor(itemSlot(it)).includes(slot);

/**
 * Equipment: the bag (10 × 6) on the left, the member's paper doll (3 × 3) in the middle, the item under the cursor
 * with its comparison on the right.
 *
 * Keys, the one place they are defined:
 * - Arrows move inside the focused area and stop at its edges, except Left from the doll's left column (to the bag,
 *   same row, rightmost cell) and Right from the bag's right column (to the doll, same row, leftmost slot).
 * - Tab (`swap`) switches area; each area keeps its cursor.
 * - Enter on a slot makes it the target and moves to the bag, where gear that does not fit it dims.
 * - Enter on bag gear wears it in the target when it fits, else where `defaultSlotFor` puts it; the target clears.
 *   Enter on an empty cell with a target takes the target's gear off into the bag.
 * - C (`menu`) opens the bag menu: sort, auto junk, mark the gear under the bag cursor.
 * - Q/E change member. Esc closes the menu, then clears the target, then leaves.
 * - R/F (`scrollUp`/`scrollDown`) scroll the item detail, which can run past its panel.
 * - A click is the cursor moving there plus Enter; hovering moves the cursor, but hovering the doll only does so while the
 *   doll has focus, so the pointer can cross it from the bag to the detail panel.
 * - On touch, a first tap on bag gear only selects it (showing the comparison); a second tap on that piece wears it.
 */
export class EquipScene implements Scene {
  private id!: CharacterId;
  private focus: Area = 'doll';
  private dollCur = DOLL.indexOf('weapon');
  private bagCur = 0;
  /** The bag cell a touch tap selected: tapping it again wears it. Any other action clears it. */
  private armed: number | null = null;
  private target: Slot | null = null;
  /** What just changed hands flashes once: the slot, and the bag cell only when a piece landed there. */
  private flash: { slot: Slot; index: number | null } | null = null;
  /** Why the last action was refused; cleared by the next action. */
  private notice = '';
  /** Member the head row was built for; it is rebuilt only when the member changes. */
  private headId: CharacterId | null = null;
  /** What each doll slot shows, so its children are rebuilt only when that changes. */
  private dollKeys: string[] = [];
  private menuView: MenuView | null = null;
  private menuWin: HTMLElement | null = null;
  private sceneEl!: HTMLElement;
  private head!: HTMLElement;
  private bagWin!: HTMLElement;
  private bagCount!: HTMLElement;
  private dollWin!: HTMLElement;
  private dollHead!: HTMLElement;
  private statsWin!: HTMLElement;
  private detail!: HTMLElement;
  /** The detail panel's scrolling content and its ▲/▼ cues (shown only while there is more that way). */
  private detailBody!: HTMLElement;
  private detailUp!: HTMLElement;
  private detailDown!: HTMLElement;
  private keyhint!: HTMLElement;
  private noticeEl!: HTMLElement;
  private dollCells: HTMLElement[] = [];
  private bagCells: HTMLElement[] = [];

  constructor(private ctx: SceneCtx) {}

  enter(root: HTMLElement): void {
    const p = this.ctx.game.state.party;
    this.id = p.recruited.includes(this.ctx.arg as CharacterId) ? (this.ctx.arg as CharacterId) : (p.recruited.includes('hero') ? 'hero' : (activeIds(p)[0] ?? p.recruited[0]));
    this.head = win('slx-equip-head');

    this.bagCells = Array.from({ length: BAG_SIZE }, (_, i) => this.cell('bag', i, el('div', { class: 'slx-bag-cell', attrs: { role: 'gridcell', 'data-index': String(i) } })));
    this.bagCount = el('span', { class: 'slx-bag-count' });
    const menuBtn = el('span', { class: 'slx-bag-menu-btn', text: T.ui2.equip.menuBtn, attrs: { role: 'button' } });
    menuBtn.addEventListener('click', () => { if (!menuBtn.closest('[inert]')) this.onAction('menu'); });
    this.bagWin = win('slx-bag', [
      el('div', { class: 'slx-area-head' }, [this.bagCount, menuBtn]),
      el('div', { class: 'slx-bag-grid', attrs: { role: 'grid' } }, this.bagCells),
    ]);

    this.dollCells = DOLL.map((slot, i) => this.cell('doll', i, el('div', { class: 'slx-doll-slot', attrs: { role: 'gridcell', 'data-slot': slot } })));
    this.dollHead = el('div', { class: 'slx-area-head' });
    this.dollWin = win('slx-doll', [this.dollHead, el('div', { class: 'slx-doll-grid', attrs: { role: 'grid' } }, this.dollCells)]);
    this.statsWin = win('slx-equip-stats');
    this.detailBody = el('div', { class: 'slx-item-detail-body' });
    const cue = (cls: string, text: string, d: 1 | -1) => {
      const c = el('span', { class: `slx-more ${cls}`, text, attrs: { 'aria-hidden': 'true', hidden: '' } });
      c.addEventListener('click', () => { if (!c.closest('[inert]')) this.scrollDetail(d * DETAIL_STEP); });
      return c;
    };
    this.detailUp = cue('slx-more-up', '▲', -1);
    this.detailDown = cue('slx-more-down', '▼', 1);
    // The wheel scrolls the panel while it can move that way; at an end (or when it fits) the page may have the wheel.
    this.detailBody.addEventListener('wheel', (e) => {
      if (this.detailBody.closest('[inert]') || !e.deltaY || !this.canScrollDetail(e.deltaY > 0 ? 1 : -1)) return;
      e.preventDefault();
      this.scrollDetail(e.deltaY * (DETAIL_WHEEL_UNIT[e.deltaMode] ?? 1));
    }, { passive: false });
    this.detailBody.addEventListener('scroll', () => this.detailCues());
    this.detail = win('slx-item-detail', [this.detailUp, this.detailBody, this.detailDown]);
    this.keyhint = el('p', { class: 'slx-keyhint' });
    this.noticeEl = el('p', { class: 'slx-equip-notice', attrs: { 'aria-live': 'polite' } });

    const bg = this.ctx.art.has(art.scene('guild')) ? [el('img', { class: 'slx-bg slx-bg-dim', attrs: { src: art.scene('guild'), alt: '' } })] : [];
    this.sceneEl = el('div', { class: 'slx-scene slx-equip-scene' }, [
      ...bg, this.head, this.bagWin, this.dollWin, this.statsWin, this.detail, this.keyhint, this.noticeEl, backControl(() => this.onAction('cancel')),
    ]);
    root.append(this.sceneEl);
    this.render();
  }

  exit(): void {}

  onAction(a: UiAction): void {
    this.notice = '';
    this.armed = null;
    if (this.menuView) {
      if (a === 'cancel' || a === 'menu') { this.ctx.sfx.cancel(); this.closeMenu(); return; }
      this.menuView.onAction(a);
      return;
    }
    switch (a) {
      case 'prev': case 'next': this.page(a === 'next' ? 1 : -1); return;
      case 'swap': this.focus = this.focus === 'doll' ? 'bag' : 'doll'; this.ctx.sfx.cursor(); this.render(); return;
      case 'menu': this.openMenu(); return;
      case 'scrollUp': case 'scrollDown': this.scrollDetail(a === 'scrollDown' ? DETAIL_STEP : -DETAIL_STEP); return;
      case 'confirm': this.pick(); return;
      case 'cancel':
        this.ctx.sfx.cancel();
        if (this.target) { this.dollCur = DOLL.indexOf(this.target); this.target = null; this.focus = 'doll'; this.render(); return; }
        this.ctx.go(this.ctx.from ?? 'guild');
        return;
      case 'up': case 'down': case 'left': case 'right': this.move(a); return;
      default:
    }
  }

  private get member() { return this.ctx.game.state.party.roster[this.id]; }
  private get bag() { return this.ctx.game.state.bag; }

  /**
   * Pointer wiring for a slot or bag cell: hover moves the cursor there (a doll slot only while the doll has focus), a
   * click is that plus Enter. A touch tap on bag gear selects it first; a second tap on that piece wears it.
   */
  private cell(area: Area, i: number, node: HTMLElement): HTMLElement {
    const go = () => {
      if (node.closest('[inert]') || (this.focus === area && this.cursorOf(area) === i)) return false;
      this.focus = area;
      if (area === 'doll') this.dollCur = i; else this.bagCur = i;
      return true;
    };
    node.addEventListener('pointermove', () => { if ((area === 'bag' || this.focus === 'doll') && go()) this.render(); });
    // Safari's click is a MouseEvent with no pointerType: the pointerdown before it says what pressed.
    let pressedBy = '';
    node.addEventListener('pointerdown', (e) => { pressedBy = e.pointerType; });
    node.addEventListener('click', (e) => {
      if (node.closest('[inert]')) return;
      const touch = ((e as PointerEvent).pointerType || pressedBy) === 'touch';
      pressedBy = '';
      this.notice = '';
      if (touch && area === 'bag' && this.bag[i] && this.armed !== i) {
        go();
        this.armed = i;
        this.ctx.sfx.cursor();
        this.render();
        return;
      }
      this.armed = null;
      // A touch tap has no hover first: go() moves the cursor, and pick() renders on every branch, refusals included.
      go();
      this.pick();
    });
    return node;
  }

  private cursorOf(area: Area): number { return area === 'doll' ? this.dollCur : this.bagCur; }

  private move(a: 'up' | 'down' | 'left' | 'right'): void {
    const [cols, rows] = this.focus === 'doll' ? [DOLL_COLS, DOLL_ROWS] : [BAG_COLS, BAG_ROWS];
    const c = this.cursorOf(this.focus);
    const r = Math.floor(c / cols), col = c % cols;
    let next = c;
    if (a === 'up' && r > 0) next = c - cols;
    if (a === 'down' && r < rows - 1) next = c + cols;
    if (a === 'left' && col > 0) next = c - 1;
    if (a === 'right' && col < cols - 1) next = c + 1;
    if (this.focus === 'doll' && a === 'left' && col === 0) {
      this.focus = 'bag';
      this.bagCur = Math.min(r, BAG_ROWS - 1) * BAG_COLS + BAG_COLS - 1;
    } else if (this.focus === 'bag' && a === 'right' && col === cols - 1) {
      this.focus = 'doll';
      this.dollCur = Math.min(r, DOLL_ROWS - 1) * DOLL_COLS;
    } else if (next === c) {
      return;                                          // an edge: stay put, no sound
    } else if (this.focus === 'doll') this.dollCur = next;
    else this.bagCur = next;
    this.ctx.sfx.cursor();
    this.render();
  }

  private page(d: 1 | -1): void {
    const list = this.ctx.game.state.party.recruited;
    this.id = list[(list.indexOf(this.id) + d + list.length) % list.length];
    this.target = null;
    this.flash = null;
    this.ctx.sfx.cursor();
    this.render();
  }

  private pick(): void {
    if (this.focus === 'doll') {
      this.target = DOLL[this.dollCur];
      this.focus = 'bag';
      this.ctx.sfx.confirm();
      this.render();
      return;
    }
    const it = this.bag[this.bagCur];
    const s = this.ctx.game.state;
    if (!it) {
      const t = this.target;
      if (!t || !this.member.equip[t]) { this.refuse(''); return; }
      this.takeOff(t);
      return;
    }
    const slot = this.slotFor(it);
    this.done(equip(s, this.id, it.uid, slot), slot, this.member.equip[slot] ? this.bagCur : null);
  }

  /** Puts the gear in `slot` into the bag; a full bag refuses and says so. */
  private takeOff(slot: Slot): void {
    this.done(unequip(this.ctx.game.state, this.id, slot), slot, this.bag.length);
  }

  /** The error cue, the reason (if any) under the hint, and a render so a tap's cursor move shows. */
  private refuse(reason: string): void {
    this.ctx.sfx.error();
    this.notice = reason;
    this.render();
  }

  /** Where bag gear goes: the target when it fits there, else its default slot. */
  private slotFor(it: ItemInstance): Slot {
    return this.target && fits(it, this.target) ? this.target : defaultSlotFor(this.member, it);
  }

  private done(r: TownResult, slot: Slot, index: number | null): void {
    const res = this.ctx.game.apply(r);
    if (!res.ok) { this.refuse(res.reason === 'full' ? T.ui2.equip.full : T.reasons[res.reason] ?? ''); return; }
    this.ctx.sfx.confirm();
    this.target = null;
    this.flash = null;
    this.render();
    void this.sceneEl.offsetWidth;                     // restart the flash even on the same cells
    this.flash = { slot, index };
    this.render();
  }

  private openMenu(): void {
    const t = T.ui2.equip.menu;
    const auto = this.ctx.game.state.autoJunk;
    // The menu acts on the piece the detail shows: bag gear can be marked; worn gear can be taken off, not marked.
    // In the bag with a target set, 卸下 offers the target's piece (the route the full-bag hint names).
    const wornSlot = this.focus === 'doll' ? DOLL[this.dollCur] : null;
    const offSlot = wornSlot ?? this.target;
    const worn = offSlot ? this.member.equip[offSlot] : undefined;
    const it = wornSlot ? undefined : this.bag[this.bagCur];
    const shown = wornSlot ? this.member.equip[wornSlot] : undefined;
    const junk: MenuItem = shown ? { id: 'junk', label: t.wornNoMark(gearLabel(shown)), disabled: true }
      : { id: 'junk', label: !it ? t.markNone : it.junk ? t.unmark(gearLabel(it)) : t.mark(gearLabel(it)), disabled: !it };
    const items: MenuItem[] = [
      ...SORTS.map((k) => ({ id: `sort-${k}`, label: t.sort[k] })),
      ...AUTOS.map((k) => ({ id: `auto-${k}`, label: t.auto[k], right: k === auto ? t.current : '' })),
      junk,
      ...(worn ? [{ id: 'unequip', label: t.unequip(gearLabel(worn)) }] : []),
    ];
    this.menuView = new MenuView(new Menu(items), { pick: (m) => this.menuPick(m.id), moved: () => this.ctx.sfx.cursor() });
    this.menuWin = win('slx-bag-menu', [el('div', { class: 'slx-who', text: t.title }), this.menuView.el]);
    this.sceneEl.append(this.menuWin);
    this.ctx.sfx.confirm();
    this.render();
  }

  private closeMenu(): void {
    this.menuWin?.remove();
    this.menuWin = null;
    this.menuView = null;
    this.render();
  }

  private menuPick(id: string): void {
    const s = this.ctx.game.state;
    const [kind, arg] = id.split('-') as [string, string];
    if (kind === 'unequip') {
      const slot = this.focus === 'doll' ? DOLL[this.dollCur] : this.target;
      this.closeMenu();
      if (slot) this.takeOff(slot);
      return;
    }
    const it = this.focus === 'bag' ? this.bag[this.bagCur] : undefined;
    const r = kind === 'sort' ? sortBagIn(s, arg as (typeof SORTS)[number])
      : kind === 'auto' ? setAutoJunk(s, arg as AutoJunk)
        : it ? toggleJunk(s, it.uid) : null;
    if (!r || !this.ctx.game.apply(r).ok) { this.refuse(''); return; }
    this.ctx.sfx.confirm();
    this.flash = null;
    this.closeMenu();
  }

  private render(): void {
    const m = this.member;
    const menuOpen = !!this.menuView;
    this.sceneEl.dataset.focus = this.focus;
    for (const w of [this.bagWin, this.dollWin, this.statsWin, this.detail]) w.toggleAttribute('inert', menuOpen);
    this.bagWin.classList.toggle('slx-area-on', this.focus === 'bag');
    this.dollWin.classList.toggle('slx-area-on', this.focus === 'doll');
    if (this.headId !== this.id) this.renderHead();
    this.noticeEl.textContent = this.notice;

    this.bagCount.textContent = T.ui2.equip.bag(this.bag.length, BAG_SIZE);
    this.bagCells.forEach((c, i) => {
      const it = this.bag[i];
      const cls = ['slx-bag-cell'];
      if (it) cls.push(`slx-rarity-${it.rarity}`);
      if (it?.junk) cls.push('slx-junk');
      if (it && this.target && !fits(it, this.target)) cls.push('slx-unfit');
      if (i === this.bagCur) cls.push('slx-cur');
      if (this.flash?.index === i) cls.push('slx-flash');
      c.className = cls.join(' ');
      c.replaceChildren(...(it ? [short(itemName(it)), ...enhTag(it)] : []));
      c.setAttribute('aria-label', it ? gearLabel(it) : T.ui2.equip.emptyCell);
      c.setAttribute('aria-selected', String(i === this.bagCur));
    });

    this.dollHead.textContent = this.target ? T.ui2.equip.target(T.slot[this.target]) : T.ui2.equip.dollTitle;
    this.dollHead.classList.toggle('slx-area-target', !!this.target);
    this.dollCells.forEach((c, i) => {
      const slot = DOLL[i];
      const it = m.equip[slot];
      const cls = ['slx-doll-slot', it ? `slx-rarity-${it.rarity}` : 'slx-slot-empty'];
      if (slot === this.target) cls.push('slx-doll-target');
      if (i === this.dollCur) cls.push('slx-cur');
      if (this.flash?.slot === slot) cls.push('slx-flash');
      c.className = cls.join(' ');
      // A filled slot keeps a small slot label over the name: position alone does not say which slot is which.
      const key = it ? `${slot}|${itemName(it)}|${it.enhance}` : slot;
      if (this.dollKeys[i] !== key) {
        this.dollKeys[i] = key;
        if (it) c.replaceChildren(el('span', { class: 'slx-slot-tag', text: T.slot[slot] }), el('span', { class: 'slx-slot-name', text: short(itemName(it)) }), ...enhTag(it));
        else c.textContent = T.slot[slot];
      }
      c.setAttribute('aria-label', it ? T.ui2.equip.worn(T.slot[slot], gearLabel(it)) : T.slot[slot]);
      c.setAttribute('aria-selected', String(i === this.dollCur));
    });

    // A full bag has no empty cell to pick, so the target hint names the menu route instead.
    this.keyhint.textContent = !this.target ? T.ui2.equip.hint : this.bag.length >= BAG_SIZE ? T.ui2.equip.hintTargetFull : T.ui2.equip.hintTarget;
    this.renderDetail();
  }

  private renderHead(): void {
    this.headId = this.id;
    const def = CHARACTERS[this.id];
    const m = this.member;
    const face = this.ctx.art.has(art.portrait(this.id, 'normal')) ? [el('img', { class: 'slx-equip-face', attrs: { src: art.portrait(this.id, 'normal'), alt: '' } })] : [];
    const arrow = (text: string, a: UiAction) => { const b = el('span', { class: 'slx-status-arrow', text, attrs: { role: 'button' } }); b.addEventListener('click', () => this.onAction(a)); return b; };
    this.head.replaceChildren(arrow('◀', 'prev'), ...face,
      el('div', { class: 'slx-equip-name' }, [el('span', { class: 'slx-status-title', text: def.title }), el('b', { text: def.name }), el('span', { text: `Lv ${m.level}` })]),
      arrow('▶', 'next'), el('span', { class: 'slx-equip-title', text: T.ui2.equip.title }));
  }

  /** The gear under the cursor: name and rarity word, slot, item level, weight, junk mark, its lines, and for bag gear what wearing it changes. */
  private renderDetail(): void {
    const m = this.member;
    const onBag = this.focus === 'bag';
    const slotHere = DOLL[this.dollCur];
    const it = onBag ? this.bag[this.bagCur] : m.equip[slotHere];
    const out: HTMLElement[] = [];
    let after: Stats | null = null;
    if (!it) {
      out.push(el('div', { class: 'slx-item-name', text: onBag ? T.ui2.equip.emptyCell : T.slot[slotHere] }));
      if (!onBag) out.push(el('p', { class: 'slx-desc', text: T.ui2.status.none }), el('p', { class: 'slx-hint', text: T.ui2.equip.pickSlot }));
      else if (this.target && m.equip[this.target]) out.push(el('p', { class: 'slx-hint', text: T.ui2.equip.takeOff(T.slot[this.target]) }));
    } else {
      out.push(
        el('div', { class: `slx-item-name slx-rarity-${it.rarity}`, text: gearLabel(it) }),
        el('div', { class: 'slx-item-meta' }, [
          el('span', { text: T.slotKind[itemSlot(it)] }), el('span', { text: T.gear.ilvl(it.ilvl) }), el('span', { text: T.gear.weight(itemWeight(it)) }),
        ]),
      );
      // For bag gear, what wearing it changes comes first, so long affix, power, set and lore lines never push it out of view.
      if (onBag) {
        const slot = this.slotFor(it);
        const worn = m.equip[slot];
        const delta = compareDelta(m, slot, it);
        after = statsOf({ ...m, equip: { ...m.equip, [slot]: it } });
        const rows = (Object.keys(T.gear.statName) as AnyStat[]).filter((k) => delta[k]).map((k) => {
          const d = delta[k]!;
          return el('div', { class: `slx-cmp-row ${d > 0 ? 'slx-up' : 'slx-down'}`, attrs: { 'data-stat': k } }, [
            el('span', { class: 'slx-cmp-label', text: T.gear.statName[k] }),
            el('span', { class: 'slx-cmp-after', text: `${T.ui2.equip.delta(k, d)} ${d > 0 ? '▲' : '▼'}` }),
          ]);
        });
        out.push(el('div', { class: 'slx-cmp' }, [
          // The worn piece by name in its rarity colour (the word itself would push the heading onto a second line).
          worn
            ? el('div', { class: 'slx-cmp-head' }, [T.ui2.equip.versusLabel, el('span', { class: `slx-rarity-${worn.rarity}`, text: T.enhanced(itemName(worn), worn.enhance) })])
            : el('div', { class: 'slx-cmp-head', text: T.ui2.equip.versusEmpty(T.slot[slot]) }),
          ...(rows.length ? rows : [el('p', { class: 'slx-desc', text: T.ui2.equip.noChange })]),
        ]));
      }
      if (it.junk) out.push(el('div', { class: 'slx-item-junk', text: T.gear.junk }));
      // A power whose skill is outside the viewed member's tree is dimmed and says so; one in the tree but not learned
      // yet only says so.
      out.push(el('div', { class: 'slx-item-lines' }, itemLines(it, m).map((l) =>
        l.locked
          ? el('p', { class: `slx-line slx-line-${l.kind} slx-line-locked`, text: l.text })
          : l.usable === false
          // Only the power text dims; the note stays at full contrast so the reason reads clearly.
          ? el('p', { class: `slx-line slx-line-${l.kind} slx-line-off` }, [el('span', { class: 'slx-line-dim', text: l.text }), el('span', { class: 'slx-line-note', text: T.gear.cannotUse })])
          : l.usable && l.learned === false
            ? el('p', { class: `slx-line slx-line-${l.kind}` }, [el('span', { text: l.text }), el('span', { class: 'slx-line-note', text: T.gear.notLearned })])
            : el('p', { class: `slx-line slx-line-${l.kind}${l.active ? ' slx-line-on' : ''}`, text: l.text }))));
      if (!onBag) out.push(el('p', { class: 'slx-hint', text: T.ui2.equip.pickSlot }));
    }
    this.detailBody.replaceChildren(...out);
    this.detailBody.scrollTop = 0;
    this.detailCues();
    this.renderStats(after);
  }

  /** How far the detail content can scroll (0 when it fits). */
  private detailRoom(): number {
    const b = this.detailBody;
    return Math.max(0, b.scrollHeight - b.clientHeight);
  }

  private canScrollDetail(d: 1 | -1): boolean {
    const room = this.detailRoom();
    return room > 1 && (d < 0 ? this.detailBody.scrollTop > 0 : this.detailBody.scrollTop < room - 1);
  }

  /** Scroll the detail content by `px`, held between its top and bottom. */
  private scrollDetail(px: number): void {
    this.detailBody.scrollTop = Math.max(0, Math.min(this.detailRoom(), this.detailBody.scrollTop + px));
    this.detailCues();
  }

  /** ▲ while there is more above, ▼ while there is more below; neither when the content fits. */
  private detailCues(): void {
    this.detailUp.hidden = !this.canScrollDetail(-1);
    this.detailDown.hidden = !this.canScrollDetail(1);
  }

  /** The member's numbers now; with bag gear under the cursor, the ones it would change read `now→after`. */
  private renderStats(after: Stats | null): void {
    const now = statsOf(this.member);
    this.statsWin.replaceChildren(...STAT_ORDER.map((k) => {
      const d = after ? after[k] - now[k] : 0;
      return el('div', { class: `slx-stat-cell${d > 0 ? ' slx-up' : d < 0 ? ' slx-down' : ''}`, attrs: { 'data-stat': k } }, [
        el('span', { class: 'slx-cmp-label', text: T.stat[k] }),
        el('span', { class: 'slx-stat-now', text: d ? `${now[k]}→${after![k]}` : String(now[k]) }),
      ]);
    }));
  }
}
