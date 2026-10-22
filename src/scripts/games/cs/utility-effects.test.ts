import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createMatch, spawnGrenade, stepMatch } from './engine';
import { SMOKE, updateSmoke } from './grenades';
import { UtilityEffects, PUFFS_PER_SMOKE, SCORCH } from './utility-effects';
import { groundHeight } from './elevation';

function grenadeSource() {
  const root = new THREE.Group();
  for (const name of ['he_grenade', 'flashbang', 'smoke_grenade']) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .1), new THREE.MeshStandardMaterial()); body.name = name;
    const pin = new THREE.Mesh(new THREE.TorusGeometry(.01, .002), new THREE.MeshStandardMaterial()); pin.name = `${name}_pin`; body.add(pin);
    root.add(body);
  }
  return root;
}
function setup() {
  const m = createMatch('attack'); m.phase = 'live'; m.timer = 100;
  const fx = new UtilityEffects(grenadeSource(), { dust: new THREE.Texture(), flash: new THREE.Texture(), masks: new THREE.Texture() });
  const camera = new THREE.PerspectiveCamera(78, 16 / 9, .06, 250); camera.position.set(0, 1.58, 26);
  return { m, fx, ctx: { camera, units: new Map<number, THREE.Group>(), viewId: 0 } };
}
const visibleProps = (fx: UtilityEffects) => { let n = 0; fx.props.traverse(o => { if (o.parent === fx.props && o.visible) n++; }); return n; };

describe('grenade world effects', () => {
  function scorchAt(x: number, z: number) {
    const state = setup(); state.fx.update(state.m, state.ctx, 0);
    state.m.blasts.push({ id: 1, actor: 0, kind: 'he', x, y: groundHeight(x, z) + .06, z, at: 0 });
    state.fx.update(state.m, state.ctx, 0);
    return state;
  }
  function boundsAt(fx: UtilityEffects, index = 0) {
    const bounds = fx.scorches.geometry.getAttribute('surfaceBounds');
    expect(bounds, 'Scorch must limit its visible surface to the supporting tread').toBeDefined();
    return [bounds.getX(index), bounds.getY(index), bounds.getZ(index), bounds.getW(index)];
  }
  it.each(Array.from({ length: 12 }, (_, i) => i))('clips a south-stair scorch to tread %i', i => {
    const z = 16 + (i + .5) * .5, { fx } = scorchAt(20, z);
    expect(fx.scorches.count).toBe(1);
    expect(boundsAt(fx)).toEqual([18, 16 + i * .5, 22, 16 + (i + 1) * .5]);
    const matrix = new THREE.Matrix4(); fx.scorches.getMatrixAt(0, matrix);
    expect(matrix.elements[13]).toBeCloseTo(groundHeight(20, z) + .012, 5);
    fx.dispose();
  });
  it.each([6, 16])('uses the larger equal-height terrace at the shared boundary z=%s', z => {
    const { fx } = scorchAt(20, z);
    expect(boundsAt(fx)).toEqual([16, 6, 22, 16]);
    fx.dispose();
  });
  it.each([[16.4999, 16, 16.5], [16.5, 16, 16.5], [16.5001, 16.5, 17]])(
    'keeps the highest containing tread at stair boundary z=%s', (z, minZ, maxZ) => {
      const { fx } = scorchAt(20, z);
      expect(boundsAt(fx)).toEqual([18, minZ, 22, maxZ]);
      fx.dispose();
    });
  it('preserves the complete flat-ground footprint with finite bounds', () => {
    const { fx } = scorchAt(0, 10), bounds = boundsAt(fx);
    expect(bounds.every(Number.isFinite)).toBe(true);
    expect(bounds[0]).toBeLessThan(-2); expect(bounds[1]).toBeLessThan(8);
    expect(bounds[2]).toBeGreaterThan(2); expect(bounds[3]).toBeGreaterThan(12);
    fx.dispose();
  });
  it('rewrites surface bounds when the oldest mark is evicted and after a round clear', () => {
    const { m, fx, ctx } = scorchAt(20, 16.75);
    for (let id = 2; id <= SCORCH.max + 1; id++) {
      const z = 16 + ((id - 1) % 12 + .5) * .5;
      m.blasts.push({ id, actor: 0, kind: 'he', x: 20, y: groundHeight(20, z) + .06, z, at: 0 });
    }
    const version = fx.scorches.geometry.getAttribute('surfaceBounds')?.version ?? 0;
    fx.update(m, ctx, 0);
    expect(fx.scorches.count).toBe(SCORCH.max);
    expect(boundsAt(fx, 0)).toEqual([18, 16.5, 22, 17]);
    expect(boundsAt(fx, SCORCH.max - 1)).toEqual([18, 16, 22, 16.5]);
    expect(fx.scorches.geometry.getAttribute('surfaceBounds').version).toBeGreaterThan(version);
    m.round++; fx.update(m, ctx, 0); expect(fx.scorches.count).toBe(0);
    fx.primeDraws(); fx.clear();
    m.blasts.push({ id: 100, actor: 0, kind: 'he', x: 0, y: .06, z: 10, at: 0 });
    fx.update(m, ctx, 0);
    expect(fx.scorches.count).toBe(1); expect(boundsAt(fx)[0]).toBeLessThan(-2);
    fx.dispose();
  });
  it('shows one textured grenade model per projectile at its simulated position', () => {
    const { m, fx, ctx } = setup();
    const g = spawnGrenade(m, m.actors[0], 'he', [1, 2, 3], [0, 0, 0]); spawnGrenade(m, m.actors[0], 'flash', [4, 2, 3], [0, 0, 0]);
    fx.update(m, ctx, 1 / 60);
    expect(visibleProps(fx)).toBe(2);
    const shown = fx.props.children.find(o => o.visible && o.position.distanceTo(new THREE.Vector3(g.x, g.y, g.z)) < 1e-6);
    expect(shown?.getObjectByName('he_grenade')).toBeDefined();
    m.grenades = []; fx.update(m, ctx, 1 / 60);
    expect(visibleProps(fx)).toBe(0);
  });
  it('blooms an instanced smoke cloud with a bounded puff count and leaves the canister on the ground', () => {
    const { m, fx, ctx } = setup();
    for (let i = 0; i < 9; i++) m.smokes.push(updateSmoke({ id: i + 1, actor: 0, x: i * 2, y: 0, z: 0, at: 0, until: SMOKE.life, radius: 0, density: 0 }, m.time));
    fx.update(m, ctx, 1 / 60);
    expect(fx.puffs.count).toBe(6 * PUFFS_PER_SMOKE);
    expect(visibleProps(fx)).toBe(6);
    m.smokes = []; fx.update(m, ctx, 1 / 60);
    expect(fx.puffs.count).toBe(0); expect(fx.puffs.visible).toBe(false);
  });
  it('an HE blast adds a short fireball and a lingering dark debris cloud; a flash a brief pop', () => {
    const { m, fx, ctx } = setup(); fx.update(m, ctx, 1 / 60);
    spawnGrenade(m, m.actors[3], 'he', [0, .06, 10], [0, 0, 0]);
    spawnGrenade(m, m.actors[3], 'flash', [6, 1.5, 10], [0, 0, 0]);
    for (let i = 0; i < 100; i++) stepMatch(m, {}, 1 / 60);
    fx.update(m, ctx, 1 / 60);
    expect(fx.fireballs.count).toBeGreaterThanOrEqual(2);
    expect(fx.puffs.count).toBeGreaterThan(0);
    for (let i = 0; i < 70; i++) stepMatch(m, {}, 1 / 60);
    fx.update(m, ctx, 1 / 60);
    expect(fx.fireballs.count).toBe(0);
    expect(fx.puffs.count).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) stepMatch(m, {}, 1 / 60);
    fx.update(m, ctx, 1 / 60);
    expect(fx.puffs.count).toBe(0);
  });
  it('greys the screen when the camera is inside a smoke', () => {
    const { m, fx, ctx } = setup();
    m.smokes.push(updateSmoke({ id: 1, actor: 0, x: 0, y: 0, z: 26, at: m.time - 3, until: m.time - 3 + SMOKE.life, radius: 0, density: 0 }, m.time));
    fx.update(m, ctx, 1 / 60);
    expect(fx.fog).toBeGreaterThan(.9); expect(fx.overlay.visible).toBe(true);
    // Fully veiled: skip the hidden puff overdraw.
    expect(fx.puffs.visible).toBe(false);
    ctx.camera.position.set(0, 1.58, 0); fx.update(m, ctx, 1 / 60);
    expect(fx.fog).toBe(0); expect(fx.overlay.visible).toBe(false);
  });
  it('primes every draw primitive for shader warm-up, then clear() restores the idle state', () => {
    const { fx } = setup();
    fx.primeDraws();
    expect(fx.puffs.visible).toBe(true); expect(fx.puffs.count).toBeGreaterThan(0);
    expect(fx.fireballs.visible).toBe(true); expect(fx.overlay.visible).toBe(true);
    expect(visibleProps(fx)).toBe(3);
    fx.clear();
    expect(fx.puffs.visible).toBe(false); expect(fx.fireballs.visible).toBe(false); expect(fx.overlay.visible).toBe(false);
    expect(visibleProps(fx)).toBe(0);
    fx.dispose();
  });
  it('shows the first blast of a new match even after an earlier match used higher event ids', () => {
    const { m, fx, ctx } = setup(); fx.update(m, ctx, 1 / 60);
    for (let i = 0; i < 6; i++) spawnGrenade(m, m.actors[3], 'flash', [6, 1.5, 10], [0, 0, 0]);
    for (let i = 0; i < 100; i++) stepMatch(m, {}, 1 / 60);
    fx.update(m, ctx, 1 / 60);
    const next = setup().m; fx.update(next, ctx, 1 / 60);
    spawnGrenade(next, next.actors[3], 'he', [0, .06, 10], [0, 0, 0]);
    for (let i = 0; i < 100; i++) stepMatch(next, {}, 1 / 60);
    fx.update(next, ctx, 1 / 60);
    expect(fx.fireballs.count).toBeGreaterThan(0);
  });

  // V38
  const detonate = (y = .06, x = 0, z = 10) => {
    const { m, fx, ctx } = setup(); fx.update(m, ctx, 1 / 60);
    spawnGrenade(m, m.actors[3], 'he', [x, y, z], [0, 0, 0]);
    let steps = 0;
    while (!m.blasts.length && steps++ < 200) stepMatch(m, {}, 1 / 60);
    return { m, fx, ctx };
  };
  const meshes = (fx: UtilityEffects) => { const list: THREE.Mesh[] = []; for (const g of [fx.world, fx.volumes]) g.traverse(o => { if (o instanceof THREE.Mesh && !fx.props.children.some(p => p === o || p.getObjectById(o.id))) list.push(o); }); return list; };
  it('an HE blast flashes a short point light that is always in the scene (one shader variant)', () => {
    const { m, fx, ctx } = detonate();
    expect(fx.light.parent).not.toBeNull(); expect(fx.light.visible).toBe(true);
    fx.update(m, ctx, 1 / 60);
    expect(fx.light.intensity).toBeGreaterThan(10);
    for (let i = 0; i < 12; i++) stepMatch(m, {}, 1 / 60);
    fx.update(m, ctx, 1 / 60);
    expect(fx.light.intensity).toBe(0); expect(fx.light.visible).toBe(true);
  });
  it('an HE blast throws debris chunks and a ground shock ring alongside the fireball', () => {
    const { m, fx, ctx } = detonate(); fx.update(m, ctx, 1 / 60);
    const kinds = fx.burstKinds();
    expect(kinds.fire).toBeGreaterThanOrEqual(4); expect(kinds.debris).toBeGreaterThanOrEqual(6); expect(kinds.ring).toBe(1);
  });
  it('leaves a scorch decal on the ground under a grounded blast that outlives the smoke and fades', () => {
    const { m, fx, ctx } = detonate(); fx.update(m, ctx, 1 / 60);
    expect(fx.scorches.count).toBe(1); expect(fx.scorches.visible).toBe(true);
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(); fx.scorches.getMatrixAt(0, matrix); position.setFromMatrixPosition(matrix);
    expect(position.y).toBeCloseTo(groundHeight(0, 10), 1); expect(position.y).toBeLessThan(groundHeight(0, 10) + .05);
    for (let i = 0; i < 60 * 5; i++) stepMatch(m, {}, 1 / 60);
    fx.update(m, ctx, 1 / 60); expect(fx.scorches.count).toBe(1);
    for (let i = 0; i < Math.ceil(60 * SCORCH.life); i++) stepMatch(m, {}, 1 / 60);
    fx.update(m, ctx, 1 / 60); expect(fx.scorches.count).toBe(0); expect(fx.scorches.visible).toBe(false);
  });
  it('an airburst leaves no scorch, and a new round clears scorches', () => {
    // At 3.2 m an unthrown grenade reaches the floor before its 1.6 s fuse.
    const air = detonate(30); air.fx.update(air.m, air.ctx, 1 / 60);
    expect(air.m.blasts[0].y).toBeGreaterThan(1);
    expect(air.fx.scorches.count).toBe(0);
    const { m, fx, ctx } = detonate(); fx.update(m, ctx, 1 / 60); expect(fx.scorches.count).toBe(1);
    m.round++; fx.update(m, ctx, 1 / 60); expect(fx.scorches.count).toBe(0);
  });
  it('bounds scorch decals to the most recent SCORCH.max blasts', () => {
    const { m, fx, ctx } = setup(); fx.update(m, ctx, 1 / 60);
    for (let k = 0; k < SCORCH.max + 3; k++) {
      spawnGrenade(m, m.actors[3], 'he', [k * 1.5 - 6, .06, 10], [0, 0, 0]);
      for (let i = 0; i < 110; i++) stepMatch(m, {}, 1 / 60);
      fx.update(m, ctx, 1 / 60);
    }
    expect(fx.scorches.count).toBe(SCORCH.max);
  });
  it('soft particles read the scene depth when given one and degrade to plain depth test without, keeping one program', () => {
    const { fx } = setup();
    const materials = [fx.puffs.material, fx.fireballs.material];
    const versions = materials.map(m => m.version), defines = materials.map(m => JSON.stringify(m.defines ?? {}));
    const depth = new THREE.DepthTexture(640, 360);
    fx.setSceneDepth(depth, 1280, 720);
    for (const m of materials) {
      expect(m.uniforms.sceneDepth.value).toBe(depth); expect(m.uniforms.softness.value).toBeGreaterThan(0);
      expect(m.uniforms.screen.value.toArray()).toEqual([1280, 720]);
    }
    fx.setSceneDepth(null, 1280, 720);
    for (const m of materials) { expect(m.uniforms.softness.value).toBe(0); expect(m.uniforms.sceneDepth.value).not.toBeNull(); }
    expect(materials.map(m => m.version)).toEqual(versions);
    expect(materials.map(m => JSON.stringify(m.defines ?? {}))).toEqual(defines);
  });
  it('keeps particle pools bounded during simultaneous blasts, consumes events once and clears them for a new round', () => {
    const { m, fx, ctx } = setup(); fx.update(m, ctx, 0);
    for (let i = 0; i < 40; i++) m.blasts.push({ id: i + 1, actor: 0, kind: 'he', x: 0, y: .06, z: 10, at: m.time });
    fx.update(m, ctx, 0);
    const count = fx.fireballs.count;
    expect(count).toBeGreaterThan(0); expect(count).toBeLessThanOrEqual(fx.fireballs.instanceMatrix.count);
    expect(fx.scorches.count).toBe(SCORCH.max);
    fx.update(m, ctx, 0); expect(fx.fireballs.count).toBe(count); expect(fx.scorches.count).toBe(SCORCH.max);
    m.round++; fx.update(m, ctx, 0);
    expect(fx.fireballs.count).toBe(0); expect(fx.scorches.count).toBe(0); expect(fx.light.intensity).toBe(0);
  });
  it('lights smoke lumps from the world sun: sunward lumps are brighter than the far side', () => {
    const { m, fx, ctx } = setup();
    m.smokes.push(updateSmoke({ id: 1, actor: 0, x: 0, y: 0, z: 0, at: m.time - 3, until: m.time - 3 + SMOKE.life, radius: 0, density: 0 }, m.time));
    fx.update(m, ctx, 1 / 60);
    const puff = fx.puffs.geometry.getAttribute('puff') as THREE.InstancedBufferAttribute, tint = fx.puffs.geometry.getAttribute('tint') as THREE.InstancedBufferAttribute;
    const sun = new THREE.Vector3(-22, 22, 16).normalize();
    let lit = 0, dark = 0, nl = 0, nd = 0;
    for (let i = 0; i < fx.puffs.count; i++) {
      const d = puff.getX(i) * sun.x + puff.getZ(i) * sun.z;
      if (d > .4) { lit += tint.getX(i); nl++; } else if (d < -.4) { dark += tint.getX(i); nd++; }
    }
    expect(nl).toBeGreaterThan(2); expect(nd).toBeGreaterThan(2);
    expect(lit / nl).toBeGreaterThan(dark / nd * 1.25);
  });
  it('primes every effect primitive (including the scorch decals, burst sprites and blast light) for warm-up', () => {
    const { fx } = setup();
    fx.primeDraws();
    for (const mesh of meshes(fx)) {
      let shown = true; for (let o: THREE.Object3D | null = mesh; o; o = o.parent) shown &&= o.visible;
      expect(shown, mesh.name || mesh.type).toBe(true);
      if (mesh instanceof THREE.InstancedMesh) expect(mesh.count, mesh.name).toBeGreaterThan(0);
    }
    expect(meshes(fx)).toContain(fx.scorches);
    fx.clear();
    expect(fx.scorches.visible).toBe(false); expect(fx.light.intensity).toBe(0); expect(fx.light.visible).toBe(true);
  });
});
