import { art, moodFor } from '../render/artPaths';
import type { ArtIndex } from '../render/textures';
import { el } from './dom';

function img(src: string, cls: string): HTMLImageElement {
  const i = el('img', { class: cls, attrs: { src, alt: '', draggable: 'false' } });
  i.decoding = 'async';
  return i;
}

export function portraitImg(index: ArtIndex, cid: string, hp: number, max: number): HTMLImageElement | null {
  const normal = art.portrait(cid, 'normal');
  if (!index.has(normal)) return null;
  const hurt = art.portrait(cid, 'hurt');
  const src = moodFor(hp, max) === 'hurt' && index.has(hurt) ? hurt : normal;
  return img(src, hp > 0 ? 'sl-portrait' : 'sl-portrait sl-portrait--down');
}

export function standeeImg(index: ArtIndex, cid: string): HTMLImageElement | null {
  const src = art.standee(cid);
  return index.has(src) ? img(src, 'sl-standee') : null;
}

export function iconImg(index: ArtIndex, id: string): HTMLImageElement | null {
  const src = art.icon(id);
  return index.has(src) ? img(src, 'sl-icon') : null;
}
