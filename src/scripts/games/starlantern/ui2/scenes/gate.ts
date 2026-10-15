import { FLOORS } from '../../data/floors';
import { T } from '../../data/text.zh-TW';
import { art } from '../../render/artPaths';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, win } from '../widgets';
import { FacilityScene } from './facility';

export class GateScene extends FacilityScene {
  constructor(ctx: SceneCtx, cps?: number) { super(ctx, 'gate', cps); }

  protected commands(): MenuItem[] {
    return [{ id: 'floors', label: T.ui2.gate.choose }];
  }

  protected onCommand(): void {
    const reached = this.ctx.game.state.dungeon.reachedFloor;
    const items = FLOORS.map((f) => ({
      id: String(f.id), label: T.ui2.gate.floor(f.id, f.name), disabled: f.id > reached,
      icon: this.ctx.art.has(art.bg(f.id)) ? art.bg(f.id) : undefined, right: f.id > reached ? T.ui2.gate.locked : '',
    }));
    const v = new MenuView(new Menu(items), {
      pick: () => { this.ctx.sfx.confirm(); void this.say(T.ui2.gate.soon); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-floors', [v.el]), onAction: (a) => v.onAction(a) });
  }
}
