import { describe, expect, it, vi } from 'vitest';

const init = vi.fn(async () => undefined);
vi.mock('pixi.js', () => ({ Application: class { init = init; } }));

describe('createFixedApp (legibility Task 4)', () => {
  it('asks Pixi for whole-pixel drawing', async () => {
    const { createFixedApp } = await import('./app');
    const canvas = document.createElement('canvas');
    await createFixedApp(canvas, 640, 360);
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ canvas, width: 640, height: 360, roundPixels: true, resolution: 1, antialias: false }));
  });
});
