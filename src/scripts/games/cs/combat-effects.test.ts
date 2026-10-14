import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CombatEffects, projectViewMuzzle } from './combat-effects';
import { createMatch, type Shot } from './engine';

function setup(casing?: THREE.Group) {
  const m = createMatch('attack'); m.phase = 'live';
  const fx = new CombatEffects({ flash: new THREE.Texture(), dust: new THREE.Texture(), decal: new THREE.Texture() }, casing);
  const context = { camera: new THREE.PerspectiveCamera(78, 16/9, .06, 250), viewCamera: new THREE.PerspectiveCamera(58, 16/9, .01, 10), units: new Map(), scoped: false };
  const shot: Shot = { id: 1, round: 1, actor: 0, weapon: 'rifle', at: 0, x: 0, y: 1.58, z: 20, tx: 0, ty: 1.58, tz: -20, nx: 0, ny: 0, nz: 1, surface: 'stone', target: null, damage: 0, armorDamage: 0, killed: false, hit: false, head: false };
  return { m, fx, context, shot };
}
describe('bounded combat effects', () => {
  it('primes one drawable element per effect primitive for loading, then clear restores the idle pool', () => {
    const casing = new THREE.Group(); casing.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    const { fx } = setup(casing), internals = fx as any;
    const points = [internals.dust, internals.flash, internals.viewFlash].map(batch => batch.points as THREE.Points);
    const instanced = [internals.decals, ...internals.casingMeshes.map((entry: { mesh: THREE.InstancedMesh }) => entry.mesh)] as THREE.InstancedMesh[];
    fx.primeDraws();
    expect(fx.tracers.visible).toBe(true); expect(fx.tracerLine.geometry.drawRange.count).toBe(2);
    for (const point of points) expect(point.visible).toBe(true);
    for (const mesh of instanced) { expect(mesh.visible).toBe(true); expect(mesh.count).toBe(1); }
    expect(instanced).toHaveLength(2);
    fx.clear(null);
    expect(fx.tracers.visible).toBe(false);
    for (const point of points) expect(point.visible).toBe(false);
    for (const mesh of instanced) { expect(mesh.visible).toBe(false); expect(mesh.count).toBe(0); }
    expect(fx.stats()).toMatchObject({ traces: 0, sparks: 0, dust: 0, flashes: 0, decals: 0, casings: 0 });
    fx.dispose();
  });
  it('gives each weapon a readable muzzle envelope without increasing the four-slot pool', () => {
    const profiles: string[]=[];
    for(const weapon of ['pistol','smg','rifle','sniper'] as const) {
      const {m,fx,context,shot}=setup();
      m.shots=[{...shot,weapon}];m.serial=1;fx.update(m,context);
      const flash=(fx as any).viewFlash.points as THREE.Points;
      const a=flash.geometry.attributes;
      expect(a.timing.count).toBe(4);
      expect(a.timing.getY(0)).toBeGreaterThanOrEqual(.05);
      expect(a.timing.getY(0)).toBeLessThanOrEqual(.09);
      profiles.push(`${a.diameter.getX(0)}/${a.timing.getY(0)}`);
      m.time=.025;fx.update(m,context);
      expect(flash.visible).toBe(true);
      expect(fx.tracerLine.geometry.drawRange.count).toBeLessThanOrEqual(2*(64+48));
      m.time=.2;fx.update(m,context);expect(flash.visible).toBe(false);fx.dispose();
    }
    expect(new Set(profiles).size).toBe(4);
  });
  it('advances particle time without rewriting or uploading any emission attributes', () => {
    const {m,fx,context,shot}=setup();
    const dust=(fx as any).dust.points as THREE.Points,flash=(fx as any).viewFlash.points as THREE.Points;
    m.shots=[shot];m.serial=1;fx.update(m,context);
    const d=dust.geometry.attributes,f=flash.geometry.attributes;
    const data=(d.position as THREE.InterleavedBufferAttribute).data,flashData=(f.position as THREE.InterleavedBufferAttribute).data;
    expect(data).toBeDefined();expect(flashData).toBeDefined();
    const before={version:data.version,flashVersion:flashData.version,values:Array.from(data.array),ranges:structuredClone(data.updateRanges)};
    m.time=.02;fx.update(m,context);
    expect(dust.visible).toBe(true);expect(flash.visible).toBe(true);
    expect(data.version).toBe(before.version);expect(flashData.version).toBe(before.flashVersion);
    expect(Array.from(data.array)).toEqual(before.values);expect(data.updateRanges).toEqual(before.ranges);
    expect((dust.material as THREE.ShaderMaterial).uniforms.time.value).toBe(.02);
    expect((dust.material as THREE.ShaderMaterial).uniforms.growth.value).toBe(1.5);
    expect((dust.material as THREE.ShaderMaterial).uniforms.alphaScale.value).toBe(.6);
    expect((flash.material as THREE.ShaderMaterial).uniforms.growth.value).toBe(0);
    m.shots=[{...shot,id:2,at:m.time}];m.serial=2;fx.update(m,context);
    expect(data.version).toBe(before.version+1);expect(flashData.version).toBe(before.flashVersion+1);
    expect(f.angle.getX(1)).not.toBe(f.angle.getX(0));fx.dispose();
  });
  it('clears GPU lifetimes once and preserves the shared storage through expiry and pool reuse', () => {
    const {m,fx,context,shot}=setup();const points=(fx as any).viewFlash.points as THREE.Points;
    const attributes=points.geometry.attributes,data=(attributes.position as THREE.InterleavedBufferAttribute).data;
    expect(data).toBeDefined();const versions=()=>data.version;
    const empty=versions();for(let i=0;i<8;i++)fx.update(m,context);expect(versions()).toEqual(empty);
    m.shots=[shot];m.serial=1;fx.update(m,context);m.time=.1;fx.update(m,context);
    expect(points.visible).toBe(false);
    const expired=versions();for(let i=0;i<8;i++)fx.update(m,context);expect(versions()).toEqual(expired);
    for(let id=2;id<7;id++){m.shots=[{...shot,id,at:m.time}];m.serial=id;fx.update(m,context);}
    expect(points.visible).toBe(true);expect((fx as any).viewFlash.active).toBe(4);
    fx.clear(m);const cleared=versions();fx.clear(m);fx.update(m,context);expect(versions()).toEqual(cleared);
    m.shots=[{...shot,id:7,at:m.time}];m.serial=7;fx.update(m,context);
    expect((fx as any).viewFlash.active).toBe(1);
    expect(Array.from({length:attributes.timing.count},(_,i)=>attributes.timing.getY(i)).filter(v=>v>0)).toHaveLength(1);
    expect(points.geometry.attributes).toBe(attributes);fx.dispose();
  });
  it('does not discard particles whose event timestamp is slightly ahead of the presentation clock', () => {
    const {m,fx,context,shot}=setup();
    m.shots=[{...shot,at:.02}];m.serial=1;fx.update(m,context);
    expect((fx as any).viewFlash.active).toBe(0);
    m.time=.025;fx.update(m,context);expect((fx as any).viewFlash.active).toBe(1);
    m.time=.1;fx.update(m,context);expect((fx as any).viewFlash.active).toBe(0);fx.dispose();
  });
  it('bounds unrendered emission ranges, flushes initial upload ranges and clears a rewound match', () => {
    const {m,fx,context,shot}=setup(),points=(fx as any).viewFlash.points as THREE.Points;
    const attributes=points.geometry.attributes,data=(attributes.position as THREE.InterleavedBufferAttribute).data;
    expect(data).toBeDefined();
    m.time=1058.99;
    for(let id=1;id<=300;id++){m.serial=id;m.shots=[{...shot,id,at:m.time}];fx.update(m,context);}
    expect((fx as any).viewFlash.active).toBe(4);expect(data.updateRanges).toEqual([{start:0,count:data.array.length}]);
    expect(Math.abs(Math.fround(m.time)-m.time)).toBeLessThan(.00025);
    data.onUploadCallback();expect(data.updateRanges).toHaveLength(0);
    const version=data.version;m.time+=.02;fx.update(m,context);expect(data.version).toBe(version);expect(data.updateRanges).toHaveLength(0);
    const next=createMatch('attack');next.phase='live';next.serial=1;next.shots=[shot];fx.update(next,context);
    expect((fx as any).viewFlash.active).toBe(1);
    expect(Array.from({length:attributes.timing.count},(_,i)=>attributes.timing.getY(i)).filter(v=>v>0)).toHaveLength(1);
    fx.dispose();
  });
  it('draws only live casings with no expired holes and clears draw counts on view changes', () => {
    const source=new THREE.Group(),geometry=new THREE.BoxGeometry(.02,.04,.02),material=new THREE.MeshBasicMaterial();
    source.add(new THREE.Mesh(geometry,material));
    const nested=new THREE.Group(),part=new THREE.Mesh(geometry,material);
    nested.position.set(.2,.3,-.1);nested.rotation.set(.2,.4,-.1);nested.scale.set(1.2,.8,1.1);part.position.set(.03,-.02,.06);
    nested.add(part);source.add(nested);source.updateMatrixWorld(true);const local=part.matrixWorld.clone();
    const {m,fx,context,shot}=setup(source),components=fx.view.children.filter(o=>o instanceof THREE.InstancedMesh) as THREE.InstancedMesh[],mesh=components[0];
    expect(components).toHaveLength(2);
    const storage=mesh.instanceMatrix;expect(mesh.count).toBe(0);
    m.shots=[shot];m.serial=1;fx.update(m,context);expect(mesh.count).toBe(1);
    m.time=.4;m.shots=[{...shot,id:2,at:.4}];m.serial=2;fx.update(m,context);expect(mesh.count).toBe(2);
    m.time=.7;fx.update(m,context);expect(mesh.count).toBe(1);expect(fx.stats().casings).toBe(1);
    const live=new THREE.Matrix4();mesh.getMatrixAt(0,live);expect(live.determinant()).toBeCloseTo(1);expect(live.elements[12]).toBeCloseTo(.18+1.19*.3);
    const component=new THREE.Matrix4(),expected=live.clone().multiply(local);components[1].getMatrixAt(0,component);
    expect(components[1].count).toBe(1);component.elements.forEach((v,i)=>expect(v).toBeCloseTo(expected.elements[i],6));
    m.actors[0].hp=0;fx.update(m,{...context,viewId:1});expect(mesh.count).toBe(0);expect(mesh.visible).toBe(false);
    m.shots=[{...shot,id:3,actor:1,at:m.time}];m.serial=3;fx.update(m,{...context,viewId:1});expect(mesh.count).toBe(1);
    fx.update(m,{...context,viewId:1,scoped:true});expect(mesh.count).toBe(0);expect(mesh.visible).toBe(false);
    m.shots=[{...shot,id:4,actor:1,at:m.time}];m.serial=4;fx.update(m,{...context,viewId:1});expect(mesh.count).toBe(1);
    fx.clear(m);expect(mesh.count).toBe(0);expect(mesh.instanceMatrix).toBe(storage);
    for(let id=5;id<45;id++){m.shots=[{...shot,id,actor:1,at:m.time}];m.serial=id;fx.update(m,{...context,viewId:1});}
    expect(mesh.count).toBe(24);expect(mesh.instanceMatrix).toBe(storage);
    m.round++;m.shots=[];fx.update(m,{...context,viewId:1});expect(mesh.count).toBe(0);fx.dispose();
  });

  it('uses the watched teammate muzzle and clears only first-person effects on a view switch', () => {
    const {m,fx,context,shot}=setup();m.actors[0].hp=0;
    const gun=new THREE.Group(),muzzle=new THREE.Object3D();muzzle.name='muzzle';muzzle.position.set(.3,-.2,-.7);gun.add(muzzle);
    const watched={...context,gun,viewId:1};m.shots=[{...shot,actor:1}];m.serial=1;
    fx.update(m,watched);
    const line=fx.tracerLine.geometry.getAttribute('position'),actual=new THREE.Vector3().fromBufferAttribute(line,0);
    const expected=projectViewMuzzle(muzzle.position,context.viewCamera,context.camera,new THREE.Vector3());
    expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
    expect((fx as any).viewFlash.active).toBe(1);
    fx.update(m,{...watched,viewId:2});
    expect((fx as any).viewFlash.active).toBe(0);
    expect(fx.stats()).toMatchObject({emitted:1,decals:1,traces:1});
    m.shots=[{...shot,id:2,actor:2}];m.serial=2;fx.update(m,{...watched,viewId:2,scoped:true});
    expect((fx as any).viewFlash.active).toBe(0);expect(fx.stats().emitted).toBe(2);fx.dispose();
  });
  it('retains stationary decals without uploading their matrices again until an impact expires', () => {
    const {m,fx,context,shot}=setup();
    const decals=fx.world.children.find(o=>o instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    m.shots=[shot];m.serial=1;fx.update(m,context);
    const initialVersion=decals.instanceMatrix.version, first=Array.from(decals.instanceMatrix.array);
    for(let i=1;i<=120;i++){m.time=i/60;fx.update(m,context);}
    expect(fx.stats().decals).toBe(1);expect(decals.count).toBe(1);expect(decals.instanceMatrix.version).toBe(initialVersion);
    expect(Array.from(decals.instanceMatrix.array)).toEqual(first);
    m.shots=[{...shot,id:2,at:m.time,tx:2}];m.serial=2;fx.update(m,context);
    expect(fx.stats().decals).toBe(2);expect(decals.instanceMatrix.version).toBe(initialVersion+1);
    const second=new THREE.Matrix4();decals.getMatrixAt(1,second);
    expect(second.elements[12]).toBeCloseTo(2);
    m.time=12.1;fx.update(m,context);expect(fx.stats().decals).toBe(1);
    expect(decals.instanceMatrix.version).toBe(initialVersion+2);
    const remaining=new THREE.Matrix4();decals.getMatrixAt(0,remaining);
    expect(decals.count).toBe(1);expect(remaining.elements).toEqual(second.elements);
    fx.update(m,context);expect(decals.instanceMatrix.version).toBe(initialVersion+2);fx.dispose();
  });
  it('flushes cleared decals before reusing the pool without reuploading empty frames', () => {
    const {m,fx,context,shot}=setup();const decals=fx.world.children.find(o=>o instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    m.shots=[shot];m.serial=1;fx.update(m,context);fx.clear(m);fx.update(m,context);
    const cleared=decals.instanceMatrix.version;expect(fx.stats().decals).toBe(0);expect(decals.count).toBe(0);expect(decals.visible).toBe(false);
    for(let i=0;i<10;i++)fx.update(m,context);expect(decals.instanceMatrix.version).toBe(cleared);
    m.shots=[{...shot,id:2,tx:4}];m.serial=2;fx.update(m,context);
    expect(fx.stats().decals).toBe(1);expect(decals.visible).toBe(true);expect(decals.instanceMatrix.version).toBe(cleared+1);
    const visible=new THREE.Matrix4();decals.getMatrixAt(0,visible);expect(decals.count).toBe(1);expect(visible.elements[12]).toBeCloseTo(4);
    m.round++;m.shots=[];fx.update(m,context);expect(fx.stats().decals).toBe(0);const reset=decals.instanceMatrix.version;
    fx.update(m,context);expect(decals.instanceMatrix.version).toBe(reset);fx.dispose();
  });
  it('emits each shot once, advances a short tracer and retains a surface impact', () => {
    const {m,fx,context,shot}=setup(); m.shots=[shot]; m.serial=1;
    fx.update(m,context); const first=fx.stats(); expect(first.emitted).toBe(1); expect(first.traces).toBe(1); expect(first.decals).toBe(1);
    const line=fx.tracerLine.geometry.getAttribute('position'), start=Array.from(line.array);
    m.time=.035; fx.update(m,context); expect(fx.stats().emitted).toBe(1); expect(Array.from(line.array)).not.toEqual(start);
    const a=new THREE.Vector3().fromBufferAttribute(line,0), b=new THREE.Vector3().fromBufferAttribute(line,1);
    expect(a.distanceTo(b)).toBeLessThanOrEqual(9.001);
    m.time=1; fx.update(m,context); expect(fx.stats()).toMatchObject({traces:0,dust:0,flashes:0,decals:1});
    m.time=13; fx.update(m,context); expect(fx.stats().decals).toBe(0); fx.dispose();
  });
  it('bounds automatic fire and reuses GPU resources through clear, phase and match changes', () => {
    const {m,fx,context,shot}=setup(); const geometry=fx.tracerLine.geometry;
    for(let id=1;id<=160;id++){m.serial=id;m.shots=[{...shot,id}];fx.update(m,context);}
    expect(fx.stats().emitted).toBe(160); expect(fx.stats().decals).toBe(48); expect(fx.stats().dust).toBe(32); expect(fx.stats().traces).toBe(64);
    expect(fx.tracerLine.geometry).toBe(geometry); fx.clear(m); fx.update(m,context); expect(fx.stats()).toMatchObject({traces:0,decals:0,dust:0,flashes:0});
    m.serial++;m.shots=[{...shot,id:m.serial}];fx.update(m,context);expect(fx.stats().traces).toBe(1);
    m.phase='match-over';fx.update(m,context,.25);expect(fx.stats().traces).toBe(0);
    const next=createMatch('attack');next.phase='live';next.shots=[shot];next.serial=1;fx.update(next,context);expect(fx.stats().traces).toBe(1);fx.dispose();
  });
  it('suppresses scoped muzzle/ejection and ally hit feedback, while damage causes a short flinch', () => {
    const {m,fx,context,shot}=setup(); context.scoped=true; m.shots=[{...shot,surface:'actor',target:3}];m.serial=1;
    fx.update(m,context);expect(fx.stats()).toMatchObject({flashes:0,casings:0,dust:0,decals:0});expect(fx.flinch(3,m.time)).toBe(0);
    m.shots=[{...shot,id:2,surface:'actor',target:3,damage:27,hit:true}];m.serial=2;fx.update(m,context);
    expect(fx.flinch(3,m.time)).toBeGreaterThan(0);expect(fx.stats().dust).toBe(1);expect(fx.flinch(3,1)).toBe(0);fx.dispose();
  });
  it('maps the first-person muzzle to the identical world-camera pixel for hip/ADS and wide screens', () => {
    for(const aspect of [16/9,32/9]) for(const fov of [78,57]) for(const p of [[.18,-.11,-.52],[.22,-.17,-.88],[.2,-.17,-1.02],[.23,-.13,-1]]) {
      const view=new THREE.PerspectiveCamera(58,aspect,.01,10), world=new THREE.PerspectiveCamera(fov,aspect,.06,250);
      world.position.set(4,1.58,23);world.rotation.set(.12,.4,.007,'YXZ');world.updateMatrixWorld();
      const local=new THREE.Vector3(...p), mapped=projectViewMuzzle(local,view,world,new THREE.Vector3());
      const expected=local.clone().project(view), actual=mapped.clone().project(world);
      expect(Math.abs(actual.x-expected.x)*1920).toBeLessThan(2);expect(Math.abs(actual.y-expected.y)*1080).toBeLessThan(2);
    }
  });
  it('shows the decisive shot even when its simulation step ends the match, then expires on presentation time', () => {
    for(const phase of ['round-over','match-over'] as const) {
      const {m,fx,context,shot}=setup(); fx.update(m,context);
      m.phase=phase;m.serial=1;m.shots=[shot];fx.update(m,context,1/60);
      expect(fx.stats()).toMatchObject({emitted:1,traces:1,flashes:1,decals:1});
      for(let i=0;i<53;i++)fx.update(m,context,.25);
      expect(fx.stats()).toMatchObject({traces:0,flashes:0,dust:0,decals:0});fx.dispose();
    }
  });
});

describe('grenade blast damage records', () => {
  it('draw no tracer, muzzle flash or dust, but still drive the victim flinch', () => {
    const { m, fx, context, shot } = setup();
    m.shots = [{ ...shot, actor: 3, surface: 'actor', target: 0, damage: 40, hit: true, grenade: 'he' }]; m.serial = 1;
    fx.update(m, context);
    expect(fx.stats()).toMatchObject({ traces: 0, dust: 0, flashes: 0 });
    expect(fx.flinch(0, 0)).toBeGreaterThan(0);
    fx.dispose();
  });
});
