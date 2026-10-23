import { Text } from 'pixi.js';

/**
 * Every text the Pixi layer draws (legibility Task 4): the page's pixel font, at one of its two sizes, never bold (the
 * font has no bold; a fake one smears its pixels). The fallbacks are the page's own, for a font that failed to load.
 */
export const PIXEL_FONT: string[] = ['Cubic 11', 'Noto Sans TC', 'Microsoft JhengHei', 'sans-serif'];

/** The pixel font's grid: 12px, or 24px for display words (hit numbers, map markers). */
export type PixelSize = 12 | 24;

/** A Pixi text in the pixel font. Its outline straddles the glyph's edge: width size/6 shows as 1px at 12px, 2px at 24px. */
export function pixelText(text: string, size: PixelSize, fill: number, stroke = 0x000000): Text {
  return new Text({ text, style: { fontFamily: PIXEL_FONT, fontSize: size, fontWeight: 'normal', fill, stroke: { color: stroke, width: size / 6 } } });
}
