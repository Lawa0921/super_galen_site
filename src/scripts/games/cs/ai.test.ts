import { describe, expect, it } from 'vitest';
import { createMatch, stepMatch } from './engine';
import { botInputs } from './ai';
import { canStand, findPath } from './map';

describe('tactical bots and navigation', () => {
  it('uses the two-stair terrace flank on a B attack and still plants the bomb', () => {
    const m=createMatch('defend');m.round=2;m.phase='live';m.timer=100;
    m.actors.filter(a=>a.team==='defend').forEach(a=>{a.x=0;a.z=0;});
    const carrier=m.actors.find(a=>a.id===m.bomb.carrier)!;let highest=0;
    for(let i=0;i<60*70&&!m.bomb.planted;i++) {
      const inputs=botInputs(m);m.actors.filter(a=>a.team==='defend').forEach(a=>delete inputs[a.id]);
      stepMatch(m,inputs,1/60);highest=Math.max(highest,carrier.y);
    }
    expect(highest).toBeCloseTo(2.4);expect(m.bomb.planted).toBe(true);
  });
  it('finds a walkable route around the central warehouse', () => {
    const route = findPath(0, 9, 0, -9);
    expect(route.length).toBeGreaterThan(2);
    expect(route.every(p => canStand(p.x, p.z))).toBe(true);
    expect(route.at(-1)!.z).toBeLessThan(-7);
  });
  it('projects a cover destination inside a crate onto walkable ground', () => {
    for (const x of [-17, 17]) {
      const route = findPath(0, 23, x, -11);
      expect(route.length).toBeGreaterThan(0);
      expect(route.every(p => canStand(p.x, p.z))).toBe(true);
    }
  });
  it('both site escorts settle into reachable cover instead of walking forever into crates', () => {
    for (const round of [1, 2]) {
      const m = createMatch('attack'); m.round = round; m.phase = 'live'; m.timer = 100;
      m.actors.filter(a => a.team === 'defend').forEach(a => { a.x = 0; a.z = 0; });
      for (let i = 0; i < 60 * 28; i++) {
        const inputs = botInputs(m); m.actors.filter(a => a.team === 'defend').forEach(a => { delete inputs[a.id]; });
        stepMatch(m, inputs, 1 / 60);
      }
      for (const a of m.actors.filter(a => a.team === 'attack' && a.bot)) {
        expect(canStand(a.x, a.z)).toBe(true);
        expect(botInputs(m)[a.id].forward ?? 0).toBe(0);
      }
    }
  });
  it('bots buy equipment, navigate, and an unattended attacker plants at a site', () => {
    const m = createMatch('defend');
    // Keep opponents out of sight inside the sealed warehouse so elimination
    // cannot end this objective-only fixture before the bomb is planted.
    m.actors.filter(a => a.team === 'defend').forEach(a => { a.x = 0; a.z = 0; });
    for (let i = 0; i < 60 * 70 && !m.bomb.planted; i++) {
      const inputs = botInputs(m);
      // Isolate attacker objective behavior from defenders killing the carrier.
      m.actors.filter(a => a.team === 'defend').forEach(a => { delete inputs[a.id]; });
      stepMatch(m, inputs, 1 / 60);
    }
    expect(m.bomb.planted).toBe(true);
    expect(m.actors.filter(a => a.team === 'attack').some(a => a.weapon !== 'pistol')).toBe(true);
  });
  it('a defender autonomously reaches and defuses a planted bomb without wall clipping', () => {
    const m = createMatch('defend'); m.phase = 'live';
    m.actors.filter(a => a.team === 'attack').forEach(a => { a.hp = 0; });
    m.bomb = { carrier: null, planted: true, x: -15, z: -16, fuse: 35 };
    for (let i = 0; i < 60 * 32 && m.phase === 'live'; i++) {
      stepMatch(m, botInputs(m), 1 / 60);
      expect(m.actors.filter(a => a.hp > 0).every(a => canStand(a.x, a.z))).toBe(true);
    }
    expect(m.winner).toBe('defend'); expect(m.reason).toBe('defused');
  });
});
