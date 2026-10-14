import data from './city-surfaces.json';
import { rayBoxHit, type RayHit } from './ray-hit';

// Authored exterior collision surfaces are separate from movement/navigation.
// Open ironwork, shutters and thin trim remain decorative; solid plinths and
// building shells share measured dimensions with the Blender source recipe.
export function perimeterImpact(o: number[], d: number[]): RayHit | null {
  let best: RayHit | null = null;
  for (const surface of data.surfaces) {
    const hit = rayBoxHit(o, d, surface.min, surface.max);
    if (hit && hit.distance < 150 && (!best || hit.distance < best.distance)) best = hit;
  }
  return best;
}
