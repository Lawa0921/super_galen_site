import type { Cost } from '../../data/forge';
import { mix } from '../loot/drops';
import { mulberry32, type Rng } from '../rng';
import type { GameState } from '../state';
import type { CharacterId, ItemInstance, Slot } from '../types';

/** Why a forge action was refused. `phase` is only ever returned by `Game`, never by the engine; `affixLocked` is not `T.reasons.locked`, which means "not unlocked yet" in the shop. */
export type ForgeFail = 'invalid' | 'stock' | 'gold' | 'mats' | 'max' | 'full' | 'affixLocked' | 'none' | 'phase';
export type ForgeResult<O> = { ok: true; state: GameState; out: O } | { ok: false; reason: ForgeFail };

/** What is missing for `c`, gold first; null when the state can pay. */
export function canPay(s: GameState, c: Cost): 'gold' | 'mats' | null {
  if (s.gold < c.gold) return 'gold';
  for (const [id, n] of Object.entries(c.mats)) if ((s.inventory[id] ?? 0) < n) return 'mats';
  return null;
}

/** Takes gold and materials (mutates `s`; call it on a copy after `canPay`). Never touches `sold`. */
export function pay(s: GameState, c: Cost): void {
  s.gold -= c.gold;
  for (const [id, n] of Object.entries(c.mats)) {
    const left = (s.inventory[id] ?? 0) - n;
    if (left > 0) s.inventory[id] = left;
    else delete s.inventory[id];
  }
}

export function addCost(a: Cost, b: Cost): Cost {
  const mats = { ...a.mats };
  for (const [id, n] of Object.entries(b.mats)) mats[id] = (mats[id] ?? 0) + n;
  return { gold: a.gold + b.gold, mats };
}

/** The item with `uid`: the bag first, then what recruited members wear. */
export function findItem(s: GameState, uid: number): { it: ItemInstance; member?: CharacterId; slot?: Slot } | null {
  const inBag = (s.bag ?? []).find((it) => it.uid === uid);
  if (inBag) return { it: inBag };
  for (const member of s.party?.recruited ?? []) {
    const equip = s.party.roster?.[member]?.equip ?? {};
    for (const slot of Object.keys(equip) as Slot[]) {
      const it = equip[slot];
      if (it && it.uid === uid) return { it, member, slot };
    }
  }
  return null;
}

export const FORGE_SALT = 0x2f6b1d3a;

/** A rng for the forge's random picks. Each call draws once and moves `s.forgeDraws` on (mutates `s`; build it on a copy); creating it draws nothing. */
export function forgeRng(s: GameState): Rng {
  return () => mulberry32(mix(s.forgeDraws++ ^ FORGE_SALT, s.nextUid))();
}
