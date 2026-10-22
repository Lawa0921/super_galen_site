import { describe, expect, it } from 'vitest';
import { FrameBudget } from './frame-budget';

const feed = (budget: FrameBudget, fps: number, seconds: number, active = true) => {
  const changes: number[] = [];
  for (let i = 0; i < Math.ceil(fps * seconds); i++) if (budget.frame(1 / fps, active)) changes.push(budget.scale);
  return changes;
};
const startProbe = (budget: FrameBudget) => {
  expect(feed(budget, 30, 6)).toEqual([.8]);
  expect(budget.scale).toBe(.8);
};
const benefit = (budget: FrameBudget) => {
  startProbe(budget); feed(budget, 60, 6); expect(budget.scale).toBe(.8);
};

describe('live frame pixel budget', () => {
  it('keeps full resolution at normal and high refresh rates', () => {
    for (const fps of [60, 120, 240]) {
      const budget = new FrameBudget();
      expect(feed(budget, fps, 30)).toEqual([]); expect(budget.scale).toBe(1);
    }
  });
  it('requires sustained eligible time, not a few frames or an isolated stall', () => {
    const budget = new FrameBudget();
    feed(budget, 60, 3); budget.frame(.2, true); feed(budget, 60, 4);
    expect(budget.scale).toBe(1);
    expect(feed(budget, 30, 1.8)).toEqual([]);
    budget.frame(.8166, true);
    expect(feed(budget, 30, 2)).toEqual([]); expect(budget.scale).toBe(1);
  });
  it('restores full resolution and stops probing if fewer pixels do not help', () => {
    const budget = new FrameBudget(); startProbe(budget);
    expect(feed(budget, 30, 5)).toEqual([1]);
    expect(feed(budget, 30, 120)).toEqual([]); expect(budget.scale).toBe(1);
  });
  it('retains the lower budget when cadence improves, then tests full quality after sustained headroom', () => {
    const budget = new FrameBudget(); benefit(budget);
    expect(feed(budget, 60, 25)).toEqual([1]); expect(budget.scale).toBe(1);
  });
  it('accepts a material improvement even before reaching the frame-rate target', () => {
    const budget = new FrameBudget(); startProbe(budget);
    feed(budget, 40, 6); expect(budget.scale).toBe(.8);
    expect(feed(budget, 40, 40)).toEqual([]);
  });
  it('returns to the proven lower budget after failed recovery without retrying every few seconds', () => {
    const budget = new FrameBudget(); benefit(budget);
    for (let i = 0; i < 60 * 30 && budget.scale < 1; i++) budget.frame(1 / 60, true);
    expect(budget.scale).toBe(1);
    expect(feed(budget, 30, 5)).toEqual([.8]);
    expect(feed(budget, 60, 25)).toEqual([]); expect(budget.scale).toBe(.8);
  });
  it('does not resize while hidden or paused, and discards an interrupted probe on resume', () => {
    const budget = new FrameBudget(); startProbe(budget);
    expect(feed(budget, 30, 300, false)).toEqual([]); expect(budget.scale).toBe(.8);
    expect(budget.frame(1 / 60, true)).toBe(true); expect(budget.scale).toBe(1);
    expect(feed(budget, 30, 2)).toEqual([]);
  });
  it('preserves a proven lower scale across pause but does not accumulate recovery time in the background', () => {
    const budget = new FrameBudget(); benefit(budget);
    expect(feed(budget, 60, 300, false)).toEqual([]);
    expect(feed(budget, 60, 10)).toEqual([]); expect(budget.scale).toBe(.8);
  });
  it('discards trial baselines after a discontinuity rather than accepting a different workload as improvement', () => {
    const budget = new FrameBudget(); startProbe(budget);
    expect(budget.frame(1, true)).toBe(false);
    expect(budget.frame(1 / 60, true)).toBe(true); expect(budget.scale).toBe(1);
    expect(feed(budget, 60, 10)).toEqual([]);
  });
  it('honors a readability floor and resets all probe history after a layout or quality change', () => {
    const budget = new FrameBudget(); startProbe(budget); feed(budget, 30, 5);
    budget.reset(.95); expect(budget.scale).toBe(1);
    expect(feed(budget, 30, 6)).toEqual([.95]);
    budget.reset(1); expect(feed(budget, 30, 30)).toEqual([]); expect(budget.scale).toBe(1);
  });
  it('does not react to loading, invalid durations, or inactive menu cadence', () => {
    const budget = new FrameBudget();
    expect(feed(budget, 10, 30, false)).toEqual([]);
    for (const dt of [0, -1, NaN, Infinity]) expect(budget.frame(dt, true)).toBe(false);
    expect(feed(budget, 30, 2)).toEqual([]); expect(budget.scale).toBe(1);
  });
  it('requires enough samples as well as elapsed time on a slow display', () => {
    const budget = new FrameBudget();
    expect(feed(budget, 10, 6.8)).toEqual([]);
    expect(feed(budget, 10, .4)).toEqual([.8]);
  });
  it('discards partially accumulated recovery headroom across a pause', () => {
    const budget = new FrameBudget(); benefit(budget);
    expect(feed(budget, 60, 10)).toEqual([]);
    expect(feed(budget, 60, 300, false)).toEqual([]);
    expect(feed(budget, 60, 12)).toEqual([]);
    expect(feed(budget, 60, 13)).toEqual([1]);
  });
  it('uses a strict slow threshold and includes the exact benefit boundary', () => {
    const budget = new FrameBudget();
    expect(feed(budget, 1 / .022, 10)).toEqual([]);
    budget.reset(); expect(feed(budget, 1 / .022001, 6)).toEqual([.8]);
    budget.reset(); startProbe(budget);
    feed(budget, 30 / .88, 6); expect(budget.scale).toBe(.8);
    budget.reset(); expect(feed(budget, 1 / .022001, 6)).toEqual([.8]);
    feed(budget, 1 / .019, 6); expect(budget.scale).toBe(.8);
  });
});
