import { describe, expect, it } from 'vitest';
import { ROSTER_ART, ROSTER_LIVE } from '../data/monsters';
import { withRosterLive, withRosterOnly } from './testing';

/**
 * Roster plan L1b (controller ruling 2026-10-28): once a wave is live, the pins written for the empty live set run inside
 * `withRosterOnly([], …)`, which makes the live set exactly the ids given and puts both sets back afterwards.
 */
describe('withRosterOnly (roster plan L1b)', () => {
  const snap = () => ({ live: [...ROSTER_LIVE], art: [...ROSTER_ART] });

  it('makes the live set exactly the ids given, then puts both sets back', () => {
    const before = snap();
    expect(before.live.length).toBeGreaterThan(0);   // a wave is live
    withRosterOnly([], () => expect(ROSTER_LIVE.size).toBe(0));
    withRosterOnly(['old-city-sentinel'], () => {
      expect([...ROSTER_LIVE]).toEqual(['old-city-sentinel']);
      expect(ROSTER_ART.has('old-city-sentinel')).toBe(true);   // live stays inside art
    });
    expect(snap()).toEqual(before);
    expect(withRosterOnly([], () => 7)).toBe(7);
  });

  it('puts them back when the callback throws', () => {
    const before = snap();
    expect(() => withRosterOnly([], () => { throw new Error('boom'); })).toThrow('boom');
    expect(snap()).toEqual(before);
  });

  it('waits for an async callback, and puts them back after it settles, resolved or rejected', async () => {
    const before = snap();
    const seen = await withRosterOnly([], async () => { await Promise.resolve(); return ROSTER_LIVE.size; });
    expect(seen).toBe(0);
    expect(snap()).toEqual(before);
    await expect(withRosterOnly([], async () => { await Promise.resolve(); throw new Error('late'); })).rejects.toThrow('late');
    expect(snap()).toEqual(before);
  });

  it('nests, with withRosterLive and with itself', () => {
    const before = snap();
    withRosterOnly([], () => {
      withRosterLive(['paper-moth'], () => expect([...ROSTER_LIVE]).toEqual(['paper-moth']));
      expect(ROSTER_LIVE.size).toBe(0);
      withRosterOnly(['root-hound'], () => expect([...ROSTER_LIVE]).toEqual(['root-hound']));
      expect(ROSTER_LIVE.size).toBe(0);
    });
    expect(snap()).toEqual(before);
  });
});
