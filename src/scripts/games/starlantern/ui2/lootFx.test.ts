import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rarity } from '../engine/types';
import { LEGEND_MS, LOOT_DELAY_MS, PILLAR_MS, bestRarity, clearPillars, dropMoment, showPillar, skipPillar } from './lootFx';

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

  it('confirm or cancel skips the legendary moment; movement keys and ordinary pillars take no key', () => {
    const host = document.createElement('div');
    showPillar(host, 'rare', true);
    expect(skipPillar(host, 'confirm')).toBe(false);
    expect(host.querySelector('.slx-pillar')).not.toBeNull();
    showPillar(host, 'set', true);
    for (const a of ['up', 'down', 'left', 'right', 'menu'] as const) expect(skipPillar(host, a)).toBe(false);   // a held direction keeps its step
    expect(host.querySelector('.slx-pillar-legend')).not.toBeNull();
    expect(skipPillar(host, 'cancel')).toBe(true);
    expect(host.querySelector('.slx-pillar')).toBeNull();
    showPillar(host, 'unique', true);
    expect(skipPillar(host, 'confirm')).toBe(true);
    expect(skipPillar(host, 'confirm')).toBe(false);
  });

  it('a replaced, skipped or cleared pillar leaves no removal timer behind', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    showPillar(host, 'magic', false);
    showPillar(host, 'legendary', false);
    expect(vi.getTimerCount()).toBe(1);   // the replaced pillar's timer is gone
    skipPillar(host, 'confirm');
    expect(vi.getTimerCount()).toBe(0);
    showPillar(host, 'rare', false);
    clearPillars(host);   // scene exit
    expect(vi.getTimerCount()).toBe(0);
    expect(host.querySelector('.slx-pillar')).toBeNull();
  });

  it('the pillar leaves when its own look ends (animationend), not when a part of it ends', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    const p = showPillar(host, 'legendary', false)!;
    const end = (target: Element, animationName: string) => {
      const e = new Event('animationend', { bubbles: true });
      Object.defineProperty(e, 'animationName', { value: animationName });
      target.dispatchEvent(e);
    };
    end(p.querySelector('.slx-pillar-burst')!, 'slx-pillar-burst');
    end(p, 'slx-pillar-throb');
    expect(host.contains(p)).toBe(true);
    end(p, 'slx-pillar-life');
    expect(host.contains(p)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    const q = showPillar(host, 'magic', false)!;
    end(q, 'slx-pillar-fade');   // reduced motion's look
    expect(host.contains(q)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the best piece of a drop picks the pillar and the chime, once', () => {
    expect(bestRarity([])).toBeNull();
    expect(bestRarity([{ rarity: 'magic' }, { rarity: 'legendary' }, { rarity: 'rare' }])).toBe('legendary');
    const host = document.createElement('div');
    const loot = vi.fn();
    const sfx = { loot };
    dropMoment({ sfx: sfx as never, fast: true }, host, [{ rarity: 'magic' }, { rarity: 'rare' }, { rarity: 'common' }]);
    expect(loot).toHaveBeenCalledTimes(1);
    expect(loot).toHaveBeenCalledWith('rare', LOOT_DELAY_MS);   // after the chest, vault or win cue, never on top of it
    expect(LOOT_DELAY_MS).toBe(150);
    expect(host.querySelectorAll('.slx-pillar.slx-rarity-rare').length).toBe(1);
    // Common only, or nothing: no pillar and no chime.
    dropMoment({ sfx: sfx as never, fast: true }, host, [{ rarity: 'common' }]);
    dropMoment({ sfx: sfx as never, fast: true }, host, []);
    expect(loot).toHaveBeenCalledTimes(1);
  });
});
