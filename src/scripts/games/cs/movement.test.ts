import { describe, expect, it } from 'vitest';
import { createMatch, currentSpread, stepMatch, type Input, type Match } from './engine';

const live = () => { const m = createMatch('attack'); m.phase = 'live'; m.actors[0].x = 0; return m; };
const tick = (m: Match, seconds: number, input: Partial<Input> = {}, hz = 120) => {
  for (let i = 0; i < Math.round(seconds * hz); i++) stepMatch(m, { 0: input }, 1 / hz);
};
const speed = (m: Match) => Math.hypot(m.actors[0].vx, m.actors[0].vz);

describe('ground momentum and firing accuracy', () => {
  it('accelerates into movement and carries momentum after key release', () => {
    const m = live(), p = m.actors[0];
    stepMatch(m, { 0: { right: 1 } }, 1 / 120);
    expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(5.3 / 120 * .5);
    tick(m, .4, { right: 1 }); const x = p.x;
    stepMatch(m, {}, 1 / 120);
    expect(p.x).toBeGreaterThan(x); expect(p.moving).toBe(true);
    tick(m, .6); expect(speed(m)).toBe(0); expect(p.moving).toBe(false);
  });
  it('counter-strafing restores accurate fire sooner than releasing the key', () => {
    const release = live(), counter = live();
    for (const m of [release, counter]) tick(m, .4, { right: 1 });
    const runningSpread = currentSpread(release.actors[0]);
    tick(release, .05); tick(counter, .05, { right: -1 });
    expect(speed(counter)).toBeLessThan(speed(release) * .55);
    expect(currentSpread(counter.actors[0])).toBeLessThan(currentSpread(release.actors[0]));
    expect(currentSpread(release.actors[0])).toBeLessThan(runningSpread);
    tick(release, .6); expect(currentSpread(release.actors[0])).toBeLessThan(runningSpread / 2);
  });
  it('normalizes diagonals, distinguishes weapon weight and slow walking', () => {
    const straight = live(), diagonal = live(), heavy = live(), slow = live(); heavy.actors[0].weapon = 'sniper';
    tick(straight, .4, { right: 1 }); tick(diagonal, .4, { right: 1, forward: -1 });
    tick(heavy, .4, { right: 1 }); tick(slow, .4, { right: 1, slow: true });
    expect(speed(diagonal)).toBeCloseTo(speed(straight), 5);
    expect(speed(heavy)).toBeLessThan(speed(straight)); expect(speed(slow)).toBeLessThan(speed(heavy));
  });
  it('retains air momentum without allowing instant midair reversals', () => {
    const m = live(); tick(m, .3, { right: 1 });
    stepMatch(m, { 0: { right: 1, jump: true } }, 1 / 120);
    const before = speed(m); tick(m, .1);
    expect(m.actors[0].y).toBeGreaterThan(0); expect(speed(m)).toBeCloseTo(before, 5);
    tick(m, .1, { right: -1 }); expect(m.actors[0].vx).toBeGreaterThan(0);
  });
  it('clears blocked velocity while allowing sliding along a wall', () => {
    const m = live(), p = m.actors[0]; p.x = 23.63;
    tick(m, .2, { right: 1, forward: 1 });
    expect(p.x).toBeLessThan(23.64); expect(p.vx).toBe(0); expect(p.vz).toBeLessThan(0);
    tick(m, .6, { right: 1 }); expect(p.moving).toBe(false);
  });
  it('resets velocity after death and on a new round', () => {
    const m = live(), p = m.actors[0]; tick(m, .3, { right: 1 }); p.hp = 0;
    stepMatch(m, {}, 1 / 120); expect(speed(m)).toBe(0);
    p.vx = 4; m.phase = 'round-over'; m.timer = .001;
    stepMatch(m, {}, 1 / 120); expect(speed(m)).toBe(0); expect(p.moving).toBe(false);
  });
  it('keeps acceleration distance stable across simulation frequencies', () => {
    const positions = [30, 60, 120, 144].map(hz => { const m = live(); tick(m, .5, { right: 1 }, hz); return m.actors[0].x; });
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(.012);
  });
  it('clears all live state velocity on a late-index last kill, including the final round', () => {
    for (const priorWins of [0, 3]) {
      const m = live(), victim = m.actors[0], shooter = m.actors[3];
      m.scores.defend = priorWins; m.actors[1].hp = m.actors[2].hp = 0;
      Object.assign(victim, { x: 4, z: 20, y: .05, vx: 4, vy: 1, vz: 0, hp: 1, moving: true });
      Object.assign(shooter, { x: 4, z: 14, yaw: Math.PI, vx: 1 });
      stepMatch(m, { 3: { fire: true, aim: true } }, 1 / 120);
      expect(m.phase).toBe(priorWins === 3 ? 'match-over' : 'round-over');
      for (const actor of m.actors) expect([actor.vx, actor.vy, actor.vz, actor.moving]).toEqual([0, 0, 0, false]);
    }
  });
});
