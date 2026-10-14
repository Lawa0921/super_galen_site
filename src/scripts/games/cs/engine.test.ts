import { describe, expect, it } from 'vitest';
import { createMatch, stepMatch, buyWeapon, reloadWeapon, WEAPONS, type Match, type Input } from './engine';

const tick = (m: Match, seconds: number, inputs: Record<number, Partial<Input>> = {}) => {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) stepMatch(m, inputs, 1 / 60);
};
const live = () => { const m = createMatch('attack'); m.phase = 'live'; m.timer = 100; return m; };
const aim = (m: Match) => {
  const p = m.actors[0], target = m.actors[3];
  p.x = 4; p.z = 20; p.yaw = 0; p.pitch = 0;
  target.x = 4; target.z = 14;
  return { p, target };
};

describe('Breach Point match rules', () => {
  it('creates a 3v3 match with chosen team, pistol and a living bomb carrier', () => {
    const m = createMatch('defend');
    expect(m.actors).toHaveLength(6);
    expect(m.actors[0]).toMatchObject({ team: 'defend', bot: false, hp: 100, money: 2400, weapon: 'pistol' });
    expect(m.actors.filter(a => a.team === 'attack')).toHaveLength(3);
    expect(m.actors.find(a => a.id === m.bomb.carrier)?.team).toBe('attack');
    expect(m.phase).toBe('buy');
  });
  it('purchases only in the buy phase and never creates money through repeated or unaffordable purchases', () => {
    const m = createMatch('attack'), p = m.actors[0];
    expect(buyWeapon(m, 0, 'rifle')).toBe(true);
    expect(p.weapon).toBe('rifle');
    expect(p.money).toBe(2400 - WEAPONS.rifle.price);
    expect(buyWeapon(m, 0, 'sniper')).toBe(false);
    expect(buyWeapon(m, 0, 'rifle')).toBe(false);
    expect(p.money).toBeGreaterThanOrEqual(0);
    m.phase = 'live'; p.money = 9000;
    expect(buyWeapon(m, 0, 'smg')).toBe(false);
  });
  it('armor purchases are bounded and dead players cannot buy', () => {
    const m = createMatch('attack');
    expect(buyWeapon(m, 0, 'armor')).toBe(true);
    expect(m.actors[0].armor).toBe(100);
    expect(buyWeapon(m, 0, 'armor')).toBe(false);
    m.actors[0].hp = 0;
    expect(buyWeapon(m, 0, 'smg')).toBe(false);
  });
  it('fires along the actual aim, enforces cadence and does not hit allies', () => {
    const m = live(), { p, target } = aim(m);
    m.actors[1].x = 4; m.actors[1].z = 17;
    stepMatch(m, { 0: { fire: true } }, 1 / 60);
    expect(p.ammo).toBe(WEAPONS.pistol.magazine - 1);
    expect(m.actors[1].hp).toBe(100);
    expect(target.hp).toBe(100); // allies physically intercept shots
    m.actors[1].x = 8;
    stepMatch(m, { 0: { fire: true } }, 1 / 60);
    expect(p.ammo).toBe(WEAPONS.pistol.magazine - 1);
    tick(m, .3, { 0: { fire: true } });
    expect(target.hp).toBeLessThan(100);
  });
  it('walls stop bullets and looking away misses', () => {
    const m = live(), { p, target } = aim(m);
    p.z = 8; target.z = -8;
    stepMatch(m, { 0: { fire: true } }, 1 / 60);
    expect(target.hp).toBe(100);
    p.z = 20; target.z = 14; p.cooldown = 0;
    stepMatch(m, { 0: { fire: true, yaw: Math.PI } }, 1 / 60);
    expect(target.hp).toBe(100);
  });
  it('head hits do more damage than body hits and armor absorbs part of a body hit', () => {
    const headMatch = live(), bodyMatch = live(), armorMatch = live();
    const head = aim(headMatch), body = aim(bodyMatch), armored = aim(armorMatch);
    armored.target.armor = 100;
    stepMatch(headMatch, { 0: { fire: true } }, 1 / 60);
    stepMatch(bodyMatch, { 0: { fire: true, pitch: Math.atan2(-.5, 6) } }, 1 / 60);
    stepMatch(armorMatch, { 0: { fire: true, pitch: Math.atan2(-.5, 6) } }, 1 / 60);
    expect(head.target.hp).toBeLessThan(body.target.hp);
    expect(armored.target.hp).toBeGreaterThan(body.target.hp);
    expect(armored.target.armor).toBeLessThan(100);
    expect(headMatch.shots.at(-1)?.head).toBe(true);
    expect(bodyMatch.shots.at(-1)?.head).toBe(false);
  });
  it('a kill is counted once and its reward respects the money cap', () => {
    const m = live(), { p, target } = aim(m); p.money = 8900; target.hp = 10;
    tick(m, 1, { 0: { fire: true } });
    expect(p.kills).toBe(1); expect(target.deaths).toBe(1); expect(p.money).toBe(9000);
  });
  it('retains an isolated lethal-shot and actor snapshot after short-lived shot effects expire', () => {
    const m = live(), { target } = aim(m); target.hp = 8; target.weapon = 'rifle'; target.ammo = 7; target.reserve = 41;
    stepMatch(m, { 0: { fire: true, aim: true } }, 1 / 60);
    expect(m.deaths).toHaveLength(1);
    const death = m.deaths[0], original = structuredClone(death), shot = m.shots.at(-1)!;
    expect(death.actor).toMatchObject({ id: target.id, hp: 0, x: 4, z: 14, weapon: 'rifle', ammo: 7, reserve: 41 });
    expect(death.shot).toMatchObject({ id: shot.id, round: m.round, actor: 0, target: target.id, killed: true, at: m.time });
    expect(death.shot).not.toBe(shot); expect(death.actor).not.toBe(target);
    expect(Object.isFrozen(death)).toBe(true); expect(Object.isFrozen(death.actor)).toBe(true); expect(Object.isFrozen(death.shot)).toBe(true);
    target.x = 12; target.weapon = 'pistol'; target.ammo = 12; shot.tx = 99;
    tick(m, .5);
    expect(m.shots).toHaveLength(0); expect(m.deaths[0]).toEqual(original);
  });
  it('does not record misses, friendly interceptions or nonlethal hits, and records a victim once', () => {
    const m = live(), { p, target } = aim(m);
    stepMatch(m, { 0: { fire: true, yaw: Math.PI } }, 1 / 60); expect(m.deaths).toEqual([]);
    p.cooldown = 0; m.actors[1].x = 4; m.actors[1].z = 17;
    stepMatch(m, { 0: { fire: true, yaw: 0 } }, 1 / 60); expect(m.deaths).toEqual([]);
    m.actors[1].x = 8; p.cooldown = 0;
    stepMatch(m, { 0: { fire: true, yaw: 0, pitch: Math.atan2(-.5, 6) } }, 1 / 60); expect(m.deaths).toEqual([]);
    target.hp = 8; p.cooldown = 0;
    tick(m, 1, { 0: { fire: true, yaw: 0, pitch: 0 } });
    expect(m.deaths).toHaveLength(1); expect(m.deaths[0].actor.id).toBe(target.id);
  });
  it('clears every death record when the next round starts', () => {
    const m = live(), { target } = aim(m); target.hp = 8;
    stepMatch(m, { 0: { fire: true } }, 1 / 60); expect(m.deaths).toHaveLength(1);
    m.phase = 'round-over'; m.timer = .01;
    stepMatch(m, {}, 1 / 60);
    expect(m.round).toBe(2); expect(m.phase).toBe('buy'); expect(m.deaths).toEqual([]);
    expect(target.hp).toBe(100);
  });
  it('reload conserves reserve ammo and blocks firing while reloading', () => {
    const m = live(), p = m.actors[0]; p.ammo = 1; p.reserve = 5;
    expect(reloadWeapon(p)).toBe(true);
    tick(m, .5, { 0: { fire: true } });
    expect(p.ammo).toBe(1);
    tick(m, 2);
    expect(p.ammo).toBe(6); expect(p.reserve).toBe(0);
    expect(reloadWeapon(p)).toBe(false);
  });
  it('movement is normalized, obeys collision, and invalid inputs cannot corrupt position', () => {
    const m = live(), p = m.actors[0]; p.x = 0; p.z = 8;
    tick(m, 2, { 0: { forward: 1 } });
    expect(p.z).toBeGreaterThan(4.3);
    stepMatch(m, { 0: { forward: Infinity, right: NaN, yaw: NaN, pitch: Infinity } }, NaN);
    expect([p.x, p.y, p.z, p.yaw, p.pitch].every(Number.isFinite)).toBe(true);
  });
  it('requires an uninterrupted stationary hold in a bomb site and then starts the fuse', () => {
    const m = live(), p = m.actors[0]; m.bomb.carrier = 0; p.x = -15; p.z = -16;
    tick(m, 2, { 0: { interact: true } });
    expect(m.bomb.planted).toBe(false);
    tick(m, .1, { 0: { forward: 1, interact: true } });
    expect(p.interaction).toBe(0);
    tick(m, .1, { 0: { interact: true } });
    expect(p.interaction).toBe(0); // releasing a key does not cancel momentum
    tick(m, 3.5, { 0: { interact: true } });
    expect(m.bomb.planted).toBe(true);
    expect(m.bomb.carrier).toBeNull();
    expect(m.bomb.fuse).toBeGreaterThan(34);
  });
  it('does not plant outside sites and allows defenders to defuse by holding E', () => {
    const m = live(), p = m.actors[0]; m.bomb.carrier = 0;
    tick(m, 4, { 0: { interact: true } }); expect(m.bomb.planted).toBe(false);
    m.bomb = { carrier: null, planted: true, x: -15, z: -16, fuse: 35 };
    const d = m.actors[3]; d.x = -15; d.z = -16;
    tick(m, 5.1, { 3: { interact: true } });
    expect(m.phase).toBe('round-over'); expect(m.winner).toBe('defend'); expect(m.reason).toBe('defused');
  });
  it('an armed bomb keeps the round alive after attackers die and its explosion wins', () => {
    const m = live(); m.bomb = { carrier: null, planted: true, x: -15, z: -16, fuse: 2 };
    m.actors.filter(a => a.team === 'attack').forEach(a => { a.hp = 0; });
    tick(m, 1); expect(m.phase).toBe('live');
    tick(m, 1.1); expect(m.winner).toBe('attack'); expect(m.reason).toBe('exploded');
  });
  it('round time expires for defenders; next round restores living players and awards money once', () => {
    const m = live(); m.timer = .1;
    tick(m, .2); expect(m.scores.defend).toBe(1); expect(m.phase).toBe('round-over');
    const money = m.actors[0].money;
    tick(m, 1); expect(m.actors[0].money).toBe(money);
    tick(m, 5); expect(m.phase).toBe('buy'); expect(m.round).toBe(2);
    expect(m.actors.every(a => a.hp === 100)).toBe(true);
  });
  it('four won rounds finish the match without automatically restarting', () => {
    const m = live(); m.scores.defend = 3; m.timer = .01;
    tick(m, .1); expect(m.phase).toBe('match-over'); expect(m.scores.defend).toBe(4);
    tick(m, 20); expect(m.phase).toBe('match-over');
  });
  it('a killed carrier drops the bomb and another attacker can collect it', () => {
    const m = live(), p = m.actors[0], mate = m.actors[1];
    m.bomb.carrier = p.id; p.hp = 0; mate.x = p.x; mate.z = p.z;
    stepMatch(m, {}, 1 / 60);
    expect(m.bomb.carrier).toBe(mate.id);
  });
});
