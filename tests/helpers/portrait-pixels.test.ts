import { describe, expect, it } from 'vitest';
import { portraitPixelsMatch, type PortraitPixels } from './portrait-pixels';

const frame = (data: number[], width = 2, height = 1): PortraitPixels => ({ width, height, data });

describe('paused portrait screenshot comparison', () => {
  const original = frame([40, 100, 200, 255, 80, 120, 60, 255]);

  it('accepts unchanged decoded RGBA pixels', () => {
    expect(portraitPixelsMatch(original, frame([40, 100, 200, 255, 80, 120, 60, 255]))).toBe(true);
  });

  it('accepts one-level RGB quantization in every pixel in either direction', () => {
    const quantized = frame([41, 99, 201, 255, 79, 121, 59, 255]);
    expect(portraitPixelsMatch(original, quantized)).toBe(true);
    expect(portraitPixelsMatch(quantized, original)).toBe(true);
  });

  it('rejects a single RGB channel that changes by two levels', () => {
    expect(portraitPixelsMatch(original, frame([40, 100, 200, 255, 80, 122, 60, 255]))).toBe(false);
  });

  it('rejects alpha changes above one level', () => {
    expect(portraitPixelsMatch(original, frame([40, 100, 200, 253, 80, 120, 60, 255]))).toBe(false);
  });

  it('rejects different dimensions even with identical byte counts', () => {
    expect(portraitPixelsMatch(original, frame(Array.from(original.data), 1, 2))).toBe(false);
  });

  it('rejects missing pixel data and empty images', () => {
    expect(portraitPixelsMatch(original, frame([40, 100, 200, 255]))).toBe(false);
    expect(portraitPixelsMatch(frame([], 0, 0), frame([], 0, 0))).toBe(false);
  });

  it('rejects invalid negative dimensions even when their product matches the data length', () => {
    const invalid = frame(Array.from(original.data), -2, -1);
    expect(portraitPixelsMatch(invalid, invalid)).toBe(false);
  });
});
