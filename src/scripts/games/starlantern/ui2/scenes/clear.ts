import { STORY } from '../../data/story.zh-TW';
import type { SceneId } from '../../data/story/scenes';
import { T } from '../../data/text.zh-TW';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { textCps } from '../settings';
import { playAndRecord, storyCtx } from '../story';
import { Dialogue, MenuView, win } from '../widgets';

/**
 * The card after a clear. Act 1's clear (the lantern-eater falls) shows its card and goes back to town, where 'act1-after'
 * waits. The finale (cleared === 'finale') first plays the hero's last memories and then itself (each one recorded as played,
 * skipped or, with story none, auto), and only then shows the ending card.
 */
export class ClearScene implements Scene {
  private view: MenuView | null = null;
  private body!: HTMLElement;
  private talk: Dialogue;
  /** The story scene on screen, if any: it takes the actions while it plays. */
  private playing: ReturnType<typeof playAndRecord> | null = null;
  private exited = false;

  constructor(private ctx: SceneCtx, cps = textCps(ctx)) {
    this.talk = new Dialogue(cps);
  }

  enter(root: HTMLElement): void {
    this.exited = false;
    const bg = this.ctx.art.has(art.scene('title')) ? [el('img', { class: 'slx-bg', attrs: { src: art.scene('title'), alt: '' } })] : [];
    this.body = el('div', { class: 'slx-scene slx-clear' }, [...bg, this.talk.el]);
    root.append(this.body);
    if (this.ctx.game.cleared === 'finale') void this.playFinale().then(() => { if (!this.exited) this.showCard(T.ending.title, STORY.scenes.finale.summary, T.ending.back); });
    else this.showCard(T.clear.title, T.clear.body, T.clear.back);
  }

  exit(): void {
    this.exited = true;
    this.talk.stop();
  }

  onAction(a: UiAction): void {
    if (this.playing) { this.playing.onAction(a); return; }
    this.view?.onAction(a);
  }

  /** The hero's memories the finale filled in, then the finale. A scene that fails is reported and skipped: the card still comes. */
  private async playFinale(): Promise<void> {
    const ids: SceneId[] = [...(this.ctx.game.finale?.pieces ?? []), 'finale'];
    for (const id of ids) {
      try {
        const p = playAndRecord(this.talk, id, storyCtx(this.ctx));
        this.playing = p;
        await p.done;
      } catch (e) {
        console.error('starlantern: finale scene failed', e);
      } finally {
        this.playing = null;
      }
      if (this.exited) return;
    }
  }

  private showCard(title: string, text: string, back: string): void {
    this.view = new MenuView(new Menu([{ id: 'town', label: back }]), {
      pick: () => { this.ctx.sfx.confirm(); this.ctx.game.restartAfterClear(); this.ctx.go('town'); },
    });
    this.body.append(win('slx-clear-card', [el('h2', { text: title }), el('p', { text }), this.view.el]));
  }
}
