import { describe, expect, it } from 'vitest';
import { createMatch, stepMatch, spawnGrenade, type Match } from './engine';
import { aimThrow, botInputs, siteSmokeTarget } from './ai';
import { launchVelocity, THROW } from './grenades';
import { stepGrenadeBody } from './grenade-physics';
import { MAP } from './map';

const live = () => { const m = createMatch('attack'); m.phase = 'live'; m.timer = 100; return m; };
const park = (m: Match, team: 'attack' | 'defend') => m.actors.filter(a => a.team === team).forEach((a, i) => { a.x = -20 + i * 3; a.z = team === 'attack' ? 26 : -26; });
const run = (m: Match, seconds: number, without: number[] = [], each?: () => void) => {
  for (let i = 0; i < seconds * 60; i++) { const inputs = botInputs(m); for (const id of without) delete inputs[id]; stepMatch(m, inputs, 1 / 60); each?.(); }
};

describe('bot throw aiming', () => {
  it('a smoke settles on target in the open after its bounces and roll', () => {
    for (const distance of [8, 14, 20]) {
      const eye = [5, 1.58, 27], target = [5, 0, 27 - distance], aim = aimThrow(eye, target, 'smoke');
      const [vx, vy, vz] = launchVelocity(aim.yaw, aim.pitch, aim.strength, { vx: 0, vy: 0, vz: 0 });
      const b = { x: eye[0], y: eye[1], z: eye[2], vx, vy, vz, rest: 0, bounces: 0 };
      for (let i = 0; i < 6 * 120 && b.rest < THROW.smokeSettle; i++) stepGrenadeBody(b, 1 / 120);
      expect(Math.hypot(b.x - target[0], b.z - target[2]), `smoke ${distance}`).toBeLessThan(1.5);
    }
  });
  it('an HE thrown at a target detonates close to it after bouncing on real map physics', () => {
    for (const distance of [8, 14, 20]) {
      const eye = [5, 1.58, 27], target = [5, 0, 27 - distance], aim = aimThrow(eye, target, 'he');
      const [vx, vy, vz] = launchVelocity(aim.yaw, aim.pitch, aim.strength, { vx: 0, vy: 0, vz: 0 });
      const b = { x: eye[0], y: eye[1], z: eye[2], vx, vy, vz, rest: 0, bounces: 0 };
      for (let i = 0; i < THROW.fuse * 120; i++) stepGrenadeBody(b, 1 / 120);
      expect(Math.hypot(b.x - target[0], b.y - target[1], b.z - target[2]), `he ${distance}`).toBeLessThan(3.5);
    }
  });
  it('times a flash to pop in the air above the target', () => {
    const eye = [5, 1.58, 27], target = [5, 0, 15], aim = aimThrow(eye, target, 'flash');
    const [vx, vy, vz] = launchVelocity(aim.yaw, aim.pitch, aim.strength, { vx: 0, vy: 0, vz: 0 });
    const t = THROW.fuse, x = eye[0] + vx * t, y = eye[1] + vy * t - THROW.gravity * t * t / 2, z = eye[2] + vz * t;
    expect(Math.hypot(x - target[0], z - target[2])).toBeLessThan(2);
    expect(y).toBeGreaterThan(1); expect(y).toBeLessThan(6);
  });
});

describe('bot utility economy', () => {
  it('attackers buy smoke or flash and defenders sometimes buy HE with spare money', () => {
    const m = createMatch('attack'); m.actors.forEach(a => { a.money = 9000; });
    botInputs(m);
    for (const a of m.actors.filter(a => a.bot && a.team === 'attack')) expect(a.grenades.smoke + a.grenades.flash, a.name).toBeGreaterThan(0);
    const defenders = m.actors.filter(a => a.bot && a.team === 'defend');
    expect(defenders.some(a => a.grenades.he > 0)).toBe(true);
    expect(defenders.every(a => a.grenades.smoke === 0 && a.grenades.flash === 0)).toBe(true);
  });
  it('never spends the money needed for a rifle and armor on utility', () => {
    const m = createMatch('attack'); m.actors.forEach(a => { a.money = 2400; });
    botInputs(m);
    for (const a of m.actors.filter(a => a.bot)) expect(a.grenades.he + a.grenades.flash + a.grenades.smoke).toBe(0);
  });
});

describe('bot utility usage', () => {
  it('an attacker smokes the site cross before the entry and the bomb is still planted', () => {
    // Defenders wait inside the warehouse volume (out of sight), as in ai.test.ts.
    const m = createMatch('defend'); m.phase = 'live'; m.timer = 100; m.actors.filter(a => a.team === 'defend').forEach(a => { a.x = 0; a.z = 0; });
    const defenders = m.actors.filter(a => a.team === 'defend').map(a => a.id);
    m.actors.filter(a => a.bot && a.team === 'attack').forEach(a => { a.grenades.smoke = 1; });
    const target = siteSmokeTarget(MAP.sites[0]);
    let landed: { x: number; z: number } | null = null, planted = false, thrown = 0;
    run(m, 40, defenders, () => {
      if (!landed && m.smokes.length) landed = { x: m.smokes[0].x, z: m.smokes[0].z };
      planted ||= m.bomb.planted; thrown = Math.max(thrown, m.smokes.length + m.grenades.length);
    });
    expect(landed).not.toBeNull();
    expect(Math.hypot(landed!.x - target.x, landed!.z - target.z)).toBeLessThan(4);
    // One smoke covers the cross; the other carriers keep theirs for later.
    expect(thrown).toBe(1);
    expect(planted).toBe(true);
  });
  it('a defender with HE throws it at a visible enemy at mid range, not point blank', () => {
    const m = live(); m.round = 2; park(m, 'attack');
    const defender = m.actors.find(a => a.bot && a.team === 'defend' && (a.id + m.round) % 2 === 0)!, enemy = m.actors.find(a => a.bot && a.team === 'attack')!;
    m.actors.filter(a => a.team === 'defend' && a !== defender).forEach((a, i) => { a.x = 20 - i * 3; a.z = -26; });
    defender.grenades.he = 1; defender.x = 5; defender.z = 26; defender.yaw = 0; enemy.x = 5; enemy.z = 13;
    const others = m.actors.filter(a => a !== defender).map(a => a.id);
    let blast: { x: number; z: number } | null = null;
    run(m, 4, others, () => { const b = m.blasts.find(b => b.kind === 'he'); if (b && !blast) blast = b; });
    expect(blast).not.toBeNull();
    expect(Math.hypot(blast!.x - enemy.x, blast!.z - enemy.z)).toBeLessThan(3.5);
    const close = live(); close.round = 2; park(close, 'attack');
    const d2 = close.actors.find(a => a.id === defender.id)!, e2 = close.actors.find(a => a.id === enemy.id)!;
    d2.grenades.he = 1; d2.x = 5; d2.z = 26; e2.x = 5; e2.z = 22;
    run(close, 2, close.actors.filter(a => a !== d2).map(a => a.id));
    expect(d2.grenades.he).toBe(1);
  });
  it('a flashed bot stops shooting and reacts again only after the white-out fades', () => {
    const m = live(); park(m, 'attack');
    const bot = m.actors.find(a => a.bot && a.team === 'defend')!, enemy = m.actors.find(a => a.bot && a.team === 'attack')!;
    bot.x = 5; bot.z = 20; bot.yaw = Math.PI; enemy.x = 5; enemy.z = 26;
    bot.flashUntil = m.time + 2; bot.flashDuration = 2;
    for (let i = 0; i < 60; i++) { expect(botInputs(m)[bot.id].fire ?? false).toBe(false); m.time += 1 / 60; }
    // Sight returns once the white-out is below 35% (0.7 s before the end of a
    // 2 s flash); the usual 0.6 s reaction still has to elapse after that.
    m.time = bot.flashUntil - .7 + .3;
    expect(botInputs(m)[bot.id].fire ?? false).toBe(false);
    let fired = false;
    for (let i = 0; i < 120; i++) { if (botInputs(m)[bot.id].fire) fired = true; m.time += 1 / 60; }
    expect(fired).toBe(true);
  });
  it('bots turn away from a friendly flash that is about to pop in front of them', () => {
    const m = live(); park(m, 'defend');
    const bot = m.actors.find(a => a.bot && a.team === 'attack')!; bot.x = 5; bot.z = 20; bot.yaw = 0;
    const g = spawnGrenade(m, m.actors[0], 'flash', [5, 2, 14], [0, 0, 0]); g.at = m.time - (THROW.fuse - .3); g.vx = g.vy = g.vz = 0; g.rest = 1;
    const yaw = botInputs(m)[bot.id].yaw!;
    const facing = -Math.sin(yaw) * 0 + -Math.cos(yaw) * -1; // forward · direction to the flash (0, -1)
    expect(facing).toBeLessThan(-.5);
  });
});
