import { T } from '../../data/text.zh-TW';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { Dialogue, MenuView, backControl, win } from '../widgets';

const FACILITIES = ['guild', 'shop', 'inn', 'gate', 'settings'] as const;

export class TownScene implements Scene {
  private view!: MenuView;
  private menuWin!: HTMLElement;
  private backEl!: HTMLElement;
  private talk: Dialogue;

  constructor(private ctx: SceneCtx, charsPerSecond = 30) {
    this.talk = new Dialogue(charsPerSecond, () => { this.menuWin?.removeAttribute('inert'); this.backEl?.removeAttribute('inert'); });
  }

  enter(root: HTMLElement): void {
    const t = T.ui2.town;
    const menu = new Menu(FACILITIES.map((id) => ({ id, label: t.facilities[id] })));
    this.view = new MenuView(menu, { pick: (it) => this.pick(it.id, it.label), moved: () => this.ctx.sfx.cursor(), cancel: () => { this.ctx.sfx.cancel(); this.ctx.go('title'); } });
    const bg = this.ctx.art.has(art.scene('town')) ? [el('img', { class: 'slx-bg', attrs: { src: art.scene('town'), alt: '' } })] : [];
    root.append(el('div', { class: 'slx-scene slx-town' }, [
      ...bg,
      win('slx-place', [document.createTextNode(t.place)]),
      win('slx-gold', [document.createTextNode(`${this.ctx.game.state.gold} G`)]),
      (this.menuWin = win('slx-town-menu', [this.view.el])),
      (this.backEl = backControl(() => this.onAction('cancel'))),
      this.talk.el,
    ]));
    const notice = this.ctx.game.notice;
    this.ctx.game.notice = null;
    if (notice) void this.speak('', T.notices[notice]);
    else void this.speak(t.place.split(' ').pop() ?? '', t.lines[Math.floor(this.ctx.game.rng() * t.lines.length)]);
  }

  exit(): void {}

  onAction(a: UiAction): void {
    if (this.talk.busy()) { this.talk.onAction(a); return; }
    this.view.onAction(a);
  }

  /** The menu ignores the pointer while a line is on screen, matching the keyboard. */
  private async speak(name: string, text: string): Promise<void> {
    this.menuWin.setAttribute('inert', '');
    this.backEl.setAttribute('inert', '');
    await this.talk.say(name, text);
  }

  private pick(id: string, label: string): void {
    this.ctx.sfx.confirm();
    if (id === 'guild' || id === 'shop' || id === 'inn' || id === 'gate') { this.ctx.go(id); return; }
    void this.speak('', T.ui2.town.soon(label));
  }
}
