import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rarity } from '../engine/types';
import { LEGEND_MS, PILLAR_MS, bestRarity, dropMoment, showPillar, skipPillar } from './lootFx';

afterEach(() => { vi.useRealTimers(); });

describe('lootFx', () => {
  it('a pillar per rarity, none for common, a special one for legendary', () => {
    const host = document.createElement('div');
    expect(showPillar(host, 'common', true)).toBeNull();
    expect(host.children.length).toBe(0);
    const cases: [Rarity, boolean][] = [['magic', false], ['rare', false], ['legendary', true], ['unique', true], ['set', true]];
    for (const [r, legend] of cases) {
      const p = showPillar(host, r, true)!;
      expect(p.classList.contains('slx-pillar')).toBe(true);
      expect(p.classList.contains(`slx-rarity-${r}`)).toBe(true);
      expect(p.classList.contains('slx-pillar-legend')).toBe(legend);
      expect(!!p.querySelector('.slx-pillar-burst')).toBe(legend);   // the legend tier's burst of light
      expect(p.getAttribute('aria-hidden')).toBe('true');
      expect(p.getAttribute('style')).toBeNull();   // classes only, never inline styles
      expect(host.querySelectorAll('.slx-pillar').length).toBe(1);   // a newer drop replaces the last pillar
    }
  });

  it('a pillar leaves on its own: 1200 ms, a legendary one 2000 ms', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    const p = showPillar(host, 'rare', false)!;
    vi.advanceTimersByTime(PILLAR_MS - 1);
    expect(host.contains(p)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(host.contains(p)).toBe(false);
    const l = showPillar(host, 'legendary', false)!;
    vi.advanceTimersByTime(LEGEND_MS - 1);
    expect(host.contains(l)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(host.contains(l)).toBe(false);
    expect([PILLAR_MS, LEGEND_MS]).toEqual([1200, 2000]);
  });

  it('fast mode leaves no timers', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    for (const r of ['magic', 'rare', 'legendary', 'unique', 'set'] as const) showPillar(host, r, true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('any key skips the legendary moment; an ordinary pillar takes no key', () => {
    const host = document.createElement('div');
    showPillar(host, 'rare', true);
    expect(skipPillar(host)).toBe(false);
    expect(host.querySelector('.slx-pillar')).not.toBeNull();
    showPillar(host, 'set', true);
    expect(skipPillar(host)).toBe(true);
    expect(host.querySelector('.slx-pillar')).toBeNull();
    expect(skipPillar(host)).toBe(false);
  });

  it('the best piece of a drop picks the pillar and the chime, once', () => {
    expect(bestRarity([])).toBeNull();
    expect(bestRarity([{ rarity: 'magic' }, { rarity: 'legendary' }, { rarity: 'rare' }])).toBe('legendary');
    const host = document.createElement('div');
    const loot = vi.fn();
    const sfx = { loot };
    dropMoment({ sfx: sfx as never, fast: true }, host, [{ rarity: 'magic' }, { rarity: 'rare' }, { rarity: 'common' }]);
    expect(loot).toHaveBeenCalledTimes(1);
    expect(loot).toHaveBeenCalledWith('rare');
    expect(host.querySelectorAll('.slx-pillar.slx-rarity-rare').length).toBe(1);
    // Common only, or nothing: no pillar and no chime.
    dropMoment({ sfx: sfx as never, fast: true }, host, [{ rarity: 'common' }]);
    dropMoment({ sfx: sfx as never, fast: true }, host, []);
    expect(loot).toHaveBeenCalledTimes(1);
  });
});
