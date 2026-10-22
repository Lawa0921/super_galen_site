import { describe, expect, it } from 'vitest';
import { createMatch, stepMatch, spawnGrenade, type Match } from './engine';
import { selectViewActor, SpectatorState } from './spectator';

function liveMatch() {
  const m = createMatch('attack'); m.phase = 'live'; m.timer = 100;
  m.actors.forEach((p, i) => Object.assign(p, { x: 20, z: 18 + i }));
  Object.assign(m.actors[0], { x: 4, z: 20, hp: 8 }); Object.assign(m.actors[3], { x: 4, z: 14 });
  return m;
}
function kill(m: Match) { stepMatch(m, { 3: { fire: true, yaw: Math.PI, pitch: 0 } }, 1 / 60); expect(m.actors[0].hp).toBe(0); }

describe('death and teammate spectating', () => {
  it('captures a real lethal shot once, holds the death view on simulation time, then follows an ally', () => {
    const m = liveMatch(), s = new SpectatorState(); s.update(m); kill(m);
    expect(s.update(m)).toBe('died'); expect(s.viewId).toBe(0);
    expect(s.death).toEqual({ killerId: 3, killerName: 'VIPER', weapon: 'pistol', head: true });
    m.shots = []; expect(s.update(m)).toBe('none'); expect(s.viewId).toBe(0);
    m.time += .64; s.update(m); expect(s.viewId).toBe(0);
    m.time += .02; s.update(m); expect(s.viewId).toBe(1); expect(s.death?.killerName).toBe('VIPER');
  });
  it('cycles only live teammates, can skip the hold, and switches when the viewed ally dies', () => {
    const m = liveMatch(), s = new SpectatorState(); s.update(m); kill(m); s.update(m);
    expect(s.available(m)).toBe(2); expect(s.cycle(m, 1)).toBe(true); expect(s.viewId).toBe(1);
    expect(s.cycle(m, 1)).toBe(true); expect(s.viewId).toBe(2);
    expect(s.cycle(m, 1)).toBe(true); expect(s.viewId).toBe(1);
    expect(s.cycle(m, -1)).toBe(true); expect(s.viewId).toBe(2);
    m.actors[2].hp = 0; s.update(m); expect(s.viewId).toBe(1); expect(s.available(m)).toBe(1);
    expect(s.cycle(m, 1)).toBe(false);
    m.actors[1].hp = 0; s.update(m); expect(s.viewId).toBe(0); expect(s.available(m)).toBe(0);
    expect(selectViewActor(m, 3)).toBe(m.actors[0]);
  });
  it('clears death information on revival, a new round, new match, and leaving', () => {
    const m = liveMatch(), s = new SpectatorState(); s.update(m); kill(m); s.update(m);
    m.actors[0].hp = 100; expect(s.update(m)).toBe('revived'); expect(s.death).toBeNull(); expect(s.viewId).toBe(0);
    m.actors[0].hp = 0; s.update(m); m.round++; m.actors[0].hp = 100; s.update(m); expect(s.death).toBeNull();
    expect(s.cycle(m, 1)).toBe(false);
    const next = liveMatch(); s.update(next); expect(s.death).toBeNull(); expect(s.viewId).toBe(0);
    s.update(null); expect(s.viewId).toBeNull(); expect(s.death).toBeNull();
  });
  it('ignores stale lethal shots and handles an already-dead snapshot without replaying a death cue', () => {
    const m = liveMatch(), s = new SpectatorState(); s.update(m); kill(m); m.shots[0].round = 0;
    m.deaths = m.deaths.map(d => ({ ...d, shot: { ...d.shot, round: 0 } }));
    expect(s.update(m)).toBe('died'); expect(s.death).toBeNull();
    const joined = new SpectatorState(); expect(joined.update(m)).toBe('none'); expect(joined.viewId).toBe(1); expect(joined.death).toBeNull();
    m.phase = 'round-over'; expect(joined.cycle(m, 1)).toBe(false);
  });
  it('retains the actual killer after transient shots expire and uses the original death time for the hold', () => {
    const m = liveMatch(), s = new SpectatorState(); s.update(m); kill(m);
    for (let i = 0; i < 30; i++) stepMatch(m, {}, 1 / 60);
    expect(m.shots).toEqual([]); expect(s.update(m)).toBe('died'); expect(s.viewId).toBe(0);
    expect(s.death).toEqual({ killerId: 3, killerName: 'VIPER', weapon: 'pistol', head: true });
    for (let i = 0; i < 10; i++) stepMatch(m, {}, 1 / 60);
    expect(s.update(m)).toBe('none'); expect(s.viewId).toBe(1);
  });
  it('restores a dead snapshot summary without replaying a cue or adding a new death hold', () => {
    const m = liveMatch(); kill(m);
    for (let i = 0; i < 60; i++) stepMatch(m, {}, 1 / 60);
    const s = new SpectatorState(); expect(s.update(m)).toBe('none'); expect(s.viewId).toBe(1);
    expect(s.death).toEqual({ killerId: 3, killerName: 'VIPER', weapon: 'pistol', head: true });
    expect(s.cycle(m, 1)).toBe(true); expect(s.viewId).toBe(2);
    expect(s.update(m)).toBe('none'); expect(s.death?.killerId).toBe(3);
    m.round++; m.phase = 'buy'; m.actors[0].hp = 100; s.update(m);
    expect(s.death).toBeNull(); expect(s.viewId).toBe(0);
  });
  it('honors an explicit death hold but never lets a live player view another actor or a spectator view an enemy', () => {
    const m = liveMatch(); expect(selectViewActor(m, 2)).toBe(m.actors[0]); m.actors[0].hp = 0;
    expect(selectViewActor(m, 0)).toBe(m.actors[0]); expect(selectViewActor(m, 2)).toBe(m.actors[2]);
    expect(selectViewActor(m, 4)).toBe(m.actors[1]); m.actors[1].hp = 0;
    expect(selectViewActor(m, 1)).toBe(m.actors[2]);
  });
  it('names an HE grenade as the cause of a blast death', () => {
    const m = liveMatch(), s = new SpectatorState(); s.update(m);
    spawnGrenade(m, m.actors[3], 'he', [4, .06, 20.5], [0, 0, 0]);
    for (let i = 0; i < 120 && m.actors[0].hp > 0; i++) stepMatch(m, {}, 1 / 60);
    expect(s.update(m)).toBe('died');
    expect(s.death).toMatchObject({ killerId: 3, killerName: 'VIPER', grenade: 'he', head: false });
  });
});
