import { RUNES, type RuneId, type RuneRef } from '../data/runes';
import { T } from '../data/text.zh-TW';
import { art, type RuneIconId, type RuneIconSize } from '../render/artPaths';
import { el } from '../ui/dom';

/**
 * Rune icons (art step 9, G4; user approval 2026-10-24 「可以」): every rune and both slot states at 14 x 14 (inline with
 * 12px text: a skill's slots, the battle menu) and 16 x 16 (the workshop's and the shop's rune rows). Each icon is a
 * published image (`art.runeIcon`); its tier is never drawn into it but shown by the rarity frame around a rune cell
 * (`runeCell`), as gear does. A rune that does nothing where it sits is its own icon greyed (CSS), never another image.
 */

/** One icon to draw: what it is (`data-mark`: `on:<id>`, `off:<id>`, `empty`, `filled`), its picture and its words. */
export interface Mark { mark: string; src: string; alt: string; off?: boolean }

/** The icon of a rune or a slot state at `size`. */
export const runeIconUrl = (id: RuneIconId, size: RuneIconSize): string => art.runeIcon(id, size);

/** A rune that works (`on`) or sits there doing nothing (`off`, greyed), named with its tier. */
export function runeMark(ref: RuneRef, size: RuneIconSize, off = false): Mark {
  const label = T.rune.label(ref.id, ref.tier);
  return { mark: `${off ? 'off' : 'on'}:${ref.id}`, src: runeIconUrl(ref.id, size), alt: off ? T.rune.mark.off(label) : label, ...(off ? { off: true } : {}) };
}

/** An empty slot (`empty`), or the plain filled-slot icon (`filled`) with its own words. */
export function slotMark(kind: 'empty' | 'filled', size: RuneIconSize, alt: string = kind === 'empty' ? T.rune.mark.empty : T.rune.mark.filled): Mark {
  return { mark: kind, src: runeIconUrl(kind === 'empty' ? 'slot-empty' : 'slot-filled', size), alt };
}

/** A skill's open slots in order (skillCard slotStates): each rune's own icon, greyed when it does nothing; an empty slot. */
export function slotMarks(states: readonly { state: 'on' | 'off' | 'empty'; ref?: RuneRef }[], size: RuneIconSize = 14): Mark[] {
  return states.map((s) => (s.state === 'empty' || !s.ref ? slotMark('empty', size) : runeMark(s.ref, size, s.state === 'off')));
}

/** One icon as an image at its own size: never scaled, its words as its alt. */
export function markEl(m: Mark, size: RuneIconSize): HTMLElement {
  return el('img', {
    class: `slx-rune-ico slx-rune-ico-${size}${m.off ? ' slx-rune-off' : ''}`,
    attrs: { src: m.src, alt: m.alt, width: String(size), height: String(size), 'data-mark': m.mark },
  });
}

/** A row of icons (a skill's slots, the battle menu's working runes) in one inline span. */
export function marksEl(marks: readonly Mark[], size: RuneIconSize, cls = 'slx-rune-marks'): HTMLElement {
  return el('span', { class: cls }, marks.map((m) => markEl(m, size)));
}

/**
 * A rune as a 20 x 20 cell (the workshop's and the shop's rune rows): its 16 x 16 icon, and over it the published
 * rarity frame of its tier (common has none, as gear). The frame's 2px band lies in the cell's outer 2px, clear of the icon.
 */
export function runeCell(ref: RuneRef, off = false): HTMLElement {
  return el('span', { class: 'slx-rune-cell', attrs: { 'data-tier': ref.tier } }, [
    markEl(runeMark(ref, 16, off), 16),
    ...(ref.tier === 'common' ? [] : [el('span', { class: `slx-rframe slx-rframe-${ref.tier}`, attrs: { 'aria-hidden': 'true' } })]),
  ]);
}

/** An empty (or plain filled) slot as the same 20 x 20 cell, no frame: lines up with the rune cells around it. */
export function slotCell(kind: 'empty' | 'filled'): HTMLElement {
  return el('span', { class: 'slx-rune-cell' }, [markEl(slotMark(kind, 16), 16)]);
}

/** Every rune id the icons cover (the data's own list). */
export const runeIconIds = (): RuneId[] => Object.keys(RUNES) as RuneId[];
