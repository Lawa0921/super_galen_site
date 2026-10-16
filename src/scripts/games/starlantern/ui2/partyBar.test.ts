import { describe, expect, it } from 'vitest';
import { art } from '../render/artPaths';
import { NO_ART } from '../render/textures';
import { PartyBar } from './partyBar';

const m = (key: string, hp = 30, extra = {}) => ({ key, name: key, hp, maxHp: 30, tp: 10, maxTp: 20, limit: 40, alive: hp > 0, ...extra });

describe('PartyBar', () => {
  it('shows one panel per member with bars, the active one lit and the fallen dimmed', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet'), m('liz', 0), m('noel')], 'noel');
    const panels = [...bar.el.querySelectorAll('.slx-pm')];
    expect(panels.map((p) => (p as HTMLElement).dataset.key)).toEqual(['scarlet', 'liz', 'noel']);
    expect(panels[2].classList.contains('slx-pm-active')).toBe(true);
    expect(panels[1].classList.contains('slx-pm-down')).toBe(true);
    const hp = panels[0].querySelector('.slx-bar-hp')!;
    expect(hp.getAttribute('role')).toBe('meter');
    expect([hp.getAttribute('aria-valuenow'), hp.getAttribute('aria-valuemax')]).toEqual(['30', '30']);
    expect(hp.querySelector('.slx-fill-20')).not.toBeNull();
    expect(panels[0].querySelector('.slx-bar-limit .slx-fill-8')).not.toBeNull();   // 40 of 100
    expect(panels[1].querySelector('.slx-bar-hp .slx-fill-0')).not.toBeNull();
    expect(panels[0].textContent).toContain('30/30');
  });

  it('turns the HP bar red when a member is low, and shows a sliver for any HP left', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet', 7), m('liz', 1), m('noel', 20)]);
    const hp = (k: string) => bar.el.querySelector(`[data-key=${k}] .slx-bar-hp`)!;
    expect(hp('scarlet').classList.contains('slx-low')).toBe(true);
    expect(hp('noel').classList.contains('slx-low')).toBe(false);
    expect(hp('liz').querySelector('.slx-fill-1')).not.toBeNull();
  });

  it('uses the mood portrait and swaps it briefly on a pulse', () => {
    const idx = { has: (u: string) => [art.portrait('scarlet', 'normal'), art.portrait('scarlet', 'hit'), art.portrait('scarlet', 'dying')].includes(u) };
    const bar = new PartyBar(idx);
    bar.update([m('scarlet', 5)]);
    const img = () => bar.el.querySelector('.slx-pm img')!.getAttribute('src');
    expect(img()).toBe(art.portrait('scarlet', 'dying'));
    bar.pulse('scarlet', 'hit');
    expect(img()).toBe(art.portrait('scarlet', 'hit'));
  });
});
