import { EQUIPMENT } from '../../data/equipment';
import { ITEMS } from '../../data/items';
import { MATERIALS } from '../../data/materials';
import { CHARACTERS } from '../../data/characters';
import { T } from '../../data/text.zh-TW';
import { compareDelta } from '../../engine/compare';
import { materialUses } from '../../engine/forge/uses';
import { BAG_SIZE } from '../../engine/loot/bag';
import { rollItem, sellPrice } from '../../engine/loot/item';
import { activeIds, defaultSlotFor, statsOf } from '../../engine/party';
import { mulberry32 } from '../../engine/rng';
import { buy, isUnlocked, junkTotals, sell, sellGear, sellJunk } from '../../engine/town';
import type { AnyStat } from '../../engine/types';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import { gearLabel, invested } from '../loot';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, QtyView, confirmBox, win } from '../widgets';
import { FacilityScene } from './facility';

export class ShopScene extends FacilityScene {
  constructor(ctx: SceneCtx, cps?: number) { super(ctx, 'shop', cps); }

  protected commands(): MenuItem[] {
    return [{ id: 'buy', label: T.ui2.shop.buy }, { id: 'sell', label: T.ui2.shop.sell }];
  }

  protected onCommand(id: string): void {
    if (id === 'buy') this.buyList();
    else this.sellList();
  }

  private icon(id: string): string | undefined {
    return this.ctx.art.has(art.icon(id)) ? art.icon(id) : undefined;
  }

  private goods(): MenuItem[] {
    const s = this.ctx.game.state;
    return [...Object.values(ITEMS), ...Object.values(EQUIPMENT)].map((g) => {
      const locked = 'slot' in g && !isUnlocked(s, g.id);
      const needs = locked ? (g.unlock ?? []).map((u) => `${MATERIALS[u.mat].name}×${u.qty}`).join('、') : '';
      // Every base is a plain (common) piece, which the shared label names without a rarity word; the colour class marks it.
      const gear = 'slot' in g ? { label: gearLabel(rollItem(mulberry32(0), { uid: 0, ilvl: g.ilvl, rarity: 'common', base: g.id })), cls: 'slx-rarity-common' } : { label: g.name };
      return { id: g.id, ...gear, icon: this.icon(g.id), disabled: locked, right: locked ? T.ui2.shop.needs(needs) : `${g.price} G  ${T.ui2.shop.owned('slot' in g ? s.bag.filter((x) => x.base === g.id).length : (s.inventory[g.id] ?? 0))}` };
    });
  }

  private describe(id: string): HTMLElement[] {
    const s = this.ctx.game.state;
    const it = ITEMS[id];
    if (it) return [el('p', { text: it.desc })];
    const eq = EQUIPMENT[id];
    if (!eq) return [];
    const bonus = Object.entries(eq.bonus).map(([k, v]) => `${T.stat[k as keyof typeof T.stat]}+${v}`).join(' ');
    // A temporary plain piece of the base (commons roll no affixes, so any seed gives the same item).
    const temp = rollItem(mulberry32(0), { uid: 0, ilvl: eq.ilvl, rarity: 'common', base: id });
    const rows = activeIds(s.party).map((cid) => {
      const m = s.party.roster[cid];
      const delta = compareDelta(m, defaultSlotFor(m, temp), temp);
      const stats = (Object.keys(T.gear.statName) as AnyStat[]).filter((k) => delta[k]).map((k) =>
        el('span', { class: delta[k]! > 0 ? 'slx-up' : 'slx-down', attrs: { 'data-stat': k }, text: `${T.gear.statName[k]}${T.ui2.equip.delta(k, delta[k]!)}` }));
      return el('li', { class: 'slx-cmp-member' }, [el('b', { text: CHARACTERS[cid].name }), ...(stats.length ? stats : [el('span', { class: 'slx-desc', text: T.ui2.equip.noChange })])]);
    });
    return [el('p', { text: `${T.slotKind[eq.slot]}　${bonus}` }), el('ul', { class: 'slx-skills slx-cmp-list' }, rows)];
  }

  private buyList(): void {
    const info = win('slx-info');
    const show = () => { const c = v.menu.current(); if (c) info.replaceChildren(el('p', { class: 'slx-name-line', text: c.label }), ...this.describe(c.id)); };
    const v = new MenuView(new Menu(this.goods()), {
      pick: (it) => this.askQty(it.id, () => { v.menu.items.splice(0, v.menu.items.length, ...this.goods()); if (v.menu.cursor >= v.menu.items.length) v.menu.setCursor(0); v.render(); }),
      moved: () => { this.ctx.sfx.cursor(); show(); },
      cancel: () => { info.remove(); this.pop(); },
    }, 12);
    show();
    this.stage.append(info);
    this.push({ el: win('slx-list slx-shop-list', [v.el]), onAction: (a) => v.onAction(a) });
  }

  /** The town bag (gear) is a different limit from the pack's weight, so it says its own number. */
  private shopFail(reason: string): void {
    if (reason === 'full') { this.ctx.sfx.error(); void this.say(T.ui2.shop.bagFull(BAG_SIZE)); } else this.fail(reason);
  }

  private askQty(id: string, after: () => void): void {
    const price = ITEMS[id]?.price ?? EQUIPMENT[id]?.price ?? 0;
    const name = ITEMS[id]?.name ?? EQUIPMENT[id]?.name ?? id;
    const st = this.ctx.game.state;
    const afford = Math.min(99, Math.floor(st.gold / Math.max(1, price)));
    if (afford < 1) { this.fail('gold'); return; }
    // Gear goes to the bag, so the box also stops at the free slots.
    const max = EQUIPMENT[id] ? Math.min(afford, BAG_SIZE - st.bag.length) : afford;
    if (max < 1) { this.shopFail('full'); return; }
    const q = new QtyView(max, {
      change: () => this.ctx.sfx.cursor(),
      done: (n) => {
        this.pop();
        let bought = 0; let why = 'gold';
        for (let i = 0; i < n; i++) { const r = this.ctx.game.apply(buy(this.ctx.game.state, id)); if (!r.ok) { why = r.reason; break; } bought++; }
        this.refresh(); after();
        if (bought) void this.say(T.ui2.shop.bought(name, bought), 'happy'); else this.shopFail(why);
      },
      cancel: () => this.pop(),
    }, price);
    this.push({ el: q.el, onAction: (a) => q.onAction(a) });
  }

  /** Selling has two pages: materials (counted toward unlocks) and bag gear (never counted). */
  private sellList(): void {
    const pages = new MenuView(new Menu([{ id: 'mats', label: T.ui2.shop.pages.mats }, { id: 'gear', label: T.ui2.shop.pages.gear }]), {
      pick: (it) => (it.id === 'mats' ? this.sellMats() : this.sellGearList()),
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-list slx-shop-pages', [pages.el]), onAction: (a) => pages.onAction(a) });
  }

  private matRows(): MenuItem[] {
    const inv = this.ctx.game.state.inventory;
    const junk = junkTotals(this.ctx.game.state);
    const rows = Object.entries(inv).filter(([id, n]) => MATERIALS[id] && n > 0).map(([id, n]): MenuItem => {
      const isJunk = MATERIALS[id].kind === 'junk';
      return {
        id, label: isJunk ? `${MATERIALS[id].name}（${T.ui2.shop.junkTag}）` : MATERIALS[id].name, cls: isJunk ? 'slx-junk-mat' : undefined,
        icon: this.icon(id), right: `${MATERIALS[id].price} G  ${T.ui2.shop.owned(n)}`,
      };
    });
    return junk.n ? [{ id: 'sell-junk', label: T.ui2.shop.sellJunk(junk.n, junk.g) }, ...rows] : rows;
  }

  /** Kind, price and every use (from `materialUses`, so the list can never drift from the game). */
  private describeMat(id: string): HTMLElement[] {
    const m = MATERIALS[id];
    if (!m) return [];
    const uses = m.kind === 'junk' ? T.forge.junkOnly : T.forge.usedFor(materialUses(id).map(T.forge.use).join('、'));
    return [el('p', { text: T.forge.kind[m.kind] }), el('p', { text: `${m.price} G` }), el('p', { class: 'slx-desc', text: uses })];
  }

  /** The sell-all row's detail: each junk material with its count and price, then the junk rule. */
  private describeJunk(): HTMLElement[] {
    const lines = junkTotals(this.ctx.game.state).lines.map((l) => el('li', { text: T.ui2.shop.junkLine(MATERIALS[l.id].name, l.n, l.g) }));
    return [el('p', { class: 'slx-name-line', text: T.ui2.shop.junkHead }), el('ul', { class: 'slx-skills slx-cmp-list' }, lines), el('p', { class: 'slx-desc', text: T.forge.junkOnly })];
  }

  private sellMats(): void {
    if (!this.matRows().length) { void this.say(T.ui2.shop.nothing); return; }
    const info = win('slx-info slx-mat-info');
    const show = () => {
      const c = v.menu.current();
      if (c?.id === 'sell-junk') info.replaceChildren(...this.describeJunk());
      else if (c) info.replaceChildren(el('p', { class: 'slx-name-line', text: MATERIALS[c.id].name }), ...this.describeMat(c.id));
      else info.replaceChildren();
    };
    const reload = () => {
      const left = this.matRows();
      if (!left.length) { info.remove(); this.popAll(); return; }
      v.menu.items.splice(0, v.menu.items.length, ...left);
      if (v.menu.cursor >= v.menu.items.length) v.menu.setCursor(0);
      v.render(); show();
    };
    const v: MenuView = new MenuView(new Menu(this.matRows()), {
      pick: (it) => {
        if (it.id === 'sell-junk') { this.sellAllJunk(reload); return; }
        const have = this.ctx.game.state.inventory[it.id] ?? 0;
        const q = new QtyView(have, {
          change: () => this.ctx.sfx.cursor(),
          done: (n) => {
            this.pop();
            const before = new Set(Object.keys(EQUIPMENT).filter((e) => isUnlocked(this.ctx.game.state, e)));
            const gold = this.ctx.game.state.gold;
            const r = this.ctx.game.apply(sell(this.ctx.game.state, it.id, n));
            if (!r.ok) { this.fail(r.reason); return; }
            const fresh = Object.keys(EQUIPMENT).filter((e) => isUnlocked(this.ctx.game.state, e) && !before.has(e)).map((e) => EQUIPMENT[e].name);
            this.refresh();
            reload();
            void this.say(fresh.length ? T.ui2.shop.unlocked(fresh.join('、')) : T.ui2.shop.sold(it.label, n, this.ctx.game.state.gold - gold), 'happy');
          },
          cancel: () => this.pop(),
        }, MATERIALS[it.id].price);
        this.push({ el: q.el, onAction: (a) => q.onAction(a) });
      },
      moved: () => { this.ctx.sfx.cursor(); show(); },
      cancel: () => { info.remove(); this.pop(); },
    }, 12);
    show();
    // One flex row holds the list and its detail, so a longer label pushes the detail right instead of under it.
    this.push({ el: el('div', { class: 'slx-mat-page' }, [win('slx-list slx-shop-list', [v.el]), info]), onAction: (a) => v.onAction(a) });
  }

  /** Junk has no other use, so one press sells all of it with no confirm; the sale counts toward unlocks like any material. */
  private sellAllJunk(reload: () => void): void {
    const before = new Set(Object.keys(EQUIPMENT).filter((e) => isUnlocked(this.ctx.game.state, e)));
    const { n, g } = junkTotals(this.ctx.game.state);
    const r = this.ctx.game.apply(sellJunk(this.ctx.game.state));
    if (!r.ok) { this.fail(r.reason); return; }
    const fresh = Object.keys(EQUIPMENT).filter((e) => isUnlocked(this.ctx.game.state, e) && !before.has(e)).map((e) => EQUIPMENT[e].name);
    this.refresh();
    reload();
    void this.say(fresh.length ? T.ui2.shop.unlocked(fresh.join('、')) : T.ui2.shop.soldJunk(n, g), 'happy');
  }

  private gearRows(): MenuItem[] {
    const bag = this.ctx.game.state.bag;
    const marked = bag.filter((it) => it.junk).length;
    return [
      { id: 'sell-marked', label: T.ui2.shop.sellMarked(marked), disabled: marked === 0 },
      ...bag.map((it) => ({
        id: `g${it.uid}`, label: gearLabel(it), cls: `slx-rarity-${it.rarity}`,
        right: `${it.junk ? `${T.ui2.shop.marked}  ` : ''}${sellPrice(it)} G`,
      })),
    ];
  }

  private sellGearList(): void {
    if (!this.ctx.game.state.bag.length) { void this.say(T.ui2.shop.nothingGear); return; }
    const v: MenuView = new MenuView(new Menu(this.gearRows(), 1), {
      pick: (it) => {
        const st = this.ctx.game.state;
        // Only what the confirm names is sold: one piece, or exactly the marked ones.
        const uids = it.id === 'sell-marked' ? st.bag.filter((x) => x.junk).map((x) => x.uid) : st.bag.filter((x) => `g${x.uid}` === it.id).map((x) => x.uid);
        const total = st.bag.filter((x) => uids.includes(x.uid)).reduce((n, x) => n + sellPrice(x), 0);
        if (!uids.length) return;
        const ask = it.id === 'sell-marked' ? T.ui2.shop.askMarked(uids.length, total) : T.ui2.shop.askOne(it.label, total);
        // An enhanced or reforged piece sells at its plain price: say so before the sale, not after.
        const warn = st.bag.some((x) => uids.includes(x.uid) && invested(x));
        const box = confirmBox(warn ? `${ask}\n${T.ui2.shop.warnInvested}` : ask, (yes) => {
          this.pop(!yes);
          if (!yes) return;
          const r = this.ctx.game.apply(sellGear(this.ctx.game.state, uids));
          if (!r.ok) { this.fail(r.reason); return; }
          this.refresh();
          if (this.ctx.game.state.bag.length) {
            const rows = this.gearRows();
            v.menu.items.splice(0, v.menu.items.length, ...rows);
            if (v.menu.cursor < 0 || v.menu.items[v.menu.cursor].disabled) v.menu.setCursor(Math.max(1, Math.min(v.menu.cursor, rows.length - 1)));
            v.render();
          } else this.popAll();
          void this.say(T.ui2.shop.soldGear(uids.length, total), 'happy');
        });
        box.view.menu.setCursor(1);
        box.view.render();
        this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
      },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    }, 12);
    this.push({ el: win('slx-list slx-shop-list', [v.el]), onAction: (a) => v.onAction(a) });
  }
}
