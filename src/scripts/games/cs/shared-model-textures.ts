import * as THREE from 'three';

// The asset packer seals identical encoded images with a SHA-256 in glTF image
// extras. GLTFLoader preserves that seal in Texture.userData. Only this owned
// load batch is shared; neither cancelled loads nor renderer instances share a cache.
export function shareModelTextures(models: THREE.Object3D[]) {
  const materials = new Set<THREE.Material>();
  for (const model of models) model.traverse(node => {
    if (node instanceof THREE.Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
  });
  const canonical = new Map<string, { texture: THREE.Texture; signature: string }>();
  const replacements = new Map<THREE.Texture, THREE.Texture>();
  for (const material of materials) for (const value of Object.values(material)) {
    if (!(value instanceof THREE.Texture) || value.userData.csSharedSource === undefined) continue;
    const id = value.userData.csSharedSource;
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid shared texture source seal');
    const signature = JSON.stringify([
      value.constructor.name, value.image?.width, value.image?.height, value.channel,
      value.colorSpace, value.flipY, value.wrapS, value.wrapT, value.magFilter, value.minFilter,
      value.anisotropy, value.format, value.internalFormat, value.type, value.generateMipmaps,
      value.premultiplyAlpha, value.unpackAlignment, value.mapping, value.compareFunction,
      value.offset.toArray(), value.repeat.toArray(), value.center.toArray(), value.rotation,
      value.matrixAutoUpdate, value.matrixAutoUpdate ? null : value.matrix.toArray(), value.mipmaps.length,
    ]);
    const first = canonical.get(id);
    if (!first) canonical.set(id, { texture: value, signature });
    else {
      if (first.signature !== signature) throw new Error(`Incompatible shared texture: ${id}`);
      if (first.texture !== value) replacements.set(value, first.texture);
    }
  }
  // Validate the complete batch first. On failure all original owners still
  // contain their resources and the renderer can release them normally.
  for (const material of materials) for (const [slot, value] of Object.entries(material)) {
    if (value instanceof THREE.Texture && replacements.has(value)) Reflect.set(material, slot, replacements.get(value));
  }
  for (const texture of replacements.keys()) texture.dispose();
  return { shared: replacements.size, unique: canonical.size };
}
