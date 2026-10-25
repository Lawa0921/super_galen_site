import { STORY, type ScriptLine } from '../../data/story.zh-TW';
import { T } from '../../data/text.zh-TW';
import { storyStage } from '../../engine/story/events';
import type { SceneId } from '../../data/story/scenes';
import type { MoonPhase } from '../../data/story/chains';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { bestPicture } from '../lateArt';
import { Menu, type MenuItem } from '../menu';
import type { Scene, SceneCtx, SceneName } from '../scene';
import { textCps } from '../settings';
import { NPC_FACILITY, playAndRecord, playBeat, playNight, playScene, storyCtx, type SceneOpts } from '../story';
import type { StoryMode } from '../settings';
import { Dialogue, MenuView, backControl, win, type Rich } from '../widgets';

export type FacilityId = 'guild' | 'shop' | 'inn' | 'gate' | 'forge';
const RETURNING: SceneName[] = ['formation', 'status', 'equip', 'workshop', 'settings', 'builds'];
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
  private place!: HTMLElement;
  private npc: HTMLImageElement | null = null;
  private talk: Dialogue;
  private moodTimer: ReturnType<typeof setTimeout> | null = null;
  private talking = false;
  /** A line `sayThen` holds for the next box: the dialogue's close brings it up at once, in place of unlocking the menu. */
  private then: string | Rich | null = null;
  /** The story scene on screen, if any: it takes the actions while it plays. */
  private playing: { onAction(a: UiAction): void } | null = null;

  constructor(protected ctx: SceneCtx, protected id: FacilityId, cps = textCps(ctx)) {
    this.talk = new Dialogue(cps, () => {
      const next = this.then;
      if (next !== null) { void this.say(next); return; }
      this.talking = false;
      this.syncInert();
    });
  }

  protected abstract commands(): MenuItem[];
  protected abstract onCommand(id: string): void;

  /** The scene pictures behind the facility, best first; a subclass can offer newer art first. The best one loaded shows. */
  protected sceneArts(): string[] { return [art.scene(this.id)]; }

  enter(root: HTMLElement): void {
    this.root = root;
    const f = T.ui2.facility[this.id];
    this.gold = win('slx-gold');
    this.cmdWin = win('slx-cmd');
    this.stage = el('div', { class: 'slx-stage' });
    this.back = backControl(() => this.onAction('cancel'));
    const sceneEl = el('div', { class: `slx-scene slx-facility slx-${this.id}` }, [
      (this.place = win('slx-place', [document.createTextNode(f.place)])), this.gold, this.back, this.cmdWin, this.stage, this.talk.el,
    ]);
    // The scene picture first, then the keeper's bust; each is put in when it lands if it had not yet (ui2/lateArt).
    bestPicture(sceneEl, 'bg', this.ctx.art, this.sceneArts(), (src) => el('img', { class: 'slx-bg', attrs: { src, alt: '' } }), (n) => sceneEl.prepend(n));
    bestPicture(sceneEl, 'npc', this.ctx.art, [art.npc(this.id, 'normal')], (src) => el('img', { class: 'slx-npc', attrs: { src, alt: '' } }),
      (n) => { this.npc = n as HTMLImageElement; this.place.before(n); });
    root.append(sceneEl);
    this.refresh();
    // Coming back from one of the guild's own screens (or settings) is not a new visit: no greeting.
    if (!RETURNING.includes(this.ctx.from ?? 'town')) { const pool = this.greetings(); void this.greet(pool[Math.floor(this.ctx.game.rng() * pool.length)]); }
  }

  /** Says the greeting drawn for this visit; a facility with news of its own may say that instead (the draw is taken either way). */
  protected greet(line: string): Promise<void> {
    return this.say(line);
  }

  /** What the keeper says today: the lines for the story stage, and the thanks of a townsperson who got her memory back. */
  private greetings(): string[] {
    const s = this.ctx.game.state;
    const thanks = s.story.returned.filter((n) => NPC_FACILITY[n] === this.id).map((n) => STORY.town[n].after);
    return [...STORY.greet[this.id][storyStage(s)], ...thanks];
  }

  exit(): void {
    this.then = null;
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
    this.then = null;
    this.talk.setStyle('plain');
    if (mood === 'happy') this.setMood('happy');
    this.talking = true;
    this.syncInert();
    const done = this.talk.say(T.ui2.facility[this.id].npc, text);
    // A line that settles while a newer one is up (a held line, or a line said over it) leaves the menu locked.
    void done.then(() => { if (this.talk.busy()) return; this.talking = false; this.syncInert(); });
    return done;
  }

  /** Two boxes from the keeper: `first`, and `second` once the player closes it (a key or a click). */
  protected sayThen(first: string | Rich, second: string | Rich): Promise<void> {
    const done = this.say(first);
    this.then = second;
    return done;
  }

  /**
   * A line that is nobody's here (a stranger's memory surfacing from an absorbed shard): the remembered box, with no nameplate
   * and no face, and the keeper's face back to neutral so it does not read as hers (6c Task 13).
   */
  protected narrate(text: string | Rich): Promise<void> {
    this.then = null;
    this.setMood('normal');
    this.talk.setStyle('memory');
    this.talking = true;
    this.syncInert();
    const done = this.talk.say('', text);
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

  /**
   * Plays story scene `id` in this facility's dialogue box and records it; resolves when it ends or the player skips it.
   * Bond plan Task 12: `mode` stands in for the story setting (a scene the player starts, a talk at the inn, always plays:
   * `'all'`); `record: false` plays it and records nothing (the walk with everyone).
   */
  protected play(id: SceneId, o: SceneOpts & { mode?: StoryMode; record?: false } = {}): Promise<void> {
    this.then = null;
    const { mode, record, ...opts } = o;
    const sc = { ...storyCtx(this.ctx), ...(mode ? { mode } : {}) };
    const p = record === false ? (() => { const q = playScene(this.talk, id, sc, opts); return { done: q.done.then(() => {}), onAction: q.onAction }; })()
      : playAndRecord(this.talk, id, sc, opts);
    this.playing = p;
    this.talking = true;
    // The place plate and the gold go with the command window (staging S1): a scene may be set elsewhere (its own card).
    for (const e of [this.cmdWin, this.place, this.gold]) e.classList.add('slx-cmd-hidden');
    this.syncInert();
    // A scene that throws is reported and treated as over, so the caller carries on (the guild still pays the reward line).
    return p.done.catch((e) => { console.error('starlantern: facility scene failed', e); }).finally(() => { this.playing = null; this.talking = false; for (const e of [this.cmdWin, this.place, this.gold]) e.classList.remove('slx-cmd-hidden'); this.syncInert(); });
  }

  /** Time and moon ruling 8: the moon a night card's veil wears in this facility's box (null: the plain night). */
  protected setMoon(moon: MoonPhase | null): void {
    this.talk.moon = moon;
  }

  /** Story L: plays `ids` as a night in this facility's box (`playNight`): memories under the night's card, a beat between two. */
  protected tellNight(ids: SceneId[]): Promise<void> {
    return playNight(ids, storyCtx(this.ctx), (id, o) => this.play(id, o), (line) => this.beat(line));
  }

  /** The night's beat between two memories (`playBeat`), with the command window, the plate and the gold put away. */
  private beat(line: ScriptLine): Promise<void> {
    this.then = null;
    const p = playBeat(this.talk, line, storyCtx(this.ctx));
    this.playing = p;
    this.talking = true;
    for (const e of [this.cmdWin, this.place, this.gold]) e.classList.add('slx-cmd-hidden');
    this.syncInert();
    return p.done.then(() => {}, (e) => { console.error('starlantern: facility beat failed', e); }).finally(() => { this.playing = null; this.talking = false; for (const e of [this.cmdWin, this.place, this.gold]) e.classList.remove('slx-cmd-hidden'); this.syncInert(); });
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
