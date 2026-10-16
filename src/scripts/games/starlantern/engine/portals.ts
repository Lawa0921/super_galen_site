import { CONDITIONS, type ConditionId } from '../data/conditions';
import { REGIONS, type RegionId } from '../data/regions';
import type { Portal } from './dungeon/run';
import { pick, type Rng } from './rng';

/** Three gates for one stay in town: the mainline first, then two different random regions, each with its own condition. */
export function rollPortals(rng: Rng): Portal[] {
  const conditions = Object.keys(CONDITIONS) as ConditionId[];
  const others = (Object.keys(REGIONS) as RegionId[]).filter((r) => r !== 'mainline');
  const regions: RegionId[] = ['mainline'];
  while (regions.length < 3) regions.push(others.splice(Math.floor(rng() * others.length), 1)[0]);   // draw without replacement: never loops, even on a constant rng
  return regions.map((region) => ({ region, condition: pick(rng, conditions) }));
}

/** True for exactly the shape rollPortals makes: known ids, mainline first, two other distinct regions. */
export function validPortals(v: unknown): v is Portal[] {
  if (!Array.isArray(v) || v.length !== 3) return false;
  for (const p of v) {
    if (typeof p !== 'object' || p === null) return false;
    if (!Object.hasOwn(REGIONS, p.region) || !Object.hasOwn(CONDITIONS, p.condition)) return false;
  }
  return v[0].region === 'mainline' && v[1].region !== 'mainline' && v[2].region !== 'mainline' && v[1].region !== v[2].region;
}
