import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SKILLS } from '../data/skills';
import { SKILL_ICON_SIZES, allArtUrls, art, parseManifest } from './artPaths';

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
    // Plan 5d Task 8: 246 + the G1 sample (34 parts + 3 silhouettes - icon/iron-sword retired) = 282.
    // Plan 5d Task 10: + the main-gear batch (127 parts + 15 silhouettes - 14 old base icons retired) = 410.
    expect(published.length).toBeGreaterThanOrEqual(410);
    for (const u of published) expect(manifest.has(u), u).toBe(true);
  });

  it('every current skill has its published icon at 16 and 14, each a file of exactly that size (art step 9)', () => {
    const size = (u: string) => { const b = readFileSync(`public${u}`); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
    for (const id of Object.keys(SKILLS)) {
      for (const px of SKILL_ICON_SIZES) {
        const u = art.skillIcon(id, px);
        expect(manifest.has(u), u).toBe(true);
        expect(existsSync(`public${u}`), u).toBe(true);
        expect(size(u), u).toEqual([px, px]);
      }
    }
  });

  it('the url totals agree: allArtUrls, the manifest, artPaths.test.ts and the e2e manifest count (roster PR D review)', () => {
    // roster_art.py publish moves both written totals; this holds them to the real ones so a publish can never leave one behind.
    const total = (file: string, re: RegExp) => Number(re.exec(readFileSync(file, 'utf8'))?.[1]);
    const urls = allArtUrls().length;
    expect(manifest.size).toBe(urls);
    expect(total('src/scripts/games/starlantern/render/artPaths.test.ts', /expect\(urls\)\.toHaveLength\((\d+)\);/)).toBe(urls);
    expect(total('tests/e2e/starlantern.spec.ts', /expect\(manifest\.length\)\.toBe\((\d+)\);/)).toBe(urls);
  });

  it('no removed skill keeps a file in the runtime folder (art step 9)', () => {
    for (const id of ['triple-slash', 'sacred-sake', 'thunder-thrust', 'blessing', 'sanctuary', 'shadow-flurry', 'venom-edge', 'snare-shot',
      'fire-arrow', 'storm-volley', 'guardian-roar', 'fortress', 'veil-dance', 'sirocco', 'repair-kit']) {
      expect(SKILLS[id], id).toBeUndefined();
      for (const f of [art.icon(id), art.skillIcon(id, 16), art.skillIcon(id, 14)]) expect(existsSync(`public${f}`), f).toBe(false);
    }
  });
});
