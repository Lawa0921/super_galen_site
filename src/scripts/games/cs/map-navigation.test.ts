import { describe, expect, it } from 'vitest';
import { MAP, canStand, clearRoute, findPath, walkableTarget, type Point } from './map';

// Frozen algorithm oracle from the pre-optimization navigation, using the same
// live collision rules. Preserve lattice order and BFS tie breaks, not just ends.
const width = 24, depth = 28;
const point = (id: number): Point => ({ x: id % width * 2 - 23, z: Math.floor(id / width) * 2 - 27 });
function referenceNearest(x: number, z: number) {
  let best = 0, distance = Infinity;
  const walkable = canStand(x, z);
  for (let i = 0; i < width * depth; i++) {
    const p = point(i), d = Math.hypot(x - p.x, z - p.z);
    if (d < distance && canStand(p.x, p.z) && (!walkable || clearRoute({ x, z }, p))) { best = i; distance = d; }
  }
  return best;
}
function referencePath(x: number, z: number, tx: number, tz: number): Point[] {
  const from = { x, z }, to = canStand(tx, tz) ? { x: tx, z: tz } : point(referenceNearest(tx, tz));
  if (clearRoute(from, to)) return [to];
  const start = referenceNearest(x, z), goal = referenceNearest(to.x, to.z), queue = [start], parents = new Map([[start, -1]]);
  for (let q = 0; q < queue.length; q++) {
    const id = queue[q]; if (id === goal) break;
    for (const next of [id - 1, id + 1, id - width, id + width]) {
      if (next < 0 || next >= width * depth || parents.has(next)) continue;
      const a = point(id), b = point(next);
      if (Math.hypot(a.x - b.x, a.z - b.z) > 2.1 || !canStand(b.x, b.z) || !clearRoute(a, b)) continue;
      parents.set(next, id); queue.push(next);
    }
  }
  if (!parents.has(goal)) return [];
  const route: Point[] = [to];
  for (let id = goal; id !== -1; id = parents.get(id)!) route.unshift(point(id));
  return route;
}
function countCollisionReads<T>(run: () => T) {
  const originals = MAP.obstacles.slice();
  let reads = 0;
  MAP.obstacles.splice(0, originals.length, ...originals.map(box => {
    const copy = { ...box };
    for (const key of ['minX', 'maxX', 'minZ', 'maxZ'] as const) {
      Object.defineProperty(copy, key, { configurable: true, enumerable: true, get: () => { reads++; return box[key]; } });
    }
    return copy;
  }));
  try { const value = run(); return { value, reads }; }
  finally { MAP.obstacles.splice(0, MAP.obstacles.length, ...originals); }
}

describe('cached tactical navigation', () => {
  it('preserves exact routes and clear endpoints across both spawns, objectives and blocked cover', () => {
    const targets = [...MAP.sites, { x: -17, z: -11 }, { x: 17, z: -11 }, { x: 0, z: -9 }];
    for (const x of [-8, 0, 8]) for (const z of [-23, 7, 23]) for (const t of targets) {
      const actual = findPath(x, z, t.x, t.z);
      expect(actual).toEqual(referencePath(x, z, t.x, t.z));
      let previous = { x, z };
      for (const p of actual) { expect(canStand(p.x, p.z)).toBe(true); expect(clearRoute(previous, p)).toBe(true); previous = p; }
    }
  });
  it('reuses repeated blocked-target projections rather than scanning the collision lattice every tick', () => {
    walkableTarget({ x: -17, z: -11 });
    const result = countCollisionReads(() => {
      for (let i = 0; i < 30; i++) walkableTarget({ x: -17, z: -11 });
    });
    // Includes live endpoint and layout invalidation checks; not a timing test.
    expect(result.reads).toBeLessThan(5000);
  });
  it('reuses lattice edge checks without changing a route around the warehouse', () => {
    findPath(0, 9, 0, -9);
    const old = countCollisionReads(() => referencePath(0, 9, 0, -9));
    const current = countCollisionReads(() => findPath(0, 9, 0, -9));
    expect(current.value).toEqual(old.value);
    expect(current.reads).toBeLessThan(old.reads * .6);
  });
  it('never exposes cached points to mutation by a bot or caller', () => {
    const input = Object.freeze({ x: -17, z: -11 });
    const expected = walkableTarget(input), returned = walkableTarget(input);
    returned.x = 999;
    expect(walkableTarget(input)).toEqual(expected);
    const first = findPath(0, 9, 0, -9), snapshot = structuredClone(first);
    first[0].x = 999; first.at(-1)!.z = 999; first.splice(1, 1);
    expect(findPath(0, 9, 0, -9)).toEqual(snapshot);
  });
  it('invalidates cached targets and edges when a collision box changes', () => {
    const box = MAP.obstacles.find(b => b.id === 'crates-a')!, saved = { ...box };
    const old = walkableTarget({ x: -17, z: -11 });
    try {
      box.minX = -23; box.maxX = -14; box.minZ = -14; box.maxZ = -7;
      const target = walkableTarget({ x: -17, z: -11 });
      expect(target).not.toEqual(old); expect(canStand(target.x, target.z)).toBe(true);
      expect(findPath(0, 23, -17, -11)).toEqual(referencePath(0, 23, -17, -11));
    } finally { Object.assign(box, saved); }
    expect(walkableTarget({ x: -17, z: -11 })).toEqual(old);
  });
  it('returns no route across disconnected components and recovers after obstacle removal', () => {
    const expected = findPath(0, 9, 0, -9);
    const divider = { ...MAP.obstacles[0], id: 'test-divider', minX: -24, maxX: 24, minZ: -1, maxZ: 1 };
    MAP.obstacles.push(divider);
    try { expect(findPath(0, 9, 0, -9)).toEqual([]); }
    finally { MAP.obstacles.splice(MAP.obstacles.indexOf(divider), 1); }
    expect(findPath(0, 9, 0, -9)).toEqual(expected);
  });
  it('rejects nonfinite navigation coordinates without poisoning later finite queries', () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      for (let index = 0; index < 4; index++) {
        const args: [number, number, number, number] = [0, 9, 0, -9]; args[index] = value;
        expect(findPath(...args)).toEqual([]);
      }
    }
    expect(findPath(0, 9, 0, -9)).toEqual(referencePath(0, 9, 0, -9));
  });
});

describe('navigation cache limits and boundary recovery', () => {
  it('evicts old blocked-target entries after a bounded working set', () => {
    const first = { x: 0, z: 0 };
    walkableTarget(first);
    const hot = countCollisionReads(() => walkableTarget(first));
    for (let i = 1; i <= 129; i++) walkableTarget({ x: i / 100, z: 0 });
    const evicted = countCollisionReads(() => walkableTarget(first));
    expect(evicted.value).toEqual(hot.value);
    expect(evicted.reads).toBeGreaterThan(hot.reads);
    expect(countCollisionReads(() => walkableTarget(first)).reads).toBe(hot.reads);
  });
  it('invalidates for bounds changes and never invents a node when no lattice point is walkable', () => {
    const saved = MAP.bounds.x;
    try {
      MAP.bounds.x = 7;
      expect(findPath(0, 9, 0, -9)).toEqual([]);
      MAP.bounds.x = .1;
      expect(findPath(0, 9, 0, -9)).toEqual([]);
    } finally { MAP.bounds.x = saved; }
    expect(findPath(0, 9, 0, -9)).toEqual(referencePath(0, 9, 0, -9));
  });
  it('matches the exhaustive endpoint search on fractional positions near obstacle boundaries', () => {
    let seed = 20261006, tested = 0;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    while (tested < 80) {
      const x = random() * 46 - 23, z = random() * 54 - 27, tx = random() * 46 - 23, tz = random() * 54 - 27;
      if (!canStand(x, z)) continue;
      expect(findPath(x, z, tx, tz)).toEqual(referencePath(x, z, tx, tz)); tested++;
    }
  });
});
