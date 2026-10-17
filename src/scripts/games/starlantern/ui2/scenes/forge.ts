import { CHARACTERS } from '../../data/characters';
import { T } from '../../data/text.zh-TW';
import type { ForgeResult } from '../../engine/forge/cost';
import type { Cost } from '../../data/forge';
import { ENHANCE_MAX, REGION_AFFIX_GROUP } from '../../data/forge';
import { affixRange } from '../../data/gear';
import { REGIONS, type RegionId } from '../../data/regions';
import { MATERIALS } from '../../data/materials';
import { compareDelta } from '../../engine/compare';
import { enhanceChance, enhanceCost, findItem, rerollCost, rerollRange, swapPool } from '../../engine/forge/cost';
import { dismantleYield } from '../../engine/forge/forge';
import { implicitStats } from '../../engine/loot/item';
import { SLOTS } from '../../engine/party';
import type { GameState } from '../../engine/state';
import type { AnyStat, ItemInstance } from '../../engine/types';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import { fillRich, gearLabel, gearPart, joinParts } from '../loot';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, confirmBox, richNodes, win, type Rich, type RichPart } from '../widgets';
import { FacilityScene, type Layer } from './facility';

/** The forge's commands are its five tabs, in this order. */
export const FORGE_TABS = ['dismantle', 'enhance', 'reroll', 'fuse', 'craft'] as const;
export type ForgeTab = typeof FORGE_TABS[number];

/**
 * What a tab page gets from the forge. FacilityScene keeps its window stack and its voice protected, so the scene hands
 * out this adapter instead of itself. `layerRoot` is the facility's stage element (not SceneCtx.stage, the Pixi layer).
 */
export interface ForgeHost {
  ctx: SceneCtx;
  layerRoot: HTMLElement;
  push(l: Layer): void;
  pop(silent?: boolean): void;
  popAll(): void;
  say(text: string | Rich, mood?: 'normal' | 'happy'): Promise<void>;
  /** After a Game forge call: the ok line (happy) or the reason; then a failed save is reported, and the notice cleared.
   * `bad` marks an ok result that is bad news (a failed enhance): the error sound and no happy face. */
  afterAct<O>(r: ForgeResult<O>, okLine: (out: O) => Rich, bad?: (out: O) => boolean): void;
}

/**
 * Gear rows for a forge list: the bag first, then (when `worn`) what each recruited member wears, in recruit order and
 * slot order, its wearer named after the label. Each row is `g<uid>`, in its rarity colour, struck through when marked junk.
 */
export function forgeRows(s: GameState, o: { worn: boolean; filter?: (it: ItemInstance) => boolean; right: (it: ItemInstance) => string }): MenuItem[] {
  const keep = o.filter ?? (() => true);
  const row = (it: ItemInstance, wearer?: string): MenuItem => ({
    id: `g${it.uid}`,
    label: wearer ? `${gearLabel(it)}${T.ui2.forge.wornBy(wearer)}` : gearLabel(it),
    right: o.right(it),
    cls: it.junk ? `slx-rarity-${it.rarity} slx-junk` : `slx-rarity-${it.rarity}`,
  });
  const rows = s.bag.filter(keep).map((it) => row(it));
  if (o.worn) {
    for (const id of s.party.recruited) {
      const m = s.party.roster[id];
      for (const slot of SLOTS) {
        const it = m.equip[slot];
        if (it && keep(it)) rows.push(row(it, CHARACTERS[id].name));
      }
    }
  }
  return rows;
}

/** 鍛造屋: 分解, 強化, 重鑄, 合成 and 製作. Each tab's page arrives with its own task; until then it says so. */
export class ForgeScene extends FacilityScene {
  constructor(ctx: SceneCtx, cps?: number) { super(ctx, 'forge', cps); }

  /** No forge picture is published yet: the town stands in until one is. */
  protected sceneArt(): string {
    return this.ctx.art.has(art.scene('forge')) ? art.scene('forge') : art.scene('town');
  }

  protected commands(): MenuItem[] {
    return FORGE_TABS.map((id) => ({ id, label: T.ui2.forge.tabs[id] }));
  }

  protected onCommand(id: string): void {
    if (id === 'dismantle') { dismantlePage(this.host()); return; }
    if (id === 'enhance') { enhancePage(this.host()); return; }
    if (id === 'reroll') { rerollPage(this.host()); return; }
    const label = T.ui2.forge.tabs[id as ForgeTab];
    if (label) void this.say(T.ui2.town.soon(label));
  }

  private host(): ForgeHost {
    return {
      ctx: this.ctx,
      layerRoot: this.stage,
      push: (l) => this.push(l),
      pop: (silent) => this.pop(silent),
      popAll: () => this.popAll(),
      say: (text, mood) => this.say(text, mood),
      afterAct: (r, okLine, bad) => this.afterAct(r, okLine, bad),
    };
  }

  private afterAct<O>(r: ForgeResult<O>, okLine: (out: O) => Rich, bad?: (out: O) => boolean): void {
    if (!r.ok) { this.fail(r.reason); return; }
    this.refresh();
    // A spent-but-failed try is told as bad news: the error sound, no happy face.
    const failed = bad?.(r.out) ?? false;
    if (failed) this.ctx.sfx.error(); else this.ctx.sfx.confirm();
    const said = this.say(okLine(r.out), failed ? 'normal' : 'happy');
    const notice = this.ctx.game.notice;
    // The save is reported here, so the town has nothing to repeat.
    if (notice === 'saved' || notice === 'save-failed') this.ctx.game.notice = null;
    if (notice === 'save-failed') void said.then(() => this.say(T.ui2.forge.saveFailed));
  }
}

/** Gear whose loss cannot be undone: a named rarity, or anything enhanced. */
const precious = (it: ItemInstance): boolean => it.rarity === 'legendary' || it.rarity === 'unique' || it.rarity === 'set' || it.enhance > 0;
/** A single piece asks first from rare up (or when enhanced); common and magic go at once. */
const asksFirst = (it: ItemInstance): boolean => it.rarity !== 'common' && it.rarity !== 'magic' || it.enhance > 0;

/** An essence tally as rich parts, each essence in the colour of its rarity. */
const yieldParts = (y: Record<string, number>): Rich =>
  joinParts(Object.entries(y).map(([id, n]) => ({ text: T.ui2.forge.yields({ [id]: n }), cls: `slx-rarity-${id.replace('essence-', '')}` })));

/** Fill a two-slot copy template with rich parts, so the words stay in the text file. */
function fill2(template: (a: string, b: string) => string, a: Rich, b: Rich): Rich {
  const [m1, m2] = ['', ''];
  const [before, rest = ''] = template(m1, m2).split(m1);
  const [mid, after = ''] = rest.split(m2);
  return [before, ...a, mid, ...b, after].filter((p) => p !== '');
}

/**
 * 分解: the bag's gear (worn gear is not listed), each row with the essences it gives. When any piece is marked junk the
 * first row dismantles every marked piece at once. The marked row and any single piece from rare up ask first, with 否
 * under the cursor; a common or magic piece goes at once.
 */
export function dismantlePage(h: ForgeHost): void {
  const game = h.ctx.game;
  const rows = (): MenuItem[] => {
    const s = game.state;
    const marked = s.bag.filter((it) => it.junk).length;
    const list = forgeRows(s, { worn: false, right: (it) => T.ui2.forge.yields(dismantleYield([it])) });
    return marked ? [{ id: 'marked', label: T.ui2.forge.dismantleMarked(marked) }, ...list] : list;
  };
  if (!game.state.bag.length) { void h.say(T.ui2.forge.nothingToDismantle); return; }
  const v: MenuView = new MenuView(new Menu(rows()), {
    pick: (it) => {
      const bag = game.state.bag;
      const picked = it.id === 'marked' ? bag.filter((x) => x.junk) : bag.filter((x) => `g${x.uid}` === it.id);
      if (!picked.length) return;
      // Only what was picked (and named in the confirm) goes.
      const run = () => {
        const r = game.dismantle(picked.map((x) => x.uid));
        if (r.ok && !game.state.bag.length) h.popAll();
        else if (r.ok) {
          const next = rows();
          v.menu.items.splice(0, v.menu.items.length, ...next);
          if (v.menu.cursor < 0 || v.menu.cursor >= next.length) v.menu.setCursor(Math.max(0, next.length - 1));
          v.render();
        }
        h.afterAct(r, (out) => [T.ui2.forge.dismantled(T.ui2.forge.yields(out.essences))]);
      };
      if (it.id !== 'marked' && !asksFirst(picked[0])) { run(); return; }
      const y = yieldParts(dismantleYield(picked));
      const ask = it.id === 'marked'
        ? fill2((_, b) => T.ui2.forge.askMarked(picked.length, b), [], y)
        : fill2(T.ui2.forge.askOne, [gearPart(picked[0])], y);
      const box = confirmBox(picked.some(precious) ? [...ask, `
${T.ui2.forge.warnPrecious}`] : ask, (yes) => {
        h.pop(!yes);
        if (yes) run();
      });
      box.view.menu.setCursor(1);
      box.view.render();
      h.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
    },
    moved: () => h.ctx.sfx.cursor(),
    cancel: () => h.pop(),
  }, 12);
  h.push({ el: win('slx-list slx-forge-list', [v.el]), onAction: (a) => v.onAction(a) });
}

/** What `c` costs as rich parts: each material as 「名稱 擁有／需要」, then the gold; anything short is in `slx-lack` and ends with （不足）. */
export function costText(s: GameState, c: Cost): Rich {
  const F = T.ui2.forge;
  const part = (text: string, short: boolean): RichPart => (short ? { text: `${text}${F.lacking}`, cls: 'slx-lack' } : text);
  const parts: RichPart[] = Object.entries(c.mats).map(([id, need]) => {
    const have = s.inventory[id] ?? 0;
    return part(F.costMat(MATERIALS[id]?.name ?? id, have, need), have < need);
  });
  if (c.gold > 0) parts.push(s.gold < c.gold ? part(F.costGoldHave(s.gold, c.gold), true) : F.costGold(c.gold));
  return joinParts(parts);
}

/** What is still short for `c`, named: materials first, then gold. */
function lackingNames(s: GameState, c: Cost): string[] {
  const F = T.ui2.forge;
  const out = Object.entries(c.mats).filter(([id, need]) => (s.inventory[id] ?? 0) < need)
    .map(([id, need]) => F.lackMat(MATERIALS[id]?.name ?? id, need - (s.inventory[id] ?? 0)));
  if (s.gold < c.gold) out.push(F.lackGold(c.gold - s.gold));
  return out;
}

/** The detail beside the enhance list: the level step, the base bonus now and next, chance, cost, and the wearer's gains. */
function enhanceDetail(s: GameState, it: ItemInstance): HTMLElement[] {
  const F = T.ui2.forge;
  const out: HTMLElement[] = [el('p', { class: `slx-name-line slx-rarity-${it.rarity}`, text: gearLabel(it) })];
  const cost = enhanceCost(it);
  if (!cost) return [...out, el('p', { class: 'slx-desc', text: `+${it.enhance}　${F.maxed}` })];
  const next: ItemInstance = { ...it, enhance: it.enhance + 1 };
  out.push(el('p', { text: F.levelStep(it.enhance, next.enhance) }));
  const now = implicitStats(it);
  const after = implicitStats(next);
  for (const k of Object.keys(after) as AnyStat[]) {
    const [from, to] = [now[k as keyof typeof now] ?? 0, after[k as keyof typeof after] ?? 0];
    // Green only when the number really moves: a small base can round to the same value one level up.
    out.push(el('p', { class: to > from ? 'slx-cmp-row slx-up' : 'slx-cmp-row', attrs: { 'data-stat': k }, text: F.baseStat(T.gear.statName[k], from, to) }));
  }
  const chance = enhanceChance(it);
  if (it.enhance >= 5) out.push(el('p', { text: F.chance(Math.round(chance * 100)) }));
  if (chance < 1) out.push(el('p', { class: 'slx-desc', text: F.failNote }));
  out.push(el('p', {}, richNodes(costText(s, cost))));
  const found = findItem(s, it.uid);
  if (found?.member && found.slot) {
    const delta = compareDelta(s.party.roster[found.member], found.slot, next);
    const stats = (Object.keys(T.gear.statName) as AnyStat[]).filter((k) => delta[k]).map((k) =>
      el('span', { class: delta[k]! > 0 ? 'slx-up' : 'slx-down', attrs: { 'data-stat': k }, text: `${T.gear.statName[k]}${T.ui2.equip.delta(k, delta[k]!)}` }));
    out.push(el('ul', { class: 'slx-skills slx-cmp-list' }, [el('li', { class: 'slx-cmp-member' }, [el('b', { text: CHARACTERS[found.member].name }), ...stats])]));
  }
  return out;
}

/**
 * 強化: the bag's gear and what the party wears, each row with its level (or 已達上限). The detail beside it follows the
 * cursor and is the comparison before confirming. Enter asks first (否 under the cursor); a maxed piece or a missing
 * material is refused with the reason, named. The list stays open and refreshes, for back-to-back tries.
 */
export function enhancePage(h: ForgeHost): void {
  const game = h.ctx.game;
  const rows = (): MenuItem[] => forgeRows(game.state, { worn: true, right: (it) => (it.enhance >= ENHANCE_MAX ? T.ui2.forge.maxed : `+${it.enhance}`) });
  if (!rows().length) { void h.say(T.ui2.forge.nothingToEnhance); return; }
  const info = win('slx-info');
  const find = (id?: string) => (id ? findItem(game.state, Number(id.slice(1)))?.it ?? null : null);
  const show = () => { const it = find(v.menu.current()?.id); info.replaceChildren(...(it ? enhanceDetail(game.state, it) : [])); };
  const run = (uid: number) => {
    const r = game.enhance(uid);
    if (r.ok) { v.menu.items.splice(0, v.menu.items.length, ...rows()); v.render(); show(); }
    h.afterAct(r, (out) => {
      const it = findItem(game.state, uid)?.it;
      return it ? fillRich(out.success ? T.ui2.forge.enhanceOk : T.ui2.forge.enhanceFail, [gearPart(it)]) : [];
    }, (out) => !out.success);
  };
  const v: MenuView = new MenuView(new Menu(rows()), {
    pick: (item) => {
      const it = find(item.id);
      if (!it) return;
      const cost = enhanceCost(it);
      if (!cost) { h.afterAct({ ok: false, reason: 'max' }, () => []); return; }
      const lack = lackingNames(game.state, cost);
      if (lack.length) { h.ctx.sfx.error(); void h.say(T.ui2.forge.lackNames(lack)); return; }
      const box = confirmBox(fillRich(T.ui2.forge.askEnhance, [gearPart(it)]), (yes) => {
        h.pop(!yes);
        if (yes) run(it.uid);
      });
      box.view.menu.setCursor(1);
      box.view.render();
      h.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
    },
    moved: () => { h.ctx.sfx.cursor(); show(); },
    cancel: () => { info.remove(); h.pop(); },
  }, 12);
  show();
  h.layerRoot.append(info);
  h.push({ el: win('slx-list slx-forge-list', [v.el]), onAction: (a) => v.onAction(a) });
}

/** How far into its roll range an affix sits (can fall outside it for a hand-made value); used to say whether a reroll improved it. */
function rollPosition(key: AnyStat, value: number, ilvl: number): number {
  const [lo, hi] = affixRange(key, ilvl);
  return hi > lo ? (value - lo) / (hi - lo) : 0;
}

/** The region whose material is `mat`, for naming its category. */
const regionOfMaterial = (mat: string): RegionId | undefined => Object.values(REGIONS).find((r) => r.material === mat)?.id;

/**
 * 重鑄: pick a piece (the bag or worn), then one of its affixes, then how: reroll its value, or swap it for another
 * (any, or from the category a region material pins). Each layer is a list and Esc steps back one. The first reroll locks
 * the affix for good, which is warned about before it happens; once locked, the other affixes are greyed out with the
 * reason. A unique or set piece only rerolls values. The detail beside the lists follows the cursor.
 */
export function rerollPage(h: ForgeHost): void {
  const game = h.ctx.game;
  const F = T.ui2.forge;
  const find = (uid: number) => findItem(game.state, uid)?.it ?? null;
  const affixText = (a: { key: AnyStat; value: number }) => T.gear.affix(a.key, a.value);
  const itemRows = (): MenuItem[] => forgeRows(game.state, {
    worn: true,
    filter: (it) => it.affixes.length > 0,
    right: (it) => (it.locked !== undefined && it.affixes[it.locked] ? affixText(it.affixes[it.locked]) : F.unlocked),
  });
  if (!itemRows().length) { void h.say(F.nothingToReroll); return; }

  /** Replace a list's rows in place, keeping the cursor on a live row. */
  const sync = (view: MenuView, next: MenuItem[]) => {
    view.menu.items.splice(0, view.menu.items.length, ...next);
    const here = view.menu.items[view.menu.cursor];
    if (!here || here.disabled) { const k = next.findIndex((x) => !x.disabled); if (k >= 0) view.menu.setCursor(k); }
    view.render();
  };
  /** The row's short cost: the gold. The have/need of every material is in the detail beside the list. */
  const costLine = (it: ItemInstance, swap: boolean, mat?: string): string => T.ui2.forge.costGold(rerollCost(it, { swap, mat }).gold);

  // The detail window; whichever layer is on top says what it shows.
  const info = win('slx-info slx-reroll-info');
  const shows: Array<() => void> = [];
  const show = () => shows[shows.length - 1]?.();
  const nameLine = (it: ItemInstance) => el('p', { class: `slx-name-line slx-rarity-${it.rarity}`, text: gearLabel(it) });
  const affixLines = (it: ItemInstance) => it.affixes.map((a, i) =>
    el('p', { text: i === it.locked ? `${affixText(a)}${T.gear.lockedAffix}` : affixText(a) }));

  const itemsView: MenuView = new MenuView(new Menu(itemRows()), {
    pick: (row) => { const it = find(Number(row.id.slice(1))); if (it) openAffixes(it.uid); },
    moved: () => { h.ctx.sfx.cursor(); show(); },
    cancel: () => { info.remove(); h.pop(); },
  }, 12);
  shows.push(() => {
    const it = find(Number(itemsView.menu.current()?.id.slice(1)));
    info.replaceChildren(...(it ? [nameLine(it), ...affixLines(it)] : []));
  });

  function openAffixes(uid: number): void {
    const rows = (): MenuItem[] => {
      const it = find(uid);
      return (it?.affixes ?? []).map((a, i): MenuItem => {
        const other = it!.locked !== undefined && it!.locked !== i;
        return other
          ? { id: `a${i}`, label: affixText(a), disabled: true, right: F.lockedShort, note: F.lockedOther }
          : { id: `a${i}`, label: affixText(a), right: i === it!.locked ? T.gear.lockedAffix : undefined };
      });
    };
    const view: MenuView = new MenuView(new Menu(rows()), {
      pick: (row) => openMethods(uid, Number(row.id.slice(1))),
      moved: () => { h.ctx.sfx.cursor(); show(); },
      cancel: () => { shows.pop(); h.pop(); show(); },
    }, 12);
    const refresh = () => { sync(itemsView, itemRows()); sync(view, rows()); };
    shows.push(() => {
      const it = find(uid);
      info.replaceChildren(...(it ? [nameLine(it), ...affixLines(it), ...(it.locked !== undefined ? [el('p', { class: 'slx-desc', text: F.lockedOther })] : [])] : []));
    });
    show();
    h.push({ el: win('slx-list slx-forge-list slx-reroll-list', [view.el]), onAction: (a) => view.onAction(a) });

    function openMethods(itemUid: number, index: number): void {
      const it0 = find(itemUid);
      if (!it0) return;
      const how = (id: string) => ({ swap: id !== 'value', mat: id.startsWith('mat:') ? id.slice(4) : undefined });
      const methods = (): MenuItem[] => {
        const it = find(itemUid);
        if (!it) return [];
        const row = (id: string, label: string): MenuItem => {
          const o = how(id);
          const empty = o.swap && swapPool(it, index, o.mat).length === 0;
          return empty
            ? { id, label, disabled: true, right: T.reasons.none, note: T.reasons.none }
            : { id, label, right: costLine(it, o.swap, o.mat) };
        };
        const swappable = it.rarity !== 'unique' && it.rarity !== 'set';
        return [
          row('value', F.rerollValue),
          ...(swappable ? [row('swap', F.rerollSwap), ...Object.keys(REGION_AFFIX_GROUP).map((m) => {
            const region = regionOfMaterial(m);
            return row(`mat:${m}`, F.rerollWith(MATERIALS[m]?.name ?? m, region ? T.forge.group[region] : ''));
          })] : []),
        ];
      };
      const mview: MenuView = new MenuView(new Menu(methods()), {
        pick: (row) => {
          const it = find(itemUid);
          if (!it) return;
          const o = how(row.id);
          const lack = lackingNames(game.state, rerollCost(it, o));
          if (lack.length) { h.ctx.sfx.error(); void h.say(F.lackNames(lack)); return; }
          const ask = fill2(F.askReroll, [gearPart(it)], [affixText(it.affixes[index])]);
          const box = confirmBox(it.locked === undefined ? [...ask, `\n${F.lockWarn}`] : ask, (yes) => {
            h.pop(!yes);
            if (yes) run(o);
          });
          box.view.menu.setCursor(1);
          box.view.render();
          h.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
        },
        moved: () => { h.ctx.sfx.cursor(); show(); },
        cancel: () => { shows.pop(); h.pop(); show(); },
      }, 12);
      shows.push(() => {
        const it = find(itemUid);
        const cur = mview.menu.current();
        if (!it || !it.affixes[index]) { info.replaceChildren(); return; }
        const o = how(cur?.id ?? 'value');
        const lines = [nameLine(it), el('p', { text: F.rerollNow(affixText(it.affixes[index])) })];
        if (o.swap) lines.push(el('p', { text: F.rerollPool(swapPool(it, index, o.mat).map((k) => T.gear.statName[k]).join('、')) }));
        else { const r = rerollRange(it, index); if (r) lines.push(el('p', { text: F.rerollRange(it.affixes[index].key, r[0], r[1]) })); }
        lines.push(el('p', {}, richNodes(costText(game.state, rerollCost(it, o)))));
        if (it.locked === undefined) lines.push(el('p', { class: 'slx-desc', text: F.lockWarn }));
        info.replaceChildren(...lines);
      });
      show();
      h.push({ el: win('slx-list slx-forge-list slx-reroll-list', [mview.el]), onAction: (a) => mview.onAction(a) });

      const run = (o: { swap: boolean; mat?: string }) => {
        const r = game.reroll(itemUid, index, o);
        let better = 0;
        if (r.ok) {
          // Back at the affix layer, refreshed with the new value and the lock.
          shows.pop();
          h.pop(true);
          refresh();
          show();
          const ilvl = find(itemUid)?.ilvl ?? it0.ilvl;
          better = Math.sign(rollPosition(r.out.after.key, r.out.after.value, ilvl) - rollPosition(r.out.before.key, r.out.before.value, ilvl));
        }
        h.afterAct(r, (out) => {
          const [from, to] = [affixText(out.before), affixText(out.after)];
          return fill2(F.rerolled, [from], [better === 0 ? to : { text: to, cls: better > 0 ? 'slx-up' : 'slx-down' }]);
        }, () => better < 0);
      };
    }
  }

  show();
  h.layerRoot.append(info);
  h.push({ el: win('slx-list slx-forge-list', [itemsView.el]), onAction: (a) => itemsView.onAction(a) });
}
