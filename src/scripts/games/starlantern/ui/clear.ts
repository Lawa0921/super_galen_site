import { T } from '../data/text.zh-TW';
import type { Game } from '../engine/game';
import { button, el, type UiHooks } from './dom';

export function renderClear(root: HTMLElement, game: Game, ui: UiHooks): void {
  root.replaceChildren(
    el('h2', { text: T.clear.title }),
    el('p', { text: T.clear.body }),
    button(T.clear.back, () => { game.restartAfterClear(); ui.refresh(); }, { id: 'sl-clear-back' }),
  );
}
