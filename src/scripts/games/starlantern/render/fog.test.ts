import { describe, expect, it } from 'vitest';
import { fogState } from './fog';

describe('fogState', () => {
  const explored = new Set(['1,1', '2,1', '3,1', '5,5']);
  const pos = { x: 1, y: 1 };

  it('hides tiles the party has never revealed', () => {
    expect(fogState(explored, pos, 4, 4)).toBe('hidden');
    expect(fogState(explored, pos, 0, 0)).toBe('hidden');
  });

  it('shows revealed tiles next to the party at full brightness', () => {
    expect(fogState(explored, pos, 1, 1)).toBe('visible');
    expect(fogState(explored, pos, 2, 1)).toBe('visible');
  });

  it('dims revealed tiles out of sight as remembered', () => {
    expect(fogState(explored, pos, 3, 1)).toBe('memory');
    expect(fogState(explored, pos, 5, 5)).toBe('memory');
  });
});
