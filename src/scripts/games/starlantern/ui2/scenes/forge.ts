import { CHARACTERS } from '../../data/characters';
import { T } from '../../data/text.zh-TW';
import type { ForgeResult } from '../../engine/forge/cost';
import type { Cost } from '../../data/forge';
import { ENHANCE_MAX, FUSE_NEXT, REGION_AFFIX_GROUP } from '../../data/forge';
import { AFFIXES, affixRange } from '../../data/gear';
import { ENEMIES } from '../../data/enemies';
import { ROSTER_LIVE } from '../../data/monsters';
import { REGIONS, type RegionId } from '../../data/regions';
import { MATERIALS } from '../../data/materials';
import { GATHER_PIN_QTY, SPOT_OF, SPOT_REGIONS, gatherOpen } from '../../data/gather';
import { compareDelta } from '../../engine/compare';
import { enhanceChance, enhanceCost, findItem, fuseCost, fuseSlots, inscribeCost, inscriptionAffix, rerollCost, rerollRange, signatureOf, swapPool } from '../../engine/forge/cost';
import { dismantleYield } from '../../engine/forge/forge';
import { implicitStats, itemSlot } from '../../engine/loot/item';
import { SLOTS } from '../../engine/party';
import type { GameState } from '../../engine/state';
import type { AnyStat, GearSlot, ItemInstance, Rarity } from '../../engine/types';
import { art } from '../../render/artPaths';
import type { ArtIndex } from '../../render/textures';
import { el } from '../../ui/dom';
import { gearIconLate } from '../gearArt';
import { lateArt } from '../lateArt';
import { fillRich, gearLabel, gearPart, invested, joinParts, rarityClass } from '../loot';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { GEAR_ROWS, MenuView, confirmBox, richNodes, richText, win, type Rich, type RichPart } from '../widgets';
import { RUNE_FUSE_IN } from '../../data/runeEconomy';
import { RUNES, RUNE_STACK, runeKey, parseRuneKey, type RuneRef } from '../../data/runes';
import { bagRunes, fuseCostOf, fuseRunes, type RuneFuseFail } from '../../engine/runeTrade';
import { bagCount, ownedCount } from '../../engine/sockets';
import { FacilityScene, type Layer } from './facility';
import { openCraft } from './forgeCraft';

/** The forge's commands are its six tabs, in this order (符文合成 since plan 8f). */
export const FORGE_TABS = ['dismantle', 'enhance', 'reroll', 'fuse', 'craft', 'runes'] as const;
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
 * A piece listed but out of reach is greyed out with `blocked`'s reason in place of `right`. With `art`, a row carries
 * the piece's gear icon once it is published (a special's own art only, never its base's).
 */
export function forgeRows(s: GameState, o: {
  worn: boolean; filter?: (it: ItemInstance) => boolean; right: (it: ItemInstance) => string; blocked?: (it: ItemInstance) => string | undefined;
  art?: ArtIndex;
}): MenuItem[] {
  const keep = o.filter ?? (() => true);
  const row = (it: ItemInstance, wearer?: string): MenuItem => {
    const reason = o.blocked?.(it);
    const icon = o.art ? gearIconLate(o.art, it) : undefined;
    return {
      id: `g${it.uid}`,
      label: wearer ? `${gearLabel(it)}${T.ui2.forge.wornBy(wearer)}` : gearLabel(it),
      cls: it.junk ? `${rarityClass(it)} slx-junk` : rarityClass(it),
      ...(icon ? { icon, iconCls: 'slx-gear-ico' } : {}),
      ...(reason ? { disabled: true, right: reason, note: reason } : { right: o.right(it) }),
    };
  };
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

/** 鍛造屋: 分解, 強化, 重鑄, 合成, 製作 and 符文合成. Each tab's page arrives with its own task; until then it says so. */
export class ForgeScene extends FacilityScene {
  constructor(ctx: SceneCtx, cps?: number) { super(ctx, 'forge', cps); }

  /** No forge picture is published yet: the town stands in until one is. */
  protected sceneArts(): string[] {
    return [art.scene('forge'), art.scene('town')];
  }

  protected commands(): MenuItem[] {
    return FORGE_TABS.map((id) => ({ id, label: T.ui2.forge.tabs[id] }));
  }

  protected onCommand(id: string): void {
    if (id === 'dismantle') { dismantlePage(this.host()); return; }
    if (id === 'enhance') { enhancePage(this.host()); return; }
    if (id === 'reroll') { rerollPage(this.host()); return; }
    if (id === 'fuse') { fusePage(this.host()); return; }
    if (id === 'craft') { openCraft(this.host()); return; }
    if (id === 'runes') { runeFusePage(this.host()); return; }
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

/**
 * Gear whose loss cannot be undone: epic and up (a starlit piece is always legendary, unique or set), or anything invested
 * in (enhanced, or with a reroll-locked affix).
 */
const precious = (it: ItemInstance): boolean =>
  it.rarity === 'epic' || it.rarity === 'legendary' || it.rarity === 'unique' || it.rarity === 'set' || invested(it);
/** A single piece asks first from rare up (or when invested in); a plain common or magic piece goes at once. */
const asksFirst = (it: ItemInstance): boolean => it.rarity !== 'common' && it.rarity !== 'magic' || invested(it);

/** Roster plan Task C4: the live species whose signature the stores hold, in ENEMIES order (none while nothing is live). */
function inscribable(s: GameState): string[] {
  return Object.values(ENEMIES)
    .filter((e) => e.inscribe && ROSTER_LIVE.has(e.id) && (s.inventory[signatureOf(e.id) ?? ''] ?? 0) > 0)
    .map((e) => e.id);
}
/** Whether affix `index` of `it` can take `species`' key: the slot rolls it, and no other affix holds it (engine inscribeAt). */
function inscribeFits(it: ItemInstance, index: number, species: string): boolean {
  const key = ENEMIES[species].inscribe!;
  return AFFIXES[key].slots.includes(itemSlot(it)) && !it.affixes.some((a, i) => i !== index && a.key === key);
}

/** A detail window's name line: the label, and the wearer when worn (a long row label is cut short, so the detail says it in full). */
function nameLine(s: GameState, it: ItemInstance): HTMLElement {
  const member = findItem(s, it.uid)?.member;
  return el('p', { class: `slx-name-line ${rarityClass(it)}`, text: member ? `${gearLabel(it)}${T.ui2.forge.wornBy(CHARACTERS[member].name)}` : gearLabel(it) });
}

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
    const list = forgeRows(s, { worn: false, art: h.ctx.art, right: (it) => T.ui2.forge.yields(dismantleYield([it])) });
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
  }, GEAR_ROWS);
  h.push({ el: win('slx-list slx-forge-list slx-forge-pick', [v.el]), onAction: (a) => v.onAction(a) });
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
export function lackingNames(s: GameState, c: Cost): string[] {
  const F = T.ui2.forge;
  const out = Object.entries(c.mats).filter(([id, need]) => (s.inventory[id] ?? 0) < need)
    .map(([id, need]) => F.lackMat(MATERIALS[id]?.name ?? id, need - (s.inventory[id] ?? 0)));
  if (s.gold < c.gold) out.push(F.lackGold(c.gold - s.gold));
  return out;
}

/** The detail beside the enhance list: the level step, the base bonus now and next, chance, cost, and the wearer's gains. */
function enhanceDetail(s: GameState, it: ItemInstance): HTMLElement[] {
  const F = T.ui2.forge;
  const out: HTMLElement[] = [nameLine(s, it)];
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
    // A base stat the step raises by less than the wearer's next whole point: the sheet floors the total, so say it is accruing.
    const accruing = (Object.keys(after) as AnyStat[]).filter((k) => !delta[k] && (after[k as keyof typeof after] ?? 0) > (now[k as keyof typeof now] ?? 0)).map((k) =>
      el('span', { class: 'slx-desc', attrs: { 'data-stat': k }, text: `${T.gear.statName[k]}${F.accruing}` }));
    const parts = [...stats, ...accruing];
    out.push(el('ul', { class: 'slx-skills slx-cmp-list' }, [el('li', { class: 'slx-cmp-member' }, [
      el('b', { text: CHARACTERS[found.member].name }), ...(parts.length ? parts : [el('span', { class: 'slx-desc', text: T.ui2.equip.noChange })]),
    ])]));
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
  const rows = (): MenuItem[] => forgeRows(game.state, { worn: true, art: h.ctx.art, right: (it) => (it.enhance >= ENHANCE_MAX ? T.ui2.forge.maxed : `+${it.enhance}`) });
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
  }, GEAR_ROWS);
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
    art: h.ctx.art,
    filter: (it) => it.affixes.length > 0,
    right: (it) => (it.locked !== undefined && it.affixes[it.locked] ? affixText(it.affixes[it.locked]) : F.unlocked),
    // A starlit unique or set has no reroll at all: its values are at their maximum and its affixes cannot be swapped.
    blocked: (it) => (it.starlit && (it.rarity === 'unique' || it.rarity === 'set') ? F.starlitMaxed : undefined),
  });
  // Greyed rows (starlit uniques and sets) cannot be rerolled, so they alone are nothing to reroll.
  if (!itemRows().some((r) => !r.disabled)) { void h.say(F.nothingToReroll); return; }

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
  const itemLine = (it: ItemInstance) => nameLine(game.state, it);
  const affixLines = (it: ItemInstance) => it.affixes.map((a, i) =>
    el('p', { text: i === it.locked ? `${affixText(a)}${T.gear.lockedAffix}` : affixText(a) }));

  const itemsView: MenuView = new MenuView(new Menu(itemRows()), {
    pick: (row) => { const it = find(Number(row.id.slice(1))); if (it) openAffixes(it.uid); },
    moved: () => { h.ctx.sfx.cursor(); show(); },
    cancel: () => { info.remove(); h.pop(); },
  }, GEAR_ROWS);
  shows.push(() => {
    const it = find(Number(itemsView.menu.current()?.id.slice(1)));
    info.replaceChildren(...(it ? [itemLine(it), ...affixLines(it)] : []));
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
      info.replaceChildren(...(it ? [itemLine(it), ...affixLines(it), ...(it.locked !== undefined ? [el('p', { class: 'slx-desc', text: F.lockedOther })] : [])] : []));
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
        // A region material's row carries that material's icon once it is published.
        const row = (id: string, label: string): MenuItem => {
          const mat = how(id).mat;
          const icon = mat ? lateArt(h.ctx.art, art.icon(mat)) : undefined;
          return { ...plainRow(id, label), ...(icon ? { icon } : {}) };
        };
        const plainRow = (id: string, label: string): MenuItem => {
          const o = how(id);
          // A starlit piece's affixes are at their maximum: its value reroll is greyed out and says so (the engine refuses it).
          if (!o.swap && it.starlit) return { id, label, disabled: true, right: F.starlitMaxed, note: F.starlitMaxed };
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
          }), ...spotPins().map((spot) => row(`mat:${SPOT_OF[spot]}`,
            F.rerollWith(`${MATERIALS[SPOT_OF[spot]].name}${T.ui2.gather.pinQty(GATHER_PIN_QTY)}`, T.forge.group[spot])))] : []),
          ...inscribeRows(it),
        ];
      };
      /**
       * 銘刻 (roster plan Task C4): one row for each live species whose signature the stores hold, on a piece that is not
       * special, with its signature's icon; a key the slot cannot take, or one on another affix, is greyed out with why.
       */
      const inscribeRows = (it: ItemInstance): MenuItem[] => (it.special ? [] : inscribable(game.state).map((species): MenuItem => {
        const id = `ins:${species}`;
        const icon = lateArt(h.ctx.art, art.icon(signatureOf(species)!));
        const label = F.inscribeWith(ENEMIES[species].name);
        // One inscription a piece (PR C review L3): only the old inscription's affix takes a new one.
        const old = inscriptionAffix(it);
        const why = old >= 0 && old !== index ? F.inscribeOld : inscribeFits(it, index, species) ? null : T.reasons.none;
        const base: MenuItem = why === null
          ? { id, label, right: T.ui2.forge.costGold(inscribeCost(it, species)!.gold) }
          : { id, label, disabled: true, right: why, note: why };
        return { ...base, ...(icon ? { icon } : {}) };
      }));
      /**
       * Gathering plan ruling 14: while gathering is open, after the region materials, each region's spot the stores hold
       * GATHER_PIN_QTY of pins that region's affixes (spec §7.3), in the regions' order; a spot held fewer is not listed.
       */
      function spotPins(): (typeof SPOT_REGIONS)[number][] {
        if (!gatherOpen(game.state)) return [];
        return SPOT_REGIONS.filter((r) => (game.state.inventory[SPOT_OF[r]] ?? 0) >= GATHER_PIN_QTY);
      }
      const insOf = (id: string | undefined): string | undefined => (id?.startsWith('ins:') ? id.slice(4) : undefined);
      const mview: MenuView = new MenuView(new Menu(methods()), {
        pick: (row) => {
          const it = find(itemUid);
          if (!it) return;
          const species = insOf(row.id);
          if (species) { askInscribe(it, species); return; }
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
        const species = insOf(cur?.id);
        if (species) {
          // 銘刻: what the affix becomes, its range, the cost, and the lock it takes.
          const key = ENEMIES[species].inscribe!;
          const [lo, hi] = rerollRange({ ...it, starlit: undefined, affixes: it.affixes.map((a, i) => (i === index ? { key, value: 0 } : a)) }, index)!;
          info.replaceChildren(...[
            itemLine(it), el('p', { text: F.rerollNow(affixText(it.affixes[index])) }),
            el('p', { text: F.inscribeTo(T.gear.statName[key], ENEMIES[species].name) }), el('p', { text: F.rerollRange(key, lo, hi) }),
            el('p', {}, richNodes(costText(game.state, inscribeCost(it, species)!))),
            ...(it.locked === undefined ? [el('p', { class: 'slx-desc', text: F.lockWarn })] : []),
          ]);
          return;
        }
        const o = how(cur?.id ?? 'value');
        const lines = [itemLine(it), el('p', { text: F.rerollNow(affixText(it.affixes[index])) })];
        if (o.swap) lines.push(el('p', { text: F.rerollPool(swapPool(it, index, o.mat).map((k) => T.gear.statName[k]).join('、')) }));
        else if (it.starlit) lines.push(el('p', { class: 'slx-desc', text: F.starlitMaxed }));
        else { const r = rerollRange(it, index); if (r) lines.push(el('p', { text: F.rerollRange(it.affixes[index].key, r[0], r[1]) })); }
        const refused = !o.swap && it.starlit;
        if (!refused) lines.push(el('p', {}, richNodes(costText(game.state, rerollCost(it, o)))));
        if (it.locked === undefined && !refused) lines.push(el('p', { class: 'slx-desc', text: F.lockWarn }));
        info.replaceChildren(...lines);
      });
      show();
      h.push({ el: win('slx-list slx-forge-list slx-reroll-list', [mview.el]), onAction: (a) => mview.onAction(a) });

      /** 銘刻: refused with what is short, else asked first (否 under the cursor), with the lock warning on a first reroll. */
      const askInscribe = (it: ItemInstance, species: string) => {
        const lack = lackingNames(game.state, inscribeCost(it, species)!);
        if (lack.length) { h.ctx.sfx.error(); void h.say(F.lackNames(lack)); return; }
        const ask = fill2(F.askInscribe, [gearPart(it)], [affixText(it.affixes[index])]);
        const box = confirmBox(it.locked === undefined ? [...ask, `\n${F.lockWarn}`] : ask, (yes) => {
          h.pop(!yes);
          if (!yes) return;
          const r = game.inscribe(itemUid, index, species);
          if (r.ok) { shows.pop(); h.pop(true); refresh(); show(); }
          h.afterAct(r, (out) => fill2(F.inscribed, [affixText(out.before)], [affixText(out.after)]));
        });
        box.view.menu.setCursor(1);
        box.view.render();
        h.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
      };

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
          return fill2(F.rerolled, [from], [better === 0 ? to : { text: F.rerollTrend(to, better > 0), cls: better > 0 ? 'slx-up' : 'slx-down' }]);
        }, () => better < 0);
      };
    }
  }

  show();
  h.layerRoot.append(info);
  h.push({ el: win('slx-list slx-forge-list', [itemsView.el]), onAction: (a) => itemsView.onAction(a) });
}

/** The tiers a fusion starts from, in order: each becomes the next one up. */
const FUSE_FROM = ['common', 'magic', 'rare'] as const;

/**
 * 合成: pick a tier first (each row says 普通 ×3 → 魔法 and counts the bag's pieces of it; fewer than three is greyed
 * out), then exactly three distinct pieces of that tier (Enter or a click toggles 已選; a fourth is refused), then the
 * slot (隨機欄位, or one of `fuseSlots`, each with its extra cost as have/need), then a confirm that says what comes out.
 * The tier is picked before the items so the list is only ever one rarity and the three pieces cannot disagree. The
 * confirm opens on 否 every time: a fusion eats three pieces for good.
 */
export function fusePage(h: ForgeHost): void {
  const game = h.ctx.game;
  const F = T.ui2.forge;
  const bagOf = (r: Rarity): ItemInstance[] => game.state.bag.filter((it) => it.rarity === r);
  /** Replace a list's rows in place, keeping the cursor where it was (or on a live row). */
  const sync = (view: MenuView, next: MenuItem[]) => {
    view.menu.items.splice(0, view.menu.items.length, ...next);
    const here = view.menu.items[view.menu.cursor];
    if (!here || here.disabled) { const k = next.findIndex((x) => !x.disabled); if (k >= 0) view.menu.setCursor(k); }
    view.render();
  };

  const tierRows = (): MenuItem[] => FUSE_FROM.map((r): MenuItem => {
    const n = bagOf(r).length;
    return { id: r, label: F.fuseTier(r, FUSE_NEXT[r]), right: String(n), disabled: n < 3 };
  });
  const tiers: MenuView = new MenuView(new Menu(tierRows()), {
    pick: (row) => openPicks(row.id as typeof FUSE_FROM[number]),
    moved: () => h.ctx.sfx.cursor(),
    cancel: () => h.pop(),
  }, 12);
  h.push({ el: win('slx-list slx-forge-list slx-forge-pick', [tiers.el]), onAction: (a) => tiers.onAction(a) });

  function openPicks(from: typeof FUSE_FROM[number]): void {
    const picked = new Set<number>();
    const rows = (): MenuItem[] => [
      { id: 'go', label: F.fuseGo(picked.size), disabled: picked.size !== 3 },
      ...forgeRows(game.state, { worn: false, art: h.ctx.art, filter: (it) => it.rarity === from, right: (it) => (picked.has(it.uid) ? F.picked : '') }),
    ];
    const v: MenuView = new MenuView(new Menu(rows()), {
      pick: (row) => {
        if (row.id === 'go') { if (picked.size === 3) openSlots(from, [...picked]); return; }
        const uid = Number(row.id.slice(1));
        if (picked.has(uid)) picked.delete(uid);
        else if (picked.size >= 3) { h.ctx.sfx.error(); return; }
        else picked.add(uid);
        sync(v, rows());
      },
      moved: () => h.ctx.sfx.cursor(),
      cancel: () => h.pop(),
    }, GEAR_ROWS);
    h.push({ el: win('slx-list slx-forge-list slx-forge-pick', [v.el]), onAction: (a) => v.onAction(a) });
  }

  function openSlots(from: typeof FUSE_FROM[number], uids: number[]): void {
    const target = FUSE_NEXT[from];
    const inputs = uids.map((u) => game.state.bag.find((it) => it.uid === u)).filter((it): it is ItemInstance => !!it);
    const ilvl = Math.floor(inputs.reduce((sum, it) => sum + it.ilvl, 0) / Math.max(1, inputs.length));
    const short = (slot?: GearSlot): string => richText(costText(game.state, fuseCost(target, slot)));
    const rows: MenuItem[] = [
      { id: 'random', label: F.randomSlot, right: short() },
      ...fuseSlots(target).map((slot): MenuItem => ({ id: slot, label: T.slotKind[slot], right: short(slot) })),
    ];
    const v: MenuView = new MenuView(new Menu(rows), {
      pick: (row) => {
        const slot = row.id === 'random' ? undefined : (row.id as GearSlot);
        const cost = fuseCost(target, slot);
        const lack = lackingNames(game.state, cost);
        if (lack.length) { h.ctx.sfx.error(); void h.say(F.lackNames(lack)); return; }
        const result: RichPart = { text: T.rarity[target], cls: `slx-rarity-${target}` };
        const ask: Rich = [
          ...fillRich(F.askFuse, [result]),
          `\n${F.fuseIlvl(ilvl)}`,
          `\n${slot === undefined ? F.fuseRandom : F.fuseRandomIn(T.slotKind[slot])}`,
          `\n${F.fuseRegionNote}`,
          `\n${F.fuseNeed}`,
          ...costText(game.state, cost),
          ...(inputs.some(invested) ? [`\n${F.warnFuse}`] : []),
        ];
        const box = confirmBox(ask, (yes) => {
          h.pop(!yes);
          if (yes) run(slot);
        });
        box.view.menu.setCursor(1);
        box.view.render();
        h.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
      },
      moved: () => h.ctx.sfx.cursor(),
      cancel: () => h.pop(),
    }, 12);
    h.push({ el: win('slx-list slx-forge-list slx-forge-pick', [v.el]), onAction: (a) => v.onAction(a) });

    const run = (slot?: GearSlot) => {
      const r = game.fuse(uids, slot);
      if (r.ok) h.popAll();
      h.afterAct(r, (out) => fillRich(F.fused, [gearPart(out.item)]));
      if (r.ok) h.ctx.sfx.loot?.(r.out.item.rarity);
    };
  }
}

/** Why a rune fusion cannot go, in words (engine/runeTrade RuneFuseFail; gold and the rest read as T.reasons). */
function runeFuseWhy(s: GameState, r: RuneRef, reason: RuneFuseFail | 'phase'): string {
  const F = T.rune.fail;
  if (reason === 'stock') return F.fuseStock(bagCount(s, r), RUNE_FUSE_IN);
  if (reason === 'essence') return F.essence(MATERIALS[fuseCostOf(r)!.essence]?.name ?? '');
  if (reason === 'full') return F.full(RUNE_STACK);
  if (reason === 'top') return F.top;
  return T.reasons[reason] ?? T.reasons.invalid;
}

/** A rune fusion as one line: 「3 個擴散（普通）＋30 G＋普通精華 → 擴散（魔法）」. */
function runeFuseLine(r: RuneRef): string {
  const c = fuseCostOf(r)!;
  return T.rune.fuseLine(RUNE_FUSE_IN, T.rune.label(r.id, r.tier), c.gold, MATERIALS[c.essence]?.name ?? c.essence, T.rune.label(c.to.id, c.to.tier));
}

/**
 * 符文合成 (plan 8f Task 5): every rune in the bag that can fuse higher, one row each, 「擴散（普通）」 with 「持有 4」 on
 * the right (持有 counts the socketed ones, plan 8f ruling 13). A row the bag cannot pay for shows the reason in place of
 * 持有, in `slx-lack` (the 262px forge list has no room for both beside the label): 袋子 2／需要 3, the gold, the essence by
 * name, or the next tier full. Such a row still takes the cursor, as 製作's rows do, so its recipe and bag count can be
 * read; Enter on it says why and asks nothing. The detail follows the cursor: the fusion as one line, the bag's count,
 * the reason when it cannot go, the socketed note and what the next tier does. Enter asks first (否 under the cursor), then
 * fuses; the list stays open for the next one. With nothing to fuse, the tab says how fusion works.
 */
export function runeFusePage(h: ForgeHost): void {
  const game = h.ctx.game;
  const R = T.rune;
  const fusable = (): RuneRef[] => bagRunes(game.state).filter((r) => fuseCostOf(r) !== undefined);
  if (!fusable().length) { void h.say(R.fuseEmpty); return; }
  const blocked = (r: RuneRef): string | undefined => { const f = fuseRunes(game.state, r); return f.ok ? undefined : runeFuseWhy(game.state, r, f.reason); };
  const rows = (): MenuItem[] => fusable().map((r) => {
    const why = blocked(r);
    return {
      id: `fuse:${runeKey(r)}`, label: R.label(r.id, r.tier), cls: rarityClass({ rarity: r.tier }),
      ...(why ? { right: why, rightClass: 'slx-lack' } : { right: T.ui2.shop.owned(ownedCount(game.state, r)) }),
    };
  });
  const refOf = (id?: string): RuneRef | null => (id ? parseRuneKey(id.slice(id.indexOf(':') + 1)) : null);
  const info = win('slx-info slx-rune-fuse-info');
  const show = () => {
    const r = refOf(v.menu.current()?.id);
    const c = r && fuseCostOf(r);
    if (!r || !c) { info.replaceChildren(); return; }
    const bag = bagCount(game.state, r);
    const worn = ownedCount(game.state, r) - bag;
    const why = blocked(r);
    info.replaceChildren(
      el('p', { class: `slx-name-line ${rarityClass({ rarity: r.tier })}`, text: R.label(r.id, r.tier) }),
      el('p', { text: runeFuseLine(r) }),
      el('p', { text: R.bag(bag) }),
      ...(why ? [el('p', { class: 'slx-lack', text: why })] : []),
      ...(worn > 0 ? [el('p', { class: 'slx-desc', text: R.socketedNote(worn) })] : []),
      el('p', { class: 'slx-desc', text: RUNES[c.to.id].text(c.to.tier) }),
    );
  };
  const sync = () => {
    const next = rows();
    v.menu.items.splice(0, v.menu.items.length, ...next);
    if (v.menu.cursor >= next.length) v.menu.setCursor(Math.max(0, next.length - 1));
    v.render(); show();
  };
  const run = (r: RuneRef) => {
    const res = game.fuseRune(r);
    if (!res.ok) { h.ctx.sfx.error(); void h.say(runeFuseWhy(game.state, r, res.reason)); return; }
    if (fusable().length) sync(); else { info.remove(); h.pop(true); }
    h.afterAct(res, (out) => [{ text: R.fused(R.label(out.id, out.tier)), cls: rarityClass({ rarity: out.tier }) }]);
  };
  const v: MenuView = new MenuView(new Menu(rows()), {
    pick: (item) => {
      const r = refOf(item.id);
      if (!r) return;
      // A row that cannot be fused says why and asks nothing (as 製作's rows the stores cannot cover).
      const why = blocked(r);
      if (why) { h.ctx.sfx.error(); void h.say(why); return; }
      const box = confirmBox(R.askFuse(runeFuseLine(r)), (yes) => {
        h.pop(!yes);
        if (yes) run(r);
      });
      box.view.menu.setCursor(1);
      box.view.render();
      h.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
    },
    moved: () => { h.ctx.sfx.cursor(); show(); },
    cancel: () => { info.remove(); h.pop(); },
  }, GEAR_ROWS);
  show();
  h.layerRoot.append(info);
  h.push({ el: win('slx-list slx-forge-list', [v.el]), onAction: (a) => v.onAction(a) });
}
