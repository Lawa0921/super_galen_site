import { describe, expect, it } from 'vitest';
import { RenderSchedule } from './render-schedule';

describe('paused render scheduling', () => {
  it('keeps every active frame, then draws the transition into pause only once', () => {
    const schedule = new RenderSchedule();
    expect(schedule.frame(false)).toBe(true);
    expect(schedule.frame(false)).toBe(true);
    expect(schedule.frame(true)).toBe(true);
    expect(schedule.frame(true)).toBe(false);
    expect(schedule.frame(true)).toBe(false);
  });

  it('coalesces paused display changes into one redraw without resuming animation', () => {
    const schedule = new RenderSchedule();
    expect(schedule.frame(true)).toBe(true);
    schedule.invalidate();
    schedule.invalidate();
    expect(schedule.frame(true)).toBe(true);
    expect(schedule.frame(true)).toBe(false);
  });

  it('resumes drawing immediately after an unchanged paused frame', () => {
    const schedule = new RenderSchedule();
    schedule.frame(true);
    expect(schedule.frame(true)).toBe(false);
    expect(schedule.frame(false)).toBe(true);
    expect(schedule.frame(false)).toBe(true);
    expect(schedule.frame(true)).toBe(true);
  });

  it('does not consume pending changes while hidden and redraws when visible again', () => {
    const schedule = new RenderSchedule();
    schedule.frame(true);
    schedule.invalidate();
    expect(schedule.frame(true, false)).toBe(false);
    expect(schedule.frame(false, false)).toBe(false);
    expect(schedule.frame(true, true)).toBe(true);
    expect(schedule.frame(true, true)).toBe(false);
  });

  it('retains a visible frame after hiding even without an explicit display change', () => {
    const schedule = new RenderSchedule();
    schedule.frame(true);
    expect(schedule.frame(true, false)).toBe(false);
    expect(schedule.frame(true)).toBe(true);
  });
});
