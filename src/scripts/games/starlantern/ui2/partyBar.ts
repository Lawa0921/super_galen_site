import { portraitImg, showMood } from '../ui/art';
import { el } from '../ui/dom';
import { T } from '../data/text.zh-TW';
import type { Row } from '../engine/types';
import type { AilmentChip } from '../engine/ailments';
import type { MechWord } from '../engine/mechanics/index';
import { bySeverity, fitRow, isHalting, textWidth } from '../render/ailmentStyle';
import type { ArtIndex } from '../render/textures';

const ROW_TAG: Record<Row, string> = { front: '前', middle: '中', back: '後' };
/**
 * A panel's ailment row in design px: the party bar is 632 wide in five columns with 4 px gaps (123.2 each), less the
 * panel's 1 px borders, less 2 px to spare. A word is its text at 12 px (legibility Task 4) plus 1 px padding and a 1 px rim each side.
 */
const AIL_ROW_W = 119;
const ailWordWidth = (text: string): number => textWidth(text, 12) + 4;

/** `row` shows a small 前／中／後 tag so the formation is visible during play. */
export interface BarMember { key: string; name: string; hp: number; maxHp: number; tp: number; maxTp: number; limit: number; alive: boolean; row?: Row;
  /** The art id of the face when it is not `key` (Rin after her oath). */
  artId?: string;
  /** Ailments held, shown as coloured words with their rounds under the bars; none (or empty) shows nothing. */
  ailments?: AilmentChip[];
  /** Her mechanic's words (「熱度3」「隱匿」), first in the same row as the ailments (plan 8c). */
  mech?: MechWord[] }
/** `miss` and `tp` only pop a word or number: no face, shake or glow. */
export type PulseMood = 'attack' | 'hit' | 'heal' | 'ko' | 'miss' | 'tp';
/**
 * `fxAnim` plays a published 4-frame effect sheet over the face (its image is set per key in the stylesheet);
 * `fx` lays a single effect image instead; `heavy` enlarges the number; `weak` calls out a weak-point hit, `crit` a
 * critical one (its own colour and tag), `resist` an element the member resisted.
 */
export interface PulseOpts { fx?: string; fxAnim?: string; heavy?: boolean; weak?: boolean; crit?: boolean; resist?: boolean }

/** A drawn bar (a native <meter> cannot be styled reliably); the fill width is a 5% step class, any value above 0 shows at least one step. */
/** 5% step for a value; anything above 0 shows at least one step. */
function stepOf(value: number, max: number): number {
  const m = Math.max(1, max);
  const v = Math.max(0, Math.min(m, value));
  return v <= 0 ? 0 : Math.max(1, Math.round((v / m) * 20));
}

/** Point an existing bar at a new value without rebuilding it. */
function setBar(b: HTMLElement, value: number, max: number, cls: string): void {
  const m = Math.max(1, max);
  const v = Math.max(0, Math.min(m, value));
  b.className = `slx-bar ${cls}`;
  b.setAttribute('aria-valuemax', String(m));
  b.setAttribute('aria-valuenow', String(v));
  const fill = b.querySelector<HTMLElement>('.slx-fill');
  if (fill) fill.className = `slx-fill slx-fill-${stepOf(v, m)}`;
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
interface Panel { el: HTMLElement; body: HTMLElement; face: HTMLImageElement | null; member: BarMember; until: number; ghost: number | null; drain: ReturnType<typeof setTimeout> | null; shrinking?: boolean }
const GHOST_MS = 350;
/** Matches the .slx-ghost width transition. */
const GHOST_DRAIN_MS = 460;

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
      this.fillBody(p);
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
    if (mood === 'miss' || mood === 'tp') { this.quietPop(p, mood, amount); return; }
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
      const cls = ['slx-pm-pop', mood === 'heal' ? 'slx-pm-pop-heal' : '', opts.heavy ? 'slx-pm-pop-big' : '', opts.crit ? 'slx-pm-pop-crit' : ''].filter(Boolean).join(' ');
      extras.push(el('span', { class: cls, text: `${mood === 'heal' ? '+' : '-'}${amount}`, attrs: { 'aria-hidden': 'true' } }));
    }
    // Tags stack above the face: 暴擊！ on top, then 弱點！ or 抗性.
    const tags = [opts.crit && ['slx-pm-crit', T.battle.pop.crit], opts.weak && ['slx-pm-weak', T.battle.pop.weak], opts.resist && ['slx-pm-resist', T.battle.pop.resist]]
      .filter((x): x is string[] => !!x);
    tags.forEach(([cls, text], i) => extras.push(el('span', { class: `${cls} slx-pm-tag-${i}`, text, attrs: { 'aria-hidden': 'true' } })));
    p.el.append(...extras);
    setTimeout(() => { for (const x of extras) x.remove(); }, POP_MS);
  }

  /** A mechanic's moment (暴走！, 還有。): its word in its colour rising off the panel, like MISS. */
  cue(key: string, w: MechWord): void {
    const p = this.panels.get(key);
    if (!p) return;
    const pop = el('span', { class: `slx-pm-cue slx-mech-${w.tone}`, text: w.text, attrs: { 'aria-hidden': 'true' } });
    p.el.append(pop);
    setTimeout(() => pop.remove(), POP_MS);
  }

  /** MISS or a TP gain: a word or number rising off the panel and nothing else, so it never reads as a hit. */
  private quietPop(p: Panel, mood: 'miss' | 'tp', amount?: number): void {
    if (mood === 'tp' && !amount) return;
    const pop = mood === 'miss'
      ? el('span', { class: 'slx-pm-miss', text: T.battle.pop.miss, attrs: { 'aria-hidden': 'true' } })
      : el('span', { class: 'slx-pm-pop slx-pm-pop-tp', text: T.battle.pop.tp(amount!), attrs: { 'aria-hidden': 'true' } });
    p.el.append(pop);
    setTimeout(() => pop.remove(), POP_MS);
  }

  private create(m: BarMember): Panel {
    const panel = el('div', { class: 'slx-pm', attrs: { 'data-key': m.key } });
    const body = el('div', { class: 'slx-pm-body' });
    const p: Panel = { el: panel, body, face: null, member: m, until: 0, ghost: null, drain: null };
    panel.append(body);
    this.panels.set(m.key, p);
    return p;
  }

  /**
   * Name, numbers and bars. Built once per panel, then only their text, classes and values change, so a ghost that is
   * draining (a CSS width transition) is never replaced mid-way.
   */
  private fillBody(p: Panel): void {
    const m = p.member;
    if (!p.body.firstChild) {
      p.body.append(el('span', { class: 'slx-pm-name' }), el('span', { class: 'slx-pm-num' }), bar(0, 1, 'slx-bar-hp'),
        el('span', { class: 'slx-pm-tp' }), bar(0, 1, 'slx-bar-tp'), bar(0, 1, 'slx-bar-limit'), el('span', { class: 'slx-pm-ail' }));
    }
    const [name, num, hp, tpNum, tp, limit, ail] = [...p.body.children] as HTMLElement[];
    // One line, by priority (plan 8c final): freeze and sleep (never folded), her mechanic's words, then the other ailments,
    // the most severe first; what does not fit folds into +N. Widths are measured on the page (the row's own width and
    // each word's), and estimated only where nothing is laid out (tests).
    const chips = bySeverity(m.ailments ?? []);
    const halting = chips.filter(isHalting);
    const words = [
      ...halting.map((c) => el('span', { class: `slx-ail slx-ail-${c.id}`, text: T.ailmentChip(c) })),
      ...(m.mech ?? []).map((x) => el('span', { class: `slx-mech slx-mech-${x.tone}`, text: x.text })),
      ...chips.filter((c) => !isHalting(c)).map((c) => el('span', { class: `slx-ail slx-ail-${c.id}`, text: T.ailmentChip(c) })),
    ];
    const moreEl = (n: number) => el('span', { class: 'slx-ail slx-ail-more', text: T.ailmentMore(n) });
    ail.hidden = words.length === 0;
    ail.replaceChildren(...words);
    const probe = moreEl(words.length);
    ail.append(probe);
    // Layout px (offsetWidth, as clientWidth), not the scaled screen box.
    const measured = ail.clientWidth > 0 && [...words, probe].every((w) => w.offsetWidth > 0);
    const widthOf = (w: HTMLElement) => (measured ? w.offsetWidth : ailWordWidth(w.textContent ?? ''));
    const moreW = measured ? probe.offsetWidth : 0;
    probe.remove();
    const { shown, more } = fitRow(words, measured ? ail.clientWidth : AIL_ROW_W, widthOf, (n) => (measured ? moreW : ailWordWidth(T.ailmentMore(n))), 1, halting.length);
    ail.replaceChildren(...shown, ...(more ? [moreEl(more)] : []));
    tpNum.textContent = `TP ${m.tp}/${m.maxTp}`;
    name.replaceChildren(m.name, ...(m.row ? [el('span', { class: `slx-pm-row slx-pm-row-${m.row}`, text: ROW_TAG[m.row] })] : []));
    num.textContent = `${m.hp}/${m.maxHp}`;
    setBar(hp, m.hp, m.maxHp, m.hp > 0 && m.hp <= m.maxHp / 4 ? 'slx-bar-hp slx-low' : 'slx-bar-hp');
    setBar(tp, m.tp, m.maxTp, 'slx-bar-tp');
    setBar(limit, m.limit, 100, m.limit >= 100 ? 'slx-bar-limit slx-bar-full' : 'slx-bar-limit');
    let ghost = hp.querySelector<HTMLElement>('.slx-ghost');
    if (p.ghost !== null && p.ghost > m.hp) {
      if (!ghost) { ghost = el('span', { class: `slx-ghost slx-fill-${stepOf(p.ghost, m.maxHp)}` }); hp.prepend(ghost); }
    } else if (ghost && !p.drain && !p.shrinking) ghost.remove();
  }

  /** Start (or extend) the ghost from `from` HP; after a beat it drains to the current value (a width transition). */
  private loseHp(p: Panel, from: number): void {
    p.ghost = from;
    if (p.drain) clearTimeout(p.drain);
    p.drain = setTimeout(() => {
      p.drain = null;
      p.ghost = null;
      const g = p.el.querySelector('.slx-ghost');
      if (!g) return;
      // Shrink to the current HP (CSS transition), then drop it.
      g.className = `slx-ghost slx-fill-${stepOf(p.member.hp, p.member.maxHp)}`;
      p.shrinking = true;
      setTimeout(() => { p.shrinking = false; if (!p.drain) g.remove(); }, GHOST_DRAIN_MS);
    }, GHOST_MS);
  }

  /** The face for the member's current HP (normal, dying or down). */
  private resetFace(p: Panel): void {
    const face = portraitImg(this.art, p.member.artId ?? p.member.key, p.member.hp, p.member.maxHp);
    if (!face) { p.face?.remove(); p.face = null; return; }
    if (p.face && p.face.getAttribute('src') === face.getAttribute('src') && p.face.className === face.className) return;
    if (p.face) p.face.replaceWith(face); else p.el.prepend(face);
    p.face = face;
  }
}
