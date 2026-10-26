import { T } from '../../data/text.zh-TW';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { bestPicture } from '../lateArt';
import { Menu } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { MenuView, confirmBox, win } from '../widgets';

export class TitleScene implements Scene {
  private view!: MenuView;
  private ask: MenuView | null = null;
  private root!: HTMLElement;
  private menuWin!: HTMLElement;

  constructor(private ctx: SceneCtx) {}

  enter(root: HTMLElement): void {
    this.root = root;
    const t = T.ui2.title;
    const menu = new Menu([
      { id: 'new', label: t.newGame }, { id: 'cont', label: t.cont, disabled: !this.ctx.hasSave() }, { id: 'settings', label: t.settings },
    ], this.ctx.hasSave() ? 1 : 0);
    this.view = new MenuView(menu, { pick: (it) => this.pick(it.id), moved: () => this.ctx.sfx.cursor() });
    // The words stand for the logo until its picture lands (its request may outlast the title's wait for its art).
    const words = el('h1', { class: 'slx-logo-text', text: '星燈迷宮' });
    this.menuWin = win('slx-title-menu', [this.view.el]);
    const scene = el('div', { class: 'slx-scene slx-title' }, [words, this.menuWin, el('p', { class: 'slx-keyhint', text: T.ui2.hints.title })]);
    bestPicture(scene, 'bg', this.ctx.art, [art.scene('title')], (src) => el('img', { class: 'slx-bg', attrs: { src, alt: '' } }), (n) => scene.prepend(n));
    bestPicture(scene, 'logo', this.ctx.art, [art.logo], (src) => el('img', { class: 'slx-logo', attrs: { src, alt: '星燈迷宮' } }), (n) => words.replaceWith(n));
    root.append(scene);
  }

  exit(): void {}

  onAction(a: UiAction): void {
    if (this.ask) { this.ask.onAction(a); return; }
    this.view.onAction(a);
  }

  private pick(id: string): void {
    this.ctx.sfx.confirm();
    if (id === 'cont') { this.ctx.continueGame?.(); this.ctx.go('town'); return; }
    if (id === 'settings') { this.ctx.go('settings'); return; }
    if (id !== 'new' || this.ask) return;
    if (!this.ctx.hasSave()) { this.ctx.newGame(); this.ctx.go('town'); return; }
    const box = confirmBox(T.ui2.title.overwrite, (yes) => {
      box.el.remove();
      this.ask = null;
      this.menuWin.removeAttribute('inert');
      if (yes) { this.ctx.newGame(); this.ctx.go('town'); } else this.ctx.sfx.cancel();
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.ask = box.view;
    this.menuWin.setAttribute('inert', '');
    this.root.append(box.el);
  }
}
