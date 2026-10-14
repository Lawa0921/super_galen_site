import { describe, it, expect } from 'vitest';
import { advance, danger } from './encounter';

const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe('danger', () => {
  it('maps the value to the indicator colour', () => {
    expect(danger(0)).toBe('green');
    expect(danger(39)).toBe('green');
    expect(danger(40)).toBe('yellow');
    expect(danger(74)).toBe('yellow');
    expect(danger(75)).toBe('red');
  });
});

describe('advance', () => {
  it('adds a step amount below the yellow line without rolling', () => {
    expect(advance(0, seq(0.5), [6, 14])).toEqual({ value: 10, encounter: false });
  });
  it('always triggers at the cap and resets', () => {
    expect(advance(95, seq(0.5), [6, 14])).toEqual({ value: 0, encounter: true });
  });
  it('rolls once past the yellow line', () => {
    expect(advance(50, seq(0, 0), [6, 14])).toEqual({ value: 0, encounter: true });
    expect(advance(50, seq(0, 0.99), [6, 14])).toEqual({ value: 56, encounter: false });
  });
  it('scales the gain by the modifier (stealth)', () => {
    expect(advance(0, seq(0.5), [6, 14], 0.5)).toEqual({ value: 5, encounter: false });
  });
});
