import * as THREE from 'three';

function validateInput(target: THREE.Vector3, pole: THREE.Vector3, orientation?: THREE.Quaternion) {
  if (!Number.isFinite(target.lengthSq()) || !Number.isFinite(pole.lengthSq()) ||
      (orientation && (!Number.isFinite(orientation.lengthSq()) || Math.abs(orientation.lengthSq() - 1) > 1e-4))) {
    throw new Error('IK invalid target, pole or wrist orientation');
  }
}

/** Solves an existing two-bone chain without changing its hierarchy or lengths. */
export class TwoBoneIK {
  private readonly parent: THREE.Object3D | null;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly bendDirection = new THREE.Vector3();
  private readonly wantedMiddle = new THREE.Vector3();
  private readonly wantedEnd = new THREE.Vector3();
  private readonly joint = new THREE.Vector3();
  private readonly current = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly delta = new THREE.Quaternion();
  private readonly orientation = new THREE.Quaternion();
  private readonly mountWristOrientation = new THREE.Quaternion();
  private readonly mountWristTarget = new THREE.Vector3();
  private readonly mountOffset = new THREE.Vector3();
  private readonly mountScale = new THREE.Vector3();
  private upperLength = 0;
  private lowerLength = 0;
  endError = 0;

  constructor(readonly upper: THREE.Bone, readonly lower: THREE.Bone, readonly end: THREE.Bone) {
    this.parent = upper.parent;
    this.measure();
  }

  private measure() {
    if (!this.parent || this.upper.parent !== this.parent || this.lower.parent !== this.upper || this.end.parent !== this.lower) {
      throw new Error('IK requires an unchanged connected two-bone chain');
    }
    for (let node: THREE.Object3D | null = this.end; node; node = node.parent) {
      const { x, y, z } = node.scale;
      if (!Number.isFinite(node.position.lengthSq()) || !Number.isFinite(node.quaternion.lengthSq()) ||
          Math.abs(node.quaternion.lengthSq() - 1) > 1e-4 || !Number.isFinite(x + y + z) ||
          x <= 0 || Math.abs(x - y) > 1e-6 || Math.abs(x - z) > 1e-6) {
        throw new Error('IK requires finite unit rotations and positive uniform scales');
      }
    }
    this.upper.updateWorldMatrix(true, true);
    this.upper.getWorldPosition(this.a); this.lower.getWorldPosition(this.b); this.end.getWorldPosition(this.c);
    this.upperLength = this.a.distanceTo(this.b); this.lowerLength = this.b.distanceTo(this.c);
    if (!Number.isFinite(this.upperLength) || !Number.isFinite(this.lowerLength) || this.upperLength <= 1e-6 || this.lowerLength <= 1e-6) {
      throw new Error('IK requires nonzero finite bone lengths');
    }
  }

  private pointBone(bone: THREE.Bone, child: THREE.Bone, target: THREE.Vector3) {
    bone.getWorldPosition(this.joint);
    child.getWorldPosition(this.current).sub(this.joint).normalize();
    this.desired.copy(target).sub(this.joint).normalize();
    this.delta.setFromUnitVectors(this.current, this.desired);
    bone.getWorldQuaternion(this.orientation);
    this.delta.multiply(this.orientation);
    bone.parent!.getWorldQuaternion(this.orientation).invert();
    bone.quaternion.copy(this.orientation.multiply(this.delta)).normalize();
    bone.updateWorldMatrix(false, true);
  }

  /** Align a rigid non-Bone mount directly under the end bone. Target and
   * orientation describe the mount in world space, not the wrist origin.
   * Positive uniform ancestor scale is included; mount local TRS stays intact.
   * Like solve(), false means a clamped pose was applied, not an atomic refusal.
   */
  solveMount(mount: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, orientation: THREE.Quaternion): boolean {
    this.prepareMount(mount, target, orientation);
    return this.solve(this.mountWristTarget, pole, this.mountWristOrientation);
  }

  /** Read-only pose preflight for coordinated feet or hands. Updates cached
   * world matrices, never local transforms or endError. Unlike solveMount(),
   * rejects a collinear pole instead of choosing a fallback bend direction.
   * Check all participating chains before applying any solve; this is not a
   * reservation and must be repeated if targets or ancestors change.
   */
  canSolveMount(mount: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, orientation: THREE.Quaternion): boolean {
    this.prepareMount(mount, target, orientation);
    validateInput(this.mountWristTarget, pole, this.mountWristOrientation);
    this.measure();
    this.direction.copy(this.mountWristTarget).sub(this.a);
    const requested = this.direction.length(), margin = Math.min(this.upperLength, this.lowerLength) * 1e-5;
    if (requested < Math.abs(this.upperLength - this.lowerLength) + margin || requested > this.upperLength + this.lowerLength - margin) return false;
    this.direction.multiplyScalar(1 / requested);
    this.bendDirection.copy(pole).sub(this.a);
    this.bendDirection.addScaledVector(this.direction, -this.bendDirection.dot(this.direction));
    return this.bendDirection.lengthSq() >= 1e-12;
  }

  private prepareMount(mount: THREE.Object3D, target: THREE.Vector3, orientation: THREE.Quaternion) {
    if (mount instanceof THREE.Bone || mount.parent !== this.end || !mount.matrixAutoUpdate ||
        !Number.isFinite(mount.position.lengthSq()) || !Number.isFinite(mount.quaternion.lengthSq()) ||
        Math.abs(mount.quaternion.lengthSq() - 1) > 1e-4 ||
        !Number.isFinite(mount.scale.lengthSq()) || mount.scale.distanceToSquared(this.mountScale.set(1, 1, 1)) > 1e-12) {
      throw new Error('IK mount must be a finite rigid non-Bone child of the end bone');
    }
    this.mountWristOrientation.copy(mount.quaternion).invert().premultiply(orientation);
    this.end.getWorldScale(this.mountScale);
    this.mountOffset.copy(mount.position).multiply(this.mountScale).applyQuaternion(this.mountWristOrientation);
    this.mountWristTarget.copy(target).sub(this.mountOffset);
  }

  /** World-space target and elbow/knee pole. Returns false for a clamped reach.
   * Caller restores the full animation pose first; IK then constrains that pose.
   * All scratch objects are reused. No bone position/scale or parent is changed.
   */
  solve(target: THREE.Vector3, pole: THREE.Vector3, endOrientation?: THREE.Quaternion): boolean {
    validateInput(target, pole, endOrientation);
    this.measure();
    this.direction.copy(target).sub(this.a);
    const requested = this.direction.length(), margin = Math.min(this.upperLength, this.lowerLength) * 1e-5;
    const minimum = Math.abs(this.upperLength - this.lowerLength) + margin;
    const maximum = this.upperLength + this.lowerLength - margin;
    const distance = THREE.MathUtils.clamp(requested, minimum, maximum);
    if (requested > 1e-12) this.direction.multiplyScalar(1 / requested);
    else {
      this.direction.copy(this.c).sub(this.a);
      if (this.direction.lengthSq() < 1e-12) this.direction.set(0, 0, 1);
      this.direction.normalize();
    }
    this.bendDirection.copy(pole).sub(this.a);
    this.bendDirection.addScaledVector(this.direction, -this.bendDirection.dot(this.direction));
    if (this.bendDirection.lengthSq() < 1e-12) {
      // Deterministic orthogonal fallback for a degenerate pole.
      const { x, y, z } = this.direction;
      if (Math.abs(x) <= Math.abs(y) && Math.abs(x) <= Math.abs(z)) this.bendDirection.set(1, 0, 0);
      else if (Math.abs(y) <= Math.abs(z)) this.bendDirection.set(0, 1, 0);
      else this.bendDirection.set(0, 0, 1);
      this.bendDirection.addScaledVector(this.direction, -this.bendDirection.dot(this.direction));
    }
    this.bendDirection.normalize();
    const along = (this.upperLength ** 2 - this.lowerLength ** 2 + distance ** 2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, this.upperLength ** 2 - along ** 2));
    this.wantedMiddle.copy(this.a).addScaledVector(this.direction, along).addScaledVector(this.bendDirection, height);
    this.wantedEnd.copy(this.a).addScaledVector(this.direction, distance);
    if (!Number.isFinite(this.wantedMiddle.lengthSq()) || !Number.isFinite(this.wantedEnd.lengthSq())) {
      throw new Error('IK target exceeds the finite calculation range');
    }
    this.pointBone(this.upper, this.lower, this.wantedMiddle);
    this.pointBone(this.lower, this.end, this.wantedEnd);
    if (endOrientation) {
      this.end.parent!.getWorldQuaternion(this.orientation).invert();
      this.end.quaternion.copy(this.orientation.multiply(endOrientation)).normalize();
      this.end.updateWorldMatrix(false, true);
    }
    this.endError = this.end.getWorldPosition(this.c).distanceTo(target);
    return requested >= minimum && requested <= maximum;
  }
}
