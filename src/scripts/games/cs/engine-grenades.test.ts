import { describe, expect, it } from 'vitest';
import { createMatch, stepMatch, buyWeapon, spawnGrenade, type Match, type Input } from './engine';
import { flashAmount, heDamage, updateSmoke, SMOKE, THROW } from './grenades';
import { visible } from './map';

const tick = (m: Match, seconds: number, inputs: Record<number, Partial<Input>> = {}) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) stepMatch(m, inputs, 1 / 60);
};
const live = () => {
  const m = createMatch('attack'); m.phase = 'live'; m.timer = 100;
  // Park everyone far apart in the open so only the actors under test matter.
  m.actors.forEach((a, i) => { a.x = -20 + i * 2; a.z = -26; a.yaw = 0; });
  return m;
};

describe('utility purchases', () => {
  it('sells HE, flash and smoke during the buy phase within CS carry limits', () => {
    const m = createMatch('attack'), p = m.actors[0]; p.money = 9000;
    expect(buyWeapon(m, 0, 'he')).toBe(true); expect(buyWeapon(m, 0, 'he')).toBe(false);
    expect(buyWeapon(m, 0, 'flash')).toBe(true); expect(buyWeapon(m, 0, 'flash')).toBe(true); expect(buyWeapon(m, 0, 'flash')).toBe(false);
    expect(buyWeapon(m, 0, 'smoke')).toBe(true); expect(buyWeapon(m, 0, 'smoke')).toBe(false);
    expect(p.grenades).toEqual({ he: 1, flash: 2, smoke: 1 });
    expect(p.money).toBe(9000 - 300 - 200 - 200 - 300);
    expect(p.weapon).toBe('pistol');
  });
  it('refuses unaffordable, live-phase and dead purchases', () => {
    const m = createMatch('attack'), p = m.actors[0]; p.money = 250;
    expect(buyWeapon(m, 0, 'he')).toBe(false); expect(buyWeapon(m, 0, 'flash')).toBe(true); expect(p.money).toBe(50);
    p.money = 9000; m.phase = 'live'; expect(buyWeapon(m, 0, 'smoke')).toBe(false);
    m.phase = 'buy'; p.hp = 0; expect(buyWeapon(m, 0, 'smoke')).toBe(false);
  });
  it('survivors keep utility into the next round; the dead lose it', () => {
    const m = createMatch('attack'); m.actors[0].money = 9000; m.actors[1].money = 9000;
    buyWeapon(m, 0, 'smoke'); buyWeapon(m, 1, 'he');
    m.actors[1].hp = 0; m.phase = 'round-over'; m.timer = .01; tick(m, .05);
    expect(m.round).toBe(2);
    expect(m.actors[0].grenades.smoke).toBe(1);
    expect(m.actors[1].grenades.he).toBe(0);
  });
});

describe('equipping and throwing', () => {
  it('slot selection draws the grenade, a held primary throw releases it and returns to the gun', () => {
    const m = live(), p = m.actors[0]; p.x = 0; p.z = 20; p.grenades.smoke = 1; const ammo = p.ammo;
    tick(m, .05, { 0: { equip: 'smoke' } });
    expect(p.held).toBe('smoke');
    tick(m, .7, { 0: { fire: true } });
    expect(m.grenades).toHaveLength(0); expect(p.ammo).toBe(ammo);
    tick(m, 1 / 60, { 0: {} });
    expect(m.grenades).toHaveLength(1);
    expect(m.grenades[0]).toMatchObject({ kind: 'smoke', actor: 0 });
    expect(p.grenades.smoke).toBe(0);
    tick(m, THROW.recover + .1);
    expect(p.held).toBe('gun');
  });
  it('a quick tap still throws once the pin is out, and a right-click lob is slower than a full throw', () => {
    const speeds: number[] = [];
    for (const button of ['fire', 'aim'] as const) {
      const m = live(), p = m.actors[0]; p.x = 0; p.z = 20; p.grenades.flash = 1;
      tick(m, .5, { 0: { equip: 'flash' } });
      tick(m, 1 / 60, { 0: { [button]: true } });
      tick(m, .4, { 0: {} });
      expect(m.grenades).toHaveLength(1);
      const g = m.grenades[0]; speeds.push(Math.hypot(g.vx, g.vz));
    }
    expect(speeds[0]).toBeGreaterThan(speeds[1] * 2.5);
  });
  it('another grenade of the same type is drawn after a throw', () => {
    const m = live(), p = m.actors[0]; p.x = 0; p.z = 20; p.grenades.flash = 2;
    tick(m, .5, { 0: { equip: 'flash' } }); tick(m, .5, { 0: { fire: true } }); tick(m, THROW.recover + .2, { 0: {} });
    expect(p.held).toBe('flash'); expect(p.grenades.flash).toBe(1);
  });
  it('drawing a grenade cancels a reload; a dead thrower drops a primed grenade without throwing it', () => {
    const m = live(), p = m.actors[0]; p.x = 0; p.z = 20; p.grenades.he = 1; p.ammo = 3; p.reload = 1;
    tick(m, .5, { 0: { equip: 'he' } });
    expect(p.reload).toBe(0);
    tick(m, .5, { 0: { fire: true } });
    p.hp = 0; tick(m, .5, { 0: {} });
    expect(m.grenades).toHaveLength(0);
    expect(p.grenades.he).toBe(0); expect(p.held).toBe('gun');
  });
});

describe('HE detonation', () => {
  it('explodes after the fuse, damaging enemies by distance but not through a wall or teammates', () => {
    const m = live(), [self, mate, , open, hidden] = m.actors;
    self.x = 0; self.z = 21.5; mate.x = -3; mate.z = 20; open.x = 3; open.z = 20; hidden.x = -15; hidden.z = -0;
    spawnGrenade(m, self, 'he', [0, THROW.radius, 20], [0, 0, 0]);
    spawnGrenade(m, self, 'he', [-15, THROW.radius, 5.2], [0, 0, 0]);
    tick(m, THROW.fuse - .1);
    expect(open.hp).toBe(100);
    tick(m, .2);
    expect(m.blasts.filter(b => b.kind === 'he')).toHaveLength(2);
    expect(100 - open.hp).toBeGreaterThan(heDamage(3.1) - 2); expect(100 - open.hp).toBeLessThan(heDamage(2.9) + 2);
    expect(hidden.hp).toBe(100);
    expect(mate.hp).toBe(100);
    expect(self.hp).toBeLessThan(100);
    expect(m.grenades).toHaveLength(0);
  });
  it('armor absorbs blast damage and an HE kill is credited in the feed with an HE tag', () => {
    const m = live(), [self, , , armored, victim] = m.actors;
    self.x = -20; self.z = 20; armored.x = 3; armored.z = 20; armored.armor = 100; victim.x = 0; victim.z = 19; victim.hp = 10;
    spawnGrenade(m, self, 'he', [0, THROW.radius, 20], [0, 0, 0]);
    tick(m, THROW.fuse + .1);
    expect(100 - armored.hp).toBeLessThan(heDamage(2.9) * .5 + 2);
    expect(armored.armor).toBeLessThan(100);
    expect(victim.hp).toBe(0); expect(self.kills).toBe(1);
    expect(m.feed[0].text).toContain('HE');
    expect(m.deaths.find(d => d.actor.id === victim.id)?.shot.grenade).toBe('he');
  });
});

describe('flashbang detonation', () => {
  it('blinds a player looking at it fully and one looking away only briefly', () => {
    const m = live(), [self, , , away] = m.actors;
    self.x = 0; self.z = 20; self.yaw = 0; away.x = 3; away.z = 20; away.yaw = Math.PI;
    spawnGrenade(m, self, 'flash', [0, 1.6, 15], [0, 0, 0]);
    tick(m, THROW.fuse + .05);
    expect(m.blasts.some(b => b.kind === 'flash')).toBe(true);
    expect(flashAmount(self, m.time)).toBe(1);
    expect(self.flashDuration).toBeGreaterThan(4);
    expect(away.flashDuration).toBeGreaterThan(0); expect(away.flashDuration).toBeLessThan(1);
    tick(m, 5);
    expect(flashAmount(self, m.time)).toBe(0);
  });
  it('walls and smoke block a flash', () => {
    const m = live(), [self, , , , hidden] = m.actors;
    hidden.x = -15; hidden.z = 0; hidden.yaw = 0;
    self.x = 0; self.z = 22; self.yaw = 0;
    m.smokes.push(updateSmoke({ id: 99, actor: 1, x: 0, y: 0, z: 16, at: m.time - 3, until: m.time - 3 + SMOKE.life, radius: 0, density: 0 }, m.time));
    spawnGrenade(m, m.actors[3], 'flash', [-15, 1.6, 5], [0, 0, 0]);
    spawnGrenade(m, m.actors[3], 'flash', [0, 1.6, 10], [0, 0, 0]);
    tick(m, THROW.fuse + .05);
    expect(hidden.flashDuration).toBe(0);
    expect(self.flashDuration).toBe(0);
  });
});

describe('smoke grenade', () => {
  it('pops only after coming to rest, blocks sight for its lifetime, then clears', () => {
    const m = live(), [self, , , enemy] = m.actors;
    self.x = 5; self.z = 26; enemy.x = 5; enemy.z = 12;
    expect(visible(self, enemy, m.smokes)).toBe(true);
    spawnGrenade(m, self, 'smoke', [5, 2.5, 19], [0, 0, 0]);
    tick(m, .3);
    expect(m.smokes).toHaveLength(0);
    tick(m, 2.4);
    expect(m.smokes).toHaveLength(1); expect(m.grenades).toHaveLength(0);
    expect(m.blasts.some(b => b.kind === 'smoke')).toBe(true);
    expect(m.smokes[0].y).toBeCloseTo(0, 1);
    tick(m, 1);
    expect(visible(self, enemy, m.smokes)).toBe(false);
    expect(visible(self, enemy)).toBe(true);
    tick(m, SMOKE.life);
    expect(m.smokes).toHaveLength(0);
    expect(visible(self, enemy, m.smokes)).toBe(true);
  });
  it('a new round clears grenades in flight and active smokes', () => {
    const m = live();
    spawnGrenade(m, m.actors[0], 'smoke', [5, 2.5, 19], [0, 0, 0]); tick(m, 3);
    m.phase = 'round-over'; m.timer = .01; tick(m, .05);
    expect(m.smokes).toHaveLength(0); expect(m.grenades).toHaveLength(0);
  });
});
