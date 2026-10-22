import * as THREE from 'three';
import type { Actor } from './engine';
import type { GrenadeId } from './grenades';
import { cloneModel, disposeModelInstance } from './model-resources';
import { viewmodelPose } from './utility-visuals';

const NODE: Record<GrenadeId, string> = { he: 'he_grenade', flash: 'flashbang', smoke: 'smoke_grenade' };
// Rest hold in camera space (metres), from the pistol's hip pose: lower right,
// grenade at chest height. Tuned against real-renderer captures.
export const GRENADE_HOLD = { position: [.12, -.155, -.43] as const, rotation: [.22, .3, -.1] as const };
// Grenade placement in the closed right fist, relative to the pistol's right_grip anchor.
const IN_HAND = { offset: [-.004, .028, -.004] as const, rotation: [.32, 0, -.12] as const };

/** First-person grenade hold built from the approved FPS arm rig of the pistol
 * asset: the pistol meshes are hidden, the licensed CC0 grenade is parented to
 * the right hand bone, and the whole hold moves procedurally (draw, pin pull,
 * cock, release and follow-through). No mesh is generated. */
export class GrenadeViewmodel {
  readonly root = new THREE.Group();
  private readonly arms: THREE.Group;
  private readonly held = new Map<GrenadeId, { body: THREE.Object3D; pin?: THREE.Object3D }>();
  private readonly owned: THREE.Object3D[] = [];
  constructor(pistol: THREE.Group, grenades: THREE.Group) {
    this.arms = cloneModel(pistol); this.owned.push(this.arms);
    this.arms.traverse(node => { if (node instanceof THREE.Mesh && !(node instanceof THREE.SkinnedMesh)) node.visible = false; node.frustumCulled = false; });
    this.root.add(this.arms); this.root.updateMatrixWorld(true);
    const hand = this.arms.getObjectByName('fps_hand_R'), grip = this.arms.getObjectByName('right_grip');
    if (!hand || !grip) throw new Error('FPS arm rig is missing fps_hand_R/right_grip');
    const anchor = new THREE.Object3D(); this.arms.add(anchor);
    anchor.position.copy(grip.position).add(new THREE.Vector3(...IN_HAND.offset)); anchor.rotation.set(...IN_HAND.rotation);
    for (const id of ['he', 'flash', 'smoke'] as const) {
      const source = grenades.getObjectByName(NODE[id]);
      if (!source) throw new Error(`Missing grenade model ${NODE[id]}`);
      const wrapper = new THREE.Group(); wrapper.add(source.clone());
      const body = cloneModel(wrapper); this.owned.push(body);
      body.traverse(node => { node.frustumCulled = false; });
      anchor.add(body); this.root.updateMatrixWorld(true);
      // Keep the authored world placement, now following the animated hand bone.
      hand.attach(body); body.visible = false;
      this.held.set(id, { body, pin: body.getObjectByName(`${NODE[id]}_pin`) ?? undefined });
    }
    anchor.removeFromParent();
    this.root.visible = false;
  }
  update(actor: Pick<Actor, 'held' | 'heldAt' | 'primedAt' | 'thrownAt' | 'hp'>, time: number, sway = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 }) {
    const kind = actor.held, drawn = !!kind && kind !== 'gun' && actor.hp > 0;
    this.root.visible = drawn;
    if (!drawn) return;
    const pose = viewmodelPose(actor, time);
    for (const [id, part] of this.held) {
      part.body.visible = id === kind && pose.visible;
      if (part.pin) part.pin.visible = pose.pin;
    }
    const [x, y, z] = GRENADE_HOLD.position, [pitch, yaw, roll] = GRENADE_HOLD.rotation;
    this.root.position.set(x + pose.x + sway.x, y + pose.y + sway.y, z + pose.z + sway.z);
    this.root.rotation.set(pitch + pose.pitch + sway.pitch, yaw + sway.yaw, roll + pose.roll + sway.roll);
  }
  /** Loading-time warm-up: every grenade body visible in the real view scene. */
  prime() { this.root.visible = true; for (const part of this.held.values()) part.body.visible = true; }
  dispose() { for (const object of this.owned) disposeModelInstance(object); this.root.clear(); }
}
