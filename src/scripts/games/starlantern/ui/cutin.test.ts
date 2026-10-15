import { afterEach, describe, expect, it, vi } from 'vitest';
import { CUTIN_MS, playCutIn } from './cutin';

describe('playCutIn', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the portrait band with the ultimate name, then clears itself', async () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    root.hidden = true;
    const done = playCutIn(root, { name: '紅蓮劫火', portrait: '/assets/games/starlantern/char/scarlet-portrait-ultimate.png', fast: false });
    expect(root.hidden).toBe(false);
    expect(root.classList.contains('sl-cutin--on')).toBe(true);
    expect(root.querySelector('.sl-cutin__name')!.textContent).toBe('紅蓮劫火');
    expect(root.querySelector('img')!.getAttribute('src')).toContain('portrait-ultimate');
    await vi.advanceTimersByTimeAsync(CUTIN_MS);
    await done;
    expect(root.hidden).toBe(true);
    expect(root.childElementCount).toBe(0);
  });

  it('works without a portrait and is skipped entirely in fast mode', async () => {
    const root = document.createElement('div');
    root.hidden = true;
    await playCutIn(root, { name: '全彈發射', portrait: null, fast: true });
    expect(root.hidden).toBe(true);
    expect(root.childElementCount).toBe(0);
  });
});
