import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

// Keep the complete bone hierarchy under source. Geometry and image maps belong
// to the loaded asset; materials and bone palettes belong to each instance.
export function cloneModel<T extends THREE.Object3D>(source: T): T {
  const sourceSkeletons: THREE.Skeleton[] = [];
  source.traverse(node => { if (node instanceof THREE.SkinnedMesh) sourceSkeletons.push(node.skeleton); });
  const model = cloneSkeleton(source) as T;
  const materials = new Map<THREE.Material, THREE.Material>();
  const skeletons = new Map<THREE.Skeleton, THREE.Skeleton>();
  const cloneMaterial = (material: THREE.Material) => {
    if (!materials.has(material)) {
      // Material.copy() drops shader patches; keep them with the instance.
      const copy = material.clone();
      if (Object.hasOwn(material, 'onBeforeCompile')) copy.onBeforeCompile = material.onBeforeCompile;
      if (Object.hasOwn(material, 'customProgramCacheKey')) copy.customProgramCacheKey = material.customProgramCacheKey;
      materials.set(material, copy);
    }
    return materials.get(material)!;
  };
  let skinIndex = 0;
  model.traverse(node => {
    if (node instanceof THREE.Mesh) {
      node.material = Array.isArray(node.material) ? node.material.map(cloneMaterial) : cloneMaterial(node.material);
    }
    if (node instanceof THREE.SkinnedMesh) {
      const original = sourceSkeletons[skinIndex++];
      // SkeletonUtils creates a skeleton per mesh. Garments sharing the same
      // source skeleton should also share one bone palette within this actor.
      if (!skeletons.has(original)) {
        node.skeleton.boneInverses = node.skeleton.boneInverses.map(matrix => matrix.clone());
        skeletons.set(original, node.skeleton);
      }
      node.skeleton = skeletons.get(original)!;
    }
  });
  return model;
}

// Removing a weapon/actor must leave its source and other live instances usable.
export function disposeModelInstance(model: THREE.Object3D) {
  const materials = new Set<THREE.Material>(), skeletons = new Set<THREE.Skeleton>();
  model.traverse(node => {
    if (node instanceof THREE.Mesh) {
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    }
    if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
  });
  materials.forEach(material => material.dispose());
  skeletons.forEach(skeleton => skeleton.dispose());
}

export function disposeModelResources(objects: THREE.Object3D[], textures: THREE.Texture[] = []) {
  const seen = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  const disposeTexture = (texture: THREE.Texture) => { if (!seen.has(texture)) { seen.add(texture); texture.dispose(); } };
  for (const object of objects) object.traverse(node => {
    if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
    if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
      if (!seen.has(node.geometry)) { seen.add(node.geometry); node.geometry.dispose(); }
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (!seen.has(material)) {
        seen.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture) disposeTexture(value);
        material.dispose();
      }
    }
  });
  for (const skeleton of skeletons) {
    // The palette may also be supplied as an explicitly owned texture.
    if (skeleton.boneTexture) {
      disposeTexture(skeleton.boneTexture);
      skeleton.boneTexture = null;
    }
    skeleton.dispose();
  }
  textures.forEach(disposeTexture);
}
