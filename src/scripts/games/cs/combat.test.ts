import { MOVE_SPEED } from './movement';
import { describe, expect, it } from 'vitest';
import { createMatch, stepMatch, buyWeapon, currentSpread, WEAPONS, type Match, type WeaponId } from './engine';

function arena() {
  const m = createMatch('attack'); m.phase = 'live'; m.timer = 100;
  m.actors.forEach((a, i) => { a.x = 20; a.z = 18 + i; });
  Object.assign(m.actors[0], { x: 4, z: 20, yaw: 0, pitch: 0 });
  return m;
}
const fire = (m: Match, pitch = 0) => { stepMatch(m, { 0: { fire: true, pitch } }, 1 / 60); return m.shots.at(-1)!; };

describe('authoritative combat feedback events', () => {
  it('preserves first-shot weapon kick and the ADS multiplier for all weapons', () => {
    for (const [weapon, kick] of Object.entries({ pistol: .006, smg: .008, rifle: .013, sniper: .024 })) for (const aim of [false, true]) {
      const m = arena(), p = m.actors[0]; p.weapon = weapon as WeaponId;
      stepMatch(m, { 0: { fire: true, aim, pitch: 1 } }, 1 / 60);
      expect(p.recoilPitch).toBeCloseTo(kick * (aim ? .7 : 1), 10);
      expect(p.recoilYaw).toBeCloseTo(Math.sin(.8) * kick * (aim ? .7 : 1) * .4, 10);
    }
  });
  it('reports actual health/armor damage, target and weapon snapshot for a body hit', () => {
    const m = arena(); Object.assign(m.actors[3], { x: 4, z: 14, armor: 100 });
    const shot = fire(m, Math.atan2(-.5, 6));
    expect(shot).toMatchObject({ target: 3, weapon: 'pistol', round: 1, surface: 'actor', damage: 17, killed: false, head: false, hit: true });
    expect(shot.armorDamage).toBeCloseTo(10.8);
    expect(Math.hypot(shot.nx, shot.ny, shot.nz)).toBeCloseTo(1);
    m.actors[0].weapon = 'sniper'; expect(shot.weapon).toBe('pistol');
  });
  it('clamps overkill damage and counts one lethal head impact', () => {
    const m = arena(); Object.assign(m.actors[3], { x: 4, z: 14, hp: 8 });
    expect(fire(m)).toMatchObject({ target: 3, damage: 8, killed: true, head: true, hit: true });
    for (let i = 0; i < 30; i++) stepMatch(m, { 0: { fire: true } }, 1 / 60);
    expect(m.actors[0].kills).toBe(1);
    expect(m.shots.filter(s => s.killed).length).toBeLessThanOrEqual(1);
  });
  it('represents an ally intercept without a damage/kill confirmation or a hit behind them', () => {
    const m = arena(); Object.assign(m.actors[1], { x: 4, z: 17 }); Object.assign(m.actors[3], { x: 4, z: 14 });
    expect(fire(m)).toMatchObject({ surface: 'actor', target: 1, damage: 0, armorDamage: 0, killed: false, hit: false });
    expect(m.actors[1].hp).toBe(100); expect(m.actors[3].hp).toBe(100);
  });
  it('provides outward surface normals for walls, wooden cover, ground and perimeter, but none for sky', () => {
    const wall = arena(); wall.actors[0].z = 8;
    expect(fire(wall)).toMatchObject({ surface: 'stone', nx: 0, ny: 0, nz: 1, target: null, damage: 0 });
    const wood = arena(); Object.assign(wood.actors[0], { x: -18, z: -7 });
    expect(fire(wood)).toMatchObject({ surface: 'wood', nx: 0, ny: 0, nz: 1 });
    const ground = arena(); expect(fire(ground, -.6)).toMatchObject({ surface: 'ground', nx: 0, ny: 1, nz: 0 });
    const boundary = arena(); Object.assign(boundary.actors[0], { x: 23, yaw: -Math.PI / 2 });
    expect(fire(boundary)).toMatchObject({ surface: 'stone', nx: -1, ny: 0, nz: 0 });
    const sky = arena(); const miss = fire(sky, 1.45);
    expect(miss).toMatchObject({ surface: 'none', nx: 0, ny: 0, nz: 0, target: null, damage: 0, armorDamage: 0, killed: false, head: false });
    expect([miss.tx, miss.ty, miss.tz].every(Number.isFinite)).toBe(true);
  });
  it('retains events across a maximum catch-up frame and bounds sustained automatic fire', () => {
    const m = arena(); fire(m);
    for (let i = 0; i < 15; i++) stepMatch(m, {}, 1 / 60);
    expect(m.shots.some(s => s.id === 1)).toBe(true);
    m.actors.forEach(a => { a.weapon = 'smg'; a.ammo = 30; });
    for (let i = 0; i < 240; i++) stepMatch(m, Object.fromEntries(m.actors.map(a => [a.id, { fire: true, pitch: 1.45 }])), 1 / 60);
    expect(m.serial).toBeGreaterThan(100);
    expect(m.shots.length).toBeLessThanOrEqual(64);
    expect(m.shots.every(s => m.time - s.at <= .4)).toBe(true);
    expect(new Set(m.shots.map(s => s.id)).size).toBe(m.shots.length);
  });
  it('builds repeatable rifle recoil during a burst and recovers after firing stops', () => {
    const a = arena(), b = arena(); a.actors[0].weapon = b.actors[0].weapon = 'rifle';
    for (let i = 0; i < 36; i++) { stepMatch(a, { 0: { fire: true } }, 1 / 60); stepMatch(b, { 0: { fire: true } }, 1 / 60); }
    expect(a.actors[0].recoilPitch).toBeGreaterThan(.01);
    expect(a.shots.map(s => [s.tx, s.ty, s.tz])).toEqual(b.shots.map(s => [s.tx, s.ty, s.tz]));
    for (let i = 0; i < 90; i++) stepMatch(a, {}, 1 / 60);
    expect(a.actors[0].recoilPitch).toBeLessThan(.001);
  });
  it('uses the shared cone for every weapon and movement/airborne/ADS combination', () => {
    for(const weapon of Object.keys(WEAPONS) as WeaponId[]) for(const aim of [false,true]) for(const moving of [false,true]) for(const airborne of [false,true]) {
      const m=arena(),p=m.actors[0];Object.assign(p,{weapon,aim,moving,vx:0,vz:moving?-MOVE_SPEED[weapon]:0,y:airborne?.6:0});
      const spread=currentSpread(p);expect(spread).toBeCloseTo(WEAPONS[weapon].spread*(aim?.25:1)*(moving?3:1)*(airborne?3:1));
      stepMatch(m,{0:{fire:true,pitch:1.1,aim,forward:moving?1:0}},1/60);
      const s=m.shots[0],dx=s.tx-s.x,dy=s.ty-s.y,dz=s.tz-s.z;
      expect(Math.abs(Math.atan2(-dx,-dz))).toBeLessThanOrEqual(spread/2+1e-7);
      expect(Math.abs(Math.atan2(dy,Math.hypot(dx,dz))-1.1)).toBeLessThanOrEqual(spread/2+1e-7);
    }
  });
  it('reduces ADS kick and clears burst state when buying or starting the next round', () => {
    const hip=arena(),ads=arena();hip.actors[0].weapon=ads.actors[0].weapon='rifle';
    stepMatch(hip,{0:{fire:true}},1/60);stepMatch(ads,{0:{fire:true,aim:true}},1/60);
    expect(ads.actors[0].recoilPitch).toBeCloseTo(hip.actors[0].recoilPitch*.7);
    hip.phase='buy';hip.actors[0].money=9000;expect(buyWeapon(hip,0,'smg')).toBe(true);
    expect(hip.actors[0]).toMatchObject({recoilPitch:0,recoilYaw:0,burst:0});
    ads.phase='round-over';ads.timer=0;stepMatch(ads,{},1/60);
    expect(ads.actors[0]).toMatchObject({recoilPitch:0,recoilYaw:0,burst:0});
  });
});
