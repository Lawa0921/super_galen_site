import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';
import * as THREE from 'three';
import { applyPlasterDetail, PLASTER_DETAIL_KEY } from './plaster-detail';

const root = 'public/assets/games/cs';
const PLASTER = ['sunbleached_plaster', 'ochre_plaster', 'aged_sand_plaster'];
type Material = { name: string; occlusionTexture?: { index: number; texCoord?: number; strength?: number; extensions?: Record<string, { scale: number[] }> }; extras?: Record<string, unknown>; normalTexture?: unknown; pbrMetallicRoughness?: { baseColorTexture?: unknown } };
function gltf(name: string) {
  const bytes = readFileSync(join(root, `${name}.glb`));
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
}
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]);
}

describe('environment plaster wall detail (V37)', () => {
  const json = gltf('environment');
  it('gives the three plaster wall materials one sealed tiling detail with valid shader params', async () => {
    const seen = new Set<string>();
    for (const name of PLASTER) {
      const material: Material = json.materials.find((m: Material) => m.name === name);
      const detail = material.occlusionTexture!, extras = material.extras?.[PLASTER_DETAIL_KEY];
      expect(detail, name).toBeDefined();
      expect(material.normalTexture && material.pbrMetallicRoughness?.baseColorTexture, name).toBeTruthy();
      const image = json.images[json.textures[detail.index].source];
      expect(image.uri).toMatch(/^shared\/env\/[a-f0-9]{64}\.jpg$/);
      const bytes = readFileSync(join(root, image.uri)), sha = createHash('sha256').update(bytes).digest('hex');
      expect(image.uri).toBe(`shared/env/${sha}.jpg`); expect(image.extras.csSharedSource).toBe(sha);
      const meta = await sharp(bytes).metadata();
      expect([meta.width, meta.height]).toEqual([1024, 1024]);
      // Detail tile is finer than the 2 m base tile (base UV is 0.5 per metre).
      expect(detail.extensions!.KHR_texture_transform.scale[0]).toBeGreaterThan(1);
      // The extras must pass the runtime validator exactly as GLTFLoader hands them over.
      const runtime = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), normalMap: new THREE.Texture(), aoMap: new THREE.Texture() });
      runtime.userData[PLASTER_DETAIL_KEY] = extras;
      const group = new THREE.Group(); group.add(new THREE.Mesh(new THREE.BufferGeometry(), runtime));
      expect(applyPlasterDetail(group)).toBe(1);
      seen.add(JSON.stringify([image.uri, detail.texCoord ?? 0, detail.strength, detail.extensions, extras]));
    }
    expect(seen.size).toBe(1);
    expect(json.extensionsUsed).toContain('KHR_texture_transform');
  });
  it('touches no other material and adds no mesh, primitive or draw', () => {
    const marked = json.materials.filter((m: Material) => m.extras?.[PLASTER_DETAIL_KEY]).map((m: Material) => m.name);
    expect(marked.sort()).toEqual([...PLASTER].sort());
    expect(json.meshes.length).toBe(31);
    expect(json.meshes.reduce((n: number, m: { primitives: unknown[] }) => n + m.primitives.length, 0)).toBe(32);
    expect(json.images.length).toBe(31);
  });
  it('keeps the runtime CS bundle within the 34 MB budget', () => {
    const total = files(root).reduce((sum, file) => sum + statSync(file).size, 0);
    expect(total).toBeLessThanOrEqual(34_000_000);
  });
});
