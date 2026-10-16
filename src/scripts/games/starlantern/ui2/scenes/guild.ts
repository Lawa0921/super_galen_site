import { CHARACTERS, CHARACTER_IDS } from '../../data/characters';
import { T } from '../../data/text.zh-TW';
import { recruit } from '../../engine/party';
import type { CharacterId } from '../../engine/types';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import { standeeImg } from '../../ui/art';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, confirmBox, win } from '../widgets';
import { FacilityScene } from './facility';

const name = (id: CharacterId) => CHARACTERS[id].name;

/** Guild: recruiting here; formation, equipment and the character sheet open their own screens. */
export class GuildScene extends FacilityScene {
  constructor(ctx: SceneCtx, cps?: number) { super(ctx, 'guild', cps); }

  protected commands(): MenuItem[] {
    const g = T.ui2.guild;
    const canRecruit = CHARACTER_IDS.some((id) => !this.ctx.game.state.party.recruited.includes(id));
    return [{ id: 'formation', label: g.formation }, { id: 'recruit', label: g.recruit, disabled: !canRecruit }, { id: 'equip', label: g.equip }, { id: 'status', label: g.status }];
  }

  protected onCommand(id: string): void {
    if (id === 'recruit') this.recruitList();
    else if (id === 'formation' || id === 'equip' || id === 'status') this.ctx.go(id);
  }

  private faceIcon(id: CharacterId): string | undefined {
    return this.ctx.art.has(art.portrait(id, 'normal')) ? art.portrait(id, 'normal') : undefined;
  }

  private recruitList(): void {
    const p = this.ctx.game.state.party;
    const ids = CHARACTER_IDS.filter((id) => !p.recruited.includes(id));
    const info = win('slx-info');
    const show = (id: CharacterId | undefined) => {
      if (!id) return;
      info.replaceChildren(...[standeeImg(this.ctx.art, id)].filter((n): n is HTMLImageElement => !!n),
        el('p', { text: `${CHARACTERS[id].title} ${name(id)}` }), el('p', { class: 'slx-desc', text: T.ui2.guild.roles[id] }));
    };
    const v = new MenuView(new Menu(ids.map((id) => ({ id, label: `${CHARACTERS[id].title} ${name(id)}`, icon: this.faceIcon(id) }))), {
      pick: (it) => { this.ctx.sfx.confirm(); this.askRecruit(it.id as CharacterId); },
      moved: () => { this.ctx.sfx.cursor(); show(v.menu.current()?.id as CharacterId); },
      cancel: () => { info.remove(); this.pop(); },
    });
    show(ids[0]);
    this.stage.append(info);
    this.push({ el: win('slx-list', [v.el]), onAction: (a) => v.onAction(a) });
  }

  private askRecruit(id: CharacterId): void {
    const box = confirmBox(T.ui2.guild.ask(name(id)), (yes) => {
      this.pop();
      if (!yes) return;
      this.ctx.game.state.party = recruit(this.ctx.game.state.party, id);
      this.popAll();
      this.stage.querySelector('.slx-info')?.remove();
      this.refresh();
      void this.say(T.ui2.guild.recruited(name(id)), 'happy');
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }
}
