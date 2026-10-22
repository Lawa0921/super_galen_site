import { describe, expect, it } from 'vitest';
import { createMatch, reloadWeapon, stepMatch, WEAPONS, type Shot, type WeaponId } from './engine';
import { CombatFeedback, ReloadFeedback, hurtDirection, crosshairSpread } from './feedback';
const shot = (id: number, extra: Partial<Shot> = {}): Shot => ({ id, round: 1, actor: 0, weapon: 'rifle', at: 0, x: 0, y: 1.58, z: 10, tx: 0, ty: 1, tz: 0, nx: 0, ny: 0, nz: 1, surface: 'actor', target: 3, damage: 22, armorDamage: 14, killed: false, head: false, hit: true, ...extra });
describe('combat feedback lifecycle', () => {
  it('widens the crosshair for airborne first shots, less accurate weapons and sustained bursts', () => {
    const p=createMatch('attack').actors[0],base=crosshairSpread(p);
    p.y=.3;expect(crosshairSpread(p)).toBeGreaterThan(base);p.y=0;
    p.weapon='smg';expect(crosshairSpread(p)).toBeGreaterThan(base);const smg=crosshairSpread(p);
    p.burst=12;expect(crosshairSpread(p)).toBeGreaterThan(smg);p.aim=true;expect(crosshairSpread(p)).toBeLessThan(smg+1);
    p.moving=true;p.y=1;expect(crosshairSpread(p)).toBeLessThanOrEqual(5);
  });
  it('consumes every event once, snapshots head/kill feedback, and ignores ally confirmations', () => {
    const m = createMatch('attack'), f = new CombatFeedback();
    m.shots = [shot(1), shot(2, { head: true, killed: true })]; m.serial = 2;
    expect(f.consume(m, 100)).toHaveLength(2); expect(f.kind).toBe('kill'); expect(f.hitUntil).toBeGreaterThan(500);
    expect(f.consume(m, 110)).toHaveLength(0);
    f.clear(m); m.shots.push(shot(3, { target: 1, damage: 0, armorDamage: 0, hit: false })); m.serial = 3;
    expect(f.consume(m, 200)).toHaveLength(1); expect(f.hitUntil).toBe(0);
  });
  it('processes multiple incoming hits and uses the newest source direction', () => {
    const m = createMatch('attack'), f = new CombatFeedback();
    m.shots = [shot(5, { actor: 3, target: 0, x: 10, z: 0 }), shot(4, { actor: 4, target: 0, x: 0, z: -10 })]; m.serial = 5;
    expect(f.consume(m, 500).map(s => s.id)).toEqual([4, 5]);
    expect(f.hurtUntil).toBeGreaterThan(500); expect(f.strength).toBeGreaterThan(0);
    expect(hurtDirection(f.hurtBearing, 0)).toBe('right'); expect(f.hitUntil).toBe(0);
  });
  it('clears on pause without replaying history, then accepts new match and round events', () => {
    const m = createMatch('attack'), f = new CombatFeedback(); m.shots = [shot(1)]; m.serial = 1;
    f.consume(m, 100); f.clear(m);
    expect(f.hitUntil).toBe(0); expect(f.hurtUntil).toBe(0); expect(f.consume(m, 200)).toEqual([]);
    const next = createMatch('attack'); next.shots = [shot(1)]; next.serial = 1;
    expect(f.consume(next, 300)).toHaveLength(1);
    next.round = 2; next.shots = []; f.consume(next, 400); expect(f.hitUntil).toBe(0);
  });
  it('wraps hurt bearings correctly in all quadrants as the player turns', () => {
    expect(hurtDirection(0, 0)).toBe('front'); expect(hurtDirection(-Math.PI / 2, 0)).toBe('right');
    expect(hurtDirection(Math.PI / 2, 0)).toBe('left'); expect(hurtDirection(Math.PI, 0)).toBe('back');
    expect(hurtDirection(-Math.PI + .05, Math.PI - .05)).toBe('front');
    expect(hurtDirection(0, Math.PI / 2)).toBe('right');
  });
});

describe('reload mechanical audio timing', () => {
  it('emits release, insertion and chamber cues once for each actual weapon reload', () => {
    for (const weapon of Object.keys(WEAPONS) as WeaponId[]) {
      const m = createMatch('attack'); m.phase = 'live'; const p = m.actors[0];
      p.weapon = weapon; p.ammo = 1; const feedback = new ReloadFeedback(); feedback.clear(m);
      expect(reloadWeapon(p)).toBe(true); const cues: string[] = [];
      for (let i = 0; i < Math.ceil(WEAPONS[weapon].reload * 60) + 5; i++) {
        stepMatch(m, {}, 1 / 60); cues.push(...feedback.consume(m));
      }
      expect(cues).toEqual(['release', 'insert', 'chamber']);
      expect(feedback.consume(m)).toEqual([]);
    }
  });
  it('does not replay cues after a pause and catches crossed stages on a slow frame', () => {
    const m = createMatch('attack'); m.phase = 'live'; const p=m.actors[0],f=new ReloadFeedback();
    p.reload=WEAPONS.pistol.reload; f.consume(m);
    p.reload=WEAPONS.pistol.reload*.55; expect(f.consume(m)).toEqual(['release']);
    f.clear(m); expect(f.consume(m)).toEqual([]);
    p.reload=.01; expect(f.consume(m)).toEqual(['insert','chamber']);
    p.reload=0; expect(f.consume(m)).toEqual([]);
  });
  it('suppresses cancelled reload cues on death, a new round or a new match', () => {
    const m=createMatch('attack');m.phase='live';const p=m.actors[0],f=new ReloadFeedback();
    p.reload=WEAPONS.pistol.reload;f.consume(m);p.hp=0;p.reload=.01;
    expect(f.consume(m)).toEqual([]);m.round++;p.hp=100;p.reload=0;expect(f.consume(m)).toEqual([]);
    const next=createMatch('attack');next.phase='live';expect(f.consume(next)).toEqual([]);
  });
  it('follows the viewed teammate reload and never replays earlier stages when switching or resuming', () => {
    const m=createMatch('attack');m.phase='live';m.actors[0].hp=0;
    const a=m.actors[1],b=m.actors[2],f=new ReloadFeedback();a.weapon=b.weapon='rifle';
    a.reload=WEAPONS.rifle.reload;f.consume(m,a);
    a.reload=WEAPONS.rifle.reload*.5;expect(f.consume(m,a)).toEqual(['release']);
    b.reload=WEAPONS.rifle.reload*.2;expect(f.consume(m,b)).toEqual([]);
    b.reload=WEAPONS.rifle.reload*.1;expect(f.consume(m,b)).toEqual(['chamber']);
    f.clear(m,b);expect(f.consume(m,b)).toEqual([]);
    a.reload=.01;expect(f.consume(m,a)).toEqual([]);
    a.hp=0;expect(f.consume(m,a)).toEqual([]);
  });
});
