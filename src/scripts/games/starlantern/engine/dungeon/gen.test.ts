import { describe, it, expect } from 'vitest';
import { genFloor, type GenFloor } from './gen';
import { reachable, posKey, DELTA, tileAt, type FloorMap } from '../map';
import type { Pos } from '../types';

const center = (r: { x: number; y: number; w: number; h: number }): Pos => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

/** Tile-path distances from `from` to every passable tile (doors count as passable). */
function dists(map: FloorMap, from: Pos): Map<string, number> {
  const d = new Map([[posKey(from), 0]]);
  const q = [from];
  while (q.length) {
    const p = q.shift()!;
    for (const v of Object.values(DELTA)) {
      const n = { x: p.x + v.x, y: p.y + v.y };
      if (tileAt(map, n) === 'wall' || d.has(posKey(n))) continue;
      d.set(posKey(n), d.get(posKey(p))! + 1);
      q.push(n);
    }
  }
  return d;
}

describe('genFloor', () => {
  it('size grows with depth', () => {
    const a = genFloor(5, { depth: 1, boss: false }).map;
    expect(a.width).toBeGreaterThanOrEqual(21);
    expect(a.width).toBeLessThanOrEqual(23);
    expect(a.height).toBeGreaterThanOrEqual(15);
    expect(a.height).toBeLessThanOrEqual(17);
    expect(genFloor(5, { depth: 20, boss: false }).map.width).toBeGreaterThanOrEqual(25);
  });

  it('same seed, same floor', () => {
    const a = genFloor(42, { depth: 3, boss: false });
    const b = genFloor(42, { depth: 3, boss: false });
    expect(a.map.tiles).toEqual(b.map.tiles);
    expect(genFloor(43, { depth: 3, boss: false }).map.tiles).not.toEqual(a.map.tiles);
  });

  it('1000 seeds all reachable', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      for (let depth = 1; depth <= 6; depth++) {
        const boss = depth % 3 === 0;
        const t0 = performance.now();
        const g = genFloor(seed, { depth, boss });
        expect(performance.now() - t0).toBeLessThan(50);
        const seen = reachable(g.map, g.map.entrance);
        expect(g.rooms.length, `fallback used seed ${seed} depth ${depth}`).toBeGreaterThan(0);
        const goal = boss ? g.map.boss : g.map.down;
        expect(goal).not.toBeNull();
        expect(seen.has(posKey(goal!))).toBe(true);
        for (const c of g.map.chests) expect(seen.has(posKey(c))).toBe(true);
        expect(g.map.up).toBeNull();
      }
    }
  }, 60000);

  it('rooms are 6 to 10 and do not overlap', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { rooms } = genFloor(seed, { depth: 1 + (seed % 6), boss: false });
      expect(rooms.length).toBeGreaterThanOrEqual(6);
      expect(rooms.length).toBeLessThanOrEqual(10);
      for (const a of rooms) for (const b of rooms) {
        if (a.id >= b.id) continue;
        const apart = a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x || a.y + a.h + 1 <= b.y || b.y + b.h + 1 <= a.y;
        expect(apart, `rooms ${a.id}/${b.id} seed ${seed}`).toBe(true);
      }
    }
  });

  it('entrance and exit are far apart', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g: GenFloor = genFloor(seed, { depth: 1 + (seed % 6), boss: seed % 2 === 0 });
      const exit = g.map.boss ?? g.map.down!;
      expect(g.entranceRoom).not.toBe(g.exitRoom);
      expect(g.map.entrance).toEqual(center(g.rooms[g.entranceRoom]));
      expect(exit).toEqual(center(g.rooms[g.exitRoom]));
      let diameter = 0;
      for (const a of g.rooms) {
        const d = dists(g.map, center(a));
        for (const b of g.rooms) diameter = Math.max(diameter, d.get(posKey(center(b)))!);
      }
      const actual = dists(g.map, g.map.entrance).get(posKey(exit))!;
      expect(actual).toBeGreaterThanOrEqual(diameter * 0.7);
    }
  });

  it('boss floor has a door before the boss room', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = genFloor(seed, { depth: 3, boss: true });
      expect(g.map.boss).not.toBeNull();
      expect(g.map.down).toBeNull();
      const room = g.rooms[g.exitRoom];
      const doors: Pos[] = [];
      g.map.tiles.forEach((row, y) => row.forEach((t, x) => { if (t === 'door') doors.push({ x, y }); }));
      expect(doors.length).toBe(1);
      // Blocking the door must cut the boss off from the entrance.
      const blocked: FloorMap = { ...g.map, tiles: g.map.tiles.map(r => [...r]) };
      blocked.tiles[doors[0].y][doors[0].x] = 'wall';
      expect(reachable(blocked, g.map.entrance).has(posKey(g.map.boss!))).toBe(false);
      // The door touches the boss room.
      const adj = Object.values(DELTA).some(v => {
        const p = { x: doors[0].x + v.x, y: doors[0].y + v.y };
        return p.x >= room.x && p.x < room.x + room.w && p.y >= room.y && p.y < room.y + room.h;
      });
      expect(adj).toBe(true);
    }
  });

  it('non-boss floors have no door and a down stair', () => {
    const g = genFloor(9, { depth: 2, boss: false });
    expect(g.map.boss).toBeNull();
    expect(g.map.down).not.toBeNull();
    expect(g.map.tiles.flat().includes('door')).toBe(false);
  });
});
