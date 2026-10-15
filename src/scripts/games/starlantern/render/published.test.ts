import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allArtUrls, parseManifest } from './artPaths';

describe('published starlantern art', () => {
  const manifest = parseManifest(JSON.parse(readFileSync('public/assets/games/starlantern/manifest.json', 'utf8')));
  const registry = JSON.parse(readFileSync('art-factory/starlantern/registry.json', 'utf8')) as { assets: Record<string, { status?: string; runtime?: string }> };

  it('lists only known art urls, each backed by a file', () => {
    const known = new Set(allArtUrls());
    for (const u of manifest) {
      expect(known.has(u), u).toBe(true);
      expect(existsSync(`public${u}`), u).toBe(true);
    }
  });

  it('lists every asset the registry marks as published', () => {
    const published = Object.values(registry.assets).filter((a) => a.status === 'published' && a.runtime).map((a) => a.runtime!);
    expect(published.length).toBeGreaterThanOrEqual(166);
    for (const u of published) expect(manifest.has(u), u).toBe(true);
  });
});
