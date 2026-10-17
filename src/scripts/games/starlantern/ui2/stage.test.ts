import { describe, expect, it, vi } from 'vitest';
import { NO_ART } from '../render/textures';
import { Stage } from './stage';

const fakeApp = () => ({ stage: { addChild: vi.fn() }, ticker: { add: vi.fn() } });

describe('Stage', () => {
  it('puts a fixed 640x360 canvas under the ui layer', () => {
    const screen = document.createElement('main'); const ui = document.createElement('div'); ui.id = 'sl-ui'; screen.append(ui);
    const s = new Stage(screen, NO_ART as never, true, async () => fakeApp() as never);
    const canvas = screen.querySelector('canvas')!;
    expect(canvas.nextElementSibling).toBe(ui);
    expect([canvas.width, canvas.height]).toEqual([640, 360]);
    expect(s.size()).toEqual({ width: 640, height: 360 });
  });

  it('reports false and keeps going when the renderer cannot start', async () => {
    const screen = document.createElement('main');
    const s = new Stage(screen, NO_ART as never, true, async () => { throw new Error('no webgl'); });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await s.ready()).toBe(false);
    s.show('map');
    err.mockRestore();
  });

  it('shows one view at a time', async () => {
    const screen = document.createElement('main');
    const s = new Stage(screen, NO_ART as never, true, async () => fakeApp() as never);
    expect(await s.ready()).toBe(true);
    s.show('map');
    expect([s.mapView.root.visible, s.battleView.root.visible]).toEqual([true, false]);
    s.show('battle');
    expect([s.mapView.root.visible, s.battleView.root.visible]).toEqual([false, true]);
    s.show(null);
    expect([s.mapView.root.visible, s.battleView.root.visible]).toEqual([false, false]);
  });
});
