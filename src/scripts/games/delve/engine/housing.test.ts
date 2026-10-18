import { describe, expect, it } from 'vitest';
import { World } from './world';
import { T, W } from './tiles';
import { ROOM, REASON_ZH, checkRoom, roomReasonsText, scanRooms } from './housing';
import { buildHouse, flatWorld } from './houseFixture';

function world(): World {
  const w = new World(80, 40);
  flatWorld(w, 30);
  return w;
}

describe('housing: checkRoom', () => {
  it('a framed, walled room with door / light / table / chair / bed is valid', () => {
    const w = world();
    buildHouse(w, 10, 24, 8, 5);
    const r = checkRoom(w, 14, 26)!;
    expect(r).not.toBeNull();
    expect(r.reasons).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.size).toBe(8 * 5);
    expect(r.width).toBe(8);
    expect(r.height).toBe(5);
    expect(r.bed).toEqual({ x: 13, y: 28 });
    expect(r.door && r.light && r.table && r.seat).toBe(true);
    expect(r.comfort).toBeGreaterThan(0);
    expect(r.x0).toBe(10); expect(r.y0).toBe(24); expect(r.x1).toBe(17); expect(r.y1).toBe(28);
  });

  it('the same room is found from any interior tile (stable key)', () => {
    const w = world();
    buildHouse(w, 10, 24, 8, 5);
    expect(checkRoom(w, 10, 24)!.key).toBe(checkRoom(w, 17, 28)!.key);
  });

  it('solid tiles have no room', () => {
    const w = world();
    buildHouse(w, 10, 24, 8, 5);
    expect(checkRoom(w, 9, 24)).toBeNull();
  });

  it('missing door → door reason', () => {
    const w = world();
    buildHouse(w, 10, 24, 8, 5, { door: false });
    const r = checkRoom(w, 14, 26)!;
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('door');
  });

  it('a platform in the ceiling counts as an entrance', () => {
    const w = world();
    buildHouse(w, 10, 24, 8, 5, { door: false });
    w.setFg(14, 23, T.PLATFORM);
    expect(checkRoom(w, 14, 26)!.reasons).not.toContain('door');
  });

  it('a hole in the frame → not enclosed (open) and nothing else is reported', () => {
    const w = world();
    buildHouse(w, 10, 24, 8, 5);
    w.setFg(18, 25, T.AIR); // 右牆破洞
    const r = checkRoom(w, 14, 26)!;
    expect(r.reasons).toEqual(['open']);
    expect(r.size).toBeGreaterThan(ROOM.MAX);
  });

  it('an open door still closes the room', () => {
    const w = world();
    buildHouse(w, 10, 24, 8, 5);
    for (let k = 0; k < 3; k++) w.setFg(9, 28 - k, T.DOOR_OPEN);
    expect(checkRoom(w, 14, 26)!.ok).toBe(true);
  });

  it('missing background wall tiles are counted; natural walls do not count', () => {
    const w = world();
    buildHouse(w, 10, 24, 8, 5);
    w.setWall(12, 25, 0);
    w.setWall(13, 25, W.DIRT_WALL);
    const r = checkRoom(w, 14, 26)!;
    expect(r.reasons).toContain('wall');
    expect(r.missingWalls).toBe(2);
  });

  it('every new built wall type counts as a house wall', () => {
    for (const id of [W.PLANK_WALL, W.DARK_PLANK_WALL, W.PALE_PLANK_WALL, W.STONE_BRICK_WALL, W.RED_BRICK_WALL, W.GLASS_WALL, W.PLASTER_WALL]) {
      const w = world();
      buildHouse(w, 10, 24, 8, 5, { wallId: id });
      expect(checkRoom(w, 14, 26)!.ok).toBe(true);
    }
  });

  it('too small / too low / too big', () => {
    const w = world();
    buildHouse(w, 10, 26, 4, 3, { bed: false });
    expect(checkRoom(w, 11, 27)!.reasons).toContain('too_small');
    const w2 = world();
    buildHouse(w2, 10, 27, 12, 2, { door: false });
    expect(checkRoom(w2, 12, 27)!.reasons).toContain('low');
    const w3 = world();
    buildHouse(w3, 5, 14, 20, 15);
    expect(checkRoom(w3, 12, 20)!.reasons).toContain('too_big');
  });

  it('reports each missing furniture requirement', () => {
    const w = world();
    buildHouse(w, 10, 24, 8, 5, { light: false, table: false, chair: false, bed: false });
    const r = checkRoom(w, 14, 26)!;
    expect(r.reasons).toEqual(['light', 'table', 'seat', 'bed']);
  });

  it('workbench counts as a table, sofa / bench / bed-less seat alternatives count as seats', () => {
    const w = world();
    buildHouse(w, 10, 24, 8, 5, { table: false, chair: false, extra: [[1, 4, T.WORKBENCH], [5, 4, T.SOFA_L], [6, 4, T.SOFA_R]] });
    const r = checkRoom(w, 14, 26)!;
    expect(r.table).toBe(true);
    expect(r.seat).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('comfort has diminishing returns for repeated furniture and is capped', () => {
    const w = world();
    buildHouse(w, 10, 24, 8, 5);
    const base = checkRoom(w, 14, 26)!.comfort;
    const w2 = world();
    buildHouse(w2, 10, 24, 8, 5, { extra: [[5, 4, T.CHAIR]] });
    const two = checkRoom(w2, 14, 26)!.comfort;
    expect(two - base).toBeCloseTo(0.5);
    const w3 = world();
    const lots: [number, number, number][] = [];
    for (let k = 0; k < 8; k++) lots.push([k, 0, T.CHANDELIER]);
    buildHouse(w3, 10, 24, 8, 5, { light: false, extra: lots });
    expect(checkRoom(w3, 14, 27)!.comfort).toBeLessThanOrEqual(ROOM.COMFORT_CAP);
  });

  it('pair furniture right halves do not count twice', () => {
    const w = world();
    buildHouse(w, 10, 24, 8, 5);
    const r = checkRoom(w, 14, 26)!;
    expect(r.furniture.get(T.BED_HEAD)).toBe(1);
    expect(r.furniture.has(T.BED_FOOT)).toBe(false);
  });

  it('reason text is zh and lists every reason', () => {
    const w = world();
    buildHouse(w, 10, 24, 8, 5, { door: false, light: false });
    const r = checkRoom(w, 14, 26)!;
    const txt = roomReasonsText(r);
    expect(txt).toContain(REASON_ZH.door);
    expect(txt).toContain(REASON_ZH.light);
  });
});

describe('housing: scanRooms', () => {
  it('finds each room once in a rect (two rooms sharing a wall)', () => {
    const w = world();
    buildHouse(w, 10, 24, 8, 5);
    buildHouse(w, 19, 24, 8, 5); // 共用 x=18 的牆
    const rooms = scanRooms(w, 0, 0, 79, 39);
    expect(rooms.length).toBe(2);
    expect(rooms.every((r) => r.ok)).toBe(true);
    expect(new Set(rooms.map((r) => r.key)).size).toBe(2);
  });

  it('ignores outdoor air without built walls', () => {
    const w = world();
    expect(scanRooms(w, 0, 0, 79, 39)).toEqual([]);
  });

  it('reports invalid rooms too (so the overlay can explain them)', () => {
    const w = world();
    buildHouse(w, 10, 24, 8, 5, { bed: false });
    const rooms = scanRooms(w, 0, 0, 79, 39);
    expect(rooms.length).toBe(1);
    expect(rooms[0].reasons).toEqual(['bed']);
  });
});
