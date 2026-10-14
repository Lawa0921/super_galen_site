import { describe, expect, it } from 'vitest';
import { warmScissorSize } from './warm-scissor';

describe('one-pixel warm-up scissor', () => {
  it('covers one physical pixel at the native ratio and above', () => {
    expect(warmScissorSize(1)).toBe(1);
    expect(warmScissorSize(2)).toBe(1);
  });
  it('never collapses to an empty rectangle when the frame budget scales below 1', () => {
    // three floors scissor * pixelRatio; 1 * .67 would become 0 x 0.
    for (const ratio of [.83, .67, .5, .34]) expect(Math.floor(warmScissorSize(ratio) * ratio)).toBeGreaterThanOrEqual(1);
  });
});
