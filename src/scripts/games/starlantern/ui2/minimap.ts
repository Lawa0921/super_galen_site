import { CONDITIONS } from '../data/conditions';
import type { Game } from '../engine/game';
import { fogState } from '../render/fog';
import { markersOf } from '../render/markers';

export const MINIMAP_W = 120;
export const MINIMAP_H = 88;
/** Room left around the floor inside the canvas. */
const PAD = 3;

/** The part of the 2D context the minimap uses (tests pass a recorder). */
export type Minimap2D = Pick<CanvasRenderingContext2D, 'fillStyle' | 'fillRect' | 'clearRect'>;

export const MINIMAP_COLORS = {
  bg: 'rgba(6, 8, 18, 0.78)',
  floor: '#cdbf9c',
  floorMemory: '#5f5848',
  wall: '#7c8196',
  wallMemory: '#30334a',
  entrance: '#90be6d',
  stairs: '#5fc8ec',
  boss: '#e2463a',
  event: '#f2c94c',
  trap: '#ff7a6b',
  /** A gathering point (gathering spec §10.1), gold when rich: the map glyph's own colours. */
  gather: '#8fd18b',
  gatherRich: '#e8c46a',
  party: '#ffffff',
} as const;

/** Cell size and offset that fit a floor of `w`×`h` cells inside the canvas, centred; whole pixels when they fit. */
export function minimapLayout(w: number, h: number): { scale: number; ox: number; oy: number } {
  const fit = Math.min((MINIMAP_W - PAD * 2) / w, (MINIMAP_H - PAD * 2) / h);
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  return { scale, ox: (MINIMAP_W - w * scale) / 2, oy: (MINIMAP_H - h * scale) / 2 };
}

/**
 * The floor in miniature, top right under the menu button: explored cells (in sight bright, remembered dim), walls,
 * stairs, the boss door, discovered events, and the party. Drawn with the canvas 2D API only.
 */
export class Minimap {
  readonly el: HTMLCanvasElement;
  private ctx: Minimap2D | null;

  /** `ctx`: a context to draw into (tests); by default the canvas's own 2D context, when the browser has one. */
  constructor(ctx?: Minimap2D | null) {
    this.el = document.createElement('canvas');
    this.el.className = 'slx-minimap';
    this.el.width = MINIMAP_W;
    this.el.height = MINIMAP_H;
    this.el.setAttribute('aria-hidden', 'true');
    if (ctx !== undefined) this.ctx = ctx;
    else {
      try { this.ctx = this.el.getContext('2d'); } catch { this.ctx = null; }
    }
  }

  draw(game: Game): void {
    const g = this.ctx;
    const run = game.run;
    if (!g || !run) return;
    const map = game.map();
    const { scale, ox, oy } = minimapLayout(map.width, map.height);
    const sight = CONDITIONS[run.condition].sight;
    const seen = new Set(run.explored[game.floor] ?? []);
    const cell = (x: number, y: number, style: string) => { g.fillStyle = style; g.fillRect(ox + x * scale, oy + y * scale, scale, scale); };
    g.clearRect(0, 0, MINIMAP_W, MINIMAP_H);
    g.fillStyle = MINIMAP_COLORS.bg;
    g.fillRect(0, 0, MINIMAP_W, MINIMAP_H);
    const C = MINIMAP_COLORS;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const state = fogState(seen, game.pos, x, y, sight);
        if (state === 'hidden') continue;
        const wall = map.tiles[y][x] === 'wall';
        cell(x, y, wall ? (state === 'visible' ? C.wall : C.wallMemory) : (state === 'visible' ? C.floor : C.floorMemory));
      }
    }
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!seen.has(`${x},${y}`)) continue;
        const t = map.tiles[y][x];
        if (t === 'down' || t === 'up') cell(x, y, C.stairs);
        else if (t === 'boss') cell(x, y, C.boss);
        else if (t === 'entrance') cell(x, y, C.entrance);
      }
    }
    for (const m of markersOf(game)) {
      cell(m.x, m.y, m.kind === 'trap' ? C.trap : m.kind === 'gather' ? (m.rich ? C.gatherRich : C.gather) : C.event);
    }
    cell(game.pos.x, game.pos.y, C.party);
  }
}
