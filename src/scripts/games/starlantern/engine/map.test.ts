import { describe, it, expect } from 'vitest';
import { parseFloor, step, reveal, reachable, posKey, tileAt } from './map';
import { FLOORS } from '../data/floors';

const SMALL = ['#####', '#E.T#', '#D#>#', '#####'];

describe('parseFloor', () => {
  it('reads tiles and landmarks', () => {
    const m = parseFloor(SMALL);
    expect([m.width, m.height]).toEqual([5, 4]);
    expect(m.entrance).toEqual({ x: 1, y: 1 });
    expect(m.down).toEqual({ x: 3, y: 2 });
    expect(m.up).toBeNull();
    expect(m.chests).toEqual([{ x: 3, y: 1 }]);
    expect(m.tiles[2][1]).toBe('door');
  });
  it('rejects ragged rows, unknown glyphs and missing or duplicate entrances', () => {
    expect(() => parseFloor(['###', '#E'])).toThrow(/width/);
    expect(() => parseFloor(['#E?#'])).toThrow(/unknown/);
    expect(() => parseFloor(['#..#'])).toThrow(/entrance/);
    expect(() => parseFloor(['#EE#'])).toThrow(/entrance/);
  });
});

describe('step', () => {
  const m = parseFloor(SMALL);
  it('moves onto open tiles, doors included', () => {
    expect(step(m, { x: 1, y: 1 }, 'right')).toEqual({ pos: { x: 2, y: 1 }, moved: true, tile: 'floor' });
    expect(step(m, { x: 1, y: 1 }, 'down')).toEqual({ pos: { x: 1, y: 2 }, moved: true, tile: 'door' });
  });
  it('is blocked by walls and the map edge', () => {
    expect(step(m, { x: 1, y: 1 }, 'up')).toEqual({ pos: { x: 1, y: 1 }, moved: false, tile: 'entrance' });
    expect(tileAt(m, { x: -1, y: 0 })).toBe('wall');
  });
});

describe('reveal', () => {
  const m = parseFloor(SMALL);
  it('adds the 3x3 block around the position without duplicates', () => {
    const a = reveal([], m, { x: 1, y: 1 });
    expect(a).toHaveLength(9);
    expect(reveal(a, m, { x: 1, y: 1 })).toHaveLength(9);
  });
  it('clips at the map edge', () => {
    expect(reveal([], m, { x: 0, y: 0 })).toHaveLength(4);
  });
});

describe('shipped floors', () => {
  const maps = FLOORS.map((f) => parseFloor(f.rows));
  it('all parse and have one chest entry per T', () => {
    maps.forEach((m, i) => expect(m.chests.length).toBe(FLOORS[i].chestLoot.length));
  });
  it('connect the entrance to every landmark', () => {
    maps.forEach((m, i) => {
      const r = reachable(m, m.entrance);
      for (const p of [m.down, m.up, m.boss, ...m.chests]) if (p) expect(r.has(posKey(p)), `floor ${i + 1} ${posKey(p)}`).toBe(true);
    });
  });
  it('have stairs and a boss where the run needs them', () => {
    expect(maps[0].down && maps[1].down).toBeTruthy();
    expect(maps[1].up && maps[2].up).toBeTruthy();
    expect(maps[0].up).toBeNull();
    expect(maps[2].down).toBeNull();
    expect(maps[2].boss).toEqual({ x: 10, y: 11 });
  });
});
