import { BASE_RECIPES, CONSUMABLE_RECIPES, CRAFT_MAGIC_CHANCE, type Cost } from '../../data/forge';
import { GATHER_RECIPES, TOOL_LEVELS, gatherOpen } from '../../data/gather';
import { GATHER_TEXT } from '../../data/gather.zh-TW';
import { toolCost } from '../../engine/forge/gatherTools';
import { SETS, SPECIALS, codexName } from '../../data/gear';
import { ENEMIES } from '../../data/enemies';
import { ITEMS } from '../../data/items';
import { REGIONS } from '../../data/regions';
import { T } from '../../data/text.zh-TW';
import { specialLines } from '../../engine/compare';
import { baseCost, craftLevel, itemRecipeCost, ownCost, ownUniques, ownerFelled, setCost } from '../../engine/forge/craft';
import { BAG_SIZE } from '../../engine/loot/bag';
import type { GameState } from '../../engine/state';
import { priceOf } from '../../engine/town';
import type { GearSlot } from '../../engine/types';
import { art, codexArtId } from '../../render/artPaths';
import { el } from '../../ui/dom';
import { gearIconLate } from '../gearArt';
import { lateArt } from '../lateArt';
import { fillRich, gearPart } from '../loot';
import { Menu, type MenuItem } from '../menu';
import { GEAR_ROWS, MenuView, QtyView, confirmBox, richNodes, win, type Rich } from '../widgets';
import { costText, lackingNames, type ForgeHost } from './forge';

/** The most of one consumable a single craft makes, as in the shop. */
const QTY_CAP = 99;

/** A recipe row. A row the stores cannot cover stays selectable (its detail is still worth reading): its right text ends with （不足） in `slx-lack`. */
function recipeRow(s: GameState, o: { id: string; label: string; cost: Cost; cls?: string; shop?: number }): MenuItem {
  const short = lackingNames(s, o.cost).length > 0;
  // The row is a short line (the gold); every material's have／need is in the detail beside the list.
  const plain = T.ui2.forge.costGold(o.cost.gold);
  const text = o.shop === undefined ? plain : T.ui2.forge.craftRow(o.shop, plain);
  return { id: o.id, label: o.label, cls: o.cls, right: short ? `${text}${T.ui2.forge.lacking}` : text, rightClass: short ? 'slx-lack' : undefined };
}

/** The reason a craft is refused, with what is short named. Empty when the stores cover it. */
function refusal(s: GameState, c: Cost): string {
  const names = lackingNames(s, c);
  if (!names.length) return '';
  const matsShort = Object.entries(c.mats).some(([id, need]) => (s.inventory[id] ?? 0) < need);
  return T.ui2.forge.craftLack(matsShort ? T.reasons.mats : T.reasons.gold, names);
}

const costLine = (s: GameState, c: Cost) => el('p', {}, richNodes([T.ui2.forge.craftNeed, ...costText(s, c)]));

/**
 * 製作: three categories (four once a roster boss or warden is live: 專屬裝備, roster plan Task C4). 消耗品 shows the shop price beside the craft cost and asks how many (a quantity box capped at
 * what the stores can pay for, and at 99); 底材 is one row per slot and 套裝 is a set, then its pieces. Both of those
 * ask first with 否 under the cursor. A row that cannot be paid for stays readable and says why when picked.
 */
export function openCraft(h: ForgeHost): void {
  const game = h.ctx.game;
  const F = T.ui2.forge;
  /** A set row shows its first piece's gear icon, a piece row its own, once published and loaded. */
  const gearIcon = (id: string): Pick<MenuItem, 'icon' | 'iconCls'> => ({ icon: gearIconLate(h.ctx.art, codexArtId(id)), iconCls: 'slx-gear-ico' });

  /**
   * One list layer sharing the page's detail window; the detail follows the cursor, Esc pops and runs `back`. `shown` is how
   * many rows are on screen (fewer for gear with its icons).
   */
  function layer(info: HTMLElement, o: {
    rows(): MenuItem[]; detail(id: string): HTMLElement[]; pick(it: MenuItem, refresh: () => void): void; back(): void; shown?: number;
  }): { show(): void } {
    const show = () => { const c = v.menu.current(); info.replaceChildren(...(c ? o.detail(c.id) : [])); };
    const refresh = () => {
      v.menu.items.splice(0, v.menu.items.length, ...o.rows());
      if (v.menu.cursor >= v.menu.items.length) v.menu.setCursor(v.menu.items.length - 1);
      v.render();
      show();
    };
    const v: MenuView = new MenuView(new Menu(o.rows()), {
      pick: (it) => o.pick(it, refresh),
      moved: () => { h.ctx.sfx.cursor(); show(); },
      cancel: () => { h.pop(); o.back(); },
    }, o.shown ?? 12);
    show();
    h.push({ el: win('slx-list slx-forge-list slx-craft-list', [v.el]), onAction: (a) => v.onAction(a) });
    return { show };
  }

  /** Ask first (否 under the cursor), then run. */
  const ask = (question: Rich, run: () => void) => {
    const box = confirmBox(question, (yes) => {
      h.pop(!yes);
      if (yes) run();
    });
    box.view.menu.setCursor(1);
    box.view.render();
    h.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  };
  /** The shared refusals: a full bag, then whatever is short. True when the craft may go ahead. */
  const ready = (cost: Cost, needsRoom: boolean): boolean => {
    if (needsRoom && game.state.bag.length >= BAG_SIZE) { h.afterAct({ ok: false, reason: 'full' }, () => []); return false; }
    const why = refusal(game.state, cost);
    if (why) { h.ctx.sfx.error(); void h.say(why); return false; }
    return true;
  };

  const newInfo = (): HTMLElement => { const info = win('slx-info slx-craft-info'); h.layerRoot.append(info); return info; };

  /**
   * A consumable row's id: the item's own for its first recipe, `<item>@gather` for its second, from gathered goods (gathering
   * plan ruling 21), so no two rows share an id.
   */
  const recipeOf = (rowId: string): { id: string; alt: boolean } => {
    const [id, how] = rowId.split('@');
    return { id, alt: how === 'gather' };
  };
  const consumables = () => {
    const info = newInfo();
    const G = T.ui2.gather;
    // Gathering spec §10.5: while gathering is open, each item with a second recipe has a row for it under its own.
    const rowIds = () => Object.keys(CONSUMABLE_RECIPES).flatMap((id) => (gatherOpen(game.state) && GATHER_RECIPES[id] ? [id, `${id}@gather`] : [id]));
    const nameOf = (rowId: string) => { const r = recipeOf(rowId); const name = ITEMS[r.id]?.name ?? r.id; return r.alt ? G.altTag(name) : name; };
    layer(info, {
      rows: () => rowIds().map((rowId) => {
        const r = recipeOf(rowId);
        return recipeRow(game.state, { id: rowId, label: nameOf(rowId), cost: itemRecipeCost(r.id, 1, r.alt)!, shop: priceOf(game.state, r.id) ?? 0 });
      }),
      detail: (rowId) => {
        const { id, alt } = recipeOf(rowId);
        return [
          el('p', { class: 'slx-name-line', text: nameOf(rowId) }),
          el('p', { class: 'slx-desc', text: ITEMS[id]?.desc ?? '' }),
          el('p', { text: F.craftShop(priceOf(game.state, id) ?? 0) }),
          costLine(game.state, itemRecipeCost(id, 1, alt)!),
        ];
      },
      pick: (it, refresh) => {
        const { id: itemId, alt } = recipeOf(it.id);
        const one = itemRecipeCost(itemId, 1, alt)!;
        if (!ready(one, false)) return;
        const s = game.state;
        const afford = [...Object.entries(one.mats).map(([m, n]) => Math.floor((s.inventory[m] ?? 0) / n)), ...(one.gold > 0 ? [Math.floor(s.gold / one.gold)] : [])];
        const q = new QtyView(Math.min(QTY_CAP, ...afford), {
          change: () => h.ctx.sfx.cursor(),
          done: (n) => {
            h.pop();
            const r = game.craftItem(itemId, n, alt);
            if (r.ok) refresh();
            h.afterAct(r, (out) => [F.craftedItem(ITEMS[out.id]?.name ?? out.id, out.qty)]);
          },
          cancel: () => h.pop(),
        }, one.gold);
        h.push({ el: q.el, onAction: (a) => q.onAction(a) });
      },
      back: () => info.remove(),
    });
  };

  const bases = () => {
    const info = newInfo();
    const slots = Object.keys(BASE_RECIPES) as GearSlot[];
    layer(info, {
      rows: () => slots.map((slot) => recipeRow(game.state, { id: slot, label: T.slotKind[slot], cost: baseCost(game.state, slot) })),
      detail: (id) => {
        const slot = id as GearSlot;
        return [
          el('p', { class: 'slx-name-line', text: T.slotKind[slot] }),
          el('p', { text: F.craftLevel(craftLevel(game.state)) }),
          el('p', { text: F.magicChance(Math.round(CRAFT_MAGIC_CHANCE * 100)) }),
          el('p', { class: 'slx-desc', text: F.craftBagRoom(Math.max(0, BAG_SIZE - game.state.bag.length)) }),
          costLine(game.state, baseCost(game.state, slot)),
        ];
      },
      pick: (it, refresh) => {
        const slot = it.id as GearSlot;
        const cost = baseCost(game.state, slot);
        if (!ready(cost, true)) return;
        ask([
          ...fillRich(F.askCraftBase, [T.slotKind[slot]]),
          `\n${F.craftLevel(craftLevel(game.state))}`,
          `\n${F.magicChance(Math.round(CRAFT_MAGIC_CHANCE * 100))}`,
          `\n${F.craftNeed}`,
          ...costText(game.state, cost),
        ], () => {
          const r = game.craftBase(slot);
          if (r.ok) refresh();
          h.afterAct(r, (out) => fillRich(F.crafted, [gearPart(out.item)]));
          if (r.ok) h.ctx.sfx.loot?.(r.out.item.rarity);
        });
      },
      back: () => info.remove(),
    });
  };

  const sets = () => {
    const info = newInfo();
    const setsLayer = layer(info, {
      shown: GEAR_ROWS,
      rows: () => Object.values(SETS).map((set): MenuItem => ({ id: set.id, label: codexName(set.id), right: REGIONS[set.region].name, ...gearIcon(set.id) })),
      detail: (id) => [
        el('p', { class: 'slx-name-line', text: codexName(id) }),
        ...specialLines(id).map((l) => el('p', { class: l.kind === 'lore' ? 'slx-desc' : '', text: l.text })),
      ],
      pick: (setRow) => {
        layer(info, {
          shown: GEAR_ROWS,
          rows: () => SETS[setRow.id].pieces.map((id) => ({ ...recipeRow(game.state, { id, label: codexName(id), cost: setCost(game.state, id)!, cls: 'slx-rarity-set' }), ...gearIcon(id) })),
          detail: (id) => [
            el('p', { class: 'slx-name-line slx-rarity-set', text: codexName(id) }),
            ...specialLines(id).map((l) => el('p', { class: l.kind === 'lore' ? 'slx-desc' : '', text: l.text })),
            el('p', { class: 'slx-desc', text: F.craftBagRoom(Math.max(0, BAG_SIZE - game.state.bag.length)) }),
            costLine(game.state, setCost(game.state, id)!),
          ],
          pick: (it, refresh) => {
            const cost = setCost(game.state, it.id)!;
            if (!ready(cost, true)) return;
            ask([
              ...fillRich(F.askCraftSet, [{ text: codexName(it.id), cls: 'slx-rarity-set' }]),
              `\n${F.craftNeed}`,
              ...costText(game.state, cost),
            ], () => {
              const r = game.craftSet(it.id);
              if (r.ok) refresh();
              h.afterAct(r, (out) => fillRich(F.crafted, [gearPart(out.item)]));
              if (r.ok) h.ctx.sfx.loot?.(r.out.item.rarity);
            });
          },
          back: () => setsLayer.show(),
        });
      },
      back: () => info.remove(),
    });
  };

  /**
   * 專屬裝備 (roster plan Task C4): each live boss's or warden's own unique. One whose owner the bestiary has never seen
   * felled is greyed out and says so; the rest read as any recipe does.
   */
  const owns = () => {
    const info = newInfo();
    const owner = (id: string) => ENEMIES[SPECIALS[id].owner!].name;
    layer(info, {
      shown: GEAR_ROWS,
      rows: () => ownUniques().map((id): MenuItem => {
        const gear = gearIcon(id);
        if (!ownerFelled(game.state, id)) {
          const why = F.unbeaten(owner(id));
          return { id, label: codexName(id), cls: 'slx-rarity-unique', disabled: true, right: why, note: why, ...gear };
        }
        return { ...recipeRow(game.state, { id, label: codexName(id), cost: ownCost(game.state, id)!, cls: 'slx-rarity-unique' }), ...gear };
      }),
      detail: (id) => [
        el('p', { class: 'slx-name-line slx-rarity-unique', text: codexName(id) }),
        el('p', { class: 'slx-dim', text: F.ownOf(owner(id)) }),
        ...specialLines(id).map((l) => el('p', { class: l.kind === 'lore' ? 'slx-desc' : '', text: l.text })),
        ...(ownerFelled(game.state, id) ? [] : [el('p', { class: 'slx-desc', text: F.unbeaten(owner(id)) })]),
        el('p', { class: 'slx-desc', text: F.craftBagRoom(Math.max(0, BAG_SIZE - game.state.bag.length)) }),
        costLine(game.state, ownCost(game.state, id)!),
      ],
      pick: (it, refresh) => {
        const cost = ownCost(game.state, it.id)!;
        if (!ready(cost, true)) return;
        ask([
          ...fillRich(F.askCraftSet, [{ text: codexName(it.id), cls: 'slx-rarity-unique' }]),
          `\n${F.craftNeed}`,
          ...costText(game.state, cost),
        ], () => {
          const r = game.craftOwnUnique(it.id);
          if (r.ok) refresh();
          h.afterAct(r, (out) => fillRich(F.crafted, [gearPart(out.item)]));
          if (r.ok) h.ctx.sfx.loot?.(r.out.item.rarity);
        });
      },
      back: () => info.remove(),
    });
  };

  /**
   * 採集工具 (gathering spec §6.3, §10.5): the two tools, `tool@1` and `tool@2`. One made reads 已打造 and is greyed out; the
   * second is greyed out with why until the first is made. Doran says his slot's line only when it has words.
   */
  const tools = () => {
    const info = newInfo();
    const G = T.ui2.gather;
    const levelOf = (rowId: string) => Number(rowId.split('@')[1]) as 1 | 2;
    const held = () => game.state.gather?.tool ?? 0;
    layer(info, {
      rows: () => TOOL_LEVELS.map((t): MenuItem => {
        const id = `tool@${t.level}`;
        const icon = lateArt(h.ctx.art, art.toolIcon(t.level));   // its icon once it has landed (gathering PR E)
        if (held() >= t.level) return { id, label: t.name, disabled: true, right: G.tools.made, note: G.tools.made, icon };
        if (held() !== t.needs) {
          const why = G.tools.needs(TOOL_LEVELS.find((x) => x.level === t.needs)!.name);
          return { id, label: t.name, disabled: true, right: T.reasons.locked, note: why, icon };   // short, so the name stays whole
        }
        return { ...recipeRow(game.state, { id, label: t.name, cost: t.cost }), icon };
      }),
      detail: (rowId) => {
        const level = levelOf(rowId);
        const t = TOOL_LEVELS.find((x) => x.level === level)!;
        return [
          el('p', { class: 'slx-name-line', text: t.name }),
          el('p', { class: 'slx-desc', text: G.tools.effect[level] }),
          ...(held() >= level ? [el('p', { text: G.tools.made })] : [costLine(game.state, toolCost(level)!)]),
        ];
      },
      pick: (it, refresh) => {
        const level = levelOf(it.id);
        const t = TOOL_LEVELS.find((x) => x.level === level)!;
        if (!ready(t.cost, false)) return;
        ask([F.askCraftSet(t.name), `\n${F.craftNeed}`, ...costText(game.state, t.cost)], () => {
          const r = game.craftTool(level);
          if (r.ok) refresh();
          const word = (level === 1 ? GATHER_TEXT.doran.made1 : GATHER_TEXT.doran.made2)[0];
          h.afterAct(r, () => [word ? `${G.made(t.name)}\n${word}` : G.made(t.name)]);
        });
      },
      back: () => info.remove(),
    });
    const word = GATHER_TEXT.doran.tools[0];
    if (word) void h.say(word);
  };

  // The own uniques' category is there only while some owner is live (nothing changes before the roster goes live); the
  // tools' only while gathering is open (gathering spec §10.5), last.
  const catIds = [...(ownUniques().length ? (['item', 'base', 'set', 'own'] as const) : (['item', 'base', 'set'] as const)), ...(gatherOpen(game.state) ? (['tool'] as const) : [])];
  const cats = new MenuView(new Menu(catIds.map((id) => ({ id, label: id === 'tool' ? T.ui2.gather.tools.row : F.craftCats[id] }))), {
    pick: (it) => (it.id === 'item' ? consumables() : it.id === 'base' ? bases() : it.id === 'own' ? owns() : it.id === 'tool' ? tools() : sets()),
    moved: () => h.ctx.sfx.cursor(),
    cancel: () => h.pop(),
  }, 12);
  h.push({ el: win('slx-list slx-forge-list', [cats.el]), onAction: (a) => cats.onAction(a) });
}
