import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../data/enemies';
import type { BattleEvent } from '../engine/combatant';
import { ART_BASE, ART_CHARACTER_IDS, ART_VARIANT_IDS, CORE_MOODS, FRAMED_RARITIES, MOODS, MOODS_OF, PUBLISHED_FACES, SPECIAL_MOODS_OF, allArtUrls, art, effectFor, enemyArt, moodFor, parseManifest, tileKey } from './artPaths';
import { RARITIES } from '../data/gear';

describe('artPaths', () => {
  it('builds urls under the starlantern base', () => {
    for (const m of ['attack', 'hit', 'dying', 'down', 'ultimate'] as const) expect(art.portrait('scarlet', m)).toBe(`${ART_BASE}/char/scarlet-portrait-${m}.png`);
    expect(art.portrait('scarlet', 'normal')).toBe(`${ART_BASE}/char/scarlet-portrait.png`);
    expect(art.tile(2, 'chest-open')).toBe(`${ART_BASE}/tiles/f2-chest-open.png`);
    expect(art.icon('fire-star')).toBe(`${ART_BASE}/icon/fire-star.png`);
  });

  it('lists one url per asset with no duplicates', () => {
    const urls = allArtUrls();
    // 237 + the hero's standee and 8 faces (plan 6a Task 5: he joins the roster with his art published) = 246
    expect(urls).toHaveLength(246);
    expect(new Set(urls).size).toBe(246);
    expect(urls).toContain(art.fxAnim('thunder'));
    for (const id of ['blaze-core', 'frost-heart', 'storm-stone', 'mire-gland', 'shade-crystal', 'iron-shard']) expect(urls).not.toContain(art.icon(id));
    expect(urls).toContain(art.window);
    expect(urls).toContain(art.portalPlaza);
    expect(urls).toContain(art.portalCard('mainline'));
    expect(urls).toContain(art.traitIcon('shade'));
    expect(urls).toContain(art.eventTile('vault-open'));
    expect(urls).toContain(art.npc('gate', 'happy'));
    expect(urls).toContain(`${ART_BASE}/map/fog.png`);
    for (const id of ART_CHARACTER_IDS) expect(urls).toContain(art.standee(id));
    for (const id of ['hero', 'rin', 'rin-oath']) for (const m of ['normal', 'attack', 'hit', 'dying', 'down', 'ultimate', 'smile', 'sad'] as const) expect(urls).toContain(art.portrait(id, m));
    expect(urls).toContain(art.standee('rin-oath'));
    for (const id of Object.keys(ENEMIES).filter((e) => !ENEMIES[e].look)) expect(urls).toContain(art.enemy(id));
  });

  it('matches the art registry runtime paths exactly', () => {
    const reg = JSON.parse(readFileSync('art-factory/starlantern/registry.json', 'utf8')) as { assets: Record<string, { runtime?: string }> };
    const runtime = Object.values(reg.assets).flatMap((a) => (a.runtime ? [a.runtime] : [])).sort();
    expect(runtime).toEqual([...allArtUrls()].sort());
  });

  it('everyone has at least eight talking faces, the core six first', () => {
    for (const id of [...ART_CHARACTER_IDS, ...ART_VARIANT_IDS]) {
      const faces = MOODS_OF[id];
      expect(faces.length, id).toBeGreaterThanOrEqual(8);
      expect(faces.slice(0, 6), id).toEqual(CORE_MOODS);
      expect(new Set(faces).size, id).toBe(faces.length);
    }
    expect(MOODS_OF.rin).toEqual(MOODS_OF['rin-oath']);
  });

  it('a special face belongs to one character', () => {
    // Rin's oath look is her, not another character: the two share one set.
    const owner = (id: string) => (id === 'rin-oath' ? 'rin' : id);
    const owners = new Map<string, Set<string>>();
    for (const [id, faces] of Object.entries(SPECIAL_MOODS_OF)) {
      for (const f of faces) owners.set(f, (owners.get(f) ?? new Set()).add(owner(id)));
    }
    for (const [f, who] of owners) {
      expect([...who], f).toHaveLength(1);
      expect(CORE_MOODS as string[], f).not.toContain(f);
      expect(MOODS as string[], f).not.toContain(f);
    }
  });

  it('a declared face adds no url until it is published', () => {
    const urls = allArtUrls();
    expect(urls).not.toContain(art.portrait('selene', 'blush'));
    expect(urls).not.toContain(art.portrait('hero', 'resolve'));
    expect(urls).not.toContain(art.portrait('rin-oath', 'averted'));
    for (const [id, faces] of Object.entries(PUBLISHED_FACES)) {
      for (const f of faces) {
        expect(urls).toContain(art.portrait(id, f));
        expect(MOODS_OF[id], `${id} ${f}`).toContain(f);
      }
    }
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

  it("the hero's hit effect follows his weapon", () => {
    const dmg = (element: 'phys' | 'fire'): BattleEvent => ({ type: 'damage', target: 'e0', amount: 5, element, mult: 1, crit: false } as BattleEvent);
    expect(effectFor(dmg('phys'), 'hero', 'spear')).toBe('pierce');
    expect(effectFor(dmg('phys'), 'hero', 'staff')).toBe('fire');
    expect(effectFor(dmg('phys'), 'hero', 'sword')).toBe('slash');
    expect(effectFor(dmg('phys'), 'hero')).toBe('slash');
    expect(effectFor(dmg('phys'), 'hero', undefined)).toBe('slash');
    // magic keeps its element, and a weapon never changes a heal
    expect(effectFor(dmg('fire'), 'hero', 'spear')).toBe('fire');
    expect(effectFor({ type: 'heal', target: 'liz', amount: 9 }, 'hero', 'spear')).toBe('heal');
  });

  it('accepts only base urls from a well-formed manifest', () => {
    expect(parseManifest({ version: 1, urls: [art.enemy('slime'), 'https://evil.example/x.png', '/assets/games/other/a.png', 3] }))
      .toEqual(new Set([art.enemy('slime')]));
    expect(parseManifest(null).size).toBe(0);
    expect(parseManifest({ version: 2, urls: [art.enemy('slime')] }).size).toBe(0);
    expect(parseManifest({ version: 1, urls: 'nope' }).size).toBe(0);
  });

  it('epic frame and starlit overlay keys (plan 5g)', () => {
    expect(art.rarityFrame('epic')).toBe('/assets/games/starlantern/ui/rarity-epic.png');
    expect(art.rarityFrame('magic')).toBe('/assets/games/starlantern/ui/rarity-magic.png');
    expect(art.rarityGlow).toBe('/assets/games/starlantern/ui/glow-legendary.png');
    expect(art.starlitOverlay).toBe('/assets/games/starlantern/ui/starlit.png');
    expect(FRAMED_RARITIES).toEqual(['magic', 'rare', 'epic', 'legendary', 'unique', 'set']);
    expect(FRAMED_RARITIES).toEqual(RARITIES.filter((r) => r !== 'common'));
    // The art contract names the same runtime paths for the same registry ids (ui-rarity-<r>, ui-starlit).
    const contract = readFileSync('art-factory/starlantern/contract.md', 'utf8');
    expect(contract).toContain('`ui-rarity-<magic\\|rare\\|epic\\|legendary\\|unique\\|set>` | `/assets/games/starlantern/ui/rarity-<r>.png`');
    expect(contract).toContain(`\`ui-starlit\` | \`${art.starlitOverlay}\``);
    expect(contract).toContain(`\`ui-glow-legendary\` | \`${art.rarityGlow}\``);
  });

  it('unpublished frames, the legend glow and the starlit overlay are never listed', () => {
    const urls = allArtUrls();
    for (const u of [...FRAMED_RARITIES.map((r) => art.rarityFrame(r)), art.rarityGlow, art.starlitOverlay]) expect(urls, u).not.toContain(u);
  });
});

describe('enemy art', () => {
  it('an enemy with a look uses that standee and is not listed as art of its own', () => {
    expect(ENEMIES['scarlet-foe'].look).toBe('scarlet');
    expect(enemyArt('scarlet-foe')).toBe(art.standee('scarlet'));
    expect(enemyArt('slime')).toBe(art.enemy('slime'));
    const urls = allArtUrls();
    expect(urls).not.toContain(art.enemy('scarlet-foe'));
    expect(urls).toContain(art.standee('scarlet'));
    for (const id of Object.keys(ENEMIES)) expect(urls).toContain(enemyArt(id));
  });
});
