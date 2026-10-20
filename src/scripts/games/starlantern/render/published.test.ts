import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RETIRED_ICON_IDS, allArtUrls, art, parseManifest } from './artPaths';

describe('published starlantern art', () => {
  const manifest = parseManifest(JSON.parse(readFileSync('public/assets/games/starlantern/manifest.json', 'utf8')));
  const registry = JSON.parse(readFileSync('art-factory/starlantern/registry.json', 'utf8')) as { assets: Record<string, { status?: string; runtime?: string }> };

  it('lists only known art urls, each backed by a file', () => {
    const known = new Set([...allArtUrls(), ...RETIRED_ICON_IDS.map((id) => art.icon(id))]);   // plan 8c: retired icons stay published until step ⑨
    for (const u of manifest) {
      expect(known.has(u), u).toBe(true);
      expect(existsSync(`public${u}`), u).toBe(true);
    }
  });

  it('lists every asset the registry marks as published', () => {
    const published = Object.values(registry.assets).filter((a) => a.status === 'published' && a.runtime).map((a) => a.runtime!);
    // Plan 5d Task 8: 246 + the G1 sample (34 parts + 3 silhouettes - icon/iron-sword retired) = 282.
    // Plan 5d Task 10: + the main-gear batch (127 parts + 15 silhouettes - 14 old base icons retired) = 410.
    expect(published.length).toBeGreaterThanOrEqual(410);
    for (const u of published) expect(manifest.has(u), u).toBe(true);
  });
});
