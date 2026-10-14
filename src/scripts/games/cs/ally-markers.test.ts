import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createMatch } from './engine';
import { AllyMarkers } from './ally-markers';
import { SMOKE, updateSmoke } from './grenades';

function setup() {
  const match = createMatch('attack'); match.phase = 'live';
  match.actors.forEach((a, i) => Object.assign(a, { x: -3, y: 0, z: i === 0 ? 24 : 12, hp: i < 2 ? 100 : 0 }));
  const camera = new THREE.PerspectiveCamera(78, 16 / 9, .06, 250);
  camera.position.set(-3, 1.58, 24); camera.lookAt(-3, 1.58, 12); camera.updateMatrixWorld();
  const container = document.createElement('div'), markers = new AllyMarkers(container);
  return { match, camera, container, markers };
}
describe('visible ally identification', () => {
  it('labels only living allies ahead of the camera, including at 12m, without altering combat', () => {
    const f = setup(), before = JSON.stringify(f.match);
    Object.assign(f.match.actors[3], { hp: 100, x: -4, z: 12 });
    f.markers.update(f.match, f.match.actors[0], f.camera);
    const shown = [...f.container.querySelectorAll<HTMLElement>('[data-actor]')].filter(n => !n.hidden);
    expect(shown).toHaveLength(1); expect(shown[0].textContent).toContain(f.match.actors[1].name);
    expect(shown[0].dataset.actor).toBe('1');
    f.match.actors[3].hp = 0; f.match.actors[3].x = -3;
    expect(JSON.stringify(f.match)).toBe(before);
  });
  it('hides allies behind map walls, behind the viewer, offscreen, dead or outside a live round', () => {
    const f = setup();
    for (const location of [{ x: 0, z: 6 }, { x: -3, z: 27 }, { x: 20, z: 22 }]) {
      Object.assign(f.match.actors[1], location); f.markers.update(f.match, f.match.actors[0], f.camera);
      expect([...f.container.children].every(n => (n as HTMLElement).hidden)).toBe(true);
    }
    Object.assign(f.match.actors[1], { x: -3, z: 12, hp: 0 }); f.markers.update(f.match, f.match.actors[0], f.camera);
    expect([...f.container.children].every(n => (n as HTMLElement).hidden)).toBe(true);
    f.match.actors[1].hp = 100; f.match.phase = 'buy'; f.markers.update(f.match, f.match.actors[0], f.camera);
    expect([...f.container.children].every(n => (n as HTMLElement).hidden)).toBe(true);
  });
  it('follows the spectator camera and reuses a bounded label pool across team changes and quit', () => {
    const f = setup(); f.match.actors[0].hp = 0; f.match.actors[2].hp = 100;
    f.match.actors[2].z = 11;
    for (let i = 0; i < 120; i++) f.markers.update(f.match, f.match.actors[1], f.camera);
    expect(f.container.children).toHaveLength(1);
    expect((f.container.firstElementChild as HTMLElement).dataset.actor).toBe('2');
    const element = f.container.firstElementChild;
    f.match.actors[2].team = 'defend'; f.markers.update(f.match, f.match.actors[1], f.camera);
    expect((element as HTMLElement).hidden).toBe(true);
    f.markers.update(null, null, f.camera); expect((element as HTMLElement).hidden).toBe(true);
    expect(f.container.firstElementChild).toBe(element);
  });
  it('hides an ally standing behind a bloomed smoke, and shows them again once it clears', () => {
    const f = setup();
    f.match.smokes.push(updateSmoke({ id: 1, actor: 1, x: -3, y: 0, z: 18, at: -3, until: -3 + SMOKE.life, radius: 0, density: 0 }, 0));
    f.markers.update(f.match, f.match.actors[0], f.camera);
    expect([...f.container.children].every(n => (n as HTMLElement).hidden)).toBe(true);
    f.match.smokes = []; f.markers.update(f.match, f.match.actors[0], f.camera);
    expect([...f.container.children].some(n => !(n as HTMLElement).hidden)).toBe(true);
  });
});
