import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { cancelSpend, clickSpend, pressSpend, type SpendState } from './spendPress';

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

  describe('clickSpend', () => {
    /** A page's cursor as the tree and talent tabs keep it: moving it drops a waiting press. */
    const page = (st: SpendState) => {
      const p = { cur: 'a', select: vi.fn((key: string) => { if (p.cur !== key) { p.cur = key; cancelSpend(st); } }) };
      return p;
    };

    it('the first click on a node selects and arms it; a second click on it raises once', () => {
      const st: SpendState = { pending: null };
      const s = sfx();
      const raise = ok();
      const p = page(st);
      expect(clickSpend(st, 'b', p.select, () => null, raise, s)).toBe('armed');
      expect(p.cur).toBe('b');
      expect(st.pending).toBe('b');
      expect(raise).not.toHaveBeenCalled();
      expect(clickSpend(st, 'b', p.select, () => null, raise, s)).toBe('raised');
      expect(raise).toHaveBeenCalledTimes(1);
      expect(clickSpend(st, 'b', p.select, () => null, raise, s)).toBe('armed');   // the next click arms again
      expect(raise).toHaveBeenCalledTimes(1);
    });

    it('a click on the cursor\'s node that is not armed arms it (the cursor came by keyboard)', () => {
      const st: SpendState = { pending: null };
      const raise = ok();
      expect(clickSpend(st, 'a', page(st).select, () => null, raise, sfx())).toBe('armed');
      expect(raise).not.toHaveBeenCalled();
    });

    it('a click on another node moves the cursor and arms that node instead of raising', () => {
      const st: SpendState = { pending: null };
      const raise = ok();
      const p = page(st);
      clickSpend(st, 'a', p.select, () => null, raise, sfx());
      expect(clickSpend(st, 'b', p.select, () => null, raise, sfx())).toBe('armed');
      expect([p.cur, st.pending]).toEqual(['b', 'b']);
      expect(clickSpend(st, 'a', p.select, () => null, raise, sfx())).toBe('armed');
      expect(raise).not.toHaveBeenCalled();
      expect(clickSpend(st, 'a', p.select, () => null, raise, sfx())).toBe('raised');
    });

    it('a click on a shut node moves the cursor there and reports the reason at once', () => {
      const st: SpendState = { pending: 'a' };
      const s = sfx();
      const raise = ok();
      const p = page(st);
      expect(clickSpend(st, 'b', p.select, () => 'gate', raise, s)).toEqual({ refused: 'gate' });
      expect([p.cur, st.pending]).toEqual(['b', null]);
      expect(s.error).toHaveBeenCalledTimes(1);
      expect(raise).not.toHaveBeenCalled();
    });
  });

  it('cancelSpend clears pending', () => {
    const st: SpendState = { pending: 'a' };
    cancelSpend(st);
    expect(st.pending).toBeNull();
    cancelSpend(st);
    expect(st.pending).toBeNull();
  });
});
