import data from './map-data.json';
import { rayBoxHit, type RayHit } from './ray-hit';
export const PLAYER_RADIUS = .36;
export const STEP_HEIGHT = .241;

// These are the exact stone treads authored in the environment, not a single
// full-height box over a staircase. Shared by floor support and shot/AI rays.
export const elevationBoxes = data.elevations.flatMap(area => {
  const count = area.steps || 1, depth = (area.maxZ - area.minZ) / count;
  return Array.from({ length: count }, (_, index) => ({
    minX: area.minX, maxX: area.maxX,
    minZ: area.minZ + index * depth, maxZ: area.minZ + (index + 1) * depth,
    height: area.steps ? (area.startHeight < area.endHeight ? index + 1 : count - index) * Math.max(area.startHeight, area.endHeight) / count : area.startHeight,
  }));
});
export function groundHeight(x: number, z: number) {
  let height = 0;
  for (const box of elevationBoxes) if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) height = Math.max(height, box.height);
  return height;
}
export function clearElevation(x: number, z: number, feet: number) {
  return !elevationBoxes.some(box => box.height > feet + STEP_HEIGHT
    && x > box.minX - PLAYER_RADIUS && x < box.maxX + PLAYER_RADIUS
    && z > box.minZ - PLAYER_RADIUS && z < box.maxZ + PLAYER_RADIUS);
}
// A cylinder remains supported while its footprint overlaps a ledge. This
// prevents falling into a side wall between center-point support and its radius.
export function supportHeight(x: number, z: number, feet: number) {
  let height = groundHeight(x, z);
  for (const box of elevationBoxes) if (box.height <= feet + STEP_HEIGHT
    && x > box.minX - PLAYER_RADIUS && x < box.maxX + PLAYER_RADIUS
    && z > box.minZ - PLAYER_RADIUS && z < box.maxZ + PLAYER_RADIUS) height = Math.max(height, box.height);
  return height;
}
export function elevationRayHit(origin: number[], direction: number[]): RayHit | null {
  let best: RayHit | null = null;
  for (const box of elevationBoxes) {
    const hit = rayBoxHit(origin, direction, [box.minX,0,box.minZ], [box.maxX,box.height,box.maxZ]);
    if (hit && (!best || hit.distance < best.distance)) best = hit;
  }
  return best;
}
