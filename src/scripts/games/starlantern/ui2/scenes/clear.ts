import { STORY, type ScriptLine } from '../../data/story.zh-TW';
import type { SceneId } from '../../data/story/scenes';
import { T } from '../../data/text.zh-TW';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { textCps } from '../settings';
import { playAndRecord, playBeat, playNight, storyCtx, type SceneOpts } from '../story';
import { Dialogue, MenuView, win } from '../widgets';
import { tonightMoon } from '../../engine/calendar';

/**
 * The card after a clear. Act 1's clear (the lantern-eater falls) shows its card and goes back to town, where 'act1-after'
 * waits. The finale (cleared === 'finale') first plays the scenes it owes (any act still waiting, the bellkeeper's arrival, the
 * hero's last memories: `Game.finale.pieces`) and then itself (each one recorded as played,
 * skipped or, with story none, auto), and only then shows the ending card.
 */
export class ClearScene implements Scene {
  private view: MenuView | null = null;
  private body!: HTMLElement;
  private talk: Dialogue;
  /** The story scene (or a beat of the eve) on screen, if any: it takes the actions while it plays. */
  private playing: { onAction(a: UiAction): void } | null = null;
  private exited = false;

  constructor(private ctx: SceneCtx, cps = textCps(ctx)) {
    this.talk = new Dialogue(cps);
  }

  enter(root: HTMLElement): void {
    this.exited = false;
    const bg = this.ctx.art.has(art.scene('title')) ? [el('img', { class: 'slx-bg', attrs: { src: art.scene('title'), alt: '' } })] : [];
    this.body = el('div', { class: 'slx-scene slx-clear' }, [...bg, this.talk.el]);
    root.append(this.body);
    if (this.ctx.game.cleared === 'finale') void this.playFinale().then(() => { if (!this.exited) this.showCard(STORY.endingTitle, STORY.scenes.finale.summary, T.ending.back); });
    else this.showCard(STORY.act1Card.title, STORY.act1Card.body, T.clear.back);
  }

  exit(): void {
    this.exited = true;
    this.talk.stop();
  }

  onAction(a: UiAction): void {
    if (this.playing) { this.playing.onAction(a); return; }
    this.view?.onAction(a);
  }

  /**
   * The scenes the finale owes (acts, the bellkeeper's arrival, the hero's memories), then the finale. A scene that fails is
   * reported and skipped: the card still comes. Story L spec §4.8: the eve no departure told comes first, its line and its
   * memories told as a night (`playNight`: the night's card, a beat between two of them; none before Lorne's pieces).
   */
  private async playFinale(): Promise<void> {
    const game = this.ctx.game;
    const ids: SceneId[] = [...(game.finale?.pieces ?? []), 'finale'];
    const n = ids[0] === 'finale-eve' ? 1 + ids.slice(1).findIndex((id) => !game.eve.includes(id)) : 0;
    // Time and moon review fix 8: the eve told here is the night before this dive, under its moon.
    this.talk.moon = tonightMoon(game.state);
    try {
      await playNight(ids.slice(0, n), storyCtx(this.ctx), (id, o) => this.playOne(id, o), (line) => this.beat(line));
    } finally {
      this.talk.moon = null;
    }
    for (const id of ids.slice(n)) await this.playOne(id);
  }

  /** One scene of the finale's list, recorded; nothing once the screen is left. */
  private async playOne(id: SceneId, o: SceneOpts = {}): Promise<void> {
    if (this.exited) return;
    try {
      const p = playAndRecord(this.talk, id, storyCtx(this.ctx), o);
      this.playing = p;
      await p.done;
    } catch (e) {
      console.error('starlantern: finale scene failed', e);
    } finally {
      this.playing = null;
    }
  }

  /** The eve's beat between two of its memories (spec §4.4.1). */
  private async beat(line: ScriptLine): Promise<void> {
    if (this.exited) return;
    const p = playBeat(this.talk, line, storyCtx(this.ctx));
    this.playing = p;
    try { await p.done; } finally { this.playing = null; }
  }

  private showCard(title: string, text: string, back: string): void {
    this.view = new MenuView(new Menu([{ id: 'town', label: back }]), {
      pick: () => { this.ctx.sfx.confirm(); this.ctx.game.restartAfterClear(); this.ctx.go('town'); },
    });
    this.body.append(win('slx-clear-card', [el('h2', { text: title }), el('p', { text }), this.view.el]));
  }
}
