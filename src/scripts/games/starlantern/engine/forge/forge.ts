import { DISMANTLE } from '../../data/forge';
import { addItem } from '../town';
import type { GameState } from '../state';
import type { ItemInstance } from '../types';
import type { ForgeResult } from './cost';

/** The essences a set of gear dismantles into: the sum of DISMANTLE by rarity. */
export function dismantleYield(its: ItemInstance[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of its) for (const [id, n] of Object.entries(DISMANTLE[it.rarity] ?? {})) out[id] = (out[id] ?? 0) + n;
  return out;
}

/** Breaks bag items down into essences. Worn gear is not in the bag, so it is refused; enhance levels give nothing back. */
export function dismantle(s: GameState, uids: number[]): ForgeResult<{ essences: Record<string, number> }> {
  if (!Array.isArray(uids) || uids.length === 0 || new Set(uids).size !== uids.length) return { ok: false, reason: 'invalid' };
  const bag = s.bag ?? [];
  if (uids.some((u) => !bag.some((it) => it.uid === u))) return { ok: false, reason: 'stock' };
  const n = structuredClone(s);
  const gone = n.bag.filter((it) => uids.includes(it.uid));
  const essences = dismantleYield(gone);
  n.bag = n.bag.filter((it) => !uids.includes(it.uid));
  for (const [id, q] of Object.entries(essences)) addItem(n.inventory, id, q);
  return { ok: true, state: n, out: { essences } };
}
