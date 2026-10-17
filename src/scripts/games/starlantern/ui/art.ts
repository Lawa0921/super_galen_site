import { art, moodFor, type Mood } from '../render/artPaths';
import type { Member } from '../engine/types';
import type { ArtIndex } from '../render/textures';
import { el } from './dom';

function img(src: string, cls: string): HTMLImageElement {
  const i = el('img', { class: cls, attrs: { src, alt: '', draggable: 'false' } });
  i.decoding = 'async';
  return i;
}

/** The face for the member's HP; a missing face falls back to normal, and a missing down face greys the normal one. */
export function portraitImg(index: ArtIndex, cid: string, hp: number, max: number): HTMLImageElement | null {
  const normal = art.portrait(cid, 'normal');
  if (!index.has(normal)) return null;
  const mood = moodFor(hp, max);
  const wanted = art.portrait(cid, mood);
  const drawn = index.has(wanted);
  const i = img(drawn ? wanted : normal, mood === 'down' && !drawn ? 'sl-portrait sl-portrait--down' : 'sl-portrait');
  i.dataset.cid = cid;
  return i;
}

/** Switch a portrait to a momentary face (attack, hit, ultimate) when that face is published. */
export function showMood(index: ArtIndex, portrait: HTMLImageElement, mood: Mood): boolean {
  const cid = portrait.dataset.cid;
  if (!cid) return false;
  const src = art.portrait(cid, mood);
  if (!index.has(src)) return false;
  portrait.setAttribute('src', src);
  return true;
}

export function standeeImg(index: ArtIndex, cid: string): HTMLImageElement | null {
  const src = art.standee(cid);
  return index.has(src) ? img(src, 'sl-standee') : null;
}

/** The art id of a party member: Rin wears her oath look once she has sworn it. */
export const artIdOf = (m: Pick<Member, 'id' | 'oath'>): string => (m.id === 'rin' && m.oath ? 'rin-oath' : m.id);
