import { T } from '../../data/text.zh-TW';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { bestPicture } from '../lateArt';
import { Menu, type MenuItem } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { DEFAULT_SETTINGS, STORY_MODES, TEXT_SPEEDS, type Settings } from '../settings';
import { MenuView, backControl, win } from '../widgets';

/** Settings: sound volume, text speed and story playback (left/right or click to change), fullscreen, the key list, and back. */
export class SettingsScene implements Scene {
  private view!: MenuView;
  private body!: HTMLElement;
  private menuWin!: HTMLElement;
  private keys: HTMLElement | null = null;

  constructor(private ctx: SceneCtx) {}

  enter(root: HTMLElement): void {
    const t = T.ui2.settings;
    this.view = new MenuView(new Menu(this.items()), {
      pick: (it) => this.pick(it.id),
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.leave(),
    });
    this.menuWin = win('slx-settings', [el('h3', { text: t.title }), this.view.el, el('p', { class: 'slx-hint', text: t.hint })]);
    this.body = el('div', { class: 'slx-scene slx-settings-scene' }, [this.menuWin, backControl(() => this.onAction('cancel'))]);
    bestPicture(this.body, 'bg', this.ctx.art, [art.scene('title')], (src) => el('img', { class: 'slx-bg slx-bg-dim', attrs: { src, alt: '' } }), (n) => this.body.prepend(n));
    root.append(this.body);
  }

  exit(): void {}

  onAction(a: UiAction): void {
    if (this.keys) { if (a === 'confirm' || a === 'cancel') this.closeKeys(); return; }
    if (a === 'left' || a === 'right') { this.step(this.view.menu.current()?.id, a === 'right' ? 1 : -1, false); return; }
    this.view.onAction(a);
  }

  private get value(): Settings { return this.ctx.settings?.get() ?? DEFAULT_SETTINGS; }

  private items(): MenuItem[] {
    const t = T.ui2.settings;
    const v = this.value;
    return [
      { id: 'volume', label: t.volume, right: `← ${v.volume}% →` },
      { id: 'speed', label: t.speed, right: `← ${t.speeds[v.textSpeed]} →` },
      { id: 'vibrate', label: t.vibrate, right: `← ${v.vibrate ? t.on : t.off} →` },
      { id: 'story', label: t.story, right: `← ${t.storyModes[v.story]} →` },
      { id: 'fullscreen', label: t.fullscreen },
      { id: 'keys', label: t.keys },
      { id: 'back', label: t.back },
    ];
  }

  private refresh(): void {
    const items = this.items();
    this.view.menu.items.forEach((it, i) => { it.right = items[i].right; });
    this.view.render();
  }

  /** Keys clamp at the ends; a click (wrap) cycles so the mouse alone can reach every value. */
  private step(id: string | undefined, d: 1 | -1, wrap: boolean): void {
    const v = this.value;
    let next: Settings;
    if (id === 'volume') {
      const n = v.volume + d * 10;
      next = { ...v, volume: wrap ? (n > 100 ? 0 : n) : Math.max(0, Math.min(100, n)) };
    } else if (id === 'speed') {
      const i = TEXT_SPEEDS.indexOf(v.textSpeed) + d;
      const n = TEXT_SPEEDS.length;
      next = { ...v, textSpeed: TEXT_SPEEDS[wrap ? (i + n) % n : Math.max(0, Math.min(n - 1, i))] };
    } else if (id === 'vibrate') {
      next = { ...v, vibrate: !v.vibrate };
    } else if (id === 'story') {
      const i = STORY_MODES.indexOf(v.story) + d;
      const n = STORY_MODES.length;
      next = { ...v, story: STORY_MODES[wrap ? (i + n) % n : Math.max(0, Math.min(n - 1, i))] };
    } else return;
    if (next.volume === v.volume && next.textSpeed === v.textSpeed && next.vibrate === v.vibrate && next.story === v.story) { this.ctx.sfx.error(); return; }
    this.ctx.settings?.set?.(next);
    this.ctx.sfx.cursor();
    this.refresh();
  }

  private pick(id: string): void {
    if (id === 'volume' || id === 'speed' || id === 'vibrate' || id === 'story') { this.step(id, 1, true); return; }
    this.ctx.sfx.confirm();
    if (id === 'fullscreen') { void this.ctx.fullscreen?.(); return; }
    if (id === 'keys') { this.openKeys(); return; }
    this.leave();
  }

  private openKeys(): void {
    const t = T.ui2.settings;
    this.keys = win('slx-keys', [el('h3', { text: t.keys }), ...t.keyList.map(([k, what]) => el('p', {}, [el('b', { text: k }), document.createTextNode(what)])), el('p', { class: 'slx-hint', text: t.close })]);
    this.keys.addEventListener('click', () => this.closeKeys());
    this.menuWin.setAttribute('inert', '');
    this.body.append(this.keys);
  }

  private closeKeys(): void {
    this.keys?.remove();
    this.keys = null;
    this.menuWin.removeAttribute('inert');
    this.ctx.sfx.cancel();
  }

  private leave(): void {
    this.ctx.sfx.cancel();
    this.ctx.go(this.ctx.from ?? 'title');
  }
}
