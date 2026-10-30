import type { GatherType } from '../data/gather';
import type { Game } from '../engine/game';
import { floorOf } from '../engine/dungeon/run';
import { visibleGather } from '../engine/gather';

/** Things worth a marker on the map: unspent event tiles, and traps once they have gone off. */
/** `warden`: a warden's room (roster plan B5), drawn as an elite is: the elite's event tile, or its ★. */
/** `gather`: a gathering point (gathering spec §10.1), its glyph by its kind (`GATHER_GLYPH`) until its art is published. */
export type MarkerKind = 'chest' | 'fountain' | 'merchant' | 'altar' | 'elite' | 'vault' | 'key' | 'trap' | 'rescue' | 'glimmer' | 'warden' | 'gather';

/** Text markers used until the event tile art is approved. */
export const MARKER_GLYPH: Record<MarkerKind, string> = {
  chest: '箱', fountain: '泉', merchant: '商', altar: '壇', elite: '★', vault: '庫', key: '鑰', trap: '陷', rescue: '救', glimmer: '憶', warden: '★', gather: '採',
};

/** Gathering spec §0 item 19: a point's text marker by its kind (礦／草／菇／晶, and 採 for a region's spot). */
export const GATHER_GLYPH: Record<GatherType, string> = { vein: '礦', herb: '草', fungus: '菇', crystal: '晶', spot: '採' };

/**
 * `waiting`: an opened chest whose gear did not fit and still lies in it (`run.waiting`). `type` and `rich`: a gathering
 * point's kind, and whether it is rich (drawn gold).
 */
export interface Marker { kind: MarkerKind; x: number; y: number; waiting?: true; type?: GatherType; rich?: true }

const LIVE = new Set<string>(['chest', 'fountain', 'merchant', 'altar', 'elite', 'vault', 'key', 'rescue', 'glimmer', 'warden', 'gather']);

/**
 * Markers on the cells the party has seen on this floor. Spent things are not marked (the engine turns used fountains,
 * altars, vaults, keys and beaten elites back into floor; an opened chest shows its open tile), except an opened chest
 * whose gear still waits in it, which keeps its marker until the gear is taken. An untriggered trap is never shown; once
 * sprung (its tile turned to floor) it is marked. A gathering point is marked until gathered; a shade spot only once the
 * party has spotted it this dive (`visibleGather`, gathering spec §5.3).
 */
export function markersOf(game: Game): Marker[] {
  const run = game.run;
  if (!run) return [];
  const map = game.map();
  const seen = new Set(run.explored[game.floor] ?? []);
  const out: Marker[] = [];
  for (const c of floorOf(run, game.floor).contents) {
    const { x, y } = c.at;
    if (!seen.has(`${x},${y}`)) continue;
    const t = map.tiles[y][x];
    if (c.kind === 'trap') { if (t !== 'trap') out.push({ kind: 'trap', x, y }); continue; }
    if (t !== c.kind || !LIVE.has(t)) continue;
    if (c.kind === 'gather') {
      if (c.gather && visibleGather(run, game.floor, c)) out.push({ kind: 'gather', x, y, type: c.gather.type, ...(c.gather.rich ? { rich: true as const } : {}) });
      continue;
    }
    const spot = `${game.floor}:${x},${y}`;
    if (t === 'chest' && run.opened.has(spot)) { if (run.waiting[spot]) out.push({ kind: 'chest', x, y, waiting: true }); continue; }
    out.push({ kind: t as MarkerKind, x, y });
  }
  return out;
}
