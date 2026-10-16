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

  it('tags each member with their row', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet', 30, { row: 'front' }), m('noel', 30, { row: 'middle' })]);
    expect([...bar.el.querySelectorAll('.slx-pm-row')].map((e) => e.textContent)).toEqual(['前', '中']);
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

  it('shows a damage or heal number on the panel and marks a knockout', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet'), m('liz')]);
    bar.pulse('scarlet', 'hit', 24);
    const panel = (k: string) => bar.el.querySelector(`[data-key=${k}]`)!;
    expect(panel('scarlet').classList.contains('slx-pm-hit')).toBe(true);
    expect(panel('scarlet').querySelector('.slx-pm-pop')!.textContent).toBe('-24');
    bar.pulse('liz', 'heal', 60);
    expect(panel('liz').querySelector('.slx-pm-pop-heal')!.textContent).toBe('+60');
    bar.pulse('liz', 'ko');
    expect(panel('liz').classList.contains('slx-pm-ko')).toBe(true);
  });

  it('lays the attack effect over the face, enlarges heavy numbers and calls out weak hits', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet')]);
    bar.pulse('scarlet', 'hit', 30, { fx: '/fx/slash.png', heavy: true, weak: true });
    const panel = bar.el.querySelector('[data-key=scarlet]')!;
    expect(panel.querySelector('.slx-pm-fx')!.getAttribute('src')).toBe('/fx/slash.png');
    expect(panel.querySelector('.slx-pm-pop')!.classList.contains('slx-pm-pop-big')).toBe(true);
    expect(panel.querySelector('.slx-pm-weak')!.textContent).toBe('弱點！');
  });

  it('keeps a low-HP member\'s panel flashing a warning', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet', 6), m('liz', 30), m('noel', 0)]);
    const danger = (k: string) => bar.el.querySelector(`[data-key=${k}]`)!.classList.contains('slx-pm-danger');
    expect([danger('scarlet'), danger('liz'), danger('noel')]).toEqual([true, false, false]);
  });

  it('updates panels in place, so a shake or number already playing is not cut off', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet'), m('liz')]);
    const before = bar.el.querySelector('[data-key=scarlet]');
    bar.pulse('scarlet', 'hit', 5);
    bar.update([m('scarlet', 25), m('liz', 20)]);
    const after = bar.el.querySelector('[data-key=scarlet]')!;
    expect(after).toBe(before);
    expect(after.classList.contains('slx-pm-hit')).toBe(true);
    expect(after.querySelector('.slx-pm-pop')).not.toBeNull();
    expect(after.textContent).toContain('25/30');
  });
});
