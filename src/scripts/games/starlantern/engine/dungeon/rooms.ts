import type { ConditionDef } from '../../data/conditions';
import type { FloorMap, Tile } from '../map';
import { posKey } from '../map';
import { pick, type Rng } from '../rng';
import type { Pos } from '../types';
import type { GenFloor } from './gen';

export type RoomKind = 'empty' | 'chest' | 'fountain' | 'trap' | 'merchant' | 'altar' | 'elite' | 'vault';
export interface Content { kind: RoomKind | 'key'; at: Pos; room: number }
type Placed = Exclude<Content['kind'], 'empty'>;

/** Share of ordinary rooms by kind. Elite and vault are capped at one per floor. */
const WEIGHTS: [RoomKind, number][] = [
  ['empty', 35], ['chest', 20], ['fountain', 8], ['trap', 10], ['merchant', 7], ['altar', 8], ['elite', 7], ['vault', 5],
];

const TILE: Record<Placed, Tile> = {
  chest: 'chest', fountain: 'fountain', trap: 'trap', merchant: 'merchant', altar: 'altar', elite: 'elite', vault: 'vault', key: 'key',
};

function rollKind(rng: Rng): RoomKind {
  let r = rng() * WEIGHTS.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of WEIGHTS) { if ((r -= w) < 0) return k; }
  return 'empty';
}

/**
 * Fill the rooms of a generated floor with contents. Never touches the entrance room or the exit room, and only uses
 * plain floor tiles inside rooms, so nothing lands on the entrance, the stairs or a corridor outside a room.
 * The input map is not modified. A fallback floor (no rooms) gets no contents.
 */
export function fillRooms(g: GenFloor, rng: Rng, cond: ConditionDef): { map: FloorMap; contents: Content[] } {
  const map: FloorMap = { ...g.map, tiles: g.map.tiles.map((row) => [...row]), chests: [...g.map.chests] };
  const contents: Content[] = [];
  const candidates = g.rooms.filter((r) => r.id !== g.entranceRoom && r.id !== g.exitRoom);
  if (!candidates.length) return { map, contents };

  const freeCell = (room: number): Pos | null => {
    const r = g.rooms[room];
    const cells: Pos[] = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (map.tiles[y][x] === 'floor') cells.push({ x, y });
    }
    return cells.length ? pick(rng, cells) : null;
  };
  const place = (kind: Placed, room: number): boolean => {
    const at = freeCell(room);
    if (!at) return false;
    map.tiles[at.y][at.x] = TILE[kind];
    if (kind === 'chest') map.chests.push(at);
    contents.push({ kind, at, room });
    return true;
  };
  const placeAnywhere = (kind: Placed) => {
    for (let i = 0; i < 20; i++) if (place(kind, pick(rng, candidates).id)) return;
  };

  let elites = 0, vaults = 0;
  for (const r of candidates) {
    const kind = rollKind(rng);
    if (kind === 'empty') continue;
    if (kind === 'elite' && elites >= 1) continue;
    if (kind === 'vault' && (vaults >= 1 || candidates.length < 2)) continue;
    if (!place(kind, r.id)) continue;
    if (kind === 'elite') elites++;
    if (kind === 'vault') {
      vaults++;
      const others = candidates.filter((c) => c.id !== r.id);
      let keyed = false;
      for (let i = 0; i < 20 && !keyed; i++) keyed = place('key', pick(rng, others).id);
      if (!keyed) { // no spot for a key: drop the vault rather than lock it forever
        const v = contents.findIndex((c) => c.kind === 'vault');
        const at = contents[v].at;
        map.tiles[at.y][at.x] = 'floor';
        contents.splice(v, 1);
        vaults--;
      }
    }
  }

  if (cond.eliteEveryFloor && elites === 0) placeAnywhere('elite');
  const missing = contents.some((c) => c.kind === 'chest') ? 0 : 1;
  for (let i = 0; i < missing + cond.extraChests; i++) placeAnywhere('chest');
  for (let i = 0; i < cond.extraTraps; i++) placeAnywhere('trap');

  return { map, contents };
}
