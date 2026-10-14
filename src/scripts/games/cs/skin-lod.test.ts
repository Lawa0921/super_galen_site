import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { createSkinLodGeometry, bindSkinLod } from './skin-lod';

function source() {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
  geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(new Uint16Array(16), 4));
  geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(new Float32Array(16), 4));
  geometry.setIndex([0, 1, 2, 0, 2, 3]); return geometry;
}
describe('candidate skin LOD', () => {
  it('shares protected vertex streams, owns only a separate index, and never rewrites the source', () => {
    const original = source(), before = original.index!, indices = new Uint16Array([0, 1, 2]);
    const reduced = createSkinLodGeometry(original, indices);
    expect(reduced).not.toBe(original); expect(reduced.index).not.toBe(before);
    expect(reduced.attributes).toEqual(original.attributes);
    for (const key of Object.keys(original.attributes)) expect(reduced.attributes[key]).toBe(original.attributes[key]);
    indices[0] = 3; expect(reduced.index!.getX(0)).toBe(0); expect(original.index).toBe(before);
    expect(() => createSkinLodGeometry(original, new Uint16Array([0, 1, 8]))).toThrow();
  });
  it('switches each actor independently with a one-metre hysteresis and restores the exact near geometry', () => {
    const original = source(), reduced = createSkinLodGeometry(original, new Uint16Array([0, 1, 2]));
    const a = new T.Mesh(original), b = new T.Mesh(original);
    const updateA = bindSkinLod(a, reduced), updateB = bindSkinLod(b, reduced);
    expect(updateA(8, 78)).toBe(true); expect(a.geometry).toBe(reduced); expect(b.geometry).toBe(original);
    expect(updateA(7.5, 78)).toBe(true); expect(updateB(7.5, 78)).toBe(false);
    expect(updateA(7, 78)).toBe(true); expect(updateA(6.99, 78)).toBe(false); expect(a.geometry).toBe(original);
    expect(original.index!.count).toBe(6);
  });
  it('protects zoomed detail and immediately handles camera teleports or invalid distance', () => {
    const original = source(), reduced = createSkinLodGeometry(original, new Uint16Array([0, 1, 2]));
    const actor = new T.Mesh(original), update = bindSkinLod(actor, reduced);
    expect(update(20, 78)).toBe(true); expect(update(20, 25)).toBe(false);
    expect(update(200, 25)).toBe(true); expect(update(.2, 78)).toBe(false);
    expect(update(20, 78)).toBe(true); expect(update(NaN, 78)).toBe(false);
    expect(update(20, 0)).toBe(false); expect(actor.geometry).toBe(original);
  });
  it('rejects material groups rather than silently dropping material-array draw semantics', () => {
    const original = source(); original.addGroup(0, 6, 0);
    expect(() => createSkinLodGeometry(original, new Uint16Array([0, 1, 2]))).toThrow();
  });
});
