import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPixelFont } from './fonts';

const face = {} as FontFace;

describe('loadPixelFont (legibility Task 4)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('true when a face loads', async () => {
    const load = vi.fn(async () => [face]);
    expect(await loadPixelFont({ load })).toBe(true);
    expect(load).toHaveBeenCalledWith('12px "Cubic 11"');
  });

  it('false when no face matches', async () => {
    expect(await loadPixelFont({ load: async () => [] })).toBe(false);
  });

  it('false when loading fails', async () => {
    expect(await loadPixelFont({ load: async () => { throw new Error('blocked'); } })).toBe(false);
  });

  it('false after the timeout', async () => {
    vi.useFakeTimers();
    const never = { load: () => new Promise<FontFace[]>(() => undefined) };
    const result = loadPixelFont(never, 3000);
    let done: boolean | null = null;
    void result.then((v) => { done = v; });
    await vi.advanceTimersByTimeAsync(2999);
    expect(done).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(false);
  });
});
