import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../data/characters';
import { ENEMIES } from '../data/enemies';
import { ART_BASE, allArtUrls, art, effectFor, moodFor, parseManifest, tileKey } from './artPaths';

describe('artPaths', () => {
  it('builds urls under the starlantern base', () => {
    for (const m of ['attack', 'hit', 'dying', 'down', 'ultimate'] as const) expect(art.portrait('scarlet', m)).toBe(`${ART_BASE}/char/scarlet-portrait-${m}.png`);
    expect(art.portrait('scarlet', 'normal')).toBe(`${ART_BASE}/char/scarlet-portrait.png`);
    expect(art.tile(2, 'chest-open')).toBe(`${ART_BASE}/tiles/f2-chest-open.png`);
    expect(art.icon('fire-star')).toBe(`${ART_BASE}/icon/fire-star.png`);
  });

  it('lists one url per asset with no duplicates', () => {
    const urls = allArtUrls();
    expect(urls).toHaveLength(183);
    expect(new Set(urls).size).toBe(183);
    expect(urls).toContain(art.window);
    expect(urls).toContain(art.npc('gate', 'happy'));
    expect(urls).toContain(`${ART_BASE}/map/fog.png`);
    for (const id of CHARACTER_IDS) expect(urls).toContain(art.standee(id));
    for (const id of Object.keys(ENEMIES)) expect(urls).toContain(art.enemy(id));
  });

  it('matches the art registry runtime paths exactly', () => {
    const reg = JSON.parse(readFileSync('art-factory/starlantern/registry.json', 'utf8')) as { assets: Record<string, { runtime?: string }> };
    const runtime = Object.values(reg.assets).flatMap((a) => (a.runtime ? [a.runtime] : [])).sort();
    expect(runtime).toEqual([...allArtUrls()].sort());
  });

  it('maps an opened chest to its own tile', () => {
    expect(tileKey('chest', true)).toBe('chest-open');
    expect(tileKey('chest', false)).toBe('chest');
    expect(tileKey('wall', true)).toBe('wall');
  });

  it('picks the dying face at 30% hp and the down face at 0', () => {
    expect(moodFor(30, 100)).toBe('dying');
    expect(moodFor(31, 100)).toBe('normal');
    expect(moodFor(0, 100)).toBe('down');
  });

  it('picks an effect per event', () => {
    const dmg = (element: 'phys' | 'fire' | 'ice' | 'thunder') => ({ type: 'damage', target: 'e0', amount: 5, element, mult: 1 }) as const;
    expect(effectFor(dmg('fire'), 'noel')).toBe('fire');
    expect(effectFor(dmg('thunder'), 'noel')).toBe('thunder');
    expect(effectFor(dmg('phys'), 'chizuru')).toBe('pierce');
    expect(effectFor(dmg('phys'), 'sylvie')).toBe('pierce');
    expect(effectFor(dmg('phys'), 'scarlet')).toBe('slash');
    expect(effectFor(dmg('phys'), 'slime')).toBe('strike');
    expect(effectFor(dmg('phys'), null)).toBe('strike');
    expect(effectFor({ type: 'heal', target: 'liz', amount: 9 }, 'selene')).toBe('heal');
    expect(effectFor({ type: 'revive', target: 'liz' }, 'selene')).toBe('heal');
    expect(effectFor({ type: 'buff', target: 'liz', stat: 'atk', pct: 25 }, 'safira')).toBe('buff');
    expect(effectFor({ type: 'buff', target: 'e0', stat: 'atk', pct: -25 }, 'noel')).toBeNull();
    expect(effectFor({ type: 'ko', target: 'e0' }, 'liz')).toBeNull();
  });

  it('accepts only base urls from a well-formed manifest', () => {
    expect(parseManifest({ version: 1, urls: [art.enemy('slime'), 'https://evil.example/x.png', '/assets/games/other/a.png', 3] }))
      .toEqual(new Set([art.enemy('slime')]));
    expect(parseManifest(null).size).toBe(0);
    expect(parseManifest({ version: 2, urls: [art.enemy('slime')] }).size).toBe(0);
    expect(parseManifest({ version: 1, urls: 'nope' }).size).toBe(0);
  });
});
