import { portraitImg, showMood } from '../ui/art';
import { el } from '../ui/dom';
import type { Row } from '../engine/types';
import type { ArtIndex } from '../render/textures';

const ROW_TAG: Record<Row, string> = { front: '前', middle: '中', back: '後' };

/** `row` shows a small 前／中／後 tag so the formation is visible during play. */
export interface BarMember { key: string; name: string; hp: number; maxHp: number; tp: number; maxTp: number; limit: number; alive: boolean; row?: Row }
export type PulseMood = 'attack' | 'hit' | 'heal' | 'ko';
/**
 * `fxAnim` plays a published 4-frame effect sheet over the face (its image is set per key in the stylesheet);
 * `fx` lays a single effect image instead; `heavy` enlarges the number; `weak` calls out a weak-point hit.
 */
export interface PulseOpts { fx?: string; fxAnim?: string; heavy?: boolean; weak?: boolean }

/** A drawn bar (a native <meter> cannot be styled reliably); the fill width is a 5% step class, any value above 0 shows at least one step. */
/** 5% step for a value; anything above 0 shows at least one step. */
function stepOf(value: number, max: number): number {
  const m = Math.max(1, max);
  const v = Math.max(0, Math.min(m, value));
  return v <= 0 ? 0 : Math.max(1, Math.round((v / m) * 20));
}

function bar(value: number, max: number, cls: string): HTMLElement {
  const m = Math.max(1, max);
  const v = Math.max(0, Math.min(m, value));
  const step = stepOf(v, m);
  return el('span', { class: `slx-bar ${cls}`, attrs: { role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(m), 'aria-valuenow': String(v) } }, [
    el('span', { class: `slx-fill slx-fill-${step}` }),
  ]);
}

/** Classes a pulse adds for a moment; an update keeps them so a running shake is not cut off. */
const TRANSIENT = ['slx-pm-hit', 'slx-pm-acting', 'slx-pm-heal', 'slx-pm-ko'];
const PULSE_MS = 450;
const POP_MS = 900;

/** `ghost` is HP just lost, still drawn white behind the bar until it drains (GHOST_MS). */
interface Panel { el: HTMLElement; body: HTMLElement; face: HTMLImageElement | null; member: BarMember; until: number; ghost: number | null; drain: ReturnType<typeof setTimeout> | null }
const GHOST_MS = 350;

/** The five member panels along the bottom of the labyrinth and battle screens. */
export class PartyBar {
  readonly el = el('div', { class: 'slx-partybar' });
  private panels = new Map<string, Panel>();

  constructor(private art: ArtIndex) {}

  /** Panels are updated in place (not rebuilt), so a shake or a number already on screen keeps playing. */
  update(members: BarMember[], active: string | null = null): void {
    const keys = new Set(members.map((m) => m.key));
    for (const [k, p] of this.panels) if (!keys.has(k)) { p.el.remove(); this.panels.delete(k); }
    const order = members.map((m) => {
      const known = this.panels.get(m.key);
      const p = known ?? this.create(m);
      if (known && m.hp < known.member.hp) this.loseHp(p, Math.max(p.ghost ?? 0, known.member.hp));
      if (p.ghost !== null && m.hp >= p.ghost) p.ghost = null;
      p.member = m;
      const transient = TRANSIENT.filter((c) => p.el.classList.contains(c));
      const danger = m.alive && m.hp > 0 && m.hp <= m.maxHp / 4;
      p.el.className = ['slx-pm', m.key === active ? 'slx-pm-active' : '', m.alive ? '' : 'slx-pm-down', danger ? 'slx-pm-danger' : '', ...transient].filter(Boolean).join(' ');
      if (!transient.length) this.resetFace(p);
      p.body.replaceChildren(
        el('span', { class: 'slx-pm-name' }, [m.name, ...(m.row ? [el('span', { class: `slx-pm-row slx-pm-row-${m.row}`, text: ROW_TAG[m.row] })] : [])]),
        el('span', { class: 'slx-pm-num', text: `${m.hp}/${m.maxHp}` }),
        this.hpBar(p),
        bar(m.tp, m.maxTp, 'slx-bar-tp'),
        bar(m.limit, 100, m.limit >= 100 ? 'slx-bar-limit slx-bar-full' : 'slx-bar-limit'),
      );
      return p.el;
    });
    // Re-inserting a panel would restart its animation; only reorder when the order really changed.
    const current = [...this.el.children];
    if (current.length !== order.length || current.some((c, i) => c !== order[i])) this.el.replaceChildren(...order);
  }

  /** A momentary face, shake or glow, and the number that caused it. */
  pulse(key: string, mood: PulseMood, amount?: number, opts: PulseOpts = {}): void {
    const p = this.panels.get(key);
    if (!p) return;
    if (p.face) showMood(this.art, p.face, mood === 'heal' ? 'normal' : mood === 'ko' ? 'down' : mood);
    const cls = mood === 'hit' ? 'slx-pm-hit' : mood === 'heal' ? 'slx-pm-heal' : mood === 'ko' ? 'slx-pm-ko' : 'slx-pm-acting';
    p.el.classList.remove(...TRANSIENT);
    void p.el.offsetWidth;   // restart the animation when the same panel is hit twice in a row
    p.el.classList.add(cls);
    const until = (p.until = Date.now() + PULSE_MS);
    setTimeout(() => {
      if (p.until !== until) return;
      p.el.classList.remove(cls);
      this.resetFace(p);
    }, PULSE_MS);
    const extras: HTMLElement[] = [];
    if (opts.fxAnim) extras.push(el('span', { class: `slx-pm-fxa slx-pm-fxa-${opts.fxAnim}`, attrs: { 'aria-hidden': 'true' } }));
    else if (opts.fx) extras.push(el('img', { class: 'slx-pm-fx', attrs: { src: opts.fx, alt: '', 'aria-hidden': 'true' } }));
    if (amount !== undefined && (mood === 'hit' || mood === 'heal')) {
      const cls = ['slx-pm-pop', mood === 'heal' ? 'slx-pm-pop-heal' : '', opts.heavy ? 'slx-pm-pop-big' : ''].filter(Boolean).join(' ');
      extras.push(el('span', { class: cls, text: `${mood === 'heal' ? '+' : '-'}${amount}`, attrs: { 'aria-hidden': 'true' } }));
    }
    if (opts.weak) extras.push(el('span', { class: 'slx-pm-weak', text: '弱點！', attrs: { 'aria-hidden': 'true' } }));
    p.el.append(...extras);
    setTimeout(() => { for (const x of extras) x.remove(); }, POP_MS);
  }

  private create(m: BarMember): Panel {
    const panel = el('div', { class: 'slx-pm', attrs: { 'data-key': m.key } });
    const body = el('div', { class: 'slx-pm-body' });
    const p: Panel = { el: panel, body, face: null, member: m, until: 0, ghost: null, drain: null };
    panel.append(body);
    this.panels.set(m.key, p);
    return p;
  }

  /** HP bar with the white ghost of what was just lost, when there is one. */
  private hpBar(p: Panel): HTMLElement {
    const m = p.member;
    const b = bar(m.hp, m.maxHp, m.hp > 0 && m.hp <= m.maxHp / 4 ? 'slx-bar-hp slx-low' : 'slx-bar-hp');
    if (p.ghost !== null && p.ghost > m.hp) b.prepend(el('span', { class: `slx-ghost slx-fill-${stepOf(p.ghost, m.maxHp)}` }));
    return b;
  }

  /** Start (or extend) the ghost from `from` HP; after a beat it drains to the current value (a width transition). */
  private loseHp(p: Panel, from: number): void {
    p.ghost = from;
    if (p.drain) clearTimeout(p.drain);
    p.drain = setTimeout(() => {
      p.drain = null;
      p.ghost = null;
      const g = p.el.querySelector('.slx-ghost');
      if (g) g.className = `slx-ghost slx-fill-${stepOf(p.member.hp, p.member.maxHp)}`;
    }, GHOST_MS);
  }

  /** The face for the member's current HP (normal, dying or down). */
  private resetFace(p: Panel): void {
    const face = portraitImg(this.art, p.member.key, p.member.hp, p.member.maxHp);
    if (!face) { p.face?.remove(); p.face = null; return; }
    if (p.face && p.face.getAttribute('src') === face.getAttribute('src') && p.face.className === face.className) return;
    if (p.face) p.face.replaceWith(face); else p.el.prepend(face);
    p.face = face;
  }
}
