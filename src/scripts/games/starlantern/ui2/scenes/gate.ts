import { FLOORS } from '../../data/floors';
import { T } from '../../data/text.zh-TW';
import { art } from '../../render/artPaths';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, confirmBox, win } from '../widgets';
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
      pick: (it) => { this.ctx.sfx.confirm(); this.askDepart(Number(it.id)); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-floors', [v.el]), onAction: (a) => v.onAction(a) });
  }

  private askDepart(n: number): void {
    const box = confirmBox(T.ui2.gate.ask(n, FLOORS[n - 1].name), (yes) => {
      this.pop();
      if (!yes) return;
      const r = this.ctx.game.depart(n);
      if (!r.ok) { this.popAll(); this.fail(r.reason); return; }
      this.ctx.go('dungeon');
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }
}
