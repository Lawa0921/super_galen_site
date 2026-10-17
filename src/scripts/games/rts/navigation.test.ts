import { describe, expect, it } from 'vitest';
import { createMap, type RtsMap, type Vec2 } from './maps';
import { channelBanks } from './river-layout';
import { canPlace, findPath, isWalkable } from './navigation';

function openMap(width = 9, height = 9): RtsMap {
  return {
    id: 'river',
    name: 'test map',
    width,
    height,
    blocked: new Uint8Array(width * height),
    noBuild: new Uint8Array(width * height),
    spawns: [
      { x: 0.5, z: 0.5 },
      { x: width - 0.5, z: height - 0.5 },
    ],
    resources: [],
    camps: [],
  };
}

function cellIndex(map: RtsMap, x: number, z: number): number {
  return z * map.width + x;
}

function seamBands(map: RtsMap): Array<[number, number]> {
  const leftSeam = map.width / 2 - 1;
  const rightSeam = map.width / 2;
  const bands: Array<[number, number]> = [];
  let start = -1;

  for (let z = 0; z <= map.height; z += 1) {
    const open = z < map.height
      && map.blocked[cellIndex(map, leftSeam, z)] === 0
      && map.blocked[cellIndex(map, rightSeam, z)] === 0;

    if (open && start < 0) start = z;
    if (!open && start >= 0) {
      bands.push([start, z - 1]);
      start = -1;
    }
  }

  return bands;
}

/** Rows whose channel midline is walkable: the winding river leaves the map's centre seam, so follow the water. */
function channelBands(map: RtsMap): Array<[number, number]> {
  const bands: Array<[number, number]> = [];
  let start = -1;
  for (let z = 0; z <= map.height; z += 1) {
    const banks = z < map.height ? channelBanks(z + 0.5) : null;
    const open = !!banks && map.blocked[cellIndex(map, Math.floor((banks.left + banks.right) / 2), z)] === 0;
    if (open && start < 0) start = z;
    if (!open && start >= 0) {
      bands.push([start, z - 1]);
      start = -1;
    }
  }
  return bands;
}

function expectConnectedPath(map: RtsMap, start: Vec2, goal: Vec2): void {
  const path = findPath(map, start, goal);
  expect(path).not.toBeNull();
  expect(path?.[0]).toEqual(start);
  expect(path?.at(-1)).toEqual(goal);

  for (const point of path ?? []) {
    expect(isWalkable(map, point)).toBe(true);
  }
  for (let i = 1; i < (path?.length ?? 0); i += 1) {
    const previous = path![i - 1];
    const current = path![i];
    expect(Math.hypot(current.x - previous.x, current.z - previous.z)).toBeLessThanOrEqual(Math.SQRT2 + 0.01);
  }
}

describe('RTS map topology and navigation', () => {
  it('connects valid subcell spawn and goal positions beside inflated building edges',()=>{
    const map=openMap(20,20),obstacle={x:8,z:8,width:7,depth:6},spawn={x:8.8,z:11.9},goal={x:8.8,z:4.1};
    expect(isWalkable(map,spawn,[obstacle],.78)).toBe(true);
    const path=findPath(map,spawn,goal,[obstacle],.78);expect(path).not.toBeNull();expect(path?.[0]).toEqual(spawn);expect(path?.at(-1)).toEqual(goal);
    for(let i=1;i<(path?.length??0);i++){const a=path![i-1],b=path![i];for(let t=0;t<=1;t+=.1)expect(isWalkable(map,{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},[obstacle],.78)).toBe(true);}
  });
  it.each(['river', 'pass'] as const)('%s map connects both bases to every resource', (id) => {
    const map = createMap(id);

    expect(map.width).toBe(288);
    expect(map.height).toBe(288);
    expect(map.blocked).toHaveLength(288 * 288);
    expect(map.noBuild).toHaveLength(288 * 288);
    expect(map.spawns[0]).not.toEqual(map.spawns[1]);
    for (const spawn of map.spawns) {
      expect(Number.isInteger(spawn.x)).toBe(true);
      expect(Number.isInteger(spawn.z)).toBe(true);
    }
    expectConnectedPath(map, map.spawns[0], map.spawns[1]);

    for (const resource of map.resources) {
      const point = { x: resource.x, z: resource.z };
      for (const spawn of map.spawns) expectConnectedPath(map, spawn, point);
    }
  });

  it('places the river map gates at two bridges and a ford, and the pass map at five routes', () => {
    const river = createMap('river');
    const pass = createMap('pass');
    const riverBands = channelBands(river);
    const passBands = seamBands(pass);

    expect(riverBands.map(([start, end]) => (start + end + 1) / 2)).toEqual([84, 144, 204]);
    // Goat trails (4), north detour (8), centre pass (6), south detour (8), goat trail (4).
    expect(passBands.map(([start, end]) => end - start + 1)).toEqual([4, 8, 6, 8, 4]);
  });

  it('blocks river water and pass rock while keeping bridge tiles unbuildable', () => {
    const river = createMap('river');
    const pass = createMap('pass');

    const water = channelBanks(48.5);
    expect(isWalkable(river, { x: (water.left + water.right) / 2, z: 48.5 })).toBe(false);
    expect(isWalkable(pass, { x: 144.5, z: 40.5 })).toBe(false);
    expect(canPlace(river, { x: 144, z: 84, width: 6, depth: 6 })).toBe(false);
    expect(canPlace(river, { x: 144, z: 204, width: 6, depth: 6 })).toBe(false);
    expect(canPlace(river, { x: 144, z: 144, width: 6, depth: 6 })).toBe(false);
  });

  it('routes around dynamic buildings without entering their inflated footprint', () => {
    const map = openMap();
    const obstacle = { x: 4.5, z: 4.5, width: 1, depth: 5 };
    const path = findPath(map, map.spawns[0], map.spawns[1], [obstacle]);

    expect(path).not.toBeNull();
    for (const point of path ?? []) {
      expect(isWalkable(map, point, [obstacle])).toBe(true);
    }
  });

  it('rejects a passage narrower than the unit radius', () => {
    const map = openMap(7, 5);
    for (let z = 0; z < map.height; z += 1) {
      if (z !== 2) {
        for (let x = 0; x < map.width; x += 1) map.blocked[cellIndex(map, x, z)] = 1;
      }
    }

    const start = { x: 0.5, z: 2.5 };
    const goal = { x: 6.5, z: 2.5 };
    expect(findPath(map, start, goal, [], 0.45)).not.toBeNull();
    expect(findPath(map, start, goal, [], 0.51)).toBeNull();
  });

  it('rejects a building that preserves infantry access but traps siege units',()=>{
    const map=openMap(20,10);map.spawns=[{x:2.5,z:5.5},{x:17.5,z:5.5}];
    for(let z=0;z<10;z++)for(let x=0;x<20;x++)if(z<3||z>=7)map.blocked[cellIndex(map,x,z)]=1;
    const tower={x:10,z:4.5,width:3,depth:3};
    expect(findPath(map,map.spawns[0],map.spawns[1],[tower],.38)).not.toBeNull();
    expect(findPath(map,map.spawns[0],map.spawns[1],[tower],.78)).toBeNull();
    expect(canPlace(map,tower)).toBe(false);
  });

  it('does not cut diagonally between two blocked cardinal neighbors', () => {
    const map = openMap(3, 3);
    map.blocked[cellIndex(map, 1, 0)] = 1;
    map.blocked[cellIndex(map, 0, 1)] = 1;

    expect(findPath(map, { x: 0.5, z: 0.5 }, { x: 1.5, z: 1.5 })).toBeNull();
  });

  it('returns false or null for non-finite and out-of-bounds inputs', () => {
    const map = openMap(5, 5);

    expect(isWalkable(map, { x: Number.NaN, z: 1 })).toBe(false);
    expect(isWalkable(map, { x: 5, z: 2 })).toBe(false);
    expect(findPath(map, { x: 0.5, z: 0.5 }, { x: Number.POSITIVE_INFINITY, z: 2 })).toBeNull();
    expect(findPath(map, { x: -0.01, z: 0.5 }, { x: 4.5, z: 4.5 })).toBeNull();
    expect(canPlace(map, { x: Number.NaN, z: 1, width: 1, depth: 1 })).toBe(false);
    expect(canPlace(map, { x: 4.5, z: 4.5, width: 2, depth: 2 })).toBe(false);
  });

  it('returns null when the goal is fully enclosed', () => {
    const map = openMap(5, 5);
    const goal = { x: 2.5, z: 2.5 };
    for (const [x, z] of [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]]) {
      map.blocked[cellIndex(map, x, z)] = 1;
    }

    expect(findPath(map, { x: 0.5, z: 0.5 }, goal)).toBeNull();
  });

  it('rejects building overlap, blocked terrain, and disconnection of a base route', () => {
    const map = openMap(7, 5);
    map.spawns = [{ x: 0.5, z: 2.5 }, { x: 6.5, z: 2.5 }];
    map.resources.push({ id: 'mine', kind: 'gold', amount: 1000, x: 5.5, z: 2.5 });

    expect(canPlace(map, { x: 2, z: 2, width: 2, depth: 1 })).toBe(true);
    expect(canPlace(map, { x: 2, z: 2, width: 2, depth: 1 }, [{ x: 1.5, z: 2, width: 1, depth: 1 }])).toBe(false);
    map.blocked[cellIndex(map, 2, 2)] = 1;
    expect(canPlace(map, { x: 2.5, z: 2.5, width: 1, depth: 1 })).toBe(false);

    const corridor = openMap(7, 5);
    for (let z = 0; z < corridor.height; z += 1) {
      if (z !== 2) {
        for (let x = 0; x < corridor.width; x += 1) corridor.blocked[cellIndex(corridor, x, z)] = 1;
      }
    }
    corridor.spawns = [{ x: 0.5, z: 2.5 }, { x: 6.5, z: 2.5 }];
    expect(canPlace(corridor, { x: 3.5, z: 2.5, width: 1, depth: 1 })).toBe(false);
  });

  it('uses footprint coordinates as the building center for terrain checks', () => {
    const map = openMap(7, 5);
    map.blocked[cellIndex(map, 1, 1)] = 1;

    expect(canPlace(map, { x: 2, z: 2, width: 2, depth: 2 })).toBe(false);
  });

  it('rejects construction on no-build terrain that remains walkable', () => {
    const map = openMap(5, 5);
    map.noBuild[cellIndex(map, 2, 2)] = 1;

    expect(isWalkable(map, { x: 2.5, z: 2.5 })).toBe(true);
    expect(canPlace(map, { x: 2.5, z: 2.5, width: 1, depth: 1 })).toBe(false);
  });
});
