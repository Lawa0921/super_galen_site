import type { SoundManager } from '../audio/SoundManager';
import { EQUIPMENT } from '../data/equipment';
import { ITEMS } from '../data/items';
import { MATERIALS } from '../data/materials';
import type { Dir } from '../engine/map';
import type { ArtIndex } from '../render/textures';

export interface UiHooks { refresh(): void; say(msg: string): void; sfx: SoundManager; move(dir: Dir): void; art: ArtIndex }

interface ElOpts { id?: string; class?: string; text?: string; attrs?: Record<string, string> }

export const present = <T>(xs: (T | null)[]): T[] => xs.filter((x): x is T => x !== null);

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, opts: ElOpts = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.id) node.id = opts.id;
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = opts.text;
  for (const [k, v] of Object.entries(opts.attrs ?? {})) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

export function button(label: string, onClick: () => void, opts: { id?: string; class?: string; disabled?: boolean } = {}): HTMLButtonElement {
  const b = el('button', { id: opts.id, class: opts.class ?? 'sl-btn', text: label, attrs: { type: 'button' } });
  b.disabled = !!opts.disabled;
  b.addEventListener('click', onClick);
  return b;
}

export function meter(value: number, max: number, cls: string): HTMLMeterElement {
  const m = el('meter', { class: cls });
  m.min = 0;
  m.max = Math.max(1, max);
  m.value = value;
  return m;
}

export function itemName(id: string): string {
  return ITEMS[id]?.name ?? MATERIALS[id]?.name ?? EQUIPMENT[id]?.name ?? id;
}
