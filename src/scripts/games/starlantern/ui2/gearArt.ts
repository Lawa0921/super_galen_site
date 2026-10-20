import { STARLIT_RARITIES } from '../data/gear';
import type { ItemInstance, Rarity } from '../engine/types';
import { art, gearArtId } from '../render/artPaths';
import type { ArtIndex } from '../render/textures';
import { el } from '../ui/dom';

/**
 * Gear art (plan 5d Task 6). Every layer is a published image or nothing: with no art the caller keeps its text, and no
 * frame, glow or star light is ever drawn in CSS.
 */

/**
 * The picture of a piece: `<img class="slx-gear-ico">` (26 x 26, shown at its own size), or with `large` the 64 x 64
 * `<img class="slx-gear-art">` for the item detail. A special uses its own art only (never its base's); unpublished
 * art gives `[]`.
 */
export function gearIcon(idx: ArtIndex, it: Pick<ItemInstance, 'base' | 'special'>, large = false): HTMLElement[] {
  const id = gearArtId(it);
  const src = large ? art.gearLarge(id) : art.gear(id);
  if (!idx.has(src)) return [];
  return [el('img', { class: large ? 'slx-gear-art' : 'slx-gear-ico', attrs: { src, alt: '' } })];
}

/**
 * The url of a piece's published gear art (or of a gear id's: a base, a special, a set piece), else undefined. For list
 * rows and loot lines, which draw it as `<img class="slx-ico slx-gear-ico">`. Never the base's art for a special, and
 * never an old `icon/` path.
 */
export function gearIconUrl(idx: ArtIndex, it: Pick<ItemInstance, 'base' | 'special'> | string): string | undefined {
  const src = art.gear(typeof it === 'string' ? it : gearArtId(it));
  return idx.has(src) ? src : undefined;
}

/**
 * The rarity layers around a piece's picture, each a nine-slice image on a span that fills its cell:
 * - `under` (goes before the icon): the legend tier's in-cell glow, `.slx-rglow`;
 * - `over` (goes after it): the frame `.slx-rframe.slx-rframe-<r>` (none for common), then on a starlit legendary,
 *   unique or set piece the star-light overlay `.slx-rstarlit`.
 * A layer whose art is not published is left out.
 */
export function rarityFrame(idx: ArtIndex, rarity: Rarity, starlit = false): { under: HTMLElement[]; over: HTMLElement[] } {
  const layer = (cls: string) => el('span', { class: cls, attrs: { 'aria-hidden': 'true' } });
  const under: HTMLElement[] = [];
  const over: HTMLElement[] = [];
  if (rarity === 'common') return { under, over };
  if (rarity === 'legendary' && idx.has(art.rarityGlow)) under.push(layer('slx-rglow'));
  if (idx.has(art.rarityFrame(rarity))) over.push(layer(`slx-rframe slx-rframe-${rarity}`));
  if (starlit && STARLIT_RARITIES.includes(rarity) && idx.has(art.starlitOverlay)) over.push(layer('slx-rstarlit'));
  return { under, over };
}

/** A piece's picture with its rarity layers in paint order, or `[]` when its picture is not published. */
export function framedGear(idx: ArtIndex, it: ItemInstance, large = false): HTMLElement[] {
  const icon = gearIcon(idx, it, large);
  if (!icon.length) return [];
  const { under, over } = rarityFrame(idx, it.rarity, it.starlit === true);
  return [...under, ...icon, ...over];
}
