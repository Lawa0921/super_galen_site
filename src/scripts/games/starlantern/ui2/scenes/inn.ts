import { CHARACTERS } from '../../data/characters';
import { T } from '../../data/text.zh-TW';
import { innCost, revive, reviveCost } from '../../engine/town';
import { el } from '../../ui/dom';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, confirmBox, win } from '../widgets';
import { FacilityScene } from './facility';

export class InnScene extends FacilityScene {
  constructor(ctx: SceneCtx, cps?: number, private nightMs = 1200) { super(ctx, 'inn', cps); }

  protected commands(): MenuItem[] {
    return [{ id: 'rest', label: T.ui2.inn.rest(innCost(this.ctx.game.state.party)) }, { id: 'revive', label: T.ui2.inn.revive }];
  }

  protected onCommand(id: string): void {
    if (id === 'rest') this.askRest();
    else this.reviveList();
  }

  private askRest(): void {
    const cost = innCost(this.ctx.game.state.party);
    const box = confirmBox(T.ui2.inn.ask(cost), (yes) => {
      this.pop();
      if (!yes) return;
      const r = this.ctx.game.rest();
      if (!r.ok) { this.fail(r.reason); return; }
      void this.night();
    });
    box.view.menu.setCursor(1); box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }

  private async night(): Promise<void> {
    const veil = el('div', { class: 'slx-night', text: T.ui2.inn.morning });
    this.root.append(veil);
    await new Promise((r) => setTimeout(r, this.nightMs));
    veil.remove();
    this.refresh();
    const ok = this.ctx.game.notice === 'saved';
    this.ctx.game.notice = null;
    void this.say(ok ? T.ui2.inn.saved : T.ui2.inn.saveFailed, ok ? 'happy' : 'normal');
  }

  private reviveList(): void {
    const p = this.ctx.game.state.party;
    const down = p.recruited.filter((id) => p.roster[id].hp <= 0);
    if (!down.length) { void this.say(T.ui2.inn.nobodyDown); return; }
    const v = new MenuView(new Menu(down.map((id) => ({ id, label: CHARACTERS[id].name, right: `${reviveCost(p.roster[id].level)} G` }))), {
      pick: (it) => {
        const r = this.ctx.game.apply(revive(this.ctx.game.state, it.id as never));
        this.popAll();
        if (!r.ok) { this.fail(r.reason); return; }
        this.refresh();
        void this.say(T.ui2.inn.revived(it.label), 'happy');
      },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-list', [v.el]), onAction: (a) => v.onAction(a) });
  }
}
