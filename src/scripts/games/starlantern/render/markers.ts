import type { Game } from '../engine/game';
import { floorOf } from '../engine/dungeon/run';

/** Things worth a marker on the map: unspent event tiles, and traps once they have gone off. */
export type MarkerKind = 'chest' | 'fountain' | 'merchant' | 'altar' | 'elite' | 'vault' | 'key' | 'trap' | 'rescue' | 'glimmer';

/** Text markers used until the event tile art is approved. */
export const MARKER_GLYPH: Record<MarkerKind, string> = {
  chest: '箱', fountain: '泉', merchant: '商', altar: '壇', elite: '★', vault: '庫', key: '鑰', trap: '陷', rescue: '救', glimmer: '憶',
};

/** `waiting`: an opened chest whose gear did not fit and still lies in it (`run.waiting`). */
export interface Marker { kind: MarkerKind; x: number; y: number; waiting?: true }

const LIVE = new Set<string>(['chest', 'fountain', 'merchant', 'altar', 'elite', 'vault', 'key', 'rescue', 'glimmer']);

/**
 * Markers on the cells the party has seen on this floor. Spent things are not marked (the engine turns used fountains,
 * altars, vaults, keys and beaten elites back into floor; an opened chest shows its open tile), except an opened chest
 * whose gear still waits in it, which keeps its marker until the gear is taken. An untriggered trap is never shown; once
 * sprung (its tile turned to floor) it is marked.
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
    const spot = `${game.floor}:${x},${y}`;
    if (t === 'chest' && run.opened.has(spot)) { if (run.waiting[spot]) out.push({ kind: 'chest', x, y, waiting: true }); continue; }
    out.push({ kind: t as MarkerKind, x, y });
  }
  return out;
}
