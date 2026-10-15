import { describe, expect, it } from 'vitest';
import { art } from '../render/artPaths';
import { NO_ART } from '../render/textures';
import { iconImg, portraitImg, standeeImg } from './art';

const some = (...urls: string[]) => ({ has: (u: string) => urls.includes(u) });

describe('ui art', () => {
  it('shows the normal face, the hurt face at low hp, and a grey face when down', () => {
    const idx = some(art.portrait('liz', 'normal'), art.portrait('liz', 'hurt'));
    expect(portraitImg(idx, 'liz', 50, 50)!.getAttribute('src')).toBe(art.portrait('liz', 'normal'));
    expect(portraitImg(idx, 'liz', 10, 50)!.getAttribute('src')).toBe(art.portrait('liz', 'hurt'));
    const down = portraitImg(idx, 'liz', 0, 50)!;
    expect(down.getAttribute('src')).toBe(art.portrait('liz', 'normal'));
    expect(down.classList.contains('sl-portrait--down')).toBe(true);
    expect(down.alt).toBe('');
  });

  it('falls back to the normal face when only it is published', () => {
    expect(portraitImg(some(art.portrait('liz', 'normal')), 'liz', 1, 50)!.getAttribute('src')).toBe(art.portrait('liz', 'normal'));
  });

  it('returns null when the art is not published', () => {
    expect(portraitImg(NO_ART, 'liz', 50, 50)).toBeNull();
    expect(standeeImg(NO_ART, 'liz')).toBeNull();
    expect(iconImg(NO_ART, 'potion')).toBeNull();
    expect(iconImg(some(art.icon('potion')), 'potion')!.className).toBe('sl-icon');
    expect(standeeImg(some(art.standee('liz')), 'liz')!.className).toBe('sl-standee');
  });
});
