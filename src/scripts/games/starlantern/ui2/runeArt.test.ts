import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUNES, tiersOf, type RuneId } from '../data/runes';
import { T } from '../data/text.zh-TW';
import { ART_BASE, RUNE_ICON_IDS, RUNE_ICON_SIZES, allArtUrls, art } from '../render/artPaths';
import { markEl, runeCell, runeIconUrl, runeMark, slotCell, slotMark, slotMarks } from './runeArt';

const ids = Object.keys(RUNES) as RuneId[];

describe('rune icons (art step 9, G4)', () => {
  it('maps every rune and both slot states to its own icon at 14 and 16', () => {
    expect(ids).toHaveLength(32);
    expect(RUNE_ICON_IDS()).toEqual(['slot-empty', 'slot-filled', ...ids]);
    expect(RUNE_ICON_SIZES).toEqual([14, 16]);
    expect(runeIconUrl('flame', 14)).toBe(`${ART_BASE}/icon/rune-flame-14.png`);
    expect(runeIconUrl('twin-cast', 16)).toBe(`${ART_BASE}/icon/rune-twin-cast-16.png`);
    expect(runeIconUrl('slot-empty', 14)).toBe(`${ART_BASE}/icon/rune-slot-empty-14.png`);
    const urls = RUNE_ICON_IDS().flatMap((id) => RUNE_ICON_SIZES.map((s) => art.runeIcon(id, s)));
    expect(new Set(urls).size).toBe(68);
    const all = new Set(allArtUrls());
    for (const u of urls) expect(all.has(u), u).toBe(true);
  });

  it('every referenced icon is published: on disk and in the manifest', () => {
    const manifest = JSON.parse(readFileSync('public/assets/games/starlantern/manifest.json', 'utf8')) as { urls: string[] };
    for (const id of RUNE_ICON_IDS()) {
      for (const s of RUNE_ICON_SIZES) {
        const u = art.runeIcon(id, s);
        expect(existsSync(`public${u}`), u).toBe(true);
        expect(manifest.urls, u).toContain(u);
      }
    }
  });

  it('a working rune is its own icon named with its tier; one doing nothing is the same icon greyed', () => {
    const on = runeMark({ id: 'spread', tier: 'magic' }, 14);
    expect(on).toEqual({ mark: 'on:spread', src: art.runeIcon('spread', 14), alt: T.rune.label('spread', 'magic') });
    const off = runeMark({ id: 'spread', tier: 'magic' }, 14, true);
    expect(off.src).toBe(on.src);
    expect(off.off).toBe(true);
    expect(off.alt).toBe(T.rune.mark.off(T.rune.label('spread', 'magic')));
    const img = markEl(off, 14);
    expect(img.tagName).toBe('IMG');
    expect(img.className).toBe('slx-rune-ico slx-rune-ico-14 slx-rune-off');
    expect(img.getAttribute('alt')).toBe(off.alt);
    expect(img.getAttribute('width')).toBe('14');
    expect(markEl(on, 14).classList.contains('slx-rune-off')).toBe(false);
  });

  it('slots read in order: a rune, a rune doing nothing, an empty slot; each with words', () => {
    const marks = slotMarks([{ state: 'on', ref: { id: 'flame', tier: 'rare' } }, { state: 'off', ref: { id: 'heavy', tier: 'common' } }, { state: 'empty' }]);
    expect(marks.map((m) => m.mark)).toEqual(['on:flame', 'off:heavy', 'empty']);
    expect(marks[2]).toEqual({ mark: 'empty', src: art.runeIcon('slot-empty', 14), alt: T.rune.mark.empty });
    expect(slotMark('filled', 16)).toEqual({ mark: 'filled', src: art.runeIcon('slot-filled', 16), alt: T.rune.mark.filled });
    for (const m of marks) expect(m.alt.length).toBeGreaterThan(0);
  });

  it('a rune cell is the 16px icon in its tier frame; common has none, as gear', () => {
    for (const id of ids) {
      for (const tier of tiersOf(id)) {
        const cell = runeCell({ id, tier });
        expect(cell.className).toBe('slx-rune-cell');
        const img = cell.querySelector('img')!;
        expect(img.getAttribute('src')).toBe(art.runeIcon(id, 16));
        expect(img.getAttribute('alt')).toBe(T.rune.label(id, tier));
        const frame = cell.querySelector('.slx-rframe');
        if (tier === 'common') expect(frame).toBeNull();
        else expect(frame!.className).toBe(`slx-rframe slx-rframe-${tier}`);
      }
    }
    expect(slotCell('empty').querySelector('img')!.getAttribute('src')).toBe(art.runeIcon('slot-empty', 16));
    expect(slotCell('empty').querySelector('.slx-rframe')).toBeNull();
  });

  it('no rune glyph is left where the survey found one (the enemy intent ◆ is not a rune and stays)', () => {
    const src = (f: string) => readFileSync(`src/scripts/games/starlantern/${f}`, 'utf8');
    // skillCard slotDots, the status page's slots, the workshop's skill list, the battle menu's badge, the build card.
    for (const f of ['ui2/skillCard.ts', 'ui2/scenes/statusTabs.ts', 'ui2/scenes/workshop.ts', 'ui2/scenes/battle.ts', 'ui2/scenes/builds.ts', 'ui2/widgets.ts', 'ui2/menu.ts']) {
      expect(src(f), f).not.toMatch(/[◆◇○]/);
    }
    const text = src('data/text.zh-TW.ts');
    expect(text.match(/[◆◇○]/g)).toEqual(['◆']);
    expect(text).toContain('intentNote: (label: string) => `◆ ${label}`');
  });
});
