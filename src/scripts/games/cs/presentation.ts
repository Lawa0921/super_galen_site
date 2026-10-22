import * as THREE from 'three';
import { cloneModel, disposeModelInstance } from './model-resources';
import type { Team } from './engine';
export function isScopeActive(weapon: string, aiming: boolean, hp: number, phase: string, reload = 0) {
  return weapon === 'sniper' && aiming && hp > 0 && phase === 'live' && reload <= 0;
}
export function cloneActorModel(source: THREE.Group) {
  return cloneModel(source);
}
export function animateActorLegs(model: THREE.Object3D, time: number, moving: boolean) {
  for (const side of ['left', 'right']) {
    const leg = model.getObjectByName(`${side}_leg`);
    if (leg) {
      const rest = leg.userData.restRotationX ??= leg.rotation.x;
      leg.rotation.x = rest + (moving ? Math.sin(time * 11 + (side === 'left' ? 0 : Math.PI)) * .32 : 0);
    }
  }
}
const actorShoulder = new THREE.Vector3(0, 1.447, .012);
const actorAimRigs = new WeakMap<THREE.Object3D, { upper: THREE.Group; arms: THREE.Group; head?: THREE.Group }>();
function actorAimRig(model: THREE.Object3D) {
  const cached = actorAimRigs.get(model);
  if (cached) return cached;
  // These joint positions come from the authored soldier, in actor Y-up space.
  // attach preserves imported rest matrices, including the GLB's rotated root.
  const arms = new THREE.Group(); arms.name = 'actor-aim'; arms.position.copy(actorShoulder); model.add(arms);
  for (const side of ['left', 'right']) {
    const arm = model.getObjectByName(`${side}_arm`);
    if (arm) arms.attach(arm);
  }
  const originalHead = model.getObjectByName('head');
  let head: THREE.Group | undefined;
  if (originalHead) {
    head = new THREE.Group(); head.name = 'actor-head-aim'; head.position.set(0, 1.57, 0); model.add(head); head.attach(originalHead);
  }
  // Leave both authored hip/leg transforms outside the hit reaction. Everything
  // above them, including the aim joints and held gun, responds around the waist.
  const legs = ['left_leg', 'right_leg'].map(name => model.getObjectByName(name)).filter((leg): leg is THREE.Object3D => !!leg);
  for (const leg of legs) model.attach(leg);
  const upper = new THREE.Group(); upper.name = 'actor-upper-body'; upper.position.set(0, 1.02, .016); model.add(upper);
  for (const child of [...model.children]) if (child !== upper && !legs.includes(child)) upper.attach(child);
  const rig = { upper, arms, head }; actorAimRigs.set(model, rig); return rig;
}
export function animateActorAim(model: THREE.Object3D, pitch: number, flinch = 0) {
  const rig = actorAimRig(model), angle = Number.isFinite(pitch) ? THREE.MathUtils.clamp(pitch, -1.55, 1.55) : 0;
  const impact = Number.isFinite(flinch) ? THREE.MathUtils.clamp(flinch, 0, 1) : 0;
  rig.upper.rotation.set(impact * .10, 0, impact * .035);
  rig.arms.rotation.x = angle;
  if (rig.head) rig.head.rotation.x = THREE.MathUtils.clamp(angle, -.65, .65);
}
export function frameSeconds(milliseconds: number) {
  return Math.max(0, Math.min(.25, milliseconds / 1000));
}
export function formatClock(seconds: number) {
  const total = Math.ceil(Math.max(0, seconds));
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}
export function equipActorModel(actor: THREE.Object3D, source: THREE.Group, weapon: string) {
  if (actor.userData.weapon === weapon) return;
  const previous = actor.getObjectByName('held-weapon');
  if (previous) {
    disposeModelInstance(previous);
    previous.removeFromParent();
  }
  const gun = cloneModel(source); gun.name = 'held-weapon';
  gun.traverse(object => {
    if (/view_hands/i.test(object.name)) object.visible = false;
  });
  gun.position.set(.15, 1.13, -.22); gun.scale.setScalar(weapon === 'rifle' ? .72 : 1);
  const rig = actorAimRig(actor);
  gun.position.sub(actorShoulder); rig.arms.add(gun); actor.userData.weapon = weapon;
}
export function syncTeamColor(model: THREE.Object3D, team: Team) {
  if (model.userData.team === team) return;
  model.userData.team = team;
  // Only the authored identification patches carry team color. The helmet
  // and combat_team_uniform names describe source materials, not tint masks.
  model.traverse(object => { if (object instanceof THREE.Mesh) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) if (mat.name === 'team_color' && mat instanceof THREE.MeshStandardMaterial) mat.color.set(team === 'attack' ? 0x996044 : 0x527386); });
}
export function resultReason(reason: string, won: boolean) {
  if (reason === 'eliminated') return won ? '對方小隊已全滅' : '我方小隊已全滅';
  return ({ defused: '炸彈已拆除 · 守方獲勝', exploded: '目標已引爆 · 攻方獲勝', timeout: '時間到 · 守方守住了據點', eliminated: '對方小隊已全滅' } as Record<string,string>)[reason] ?? '';
}
