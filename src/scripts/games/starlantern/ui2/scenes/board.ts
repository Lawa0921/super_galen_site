import type { CharacterId } from '../../engine/types';
import type { StoryMood } from '../../render/artPaths';
import type { SceneCtx } from '../scene';
import { win } from '../widgets';
import type { Layer } from './facility';

/**
 * What the board needs of the guild's screen (guild quests plan ruling 14): its stage, its stack of windows and its
 * dialogue box. The guild hands these over (`GuildScene.boardHost`); the board is a layer of the guild, not a scene.
 */
export interface BoardHost {
  ctx: SceneCtx;
  stage: HTMLElement;
  push(layer: Layer): void;
  pop(silent?: boolean): void;
  popAll(): void;
  say(text: string, mood?: 'normal' | 'happy'): Promise<void>;
  speakAs(who: CharacterId, text: string, mood?: StoryMood): Promise<void>;
  /** The gold window again, after a reward. */
  refresh(): void;
}

/** The board opened at the guild (spec §8.1). Task B1's stand-in: the record is marked seen and an empty window put up. */
export function openBoard(host: BoardHost): void {
  if (!host.ctx.game.openBoard().ok) { host.ctx.sfx.error(); return; }
  const box = win('slx-board');
  host.push({ el: box, onAction: (a) => { if (a === 'cancel') { host.pop(); return true; } return false; } });
}
