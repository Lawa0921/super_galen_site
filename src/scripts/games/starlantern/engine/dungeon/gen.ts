import { parseFloor, DELTA, posKey, tileAt, type FloorMap, type Tile } from '../map';
import { mulberry32, randInt, type Rng } from '../rng';
import type { Pos } from '../types';
import { FLOORS } from '../../data/floors';

export interface Room { x: number; y: number; w: number; h: number; id: number }
export interface GenFloor { map: FloorMap; rooms: Room[]; entranceRoom: number; exitRoom: number }

const MAX_TRIES = 20;
const center = (r: Room): Pos => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

/** Map size for a depth: 21x15 at depth 1, growing to 29x21. */
function sizeFor(depth: number, rng: Rng): { width: number; height: number } {
  const g = Math.max(0, depth - 1);
  return {
    width: 21 + Math.min(8, Math.floor(g / 2)) + (depth === 1 ? randInt(rng, 0, 2) : 0),
    height: 15 + Math.min(6, Math.floor(g / 3)) + (depth === 1 ? randInt(rng, 0, 2) : 0),
  };
}

/** Rooms keep at least one wall tile between each other. */
function placeRooms(width: number, height: number, rng: Rng): Room[] {
  const target = randInt(rng, 6, 10);
  const rooms: Room[] = [];
  for (let i = 0; i < 80 && rooms.length < target; i++) {
    const w = randInt(rng, 3, 5), h = randInt(rng, 3, 4);
    const x = randInt(rng, 1, width - 1 - w), y = randInt(rng, 1, height - 1 - h);
    const clear = rooms.every(r => r.x + r.w + 1 <= x || x + w + 1 <= r.x || r.y + r.h + 1 <= y || y + h + 1 <= r.y);
    if (clear) rooms.push({ x, y, w, h, id: rooms.length });
  }
  return rooms;
}

/** Prim MST over room centers, plus 1-2 extra random edges. */
function connect(rooms: Room[], rng: Rng): [number, number][] {
  const dist = (a: number, b: number) => {
    const p = center(rooms[a]), q = center(rooms[b]);
    return Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
  };
  const inTree = new Set([0]);
  const edges: [number, number][] = [];
  while (inTree.size < rooms.length) {
    let best: [number, number] | null = null;
    for (const a of inTree) for (let b = 0; b < rooms.length; b++) {
      if (!inTree.has(b) && (!best || dist(a, b) < dist(best[0], best[1]))) best = [a, b];
    }
    edges.push(best!);
    inTree.add(best![1]);
  }
  const has = (a: number, b: number) => edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  for (let extra = randInt(rng, 1, 2), tries = 0; extra > 0 && tries < 30; tries++) {
    const a = randInt(rng, 0, rooms.length - 1), b = randInt(rng, 0, rooms.length - 1);
    if (a !== b && !has(a, b)) { edges.push([a, b]); extra--; }
  }
  return edges;
}

/** Tile-path distances from `from`; doors count as passable. */
function distances(map: FloorMap, from: Pos): Map<string, number> {
  const d = new Map([[posKey(from), 0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const v of Object.values(DELTA)) {
      const n = { x: p.x + v.x, y: p.y + v.y };
      if (tileAt(map, n) === 'wall' || d.has(posKey(n))) continue;
      d.set(posKey(n), d.get(posKey(p))! + 1);
      queue.push(n);
    }
  }
  return d;
}

/** Passable tiles just outside the room edge (its entrances). */
function entrances(map: FloorMap, r: Room): Pos[] {
  const out: Pos[] = [];
  const add = (x: number, y: number) => { if (tileAt(map, { x, y }) !== 'wall') out.push({ x, y }); };
  for (let x = r.x; x < r.x + r.w; x++) { add(x, r.y - 1); add(x, r.y + r.h); }
  for (let y = r.y; y < r.y + r.h; y++) { add(r.x - 1, y); add(r.x + r.w, y); }
  return out;
}

function attempt(seed: number, depth: number, boss: boolean): GenFloor | null {
  const rng = mulberry32(seed);
  const { width, height } = sizeFor(depth, rng);
  const rooms = placeRooms(width, height, rng);
  if (rooms.length < 6) return null;

  const tiles: Tile[][] = Array.from({ length: height }, () => Array<Tile>(width).fill('wall'));
  const carve = (x: number, y: number) => { tiles[y][x] = 'floor'; };
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y);
  for (const [a, b] of connect(rooms, rng)) {
    const p = center(rooms[a]), q = center(rooms[b]);
    const horizFirst = rng() < 0.5;
    const corner = horizFirst ? { x: q.x, y: p.y } : { x: p.x, y: q.y };
    for (const [s, e] of [[p, corner], [corner, q]]) {
      for (let x = Math.min(s.x, e.x); x <= Math.max(s.x, e.x); x++) carve(x, s.y);
      for (let y = Math.min(s.y, e.y); y <= Math.max(s.y, e.y); y++) carve(s.x, y);
    }
  }
  const map: FloorMap = { width, height, tiles, entrance: center(rooms[0]), up: null, down: null, boss: null, chests: [] };

  // Entrance/exit: the farthest pair of rooms by walking distance.
  const centers = rooms.map(center);
  const from = rooms.map(r => distances(map, center(r)));
  if (from[0].size !== tiles.flat().filter(t => t !== 'wall').length) return null;
  let diameter = 0;
  for (const d of from) for (const c of centers) diameter = Math.max(diameter, d.get(posKey(c)) ?? 0);
  let best: [number, number] | null = null, bestDist = -1;
  for (let a = 0; a < rooms.length; a++) for (let b = 0; b < rooms.length; b++) {
    if (a === b) continue;
    if (boss && entrances(map, rooms[b]).length !== 1) continue; // the boss room needs a single door
    const dd = from[a].get(posKey(centers[b]))!;
    if (dd > bestDist) { bestDist = dd; best = [a, b]; }
  }
  if (!best || bestDist < diameter * 0.7) return null;

  const [entranceRoom, exitRoom] = best;
  map.entrance = centers[entranceRoom];
  tiles[map.entrance.y][map.entrance.x] = 'entrance';
  const exit = centers[exitRoom];
  if (boss) {
    const door = entrances(map, rooms[exitRoom])[0];
    tiles[door.y][door.x] = 'door';
    tiles[exit.y][exit.x] = 'boss';
    map.boss = exit;
  } else {
    tiles[exit.y][exit.x] = 'down';
    map.down = exit;
  }
  return { map, rooms, entranceRoom, exitRoom };
}

/** Seeded room-and-corridor floor. Retries with shifted seeds; falls back to a fixed map. */
export function genFloor(seed: number, opts: { depth: number; boss: boolean }): GenFloor {
  for (let k = 0; k < MAX_TRIES; k++) {
    const g = attempt(seed + 7919 * k, opts.depth, opts.boss);
    if (g) return g;
  }
  return { map: parseFloor(FLOORS[(opts.depth - 1) % 3].rows), rooms: [], entranceRoom: 0, exitRoom: 0 };
}
