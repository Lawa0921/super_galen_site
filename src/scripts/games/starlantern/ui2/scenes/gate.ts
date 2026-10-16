import { FLOORS } from '../../data/floors';
import { T } from '../../data/text.zh-TW';
import { terrainOf } from '../../engine/dungeon/run';
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

  /** Mainline floors only, until the portal plaza replaces this screen: every floor reached is a shortcut. */
  protected onCommand(): void {
    const reached = this.ctx.game.state.dungeon.reached.mainline;
    const depths = Array.from({ length: Math.max(FLOORS.length, reached) }, (_, i) => i + 1);
    const items = depths.map((d) => {
      const t = terrainOf('mainline', d);
      return {
        id: String(d), label: T.ui2.gate.floor(d, FLOORS[t - 1].name), disabled: d > reached,
        icon: this.ctx.art.has(art.bg(t)) ? art.bg(t) : undefined, right: d > reached ? T.ui2.gate.locked : '',
      };
    });
    const v = new MenuView(new Menu(items), {
      pick: (it) => { this.ctx.sfx.confirm(); this.askDepart(Number(it.id)); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-floors', [v.el]), onAction: (a) => v.onAction(a) });
  }

  private askDepart(n: number): void {
    const box = confirmBox(T.ui2.gate.ask(n, FLOORS[terrainOf('mainline', n) - 1].name), (yes) => {
      this.pop();
      if (!yes) return;
      const r = this.ctx.game.depart({ region: 'mainline', condition: 'plain' }, n);
      if (!r.ok) { this.popAll(); this.fail(r.reason); return; }
      this.ctx.go('dungeon');
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }
}
