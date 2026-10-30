import { describe, expect, it } from 'vitest';
import { GATHER_TABLE, GENERIC_TYPES, REGION_WEIGHTS, SPOT_CHANCE, SPOT_OF, type GatherType } from '../../data/gather';
import { CONDITIONS } from '../../data/conditions';
import { rescuesFor } from '../../data/meetings';
import { LEGACY_ENEMY_IDS } from '../../data/monsters';
import { ENEMIES } from '../../data/enemies';
import type { RegionId } from '../../data/regions';
import { mulberry32 } from '../rng';
import { withRosterLive } from '../testing';
import type { Pos } from '../types';
import { genFloor, type GenFloor } from './gen';
import { fillRooms, type Content } from './rooms';
import { floorOf, isBossDepth, newRun, type Run, type RunFloor } from './run';
import { placeGather } from './gather';

/**
 * Gathering plan Task A2 (spec §5.2): the points are placed last, from a stream of their own, only on plain floor in an
 * inner room. Sweeps run the first 40 seeds; GATHER_FULL=1 runs the full thousand (Global Constraints).
 */
const REGION_IDS: RegionId[] = ['mainline', 'blaze', 'frost', 'storm', 'mire', 'shade', 'iron'];
const SEEDS = Array.from({ length: process.env.GATHER_FULL === '1' ? 1000 : 40 }, (_, i) => i);
const DEPTHS = Array.from({ length: 60 }, (_, i) => i + 1);
/** A sweep's time limit: the full thousand seeds (GATHER_FULL=1) take about 25 times the 40. */
const SWEEP_MS = process.env.GATHER_FULL === '1' ? 3_600_000 : 180_000;

/** A run of `seed` in `region`, with points on or off; `extra` sets up the run before any floor is made. */
const runOf = (seed: number, region: RegionId, on: boolean, extra?: (r: Run) => void): Run => {
  const r = newRun(seed, region, 'plain', 1);
  if (on) r.gather = true;
  extra?.(r);
  return r;
};

/** A floor with its points taken away: their cells back to plain floor, their contents gone. */
const stripped = (f: RunFloor): RunFloor => ({
  map: { ...f.map, tiles: f.map.tiles.map((row) => row.map((t) => (t === 'gather' ? 'floor' : t))) },
  contents: f.contents.filter((c) => c.kind !== 'gather'),
});

const points = (f: RunFloor): Content[] => f.contents.filter((c) => c.kind === 'gather');

/** A stream that hands out `values` in order and fails past their end; `used` counts the draws. */
const scripted = (values: number[]) => {
  let i = 0;
  const rng = () => {
    if (i >= values.length) throw new Error(`draw ${i + 1} past the script`);
    return values[i++];
  };
  return { rng, used: () => i };
};

/** The inner rooms of `g` in id order, and their plain floor cells row by row (the order placeGather picks from). */
const innerRooms = (g: GenFloor) => g.rooms.filter((r) => r.id !== g.entranceRoom && r.id !== g.exitRoom).sort((a, b) => a.id - b.id);
const cellsOf = (f: { map: { tiles: string[][] } }, r: GenFloor['rooms'][number]): Pos[] => {
  const out: Pos[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (f.map.tiles[y][x] === 'floor') out.push({ x, y });
  return out;
};

describe('gathering points on the floor (gathering plan Task A2)', () => {
  it('only empty floor in an inner room', () => {
    let placed = 0;
    for (const seed of SEEDS) for (const region of REGION_IDS) {
      const off = runOf(seed, region, false), on = runOf(seed, region, true);
      for (const d of DEPTHS) {
        const before = floorOf(off, d);
        const f = floorOf(on, d);
        const ps = points(f);
        const key = `${seed}:${region}:${d}`;
        expect(ps.length, key).toBeLessThanOrEqual(3);
        const rooms = new Set<number>();
        for (const p of ps) {
          expect(before.map.tiles[p.at.y][p.at.x], key).toBe('floor');
          expect(f.map.tiles[p.at.y][p.at.x], key).toBe('gather');
          expect(rooms.has(p.room), `${key} one point a room`).toBe(false);
          rooms.add(p.room);
        }
        placed += ps.length;
      }
    }
    expect(placed).toBeGreaterThan(SEEDS.length * REGION_IDS.length * DEPTHS.length);
  }, SWEEP_MS);

  it('points sit in inner rooms, one to three a floor with rooms', () => {
    for (const seed of SEEDS.slice(0, 10)) for (const region of REGION_IDS) for (const d of DEPTHS) {
      const g = genFloor(seed, { depth: d, boss: isBossDepth(region, d) });
      const f = fillRooms(g, mulberry32(seed ^ 0x27d4eb2f), CONDITIONS.plain);
      placeGather(f, g, mulberry32(seed + 77), region, d);
      const key = `${seed}:${region}:${d}`;
      const inner = new Set(innerRooms(g).map((r) => r.id));
      const ps = points(f);
      if (inner.size) expect(ps.length, key).toBeGreaterThanOrEqual(1);
      expect(ps.length, key).toBeLessThanOrEqual(3);
      for (const p of ps) {
        expect(inner.has(p.room), key).toBe(true);
        const r = g.rooms.find((x) => x.id === p.room)!;
        expect(p.at.x >= r.x && p.at.x < r.x + r.w && p.at.y >= r.y && p.at.y < r.y + r.h, key).toBe(true);
      }
    }
  }, SWEEP_MS);

  it('the draws in order', () => {
    // a real floor, filled as floorOf fills it
    const seed = 5, depth = 21;
    const g = genFloor(seed, { depth, boss: false });
    const fresh = () => fillRooms(g, mulberry32(seed ^ 0x27d4eb2f), CONDITIONS.plain);
    const inner = innerRooms(g);
    expect(inner.length).toBeGreaterThanOrEqual(3);
    // 1. the count's cuts
    for (const [roll, n] of [[0, 1], [0.2499, 1], [0.25, 2], [0.7499, 2], [0.75, 3], [0.9999, 3]] as const) {
      const f = fresh();
      // each point: room 0, cell 0, kind (main road: one weighted draw), goods 0, rich no
      const script = scripted([roll, ...Array.from({ length: n }, () => [0, 0, 0, 0, 0.99]).flat()]);
      placeGather(f, g, script.rng, 'mainline', depth);
      expect(points(f), `count roll ${roll}`).toHaveLength(n);
      expect(script.used()).toBe(1 + 5 * n);
    }
    // 2. each point: the room by id, the cell row by row, the kind, the goods, rich, the material
    {
      const f = fresh();
      const r0 = inner[0];
      const c0 = cellsOf(f, r0);
      const script = scripted([
        0.1,                                     // one point
        0, (c0.length - 0.5) / c0.length,        // the first room, its last cell
        0.9,                                     // the region's spot roll fails (≥ SPOT_CHANCE)
        0.99999,                                 // mire's weights 1, 4, 5, 0: the very top is fungus, never crystal (weight 0)
        0.6,                                     // randInt(1, 2) → 2
        0.1,                                     // rich
      ]);
      placeGather(f, g, script.rng, 'mire', depth);
      expect(script.used()).toBe(7);
      expect(points(f)).toEqual([{ kind: 'gather', at: c0[c0.length - 1], room: r0.id, gather: { type: 'fungus', item: 'glow-mushroom', qty: 2 + 1 + 2, rich: true } }]);
    }
    {
      const f = fresh();
      const r1 = inner[1];
      const script = scripted([
        0.9,                                       // three points
        1 / inner.length, 0, 0.2, 0, 0.5,          // room inner[1], first cell, the spot (< SPOT_CHANCE), goods 1, not rich
        0, 0, 0.9, 0, 0, 0.9,                      // room inner[0] (inner[1] is taken), first cell, no spot, vein (lowest roll), goods 1, not rich
        0, 0, 0.35, 0.99999, 0.4, 0.15,            // the next room, first cell, no spot at exactly SPOT_CHANCE, crystal (top of blaze), goods 1, not rich at exactly RICH_CHANCE
      ]);
      placeGather(f, g, script.rng, 'blaze', 9);
      expect(script.used()).toBe(1 + 5 + 6 + 6);
      const ps = points(f);
      expect(ps.map((p) => p.room)).toEqual([r1.id, inner[0].id, inner[2].id]);
      expect(ps.map((p) => p.at)).toEqual([cellsOf(fresh(), r1)[0], cellsOf(fresh(), inner[0])[0], cellsOf(fresh(), inner[2])[0]]);
      expect(ps.map((p) => p.gather)).toEqual([
        { type: 'spot', item: 'ember-glass', qty: 1 },
        { type: 'vein', item: 'copper-ore', qty: 1 },        // depth 9: shallow
        { type: 'crystal', item: 'quartz-chip', qty: 1 },
      ]);
    }
    // the main road never rolls for a spot; DEEP_AT is the first deep depth
    for (const [d, item] of [[14, GATHER_TABLE.herb.shallow], [15, GATHER_TABLE.herb.deep]] as const) {
      const f = fresh();
      // main road weights 3, 3, 2, 2: a roll of 0.5 lands on herb
      const script = scripted([0, 0, 0, 0.5, 0, 0.99]);
      placeGather(f, g, script.rng, 'mainline', d);
      expect(script.used()).toBe(6);
      expect(points(f)[0].gather, `depth ${d}`).toEqual({ type: 'herb', item, qty: 1 + Math.floor(d / 20) });
    }
    // the goods: randInt(1, 2) plus the depth's step
    for (const [d, roll, qty] of [[19, 0, 1], [19, 0.5, 2], [20, 0, 2], [40, 0.9, 4], [60, 0.9, 5], [99, 0, 4]] as const) {
      const f = fresh();
      const script = scripted([0, 0, 0, 0, roll, 0.99]);
      placeGather(f, g, script.rng, 'mainline', d);
      expect(points(f)[0].gather!.qty, `depth ${d} roll ${roll}`).toBe(qty);
    }
  });

  it('regions lean their own way', () => {
    const tally = {} as Record<RegionId, Record<GatherType, number>>;
    for (const region of REGION_IDS) tally[region] = { vein: 0, herb: 0, fungus: 0, crystal: 0, spot: 0 };
    for (const seed of SEEDS) for (const region of REGION_IDS) {
      const run = runOf(seed, region, true);
      for (const d of DEPTHS) for (const p of points(floorOf(run, d))) tally[region][p.gather!.type]++;
    }
    for (const region of REGION_IDS) {
      const total = Object.values(tally[region]).reduce((t, n) => t + n, 0);
      const w = REGION_WEIGHTS[region];
      const sum = GENERIC_TYPES.reduce((t, k) => t + w[k], 0);
      const spot = region === 'mainline' ? 0 : SPOT_CHANCE;
      for (const k of GENERIC_TYPES) expect(Math.abs(tally[region][k] / total - (w[k] / sum) * (1 - spot)), `${region} ${k}`).toBeLessThan(0.03);
      expect(Math.abs(tally[region].spot / total - spot), `${region} spot`).toBeLessThan(0.03);
    }
    expect(tally.mire.crystal).toBe(0);
    expect(tally.mainline.spot).toBe(0);
  }, SWEEP_MS);

  it('a spot is its region\'s', () => {
    for (const seed of SEEDS.slice(0, 10)) for (const region of REGION_IDS.slice(1)) {
      const run = runOf(seed, region, true);
      for (const d of DEPTHS) for (const p of points(floorOf(run, d))) {
        if (p.gather!.type === 'spot') expect(p.gather!.item).toBe(SPOT_OF[region as Exclude<RegionId, 'mainline'>]);
      }
    }
  }, SWEEP_MS);

  it('a fallback floor holds none', () => {
    const g = genFloor(1, { depth: 1, boss: false });
    const bare: GenFloor = { ...g, rooms: [] };
    const f = fillRooms(bare, mulberry32(1), CONDITIONS.plain);
    const before = JSON.parse(JSON.stringify(f));
    const script = scripted([]);
    placeGather(f, bare, script.rng, 'blaze', 20);
    expect(script.used()).toBe(0);
    expect(f).toEqual(before);
  });

  it('nothing else moves', () => {
    for (const seed of SEEDS) for (const region of REGION_IDS) {
      const off = runOf(seed, region, false), on = runOf(seed, region, true);
      for (const d of DEPTHS) expect(stripped(floorOf(on, d)), `${seed}:${region}:${d}`).toEqual(floorOf(off, d));
    }
  }, SWEEP_MS);

  it('nothing else moves, with rescues, forced glimmers and wardens', () => {
    const recruitedNone = ['hero', 'rin'] as const;
    // the rescue rooms: every region's meetings (in the labyrinth and those that join in town), at their depths
    let rescues = 0, rescuePoints = 0;
    for (const region of REGION_IDS) {
      const due = rescuesFor(region, [...recruitedNone]);
      for (const seed of SEEDS) {
        const make = (on: boolean) => {
          const r = newRun(seed, region, 'plain', 1, due);
          if (on) r.gather = true;
          return r;
        };
        const off = make(false), on = make(true);
        for (const d of Object.keys(due).map(Number)) {
          expect(floorOf(off, d).contents.some((c) => c.kind === 'rescue')).toBe(true);
          expect(stripped(floorOf(on, d)), `${seed}:${region}:${d}`).toEqual(floorOf(off, d));
          rescues++;
          rescuePoints += points(floorOf(on, d)).length;
        }
      }
    }
    expect(rescues).toBeGreaterThan(0);
    expect(rescuePoints).toBeGreaterThan(0);
    // forced glimmers: one or two chains' glimmers on a depth
    let glimmerPoints = 0;
    for (const seed of SEEDS) for (const region of REGION_IDS) for (const d of [2, 7, 16]) {
      const owners = seed % 2 ? (['rin'] as const) : (['rin', 'hero'] as const);
      const make = (on: boolean) => runOf(seed, region, on, (r) => { r.glimmers[d] = [...owners]; });
      const off = make(false), on = make(true);
      expect(floorOf(off, d).contents.filter((c) => c.kind === 'glimmer' && c.owner).length).toBe(owners.length);
      expect(stripped(floorOf(on, d)), `${seed}:${region}:${d}`).toEqual(floorOf(off, d));
      glimmerPoints += points(floorOf(on, d)).length;
    }
    expect(glimmerPoints).toBeGreaterThan(0);
    // live wardens: depths 8, 13, 18 ...
    const roster = Object.keys(ENEMIES).filter((id) => !LEGACY_ENEMY_IDS.includes(id));
    let wardens = 0, wardenPoints = 0;
    withRosterLive(roster, () => {
      for (const seed of SEEDS) for (const region of REGION_IDS) for (const d of [8, 13, 18, 23, 38, 58]) {
        const off = runOf(seed, region, false), on = runOf(seed, region, true);
        if (!floorOf(off, d).contents.some((c) => c.kind === 'warden')) continue;
        expect(stripped(floorOf(on, d)), `${seed}:${region}:${d}`).toEqual(floorOf(off, d));
        wardens++;
        wardenPoints += points(floorOf(on, d)).length;
      }
    });
    expect(wardens).toBeGreaterThan(0);
    expect(wardenPoints).toBeGreaterThan(0);
  }, SWEEP_MS);

  it('the same floor twice', () => {
    for (const seed of SEEDS.slice(0, 10)) for (const region of REGION_IDS) for (const d of DEPTHS) {
      expect(points(floorOf(runOf(seed, region, true), d))).toEqual(points(floorOf(runOf(seed, region, true), d)));
    }
  }, SWEEP_MS);
});
