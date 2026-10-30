import { describe, expect, it } from 'vitest';
import { SPOT_OF, type GatherType } from '../data/gather';
import { Game } from '../engine/game';
import { DELTA, type Dir } from '../engine/map';
import { floorOf, type Portal } from '../engine/dungeon/run';
import { constRng, withGatherLive } from '../engine/testing';
import type { Pos } from '../engine/types';
import { GATHER_GLYPH, MARKER_GLYPH, markersOf } from './markers';

type Planted = { type: GatherType; item: string; qty: number; rich?: true };
const VEIN: Planted = { type: 'vein', item: 'copper-ore', qty: 2 };
const SHADE: Planted = { type: 'spot', item: SPOT_OF.shade, qty: 2 };

/** A game departed with gathering on and open (its floors hold points), on `portal`'s first floor. */
function gathering(portal: Portal = { region: 'mainline', condition: 'plain' }): Game {
  return withGatherLive(() => {
    const g = new Game(constRng(0.99), null);
    expect(g.depart(portal, 1)).toEqual({ ok: true });
    expect(g.run!.gather).toBe(true);
    return g;
  }, { open: true });
}

/** Turns plain floor at `at` into a point holding `gather`. */
function plant(g: Game, at: Pos, gather: Planted): void {
  const f = floorOf(g.run!, g.floor);
  expect(f.map.tiles[at.y][at.x]).toBe('floor');
  f.map.tiles[at.y][at.x] = 'gather';
  f.contents.push({ kind: 'gather', at, room: 0, gather: { ...gather } });
}

/** A straight run of `n` plain floor cells from the party (not counting its own), and the way it goes. */
function lane(g: Game, n: number): { dir: Dir; cells: Pos[] } {
  const m = g.map();
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    if (m.tiles[y][x] !== 'floor') continue;
    for (const dir of ['right', 'left', 'down', 'up'] as const) {
      const cells = Array.from({ length: n }, (_, i) => ({ x: x + DELTA[dir].x * (i + 1), y: y + DELTA[dir].y * (i + 1) }));
      if (cells.every((c) => m.tiles[c.y]?.[c.x] === 'floor')) { g.pos = { x, y }; return { dir, cells }; }
    }
  }
  throw new Error('no lane');
}

const see = (g: Game, at: Pos) => { (g.run!.explored[g.floor] ??= []).push(`${at.x},${at.y}`); };
const gatherMarks = (g: Game) => markersOf(g).filter((m) => m.kind === 'gather');
const back: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

describe('gathering points on the map (gathering plan Task B1)', () => {
  it('a point wears its glyph by kind', () => {
    expect(MARKER_GLYPH.gather).toBe('採');
    expect(GATHER_GLYPH).toEqual({ vein: '礦', herb: '草', fungus: '菇', crystal: '晶', spot: '採' });
  });

  it('points are marked once seen', () => {
    const g = gathering();
    const { cells: [, at] } = lane(g, 2);
    g.run!.explored[g.floor] = [];
    plant(g, at, { ...VEIN, rich: true });
    expect(gatherMarks(g)).toEqual([]);   // not seen yet
    see(g, at);
    expect(gatherMarks(g)).toEqual([{ kind: 'gather', x: at.x, y: at.y, type: 'vein', rich: true }]);
    // gathered: the point goes, and its marker with it
    g.pos = at;
    g.encounter = 0;
    expect(g.gather('full').kind).toBe('gathered');
    expect(gatherMarks(g)).toEqual([]);
  });

  it('a plain point is not rich', () => {
    const g = gathering();
    const { cells: [at] } = lane(g, 1);
    plant(g, at, VEIN);
    see(g, at);
    expect(gatherMarks(g)).toEqual([{ kind: 'gather', x: at.x, y: at.y, type: 'vein' }]);
  });

  it('a hidden spot shows once spotted', () => {
    const g = gathering({ region: 'shade', condition: 'plain' });
    const { dir, cells: [near, far] } = lane(g, 2);
    plant(g, far, SHADE);
    see(g, far);
    see(g, near);
    expect(gatherMarks(g)).toEqual([]);   // two steps away: hidden, though the cell is explored
    g.encounter = 0;
    expect(g.move(dir).kind).toBe('moved');   // next to it now
    expect(gatherMarks(g).map((m) => [m.x, m.y])).toEqual([[far.x, far.y]]);
    expect(gatherMarks(g)[0]).toMatchObject({ type: 'spot', spot: 'shade' });   // a land's spot carries its land (its tile, PR E)
    g.encounter = 0;
    expect(g.move(back[dir]).kind).toBe('moved');   // two steps away again: still marked for this dive
    expect(gatherMarks(g)).toHaveLength(1);
  });

  it('in thick fog a hidden spot shows only once stood on', () => {
    const g = gathering({ region: 'shade', condition: 'fog' });
    const { dir, cells: [at] } = lane(g, 1);
    plant(g, at, SHADE);
    g.run!.explored[g.floor] = [`${g.pos.x},${g.pos.y}`];
    expect(gatherMarks(g)).toEqual([]);   // beside it, but fog shows only the party's own cell
    g.encounter = 0;
    expect(g.move(dir).kind).toBe('moved');
    expect(gatherMarks(g)).toHaveLength(1);
  });

  it('off, no marker', () => {
    const off = new Game(constRng(0.99), null);
    off.depart({ region: 'mainline', condition: 'plain' }, 1);
    expect(off.run!.gather).toBeUndefined();
    expect(floorOf(off.run!, 1).contents.some((c) => c.kind === 'gather')).toBe(false);
    const on = gathering();
    // the same run with points: every other marker is the same
    for (const g of [off, on]) {
      const m = g.map();
      g.run!.explored[1] = m.tiles.flatMap((row, y) => row.map((_, x) => `${x},${y}`));
    }
    expect(markersOf(on).filter((m) => m.kind !== 'gather')).toEqual(markersOf(off));
    expect(markersOf(off).some((m) => m.kind === 'gather')).toBe(false);
  });
});
