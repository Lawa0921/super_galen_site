import { CHARACTERS } from '../../data/characters';
import { T } from '../../data/text.zh-TW';
import type { ForgeResult } from '../../engine/forge/cost';
import { SLOTS } from '../../engine/party';
import type { GameState } from '../../engine/state';
import type { ItemInstance } from '../../engine/types';
import { art } from '../../render/artPaths';
import { gearLabel } from '../loot';
import type { MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import type { Rich } from '../widgets';
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
