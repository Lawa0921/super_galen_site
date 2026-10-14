import * as THREE from 'three';
import { SHOT_PRESENTATION } from './shot-presentation';
import type { Match, Shot } from './engine';
import { selectViewActor } from './spectator';

type Textures = { flash: THREE.Texture; dust: THREE.Texture; decal: THREE.Texture };
type Context = { camera: THREE.PerspectiveCamera; viewCamera: THREE.PerspectiveCamera; gun?: THREE.Group; units: Map<number, THREE.Group>; scoped: boolean; viewId?: number };
const forward = new THREE.Vector3(0, 0, 1);
const fallbacks = { pistol: [0, .09023, -.13129], smg: [0, .05205, -.40464], rifle: [0, .09676, -.79663], sniper: [0, .16287, -.50089] } as const;

// Preserve the muzzle pixel across the weapon/world cameras' different FOVs.
export function projectViewMuzzle(point: THREE.Vector3, view: THREE.PerspectiveCamera, world: THREE.PerspectiveCamera, out: THREE.Vector3) {
  view.updateMatrixWorld(); world.updateMatrixWorld();
  out.copy(point).project(view); out.z = .5; out.unproject(world);
  return out.sub(world.position).normalize().multiplyScalar(Math.max(.35, point.length())).add(world.position);
}

type Particle = { p: THREE.Vector3; v: THREE.Vector3; color: THREE.Color; at: number; life: number; size: number; angle: number };
class ParticleBatch {
  readonly slots: Particle[];
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private cursor = 0;
  private dirty = false;
  private pending = false;
  private readonly data: THREE.InterleavedBuffer;
  active = 0;
  constructor(capacity: number, texture: THREE.Texture) {
    this.slots = Array.from({ length: capacity }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), color: new THREE.Color(), at: -100, life: 0, size: 0, angle: 0 }));
    const geometry = new THREE.BufferGeometry();
    // Emission data is immutable during a particle's life. Motion, fade and
    // growth use the presentation clock in the vertex shader, without uploads.
    this.data = new THREE.InterleavedBuffer(new Float32Array(capacity * 13), 13).setUsage(THREE.DynamicDrawUsage);
    this.data.onUploadCallback = () => this.data.clearUpdateRanges();
    for (const [name, size, offset] of [['position', 3, 0], ['velocity', 3, 3], ['tint', 3, 6], ['timing', 2, 9], ['diameter', 1, 11], ['angle', 1, 12]] as const)
      geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(this.data, size, offset));
    const material = new THREE.ShaderMaterial({
      uniforms: { image: { value: texture }, viewportHeight: { value: 720 }, time: { value: 0 }, growth: { value: 0 }, alphaScale: { value: 1 } }, transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: `attribute vec3 tint; attribute vec3 velocity; attribute vec2 timing; attribute float diameter; attribute float angle;
        uniform float viewportHeight; uniform float time; uniform float growth; uniform float alphaScale;
        varying vec3 vTint; varying float vOpacity; varying float vAngle;
        void main(){ float age=time-timing.x; bool live=timing.y>0. && age>=0. && age<timing.y;
          float visibleAge=live?age:0.; vec4 p=modelViewMatrix*vec4(position+velocity*visibleAge,1.); gl_Position=projectionMatrix*p;
          gl_PointSize=clamp(diameter*(1.+visibleAge*growth)*viewportHeight*projectionMatrix[1][1]/max(.02,-p.z)*.5,1.,192.);
          vTint=tint; vOpacity=live?(1.-age/timing.y)*alphaScale:0.; vAngle=angle; }`,
      fragmentShader: `uniform sampler2D image; varying vec3 vTint; varying float vOpacity; varying float vAngle;
        void main(){vec2 p=gl_PointCoord-.5; float c=cos(vAngle),s=sin(vAngle); vec2 uv=mat2(c,-s,s,c)*p+.5;
          if(vOpacity<.001||any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.)))) discard;
          vec4 tex=texture2D(image,uv); gl_FragColor=vec4(tex.rgb*vTint,tex.a*vOpacity);
          if(gl_FragColor.a<.006) discard;
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geometry, material); this.points.frustumCulled = false; this.points.renderOrder = 3;
  }
  emit(p: THREE.Vector3, v: THREE.Vector3, at: number, life: number, size: number, color: number, angle: number) {
    const index = this.cursor++ % this.slots.length, slot = this.slots[index];
    slot.p.copy(p); slot.v.copy(v); slot.at = at; slot.life = life; slot.size = size; slot.color.setHex(color); slot.angle = angle;
    const a = this.points.geometry.attributes;
    a.tint.setXYZ(index, slot.color.r, slot.color.g, slot.color.b); a.angle.setX(index, angle); a.diameter.setX(index, size);
    a.position.setXYZ(index, p.x, p.y, p.z); a.velocity.setXYZ(index, v.x, v.y, v.z); a.timing.setXY(index, at, life);
    this.queueRange(index * 13, 13);
    this.dirty = true;
  }
  private queueRange(start: number, count: number) {
    // A single bounded union also handles pool wrap and updates while hidden.
    const range = this.data.updateRanges[0];
    if (range) { const end = Math.max(range.start + range.count, start + count); range.start = Math.min(range.start, start); range.count = end - range.start; }
    else this.data.addUpdateRange(start, count);
  }
  update(time: number, grow: boolean) {
    if (!this.active && !this.dirty && !this.pending) return;
    this.active = 0; this.pending = false;
    const uniforms = this.points.material.uniforms;
    uniforms.time.value = time; uniforms.growth.value = grow ? 1.5 : 0; uniforms.alphaScale.value = grow ? .6 : 1;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i], age = time - s.at, live = age >= 0 && age < s.life;
      if (age < 0 && s.life > 0) this.pending = true;
      if (live) this.active++;
    }
    if (this.dirty) this.data.needsUpdate = true;
    this.dirty = false;
    this.points.visible = this.active > 0;
  }
  clear() {
    let changed = false;
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i].life > 0) {
      this.slots[i].life = 0; this.points.geometry.attributes.timing.setY(i, 0); changed = true;
    }
    // Invalidate stored GPU lifetimes before reuse, even across a clock reset.
    // Repeated scoped/buy clears stay idle; hidden data flushes on next draw.
    if (changed) { this.queueRange(0, this.data.array.length); this.data.needsUpdate = true; }
    this.active = 0; this.dirty = false; this.pending = false; this.points.visible = false;
  }
  dispose() { this.points.geometry.dispose(); this.points.material.dispose(); }
}

type Trace = { from: THREE.Vector3; to: THREE.Vector3; at: number; length: number; live: boolean };
type Decal = { matrix: THREE.Matrix4; at: number; live: boolean };
type Casing = { p: THREE.Vector3; v: THREE.Vector3; at: number; live: boolean; spin: number };
export class CombatEffects {
  readonly world = new THREE.Group();
  readonly view = new THREE.Group();
  readonly tracers = new THREE.Group();
  readonly tracerLine: THREE.LineSegments;
  private readonly dust: ParticleBatch;
  private readonly flash: ParticleBatch;
  private readonly viewFlash: ParticleBatch;
  private readonly decals: THREE.InstancedMesh;
  private readonly traces: Trace[] = Array.from({ length: 64 }, () => ({ from: new THREE.Vector3(), to: new THREE.Vector3(), at: 0, length: 0, live: false }));
  private readonly marks: Decal[] = Array.from({ length: 48 }, () => ({ matrix: new THREE.Matrix4(), at: 0, live: false }));
  private readonly shells: Casing[] = Array.from({ length: 24 }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), at: 0, live: false, spin: 0 }));
  private readonly sparks: Casing[] = Array.from({ length: 48 }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), at: 0, live: false, spin: 0 }));
  private readonly casingMeshes: { mesh: THREE.InstancedMesh; local: THREE.Matrix4 }[] = [];
  private readonly impacts = new Map<number, { at: number; strength: number }>();
  private match: Match | null = null;
  private round = 0;
  private serial = 0;
  private clock = 0;
  private emitted = 0;
  private traceCursor = 0; private markCursor = 0; private shellCursor = 0; private sparkCursor = 0;
  private traceCount = 0; private markCount = 0; private shellCount = 0; private sparkCount = 0;
  private marksDirty = true;
  private readonly p = new THREE.Vector3(); private readonly v = new THREE.Vector3(); private readonly n = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4(); private readonly rotation = new THREE.Quaternion();
  private readonly dummy = new THREE.Object3D();
  constructor(private textures: Textures, casing?: THREE.Group) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((64 + 48) * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerLine = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: .95, depthWrite: false, toneMapped: false }));
    this.tracerLine.frustumCulled = false; this.tracers.add(this.tracerLine); this.world.add(this.tracers);
    this.dust = new ParticleBatch(32, textures.dust); this.flash = new ParticleBatch(8, textures.flash); this.viewFlash = new ParticleBatch(4, textures.flash);
    this.world.add(this.dust.points, this.flash.points); this.view.add(this.viewFlash.points);
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: textures.decal, color: 0x867663, transparent: true, opacity: .9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 48);
    this.decals.frustumCulled = false; this.decals.renderOrder = 1; this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.world.add(this.decals);
    if (casing) {
      casing.updateMatrixWorld(true);
      casing.traverse(o => { if (o instanceof THREE.Mesh) {
        const mesh = new THREE.InstancedMesh(o.geometry, o.material, 24); mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.casingMeshes.push({ mesh, local: o.matrixWorld.clone() }); this.view.add(mesh);
      } });
    }
    this.clear(null);
  }
  resize(height: number) { for (const batch of [this.dust, this.flash, this.viewFlash]) batch.points.material.uniforms.viewportHeight.value = height; }
  private anchor(gun: THREE.Group | undefined, name: string, shot: Shot, out: THREE.Vector3) {
    if (gun) {
      gun.updateWorldMatrix(true, true); const anchor = gun.getObjectByName(name);
      if (anchor) { anchor.getWorldPosition(out); if ([out.x, out.y, out.z].every(Number.isFinite)) return out; }
      const f = fallbacks[shot.weapon] ?? fallbacks.pistol;
      out.set(name === 'muzzle' ? f[0] : .025, name === 'muzzle' ? f[1] : .05, name === 'muzzle' ? f[2] : -.06); return gun.localToWorld(out);
    }
    return out.set(.18, -.11, -.65);
  }
  private emit(shot: Shot, m: Match, c: Context) {
    // Blast damage records have no bullet: only the victim's hit reaction.
    if (shot.grenade) {
      if (shot.target !== null && shot.damage > 0) this.impacts.set(shot.target, { at: shot.at, strength: Math.min(1, shot.damage / 60 + .3) });
      return;
    }
    const view = selectViewActor(m, c.viewId ?? m.actors[0].id);
    const local = shot.actor === view.id, liveGun = local && !c.scoped && view.hp > 0;
    const trace = this.traces[this.traceCursor++ % 64]; trace.at = shot.at; trace.live = true; trace.to.set(shot.tx, shot.ty, shot.tz);
    if (liveGun) {
      this.anchor(c.gun, 'muzzle', shot, this.p);
      const profile = SHOT_PRESENTATION[shot.weapon];
      this.viewFlash.emit(this.p, this.v.set(0, 0, 0), shot.at, profile.flashLife, profile.flashSize, 0xffffff, shot.id * 2.4);
      projectViewMuzzle(this.p, c.viewCamera, c.camera, trace.from);
      if (this.casingMeshes.length) {
        const shell = this.shells[this.shellCursor++ % 24]; this.anchor(c.gun, 'ejection_port', shot, shell.p);
        shell.at = shot.at; shell.live = true; shell.spin = shot.id * 1.7; shell.v.set(.95 + (shot.id % 3) * .12, .6, .15);
        const anchor = c.gun?.getObjectByName('ejection_port');
        if (anchor) { anchor.getWorldQuaternion(this.rotation); shell.v.applyQuaternion(this.rotation); }
      }
    } else if (!local) {
      const held = c.units.get(shot.actor)?.getObjectByName('held-weapon') as THREE.Group | undefined;
      if (held) this.anchor(held, 'muzzle', shot, trace.from); else trace.from.set(shot.x, shot.y - .15, shot.z);
      this.flash.emit(trace.from, this.v.set(0, 0, 0), shot.at, .05, .28, 0xffffff, shot.id * 2.4);
    } else trace.from.set(shot.x, shot.y, shot.z);
    trace.length = trace.from.distanceTo(trace.to);
    if (shot.surface === 'none' || (shot.surface === 'actor' && shot.damage <= 0)) return;
    this.n.set(shot.nx, shot.ny, shot.nz); this.p.set(shot.tx, shot.ty, shot.tz).addScaledVector(this.n, .035);
    const actor = shot.surface === 'actor';
    this.dust.emit(this.p, this.v.copy(this.n).multiplyScalar(.65), shot.at, actor ? .24 : .34, actor ? .28 : .34, actor ? 0x965b4b : shot.surface === 'wood' ? 0xb49a72 : 0xcfc4ad, shot.id * 2.4);
    if (shot.surface === 'metal' || shot.surface === 'stone') for (let i = 0; i < 3; i++) {
      const spark = this.sparks[this.sparkCursor++ % 48], angle = shot.id * 2.4 + i * 2.1;
      spark.p.copy(this.p); spark.v.set(Math.sin(angle) * .8, .7 + i * .25, Math.cos(angle) * .8).addScaledVector(this.n, 1.1);
      spark.at = shot.at; spark.live = true;
    }
    if (actor) {
      if (shot.target !== null) this.impacts.set(shot.target, { at: shot.at, strength: Math.min(1, shot.damage / 60 + .3) });
    } else if (shot.surface === 'stone' || shot.surface === 'ground') {
      const mark = this.marks[this.markCursor++ % 48]; mark.at = shot.at; mark.live = true;
      this.marksDirty = true;
      this.rotation.setFromUnitVectors(forward, this.n.normalize());
      this.matrix.makeRotationZ(shot.id * 2.4); mark.matrix.compose(this.p, this.rotation, this.v.setScalar(.065)).multiply(this.matrix);
    }
  }
  update(m: Match, c: Context, dt = 0) {
    if (this.match !== m || this.round !== m.round) { this.clear(null); this.match = m; this.round = m.round; }
    const viewId = selectViewActor(m, c.viewId ?? m.actors[0].id).id;
    if (this.viewId !== viewId) { this.clearView(); this.viewId = viewId; }
    if (m.phase === 'buy') { this.clear(m); return; }
    // The decisive event arrives together with round-over. Let it finish even
    // when match-over stops simulation time; pause passes dt=0 and clears slots.
    this.clock = m.phase === 'live' ? m.time : Math.max(m.time, this.clock + Math.max(0, Math.min(.25, dt)));
    const time = this.clock;
    for (const shot of m.shots) if (shot.id > this.serial) { this.serial = shot.id; this.emitted++; this.emit(shot, m, c); }
    const a = this.tracerLine.geometry.getAttribute('position') as THREE.BufferAttribute; let count = 0;
    for (const trace of this.traces) {
      const age = time - trace.at, life = Math.max(.045, trace.length / 480) + .015;
      if (!trace.live || age < 0 || age > life) { trace.live = false; continue; }
      const head = Math.min(trace.length, Math.max(.8, age * 480)); this.v.subVectors(trace.to, trace.from).normalize();
      this.p.copy(trace.from).addScaledVector(this.v, Math.max(0, head - 9)); a.setXYZ(count++, this.p.x, this.p.y, this.p.z);
      this.p.copy(trace.from).addScaledVector(this.v, head); a.setXYZ(count++, this.p.x, this.p.y, this.p.z);
    }
    this.traceCount = count / 2; this.sparkCount = 0;
    for (const spark of this.sparks) {
      const age = time - spark.at; if (!spark.live || age > .12 || age < 0) { spark.live = false; continue; }
      this.p.copy(spark.p).addScaledVector(spark.v, age); this.p.y -= 2 * age * age;
      a.setXYZ(count++, this.p.x, this.p.y, this.p.z); this.p.addScaledVector(spark.v, -.05);
      a.setXYZ(count++, this.p.x, this.p.y, this.p.z); this.sparkCount++;
    }
    this.tracers.visible = count > 0; this.tracerLine.geometry.setDrawRange(0, count); a.needsUpdate = true;
    this.dust.update(time, true); this.flash.update(time, false); this.viewFlash.update(time, false);
    if (c.scoped) this.viewFlash.clear();
    // Decals remain fixed on the surface. Only upload when their membership
    // changes; camera movement does not change any instance matrix.
    if (this.marksDirty || this.markCount > 0) {
      for (const mark of this.marks) if (mark.live && time - mark.at > 12) { mark.live = false; this.marksDirty = true; }
      if (this.marksDirty) {
        this.markCount = 0;
        for (const mark of this.marks) if (mark.live) this.decals.setMatrixAt(this.markCount++, mark.matrix);
        this.decals.count = this.markCount;
        this.decals.instanceMatrix.needsUpdate = true; this.decals.visible = this.markCount > 0; this.marksDirty = false;
      }
    }
    this.shellCount = 0;
    for (let i = 0; i < this.shells.length; i++) {
      const shell = this.shells[i], age = time - shell.at; if (age > .65 || c.scoped) shell.live = false;
      if (shell.live) {
        this.dummy.position.copy(shell.p).addScaledVector(shell.v, age); this.dummy.position.y -= 2.8 * age * age;
        this.dummy.rotation.set(age * 17, shell.spin + age * 13, age * 9); this.dummy.updateMatrix();
        for (const { mesh, local } of this.casingMeshes) mesh.setMatrixAt(this.shellCount, this.matrix.multiplyMatrices(this.dummy.matrix, local));
        this.shellCount++;
      }
    }
    for (const { mesh } of this.casingMeshes) { mesh.instanceMatrix.needsUpdate = true; mesh.count = this.shellCount; mesh.visible = this.shellCount > 0; }
    for (const [id, impact] of this.impacts) if (time - impact.at > .3) this.impacts.delete(id);
  }
  flinch(id: number, time: number) { const hit = this.impacts.get(id); return hit ? Math.max(0, 1 - (Math.max(time, this.clock) - hit.at) / .22) * hit.strength : 0; }
  private viewId?: number;
  clearView() {
    this.viewFlash.clear();
    for (const shell of this.shells) shell.live = false;
    this.shellCount = 0;
    for (const { mesh } of this.casingMeshes) { mesh.count = 0; mesh.visible = false; }
  }
  clear(m: Match | null) {
    this.viewId = undefined;
    this.match = m; this.round = m?.round ?? 0; this.serial = m?.serial ?? 0;
    this.clock = m?.time ?? 0;
    this.impacts.clear(); this.dust.clear(); this.flash.clear(); this.viewFlash.clear();
    for (const trace of this.traces) trace.live = false; for (const mark of this.marks) mark.live = false; for (const shell of this.shells) shell.live = false; for (const spark of this.sparks) spark.live = false;
    this.traceCount = this.markCount = this.shellCount = this.sparkCount = 0; this.decals.count = 0; this.tracers.visible = this.decals.visible = false;
    this.marksDirty = true;
    for (const { mesh } of this.casingMeshes) { mesh.count = 0; mesh.visible = false; }
  }
  /** Make one element of every effect primitive drawable for a loading-time
   * warm draw. Particles stay transparent (no live timing); call clear() after. */
  primeDraws() {
    this.tracers.visible = true; this.tracerLine.geometry.setDrawRange(0, 2);
    for (const batch of [this.dust, this.flash, this.viewFlash]) batch.points.visible = true;
    this.decals.count = 1; this.decals.visible = true;
    for (const { mesh } of this.casingMeshes) { mesh.count = 1; mesh.visible = true; }
  }
  stats() { return { emitted: this.emitted, traces: this.traceCount, sparks: this.sparkCount, dust: this.dust.active, flashes: this.flash.active + this.viewFlash.active, decals: this.markCount, casings: this.shellCount }; }
  dispose() {
    this.dust.dispose(); this.flash.dispose(); this.viewFlash.dispose(); this.tracerLine.geometry.dispose(); (this.tracerLine.material as THREE.Material).dispose();
    this.decals.geometry.dispose(); (this.decals.material as THREE.Material).dispose();
    const seen = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const { mesh } of this.casingMeshes) { if (!seen.has(mesh.geometry)) { seen.add(mesh.geometry); mesh.geometry.dispose(); } for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (!seen.has(mat)) { seen.add(mat); mat.dispose(); } mesh.dispose(); }
    this.decals.dispose(); for (const texture of Object.values(this.textures)) texture.dispose(); this.world.removeFromParent(); this.view.removeFromParent();
  }
}
