import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { shareModelTextures } from './shared-model-textures';
import { cloneModel, disposeModelInstance, disposeModelResources } from './model-resources';

function asset(id = 'a'.repeat(64)) {
  const texture = new THREE.Texture({ width: 512, height: 512 });
  texture.userData.csSharedSource = id; texture.flipY = false;
  const material = new THREE.MeshStandardMaterial({ roughnessMap: texture, metalnessMap: texture });
  const model = new THREE.Group(); model.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  return { texture, material, model, dispose: vi.spyOn(texture, 'dispose') };
}

describe('shared authored texture ownership', () => {
  it('shares verified maps across weapon assets, retains material identity, and releases each resource once', () => {
    const a = asset(), b = asset(), c = asset('b'.repeat(64));
    expect(shareModelTextures([a.model, b.model, c.model])).toEqual({ shared: 1, unique: 2 });
    expect(b.material.roughnessMap).toBe(a.texture); expect(b.material.metalnessMap).toBe(a.texture);
    expect(b.material).not.toBe(a.material); expect(c.material.roughnessMap).toBe(c.texture);
    expect(b.dispose).toHaveBeenCalledTimes(1); expect(a.dispose).not.toHaveBeenCalled();
    const instance = cloneModel(b.model); disposeModelInstance(instance);
    expect(a.dispose).not.toHaveBeenCalled();
    disposeModelResources([a.model, b.model, c.model]);
    expect(a.dispose).toHaveBeenCalledTimes(1); expect(b.dispose).toHaveBeenCalledTimes(1); expect(c.dispose).toHaveBeenCalledTimes(1);
  });
  it.each(['colorSpace', 'flipY', 'wrapS', 'channel', 'offset', 'dimensions'])('rejects conflicting %s before any replacement or disposal', property => {
    const a = asset(), b = asset(), invalid = asset();
    if (property === 'colorSpace') invalid.texture.colorSpace = THREE.SRGBColorSpace;
    if (property === 'flipY') invalid.texture.flipY = true;
    if (property === 'wrapS') invalid.texture.wrapS = THREE.RepeatWrapping;
    if (property === 'channel') invalid.texture.channel = 1;
    if (property === 'offset') invalid.texture.offset.x = .5;
    if (property === 'dimensions') invalid.texture.image = { width: 128, height: 128 };
    expect(() => shareModelTextures([a.model, b.model, invalid.model])).toThrow('Incompatible shared texture');
    expect(b.material.roughnessMap).toBe(b.texture); expect(invalid.material.roughnessMap).toBe(invalid.texture);
    for (const item of [a, b, invalid]) expect(item.dispose).not.toHaveBeenCalled();
  });
  it('leaves unmarked maps alone and keeps the cache private to one asset load', () => {
    const a = asset(), b = asset(), unmarked = asset(); delete unmarked.texture.userData.csSharedSource;
    shareModelTextures([a.model, unmarked.model]); shareModelTextures([b.model]);
    expect(unmarked.material.roughnessMap).toBe(unmarked.texture); expect(b.material.roughnessMap).toBe(b.texture);
    expect(unmarked.dispose).not.toHaveBeenCalled(); expect(b.dispose).not.toHaveBeenCalled();
  });
  it('rejects a malformed source seal without mutating its owner', () => {
    const a = asset('invalid');
    expect(() => shareModelTextures([a.model])).toThrow('Invalid shared texture');
    expect(a.dispose).not.toHaveBeenCalled();
  });
});
