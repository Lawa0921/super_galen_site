import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';

const root = 'public/assets/games/cs';
const weapons = ['rifle', 'pistol', 'smg', 'sniper'] as const;
const SLEEVE = 'MakeHuman_authored_FPS_uniform_CC0';
function gltf(name: string) {
  const bytes = readFileSync(join(root, `${name}.glb`));
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
}
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]);
}

describe('first-person sleeve fabric surface (V36)', () => {
  it('gives every FPS weapon the same sealed tiling detail on the sleeve material', async () => {
    const seen = new Set<string>();
    for (const weapon of weapons) {
      const json = gltf(weapon), material = json.materials.find((m: { name: string }) => m.name === SLEEVE);
      const detail = material.occlusionTexture, extras = material.extras?.csFabricDetail;
      expect(detail, weapon).toBeDefined();
      expect(json.extensionsUsed).toContain('KHR_texture_transform');
      const image = json.images[json.textures[detail.index].source];
      expect(image.uri).toMatch(/^shared\/fps\/[a-f0-9]{64}\.jpg$/);
      const bytes = readFileSync(join(root, image.uri)), sha = createHash('sha256').update(bytes).digest('hex');
      expect(image.uri).toBe(`shared/fps/${sha}.jpg`); expect(image.extras.csSharedSource).toBe(sha);
      const meta = await sharp(bytes).metadata();
      expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1024);
      seen.add(JSON.stringify([image.uri, detail.texCoord ?? 0, detail.strength, detail.extensions.KHR_texture_transform, extras, material.normalTexture.scale]));
    }
    expect(seen.size).toBe(1);
  });
  // V37 raises the whole-bundle cap from 32 MB to 34 MB for the CC0 grenade
  // models, HUD renders and plaster detail (decision recorded in docs/games/breach-point.md).
  it('keeps the runtime CS bundle within its 34 MB budget', () => {
    const total = files(root).reduce((sum, file) => sum + statSync(file).size, 0);
    expect(total).toBeLessThanOrEqual(34_000_000);
  });
});
