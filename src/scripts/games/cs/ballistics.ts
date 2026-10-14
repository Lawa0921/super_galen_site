import { MAP } from './map';

export type WorldSurface = 'stone' | 'wood' | 'metal' | 'ground' | 'none';
import { rayBoxHit, type RayHit } from './ray-hit';
import { elevationRayHit } from './elevation';
import { perimeterImpact } from './perimeter';
export { rayBoxHit, type RayHit } from './ray-hit';
export function worldImpact(o: number[], d: number[]): RayHit & { surface: WorldSurface } {
  let best: RayHit & { surface: WorldSurface } = { distance: 150, nx: 0, ny: 0, nz: 0, surface: 'none' };
  for (const b of MAP.obstacles) {
    const hit = rayBoxHit(o, d, [b.minX, 0, b.minZ], [b.maxX, b.height, b.maxZ]);
    if (hit && hit.distance < best.distance) best = { ...hit, surface: b.surface as WorldSurface };
  }
  const terrain = elevationRayHit(o, d);
  if (terrain && terrain.distance < best.distance) best = { ...terrain, surface: 'stone' };
  const exterior = perimeterImpact(o, d);
  if (exterior && exterior.distance < best.distance) best = { ...exterior, surface: 'stone' };
  if (d[1] < 0) {
    const distance = -o[1] / d[1];
    if (distance >= 0 && distance < best.distance) best = { distance, nx: 0, ny: 1, nz: 0, surface: 'ground' };
  }
  return best;
}
