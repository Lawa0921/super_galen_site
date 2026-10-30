import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RegionId } from '../data/regions';
import { floorOf, newRun } from './dungeon/run';
import { withRosterOnly } from './testing';

/**
 * Gathering plan Task A2 (ruling 8): where every point lands, pinned. Seeds 1-3 × the seven regions × depths 1-40 (a run
 * with no rescue rooms, so the v6 meeting rooms never move it), each point's cell, room, kind, material, goods and rich.
 * Recorded once in Task A2 with GATHER_RECORD=1 and never again; a missing fixture fails.
 */
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'gather', 'points.json');
const REGION_IDS: RegionId[] = ['mainline', 'blaze', 'frost', 'storm', 'mire', 'shade', 'iron'];
const SEEDS = [1, 2, 3];
const DEPTHS = Array.from({ length: 40 }, (_, i) => i + 1);

interface Point { at: string; room: number; type: string; item: string; qty: number; rich: boolean }

function allPoints(): Record<string, Point[]> {
  const out: Record<string, Point[]> = {};
  for (const seed of SEEDS) for (const region of REGION_IDS) {
    const run = newRun(seed, region, 'plain', 1);
    run.gather = true;
    for (const d of DEPTHS) {
      out[`${seed}:${region}:${d}`] = floorOf(run, d).contents.filter((c) => c.kind === 'gather').map((c) => ({
        at: `${c.at.x},${c.at.y}`, room: c.room, type: c.gather!.type, item: c.gather!.item, qty: c.gather!.qty, rich: c.gather!.rich === true,
      }));
    }
  }
  return out;
}

describe('gathering points pinned (gathering plan Task A2)', () => {
  it('every point where it was placed', () => {
    const now = withRosterOnly([], allPoints);
    if (process.env.GATHER_RECORD === '1') {
      mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, `${JSON.stringify(now)}\n`);
    }
    expect(existsSync(FIXTURE), `${FIXTURE} (GATHER_RECORD=1)`).toBe(true);
    expect(Object.values(now).flat().length).toBeGreaterThan(SEEDS.length * REGION_IDS.length * DEPTHS.length);
    expect(now).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')));
  });
});
