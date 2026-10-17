import type { Footprint, RtsMap, Vec2 } from './maps';
import { UNITS } from './catalog';

const EPSILON = 1e-9;
const DEFAULT_RADIUS = 0.45;

/** Binary heap over parallel typed arrays (no per-node objects); same (priority, cost, order) ordering as before. */
class MinHeap {
  private index = new Int32Array(1024);
  private cost = new Float64Array(1024);
  private priority = new Float64Array(1024);
  private order = new Int32Array(1024);
  size = 0;
  private less(a: number, b: number): boolean {
    const dp = this.priority[a] - this.priority[b];
    if (dp !== 0) return dp < 0;
    const dc = this.cost[a] - this.cost[b];
    return dc !== 0 ? dc < 0 : this.order[a] < this.order[b];
  }
  private move(to: number, from: number): void {
    this.index[to] = this.index[from]; this.cost[to] = this.cost[from]; this.priority[to] = this.priority[from]; this.order[to] = this.order[from];
  }
  push(index: number, cost: number, priority: number, order: number): void {
    if (this.size + 2 >= this.index.length) {
      const n = this.index.length * 2, grow = <T extends Int32Array | Float64Array>(a: T, b: T): T => { b.set(a); return b; };
      this.index = grow(this.index, new Int32Array(n)); this.cost = grow(this.cost, new Float64Array(n));
      this.priority = grow(this.priority, new Float64Array(n)); this.order = grow(this.order, new Int32Array(n));
    }
    // The last slot is scratch for the entry being sifted up.
    const scratch = this.index.length - 1;
    this.index[scratch] = index; this.cost[scratch] = cost; this.priority[scratch] = priority; this.order[scratch] = order;
    let at = this.size++;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (!this.less(scratch, parent)) break;
      this.move(at, parent); at = parent;
    }
    this.move(at, scratch);
  }
  /** Pops the minimum into `top` (index, cost); returns false when empty. */
  pop(top: { index: number; cost: number }): boolean {
    if (this.size === 0) return false;
    top.index = this.index[0]; top.cost = this.cost[0];
    const last = --this.size;
    if (last > 0) {
      let at = 0;
      while (true) {
        const left = at * 2 + 1, right = left + 1;
        if (left >= last) break;
        const child = right < last && this.less(right, left) ? right : left;
        if (!this.less(child, last)) break;
        this.move(at, child); at = child;
      }
      this.move(at, last);
    }
    return true;
  }
}

function validMap(map: RtsMap, requireNoBuild = false): boolean {
  return Number.isInteger(map.width)
    && map.width > 0
    && Number.isInteger(map.height)
    && map.height > 0
    && map.blocked instanceof Uint8Array
    && map.blocked.length === map.width * map.height
    && (!requireNoBuild || (map.noBuild instanceof Uint8Array && map.noBuild.length === map.width * map.height));
}

function validFootprint(footprint: Footprint): boolean {
  return Number.isFinite(footprint.x)
    && Number.isFinite(footprint.z)
    && Number.isFinite(footprint.width)
    && Number.isFinite(footprint.depth)
    && footprint.width > 0
    && footprint.depth > 0;
}

function footprintBounds(footprint: Footprint): { left: number; top: number; right: number; bottom: number } {
  return {
    left: footprint.x - footprint.width / 2,
    top: footprint.z - footprint.depth / 2,
    right: footprint.x + footprint.width / 2,
    bottom: footprint.z + footprint.depth / 2,
  };
}

function validObstacles(map: RtsMap, obstacles: Footprint[]): boolean {
  return Array.isArray(obstacles) && obstacles.every((obstacle) => {
    if (!validFootprint(obstacle)) return false;
    const bounds = footprintBounds(obstacle);
    return bounds.left >= 0
      && bounds.top >= 0
      && bounds.right <= map.width
      && bounds.bottom <= map.height;
  });
}

function cellIndex(map: RtsMap, x: number, z: number): number {
  return z * map.width + x;
}

function circleIntersectsRect(point: Vec2, radius: number, left: number, top: number, right: number, bottom: number): boolean {
  if (point.x >= left && point.x <= right && point.z >= top && point.z <= bottom) return true;
  const nearestX = Math.max(left, Math.min(point.x, right));
  const nearestZ = Math.max(top, Math.min(point.z, bottom));
  const dx = point.x - nearestX;
  const dz = point.z - nearestZ;
  return dx * dx + dz * dz < radius * radius - EPSILON;
}

function pointIsInBlockedCell(point: Vec2, x: number, z: number): boolean {
  return point.x > x + EPSILON
    && point.x < x + 1 - EPSILON
    && point.z > z + EPSILON
    && point.z < z + 1 - EPSILON;
}

export function isWalkable(
  map: RtsMap,
  point: Vec2,
  obstacles: Footprint[] = [],
  radius = DEFAULT_RADIUS,
): boolean {
  if (!validMap(map)
    || !Number.isFinite(point?.x)
    || !Number.isFinite(point?.z)
    || !Number.isFinite(radius)
    || radius < 0
    || point.x - radius < 0
    || point.z - radius < 0
    || point.x + radius > map.width
    || point.z + radius > map.height
    || !validObstacles(map, obstacles)) return false;

  if (!terrainClear(map, point, radius)) return false;

  for (const obstacle of obstacles) {
    const bounds = footprintBounds(obstacle);
    if (circleIntersectsRect(
      point,
      radius,
      bounds.left,
      bounds.top,
      bounds.right,
      bounds.bottom,
    )) return false;
  }

  return true;
}

/** Map bounds and blocked cells only (inputs already validated). */
function terrainClear(map: RtsMap, point: Vec2, radius: number): boolean {
  if (point.x - radius < 0 || point.z - radius < 0 || point.x + radius > map.width || point.z + radius > map.height) return false;
  const minX = Math.max(0, Math.floor(point.x - radius));
  const maxX = Math.min(map.width - 1, Math.floor(point.x + radius));
  const minZ = Math.max(0, Math.floor(point.z - radius));
  const maxZ = Math.min(map.height - 1, Math.floor(point.z + radius));
  for (let z = minZ; z <= maxZ; z += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (map.blocked[cellIndex(map, x, z)] !== 0
        && (pointIsInBlockedCell(point, x, z)
          || circleIntersectsRect(point, radius, x, z, x + 1, z + 1))) return false;
    }
  }
  return true;
}

/**
 * Per-query memo of isWalkable at cell centres. Obstacle footprints are stamped
 * once (exact circle/rect test over their inflated bounds) and terrain is tested
 * lazily, once per touched cell, instead of re-scanning every obstacle for each
 * of up to three tests per A* neighbour. Results equal isWalkable(centre).
 */
/**
 * Terrain clearance per blocked grid and radius, shared across queries. The grid
 * may be edited in place (scenery tests, debug tools), so each query re-checks a
 * 32-bit fingerprint of it (~20k words on a 288 m map) before trusting the memo.
 */
const terrainMemo = new WeakMap<Uint8Array, { sum: number; byRadius: Map<number, Uint8Array> }>();
function fingerprint(grid: Uint8Array): number {
  let h = 0x811c9dc5 ^ grid.length;
  if (grid.byteOffset % 4 === 0) {
    const words = new Uint32Array(grid.buffer, grid.byteOffset, grid.length >> 2);
    for (let i = 0; i < words.length; i += 1) h = Math.imul(h ^ words[i], 16777619);
    for (let i = words.length << 2; i < grid.length; i += 1) h = Math.imul(h ^ grid[i], 16777619);
  } else for (let i = 0; i < grid.length; i += 1) h = Math.imul(h ^ grid[i], 16777619);
  return h >>> 0;
}
function terrainCells(map: RtsMap, radius: number): Uint8Array {
  const sum = fingerprint(map.blocked);
  let memo = terrainMemo.get(map.blocked);
  if (!memo || memo.sum !== sum) terrainMemo.set(map.blocked, memo = { sum, byRadius: new Map() });
  let cells = memo.byRadius.get(radius);
  if (!cells || cells.length !== map.width * map.height) memo.byRadius.set(radius, cells = new Uint8Array(map.width * map.height));
  return cells;
}

class CellWalk {
  /** 0 unknown, 2 blocked: obstacle stamps for this query only. */
  private state: Uint8Array;
  /** Shared terrain-only clearance (0 unknown, 1 walkable, 2 blocked), filled lazily. */
  private terrain: Uint8Array;
  constructor(private map: RtsMap, obstacles: Footprint[], private radius: number) {
    const W = map.width, H = map.height;
    this.state = new Uint8Array(W * H);
    this.terrain = terrainCells(map, radius);
    for (const obstacle of obstacles) {
      const b = footprintBounds(obstacle);
      for (let z = Math.max(0, Math.floor(b.top - radius) - 1); z <= Math.min(H - 1, Math.ceil(b.bottom + radius)); z += 1)
        for (let x = Math.max(0, Math.floor(b.left - radius) - 1); x <= Math.min(W - 1, Math.ceil(b.right + radius)); x += 1)
          if (circleIntersectsRect({ x: x + 0.5, z: z + 0.5 }, radius, b.left, b.top, b.right, b.bottom)) this.state[z * W + x] = 2;
    }
  }
  ok(x: number, z: number): boolean {
    const i = z * this.map.width + x;
    if (this.state[i] === 2) return false;
    let v = this.terrain[i];
    if (v === 0) v = this.terrain[i] = terrainClear(this.map, { x: x + 0.5, z: z + 0.5 }, this.radius) ? 1 : 2;
    return v === 1;
  }
}

function heuristic(aX: number, aZ: number, bX: number, bZ: number): number {
  const dx = Math.abs(aX - bX);
  const dz = Math.abs(aZ - bZ);
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
}

function centerOf(index: number, width: number): Vec2 {
  return { x: index % width + 0.5, z: Math.floor(index / width) + 0.5 };
}

function canStep(map: RtsMap, x: number, z: number, nextX: number, nextZ: number, walk: CellWalk): boolean {
  if (nextX < 0 || nextZ < 0 || nextX >= map.width || nextZ >= map.height) return false;
  if (!walk.ok(nextX, nextZ)) return false;
  return x === nextX || z === nextZ || walk.ok(nextX, z) && walk.ok(x, nextZ);
}

/** A legal off-grid point can sit beside an inflated wall while its own cell center is blocked. */
function endpointCell(map:RtsMap,point:Vec2,obstacles:Footprint[],radius:number):number|null {
  const candidates:Array<{index:number;distance:number}>=[];
  for(let z=Math.floor(point.z)-1;z<=Math.floor(point.z)+1;z++)for(let x=Math.floor(point.x)-1;x<=Math.floor(point.x)+1;x++){
    if(x<0||z<0||x>=map.width||z>=map.height)continue;
    const center={x:x+.5,z:z+.5},distance=Math.hypot(point.x-center.x,point.z-center.z);
    if(distance>Math.SQRT2||!isWalkable(map,center,obstacles,radius))continue;
    let clear=true;const samples=Math.max(1,Math.ceil(distance/.12));
    for(let i=1;i<samples;i++){const t=i/samples;if(!isWalkable(map,{x:point.x+(center.x-point.x)*t,z:point.z+(center.z-point.z)*t},obstacles,radius)){clear=false;break;}}
    if(clear)candidates.push({index:cellIndex(map,x,z),distance});
  }
  // Equidistant cells (a point on a cell boundary): prefer the one nearer the
  // map centre so 180°-twin positions pick twin cells.
  const inward=(i:number)=>Math.abs(i%map.width+.5-map.width/2)+Math.abs(Math.floor(i/map.width)+.5-map.height/2)*1e-3;
  candidates.sort((a,b)=>Math.abs(a.distance-b.distance)>1e-9?a.distance-b.distance:inward(a.index)-inward(b.index)||a.index-b.index);return candidates[0]?.index??null;
}

export function findPath(
  map: RtsMap,
  start: Vec2,
  goal: Vec2,
  obstacles: Footprint[] = [],
  radius = DEFAULT_RADIUS,
): Vec2[] | null {
  if (!validMap(map)
    || !Number.isFinite(start?.x)
    || !Number.isFinite(start?.z)
    || !Number.isFinite(goal?.x)
    || !Number.isFinite(goal?.z)
    || !isWalkable(map, start, obstacles, radius)
    || !isWalkable(map, goal, obstacles, radius)) return null;

  const startIndex=endpointCell(map,start,obstacles,radius),goalIndex=endpointCell(map,goal,obstacles,radius);
  if(startIndex===null||goalIndex===null)return null;
  const startX=startIndex%map.width,startZ=Math.floor(startIndex/map.width),goalX=goalIndex%map.width,goalZ=Math.floor(goalIndex/map.width);
  if(startIndex===goalIndex){const center=centerOf(startIndex,map.width);return samePoint(start,goal)?[start]:[start,center,goal];}

  const cellCount = map.width * map.height, W = map.width, walk = new CellWalk(map, obstacles, radius);
  const costs = new Float64Array(cellCount);
  costs.fill(Number.POSITIVE_INFINITY);
  const parents = new Int32Array(cellCount);
  parents.fill(-1);
  const closed = new Uint8Array(cellCount);
  const open = new MinHeap(), current = { index: 0, cost: 0 };
  let order = 0;
  costs[startIndex] = 0;
  open.push(startIndex, 0, heuristic(startX, startZ, goalX, goalZ), order++);

  while (open.pop(current)) {
    if (closed[current.index] !== 0 || current.cost > costs[current.index] + EPSILON) continue;
    if (current.index === goalIndex) break;
    closed[current.index] = 1;
    const x = current.index % W;
    const z = (current.index - x) / W;

    for (let n = 0; n < 8; n += 1) {
      const dx = NEIGHBOR_X[n], dz = NEIGHBOR_Z[n];
      const nextX = x + dx;
      const nextZ = z + dz;
      if (!canStep(map, x, z, nextX, nextZ, walk)) continue;
      const nextIndex = nextZ * W + nextX;
      if (closed[nextIndex] !== 0) continue;
      const nextCost = costs[current.index] + (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1);
      if (nextCost + EPSILON >= costs[nextIndex]) continue;
      costs[nextIndex] = nextCost;
      parents[nextIndex] = current.index;
      open.push(nextIndex, nextCost, nextCost + heuristic(nextX, nextZ, goalX, goalZ), order++);
    }
  }

  if (parents[goalIndex] < 0) return null;
  const reversePath = [goalIndex];
  let cursor = goalIndex;
  while (cursor !== startIndex) {
    cursor = parents[cursor];
    if (cursor < 0) return null;
    reversePath.push(cursor);
  }
  reversePath.reverse();

  const path: Vec2[] = [start];
  const startCenter = centerOf(reversePath[0], map.width);
  if (!samePoint(startCenter, start)) path.push(startCenter);
  for (const index of reversePath.slice(1)) {
    const point = centerOf(index, map.width);
    if (!samePoint(point, goal)) path.push(point);
  }
  if (!samePoint(path[path.length - 1], goal)) path.push(goal);
  return path;
}

const NEIGHBOR_X = [-1, 1, 0, 0, -1, 1, -1, 1] as const;
const NEIGHBOR_Z = [0, 0, -1, 1, -1, -1, 1, 1] as const;

function samePoint(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.z - b.z) < EPSILON;
}

function overlaps(a: Footprint, b: Footprint): boolean {
  const aBounds = footprintBounds(a);
  const bBounds = footprintBounds(b);
  return Math.min(aBounds.right, bBounds.right) - Math.max(aBounds.left, bBounds.left) > EPSILON
    && Math.min(aBounds.bottom, bBounds.bottom) - Math.max(aBounds.top, bBounds.top) > EPSILON;
}

function footprintHasBlockedCell(map: RtsMap, footprint: Footprint): boolean {
  const bounds = footprintBounds(footprint);
  const startX = Math.max(0, Math.floor(bounds.left));
  const endX = Math.min(map.width - 1, Math.ceil(bounds.right - EPSILON) - 1);
  const startZ = Math.max(0, Math.floor(bounds.top));
  const endZ = Math.min(map.height - 1, Math.ceil(bounds.bottom - EPSILON) - 1);

  for (let z = startZ; z <= endZ; z += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const index = cellIndex(map, x, z);
      const overlapsCell = Math.min(bounds.right, x + 1) - Math.max(bounds.left, x) > EPSILON
        && Math.min(bounds.bottom, z + 1) - Math.max(bounds.top, z) > EPSILON;
      if (overlapsCell && (map.blocked[index] !== 0 || map.noBuild[index] !== 0)) return true;
    }
  }
  return false;
}

function nearestAnchorCells(
  map: RtsMap,
  anchor: Vec2,
  walk: CellWalk,
): number[] {
  if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.z)
    || anchor.x < 0 || anchor.z < 0 || anchor.x >= map.width || anchor.z >= map.height) return [];

  const maxDistance = 7;
  const minX = Math.max(0, Math.floor(anchor.x - maxDistance));
  const maxX = Math.min(map.width - 1, Math.floor(anchor.x + maxDistance));
  const minZ = Math.max(0, Math.floor(anchor.z - maxDistance));
  const maxZ = Math.min(map.height - 1, Math.floor(anchor.z + maxDistance));
  const candidates: Array<{ index: number; distance: number }> = [];

  for (let z = minZ; z <= maxZ; z += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const point = { x: x + 0.5, z: z + 0.5 };
      const distance = Math.hypot(point.x - anchor.x, point.z - anchor.z);
      // walk.ok(x, z) equals isWalkable(cell centre) for the same obstacles and radius.
      if (distance > maxDistance || !walk.ok(x, z)) continue;
      candidates.push({ index: cellIndex(map, x, z), distance });
    }
  }

  if (candidates.length === 0) return [];
  candidates.sort((a, b) => a.distance - b.distance || a.index - b.index);
  const nearestDistance = candidates[0].distance;
  return candidates
    .filter((candidate) => candidate.distance <= nearestDistance + 0.75)
    .map((candidate) => candidate.index);
}

/**
 * Flood fill over walk-legal steps. `label` receives `id` for every reached cell
 * (cells already labelled are skipped); an optional box limits the search.
 * Returns the number of cells reached.
 */
function flood(map: RtsMap, starts: number[], walk: CellWalk, label: Int32Array, id: number,
  box?: { minX: number; minZ: number; maxX: number; maxZ: number }): number {
  const queue = new Int32Array(box ? (box.maxX - box.minX + 1) * (box.maxZ - box.minZ + 1) : map.width * map.height);
  let head = 0;
  let tail = 0;
  for (const start of starts) {
    if (label[start] !== 0) continue;
    label[start] = id;
    queue[tail++] = start;
  }
  while (head < tail) {
    const current = queue[head++];
    const x = current % map.width;
    const z = Math.floor(current / map.width);
    for (let n = 0; n < 8; n += 1) {
      const nextX = x + NEIGHBOR_X[n];
      const nextZ = z + NEIGHBOR_Z[n];
      if (box && (nextX < box.minX || nextX > box.maxX || nextZ < box.minZ || nextZ > box.maxZ)) continue;
      if (!canStep(map, x, z, nextX, nextZ, walk)) continue;
      const next = cellIndex(map, nextX, nextZ);
      if (label[next] !== 0) continue;
      label[next] = id;
      queue[tail++] = next;
    }
  }
  return tail;
}

/**
 * Connected components of the walk graph without the candidate footprint, for
 * a given terrain fingerprint, obstacle set and radius. A placement preview and
 * an AI think test many footprints against the same set, so the last few are kept.
 */
const componentMemo: Array<{ grid: Uint8Array; key: string; labels: Int32Array }> = [];
function baselineComponents(map: RtsMap, obstacles: Footprint[], radius: number, walk: CellWalk): Int32Array {
  const key = `${map.width}x${map.height}|${fingerprint(map.blocked)}|${radius}|${obstacles.map(o => `${o.x},${o.z},${o.width},${o.depth}`).join(';')}`;
  const hit = componentMemo.find(entry => entry.grid === map.blocked && entry.key === key);
  if (hit) return hit.labels;
  const labels = new Int32Array(map.width * map.height);
  let id = 0;
  for (let i = 0; i < labels.length; i += 1) {
    if (labels[i] !== 0 || !walk.ok(i % map.width, Math.floor(i / map.width))) continue;
    flood(map, [i], walk, labels, ++id);
  }
  componentMemo.unshift({ grid: map.blocked, key, labels });
  componentMemo.length = Math.min(componentMemo.length, 4);
  return labels;
}

/**
 * Exact shortcut for canPlace: if every anchor keeps a cell in anchor 0's
 * baseline component, and the cells bordering the footprint's newly blocked
 * cells (in that component) stay connected to each other inside a local box,
 * any baseline route can detour around the footprint, so the full flood would
 * succeed too. Returns false when it cannot prove that (the caller then floods).
 */
let localScratch = new Int32Array(0);
function placementKeepsConnectivity(map: RtsMap, footprint: Footprint, base: CellWalk, next: CellWalk,
  labels: Int32Array, anchorCells: number[][], radius: number): boolean {
  const component = anchorCells[0].map(cell => labels[cell]).find(id => id !== 0);
  if (!component || !anchorCells.every(cells => cells.some(cell => labels[cell] === component))) return false;
  const b = footprintBounds(footprint), W = map.width, H = map.height;
  const minX = Math.max(0, Math.floor(b.left - radius) - 2), maxX = Math.min(W - 1, Math.ceil(b.right + radius) + 1);
  const minZ = Math.max(0, Math.floor(b.top - radius) - 2), maxZ = Math.min(H - 1, Math.ceil(b.bottom + radius) + 1);
  const rim: number[] = [];
  for (let z = minZ; z <= maxZ; z += 1) for (let x = minX; x <= maxX; x += 1) {
    if (!base.ok(x, z) || next.ok(x, z)) continue;
    // A newly blocked cell: its open neighbours in the component form the rim.
    for (let n = 0; n < 8; n += 1) {
      const nx = x + NEIGHBOR_X[n], nz = z + NEIGHBOR_Z[n];
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const i = cellIndex(map, nx, nz);
      if (labels[i] === component && next.ok(nx, nz)) rim.push(i);
    }
  }
  if (rim.length === 0) return true;
  if (localScratch.length !== W * H) localScratch = new Int32Array(W * H);
  const local = localScratch;
  for (const margin of [12, 32]) {
    const box = { minX: Math.max(0, minX - margin), minZ: Math.max(0, minZ - margin), maxX: Math.min(W - 1, maxX + margin), maxZ: Math.min(H - 1, maxZ + margin) };
    flood(map, [rim[0]], next, local, 1, box);
    const connected = rim.every(cell => local[cell] !== 0);
    for (let z = box.minZ; z <= box.maxZ; z += 1) local.fill(0, z * W + box.minX, z * W + box.maxX + 1);
    if (connected) return true;
  }
  return false;
}

export function canPlace(map: RtsMap, footprint: Footprint, obstacles: Footprint[] = []): boolean {
  if (!validMap(map, true)
    || !validFootprint(footprint)
    || footprintBounds(footprint).left < 0
    || footprintBounds(footprint).top < 0
    || footprintBounds(footprint).right > map.width
    || footprintBounds(footprint).bottom > map.height
    || !validObstacles(map, obstacles)
    || obstacles.some((obstacle) => overlaps(footprint, obstacle))
    || footprintHasBlockedCell(map, footprint)) return false;

  const allObstacles = [...obstacles, footprint];
  const radius = Math.max(...Object.values(UNITS).map(unit=>unit.radius));
  const anchors = [
    ...map.spawns,
    ...map.resources.map(({ x, z }) => ({ x, z })),
    ...map.camps,
  ];
  const walk = new CellWalk(map, allObstacles, radius);
  const anchorCells = anchors.map((anchor) => nearestAnchorCells(map, anchor, walk));
  if (anchorCells.length === 0 || anchorCells.some((cells) => cells.length === 0)) return false;

  const base = new CellWalk(map, obstacles, radius);
  if (placementKeepsConnectivity(map, footprint, base, walk, baselineComponents(map, obstacles, radius, base), anchorCells, radius)) return true;
  const reached = new Int32Array(map.width * map.height);
  flood(map, anchorCells[0], walk, reached, 1);
  return anchorCells.every((cells) => cells.some((cell) => reached[cell] !== 0));
}
