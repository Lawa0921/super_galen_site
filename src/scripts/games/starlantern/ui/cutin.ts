import { el } from './dom';

/** Length of the ultimate cut-in; the CSS animations in _starlantern-ui.scss are timed to match. */
export const CUTIN_MS = 1200;

/** Darken the screen, slide in a diagonal band with the ultimate portrait and name, flash, then clear. */
export function playCutIn(root: HTMLElement, o: { name: string; portrait: string | null; fast: boolean }): Promise<void> {
  if (o.fast) return Promise.resolve();
  const band = el('div', { class: 'sl-cutin__band' }, [
    ...(o.portrait ? [el('img', { class: 'sl-cutin__face', attrs: { src: o.portrait, alt: '' } })] : []),
    el('span', { class: 'sl-cutin__name', text: o.name }),
  ]);
  root.replaceChildren(el('div', { class: 'sl-cutin__lines' }), band, el('div', { class: 'sl-cutin__flash' }));
  root.hidden = false;
  root.classList.add('sl-cutin--on');
  return new Promise((resolve) => setTimeout(() => {
    root.classList.remove('sl-cutin--on');
    root.replaceChildren();
    root.hidden = true;
    resolve();
  }, CUTIN_MS));
}
