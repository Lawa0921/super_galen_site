import { CHARACTERS } from '../../data/characters';
import { T } from '../../data/text.zh-TW';
import type { CharacterId } from '../../engine/types';
import { hasSpent, innCost, respecCost, revive, reviveCost } from '../../engine/town';
import { el } from '../../ui/dom';
import { Menu, type MenuItem } from '../menu';
import type { UiAction } from '../input';
import type { SceneCtx } from '../scene';
import { MenuView, confirmBox, win } from '../widgets';
import { FacilityScene } from './facility';

export class InnScene extends FacilityScene {
  private nightTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: SceneCtx, cps?: number, private nightMs = 1200) { super(ctx, 'inn', cps); }

  /** The night veil blocks the pointer; this blocks the keys. */
  onAction(a: UiAction): void {
    if (this.nightTimer) return;
    super.onAction(a);
  }

  exit(): void {
    if (this.nightTimer) clearTimeout(this.nightTimer);
    this.nightTimer = null;
    super.exit();
  }

  protected commands(): MenuItem[] {
    return [{ id: 'rest', label: T.ui2.inn.rest(innCost(this.ctx.game.state.party)) }, { id: 'revive', label: T.ui2.inn.revive }, { id: 'respec', label: T.ui2.inn.respec }];
  }

  protected onCommand(id: string): void {
    if (id === 'rest') this.askRest();
    else if (id === 'respec') this.respecList();
    else this.reviveList();
  }

  private respecList(): void {
    const p = this.ctx.game.state.party;
    const v = new MenuView(new Menu(p.recruited.map((id) => ({ id, label: CHARACTERS[id].name, right: `${respecCost(p.roster[id].level)} G` }))), {
      pick: (it) => {
        const m = this.ctx.game.state.party.roster[it.id as CharacterId];
        if (!hasSpent(m)) { this.popAll(); void this.say(T.ui2.inn.nothingToReset); return; }
        this.askRespec(it.id as CharacterId, it.label);
      },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-list', [v.el]), onAction: (a) => v.onAction(a) });
  }

  private askRespec(id: CharacterId, name: string): void {
    const cost = respecCost(this.ctx.game.state.party.roster[id].level);
    const box = confirmBox(T.ui2.inn.askRespec(name, cost), (yes) => {
      if (!yes) { this.pop(); return; }
      const r = this.ctx.game.respec(id);
      this.popAll();
      if (!r.ok) { this.fail(r.reason); return; }
      this.refresh();
      void this.say(T.ui2.inn.respecDone(name), 'happy');
    });
    box.view.menu.setCursor(1); box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
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
    const done = await new Promise<boolean>((r) => { this.nightTimer = setTimeout(() => r(true), this.nightMs); });
    if (!done) return;
    this.nightTimer = null;
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
