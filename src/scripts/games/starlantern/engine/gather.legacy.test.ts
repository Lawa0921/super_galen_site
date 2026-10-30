import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RegionId } from '../data/regions';
import type { Tile } from './map';
import { floorOf, newRun } from './dungeon/run';
import type { Content } from './dungeon/rooms';
import { withRosterOnly } from './testing';

/**
 * Gathering plan Task A2 (ruling 8, spec §5.5 item 2): the floors with their points taken away are the roster's floors
 * snapshot (`__fixtures__/roster/floors.before.json`), cell for cell and content for content. Read only: nothing here
 * records it.
 */
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'roster', 'floors.before.json');
const REGION_IDS: RegionId[] = ['mainline', 'blaze', 'frost', 'storm', 'mire', 'shade', 'iron'];
const SEEDS = [1, 2, 3];
const DEPTHS = Array.from({ length: 40 }, (_, i) => i + 1);

/** As engine/floors.snapshot.test.ts writes a cell; a point is never written (it is taken away first). */
const TILE_CODE: Record<Exclude<Tile, 'gather'>, string> = {
  wall: '#', floor: '.', door: 'D', up: '<', down: '>', chest: 'T', entrance: 'E', boss: 'B',
  fountain: 'F', trap: '^', merchant: 'M', altar: 'A', elite: '!', vault: 'V', key: 'K', rescue: 'R', glimmer: '*', warden: 'W',
};

interface FloorShot { tiles: string[]; contents: Content[] }

describe('gathering moves no floor (gathering plan Task A2)', () => {
  it('the floors with their points taken away are the floors as they were', () => {
    const before: Record<string, FloorShot> = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    let placed = 0;
    const now = withRosterOnly([], () => {
      const out: Record<string, FloorShot> = {};
      for (const seed of SEEDS) for (const region of REGION_IDS) {
        const run = newRun(seed, region, 'plain', 1);
        run.gather = true;
        for (const d of DEPTHS) {
          const f = floorOf(run, d);
          placed += f.contents.filter((c) => c.kind === 'gather').length;
          out[`${seed}:${region}:${d}`] = {
            tiles: f.map.tiles.map((row) => row.map((t) => TILE_CODE[t === 'gather' ? 'floor' : t]).join('')),
            contents: JSON.parse(JSON.stringify(f.contents.filter((c) => c.kind !== 'gather'))),
          };
        }
      }
      return out;
    });
    expect(placed).toBeGreaterThan(SEEDS.length * REGION_IDS.length * DEPTHS.length);
    expect(now).toEqual(before);
  });

  it('a run made without gathering has no point', () => {
    for (const seed of SEEDS) for (const region of REGION_IDS) {
      const run = newRun(seed, region, 'plain', 1);
      expect(run.gather).toBeUndefined();
      for (const d of DEPTHS) {
        const f = floorOf(run, d);
        expect(f.contents.some((c) => c.kind === 'gather'), `${seed}:${region}:${d}`).toBe(false);
        expect(f.map.tiles.some((row) => row.includes('gather')), `${seed}:${region}:${d}`).toBe(false);
      }
    }
  });
});
