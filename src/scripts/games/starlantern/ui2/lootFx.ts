import { RARITIES } from '../data/gear';
import type { Rarity } from '../engine/types';
import { el } from '../ui/dom';
import type { SceneCtx } from './scene';

/** How long a drop's light pillar stays; the legend tier's special moment is cleaned up later (its look ends by 1.1 s). */
export const PILLAR_MS = 1200;
export const LEGEND_MS = 2000;

/** Legendary, unique and set: spec §8 傳說另有特殊演出. */
const LEGEND = new Set<Rarity>(['legendary', 'unique', 'set']);
/** The CSS animations that end a pillar's look (normal and reduced motion); the pillar leaves when one ends. */
const LAST = new Set(['slx-pillar-life', 'slx-pillar-fade']);

/**
 * A column of light in the rarity's colour rising behind the windows (gradients and CSS animation only, `_starlantern-ui.scss`).
 * Common gear raises none. A newer drop replaces the last pillar. In fast mode nothing is timed: the pillar stays until
 * its animation ends, the next drop, a skip, or the scene goes.
 */
export function showPillar(host: HTMLElement, rarity: Rarity, fast: boolean): HTMLElement | null {
  if (rarity === 'common') return null;
  host.querySelectorAll(':scope > .slx-pillar').forEach((p) => p.remove());
  const legend = LEGEND.has(rarity);
  const p = el('div', { class: `slx-pillar slx-rarity-${rarity}${legend ? ' slx-pillar-legend' : ''}`, attrs: { 'aria-hidden': 'true' } },
    legend ? [el('span', { class: 'slx-pillar-burst' })] : []);
  p.addEventListener('animationend', (e) => { if (e.target === p && LAST.has(e.animationName)) p.remove(); });
  // First child: behind every window of the scene, above the battle or map stage.
  host.prepend(p);
  if (!fast) setTimeout(() => p.remove(), legend ? LEGEND_MS : PILLAR_MS);
  return p;
}

/** Any key ends the legend tier's moment early; true when there was one to end (the key is spent on it). */
export function skipPillar(host: HTMLElement): boolean {
  const p = host.querySelector(':scope > .slx-pillar-legend');
  p?.remove();
  return !!p;
}

/** The rarest of a drop, or null for none. */
export function bestRarity(items: readonly { rarity: Rarity }[]): Rarity | null {
  let best: Rarity | null = null;
  for (const it of items) if (!best || RARITIES.indexOf(it.rarity) > RARITIES.indexOf(best)) best = it.rarity;
  return best;
}

/** One drop, one moment: the best piece raises the pillar and plays its chime, once. Common-only drops stay quiet. */
export function dropMoment(ctx: Pick<SceneCtx, 'sfx' | 'fast'>, host: HTMLElement, items: readonly { rarity: Rarity }[]): HTMLElement | null {
  const best = bestRarity(items);
  const p = best ? showPillar(host, best, !!ctx.fast) : null;
  if (p && best) ctx.sfx.loot?.(best);
  return p;
}
