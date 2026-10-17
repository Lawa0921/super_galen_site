import { ITEMS } from '../../data/items';
import { T } from '../../data/text.zh-TW';
import { weightOf } from '../../data/weights';
import type { Content } from '../../engine/dungeon/rooms';
import { altarAt } from '../../engine/events';
import { BAG_SIZE } from '../../engine/loot/bag';
import { itemWeight } from '../../engine/loot/item';
import type { FullResult, MoveResult } from '../../engine/game';
import type { ItemInstance, Pos } from '../../engine/types';
import { ART_BASE } from '../../render/artPaths';
import { el, itemName } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { fillRich, gearLabel, gearPart, joinParts } from '../loot';
import { MenuView, confirmBox, richNodes, win, type Rich, type RichPart } from '../widgets';

export interface Layer { el: HTMLElement; onAction(a: UiAction): boolean }
export type { FullResult } from '../../engine/game';
export type EventKind = 'fountain' | 'merchant' | 'altar' | 'vault' | 'elite';

/** What an event window needs from the labyrinth screen that hosts it. */
export interface EventHost {
  ctx: SceneCtx;
  push(layer: Layer): void;
  /** Close the top window. */
  pop(): void;
  popAll(): void;
  /** A line in the dialogue box (rich lines colour gear by rarity); windows below it ignore input until it closes. */
  say(text: string | Rich): void;
  /** Redraw the party bar and the map after something changed. */
  refresh(): void;
  /** Step onto the elite and start its fight. */
  fight(): void;
  /** Gear was picked up: its best piece raises a light pillar and plays its chime (lootFx.dropMoment). */
  drop(items: readonly ItemInstance[]): void;
}

/**
 * Event tile art (art-factory contract, plan 4 Task 10). Not published yet: until a file is approved and listed in the
 * manifest, `ctx.art.has` is false and the windows show words only.
 */
export const eventArt = (k: EventKind | 'vault-open' | 'key' | 'trap') => `${ART_BASE}/tiles/event-${k}.png`;

const fmtWeight = (w: number) => String(Math.round(w * 10) / 10);

/** The common event window: art (once approved), title, body lines and a choice list. Cancel always means leave. */
function eventWindow(host: EventHost, kind: EventKind | 'full' | 'stairs', title: string, body: Node[], items: MenuItem[], pick: (id: string) => void, onLeave?: () => void, start = 0): Layer {
  const { ctx } = host;
  const leave = onLeave ?? (() => { ctx.sfx.cancel(); host.pop(); });
  const view = new MenuView(new Menu(items), {
    pick: (it) => { if (it.id === 'leave') { leave(); return; } ctx.sfx.confirm(); pick(it.id); },
    moved: () => ctx.sfx.cursor(),
    cancel: leave,
  }, 6);
  if (start) { view.menu.setCursor(start); view.render(); }
  const art = kind !== 'full' && kind !== 'stairs' && ctx.art.has(eventArt(kind)) ? [el('img', { class: 'slx-event-art', attrs: { src: eventArt(kind), alt: '' } })] : [];
  const head = el('div', { class: 'slx-event-head' }, [...art, el('span', { class: 'slx-event-title', text: title })]);
  const box = win(`slx-event ${kind === 'full' ? 'slx-full' : `slx-event-${kind}`}`, [head, ...body, view.el]);
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', title);
  return { el: box, onAction: (a) => view.onAction(a) };
}

const line = (text: string, cls = 'slx-event-text') => el('p', { class: cls, text });
const richLine = (r: Rich, cls = 'slx-event-text') => el('p', { class: cls }, richNodes(r));

export type ChestResult = Extract<MoveResult, { kind: 'chest' }>;

/** 「打開寶箱：發光苔 ×2、鐵劍」 — the gear, when the chest held any, in its rarity colour. */
export function chestLine(r: ChestResult): Rich {
  return [T.map.chest(itemName(r.item), r.qty), ...(r.gear ? ['、', gearPart(r.gear)] : [])];
}
const leaveItem = (): MenuItem => ({ id: 'leave', label: T.ui2.event.leave });

export type StairsResult = Extract<MoveResult, { kind: 'stairs' }>;

/**
 * Stairs down: name the next depth and its suggested level, warn an under-level party. 前往 calls `go`; 留在這層 (the
 * default when warned) closes the window and leaves the party standing on the stairs.
 */
export function stairsLayer(host: EventHost, r: StairsResult, go: () => void): Layer {
  const S = T.ui2.event.stairs;
  const body = [line(S.level(r.level)), ...(r.warn ? [line(S.warn, 'slx-event-text slx-event-warn')] : []), ...(r.rescue ? [line(T.ui2.rescue.waiting, 'slx-event-text slx-event-warn')] : [])];
  return eventWindow(host, 'stairs', S.title(r.floor), body, [{ id: 'go', label: S.go }, { id: 'leave', label: S.stay }], () => { host.popAll(); go(); }, undefined, r.warn || r.rescue ? 1 : 0);
}

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
  host.popAll();
  showPickUp(host, host.ctx.game.openVault(at), true);
}

/**
 * What a chest or the vault gave, after a step or a retry: a line for the loot, the 背包已滿 window again (retrying with
 * `Game.pickUpHere`), or — for a vault that did not open — a line saying why. A chest or vault whose gear did not fit is
 * still opened: its loot line heads the 背包已滿 window for the gear left waiting in it.
 */
export function showPickUp(host: EventHost, r: MoveResult | null, vault = false): void {
  const { ctx } = host;
  const full = (f: FullResult, opened?: Rich) => host.push(fullLayer(host, f, () => showPickUp(host, ctx.game.pickUpHere(), vault), opened));
  if (r?.kind === 'full') { ctx.sfx.error(); full(r); return; }
  if (r?.kind === 'vault' || r?.kind === 'chest') {
    ctx.sfx.chest?.();
    host.refresh();
    const said = r.kind === 'vault'
      ? fillRich(T.ui2.event.vault.opened, joinParts([...Object.entries(r.loot).map(([id, n]) => `${itemName(id)} ×${n}`), ...r.gear.map(gearPart)]))
      : chestLine(r);
    if (r.waiting) { full(r.waiting, said); return; }
    host.say(said);
    host.drop(r.kind === 'vault' ? r.gear : r.gear ? [r.gear] : []);
    return;
  }
  if (r?.kind === 'pickup') {
    ctx.sfx.chest?.();
    host.refresh();
    host.say(fillRich(T.ui2.event.pickedUp, [gearPart(r.gear)]));
    host.drop([r.gear]);
    return;
  }
  ctx.sfx.error();
  host.say(vault ? T.ui2.event.vault.failed : T.reasons.invalid);
}

/** Everything the party carries that weighs something and can be thrown away: the run pack and the consumables brought along, by item. */
function carriedItems(host: EventHost): Record<string, number> {
  const g = host.ctx.game;
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(g.run?.loot.items ?? {})) if (n > 0 && weightOf(id) > 0) out[id] = n;
  for (const [id, n] of Object.entries(g.state.inventory)) if (n > 0 && ITEMS[id] && weightOf(id) > 0) out[id] = (out[id] ?? 0) + n;
  return out;
}

/**
 * 背包已滿: the pick-up stays where it is until something is thrown away (after a yes), or the player gives up. Two limits:
 * - weight (`r.need` over the limit): carried materials and consumables, and run-pack gear (it has weight), all help;
 * - bag slots (`r.bag`, titled 背包已滿（60 件）): only throwing away run-pack gear frees a slot, so when the run pack holds
 *   none, nothing is offered but 放棄.
 * Once both fit, `retry` takes the pick-up (Game.pickUpHere through showPickUp; still not fitting opens this window again);
 * without it the line says to step on it again. `opened` is the loot line of a chest or vault that opened while its gear
 * stayed behind.
 */
export function fullLayer(host: EventHost, r: FullResult, retry?: () => void, opened?: Rich): Layer {
  const F = T.ui2.event.full;
  const { ctx } = host;
  const g = ctx.game;
  const gear = g.run?.loot.gear ?? [];
  const stuck = !!r.bag && gear.length === 0;   // no slot can be freed from here
  const body: HTMLElement[] = opened ? [richLine(opened)] : [];
  if (r.bag && r.gear) body.push(richLine(fillRich(F.bagDesc, [gearPart(r.gear)])));
  if (r.need > 0 && r.item) body.push(line(F.desc(itemName(r.item), r.qty ?? 1, Number(fmtWeight(r.need)))));
  else if (r.need > 0 && r.gear) body.push(richLine(fillRich((name) => F.gearHeavy(name, Number(fmtWeight(r.need))), [gearPart(r.gear)])));
  body.push(line(stuck ? F.noGear : r.bag ? F.whichGear : F.which, 'slx-event-ask'));
  const held = r.need > 0 && !stuck ? carriedItems(host) : {};
  const items: MenuItem[] = [
    ...(stuck || !(r.bag || r.need > 0) ? [] : gear).map((it) => ({ id: `gear:${it.uid}`, label: gearLabel(it), cls: `slx-rarity-${it.rarity}` })),
    ...Object.entries(held).map(([id, n]) => ({ id, label: itemName(id), right: `×${n}` })),
    { id: 'leave', label: F.keep },   // leaving it destroys nothing: it stays in the chest, the vault or on the ground
  ];
  const leaveIt = () => { ctx.sfx.cancel(); host.pop(); host.say(F.left); };
  return eventWindow(host, 'full', r.bag ? F.bagTitle(BAG_SIZE) : F.title, body, items, (id) => {
    const piece = gear.find((it) => `gear:${it.uid}` === id);
    const n = piece ? 1 : Math.min(held[id], Math.ceil(r.need / weightOf(id)));
    const ask = piece ? fillRich(F.askGear, [gearPart(piece)]) : F.ask(itemName(id), n);
    const box = confirmBox(ask, (yes) => {
      host.pop();
      if (!yes) return;
      let need = r.need;
      if (piece) { if (g.discardGear(piece.uid)) need -= itemWeight(piece); }
      else need -= g.discard(id, n) * weightOf(id);
      if (need > 0 && !r.bag) {
        // Still too heavy: show the window again with what is left.
        host.pop();
        host.push(fullLayer(host, { ...r, need }, retry));
        return;
      }
      host.popAll();
      host.refresh();
      if (retry) retry();   // a pick-up that still does not fit (a bag slot, or weight) opens this window again
      else host.say(F.freed);
    });
    box.view.menu.setCursor(1);
    box.view.render();
    host.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }, leaveIt);
}
