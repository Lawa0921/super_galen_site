import { T } from '../../data/text.zh-TW';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { MenuView, win } from '../widgets';

/** The ending: the star lantern shines again, then back to town for more exploring. */
export class ClearScene implements Scene {
  private view!: MenuView;

  constructor(private ctx: SceneCtx) {}

  enter(root: HTMLElement): void {
    const bg = this.ctx.art.has(art.scene('title')) ? [el('img', { class: 'slx-bg', attrs: { src: art.scene('title'), alt: '' } })] : [];
    this.view = new MenuView(new Menu([{ id: 'town', label: T.clear.back }]), {
      pick: () => { this.ctx.sfx.confirm(); this.ctx.game.restartAfterClear(); this.ctx.go('town'); },
    });
    root.append(el('div', { class: 'slx-scene slx-clear' }, [
      ...bg,
      win('slx-clear-card', [el('h2', { text: T.clear.title }), el('p', { text: T.clear.body }), this.view.el]),
    ]));
  }

  exit(): void {}

  onAction(a: UiAction): void {
    this.view.onAction(a);
  }
}
