import { CONDITIONS, type ConditionId } from '../data/conditions';
import { REGIONS, type RegionId } from '../data/regions';
import type { Portal } from './dungeon/run';
import { pick, type Rng } from './rng';

/**
 * Three gates for one stay in town: the mainline first, then two different random regions, each with its own condition.
 * A region in `favoured` (someone there is still unmet) weighs 2, the others 1; with equal weights the draw is the plain one.
 * `lead` is the region of the guild's lead (engine/story/leads.ts): it is always offered, by `withLead` after every draw.
 */
export function rollPortals(rng: Rng, favoured: RegionId[] = [], lead?: RegionId): Portal[] {
  const conditions = Object.keys(CONDITIONS) as ConditionId[];
  const others = (Object.keys(REGIONS) as RegionId[]).filter((r) => r !== 'mainline');
  const regions: RegionId[] = ['mainline'];
  const weight = (r: RegionId) => (favoured.includes(r) ? 2 : 1);
  while (regions.length < 3) {   // draw without replacement: never loops, even on a constant rng
    if (others.every((r) => weight(r) === weight(others[0]))) { regions.push(others.splice(Math.floor(rng() * others.length), 1)[0]); continue; }
    let r = rng() * others.reduce((s, o) => s + weight(o), 0);
    let i = 0;
    for (; i < others.length - 1; i++) { r -= weight(others[i]); if (r < 0) break; }
    regions.push(others.splice(i, 1)[0]);
  }
  return withLead(regions.map((region) => ({ region, condition: pick(rng, conditions) })), lead, favoured);
}

/**
 * The lead's region among the portals, with no draw at all (6c Task 16; lore ledger I-125): a set that already offers it,
 * a main-road lead (the main road is always first) or no lead leaves the set as it is. Otherwise one regional slot takes the
 * lead's region and keeps its rolled condition: the last one, unless only the last one holds another region with someone
 * still unmet (`favoured`), in which case the first regional slot gives way. Pure, so the rng stream is never touched.
 */
export function withLead(portals: Portal[], lead: RegionId | undefined, favoured: RegionId[] = []): Portal[] {
  if (!lead || lead === 'mainline' || portals.some((p) => p.region === lead)) return portals;
  const slot = favoured.includes(portals[2].region) && !favoured.includes(portals[1].region) ? 1 : 2;
  return portals.map((p, i) => (i === slot ? { ...p, region: lead } : p));
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
