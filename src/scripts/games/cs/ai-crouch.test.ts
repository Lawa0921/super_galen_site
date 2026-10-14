import { describe, expect, it } from 'vitest';
import { createMatch, stepMatch, type Match } from './engine';
import { botInputs } from './ai';
import { visible } from './map';
import { eyeHeight } from './movement';

// Isolate one bot (id 3, defend) against the player (id 0, attack).
const duel = (setup: (m: Match) => void) => {
  const m = createMatch('attack'); m.phase = 'live'; m.timer = 100;
  for (const a of m.actors) if (a.id !== 0 && a.id !== 3) a.hp = 0;
  setup(m); return m;
};

describe('bot crouching', () => {
  it('a crouched actor behind a market crate is hidden from the terrace while a standing one is not', () => {
    const watcher = { x: 19, z: 10.5, y: 2.4 }, target = { x: 5, z: 10.5, y: 0 };
    expect(visible(watcher, { ...target, crouch: 0 })).toBe(true);
    expect(visible(watcher, { ...target, crouch: 1 })).toBe(false);
    expect(visible({ ...target, crouch: 1 }, watcher)).toBe(false);
  });
  it('a scoped sniper crouches for a long-range duel but a close-range rifle keeps strafing upright', () => {
    const far = duel(m => { Object.assign(m.actors[3], { x: -23, z: -20, yaw: Math.PI, weapon: 'sniper' }); Object.assign(m.actors[0], { x: -23, z: 0 }); });
    expect(botInputs(far)[3]).toMatchObject({ aim: true, crouch: true });
    const near = duel(m => { Object.assign(m.actors[3], { x: 4, z: 14, yaw: 0, weapon: 'rifle' }); Object.assign(m.actors[0], { x: 4, z: 20 }); });
    expect(botInputs(near)[3].crouch ?? false).toBe(false);
  });
  it('aims at the lowered body of a crouched target instead of the standing chest line', () => {
    const m = duel(m => { Object.assign(m.actors[3], { x: 4, z: 14, yaw: 0, weapon: 'rifle' }); Object.assign(m.actors[0], { x: 4, z: 20, crouch: 1 }); });
    const bot = m.actors[3], target = m.actors[0], pitch = botInputs(m)[3].pitch!;
    const height = bot.y + eyeHeight(bot) + Math.tan(pitch) * Math.hypot(target.x - bot.x, target.z - bot.z) - target.y;
    expect(height).toBeGreaterThan(.12); expect(height).toBeLessThan(.96);
  });
  it('ducks behind cover while reloading, holds there, then stands to re-engage', () => {
    const m = duel(m => {
      Object.assign(m.actors[3], { x: 5, z: 10.5, yaw: -Math.PI / 2, weapon: 'rifle', ammo: 0, reserve: 90 });
      Object.assign(m.actors[0], { x: 19, z: 10.5, y: 2.4, hp: 100 });
    });
    const bot = m.actors[3];
    let maxCrouch = 0, x = bot.x;
    for (let i = 0; i < 60 * 1.2; i++) { stepMatch(m, { ...botInputs(m), 0: {} }, 1 / 60); maxCrouch = Math.max(maxCrouch, bot.crouch); if (bot.reload > .3) expect(Math.abs(bot.x - x)).toBeLessThan(.3); x = bot.x; }
    expect(maxCrouch).toBe(1);
    for (let i = 0; i < 60 * 2.5 && bot.reload > 0; i++) stepMatch(m, { ...botInputs(m), 0: {} }, 1 / 60);
    expect(bot.ammo).toBe(30);
    for (let i = 0; i < 60 * .5; i++) stepMatch(m, { ...botInputs(m), 0: {} }, 1 / 60);
    expect(bot.crouch).toBe(0);
  });
});
