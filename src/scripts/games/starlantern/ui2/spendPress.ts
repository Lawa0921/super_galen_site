import type { SceneCtx } from './scene';

/** Which key (a node id) is waiting for its confirming press; null when none is. */
export interface SpendState { pending: string | null }

/**
 * The two-press spend shared by the skill-tree and talent pages, typed by the caller's reasons `R`. A key that cannot
 * take a point is refused on the first press (the reason from `can`, the error sound, nothing left pending); one that
 * can is armed by the first press and raised by a second press on the same key. A press on another key arms that key
 * instead. `raise` reports whether the engine took the point: only then is it 'raised' with the confirm sound; a raise
 * turned down after `can` allowed it is 'failed', with the error sound.
 */
export function pressSpend<R extends string>(
  state: SpendState, key: string, can: () => R | null, raise: () => boolean,
  sfx: Pick<SceneCtx['sfx'], 'cursor' | 'confirm' | 'error'>,
): 'armed' | 'raised' | 'failed' | { refused: R } {
  const reason = can();
  if (reason !== null) {
    state.pending = null;
    sfx.error();
    return { refused: reason };
  }
  if (state.pending === key) {
    state.pending = null;
    if (!raise()) {
      sfx.error();
      return 'failed';
    }
    sfx.confirm();
    return 'raised';
  }
  state.pending = key;
  sfx.cursor();
  return 'armed';
}

/**
 * A click (or tap) on `key`, shared by the skill-tree and talent pages: `select` takes the page's cursor there (moving
 * it drops a press waiting on another key), then the click is a press. So the first click on a node selects and arms
 * it, a second click on the same node spends, and a click on another node moves the selection and arms that one. The
 * keys keep their own steps: the arrows move the cursor, then Enter twice.
 */
export function clickSpend<R extends string>(
  state: SpendState, key: string, select: (key: string) => unknown, can: () => R | null, raise: () => boolean,
  sfx: Pick<SceneCtx['sfx'], 'cursor' | 'confirm' | 'error'>,
): 'armed' | 'raised' | 'failed' | { refused: R } {
  select(key);
  return pressSpend(state, key, can, raise, sfx);
}

/** Drops a waiting press: the cursor moved, the member changed or the page went away. */
export function cancelSpend(state: SpendState): void {
  state.pending = null;
}
