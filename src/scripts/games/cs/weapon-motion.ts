import * as THREE from 'three';
import { supportHeight } from './elevation';
import { WEAPONS, type Actor, type WeaponId } from './engine';

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
function ramp(value: number, start: number, end: number) {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}
export interface ReloadPose {
  progress: number; lower: number; magazineDrop: number; magazineVisible: boolean;
  supportReach: number; supportChamber: number; chamber: number;
}
/** Authoritative reload seconds drive a normalized, continuous visual sequence. */
export function reloadPose(weapon: WeaponId, remaining: number, out: ReloadPose = { progress: 0, lower: 0, magazineDrop: 0, magazineVisible: true, supportReach: 0, supportChamber: 0, chamber: 0 }) {
  const t = 1 - clamp(remaining / WEAPONS[weapon].reload);
  out.progress = t;
  out.lower = ramp(t, 0, .16) - ramp(t, .86, 1);
  out.magazineDrop = (ramp(t, .18, .42) - ramp(t, .54, .76)) * .26;
  out.magazineVisible = t <= .42 || t >= .54;
  out.supportReach = ramp(t, .02, .18) - ramp(t, .76, .88);
  out.supportChamber = ramp(t, .77, .83) - ramp(t, .90, .98);
  out.chamber = ramp(t, .80, .85) - ramp(t, .86, .91);
  return out;
}
export class WeaponMotion {
  aim = 0;
  readonly offset = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 };
  readonly reload = reloadPose('pistol', 0);
  private moving = 0;
  private stride = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private swayYaw = 0;
  private swayPitch = 0;
  private hasLook = false;
  update(actor: Actor, time: number, dt: number, aiming: boolean, reduced: boolean, active = true) {
    // Results can freeze authoritative reload time; cancel the pose before the pause guard.
    if (!active) { this.reset(); return; }
    if (dt <= 0) return;
    const blend = 1 - Math.exp(-dt * 14);
    this.aim += (Number(aiming && actor.reload <= 0) - this.aim) * blend;
    const grounded = actor.y - supportHeight(actor.x, actor.z, actor.y) < .02;
    this.moving += (Number(actor.moving && grounded) - this.moving) * (1 - Math.exp(-dt * 10));
    this.stride += dt * 10.5;
    const yawDelta = this.hasLook ? Math.atan2(Math.sin(actor.yaw - this.lastYaw), Math.cos(actor.yaw - this.lastYaw)) : 0;
    const pitchDelta = this.hasLook ? actor.pitch - this.lastPitch : 0;
    this.lastYaw = actor.yaw; this.lastPitch = actor.pitch; this.hasLook = true;
    this.swayYaw += (clamp(yawDelta / dt, -3, 3) * .003 - this.swayYaw) * blend;
    this.swayPitch += (clamp(pitchDelta / dt, -3, 3) * .002 - this.swayPitch) * blend;
    reloadPose(actor.weapon, actor.reload, this.reload);
    if (reduced) {
      this.swayYaw = this.swayPitch = 0;
      this.offset.x = this.offset.y = this.offset.z = this.offset.pitch = this.offset.yaw = this.offset.roll = 0;
      return;
    }
    const amplitude = (1 - this.aim * .88) * (1 - this.reload.lower * .8);
    const walk = this.moving * amplitude;
    this.offset.x = (Math.sin(time * 1.3) * .001 + this.swayYaw) * amplitude + Math.sin(this.stride) * .009 * walk;
    this.offset.y = (Math.cos(time * 1.8) * .0008 - this.swayPitch) * amplitude + Math.cos(this.stride * 2) * .006 * walk;
    this.offset.z = Math.sin(this.stride * 2) * .003 * walk;
    this.offset.pitch = this.swayPitch * 1.5 * amplitude;
    this.offset.yaw = this.swayYaw * 1.5 * amplitude;
    this.offset.roll = Math.sin(this.stride) * .018 * walk - this.swayYaw * 1.5 * amplitude;
  }
  reset() {
    this.aim = this.moving = this.stride = this.swayYaw = this.swayPitch = 0;
    this.hasLook = false;
    this.offset.x = this.offset.y = this.offset.z = this.offset.pitch = this.offset.yaw = this.offset.roll = 0;
    reloadPose('pistol', 0, this.reload);
  }
}

interface Part {
  node: THREE.Object3D; position: THREE.Vector3; rotation: THREE.Quaternion; visible: boolean;
  // Maps gun-local displacements into this imported node's parent coordinates.
  fromGun: THREE.Matrix3;
}
/** Optional GLB parts are bound once; applying motion allocates no scene resources. */
export class WeaponRig {
  get hasSkeletalReload() { return this.mixer !== undefined; }
  private readonly mixer?: THREE.AnimationMixer;
  private readonly reloadAction?: THREE.AnimationAction;
  private readonly parts: Part[] = [];
  private readonly magazine?: Part;
  private readonly support?: Part;
  private readonly slide?: Part;
  private readonly bolt?: Part;
  private readonly trigger?: Part;
  private readonly magazineReach = new THREE.Vector3();
  private readonly chamberReach = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3(1, 0, 0);
  constructor(root: THREE.Object3D) {
    root.updateWorldMatrix(true, true);
    const clip = root.animations.find(clip => clip.name === 'fps_reload');
    if (clip) {
      this.mixer = new THREE.AnimationMixer(root);
      this.reloadAction = this.mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
      this.reloadAction.clampWhenFinished = true;
      this.reloadAction.play();
    }
    const bind = (name: string) => {
      let node = root.getObjectByName(name);
      if (!node) {
        let matches = 0;
        root.traverse(candidate => {
          if (candidate.name.endsWith(`_${name}`)) { node = candidate; matches++; }
        });
        if (matches !== 1) return undefined;
      }
      if (!node?.parent) return undefined;
      const transform = node.parent.matrixWorld.clone().invert().multiply(root.matrixWorld);
      const part = { node, position: node.position.clone(), rotation: node.quaternion.clone(), visible: node.visible, fromGun: new THREE.Matrix3().setFromMatrix4(transform) };
      this.parts.push(part); return part;
    };
    this.magazine = bind('Magazine'); this.support = this.mixer ? undefined : bind('support_hand');
    this.slide = bind('Slide'); this.bolt = bind('Bolt'); this.trigger = bind('Trigger');
    if (this.support) {
      const palm = root.worldToLocal(this.support.node.getWorldPosition(new THREE.Vector3()));
      if (this.magazine) {
        const box = new THREE.Box3().setFromObject(this.magazine.node);
        const center = box.isEmpty() ? this.magazine.node.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
        this.magazineReach.copy(root.worldToLocal(center)).sub(palm);
        this.magazineReach.x -= .035;
      }
      const chamber = root.getObjectByName('ejection_port');
      if (chamber) this.chamberReach.copy(root.worldToLocal(chamber.getWorldPosition(new THREE.Vector3()))).sub(palm).add(new THREE.Vector3(-.025, .025, .015));
    }
  }
  private translate(part: Part | undefined, x: number, y: number, z: number) {
    if (part) part.node.position.add(this.offset.set(x, y, z).applyMatrix3(part.fromGun));
  }
  apply(pose: ReloadPose, shotAge: number, weapon: WeaponId) {
    this.reset();
    if (this.mixer && this.reloadAction) {
      this.reloadAction.enabled = true; this.reloadAction.paused = false;
      this.mixer.setTime(pose.progress * this.reloadAction.getClip().duration);
    }
    if (this.magazine) {
      this.translate(this.magazine, 0, -pose.magazineDrop, pose.magazineDrop * .12);
      this.magazine.node.visible = this.magazine.visible && pose.magazineVisible;
    }
    const reach = pose.supportReach * (1 - pose.supportChamber), chamber = pose.supportChamber;
    if (this.support) {
      this.translate(this.support,
        this.magazineReach.x * reach + this.chamberReach.x * chamber,
        (this.magazineReach.y - pose.magazineDrop) * reach + this.chamberReach.y * chamber,
        (this.magazineReach.z + pose.magazineDrop * .12) * reach + this.chamberReach.z * chamber);
    }
    const shot = shotAge >= 0 ? ramp(shotAge, 0, .012) - ramp(shotAge, .025, .095) : 0;
    const boltCycle = weapon === 'sniper' && shotAge >= 0 ? ramp(shotAge, .10, .30) - ramp(shotAge, .40, .64) : shot;
    this.translate(this.slide, 0, 0, Math.max(pose.chamber, shot) * .035);
    this.translate(this.bolt, 0, 0, Math.max(pose.chamber, boltCycle) * (weapon === 'sniper' ? .085 : .028));
    if (this.trigger && shot > 0) this.trigger.node.quaternion.multiply(this.rotation.setFromAxisAngle(this.axis, -.08 * shot));
  }
  reset() {
    if (this.mixer && this.reloadAction) {
      this.reloadAction.enabled = true; this.reloadAction.paused = false;
      this.mixer.setTime(0);
    }
    for (const part of this.parts) {
      part.node.position.copy(part.position); part.node.quaternion.copy(part.rotation); part.node.visible = part.visible;
    }
  }
  dispose() { this.mixer?.stopAllAction(); if(this.mixer)this.mixer.uncacheRoot(this.mixer.getRoot()); }
}
