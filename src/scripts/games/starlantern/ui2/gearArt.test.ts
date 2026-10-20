import { compile } from 'sass';
import { describe, expect, it } from 'vitest';
import { plainItem } from '../engine/testing';
import type { ItemInstance, Rarity } from '../engine/types';
import { art, FRAMED_RARITIES } from '../render/artPaths';
import type { ArtIndex } from '../render/textures';
import { gearIcon, gearIconUrl, rarityFrame } from './gearArt';
import { gearPart } from './loot';

const only = (...urls: string[]): ArtIndex => ({ has: (u) => urls.includes(u) });
const ALL: ArtIndex = { has: () => true };
const gear = (base: string, rarity: Rarity, extra: Partial<ItemInstance> = {}): ItemInstance => ({ ...plainItem(base, 1), rarity, ...extra });
const classes = (els: HTMLElement[]) => els.map((e) => e.className);

describe('gearIcon', () => {
  it('a special without its own art shows text, never the base icon', () => {
    const sword = gear('iron-sword', 'legendary', { special: 'blaze-heart-sword' });
    const base = only(art.gear('iron-sword'), art.gearLarge('iron-sword'), art.icon('iron-sword'));
    expect(gearIcon(base, sword)).toEqual([]);
    expect(gearIcon(base, sword, true)).toEqual([]);
  });

  it('returns the icon only when published', () => {
    const sword = gear('iron-sword', 'legendary', { special: 'blaze-heart-sword' });
    const [ico] = gearIcon(only(art.gear('blaze-heart-sword')), sword);
    expect(ico.tagName).toBe('IMG');
    expect(ico.className).toBe('slx-gear-ico');
    expect(ico.getAttribute('src')).toBe(art.gear('blaze-heart-sword'));
    expect(ico.getAttribute('alt')).toBe('');
    expect(gearIcon(only(art.gear('blaze-heart-sword')), sword, true)).toEqual([]);   // the large one is its own file
    const [big] = gearIcon(only(art.gearLarge('blaze-heart-sword')), sword, true);
    expect(big.className).toBe('slx-gear-art');
    expect(big.getAttribute('src')).toBe(art.gearLarge('blaze-heart-sword'));
    expect(gearIcon(only(), gear('iron-sword', 'common'))).toEqual([]);
    expect(gearIcon(only(art.gear('iron-sword')), gear('iron-sword', 'common'))[0].getAttribute('src')).toBe(art.gear('iron-sword'));
  });
});

describe('gear icons in lists and lines (plan 5d Task 7)', () => {
  it('gearIconUrl is the published gear art of the piece or of the id, never its base or old icon', () => {
    const special = gear('iron-sword', 'legendary', { special: 'blaze-heart-sword' });
    expect(gearIconUrl(only(art.gear('iron-sword'), art.icon('iron-sword')), special)).toBeUndefined();
    expect(gearIconUrl(only(art.gear('blaze-heart-sword')), special)).toBe(art.gear('blaze-heart-sword'));
    expect(gearIconUrl(only(art.gear('set-blaze-weapon')), 'set-blaze-weapon')).toBe(art.gear('set-blaze-weapon'));
    expect(gearIconUrl(only(art.icon('iron-sword')), 'iron-sword')).toBeUndefined();
  });

  it('gearPart carries an icon only when given one', () => {
    const it0 = gear('iron-sword', 'rare');
    expect(gearPart(it0)).toEqual({ text: '鐵劍・稀有', cls: 'slx-gear-drop slx-rarity-rare' });
    expect(gearPart(it0, undefined)).toEqual({ text: '鐵劍・稀有', cls: 'slx-gear-drop slx-rarity-rare' });
    expect(gearPart(it0, art.gear('iron-sword'))).toEqual({ text: '鐵劍・稀有', cls: 'slx-gear-drop slx-rarity-rare', icon: art.gear('iron-sword') });
  });
});

describe('rarityFrame', () => {
  it('common has no frame; legendary has a frame and a glow', () => {
    expect(rarityFrame(ALL, 'common')).toEqual({ under: [], over: [] });
    expect(rarityFrame(ALL, 'common', true)).toEqual({ under: [], over: [] });
    const f = rarityFrame(ALL, 'legendary');
    expect(classes(f.under)).toEqual(['slx-rglow']);
    expect(classes(f.over)).toEqual(['slx-rframe slx-rframe-legendary']);
    expect(classes(rarityFrame(ALL, 'magic').under)).toEqual([]);
    for (const r of FRAMED_RARITIES) expect(classes(rarityFrame(ALL, r).over), r).toEqual([`slx-rframe slx-rframe-${r}`]);
    for (const e of [...f.under, ...f.over]) expect(e.getAttribute('aria-hidden')).toBe('true');
  });

  it('epic gets its own frame', () => {
    expect(classes(rarityFrame(only(art.rarityFrame('epic')), 'epic').over)).toEqual(['slx-rframe slx-rframe-epic']);
    expect(rarityFrame(only(art.rarityFrame('rare')), 'epic')).toEqual({ under: [], over: [] });
  });

  it('starlit overlays only legendary, unique and set', () => {
    for (const r of ['legendary', 'unique', 'set'] as const) {
      expect(classes(rarityFrame(ALL, r, true).over), r).toEqual([`slx-rframe slx-rframe-${r}`, 'slx-rstarlit']);
      expect(classes(rarityFrame(ALL, r, false).over), r).toEqual([`slx-rframe slx-rframe-${r}`]);
    }
    for (const r of ['magic', 'rare', 'epic'] as const) expect(classes(rarityFrame(ALL, r, true).over), r).toEqual([`slx-rframe slx-rframe-${r}`]);
  });

  it('a layer whose art is not published is left out', () => {
    expect(rarityFrame(only(), 'legendary', true)).toEqual({ under: [], over: [] });
    const glowOnly = rarityFrame(only(art.rarityGlow), 'legendary', true);
    expect(classes(glowOnly.under)).toEqual(['slx-rglow']);
    expect(glowOnly.over).toEqual([]);
    expect(classes(rarityFrame(only(art.starlitOverlay), 'unique', true).over)).toEqual(['slx-rstarlit']);
    expect(classes(rarityFrame(only(art.rarityFrame('set')), 'set', true).over)).toEqual(['slx-rframe slx-rframe-set']);
  });
});

/** The compiled stylesheet's top-level rules: each selector list and its declarations, in order. */
const css = compile('src/styles/_starlantern-ui.scss', { silenceDeprecations: ['global-builtin', 'slash-div', 'import'] as never }).css;
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
  sels: sel.split(',').map((s) => s.trim()),
  decls: Object.fromEntries(body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()])),
}));
/** Every declaration for an exact selector, later rules winning (a cascade for one selector, which is all these need). */
const declsFor = (sel: string): Record<string, string> => Object.assign({}, ...rules.filter((r) => r.sels.includes(sel)).map((r) => r.decls));
const urlOf = (v: string | undefined) => v?.match(/^url\(["']?([^"')]+)["']?\)$/)?.[1];

describe('gear art styles (src/styles/_starlantern-ui.scss)', () => {
  it('each rarity layer shows its own published image as a 16 x 16 nine-slice, slice 5, edges repeated', () => {
    for (const r of FRAMED_RARITIES) expect(urlOf(declsFor(`.slx-rframe-${r}`)['border-image-source']), r).toBe(art.rarityFrame(r));
    expect(urlOf(declsFor('.slx-rglow')['border-image-source'])).toBe(art.rarityGlow);
    expect(urlOf(declsFor('.slx-rstarlit')['border-image-source'])).toBe(art.starlitOverlay);
    for (const sel of ['.slx-rglow', '.slx-rframe', '.slx-rstarlit']) {
      const d = declsFor(sel);
      expect(d.position, sel).toBe('absolute');
      expect(d.inset, sel).toBe('0');
      expect(d['pointer-events'], sel).toBe('none');
      expect(d['border-width'] ?? d.border?.split(' ')[0], sel).toBe('5px');
      expect(d['border-image-slice'], sel).toBe('5');
      expect(d['border-image-repeat'], sel).toBe('repeat');
      expect(d['image-rendering'], sel).toBe('pixelated');
      // the detail's large picture takes every layer at twice the size: still a whole multiple of the 5px slice
      expect(declsFor(`.slx-item-art-box > ${sel}`)['border-width'], sel).toBe('10px');
    }
  });

  it('icons show at their own size, never scaled or cropped', () => {
    expect(declsFor('.slx-gear-ico')).toMatchObject({ width: '26px', height: '26px', 'image-rendering': 'pixelated' });
    expect(declsFor('.slx-gear-art')).toMatchObject({ width: '64px', height: '64px', 'image-rendering': 'pixelated' });
    expect(declsFor('.slx-item-art-box')).toMatchObject({ width: '64px', height: '64px' });
    for (const sel of ['.slx-gear-ico', '.slx-gear-art']) expect(declsFor(sel)['object-fit'], sel).toBeUndefined();
  });

  it('paint order: glow under the icon, frame over it, star light over the frame; the cursor cell over every other cell', () => {
    const z = (sel: string) => Number(declsFor(sel)['z-index']);
    expect(z('.slx-rglow')).toBeLessThan(z('.slx-gear-ico'));
    expect(z('.slx-gear-ico')).toBeLessThan(z('.slx-rframe'));
    expect(z('.slx-rframe')).toBeLessThan(z('.slx-rstarlit'));
    expect(z('.slx-rstarlit')).toBeLessThan(z('.slx-enh'));
    expect(z('.slx-gear-art')).toBe(z('.slx-gear-ico'));
    expect(declsFor('.slx-gear-ico').position).toBe('relative');
    // Each cell is a stacking context of its own, so no neighbour's frame can cover the cursor's glow around its cell.
    expect(declsFor('.slx-bag-cell')['z-index']).toBe('0');
    expect(declsFor('.slx-doll-slot')['z-index']).toBe('0');
    expect(z('.slx-cur')).toBeGreaterThan(0);
    expect(css.indexOf('.slx-cur {')).toBeGreaterThan(css.indexOf('.slx-bag-cell, .slx-doll-slot {'));
  });

  it('the colour-mixed border is only for a cell without a frame: the frame is the art', () => {
    const mixed = rules.filter((r) => r.decls['border-color']?.includes('color-mix') && r.sels.some((s) => s.startsWith('.slx-bag-cell')));
    expect(mixed).toHaveLength(1);
    for (const s of mixed[0].sels) expect(s).toMatch(/:not\(:has\(\.slx-rframe\)\)$/);
  });

  it('a gear icon in a list or a line keeps its own 26 x 26, and its row grows to fit it', () => {
    // .slx-list .slx-ico (16px) and .slx-ico (12px) are for item icons; a gear icon there stays at its own size.
    expect(declsFor('.slx-ico.slx-gear-ico')).toMatchObject({ width: '26px', height: '26px' });
    expect(css.indexOf('.slx-ico.slx-gear-ico {')).toBeGreaterThan(css.indexOf('.slx-list .slx-ico {'));
    expect(Number.parseInt(declsFor('.slx-list .slx-opt:has(.slx-gear-ico)')['min-height'], 10)).toBeGreaterThanOrEqual(26);
  });

  it('codex pictures show at their own size: the icon 26 x 26, the silhouette art 28 x 28 with no filter', () => {
    expect(declsFor('.slx-codex-icon')).toMatchObject({ width: '26px', height: '26px', 'image-rendering': 'pixelated' });
    expect(declsFor('.slx-codex-silhouette')).toMatchObject({ width: '28px', height: '28px', 'image-rendering': 'pixelated' });
    expect(declsFor('.slx-codex-silhouette').filter).toBeUndefined();
    expect(declsFor('.slx-skill-ico')).toMatchObject({ 'image-rendering': 'pixelated' });
  });

  it('no layer is drawn by a pseudo-element', () => {
    expect(css).not.toMatch(/\.slx-(rglow|rframe|rstarlit|gear-ico|gear-art|item-art-box)[^{,]*::?(before|after)/);
  });
});
