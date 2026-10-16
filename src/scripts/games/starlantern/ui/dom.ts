import { EQUIPMENT } from '../data/equipment';
import { ITEMS } from '../data/items';
import { MATERIALS } from '../data/materials';

interface ElOpts { id?: string; class?: string; text?: string; attrs?: Record<string, string> }

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, opts: ElOpts = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.id) node.id = opts.id;
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = opts.text;
  for (const [k, v] of Object.entries(opts.attrs ?? {})) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

export function itemName(id: string): string {
  return ITEMS[id]?.name ?? MATERIALS[id]?.name ?? EQUIPMENT[id]?.name ?? id;
}
