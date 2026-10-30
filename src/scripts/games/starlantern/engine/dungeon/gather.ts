import { COUNT_CUTS, DEEP_AT, GATHER_TABLE, GENERIC_TYPES, REGION_WEIGHTS, RICH_BONUS, RICH_CHANCE, SPOT_CHANCE, SPOT_OF, gatherQty, type GatherType } from '../../data/gather';
import type { RegionId } from '../../data/regions';
import type { FloorMap } from '../map';
import { pick, randInt, type Rng } from '../rng';
import type { Pos } from '../types';
import type { GenFloor } from './gen';
import type { Content } from './rooms';

/** One weighted draw (as engine/guild.ts's): the index whose share of the total holds the roll; a weight of 0 never wins. */
function pickWeighted(rng: Rng, weights: readonly number[]): number {
  let roll = rng() * weights.reduce((t, w) => t + w, 0);
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue;
    if (roll < weights[i]) return i;
    roll -= weights[i];
  }
  return weights.findLastIndex((w) => w > 0);
}

/** The plain floor cells of a room as they are now, row by row, left to right. */
function floorCells(map: FloorMap, r: GenFloor['rooms'][number]): Pos[] {
  const cells: Pos[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (map.tiles[y][x] === 'floor') cells.push({ x, y });
  return cells;
}

/**
 * Gathering spec §5.2: puts this floor's gathering points, last of all (`floorOf`'s last line), from `rng` alone (the
 * caller's own stream, `GATHER_SALT`). It only turns a plain floor cell of an inner room (never the entrance or exit room)
 * into `'gather'` and adds its content; nothing placed before it moves. A floor with no rooms (the fallback) gets none and
 * draws nothing. The draws, in this order:
 *   1. the count: one roll; below COUNT_CUTS[0] one point, below COUNT_CUTS[1] two, else three;
 *   2. for each point:
 *      2.1 the room: among inner rooms with no point yet and at least one plain floor cell, by room id; none left, stop;
 *      2.2 the cell: among that room's plain floor cells, row by row, left to right;
 *      2.3 the kind: the main road draws its weights; a region first rolls SPOT_CHANCE for its spot, else draws its weights;
 *      2.4 the goods: randInt(1, 2) and the depth (`gatherQty`);
 *      2.5 rich: one roll against RICH_CHANCE, RICH_BONUS more goods;
 *      2.6 the material: the region's spot, or the kind's shallow or (from DEEP_AT) deep material (nothing drawn).
 */
export function placeGather(f: { map: FloorMap; contents: Content[] }, g: GenFloor, rng: Rng, region: RegionId, depth: number): void {
  const inner = g.rooms.filter((r) => r.id !== g.entranceRoom && r.id !== g.exitRoom).sort((a, b) => a.id - b.id);
  if (!inner.length) return;
  // 1. the count
  const r = rng();
  const count = r < COUNT_CUTS[0] ? 1 : r < COUNT_CUTS[1] ? 2 : 3;
  const used = new Set<number>();
  for (let i = 0; i < count; i++) {
    // 2.1 the room
    const rooms = inner.filter((x) => !used.has(x.id) && floorCells(f.map, x).length > 0);
    if (!rooms.length) return;
    const room = pick(rng, rooms);
    // 2.2 the cell
    const at = pick(rng, floorCells(f.map, room));
    // 2.3 the kind
    const weights = GENERIC_TYPES.map((t) => REGION_WEIGHTS[region][t]);
    const type: GatherType = region !== 'mainline' && rng() < SPOT_CHANCE ? 'spot' : GENERIC_TYPES[pickWeighted(rng, weights)];
    // 2.4 the goods
    let qty = gatherQty(randInt(rng, 1, 2), depth);
    // 2.5 rich
    const rich = rng() < RICH_CHANCE;
    if (rich) qty += RICH_BONUS;
    // 2.6 the material
    const item = type === 'spot' ? SPOT_OF[region as Exclude<RegionId, 'mainline'>] : depth >= DEEP_AT ? GATHER_TABLE[type].deep : GATHER_TABLE[type].shallow;
    used.add(room.id);
    f.map.tiles[at.y][at.x] = 'gather';
    f.contents.push({ kind: 'gather', at, room: room.id, gather: { type, item, qty, ...(rich ? { rich: true as const } : {}) } });
  }
}
