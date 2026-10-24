import { describe, it, expect } from 'vitest';
import { MAX_DAY, MOON_EPOCH, MOON_ORDER, SPRING_AFTER, dayOf, moonOf, nextDay, seasonAt, tonightMoon } from './calendar';
import { newGame } from './state';
import { STAGES } from '../data/story/scenes';

describe('time and moon: the calendar (Task 1)', () => {
  it('the moon turns once every four days, full on day 0', () => {
    expect(MOON_ORDER).toEqual(['new', 'waxing', 'full', 'waning']);
    expect(MOON_EPOCH).toBe(2);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(moonOf)).toEqual(['full', 'waning', 'new', 'waxing', 'full', 'waning', 'new', 'waxing', 'full']);
    expect(moonOf(-1)).toBe('waxing');
    expect(moonOf(-4)).toBe('full');
    expect(moonOf(-6)).toBe('new');
  });

  it('a new game reads as day 1, and its first night is a full moon', () => {
    const g = newGame();
    expect(g.story.day).toBeUndefined();
    expect(dayOf(g)).toBe(1);
    expect(moonOf(dayOf(g))).toBe('waning');
    expect(tonightMoon(g)).toBe('full');
    g.story.day = 3;
    expect([dayOf(g), tonightMoon(g)]).toEqual([3, 'new']);
  });

  it('the days stop at MAX_DAY', () => {
    expect(MAX_DAY).toBe(999999);
    expect(nextDay(1)).toBe(2);
    expect(nextDay(MAX_DAY - 1)).toBe(MAX_DAY);
    expect(nextDay(MAX_DAY)).toBe(MAX_DAY);
  });

  it('autumn until act 3, winter through act 4 and the finale, spring SPRING_AFTER days after it', () => {
    expect(SPRING_AFTER).toBe(4);
    expect(STAGES).toEqual(['prologue', 'act1', 'act2', 'act3', 'act4', 'after']);
    expect(seasonAt('prologue', 1, false)).toBe('autumn');
    expect(seasonAt('act1', 40, false)).toBe('autumn');
    expect(seasonAt('act2', 90, false)).toBe('autumn');
    expect(seasonAt('act3', 5, false)).toBe('winter');
    expect(seasonAt('act4', 300, false)).toBe('winter');
    // the finale cleared on day 20: the festival night is still winter; spring from springDay on, and it stays
    expect(seasonAt('after', 20, true, 20 + SPRING_AFTER)).toBe('winter');
    expect(seasonAt('after', 23, true, 24)).toBe('winter');
    expect(seasonAt('after', 24, true, 24)).toBe('spring');
    expect(seasonAt('after', 500, true, 24)).toBe('spring');
    // a cleared finale with no springDay reads as spring already (a read default, not a migration)
    expect(seasonAt('after', 7, true)).toBe('spring');
  });
});
