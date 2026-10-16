import { portraitImg, showMood } from '../ui/art';
import { el } from '../ui/dom';
import type { Row } from '../engine/types';
import type { ArtIndex } from '../render/textures';

const ROW_TAG: Record<Row, string> = { front: '前', middle: '中', back: '後' };

/** `row` shows a small 前／中／後 tag so the formation is visible during play. */
export interface BarMember { key: string; name: string; hp: number; maxHp: number; tp: number; maxTp: number; limit: number; alive: boolean; row?: Row }

/** A drawn bar (a native <meter> cannot be styled reliably); the fill width is a 5% step class, any value above 0 shows at least one step. */
function bar(value: number, max: number, cls: string): HTMLElement {
  const m = Math.max(1, max);
  const v = Math.max(0, Math.min(m, value));
  const step = v <= 0 ? 0 : Math.max(1, Math.round((v / m) * 20));
  return el('span', { class: `slx-bar ${cls}`, attrs: { role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(m), 'aria-valuenow': String(v) } }, [
    el('span', { class: `slx-fill slx-fill-${step}` }),
  ]);
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
          el('span', { class: 'slx-pm-name' }, [m.name, ...(m.row ? [el('span', { class: `slx-pm-row slx-pm-row-${m.row}`, text: ROW_TAG[m.row] })] : [])]),
          el('span', { class: 'slx-pm-num', text: `${m.hp}/${m.maxHp}` }),
          bar(m.hp, m.maxHp, m.hp > 0 && m.hp <= m.maxHp / 4 ? 'slx-bar-hp slx-low' : 'slx-bar-hp'),
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
