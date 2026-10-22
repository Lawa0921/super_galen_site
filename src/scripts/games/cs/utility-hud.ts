import { WEAPONS, holdsGrenade, type Actor, type WeaponId } from './engine';
import { GRENADES } from './grenades';

/** Weapon panel text for the viewed actor: magazine for the gun, count for a grenade. */
export function heldDisplay(p: Pick<Actor, 'weapon' | 'ammo' | 'reserve' | 'held' | 'grenades'>) {
  if (holdsGrenade(p) && p.held !== 'gun') return { name: GRENADES[p.held].name, ammo: String(p.grenades[p.held]), reserve: '—' };
  return { name: WEAPONS[p.weapon].name, ammo: String(p.ammo), reserve: String(p.reserve) };
}
export function deathCause(death: { weapon: WeaponId; grenade?: 'he' }) {
  return death.grenade ? GRENADES[death.grenade].name : WEAPONS[death.weapon].name;
}
