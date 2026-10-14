import type { Pos } from './types';

export type Tile = 'wall' | 'floor' | 'door' | 'up' | 'down' | 'chest' | 'entrance' | 'boss';
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface FloorMap {
  width: number; height: number; tiles: Tile[][];
  entrance: Pos; up: Pos | null; down: Pos | null; boss: Pos | null; chests: Pos[];
}

const GLYPHS: Record<string, Tile> = { '#': 'wall', '.': 'floor', D: 'door', '<': 'up', '>': 'down', T: 'chest', E: 'entrance', B: 'boss' };
export const DELTA: Record<Dir, Pos> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

export const posKey = (p: Pos): string => `${p.x},${p.y}`;

export function parseFloor(rows: readonly string[]): FloorMap {
  const width = rows[0]?.length ?? 0;
  let entrance: Pos | null = null;
  let up: Pos | null = null, down: Pos | null = null, boss: Pos | null = null;
  const chests: Pos[] = [];
  const tiles = rows.map((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} width ${row.length} != ${width}`);
    return [...row].map((ch, x) => {
      const t = GLYPHS[ch];
      if (!t) throw new Error(`unknown glyph '${ch}' at ${x},${y}`);
      if (t === 'entrance') {
        if (entrance) throw new Error('more than one entrance');
        entrance = { x, y };
      }
      if (t === 'up') up = { x, y };
      if (t === 'down') down = { x, y };
      if (t === 'boss') boss = { x, y };
      if (t === 'chest') chests.push({ x, y });
      return t;
    });
  });
  if (!entrance) throw new Error('floor has no entrance');
  return { width, height: rows.length, tiles, entrance, up, down, boss, chests };
}

export function tileAt(map: FloorMap, p: Pos): Tile {
  return map.tiles[p.y]?.[p.x] ?? 'wall';
}

export function step(map: FloorMap, pos: Pos, dir: Dir): { pos: Pos; moved: boolean; tile: Tile } {
  const next = { x: pos.x + DELTA[dir].x, y: pos.y + DELTA[dir].y };
  const t = tileAt(map, next);
  if (t === 'wall') return { pos, moved: false, tile: tileAt(map, pos) };
  return { pos: next, moved: true, tile: t };
}

export function reveal(explored: readonly string[], map: FloorMap, pos: Pos, radius = 1): string[] {
  const set = new Set(explored);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = pos.x + dx, y = pos.y + dy;
      if (x >= 0 && y >= 0 && x < map.width && y < map.height) set.add(posKey({ x, y }));
    }
  }
  return [...set];
}

export function reachable(map: FloorMap, from: Pos): Set<string> {
  const seen = new Set([posKey(from)]);
  const queue = [from];
  while (queue.length) {
    const p = queue.shift()!;
    for (const d of Object.values(DELTA)) {
      const n = { x: p.x + d.x, y: p.y + d.y };
      if (tileAt(map, n) === 'wall' || seen.has(posKey(n))) continue;
      seen.add(posKey(n));
      queue.push(n);
    }
  }
  return seen;
}
