import { describe, expect, it } from 'vitest';
import { compareConfirmedFrameSamples, type ConfirmedFrameSample } from './confirmed-frame-samples';

const sample = (frame: number, state = `state-at-${frame}`): ConfirmedFrameSample => ({ frame, state });

describe('confirmed-frame comparison', () => {
  it('accepts identical shared states when independently read endpoints differ by eleven frames', () => {
    const result = compareConfirmedFrameSamples(
      [sample(220), sample(221), sample(222)],
      [sample(221), sample(222), sample(233)],
    );
    expect(result).toEqual({ frames: [221, 222], latestFrame: 222 });
  });

  it('rejects a differing state at any shared frame even when the latest state matches', () => {
    expect(() => compareConfirmedFrameSamples(
      [sample(220), sample(221), sample(222)],
      [sample(220), sample(221, 'diverged'), sample(222)],
    )).toThrow('State differs at confirmed frame 221');
  });

  it('rejects empty or disjoint samples instead of treating absent evidence as synchronization', () => {
    expect(() => compareConfirmedFrameSamples([], [sample(220), sample(221)])).toThrow('shared confirmed frames');
    expect(() => compareConfirmedFrameSamples([sample(220), sample(221)], [sample(230), sample(231)]))
      .toThrow('shared confirmed frames');
  });

  it('rejects one repeated shared frame because it does not prove continued progress', () => {
    expect(() => compareConfirmedFrameSamples([sample(220), sample(220)], [sample(220), sample(220)]))
      .toThrow('shared confirmed frames');
  });

  it('deduplicates identical observations but rejects conflicting snapshots of the same frame', () => {
    expect(compareConfirmedFrameSamples([sample(221), sample(220), sample(220)], [sample(220), sample(221)]).frames)
      .toEqual([220, 221]);
    expect(() => compareConfirmedFrameSamples([sample(220), sample(220, 'changed'), sample(221)], [sample(220), sample(221)]))
      .toThrow('Conflicting samples at confirmed frame 220');
  });

  it('rejects malformed frame identities and absent serialized state', () => {
    for (const frame of [-1, 0.5, NaN, Infinity]) {
      expect(() => compareConfirmedFrameSamples([sample(frame), sample(221)], [sample(220), sample(221)]))
        .toThrow('Invalid confirmed-frame sample');
    }
    expect(() => compareConfirmedFrameSamples([sample(220, ''), sample(221)], [sample(220), sample(221)]))
      .toThrow('Invalid confirmed-frame sample');
  });
});
