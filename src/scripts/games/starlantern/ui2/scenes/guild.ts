import { CHARACTERS } from '../../data/characters';
import { T } from '../../data/text.zh-TW';
import { MAX_ACTIVE } from '../../engine/formation';
import { activeIds } from '../../engine/party';
import type { CharacterId } from '../../engine/types';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import { standeeImg } from '../../ui/art';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, confirmBox, win } from '../widgets';
import { FacilityScene } from './facility';

const name = (id: CharacterId) => CHARACTERS[id].name;

/** Guild: recalling companions met in the labyrinth; formation, equipment and the character sheet open their own screens. */
export class GuildScene extends FacilityScene {
  constructor(ctx: SceneCtx, cps?: number) { super(ctx, 'guild', cps); }

  /** Met, off the field and not the hero: who the guild can recall. */
  private waiting(): CharacterId[] {
    const p = this.ctx.game.state.party;
    return p.recruited.filter((id) => id !== 'hero' && !p.grid.includes(id));
  }

  protected commands(): MenuItem[] {
    const g = T.ui2.guild;
    return [{ id: 'formation', label: g.formation }, { id: 'recall', label: g.recall, disabled: this.waiting().length === 0 }, { id: 'equip', label: g.equip }, { id: 'status', label: g.status }, { id: 'tree', label: g.tree }, { id: 'talent', label: g.talent }];
  }

  protected onCommand(id: string): void {
    if (id === 'recall') this.recallList();
    else if (id === 'formation' || id === 'equip' || id === 'status') this.ctx.go(id);
    else if (id === 'tree' || id === 'talent') this.ctx.go('status', `tab:${id}`);
  }

  private faceIcon(id: CharacterId): string | undefined {
    return this.ctx.art.has(art.portrait(id, 'normal')) ? art.portrait(id, 'normal') : undefined;
  }

  private recallList(): void {
    const ids = this.waiting();
    const info = win('slx-info');
    this.info = info;
    const show = (id: CharacterId | undefined) => this.showInfo(id);
    const v = new MenuView(new Menu(ids.map((id) => ({ id, label: `${CHARACTERS[id].title} ${name(id)}`, icon: this.faceIcon(id) }))), {
      pick: (it) => { this.ctx.sfx.confirm(); this.askRecall(it.id as CharacterId); },
      moved: () => { this.ctx.sfx.cursor(); show(v.menu.current()?.id as CharacterId); },
      cancel: () => { info.remove(); this.info = undefined; this.pop(); },
    });
    show(ids[0]);
    this.stage.append(info);
    this.push({ el: win('slx-list', [v.el]), onAction: (a) => v.onAction(a) });
  }

  private info: HTMLElement | undefined;

  /** The info pane for `id`; `out` retitles it when the question is who steps out, not who comes back. */
  private showInfo(id: CharacterId | undefined, out = false): void {
    if (!id || !this.info) return;
    this.info.classList.toggle('slx-info-swap', out);
    this.info.replaceChildren(...[standeeImg(this.ctx.art, id)].filter((n): n is HTMLImageElement => !!n),
      el('p', { text: out ? T.ui2.guild.swapOut(name(id)) : `${CHARACTERS[id].title} ${name(id)}` }), el('p', { class: 'slx-desc', text: T.ui2.guild.roles[id] }));
  }

  private askRecall(id: CharacterId): void {
    const box = confirmBox(T.ui2.guild.recallAsk(name(id)), (yes) => {
      this.pop();
      if (!yes) return;
      if (activeIds(this.ctx.game.state.party).length < MAX_ACTIVE) this.finishRecall(id);
      else this.swapList(id);
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }

  /** The field is full: who goes back to waiting (never the hero). */
  private swapList(id: CharacterId): void {
    const ids = activeIds(this.ctx.game.state.party).filter((x) => x !== 'hero');
    const v = new MenuView(new Menu(ids.map((x) => ({ id: x, label: `${CHARACTERS[x].title} ${name(x)}`, icon: this.faceIcon(x) }))), {
      pick: (it) => { this.ctx.sfx.confirm(); this.finishRecall(id, it.id as CharacterId); },
      moved: () => { this.ctx.sfx.cursor(); this.showInfo(v.menu.current()?.id as CharacterId, true); },
      cancel: () => { this.showInfo(id); this.pop(); },
    });
    this.showInfo(ids[0], true);
    this.push({ el: win('slx-list', [el('p', { text: T.ui2.guild.swapWho }), v.el]), onAction: (a) => v.onAction(a) });
  }

  private finishRecall(id: CharacterId, out?: CharacterId): void {
    if (!this.ctx.game.recall(id, out).ok) { this.ctx.sfx.error(); return; }
    this.popAll();
    this.stage.querySelector('.slx-info')?.remove();
    this.info = undefined;
    this.refresh();
    void this.say(T.ui2.guild.welcomeBack(name(id)), 'happy');
  }
}
