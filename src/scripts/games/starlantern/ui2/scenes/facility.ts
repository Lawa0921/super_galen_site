import { T } from '../../data/text.zh-TW';
import type { SceneId } from '../../data/story/scenes';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu, type MenuItem } from '../menu';
import type { Scene, SceneCtx, SceneName } from '../scene';
import { textCps } from '../settings';
import { playScene, storyCtx } from '../story';
import { Dialogue, MenuView, backControl, win, type Rich } from '../widgets';

export type FacilityId = 'guild' | 'shop' | 'inn' | 'gate' | 'forge';
const RETURNING: SceneName[] = ['formation', 'status', 'equip', 'settings'];
export interface Layer { el: HTMLElement; onAction(a: UiAction): boolean }

/** Shared facility screen: scene art, NPC bust, place sign, gold, command window, dialogue and a stack of sub-windows. */
export abstract class FacilityScene implements Scene {
  protected root!: HTMLElement;
  protected stage!: HTMLElement;
  private layers: Layer[] = [];
  private view!: MenuView;
  private cmdWin!: HTMLElement;
  private back!: HTMLElement;
  private gold!: HTMLElement;
  private npc: HTMLImageElement | null = null;
  private talk: Dialogue;
  private moodTimer: ReturnType<typeof setTimeout> | null = null;
  private talking = false;
  /** The story scene on screen, if any: it takes the actions while it plays. */
  private playing: ReturnType<typeof playScene> | null = null;

  constructor(protected ctx: SceneCtx, protected id: FacilityId, cps = textCps(ctx)) {
    this.talk = new Dialogue(cps, () => { this.talking = false; this.syncInert(); });
  }

  protected abstract commands(): MenuItem[];
  protected abstract onCommand(id: string): void;

  /** The scene picture behind the facility; a subclass can offer newer art first. */
  protected sceneArt(): string { return art.scene(this.id); }

  enter(root: HTMLElement): void {
    this.root = root;
    const f = T.ui2.facility[this.id];
    const scene = this.sceneArt();
    const bg = this.ctx.art.has(scene) ? [el('img', { class: 'slx-bg', attrs: { src: scene, alt: '' } })] : [];
    if (this.ctx.art.has(art.npc(this.id, 'normal'))) this.npc = el('img', { class: 'slx-npc', attrs: { src: art.npc(this.id, 'normal'), alt: '' } });
    this.gold = win('slx-gold');
    this.cmdWin = win('slx-cmd');
    this.stage = el('div', { class: 'slx-stage' });
    this.back = backControl(() => this.onAction('cancel'));
    root.append(el('div', { class: `slx-scene slx-facility slx-${this.id}` }, [
      ...bg, ...(this.npc ? [this.npc] : []), win('slx-place', [document.createTextNode(f.place)]), this.gold, this.back, this.cmdWin, this.stage, this.talk.el,
    ]));
    this.refresh();
    // Coming back from one of the guild's own screens (or settings) is not a new visit: no greeting.
    if (!RETURNING.includes(this.ctx.from ?? 'town')) void this.say(f.greet[Math.floor(this.ctx.game.rng() * f.greet.length)]);
  }

  exit(): void {
    this.talk.stop();
    if (this.moodTimer) clearTimeout(this.moodTimer);
    this.moodTimer = null;
  }

  onAction(a: UiAction): void {
    if (this.playing) { this.playing.onAction(a); return; }
    if (this.talk.busy()) {
      this.talk.onAction(a);
      if (!this.talk.busy()) { this.talking = false; this.syncInert(); }
      return;
    }
    const top = this.layers[this.layers.length - 1];
    if (top) { top.onAction(a); return; }
    this.view.onAction(a);
  }

  protected refresh(): void {
    this.gold.textContent = `${this.ctx.game.state.gold} G`;
    const items = [...this.commands(), { id: 'leave', label: T.ui2.facility.leave }];
    // First draw after coming back from a sub-screen: start on the command that opened it.
    const keep = this.view?.menu.cursor ?? Math.max(0, items.findIndex((it) => it.id === this.ctx.from));
    this.view = new MenuView(new Menu(items, keep), {
      pick: (it) => { this.ctx.sfx.confirm(); if (it.id === 'leave') this.leave(); else this.onCommand(it.id); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.leave(),
    });
    this.cmdWin.replaceChildren(this.view.el);
  }

  protected leave(): void {
    this.ctx.sfx.cancel();
    this.ctx.go('town');
  }

  protected push(layer: Layer): void {
    layer.el.classList.add('slx-layer', `slx-depth-${this.layers.length}`);
    this.layers.push(layer);
    this.stage.append(layer.el);
    this.syncInert();
  }

  protected pop(silent = false): void {
    const l = this.layers.pop();
    l?.el.remove();
    if (!silent) this.ctx.sfx.cancel();
    this.syncInert();
  }

  protected popAll(): void {
    while (this.layers.length) this.layers.pop()!.el.remove();
    this.syncInert();
  }

  protected say(text: string | Rich, mood: 'normal' | 'happy' = 'normal'): Promise<void> {
    if (mood === 'happy') this.setMood('happy');
    this.talking = true;
    this.syncInert();
    const done = this.talk.say(T.ui2.facility[this.id].npc, text);
    void done.then(() => { this.talking = false; this.syncInert(); });
    return done;
  }

  /**
   * Pointer input reaches only the active window: the command window and lower layers are inert under a layer or a line.
   * Windows under another layer (not under a line) are also marked slx-under, which a scene's style may dim so a deep stack
   * reads cleanly (the forge does).
   */
  private syncInert(): void {
    const lock = (e: HTMLElement, on: boolean) => (on ? e.setAttribute('inert', '') : e.removeAttribute('inert'));
    lock(this.cmdWin, this.talking || this.layers.length > 0);
    lock(this.back, this.talking);
    this.layers.forEach((l, i) => lock(l.el, this.talking || i < this.layers.length - 1));
    this.cmdWin.classList.toggle('slx-under', this.layers.length > 0);
    this.layers.forEach((l, i) => l.el.classList.toggle('slx-under', i < this.layers.length - 1));
  }

  /** Plays story scene `id` in this facility's dialogue box; resolves when it ends or the player skips it. */
  protected play(id: SceneId): Promise<'done' | 'skipped'> {
    const p = playScene(this.talk, id, storyCtx(this.ctx));
    this.playing = p;
    this.talking = true;
    this.cmdWin.classList.add('slx-cmd-hidden');
    this.syncInert();
    return p.done.finally(() => { this.playing = null; this.talking = false; this.cmdWin.classList.remove('slx-cmd-hidden'); this.syncInert(); });
  }

  protected fail(reason: string): void {
    this.ctx.sfx.error();
    void this.say(T.reasons[reason] ?? T.reasons.invalid);
  }

  private setMood(mood: 'normal' | 'happy'): void {
    if (!this.npc || !this.ctx.art.has(art.npc(this.id, mood))) return;
    this.npc.setAttribute('src', art.npc(this.id, mood));
    if (this.moodTimer) clearTimeout(this.moodTimer);
    this.moodTimer = mood === 'happy' ? setTimeout(() => { this.moodTimer = null; this.setMood('normal'); }, 1500) : null;
  }
}
