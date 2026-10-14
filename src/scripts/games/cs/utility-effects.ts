import * as THREE from 'three';
import type { Actor, Blast, Match } from './engine';
import { SMOKE, type GrenadeId } from './grenades';
import { eyeFog, puffLayout, puffShade, blastFlash, SOFT_DEPTH } from './utility-visuals';
import { cloneModel, disposeModelInstance } from './model-resources';
import { WORLD_SUN } from './view-lighting';
import { elevationBoxes, groundHeight } from './elevation';
import { puffVertex, puffFragment, fireVertex, fireFragment, scorchVertex, scorchFragment } from './utility-shaders';

export const PUFFS_PER_SMOKE = 64;
const MAX_SMOKES = 6, DEBRIS_PUFFS = 14, MAX_DEBRIS = 4, MAX_FIREBALLS = 96, PROPS_PER_KIND = 6;
export const SCORCH = { max: 12, life: 30 } as const;
const worldSun = new THREE.Vector3(...WORLD_SUN).normalize();
const sunDirection = worldSun.toArray() as [number, number, number];
const NODE: Record<GrenadeId, string> = { he: 'he_grenade', flash: 'flashbang', smoke: 'smoke_grenade' };
const smokeLayout = puffLayout(PUFFS_PER_SMOKE, 11), debrisLayout = puffLayout(DEBRIS_PUFFS, 29);
type Textures = { dust: THREE.Texture; flash: THREE.Texture; masks: THREE.Texture };
type Context = { camera: THREE.PerspectiveCamera; units: Map<number, THREE.Group>; viewId?: number };
interface Burst { blast: Blast; at: number }
type SurfaceBounds = [number, number, number, number];
function scorchSurface(x: number, z: number, floor: number): SurfaceBounds {
  // Prefer the larger surface at equal-height shared edges (terrace/stairs),
  // then resolve ties by coordinates. Match groundHeight's inclusive support.
  const surfaces = elevationBoxes.filter(b => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
    && Math.abs(b.height - floor) < 1e-6);
  surfaces.sort((a, b) => (b.maxX - b.minX) * (b.maxZ - b.minZ) - (a.maxX - a.minX) * (a.maxZ - a.minZ)
    || a.minX - b.minX || a.minZ - b.minZ || a.maxX - b.maxX || a.maxZ - b.maxZ);
  const surface = surfaces[0];
  return surface ? [surface.minX, surface.minZ, surface.maxX, surface.maxZ] : [-1e6, -1e6, 1e6, 1e6];
}

/** HE / flash / smoke world presentation with fixed pools: instanced puffs,
 * additive fireballs, pooled grenade models and an in-smoke screen veil. */
export class UtilityEffects {
  /** Opaque grenade models: part of the lit/shadowed/AO world. */
  readonly world = new THREE.Group();
  /** Translucent smoke, blasts and the in-smoke veil: drawn after AO, so
   * ambient-occlusion edges of buildings never print through the smoke. */
  readonly volumes = new THREE.Group();
  readonly props = new THREE.Group();
  readonly puffs: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly fireballs: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly overlay: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly scorches: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  // Keep a zero-intensity light attached: toggling visibility changes programs.
  readonly light = new THREE.PointLight(0xffa75a, 0, 12, 2);
  fog = 0;
  /** True while any volume primitive needs drawing this frame. */
  get active() { return this.puffs.visible || this.fireballs.visible || this.overlay.visible; }
  private readonly pool = new Map<GrenadeId, THREE.Group[]>();
  private readonly bursts: Burst[] = [];
  private readonly attributes: Record<'cloud' | 'shape' | 'puff' | 'tint' | 'spin', THREE.InstancedBufferAttribute>;
  private readonly fire: Record<'burst' | 'look' | 'tint' | 'motion', THREE.InstancedBufferAttribute>;
  private readonly scorchTimes: THREE.InstancedBufferAttribute;
  private readonly scorchBounds: THREE.InstancedBufferAttribute;
  private readonly marks: { x: number; y: number; z: number; at: number; angle: number; bounds: SurfaceBounds }[] = [];
  private readonly matrix = new THREE.Object3D();
  private readonly fallbackDepth = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  private serial = 0;
  private match: Match | null = null;
  private round = 0;
  private readonly hand = new THREE.Vector3();
  private readonly sun = new THREE.Vector3();
  private disposed = false;
  constructor(source: THREE.Group, textures: Textures) {
    this.fallbackDepth.needsUpdate = true;
    const softUniforms = () => ({ sceneDepth: { value: this.fallbackDepth }, screen: { value: new THREE.Vector2(1, 1) }, softness: { value: 0 }, cameraNear: { value: .06 }, cameraFar: { value: 250 } });
    const capacity = MAX_SMOKES * PUFFS_PER_SMOKE + MAX_DEBRIS * DEBRIS_PUFFS;
    const attribute = (size: number, count = capacity) => new THREE.InstancedBufferAttribute(new Float32Array(count * size), size).setUsage(THREE.DynamicDrawUsage);
    this.attributes = { cloud: attribute(4), shape: attribute(4), puff: attribute(4), tint: attribute(3), spin: attribute(2) };
    const geometry = new THREE.PlaneGeometry(1, 1);
    for (const [name, value] of Object.entries(this.attributes)) geometry.setAttribute(name, value);
    this.puffs = new THREE.InstancedMesh(geometry, new THREE.ShaderMaterial({
      uniforms: { masks: { value: textures.masks }, time: { value: 0 }, centerY: { value: SMOKE.centerY }, vertical: { value: SMOKE.vertical }, sun: { value: new THREE.Vector3(0, 1, 0) }, ...softUniforms() },
      vertexShader: puffVertex, fragmentShader: puffFragment, transparent: true, depthWrite: false,
    }), capacity);
    this.puffs.frustumCulled = false; this.puffs.renderOrder = 4;
    const fireGeometry = new THREE.PlaneGeometry(1, 1);
    this.fire = { burst: attribute(4, MAX_FIREBALLS), look: attribute(4, MAX_FIREBALLS), tint: attribute(3, MAX_FIREBALLS), motion: attribute(4, MAX_FIREBALLS) };
    for (const [name, value] of Object.entries(this.fire)) fireGeometry.setAttribute(name, value);
    this.fireballs = new THREE.InstancedMesh(fireGeometry, new THREE.ShaderMaterial({
      uniforms: { masks: { value: textures.masks }, time: { value: 0 }, ...softUniforms() }, vertexShader: fireVertex, fragmentShader: fireFragment,
      transparent: true, depthWrite: false,
    }), MAX_FIREBALLS);
    this.fireballs.frustumCulled = false; this.fireballs.renderOrder = 5;
    const scorchGeometry = new THREE.PlaneGeometry(1, 1);
    this.scorchTimes = attribute(1, SCORCH.max); scorchGeometry.setAttribute('born', this.scorchTimes);
    this.scorchBounds = attribute(4, SCORCH.max); scorchGeometry.setAttribute('surfaceBounds', this.scorchBounds);
    this.scorches = new THREE.InstancedMesh(scorchGeometry, new THREE.ShaderMaterial({
      uniforms: { masks: { value: textures.masks }, time: { value: 0 }, life: { value: SCORCH.life } },
      vertexShader: scorchVertex, fragmentShader: scorchFragment, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }), SCORCH.max);
    this.scorches.frustumCulled = false; this.scorches.renderOrder = 1;
    // Full-screen grey veil drawn last when the camera stands inside smoke.
    this.overlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { amount: { value: 0 }, color: { value: new THREE.Color(.55, .56, .57) } },
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: 'uniform float amount; uniform vec3 color; void main(){ gl_FragColor = vec4(color, amount); }',
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    this.overlay.frustumCulled = false; this.overlay.renderOrder = 999;
    for (const id of ['he', 'flash', 'smoke'] as const) {
      const node = source.getObjectByName(NODE[id]);
      if (!node) throw new Error(`Missing grenade model ${NODE[id]}`);
      const template = new THREE.Group(); template.add(node.clone());
      const clones = Array.from({ length: PROPS_PER_KIND }, () => {
        const clone = cloneModel(template); clone.visible = false;
        clone.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.props.add(clone); return clone;
      });
      this.pool.set(id, clones);
    }
    this.world.add(this.props, this.scorches, this.light); this.volumes.add(this.puffs, this.fireballs, this.overlay);
    this.clear();
  }
  private take(kind: GrenadeId, used: Map<GrenadeId, number>) {
    const index = used.get(kind) ?? 0, list = this.pool.get(kind)!;
    if (index >= list.length) return null;
    used.set(kind, index + 1); const prop = list[index]; prop.visible = true; return prop;
  }
  private readonly queue: { cloud: number; puff: number; distance: number }[] = [];
  private readonly clouds: { x: number; y: number; z: number; at: number; life: number; fadeStart: number; radius: number; debris: boolean; layout: typeof smokeLayout; tint: THREE.Color; id: number }[] = [];
  /** Queue every lump of a cloud with its camera distance for back-to-front blending. */
  private queueCloud(eye: THREE.Vector3, x: number, y: number, z: number, at: number, life: number, fadeStart: number, radius: number, debris: boolean, layout: typeof smokeLayout, tint: THREE.Color, id: number) {
    const cloud = this.clouds.length, lift = debris ? .6 : SMOKE.centerY;
    this.clouds.push({ x, y, z, at, life, fadeStart, radius, debris, layout, tint, id });
    for (let i = 0; i < layout.length; i++) {
      const p = layout[i], dx = x + p.x * radius - eye.x, dy = y + lift + p.y * radius - eye.y, dz = z + p.z * radius - eye.z;
      this.queue.push({ cloud, puff: i, distance: dx * dx + dy * dy + dz * dz });
    }
  }
  private writeQueue() {
    this.queue.sort((a, b) => b.distance - a.distance);
    const a = this.attributes;
    this.queue.forEach((entry, index) => {
      const c = this.clouds[entry.cloud], i = entry.puff, p = c.layout[i];
      const shade = c.debris ? .9 + (i % 3) * .06 : puffShade(p, sunDirection);
      a.cloud.setXYZW(index, c.x, c.y, c.z, c.at); a.shape.setXYZW(index, c.life, c.fadeStart, c.radius, c.debris ? 1 : 0);
      a.puff.setXYZW(index, p.x, p.y, p.z, p.size); a.tint.setXYZ(index, c.tint.r * shade, c.tint.g * shade, c.tint.b * shade); a.spin.setXY(index, p.spin, p.phase);
    });
    const count = this.queue.length; this.queue.length = 0; this.clouds.length = 0;
    return count;
  }
  update(m: Match, c: Context, _dt: number) {
    if (this.match !== m || this.round !== m.round) { this.clear(); this.match = m; this.round = m.round; this.serial = m.blasts.reduce((s, b) => Math.max(s, b.id), 0); }
    const time = m.time;
    for (const blast of m.blasts) if (blast.id > this.serial) {
      this.serial = blast.id;
      if (blast.kind === 'smoke') continue;
      this.bursts.push({ blast: { ...blast }, at: blast.at });
      const floor = groundHeight(blast.x, blast.z);
      if (blast.kind === 'he' && blast.y - floor < .35 && blast.y >= floor && time - blast.at < SCORCH.life) {
        this.marks.push({ x: blast.x, y: floor + .012, z: blast.z, at: blast.at, angle: blast.id * 2.399,
          bounds: scorchSurface(blast.x, blast.z, floor) });
        if (this.marks.length > SCORCH.max) this.marks.shift();
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) if (time - this.bursts[i].at > 3) this.bursts.splice(i, 1);
    if (this.bursts.length > 24) this.bursts.splice(0, this.bursts.length - 24);
    this.light.intensity = 0;
    for (const { blast, at } of this.bursts) {
      const intensity = blastFlash(time - at) * (blast.kind === 'he' ? 65 : 35);
      if (intensity > this.light.intensity) { this.light.intensity = intensity; this.light.position.set(blast.x, blast.y + .35, blast.z); }
    }
    for (let i = this.marks.length - 1; i >= 0; i--) if (time - this.marks[i].at >= SCORCH.life) this.marks.splice(i, 1);
    this.marks.forEach((mark, i) => {
      this.matrix.position.set(mark.x, mark.y, mark.z); this.matrix.rotation.set(-Math.PI / 2, 0, mark.angle); this.matrix.scale.setScalar(2.8); this.matrix.updateMatrix();
      this.scorches.setMatrixAt(i, this.matrix.matrix); this.scorchTimes.setX(i, mark.at);
      this.scorchBounds.setXYZW(i, ...mark.bounds);
    });
    this.scorches.count = this.marks.length; this.scorches.visible = this.marks.length > 0;
    this.scorches.instanceMatrix.needsUpdate = this.scorches.visible; this.scorchTimes.needsUpdate = this.scorches.visible;
    this.scorchBounds.needsUpdate = this.scorches.visible;
    this.scorches.material.uniforms.time.value = time;
    // Projectiles, smoke canisters and grenades held by other actors.
    for (const prop of this.props.children) prop.visible = false;
    const used = new Map<GrenadeId, number>();
    for (const g of m.grenades) {
      const prop = this.take(g.kind, used); if (!prop) continue;
      const age = time - g.at, moving = g.rest <= 0;
      prop.position.set(g.x, g.y, g.z);
      prop.rotation.set(moving ? age * 11 : Math.PI / 2, g.id * 1.3, moving ? age * 4 : 0);
    }
    const smokes = m.smokes.slice(0, MAX_SMOKES);
    for (const s of smokes) {
      const prop = this.take('smoke', used); if (!prop) break;
      prop.position.set(s.x, s.y + .03, s.z); prop.rotation.set(0, s.id * 1.3, Math.PI / 2);
    }
    for (const actor of m.actors) this.held(actor, c, used, time);
    // Puff clouds: active smokes, then recent HE debris.
    const smokeTint = new THREE.Color(.46, .47, .48), debrisTint = new THREE.Color(.16, .14, .12);
    const eye = c.camera.position;
    for (const s of smokes) this.queueCloud(eye, s.x, s.y, s.z, s.at, s.until - s.at, SMOKE.fadeStart, SMOKE.radius, false, smokeLayout, smokeTint, s.id);
    let debris = 0;
    for (const burst of this.bursts) {
      if (burst.blast.kind !== 'he' || time - burst.at > 2.6 || debris >= MAX_DEBRIS) continue;
      this.queueCloud(eye, burst.blast.x, burst.blast.y, burst.blast.z, burst.at, 2.6, .5, 1.7, true, debrisLayout, debrisTint, burst.blast.id); debris++;
    }
    const count = this.writeQueue();
    this.puffs.count = count; this.puffs.visible = count > 0;
    for (const value of Object.values(this.attributes)) value.needsUpdate = count > 0;
    // Fixed pool: authored fire/debris masks, plus a ground-aligned dust ring.
    let fires = 0;
    for (const burst of [...this.bursts].reverse()) {
      const he = burst.blast.kind === 'he', age = time - burst.at;
      for (let k = 0; k < (he ? 13 : 2) && fires < MAX_FIREBALLS; k++) {
        const kind = k < 4 ? 0 : k < 12 ? 1 : 2;
        const life = !he ? .14 : kind === 0 ? .38 : kind === 1 ? .72 : .55;
        const { x, y, z, id } = burst.blast, floor = groundHeight(x, z);
        if (age < 0 || age >= life || (kind === 2 && y - floor >= .35)) continue;
        const angle = id * 1.7 + k * 2.399;
        this.fire.burst.setXYZW(fires, x, kind === 2 ? floor + .025 : y + .2 + (kind === 0 ? k * .16 : 0), z, burst.at);
        this.fire.look.setXYZW(fires, kind === 0 ? 2.8 - k * .3 : kind === 1 ? .5 : 2.4, life, angle, kind === 1 ? 5 : .4);
        this.fire.motion.setXYZW(fires, Math.sin(angle) * 4, 2.4 + k % 3, Math.cos(angle) * 4, kind);
        if (!he) this.fire.tint.setXYZ(fires, 7, 7, 6.5);
        else if (kind === 0) this.fire.tint.setXYZ(fires, 6, 2.1 - k * .25, .3);
        else if (kind === 2) this.fire.tint.setXYZ(fires, .42, .30, .17);
        else this.fire.tint.setXYZ(fires, .2, .17, .13);
        fires++;
      }
    }
    this.fireballs.count = fires; this.fireballs.visible = fires > 0;
    for (const value of Object.values(this.fire)) value.needsUpdate = fires > 0;
    this.puffs.material.uniforms.time.value = time; this.fireballs.material.uniforms.time.value = time;
    // Sun direction in view space for the puff shading.
    c.camera.updateMatrixWorld();
    this.sun.copy(worldSun).transformDirection(c.camera.matrixWorldInverse);
    this.puffs.material.uniforms.sun.value.copy(this.sun);
    for (const material of [this.puffs.material, this.fireballs.material]) {
      material.uniforms.cameraNear.value = c.camera.near; material.uniforms.cameraFar.value = c.camera.far;
    }
    this.fog = eyeFog(c.camera.position.toArray(), smokes);
    this.overlay.material.uniforms.amount.value = Math.min(1, this.fog * 1.15);
    this.overlay.visible = this.fog > .01;
    // Inside the core the veil is opaque: drop the full-screen puff overdraw.
    if (this.fog * 1.15 >= 1) this.puffs.visible = false;
  }
  setSceneDepth(depth: THREE.Texture | null, width: number, height: number) {
    for (const [material, softness] of [[this.puffs.material, SOFT_DEPTH.smoke], [this.fireballs.material, SOFT_DEPTH.fire]] as const) {
      material.uniforms.sceneDepth.value = depth ?? this.fallbackDepth;
      material.uniforms.screen.value.set(Math.max(1, width), Math.max(1, height));
      material.uniforms.softness.value = depth ? softness : 0;
    }
  }
  burstKinds() {
    const result = { fire: 0, debris: 0, ring: 0 };
    for (let i = 0; i < this.fireballs.count; i++) result[this.fire.motion.getW(i) === 2 ? 'ring' : this.fire.motion.getW(i) === 1 ? 'debris' : 'fire']++;
    return result;
  }
  private held(actor: Actor, c: Context, used: Map<GrenadeId, number>, time: number) {
    if (actor.hp <= 0 || actor.id === c.viewId || !actor.held || actor.held === 'gun' || actor.thrownAt > actor.heldAt || time - actor.heldAt < .2) return;
    const unit = c.units.get(actor.id), hand = unit?.getObjectByName('hand_r');
    if (!unit?.visible || !hand) return;
    const prop = this.take(actor.held, used); if (!prop) return;
    hand.getWorldPosition(this.hand); prop.position.copy(this.hand); prop.rotation.set(0, actor.yaw, 0);
  }
  primeDraws() {
    // One live instance per primitive so loading compiles the real programs.
    for (const list of this.pool.values()) { list[0].visible = true; list[0].position.set(0, -50, 0); }
    this.queueCloud(new THREE.Vector3(), 0, -50, 0, -1, 1e6, 1e6, 1, false, smokeLayout.slice(0, 1), new THREE.Color(1, 1, 1), 0); this.writeQueue();
    this.puffs.count = 1; this.puffs.visible = true; this.attributes.cloud.needsUpdate = true;
    this.fire.burst.setXYZW(0, 0, -50, 0, -1); this.fire.look.setXYZW(0, 1, 1e6, 0, 0); this.fire.tint.setXYZ(0, 1, 1, 1);
    this.fire.motion.setXYZW(0, 0, 0, 0, 0);
    this.fireballs.count = 1; this.fireballs.visible = true;
    this.matrix.position.set(0, -50, 0); this.matrix.rotation.set(-Math.PI / 2, 0, 0); this.matrix.scale.setScalar(1); this.matrix.updateMatrix();
    this.scorches.setMatrixAt(0, this.matrix.matrix); this.scorchTimes.setX(0, 0); this.scorches.count = 1; this.scorches.visible = true;
    this.scorchBounds.setXYZW(0, -1e6, -1e6, 1e6, 1e6);
    for (const value of [...Object.values(this.attributes), ...Object.values(this.fire), this.scorchTimes, this.scorchBounds, this.scorches.instanceMatrix]) value.needsUpdate = true;
    this.overlay.visible = true; this.overlay.material.uniforms.amount.value = 0;
  }
  clear() {
    this.bursts.length = 0;
    this.marks.length = 0; this.queue.length = 0; this.clouds.length = 0;
    this.scorches.count = 0; this.scorches.visible = false; this.light.intensity = 0;
    for (const prop of this.props.children) prop.visible = false;
    this.puffs.count = 0; this.puffs.visible = false;
    this.fireballs.count = 0; this.fireballs.visible = false;
    this.overlay.visible = false; this.fog = 0;
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    for (const list of this.pool.values()) for (const prop of list) disposeModelInstance(prop);
    this.puffs.geometry.dispose(); this.puffs.material.dispose(); this.puffs.dispose();
    this.fireballs.geometry.dispose(); this.fireballs.material.dispose(); this.fireballs.dispose();
    this.overlay.geometry.dispose(); this.overlay.material.dispose();
    this.scorches.geometry.dispose(); this.scorches.material.dispose(); this.scorches.dispose();
    this.fallbackDepth.dispose();
  }
}
