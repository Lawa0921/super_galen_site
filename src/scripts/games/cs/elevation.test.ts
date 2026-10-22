import { describe, expect, it } from 'vitest';
import { groundHeight, elevationRayHit } from './elevation';
import { canStand, clearRoute, findPath, visible, RADIUS } from './map';
import { createMatch, currentSpread, stepMatch } from './engine';
import { worldImpact } from './ballistics';
import { botInputs } from './ai';

describe('playable terrace and two stairways', () => {
  it('has two continuous stair connections and refuses a shortcut through the terrace wall', () => {
    expect(groundHeight(19,23)).toBe(0);expect(groundHeight(19,10)).toBe(2.4);
    expect(groundHeight(19,16)).toBeCloseTo(2.4);expect(groundHeight(19,6)).toBeCloseTo(2.4);
    for(const x of [19,21]) {
      expect(clearRoute({x,z:23},{x,z:1})).toBe(true);
      expect(clearRoute({x,z:1},{x,z:23})).toBe(true);
      expect(clearRoute({x,z:1},{x:11,z:1})).toBe(true);
      expect(findPath(0,23,x,10).length).toBeGreaterThan(0);
    }
    expect(clearRoute({x:17,z:17},{x:17,z:15})).toBe(false);
  });
  it('walks up and down both stairs, jumps and lands on the upper floor with grounded accuracy', () => {
    const m=createMatch('attack');m.phase='live';m.timer=100;
    const p=m.actors[0];p.x=19;p.z=23;
    const baseline=currentSpread(p);
    for(let i=0;i<145;i++)stepMatch(m,{0:{forward:1,yaw:0}},1/60);
    expect(p.z).toBeLessThan(11);expect(p.y).toBeCloseTo(2.4);
    for(let i=0;i<40;i++)stepMatch(m,{0:{}},1/60);expect(currentSpread(p)).toBeCloseTo(baseline);
    stepMatch(m,{0:{jump:true}},1/60);expect(p.y).toBeGreaterThan(2.4);
    for(let i=0;i<70;i++)stepMatch(m,{0:{}},1/60);
    expect(p.y).toBeCloseTo(2.4);expect(p.vy).toBe(0);
    for(let i=0;i<118;i++)stepMatch(m,{0:{forward:1,yaw:0}},1/60);
    expect(p.z).toBeLessThan(1);expect(p.y).toBeCloseTo(0);
    for(let i=0;i<270;i++)stepMatch(m,{0:{forward:1,yaw:Math.PI}},1/60);
    expect(p.z).toBeGreaterThan(21);expect(p.y).toBeLessThan(.5);
  });
  it('blocks walking through a raised side but allows stepping off and landing below', () => {
    const m=createMatch('attack');m.phase='live';const p=m.actors[0];p.x=17;p.z=18;
    for(let i=0;i<60;i++)stepMatch(m,{0:{forward:1,yaw:0}},1/60);
    expect(p.z).toBeGreaterThanOrEqual(16+RADIUS-.001);
    p.z=15;p.y=2.4;
    for(let i=0;i<60;i++)stepMatch(m,{0:{forward:1,yaw:Math.PI}},1/60);
    expect(p.z).toBeGreaterThan(18);expect(p.y).toBe(0);
  });
  it('keeps the player radius outside raised walls and traverses both stair lanes at 20Hz', () => {
    expect(canStand(22.1,10)).toBe(false);
    expect(canStand(17,16.1)).toBe(false);
    for(const x of [19,21]) {
      const m=createMatch('attack');m.phase='live';m.timer=100;
      const p=m.actors[0];p.x=x;p.z=23;
      for(let i=0;i<90;i++)stepMatch(m,{0:{forward:1,yaw:0}},.05);
      expect(p.z).toBeLessThan(1);expect(p.y).toBeLessThan(.25);
      for(let i=0;i<90;i++)stepMatch(m,{0:{forward:1,yaw:Math.PI}},.05);
      expect(p.z).toBeGreaterThan(22);expect(p.y).toBeLessThan(.25);
    }
  });
  it('uses the same solid steps for shots and AI visibility at actual actor heights', () => {
    const down=elevationRayHit([19,5,10],[0,-1,0]);
    expect(down?.distance).toBeCloseTo(2.6);expect(down?.ny).toBe(1);
    expect(worldImpact([19,5,10],[0,-1,0])).toMatchObject({distance:2.6,surface:'stone',ny:1});
    expect(visible({x:19,z:18,y:0},{x:19,z:10,y:0})).toBe(false);
    expect(visible({x:19,z:23,y:0},{x:19,z:10,y:2.4})).toBe(true);
    const stair=worldImpact([19,5,20],[0,-1,0]);
    expect(stair.distance).toBeCloseTo(5-groundHeight(19,20));
  });
  it('supports real gunfire between floors and preserves an upper-floor death snapshot', () => {
    const m=createMatch('attack');m.phase='live';m.timer=100;
    const high=m.actors[0], low=m.actors[3];
    Object.assign(high,{x:19,z:10,y:2.4,hp:8});
    Object.assign(low,{x:19,z:23,y:0,weapon:'rifle',yaw:0});
    for(let i=0;i<120&&high.hp>0;i++)stepMatch(m,botInputs(m),1/60);
    expect(high.hp).toBe(0);
    expect(m.deaths.find(d=>d.actor.id===0)?.actor.y).toBeCloseTo(2.4);
    const reverse=createMatch('attack');reverse.phase='live';
    Object.assign(reverse.actors[0],{x:19,z:10,y:2.4,weapon:'rifle'});
    Object.assign(reverse.actors[3],{x:19,z:23,y:0});
    stepMatch(reverse,{0:{fire:true,yaw:Math.PI,pitch:Math.atan2(1.1-3.98,13)}},1/60);
    expect(reverse.actors[3].hp).toBeLessThan(100);
  });
  it('does not pick up an upper-floor dropped bomb through the side of its platform', () => {
    const m=createMatch('attack');m.phase='live';m.timer=100;
    m.bomb={carrier:null,planted:false,x:21.9,z:10,fuse:35};
    const p=m.actors[0];Object.assign(p,{x:22.6,z:10,y:0});
    stepMatch(m,{},1/60);expect(m.bomb.carrier).toBeNull();
    Object.assign(p,{x:21,z:10,y:2.4});stepMatch(m,{},1/60);
    expect(m.bomb.carrier).toBe(0);
    expect(worldImpact([23,1.58,10],[-1,0,0])).toMatchObject({distance:1,nx:1,ny:0,surface:'stone'});
  });
});
