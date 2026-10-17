import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeTetrisFrames } from './tetris-frame-observer';

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>).__tetrisDebug;
});

function fixture() {
  const lockstep = { confirmedFrame: 50 };
  const calls: number[] = [];
  const match = {
    value: 0,
    step(dt: number) { calls.push(dt); this.value++; },
    a: { getState: () => ({ board: [[match.value]], score: match.value }) },
    b: { getState: () => ({ board: [[2]], score: 2 }) },
    phase: 'playing', winner: null,
    pendingGarbage: () => 0,
  };
  (window as unknown as Record<string, unknown>).__tetrisDebug = { match, lockstep };
  const step = () => { match.step(1000 / 60); lockstep.confirmedFrame++; };
  return { match, lockstep, calls, step };
}

describe('Tetris confirmed-frame observer', () => {
  it('captures every confirmed step with original this/arguments and restores the method on completion', async () => {
    vi.useFakeTimers();
    const { match, calls, step } = fixture();
    const original = match.step;
    const pending = observeTetrisFrames(3000);
    for (let index = 0; index < 12; index++) step();
    await vi.advanceTimersByTimeAsync(3000);
    const samples = await pending;
    expect(samples.map(sample => sample.frame)).toEqual(Array.from({ length: 13 }, (_, index) => 50 + index));
    expect(JSON.parse(samples[12].state).a.score).toBe(12);
    expect(calls).toEqual(Array(12).fill(1000 / 60));
    expect(match.value).toBe(12);
    expect(match.step).toBe(original);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves original simulation errors and removes its observer', async () => {
    vi.useFakeTimers();
    const { match } = fixture();
    const failure = new Error('original simulation failure');
    match.step = () => { throw failure; };
    const original = match.step;
    const pending = observeTetrisFrames(3000);
    const rejected = expect(pending).rejects.toBe(failure);
    expect(() => match.step(17)).toThrow(failure);
    await rejected;
    expect(match.step).toBe(original);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects buffer overflow without advancing or interrupting the simulation itself', async () => {
    vi.useFakeTimers();
    const { match, lockstep, calls, step } = fixture();
    const original = match.step;
    const pending = observeTetrisFrames(3000);
    const rejected = expect(pending).rejects.toThrow('bounded capacity');
    for (let index = 0; index < 513; index++) step();
    await rejected;
    expect(match.value).toBe(513);
    expect(lockstep.confirmedFrame).toBe(563);
    expect(calls).toHaveLength(513);
    expect(match.step).toBe(original);
    expect(vi.getTimerCount()).toBe(0);
  });
});
