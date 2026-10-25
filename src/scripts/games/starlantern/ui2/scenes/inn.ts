import { CHARACTERS } from '../../data/characters';
import { T } from '../../data/text.zh-TW';
import type { CharacterId } from '../../engine/types';
import type { GameState } from '../../engine/state';
import { hasSpent, innCost, respecPrice, revive, reviveCost } from '../../engine/town';
import { el } from '../../ui/dom';
import { Menu, type MenuItem } from '../menu';
import type { UiAction } from '../input';
import type { SceneCtx } from '../scene';
import { MenuView, confirmBox, win } from '../widgets';
import { bondOpen, today } from '../../engine/story/bond';
import type { Companion } from '../../data/story/bond';
import { FacilityScene } from './facility';

/** The 新 mark in a list's right column (as the handbook's), or nothing. */
const freshRight = (on: boolean): Pick<MenuItem, 'right' | 'rightClass'> => (on ? { right: T.ui2.handbook.fresh, rightClass: 'slx-fresh' } : {});
/** Bond plan Task 12: a heart-to-heart open and today's talk not had: the inn's 夥伴 and the town's 旅館 say 新. */
export const innTalkWaits = (s: GameState): boolean => !today(s).talked && bondOpen(s).length > 0;

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
    return [{ id: 'rest', label: T.ui2.inn.rest(innCost(this.ctx.game.state.party)) }, { id: 'revive', label: T.ui2.inn.revive }, { id: 'respec', label: T.ui2.inn.respec }, { id: 'builds', label: T.ui2.inn.builds },
      // bond plan Task 12 (spec §0 D9): one entry for the bond, 新 while something waits there
      { id: 'partners', label: T.ui2.inn.partners, ...freshRight(this.talkWaits()) }];
  }

  /** A heart-to-heart is open and today's talk not had yet (the 新 of 夥伴 and 談心; the town's inn reads it too). */
  private talkWaits(): boolean {
    return innTalkWaits(this.ctx.game.state);
  }

  /** 夥伴 (bond plan Task 12): its one list; Task 13 adds the gifts and the night walk to it. */
  private partnersList(): void {
    const v = new MenuView(new Menu([{ id: 'talk', label: T.ui2.inn.talk, ...freshRight(this.talkWaits()) }]), {
      pick: (it) => { if (it.id === 'talk') this.talkList(); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-list', [v.el]), onAction: (a) => v.onAction(a) });
  }

  /** 談心: today's had, or nobody waits, said; else who has a talk waiting, each 新. */
  private talkList(): void {
    const s = this.ctx.game.state;
    if (today(s).talked) { this.popAll(); void this.say(T.ui2.inn.talkedToday); return; }
    const ids = bondOpen(s);
    if (!ids.length) { this.popAll(); void this.say(T.ui2.inn.nobodyToTalk); return; }
    const v = new MenuView(new Menu(ids.map((id) => { const c = id.split(':')[1] as Companion; return { id: c, label: CHARACTERS[c].name, ...freshRight(true) }; })), {
      pick: (it) => void this.talkWith(it.id as Companion),
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-list', [v.el]), onAction: (a) => v.onAction(a) });
  }

  /** Her talk, opened by the player: it plays whatever the story setting says (controller ruling, 2026-10-25). */
  private async talkWith(c: Companion): Promise<void> {
    this.popAll();
    const id = this.ctx.game.openBond(c);
    if (!id) { void this.say(T.ui2.inn.talkedToday); return; }
    await this.play(id, { mode: 'all' });
    this.refresh();
  }

  protected onCommand(id: string): void {
    if (id === 'partners') this.partnersList();
    else if (id === 'rest') this.askRest();
    else if (id === 'respec') this.respecList();
    else if (id === 'builds') this.ctx.go('builds');
    else this.reviveList();
  }

  /** Members with nothing spent are greyed out (as the revive list leaves out who is up); with none to reset, it says so. */
  private respecList(): void {
    const p = this.ctx.game.state.party;
    if (!p.recruited.some((id) => hasSpent(p.roster[id]))) { void this.say(T.ui2.inn.nothingToReset); return; }
    const v = new MenuView(new Menu(p.recruited.map((id) => ({ id, label: CHARACTERS[id].name, right: respecPrice(p.roster[id]) === 0 ? T.ui2.inn.free : `${respecPrice(p.roster[id])} G`, disabled: !hasSpent(p.roster[id]) }))), {
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
    const cost = respecPrice(this.ctx.game.state.party.roster[id]);
    const box = confirmBox(T.ui2.inn.askRespec(name, cost), (yes) => {
      if (!yes) { this.pop(); return; }
      const r = this.ctx.game.respec(id);
      this.popAll();
      if (!r.ok) { this.fail(r.reason); return; }
      this.refresh();
      // The respec saved (or failed to) like a night's rest: say which here, and leave no notice for the town to repeat.
      const saved = this.ctx.game.notice === 'saved';
      this.ctx.game.notice = null;
      void this.say(saved ? T.ui2.inn.respecDone(name) : T.ui2.inn.respecSaveFailed(name), saved ? 'happy' : 'normal');
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
