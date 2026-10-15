import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allArtUrls, parseManifest } from './artPaths';

describe('published starlantern art', () => {
  const manifest = parseManifest(JSON.parse(readFileSync('public/assets/games/starlantern/manifest.json', 'utf8')));

  it('publishes every art url', () => {
    expect([...manifest].sort()).toEqual([...allArtUrls()].sort());
  });

  it('has a file for every manifest entry and nothing unlisted', () => {
    for (const u of manifest) expect(existsSync(`public${u}`), u).toBe(true);
  });
});
