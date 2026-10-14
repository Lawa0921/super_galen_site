import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cloneActorModel, equipActorModel } from './presentation';
import { disposeModelResources } from './model-resources';

function riggedModel() {
  const model = new THREE.Group();
  const root = new THREE.Bone(), hand = new THREE.Bone();
  root.name = 'root'; hand.name = 'hand'; hand.position.y = 1;
  root.add(hand); model.add(root); model.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([root, hand]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([1, 1, 0], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([1, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  for (const name of ['body', 'shirt']) {
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = name; model.add(mesh); mesh.bind(skeleton);
  }
  model.updateMatrixWorld(true);
  return { model, skeleton, geometry, material, texture };
}
const mesh = (model: THREE.Object3D, name = 'body') => model.getObjectByName(name) as THREE.SkinnedMesh;
const vertex = (model: THREE.Object3D) => {
  model.updateMatrixWorld(true);
  return mesh(model).applyBoneTransform(0, new THREE.Vector3(1, 1, 0));
};

describe('model instance ownership', () => {
  it('animates one actor without moving a second actor or the loaded source', () => {
    const source = riggedModel();
    const first = cloneActorModel(source.model), second = cloneActorModel(source.model);
    const rest = vertex(source.model);
    expect(vertex(first).distanceTo(rest)).toBeLessThan(1e-12);
    first.getObjectByName('hand')!.rotation.z = Math.PI / 2;
    expect(vertex(first).distanceTo(rest)).toBeGreaterThan(1);
    expect(vertex(second).distanceTo(rest)).toBeLessThan(1e-12);
    expect(vertex(source.model).distanceTo(rest)).toBeLessThan(1e-12);
    expect(mesh(first).skeleton).not.toBe(source.skeleton);
    expect(mesh(first).skeleton).not.toBe(mesh(second).skeleton);
  });

  it('shares one instance skeleton between garments, with private bone textures', () => {
    const source = riggedModel(); source.skeleton.computeBoneTexture();
    const first = cloneActorModel(source.model), second = cloneActorModel(source.model);
    const a = mesh(first).skeleton, b = mesh(second).skeleton;
    expect(a).toBe(mesh(first, 'shirt').skeleton);
    expect(a.boneTexture).toBeNull(); expect(b.boneTexture).toBeNull();
    a.computeBoneTexture(); b.computeBoneTexture();
    expect(a.boneTexture).not.toBe(b.boneTexture);
    expect(a.boneTexture).not.toBe(source.skeleton.boneTexture);
    expect(a.boneMatrices).not.toBe(b.boneMatrices);
  });

  it('preserves material sharing within one model while isolating actor colors', () => {
    const source = riggedModel();
    const first = cloneActorModel(source.model), second = cloneActorModel(source.model);
    const material = mesh(first).material as THREE.MeshStandardMaterial;
    expect(material).toBe(mesh(first, 'shirt').material);
    expect(material).not.toBe(source.material);
    expect(material).not.toBe(mesh(second).material);
    material.color.setHex(0x883322);
    expect(source.material.color.getHex()).toBe(0xffffff);
    expect((mesh(second).material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xffffff);
    expect(mesh(first).geometry).toBe(source.geometry);
    expect(material.map).toBe(source.texture);
  });

  it('preserves transformed import roots, bind matrices and distinct skeletons', () => {
    const source = riggedModel();
    source.model.rotation.x = -.5; source.model.position.set(1, 2, 3);
    const extra = new THREE.Bone(); extra.name = 'separate'; source.model.add(extra);
    source.model.updateMatrixWorld(true);
    mesh(source.model, 'shirt').bind(new THREE.Skeleton([extra]));
    const cloned = cloneActorModel(source.model);
    expect(cloned.position.toArray()).toEqual(source.model.position.toArray());
    expect(cloned.quaternion.toArray()).toEqual(source.model.quaternion.toArray());
    expect(mesh(cloned).bindMatrix.elements).toEqual(mesh(source.model).bindMatrix.elements);
    expect(mesh(cloned).skeleton).not.toBe(mesh(cloned, 'shirt').skeleton);
    expect(mesh(cloned, 'shirt').skeleton.bones[0]).toBe(cloned.getObjectByName('separate'));
    mesh(cloned).skeleton.boneInverses[0].makeTranslation(9, 8, 7);
    expect(source.skeleton.boneInverses[0].elements).toEqual(new THREE.Matrix4().elements);
  });

  it('releases replaced weapon skeletons and instance materials without freeing shared maps or geometry', () => {
    const source = riggedModel(), actor = new THREE.Group();
    equipActorModel(actor, source.model, 'rifle');
    const first = actor.getObjectByName('held-weapon')!;
    const skeleton = mesh(first).skeleton; skeleton.computeBoneTexture();
    let bones = 0, materials = 0, textures = 0, geometries = 0;
    skeleton.boneTexture!.addEventListener('dispose', () => bones++);
    (mesh(first).material as THREE.Material).addEventListener('dispose', () => materials++);
    source.texture.addEventListener('dispose', () => textures++);
    source.geometry.addEventListener('dispose', () => geometries++);
    equipActorModel(actor, source.model, 'smg');
    expect(bones).toBe(1); expect(materials).toBe(1);
    expect(textures).toBe(0); expect(geometries).toBe(0);
    expect(first.parent).toBeNull();
    expect(mesh(actor.getObjectByName('held-weapon')!).skeleton).not.toBe(skeleton);
  });

  it('releases all bone textures, materials and shared assets once at renderer shutdown', () => {
    const source = riggedModel();
    const first = cloneActorModel(source.model), second = cloneActorModel(source.model);
    let bones = 0, materials = 0, textures = 0, geometries = 0;
    for (const model of [source.model, first, second]) {
      const skeleton = mesh(model).skeleton; skeleton.computeBoneTexture();
      skeleton.boneTexture!.addEventListener('dispose', () => bones++);
      (mesh(model).material as THREE.Material).addEventListener('dispose', () => materials++);
    }
    source.texture.addEventListener('dispose', () => textures++);
    source.geometry.addEventListener('dispose', () => geometries++);
    const scene = new THREE.Scene(); scene.add(first, second);
    // The renderer passes scenes plus source caches; a shared node may appear twice.
    disposeModelResources([scene, first, source.model], [source.texture]);
    expect(bones).toBe(3); expect(materials).toBe(3);
    expect(textures).toBe(1); expect(geometries).toBe(1);
    expect(mesh(first).skeleton.boneTexture).toBeNull();
  });

  it('keeps source textures alive across repeated weapon replacements', () => {
    const source = riggedModel(), actor = new THREE.Group();
    let disposed = 0, sourceDisposed = 0;
    source.texture.addEventListener('dispose', () => sourceDisposed++);
    for (let i = 0; i < 40; i++) {
      equipActorModel(actor, source.model, i % 2 ? 'smg' : 'rifle');
      const skeleton = mesh(actor.getObjectByName('held-weapon')!).skeleton;
      skeleton.computeBoneTexture();
      skeleton.boneTexture!.addEventListener('dispose', () => disposed++);
      expect(disposed).toBe(i);
    }
    expect(sourceDisposed).toBe(0);
    disposeModelResources([actor, source.model]);
    expect(disposed).toBe(40); expect(sourceDisposed).toBe(1);
  });
});
