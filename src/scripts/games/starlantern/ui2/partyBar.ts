import { portraitImg, showMood } from '../ui/art';
import { el } from '../ui/dom';
import type { ArtIndex } from '../render/textures';

export interface BarMember { key: string; name: string; hp: number; maxHp: number; tp: number; maxTp: number; limit: number; alive: boolean }

function bar(value: number, max: number, cls: string): HTMLMeterElement {
  return el('meter', { class: cls, attrs: { min: '0', max: String(Math.max(1, max)), value: String(value) } });
}

/** The five member panels along the bottom of the labyrinth and battle screens. */
export class PartyBar {
  readonly el = el('div', { class: 'slx-partybar' });

  constructor(private art: ArtIndex) {}

  update(members: BarMember[], active: string | null = null): void {
    this.el.replaceChildren(...members.map((m) => {
      const cls = ['slx-pm', m.key === active ? 'slx-pm-active' : '', m.alive ? '' : 'slx-pm-down'].filter(Boolean).join(' ');
      const face = portraitImg(this.art, m.key, m.hp, m.maxHp);
      return el('div', { class: cls, attrs: { 'data-key': m.key } }, [
        ...(face ? [face] : []),
        el('div', { class: 'slx-pm-body' }, [
          el('span', { class: 'slx-pm-name', text: m.name }),
          el('span', { class: 'slx-pm-num', text: `${m.hp}/${m.maxHp}` }),
          bar(m.hp, m.maxHp, 'slx-bar-hp'),
          bar(m.tp, m.maxTp, 'slx-bar-tp'),
          bar(m.limit, 100, m.limit >= 100 ? 'slx-bar-limit slx-bar-full' : 'slx-bar-limit'),
        ]),
      ]);
    }));
  }

  /** Momentary attack / hit face and a flash on the panel. */
  pulse(key: string, mood: 'attack' | 'hit'): void {
    const panel = this.el.querySelector<HTMLElement>(`.slx-pm[data-key="${key}"]`);
    if (!panel) return;
    const face = panel.querySelector<HTMLImageElement>('img');
    if (face) showMood(this.art, face, mood);
    panel.classList.remove('slx-pm-hit', 'slx-pm-acting');
    void panel.offsetWidth;
    panel.classList.add(mood === 'hit' ? 'slx-pm-hit' : 'slx-pm-acting');
  }
}
