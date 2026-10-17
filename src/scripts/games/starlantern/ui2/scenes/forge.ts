import { CHARACTERS } from '../../data/characters';
import { T } from '../../data/text.zh-TW';
import type { ForgeResult } from '../../engine/forge/cost';
import { dismantleYield } from '../../engine/forge/forge';
import { SLOTS } from '../../engine/party';
import type { GameState } from '../../engine/state';
import type { ItemInstance } from '../../engine/types';
import { art } from '../../render/artPaths';
import { gearLabel, gearPart, joinParts } from '../loot';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, confirmBox, win, type Rich } from '../widgets';
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
  /** After a Game forge call: the ok line (happy) or the reason; then a failed save is reported, and the notice cleared. */
  afterAct<O>(r: ForgeResult<O>, okLine: (out: O) => Rich): void;
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
      afterAct: (r, okLine) => this.afterAct(r, okLine),
    };
  }

  private afterAct<O>(r: ForgeResult<O>, okLine: (out: O) => Rich): void {
    if (!r.ok) { this.fail(r.reason); return; }
    this.refresh();
    this.ctx.sfx.confirm();
    const said = this.say(okLine(r.out), 'happy');
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
