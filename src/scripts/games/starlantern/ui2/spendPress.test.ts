import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { cancelSpend, pressSpend, type SpendState } from './spendPress';

const sfx = () => ({ cursor: vi.fn(), confirm: vi.fn(), error: vi.fn() });
/** A raise the engine accepts. */
const ok = () => vi.fn(() => true);

describe('pressSpend', () => {
  it('first press arms, second press on the same key raises once', () => {
    const st: SpendState = { pending: null };
    const s = sfx();
    const raise = ok();
    expect(pressSpend(st, 'a', () => null, raise, s)).toBe('armed');
    expect(st.pending).toBe('a');
    expect(raise).not.toHaveBeenCalled();
    expect(s.cursor).toHaveBeenCalledTimes(1);
    expect(pressSpend(st, 'a', () => null, raise, s)).toBe('raised');
    expect(raise).toHaveBeenCalledTimes(1);
    expect(st.pending).toBeNull();
    expect(s.confirm).toHaveBeenCalledTimes(1);
    expect(pressSpend(st, 'a', () => null, raise, s)).toBe('armed');   // a third press arms again, it does not raise
    expect(raise).toHaveBeenCalledTimes(1);
  });

  it('a press on another key re-arms instead of raising', () => {
    const st: SpendState = { pending: 'a' };
    const s = sfx();
    const raise = ok();
    expect(pressSpend(st, 'b', () => null, raise, s)).toBe('armed');
    expect(st.pending).toBe('b');
    expect(raise).not.toHaveBeenCalled();
    expect(s.confirm).not.toHaveBeenCalled();
  });

  it('a refused key reports the reason at once, plays error and clears pending', () => {
    const st: SpendState = { pending: 'a' };
    const s = sfx();
    const raise = ok();
    expect(pressSpend(st, 'a', () => 'points', raise, s)).toEqual({ refused: 'points' });
    expect(st.pending).toBeNull();
    expect(raise).not.toHaveBeenCalled();
    expect(s.error).toHaveBeenCalledTimes(1);
    expect(s.cursor).not.toHaveBeenCalled();
    // Never armed: the first press on a refused key already reports it.
    const fresh: SpendState = { pending: null };
    expect(pressSpend(fresh, 'b', () => 'gate', raise, s)).toEqual({ refused: 'gate' });
    expect(fresh.pending).toBeNull();
  });

  it('a raise the engine turns down is not reported as raised: no confirm, the error sound, nothing pending', () => {
    const st: SpendState = { pending: 'a' };
    const s = sfx();
    const raise = vi.fn(() => false);
    expect(pressSpend(st, 'a', () => null, raise, s)).toBe('failed');
    expect(raise).toHaveBeenCalledTimes(1);
    expect(s.confirm).not.toHaveBeenCalled();
    expect(s.error).toHaveBeenCalledTimes(1);
    expect(st.pending).toBeNull();
  });

  it('keeps the caller\'s reason type', () => {
    type Why = 'req' | 'points';
    const r = pressSpend<Why>({ pending: null }, 'a', () => 'req' as Why | null, () => true, sfx());
    expectTypeOf(r).toEqualTypeOf<'armed' | 'raised' | 'failed' | { refused: Why }>();
  });

  it('cancelSpend clears pending', () => {
    const st: SpendState = { pending: 'a' };
    cancelSpend(st);
    expect(st.pending).toBeNull();
    cancelSpend(st);
    expect(st.pending).toBeNull();
  });
});
