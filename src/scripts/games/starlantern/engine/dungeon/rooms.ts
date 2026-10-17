import type { ConditionDef } from '../../data/conditions';
import { ITEMS } from '../../data/items';
import type { Meetable } from '../../data/meetings';
import type { FloorMap, Tile } from '../map';
import { posKey } from '../map';
import { pick, type Rng } from '../rng';
import type { CharacterId, Pos } from '../types';
import type { GenFloor } from './gen';

export type RoomKind = 'empty' | 'chest' | 'fountain' | 'trap' | 'merchant' | 'altar' | 'elite' | 'vault';
/** `stock` is a merchant's three item ids, drawn once when the floor is filled. */
/** `who` is the companion a `rescue` room holds. */
export interface Content { kind: RoomKind | 'key' | 'rescue'; at: Pos; room: number; stock?: string[]; who?: Meetable }
type Placed = Exclude<Content['kind'], 'empty'>;

/** Share of ordinary rooms by kind. Elite and vault are capped at one per floor. */
const WEIGHTS: [RoomKind, number][] = [
  ['empty', 35], ['chest', 20], ['fountain', 8], ['trap', 10], ['merchant', 7], ['altar', 8], ['elite', 7], ['vault', 5],
];

const TILE: Record<Placed, Tile> = {
  chest: 'chest', fountain: 'fountain', trap: 'trap', merchant: 'merchant', altar: 'altar', elite: 'elite', vault: 'vault', key: 'key', rescue: 'rescue',
};

/** Three distinct buyable items. */
function drawStock(rng: Rng): string[] {
  const pool = Object.values(ITEMS).filter((i) => i.price > 0).map((i) => i.id);
  const out: string[] = [];
  while (out.length < 3 && pool.length) out.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  return out;
}

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
    contents.push(kind === 'merchant' ? { kind, at, room, stock: drawStock(rng) } : { kind, at, room });
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

/**
 * Put a rescue room for `who` on a finished floor. Rooms with nothing in them (never the entrance or exit room) come
 * first, then any other candidate room; the spot is a plain floor tile picked with `rng`. A map without rooms gets the
 * first floor tile, row by row. Only `f` changes, and `rng` should be the rescue's own so nothing else on the floor moves.
 */
export function placeRescue(f: { map: FloorMap; contents: Content[] }, g: GenFloor, rng: Rng, who: Meetable): void {
  const mark = (at: Pos, room: number) => {
    f.map.tiles[at.y][at.x] = 'rescue';
    f.contents.push({ kind: 'rescue', at, room, who });
  };
  const candidates = g.rooms.filter((r) => r.id !== g.entranceRoom && r.id !== g.exitRoom);
  const used = new Set(f.contents.map((c) => c.room));
  for (const tier of [candidates.filter((r) => !used.has(r.id)), candidates]) {
    const rooms = [...tier];
    while (rooms.length) {
      const r = rooms.splice(Math.floor(rng() * rooms.length), 1)[0];
      const cells: Pos[] = [];
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (f.map.tiles[y][x] === 'floor') cells.push({ x, y });
      if (cells.length) { mark(pick(rng, cells), r.id); return; }
    }
  }
  for (let y = 0; y < f.map.height; y++) for (let x = 0; x < f.map.width; x++) {
    if (f.map.tiles[y][x] === 'floor') { mark({ x, y }, 0); return; }
  }
}
