import type { CharacterId } from '../engine/types';
import type { RegionId } from './regions';

/** Where and how deep each companion is met (spec 6). */
export const MEETINGS: { id: CharacterId; region: RegionId; depth: number }[] = [
  { id: 'selene', region: 'mainline', depth: 2 },
  { id: 'chizuru', region: 'frost', depth: 3 },
  { id: 'safira', region: 'blaze', depth: 3 },
  { id: 'sylvie', region: 'mire', depth: 4 },
  { id: 'noel', region: 'storm', depth: 4 },
  { id: 'bobby', region: 'mainline', depth: 6 },
  { id: 'liz', region: 'shade', depth: 6 },
  { id: 'scarlet', region: 'iron', depth: 8 },
];

/** Who can be rescued in `region` and at which depth, leaving out anyone already met. */
export function rescuesFor(region: RegionId, met: CharacterId[]): Record<number, CharacterId> {
  const out: Record<number, CharacterId> = {};
  for (const m of MEETINGS) if (m.region === region && !met.includes(m.id)) out[m.depth] = m.id;
  return out;
}

/** Regions with someone not yet met, apart from the mainline. */
export function favouredRegions(met: CharacterId[]): RegionId[] {
  const out: RegionId[] = [];
  for (const m of MEETINGS) if (m.region !== 'mainline' && !met.includes(m.id) && !out.includes(m.region)) out.push(m.region);
  return out;
}
