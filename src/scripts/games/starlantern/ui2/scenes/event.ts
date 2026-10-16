import { ITEMS } from '../../data/items';
import { T } from '../../data/text.zh-TW';
import { weightOf } from '../../data/weights';
import type { Content } from '../../engine/dungeon/rooms';
import { altarAt } from '../../engine/events';
import type { MoveResult } from '../../engine/game';
import type { Pos } from '../../engine/types';
import { ART_BASE } from '../../render/artPaths';
import { el, itemName } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, confirmBox, win } from '../widgets';

export interface Layer { el: HTMLElement; onAction(a: UiAction): boolean }
export type FullResult = Extract<MoveResult, { kind: 'full' }>;
export type EventKind = 'fountain' | 'merchant' | 'altar' | 'vault' | 'elite';

/** What an event window needs from the labyrinth screen that hosts it. */
export interface EventHost {
  ctx: SceneCtx;
  push(layer: Layer): void;
  /** Close the top window. */
  pop(): void;
  popAll(): void;
  /** A line in the dialogue box; windows below it ignore input until it closes. */
  say(text: string): void;
  /** Redraw the party bar and the map after something changed. */
  refresh(): void;
  /** Step onto the elite and start its fight. */
  fight(): void;
}

/**
 * Event tile art (art-factory contract, plan 4 Task 10). Not published yet: until a file is approved and listed in the
 * manifest, `ctx.art.has` is false and the windows show words only.
 */
export const eventArt = (k: EventKind | 'vault-open' | 'key' | 'trap') => `${ART_BASE}/tiles/event-${k}.png`;

const fmtWeight = (w: number) => String(Math.round(w * 10) / 10);

/** The common event window: art (once approved), title, body lines and a choice list. Cancel always means leave. */
function eventWindow(host: EventHost, kind: EventKind | 'full', title: string, body: Node[], items: MenuItem[], pick: (id: string) => void, onLeave?: () => void): Layer {
  const { ctx } = host;
  const leave = onLeave ?? (() => { ctx.sfx.cancel(); host.pop(); });
  const view = new MenuView(new Menu(items), {
    pick: (it) => { if (it.id === 'leave') { leave(); return; } ctx.sfx.confirm(); pick(it.id); },
    moved: () => ctx.sfx.cursor(),
    cancel: leave,
  }, 6);
  const art = kind !== 'full' && ctx.art.has(eventArt(kind)) ? [el('img', { class: 'slx-event-art', attrs: { src: eventArt(kind), alt: '' } })] : [];
  const head = el('div', { class: 'slx-event-head' }, [...art, el('span', { class: 'slx-event-title', text: title })]);
  const box = win(`slx-event ${kind === 'full' ? 'slx-full' : `slx-event-${kind}`}`, [head, ...body, view.el]);
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', title);
  return { el: box, onAction: (a) => view.onAction(a) };
}

const line = (text: string, cls = 'slx-event-text') => el('p', { class: cls, text });
const leaveItem = (): MenuItem => ({ id: 'leave', label: T.ui2.event.leave });

/** The window for a room event the party stepped on (fountain, merchant, altar, vault) or is about to step on (elite). */
export function eventLayer(host: EventHost, content: Content): Layer {
  const g = host.ctx.game;
  const E = T.ui2.event;
  switch (content.kind) {
    case 'fountain':
      return eventWindow(host, 'fountain', E.fountain.title, [line(E.fountain.desc)], [{ id: 'drink', label: E.fountain.drink }, leaveItem()], () => {
        host.popAll();
        if (!g.useFountain()) { host.ctx.sfx.error(); host.say(T.reasons.invalid); return; }
        host.ctx.sfx.heal?.();
        host.refresh();
        host.say(E.fountain.done);
      });
    case 'merchant': {
      const gold = line('', 'slx-event-gold');
      const show = () => { gold.textContent = E.merchant.gold(g.state.gold); };
      show();
      const stock = (content.stock ?? []).filter((id) => ITEMS[id]);
      return eventWindow(host, 'merchant', E.merchant.title, [line(E.merchant.desc), gold],
        [...stock.map((id) => ({ id, label: ITEMS[id].name, right: T.gold(ITEMS[id].price) })), leaveItem()], (id) => {
          const r = g.buy(content.at, id);
          if (!r.ok) { host.ctx.sfx.error(); host.say(T.reasons[r.reason] ?? T.reasons.invalid); return; }
          show();
          host.say(T.ui2.shop.bought(ITEMS[id].name, 1));
        });
    }
    case 'altar': {
      const def = altarAt(g.run!, g.floor, content.at);
      return eventWindow(host, 'altar', E.altar.title, [
        line(def.text),
        line(E.altar.cost(def.cost.hpPct, def.cost.gold), 'slx-event-cost'),
        line(E.altar.gain(T.stat[def.gain.stat], def.gain.pct), 'slx-event-gain'),
      ], [{ id: 'accept', label: E.altar.accept }, { id: 'leave', label: E.altar.decline }], () => {
        host.popAll();
        if (!g.altar(content.at, true)) { host.ctx.sfx.error(); host.say(E.altar.refused); return; }
        host.ctx.sfx.heal?.();
        host.refresh();
        host.say(E.altar.done);
      });
    }
    case 'vault': {
      const ready = g.run!.keys.has(g.floor);
      return eventWindow(host, 'vault', E.vault.title, [line(ready ? E.vault.ready : E.vault.locked)],
        ready ? [{ id: 'open', label: E.vault.open }, leaveItem()] : [leaveItem()], () => openVault(host, content.at));
    }
    case 'elite':
      return eventWindow(host, 'elite', E.elite.title, [line(E.elite.desc), line(E.elite.ask, 'slx-event-ask')],
        [{ id: 'fight', label: E.elite.fight }, leaveItem()], () => { host.popAll(); host.fight(); });
    default:
      throw new Error(`no event window for ${content.kind}`);
  }
}

function openVault(host: EventHost, at: Pos): void {
  const r = host.ctx.game.openVault(at);
  host.popAll();
  if (!r) { host.ctx.sfx.error(); host.say(T.reasons.invalid); return; }
  if (r.kind === 'full') { host.push(fullLayer(host, r, () => openVault(host, at))); return; }
  if (r.kind !== 'vault') return;
  host.ctx.sfx.chest?.();
  host.refresh();
  host.say(T.ui2.event.vault.opened(Object.entries(r.loot).map(([id, n]) => `${itemName(id)} ×${n}`).join('、')));
}

/** Everything the party carries that can be thrown away: the run pack and the consumables brought along, by item. */
function carriedItems(host: EventHost): Record<string, number> {
  const g = host.ctx.game;
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(g.run?.loot.items ?? {})) if (n > 0) out[id] = n;
  for (const [id, n] of Object.entries(g.state.inventory)) if (n > 0 && ITEMS[id]) out[id] = (out[id] ?? 0) + n;
  return out;
}

/**
 * 背包已滿: the pick-up stays where it is. Pick something to throw away (enough of it to make room, after a yes), or give up.
 * Once there is room, `retry` takes the pick-up (the vault); a chest is picked up by stepping on it again.
 */
export function fullLayer(host: EventHost, r: FullResult, retry?: () => void): Layer {
  const F = T.ui2.event.full;
  const { ctx } = host;
  const g = ctx.game;
  let need = r.need;
  const desc = line('');
  const show = () => { desc.textContent = F.desc(itemName(r.item), r.qty, Number(fmtWeight(need))); };
  show();
  const held = carriedItems(host);
  const items: MenuItem[] = [
    ...Object.entries(held).map(([id, n]) => ({ id, label: itemName(id), right: `×${n}` })),
    { id: 'leave', label: F.giveUp },
  ];
  const giveUp = () => { ctx.sfx.cancel(); host.pop(); host.say(F.left); };
  const self = eventWindow(host, 'full', F.title, [desc, line(F.which, 'slx-event-ask')], items, (id) => {
    const n = Math.min(held[id], Math.ceil(need / weightOf(id)));
    const box = confirmBox(F.ask(itemName(id), n), (yes) => {
      host.pop();
      if (!yes) return;
      const gone = g.discard(id, n);
      need -= gone * weightOf(id);
      if (need > 0) {
        // Still short: show the window again with what is left.
        host.pop();
        host.push(fullLayer(host, { ...r, need }, retry));
        return;
      }
      host.popAll();
      host.refresh();
      if (retry) retry();
      else host.say(F.freed);
    });
    box.view.menu.setCursor(1);
    box.view.render();
    host.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }, giveUp);
  return self;
}
