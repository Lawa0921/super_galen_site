import { describe, expect, it } from 'vitest';
import { art } from '../render/artPaths';
import { NO_ART } from '../render/textures';
import { portraitImg, showMood, standeeImg } from './art';

const some = (...urls: string[]) => ({ has: (u: string) => urls.includes(u) });

describe('ui art', () => {
  it('follows hp: normal, dying at low hp, the drawn down face at 0', () => {
    const idx = some(art.portrait('liz', 'normal'), art.portrait('liz', 'dying'), art.portrait('liz', 'down'));
    expect(portraitImg(idx, 'liz', 50, 50)!.getAttribute('src')).toBe(art.portrait('liz', 'normal'));
    expect(portraitImg(idx, 'liz', 10, 50)!.getAttribute('src')).toBe(art.portrait('liz', 'dying'));
    const down = portraitImg(idx, 'liz', 0, 50)!;
    expect(down.getAttribute('src')).toBe(art.portrait('liz', 'down'));
    expect(down.classList.contains('sl-portrait--down')).toBe(false);
    expect(down.alt).toBe('');
    expect(down.dataset.cid).toBe('liz');
  });

  it('greys the normal face when the down face is missing', () => {
    const down = portraitImg(some(art.portrait('liz', 'normal')), 'liz', 0, 50)!;
    expect(down.getAttribute('src')).toBe(art.portrait('liz', 'normal'));
    expect(down.classList.contains('sl-portrait--down')).toBe(true);
  });

  it('swaps to a momentary face and back', () => {
    const idx = some(art.portrait('liz', 'normal'), art.portrait('liz', 'attack'));
    const img = portraitImg(idx, 'liz', 50, 50)!;
    expect(showMood(idx, img, 'attack')).toBe(true);
    expect(img.getAttribute('src')).toBe(art.portrait('liz', 'attack'));
    expect(showMood(idx, img, 'hit')).toBe(false);
    expect(img.getAttribute('src')).toBe(art.portrait('liz', 'attack'));
  });

  it('falls back to the normal face when only it is published', () => {
    expect(portraitImg(some(art.portrait('liz', 'normal')), 'liz', 1, 50)!.getAttribute('src')).toBe(art.portrait('liz', 'normal'));
  });

  it('returns null when the art is not published', () => {
    expect(portraitImg(NO_ART, 'liz', 50, 50)).toBeNull();
    expect(standeeImg(NO_ART, 'liz')).toBeNull();
    expect(standeeImg(some(art.standee('liz')), 'liz')!.className).toBe('sl-standee');
  });
});
