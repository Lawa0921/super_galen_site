import { describe, expect, it, vi } from 'vitest';
import { artSrc, awaitArt, bestLanded, bestPicture, drawLanded, lateArt } from './lateArt';

const index = (urls: string[]) => { const set = new Set(urls); return { set, idx: { has: (u: string) => set.has(u) } }; };

describe('late art', () => {
  it('a late picture gives its url only once it has landed; a plain url is drawn as it is', () => {
    const { set, idx } = index([]);
    const a = lateArt(idx, '/a.png');
    expect(artSrc(a)).toBeUndefined();
    set.add('/a.png');
    expect(artSrc(a)).toBe('/a.png');
    expect(artSrc('/b.png')).toBe('/b.png');
    expect(artSrc(undefined)).toBeUndefined();
  });

  it('an element drawn without a picture is drawn again when that picture lands, once, and no other arrival touches it', () => {
    const root = document.createElement('div');
    const box = root.appendChild(document.createElement('p'));
    const redraw = vi.fn();
    awaitArt(box, 'icon', ['/a.png'], redraw);
    drawLanded(root, new Set(['/other.png']));
    expect(redraw).not.toHaveBeenCalled();
    drawLanded(root, new Set(['/a.png', '/other.png']));
    expect(redraw).toHaveBeenCalledTimes(1);
    // It was drawn: it waits for nothing more until it says so again.
    drawLanded(root, new Set(['/a.png']));
    expect(redraw).toHaveBeenCalledTimes(1);
  });

  it('a redraw replaces what the element waited for under the same key; separate keys wait apart', () => {
    const root = document.createElement('div');
    const box = root.appendChild(document.createElement('p'));
    const first = vi.fn();
    const second = vi.fn();
    const other = vi.fn();
    awaitArt(box, 'rows', ['/a.png'], first);
    awaitArt(box, 'rows', ['/b.png'], second);
    awaitArt(box, 'face', ['/a.png'], other);
    drawLanded(root, new Set(['/a.png', '/b.png']));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
    // Waiting for nothing clears the wait.
    const gone = vi.fn();
    awaitArt(box, 'rows', ['/c.png'], gone);
    awaitArt(box, 'rows', [], gone);
    drawLanded(root, new Set(['/c.png']));
    expect(gone).not.toHaveBeenCalled();
  });

  it('only elements on the screen are drawn: one taken off it (a closed window) is left alone', () => {
    const root = document.createElement('div');
    const box = root.appendChild(document.createElement('p'));
    const inner = box.appendChild(document.createElement('span'));
    const outer = vi.fn(() => { box.replaceChildren(); });
    const nested = vi.fn();
    awaitArt(box, 'k', ['/a.png'], outer);
    awaitArt(inner, 'k', ['/a.png'], nested);
    const elsewhere = document.createElement('p');
    const lost = vi.fn();
    awaitArt(elsewhere, 'k', ['/a.png'], lost);
    drawLanded(root, new Set(['/a.png']));
    expect(outer).toHaveBeenCalledTimes(1);
    expect(nested).not.toHaveBeenCalled();   // its parent's redraw took it off the screen first
    expect(lost).not.toHaveBeenCalled();
  });
});

describe('the best picture that has landed', () => {
  it('none until one lands, then the best landed one, moved up when a better one lands', () => {
    const { set, idx } = index([]);
    const root = document.createElement('div');
    const parent = root.appendChild(document.createElement('div'));
    parent.append(document.createElement('p'));
    const make = (src: string) => { const i = document.createElement('img'); i.setAttribute('src', src); return i; };
    const pic = bestPicture(parent, 'bg', idx, ['/best.png', '/ok.png'], make, (n) => parent.prepend(n));
    expect(pic).toBeNull();
    expect(parent.querySelector('img')).toBeNull();
    set.add('/ok.png');
    drawLanded(root, new Set(['/ok.png']));
    expect(parent.firstElementChild!.getAttribute('src')).toBe('/ok.png');
    set.add('/best.png');
    drawLanded(root, new Set(['/best.png']));
    expect(parent.querySelectorAll('img')).toHaveLength(1);
    expect(parent.firstElementChild!.getAttribute('src')).toBe('/best.png');
    expect(bestLanded(idx, ['/best.png', '/ok.png'])).toEqual({ src: '/best.png', better: [] });
  });
});
