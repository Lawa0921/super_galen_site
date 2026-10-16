import type { SceneCtx } from './scene';

/** Which key (a node id) is waiting for its confirming press; null when none is. */
export interface SpendState { pending: string | null }

/**
 * The two-press spend shared by the skill-tree and talent pages. A key that cannot take a point is refused on the first
 * press (the reason from `can`, the error sound, nothing left pending); one that can is armed by the first press and
 * raised by a second press on the same key. A press on another key arms that key instead.
 */
export function pressSpend(
  state: SpendState, key: string, can: () => string | null, raise: () => void,
  sfx: Pick<SceneCtx['sfx'], 'cursor' | 'confirm' | 'error'>,
): 'armed' | 'raised' | { refused: string } {
  const reason = can();
  if (reason !== null) {
    state.pending = null;
    sfx.error();
    return { refused: reason };
  }
  if (state.pending === key) {
    raise();
    state.pending = null;
    sfx.confirm();
    return 'raised';
  }
  state.pending = key;
  sfx.cursor();
  return 'armed';
}

/** Drops a waiting press: the cursor moved, the member changed or the page went away. */
export function cancelSpend(state: SpendState): void {
  state.pending = null;
}
