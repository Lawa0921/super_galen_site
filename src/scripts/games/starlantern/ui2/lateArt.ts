import type { ArtIndex } from '../render/textures';

/**
 * Art that lands after a screen was drawn. The game's pictures stream in behind the title (ui2/main.ts), and a screen
 * draws a picture only once it has loaded (no placeholder art), so a list drawn before its icons arrive would stay bare.
 * A screen that left a picture out marks the element it drew (`awaitArt`, with how to draw it again); when the picture
 * lands, the router draws again each marked element on the screen that waited for it (`drawLanded`), once a frame.
 */

/** A picture a screen wants that may not have loaded yet: drawn once `ready()`. */
export interface LateArt { readonly src: string; ready(): boolean }
/** A picture to draw: a url already known to be here, or a `LateArt` that may still be on its way. */
export type ArtRef = string | LateArt;

/** `src` as a late picture of `idx`: ready once the bank has it. */
export const lateArt = (idx: ArtIndex, src: string): LateArt => ({ src, ready: () => idx.has(src) });

/** The url to draw now, if any: a plain url as it is, a late picture once it has landed. */
export function artSrc(a: ArtRef | undefined): string | undefined {
  if (a === undefined || typeof a === 'string') return a;
  return a.ready() ? a.src : undefined;
}

/** The url a late picture still waits for, if it does (for `awaitArt`). */
export function artMissing(a: ArtRef | undefined): string | undefined {
  return a !== undefined && typeof a !== 'string' && !a.ready() ? a.src : undefined;
}

const WAIT = 'data-art-wait';
const waits = new WeakMap<Element, Map<string, { urls: Set<string>; redraw(): void }>>();

/**
 * `el` was drawn without `urls` (pictures not loaded yet): when one of them lands, `redraw` draws it again. One wait per
 * `key` (a later call replaces it, so a redraw that is still short of art just waits again); no urls clears it.
 */
export function awaitArt(el: Element, key: string, urls: Iterable<string>, redraw: () => void): void {
  const want = new Set(urls);
  let mine = waits.get(el);
  if (!want.size) {
    mine?.delete(key);
    if (!mine?.size) el.removeAttribute(WAIT);
    return;
  }
  if (!mine) waits.set(el, (mine = new Map()));
  mine.set(key, { urls: want, redraw });
  el.setAttribute(WAIT, '');
}

/**
 * Draws again each element under `root` that waits for one of the pictures in `landed`, each wait once. An element no longer
 * under `root` (taken off by an earlier redraw, or a closed window) is left alone. Costs one query when nothing waits.
 */
export function drawLanded(root: ParentNode & Node, landed: ReadonlySet<string>): void {
  if (!landed.size) return;
  for (const el of [...root.querySelectorAll(`[${WAIT}]`)]) {
    if (!root.contains(el)) continue;
    const mine = waits.get(el);
    if (!mine) { el.removeAttribute(WAIT); continue; }
    for (const [key, w] of [...mine]) {
      if (![...w.urls].some((u) => landed.has(u))) continue;
      if (mine.get(key) !== w || !root.contains(el)) continue;
      mine.delete(key);
      if (!mine.size) el.removeAttribute(WAIT);
      w.redraw();
    }
  }
}

/**
 * `idx` that also notes into `missing` each picture asked for that is not here yet: what a drawing made with it waits for.
 * A screen that draws again on `artArrived` keeps this set and draws again only when one of its pictures lands, never on
 * the arrival of art it does not show.
 */
export function noteMissing(idx: ArtIndex, missing: Set<string>): ArtIndex {
  return {
    has: (u) => {
      if (idx.has(u)) return true;
      missing.add(u);
      return false;
    },
    ...(idx.whenReady ? { whenReady: idx.whenReady.bind(idx) } : {}),
    ...(idx.onLoad ? { onLoad: idx.onLoad.bind(idx) } : {}),
  };
}

/** Whether one of `landed` is a picture `wanted` waits for. */
export function anyLanded(landed: ReadonlySet<string>, wanted: ReadonlySet<string>): boolean {
  for (const u of wanted) if (landed.has(u)) return true;
  return false;
}

/** The first of `urls` (best first) that has landed, and the better ones still to come (all of them while none has). */
export function bestLanded(idx: ArtIndex, urls: readonly string[]): { src: string | undefined; better: string[] } {
  const i = urls.findIndex((u) => idx.has(u));
  return i < 0 ? { src: undefined, better: [...urls] } : { src: urls[i], better: urls.slice(0, i) };
}

/**
 * One picture of `parent` from `urls` (best first): the best one that has landed, built by `make` and put in by `place`;
 * none while none has. When a better one lands the picture is put in, or its src moved up to it. Returns the picture
 * drawn now, if any (`current` is the one already drawn).
 */
export function bestPicture(parent: HTMLElement, key: string, idx: ArtIndex, urls: readonly string[], make: (src: string) => HTMLElement,
  place: (node: HTMLElement) => void, current: HTMLElement | null = null): HTMLElement | null {
  const { src, better } = bestLanded(idx, urls);
  let node = current;
  if (src && !node) place((node = make(src)));
  else if (src && node && node.getAttribute('src') !== src) node.setAttribute('src', src);
  awaitArt(parent, key, better, () => { bestPicture(parent, key, idx, urls, make, place, node); });
  return node;
}
