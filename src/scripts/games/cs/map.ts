import data from './map-data.json';
import { groundHeight, elevationRayHit, clearElevation, PLAYER_RADIUS, STEP_HEIGHT } from './elevation';
import { perimeterImpact } from './perimeter';
import { crouchDrop } from './movement';
import { smokeBlocks, type Smoke } from './grenades';
export const MAP = data;
export const RADIUS = PLAYER_RADIUS;
export type Point = { x: number; z: number; y?: number; crouch?: number };
export function canStand(x: number, z: number, feet = groundHeight(x, z)) {
  return Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) < MAP.bounds.x - RADIUS && Math.abs(z) < MAP.bounds.z - RADIUS
    && !MAP.obstacles.some(b => x > b.minX - RADIUS && x < b.maxX + RADIUS && z > b.minZ - RADIUS && z < b.maxZ + RADIUS)
    && clearElevation(x, z, feet);
}
export function rayBox(o: number[], d: number[], min: number[], max: number[]) {
  let near = 0, far = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) { if (o[i] < min[i] || o[i] > max[i]) return Infinity; }
    else {
      let a = (min[i] - o[i]) / d[i], b = (max[i] - o[i]) / d[i];
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a); far = Math.min(far, b);
      if (near > far) return Infinity;
    }
  }
  return far >= 0 ? near : Infinity;
}
export function wallDistance(o: number[], d: number[]) {
  let distance = 150;
  for (const b of MAP.obstacles) distance = Math.min(distance, rayBox(o, d, [b.minX, 0, b.minZ], [b.maxX, b.height, b.maxZ]));
  const terrain = elevationRayHit(o, d);
  if (terrain) distance = Math.min(distance, terrain.distance);
  const exterior = perimeterImpact(o, d);
  if (exterior) distance = Math.min(distance, exterior.distance);
  if (d[1] < 0) distance = Math.min(distance, -o[1] / d[1]);
  return distance;
}
/** Eye-to-eye sight line. Active smokes block it like a wall (bullets still pass, as in CS). */
export function visible(a: Point, b: Point, smokes?: readonly Smoke[]) {
  // Both ends lower with the actor's crouch, so low cover hides a ducked actor.
  const height = (a.y ?? groundHeight(a.x, a.z)) + 1.45 - crouchDrop(a);
  const dx = b.x - a.x, dy = (b.y ?? groundHeight(b.x, b.z)) + 1.45 - crouchDrop(b) - height, dz = b.z - a.z, distance = Math.hypot(dx, dy, dz);
  if (distance < .01) return true;
  const o = [a.x, height, a.z], d = [dx / distance, dy / distance, dz / distance];
  return wallDistance(o, d) >= distance && !smokeBlocks(o, d, distance, smokes);
}
export function clearRoute(a: Point, b: Point) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .3);
  let height = groundHeight(a.x, a.z);
  for (let i = 1; i <= n; i++) {
    const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n, nextHeight = groundHeight(x, z);
    if (!canStand(x, z) || Math.abs(nextHeight - height) > STEP_HEIGHT) return false;
    height = nextHeight;
  }
  return true;
}
const width = 24, depth = 28;
const gridPoints: readonly Point[] = Array.from({ length: width * depth }, (_, id) => ({ x: id % width * 2 - 23, z: Math.floor(id / width) * 2 - 27 }));
const MAX_PROJECTED_TARGETS = 128;
function buildNavigation() {
  const walkable = gridPoints.map(p => canStand(p.x, p.z));
  const edges = gridPoints.map((a, id) => {
    if (!walkable[id]) return [];
    return [id - 1, id + 1, id - width, id + width].filter(next => {
      if (next < 0 || next >= gridPoints.length || !walkable[next]) return false;
      const b = gridPoints[next];
      return Math.hypot(a.x - b.x, a.z - b.z) <= 2.1 && clearRoute(a, b);
    });
  });
  return {
    bounds: { ...MAP.bounds },
    obstacles: MAP.obstacles.map(b => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ })),
    walkable, edges, targets: new Map<string, Point>(),
  };
}
// Build the static lattice when the module loads, not on the first live bot tick.
// Dynamic endpoint checks stay live; only unchanged collision geometry is reused.
let navigation = buildNavigation();
function navigationForMap() {
  let unchanged = navigation.bounds.x === MAP.bounds.x && navigation.bounds.z === MAP.bounds.z
    && navigation.obstacles.length === MAP.obstacles.length;
  for (let i = 0; unchanged && i < MAP.obstacles.length; i++) {
    const a = navigation.obstacles[i], b = MAP.obstacles[i];
    unchanged = a.minX === b.minX && a.maxX === b.maxX && a.minZ === b.minZ && a.maxZ === b.maxZ;
  }
  if (!unchanged) navigation = buildNavigation();
  return navigation;
}
function nearest(x: number, z: number, graph = navigationForMap()) {
  let best = -1, distance = Infinity;
  const from = { x, z }, startIsWalkable = canStand(x, z);
  for (let i = 0; i < gridPoints.length; i++) {
    if (!graph.walkable[i]) continue;
    const p = gridPoints[i], d = Math.hypot(x - p.x, z - p.z);
    if (d < distance) { best = i; distance = d; }
  }
  // Usually the closest lattice point is already reachable. Check that edge
  // once, rather than ray-marching every farther record-holder in grid order.
  // A blocked nearest edge falls back to the original ordered reachable search.
  if (best < 0 || !startIsWalkable || clearRoute(from, gridPoints[best])) return best;
  best = -1; distance = Infinity;
  for (let i = 0; i < gridPoints.length; i++) {
    if (!graph.walkable[i]) continue;
    const p = gridPoints[i], d = Math.hypot(x - p.x, z - p.z);
    if (d < distance && clearRoute(from, p)) { best = i; distance = d; }
  }
  return best;
}
export function walkableTarget(p: Point): Point {
  if (canStand(p.x, p.z) || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return p;
  const graph = navigationForMap(), key = `${p.x},${p.z}`;
  const cached = graph.targets.get(key);
  if (cached) return { ...cached };
  const id = nearest(p.x, p.z, graph);
  if (id < 0) return p;
  const target = gridPoints[id];
  // Bots follow moving bombs as well as static cover. Bound the cache and never
  // return its owned point: callers may shift or modify their local path arrays.
  if (graph.targets.size >= MAX_PROJECTED_TARGETS) graph.targets.delete(graph.targets.keys().next().value!);
  graph.targets.set(key, target);
  return { ...target };
}
export function findPath(x: number, z: number, tx: number, tz: number): Point[] {
  if (![x, z, tx, tz].every(Number.isFinite)) return [];
  const from = { x, z }, to = walkableTarget({ x: tx, z: tz });
  if (!canStand(to.x, to.z)) return [];
  if (clearRoute(from, to)) return [to];
  const graph = navigationForMap(), start = nearest(x, z, graph), goal = nearest(to.x, to.z, graph);
  if (start < 0 || goal < 0) return [];
  const queue = new Int32Array(gridPoints.length), parents = new Int32Array(gridPoints.length).fill(-2);
  queue[0] = start; parents[start] = -1;
  let length = 1;
  for (let q = 0; q < length; q++) {
    const id = queue[q]; if (id === goal) break;
    for (const next of graph.edges[id]) {
      if (parents[next] !== -2) continue;
      parents[next] = id; queue[length++] = next;
    }
  }
  if (parents[goal] === -2) return [];
  const route: Point[] = [];
  for (let id = goal; id !== -1; id = parents[id]) route.push({ ...gridPoints[id] });
  route.reverse(); route.push(to);
  return route;
}
