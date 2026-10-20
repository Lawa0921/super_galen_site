import { RARITIES } from '../data/gear';
import type { Rarity } from '../engine/types';
import { el } from '../ui/dom';
import type { UiAction } from './input';
import type { SceneCtx } from './scene';

/** How long a drop's light pillar stays; the legend tier's special moment is cleaned up later (its look ends by 1.1 s). */
export const PILLAR_MS = 1200;
export const LEGEND_MS = 2000;
/** The chime waits this long, so it follows the chest, vault or win cue instead of doubling it at the same pitches. */
export const LOOT_DELAY_MS = 150;

/** Legendary, unique and set: spec §8 傳說另有特殊演出. */
const LEGEND = new Set<Rarity>(['legendary', 'unique', 'set']);
/** The CSS animations that end a pillar's look (normal and reduced motion); the pillar leaves when one ends. */
const LAST = new Set(['slx-pillar-life', 'slx-pillar-fade']);
/** Only these keys end the legend moment early; a held direction must never lose its step to it. */
const SKIP_KEYS = new Set<UiAction>(['confirm', 'cancel']);
/** Each pillar's removal timer, cleared whenever the pillar goes some other way. */
const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

function removePillar(p: Element): void {
  const t = timers.get(p);
  if (t !== undefined) { clearTimeout(t); timers.delete(p); }
  p.remove();
}

/**
 * A column of light in the rarity's colour rising from where the loot is (gradients and CSS animation only,
 * `_starlantern-ui.scss`). The host places it: the labyrinth screen stands it on the party's tile, the battle result
 * window on its own top edge. Common gear raises none. A newer drop replaces the last pillar. In fast mode nothing is
 * timed: the pillar stays until its animation ends, the next drop, a skip, or the scene goes. A `starlit` piece (plan 5g)
 * raises a legend pillar in star-light (`slx-pillar-starlit`).
 */
export function showPillar(host: HTMLElement, rarity: Rarity, fast: boolean, starlit = false): HTMLElement | null {
  if (rarity === 'common') return null;
  clearPillars(host);
  const legend = starlit || LEGEND.has(rarity);
  const cls = `slx-pillar slx-rarity-${rarity}${legend ? ' slx-pillar-legend' : ''}${starlit ? ' slx-pillar-starlit' : ''}`;
  const p = el('div', { class: cls, attrs: { 'aria-hidden': 'true' } },
    legend ? [el('span', { class: 'slx-pillar-burst' })] : []);
  p.addEventListener('animationend', (e) => { if (e.target === p && LAST.has(e.animationName)) removePillar(p); });
  // First child: behind the host's own contents (the windows of the labyrinth, the lines of the results).
  host.prepend(p);
  if (!fast) timers.set(p, setTimeout(() => removePillar(p), legend ? LEGEND_MS : PILLAR_MS));
  return p;
}

/** Remove every pillar under `host` with its timer (a newer drop, or the scene's exit). */
export function clearPillars(host: HTMLElement): void {
  host.querySelectorAll('.slx-pillar').forEach(removePillar);
}

/** Confirm or cancel ends the legend tier's moment early; true when there was one to end (the key is spent on it). */
export function skipPillar(host: HTMLElement, a: UiAction): boolean {
  if (!SKIP_KEYS.has(a)) return false;
  const p = host.querySelector('.slx-pillar-legend');
  if (p) removePillar(p);
  return !!p;
}

/** A piece's place in a drop: any starlit piece above every plain one, then RARITIES order. */
const dropRank = (it: { rarity: Rarity; starlit?: true }): number => (it.starlit ? RARITIES.length : 0) + RARITIES.indexOf(it.rarity);

/** The best piece of a drop (a starlit one first, then the rarest; a tie keeps the first), or null for none. */
export function bestDrop<T extends { rarity: Rarity; starlit?: true }>(items: readonly T[]): T | null {
  let best: T | null = null;
  for (const it of items) if (!best || dropRank(it) > dropRank(best)) best = it;
  return best;
}

/**
 * One drop, one moment: the best piece raises the pillar and plays its chime once, LOOT_DELAY_MS after the cue that
 * came with the drop. Common-only drops stay quiet. A starlit best piece passes the starlit flag to both.
 */
export function dropMoment(ctx: Pick<SceneCtx, 'sfx' | 'fast'>, host: HTMLElement, items: readonly { rarity: Rarity; starlit?: true }[]): HTMLElement | null {
  const best = bestDrop(items);
  if (!best || best.rarity === 'common') return null;
  const starlit = best.starlit === true;
  if (starlit) ctx.sfx.loot?.(best.rarity, LOOT_DELAY_MS, true);
  else ctx.sfx.loot?.(best.rarity, LOOT_DELAY_MS);
  return showPillar(host, best.rarity, !!ctx.fast, starlit);
}
