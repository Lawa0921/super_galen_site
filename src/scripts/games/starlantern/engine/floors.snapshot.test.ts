import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RegionId } from '../data/regions';
import type { Tile } from './map';
import { floorOf, newRun } from './dungeon/run';
import type { Content } from './dungeon/rooms';

/**
 * Roster plan Task A0: every floor (seeds 1-3 × the seven regions × depths 1-40) as it was before the roster. Recorded
 * once with FLOORS_RECORD=1 and never again by the roster plan: from Task A4 it guards that a warden room moves nothing
 * else on a floor. Tiles are one letter each (TILE_CODE), so the fixture stays small.
 */
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'roster', 'floors.before.json');
const REGION_IDS: RegionId[] = ['mainline', 'blaze', 'frost', 'storm', 'mire', 'shade', 'iron'];
const SEEDS = [1, 2, 3];
const DEPTHS = Array.from({ length: 40 }, (_, i) => i + 1);

const TILE_CODE: Record<Tile, string> = {
  wall: '#', floor: '.', door: 'D', up: '<', down: '>', chest: 'T', entrance: 'E', boss: 'B',
  fountain: 'F', trap: '^', merchant: 'M', altar: 'A', elite: '!', vault: 'V', key: 'K', rescue: 'R', glimmer: '*',
};

interface FloorShot { tiles: string[]; contents: Content[] }

const floorKey = (seed: number, region: RegionId, depth: number): string => `${seed}:${region}:${depth}`;

function shotOf(seed: number, region: RegionId, depth: number): FloorShot {
  const f = floorOf(newRun(seed, region, 'plain', 1), depth);
  return { tiles: f.map.tiles.map((row) => row.map((t) => TILE_CODE[t]).join('')), contents: JSON.parse(JSON.stringify(f.contents)) };
}

function allShots(): Record<string, FloorShot> {
  const out: Record<string, FloorShot> = {};
  for (const seed of SEEDS) for (const region of REGION_IDS) for (const d of DEPTHS) out[floorKey(seed, region, d)] = shotOf(seed, region, d);
  return out;
}

function readFloorsBefore(): Record<string, FloorShot> {
  return JSON.parse(readFileSync(FIXTURE, 'utf8'));
}

describe('roster floors snapshot', () => {
  it('the floors as they were before the roster', () => {
    const now = allShots();
    if (process.env.FLOORS_RECORD === '1') {
      mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, JSON.stringify(now) + '\n');
    }
    // A missing fixture fails here: it is never skipped.
    expect(existsSync(FIXTURE), FIXTURE).toBe(true);
    expect(now).toEqual(readFloorsBefore());
  });
});
