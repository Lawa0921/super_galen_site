import { describe, expect, it } from 'vitest';
import { createMatch, stepMatch, type Match, type Team } from './engine';
import { botInputs } from './ai';
import { visible } from './map';
import { groundHeight } from './elevation';

/** All-bot matches over several seeds. A bot that keeps asking to walk
 * (`forward`) while no enemy is in sight must actually get somewhere: it may
 * not stay inside a 1.5 m circle for 3 s (wall pushing or path dithering). */
function stalls(team: Team, seed: number) {
  const m: Match = createMatch(team); m.seed = seed; m.actors[0].bot = true;
  const anchor = new Map<number, { x: number; z: number; t: number }>(), found: string[] = [];
  for (let i = 0; i < 60 * 900 && m.phase !== 'match-over'; i++) {
    const inputs = botInputs(m); stepMatch(m, inputs, 1 / 60);
    if (m.phase !== 'live') { anchor.clear(); continue; }
    for (const a of m.actors) {
      const input = inputs[a.id] ?? {};
      const engaged = m.actors.some(e => e.team !== a.team && e.hp > 0 && visible(a, e, m.smokes));
      if (a.hp <= 0 || input.forward !== 1 || engaged) { anchor.delete(a.id); continue; }
      const at = anchor.get(a.id);
      if (!at || Math.hypot(at.x - a.x, at.z - a.z) > 1.5) { anchor.set(a.id, { x: a.x, z: a.z, t: m.time }); continue; }
      if (m.time - at.t > 3) { found.push(`${team}/${seed} r${m.round} ${a.name} @${a.x.toFixed(1)},${a.z.toFixed(1)}`); anchor.delete(a.id); }
    }
  }
  return found;
}
/** Walking bots whose objective did not change must not turn back on themselves
 * (the replan-every-1.5 s path flip between two near-equal detours). */
function reversals(team: Team, seed: number) {
  const m: Match = createMatch(team); m.seed = seed; m.actors[0].bot = true;
  const heading = new Map<number, { x: number; z: number; t: number }>(), calm = new Map<number, number>(), found: string[] = [];
  let bomb = '', bombAt = 0;
  for (let i = 0; i < 60 * 900 && m.phase !== 'match-over'; i++) {
    const inputs = botInputs(m); stepMatch(m, inputs, 1 / 60);
    const state = `${m.round}:${m.bomb.carrier}:${m.bomb.planted}`;
    if (state !== bomb) { bomb = state; bombAt = m.time; }
    if (m.phase !== 'live') { heading.clear(); continue; }
    for (const a of m.actors) {
      const input = inputs[a.id] ?? {}, speed = Math.hypot(a.vx, a.vz);
      const engaged = m.actors.some(e => e.team !== a.team && e.hp > 0 && visible(a, e, m.smokes));
      if (a.hp <= 0 || input.forward !== 1 || engaged) { heading.delete(a.id); calm.set(a.id, m.time); continue; }
      if (speed < 2) continue;
      const last = heading.get(a.id), quiet = m.time - Math.max(bombAt, calm.get(a.id) ?? 0) > 1;
      if (last && quiet && m.time - last.t < .6 && (a.vx * last.x + a.vz * last.z) / speed < -.5) found.push(`${team}/${seed} r${m.round} ${a.name} @${a.x.toFixed(1)},${a.z.toFixed(1)}`);
      heading.set(a.id, { x: a.vx / speed, z: a.vz / speed, t: m.time });
    }
  }
  return found;
}

describe('bot navigation does not stall', () => {
  it('a B-site flanker clears the final terrace stair without a container detour U-turn', () => {
    const m = createMatch('attack'); m.seed = 971; m.round = 2; m.phase = 'live'; m.timer = 100;
    const flanker = m.actors[1];
    for (const a of m.actors) {
      a.bot = a.id === flanker.id;
      if (a.team === 'defend') { a.x = 0; a.z = 0; }
    }
    m.actors[2].hp = 0; m.bomb.carrier = 0;
    let reachedStair = false, movedWest = false, turnedBackEast = false, clearedContainer = false;
    for (let frame = 0; frame < 60 * 20; frame++) {
      const input = botInputs(m)[flanker.id] ?? {};
      if (flanker.x > 17 && flanker.z < 2) reachedStair = true;
      if (reachedStair && input.forward === 1 && Number.isFinite(input.yaw)) {
        const heading = -Math.sin(input.yaw!);
        if (heading < -.45) movedWest = true;
        if (movedWest && heading > .45) turnedBackEast = true;
      }
      stepMatch(m, { [flanker.id]: input }, 1 / 60);
      if (reachedStair && flanker.z < -4) { clearedContainer = true; break; }
    }
    expect(reachedStair).toBe(true);
    expect(clearedContainer).toBe(true);
    expect(turnedBackEast).toBe(false);
  });
  it('no walking bot stays in one spot for 3 s in full bot matches (A and B, both sides)', () => {
    const found: string[] = [];
    for (const team of ['attack', 'defend'] as const) for (const seed of [971, 7919, 15838, 104729, 31337]) found.push(...stalls(team, seed));
    expect(found).toEqual([]);
  }, 120_000);
  it('walking bots do not turn back while their objective is unchanged', () => {
    const found: string[] = [];
    for (const team of ['attack', 'defend'] as const) for (const seed of [971, 7919, 15838, 104729, 31337]) found.push(...reversals(team, seed));
    expect(found).toEqual([]);
  }, 120_000);
  it('a B-site flanker that went back for a dropped bomb does not resume the terrace flank', () => {
    const m = createMatch('attack'); m.round = 2; m.phase = 'live'; m.timer = 100;
    for (const a of m.actors) { a.bot = true; if (a.team === 'defend') { a.x = 0; a.z = 0; } }
    const flanker = m.actors[1]; Object.assign(flanker, { x: 19, z: 18, y: groundHeight(19, 18) });
    let input = botInputs(m)[1];
    expect(input.forward).toBe(1);
    // The carrier dies mid-map: the flanker turns to recover the bomb...
    m.bomb.carrier = null; m.bomb.x = 5; m.bomb.z = 10; m.actors[0].hp = 0;
    input = botInputs(m)[1];
    // ...and once someone else picks it up, it keeps covering the site instead of
    // walking back up the stairs it just left.
    m.bomb.carrier = 2;
    input = botInputs(m)[1];
    const heading = { x: -Math.sin(input.yaw!), z: -Math.cos(input.yaw!) };
    expect(heading.z).toBeLessThan(0);
  });
});
