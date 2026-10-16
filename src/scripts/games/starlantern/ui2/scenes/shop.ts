import { EQUIPMENT } from '../../data/equipment';
import { ITEMS } from '../../data/items';
import { MATERIALS } from '../../data/materials';
import { CHARACTERS } from '../../data/characters';
import { T } from '../../data/text.zh-TW';
import { rollItem } from '../../engine/loot/item';
import { activeIds, defaultSlotFor, slotsFor, statsOf } from '../../engine/party';
import { mulberry32 } from '../../engine/rng';
import { buy, isUnlocked, sell } from '../../engine/town';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, QtyView, win } from '../widgets';
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
      return { id: g.id, label: g.name, icon: this.icon(g.id), disabled: locked, right: locked ? T.ui2.shop.needs(needs) : `${g.price} G  ${T.ui2.shop.owned(s.inventory[g.id] ?? 0)}` };
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
      const now = statsOf(m); const after = statsOf({ ...m, equip: { ...m.equip, [defaultSlotFor(m, temp)]: temp } });
      const d = (Object.keys(eq.bonus) as (keyof typeof now)[]).map((k) => `${T.stat[k]}${after[k] - now[k] >= 0 ? '+' : ''}${after[k] - now[k]}`).join(' ');
      return el('li', { text: `${CHARACTERS[cid].name}　${d}` });
    });
    return [el('p', { text: `${T.slot[slotsFor(eq.slot)[0]]}　${bonus}` }), el('ul', { class: 'slx-skills' }, rows)];
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

  private askQty(id: string, after: () => void): void {
    const price = ITEMS[id]?.price ?? EQUIPMENT[id]?.price ?? 0;
    const name = ITEMS[id]?.name ?? EQUIPMENT[id]?.name ?? id;
    const max = Math.min(99, Math.floor(this.ctx.game.state.gold / Math.max(1, price)));
    if (max < 1) { this.fail('gold'); return; }
    const q = new QtyView(max, {
      change: () => this.ctx.sfx.cursor(),
      done: (n) => {
        this.pop();
        let bought = 0;
        for (let i = 0; i < n; i++) { const r = this.ctx.game.apply(buy(this.ctx.game.state, id)); if (!r.ok) break; bought++; }
        this.refresh(); after();
        if (bought) void this.say(T.ui2.shop.bought(name, bought), 'happy'); else this.fail('gold');
      },
      cancel: () => this.pop(),
    }, price);
    this.push({ el: q.el, onAction: (a) => q.onAction(a) });
  }

  private sellList(): void {
    const mats = () => Object.entries(this.ctx.game.state.inventory).filter(([id, n]) => MATERIALS[id] && n > 0)
      .map(([id, n]) => ({ id, label: MATERIALS[id].name, icon: this.icon(id), right: `${MATERIALS[id].price} G  ${T.ui2.shop.owned(n)}` }));
    if (!mats().length) { void this.say(T.ui2.shop.nothing); return; }
    const v = new MenuView(new Menu(mats()), {
      pick: (it) => {
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
            const left = mats();
            if (left.length) { v.menu.items.splice(0, v.menu.items.length, ...left); if (v.menu.cursor >= v.menu.items.length) v.menu.setCursor(0); v.render(); } else this.popAll();
            void this.say(fresh.length ? T.ui2.shop.unlocked(fresh.join('、')) : T.ui2.shop.sold(it.label, n, this.ctx.game.state.gold - gold), 'happy');
          },
          cancel: () => this.pop(),
        }, MATERIALS[it.id].price);
        this.push({ el: q.el, onAction: (a) => q.onAction(a) });
      },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    }, 12);
    this.push({ el: win('slx-list slx-shop-list', [v.el]), onAction: (a) => v.onAction(a) });
  }
}
