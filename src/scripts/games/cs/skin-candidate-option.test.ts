import { describe, expect, it } from 'vitest';
import { useSkinCandidate } from './skin-candidate-option';

describe('local skin candidate opt-in', () => {
  it('accepts the explicit development flag', () => {
    expect(useSkinCandidate(true, '?skinCandidate=1')).toBe(true);
  });
  it('does not enable candidates for ordinary or malformed URLs', () => {
    for (const search of ['', '?skinCandidate=0', '?skinCandidate=true', '?other=1']) {
      expect(useSkinCandidate(true, search)).toBe(false);
    }
  });
  it('never enables the candidate in production', () => {
    expect(useSkinCandidate(false, '?skinCandidate=1')).toBe(false);
  });
});
