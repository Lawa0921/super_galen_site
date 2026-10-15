import { T } from '../../data/text.zh-TW';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { MenuView, confirmBox, win } from '../widgets';

export class TitleScene implements Scene {
  private view!: MenuView;
  private ask: MenuView | null = null;
  private root!: HTMLElement;

  constructor(private ctx: SceneCtx) {}

  enter(root: HTMLElement): void {
    this.root = root;
    const t = T.ui2.title;
    const menu = new Menu([
      { id: 'new', label: t.newGame }, { id: 'cont', label: t.cont, disabled: !this.ctx.hasSave() }, { id: 'settings', label: t.settings, disabled: true },
    ], this.ctx.hasSave() ? 1 : 0);
    this.view = new MenuView(menu, { pick: (it) => this.pick(it.id), moved: () => this.ctx.sfx.cursor() });
    const bg = this.ctx.art.has(art.scene('title')) ? [el('img', { class: 'slx-bg', attrs: { src: art.scene('title'), alt: '' } })] : [];
    const logo = this.ctx.art.has(art.logo) ? el('img', { class: 'slx-logo', attrs: { src: art.logo, alt: '星燈迷宮' } }) : el('h1', { class: 'slx-logo-text', text: '星燈迷宮' });
    root.append(el('div', { class: 'slx-scene slx-title' }, [...bg, logo, win('slx-title-menu', [this.view.el])]));
  }

  exit(): void {}

  onAction(a: UiAction): void {
    if (this.ask) { this.ask.onAction(a); return; }
    this.view.onAction(a);
  }

  private pick(id: string): void {
    this.ctx.sfx.confirm();
    if (id === 'cont') { this.ctx.go('town'); return; }
    if (id !== 'new') return;
    if (!this.ctx.hasSave()) { this.ctx.newGame(); this.ctx.go('town'); return; }
    const box = confirmBox(T.ui2.title.overwrite, (yes) => {
      box.el.remove();
      this.ask = null;
      if (yes) { this.ctx.newGame(); this.ctx.go('town'); } else this.ctx.sfx.cancel();
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.ask = box.view;
    this.root.append(box.el);
  }
}
