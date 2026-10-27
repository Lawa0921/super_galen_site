import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../data/enemies';
import { artEnemy, artMaterial, artSpecial } from '../data/monsters';
import type { BattleEvent } from '../engine/combatant';
import { ART_BASE, ART_CHARACTER_IDS, ART_VARIANT_IDS, CORE_MOODS, FRAMED_RARITIES, MOODS, MOODS_OF, PUBLISHED_FACES, SKILL_ICON_SIZES, SPECIAL_MOODS_OF, allArtUrls, art, codexArtId, effectFor, enemyArt, gearArtId, moodFor, parseManifest, tileKey } from './artPaths';
import { RARITIES, SETS, SPECIALS, regionSpecials } from '../data/gear';
import { EQUIPMENT } from '../data/equipment';
import { REGIONS, type RegionId } from '../data/regions';
import { MATERIALS } from '../data/materials';
import { SKILLS } from '../data/skills';

describe('artPaths', () => {
  it('builds urls under the starlantern base', () => {
    for (const m of ['attack', 'hit', 'dying', 'down', 'ultimate'] as const) expect(art.portrait('scarlet', m)).toBe(`${ART_BASE}/char/scarlet-portrait-${m}.png`);
    expect(art.portrait('scarlet', 'normal')).toBe(`${ART_BASE}/char/scarlet-portrait.png`);
    expect(art.tile(2, 'chest-open')).toBe(`${ART_BASE}/tiles/f2-chest-open.png`);
    expect(art.icon('potion')).toBe(`${ART_BASE}/icon/potion.png`);
    // Art step 9: native skill icons (16 in a skill row, 14 in the tree) and the 14px chip icons.
    expect(art.skillIcon('fire-star', 16)).toBe(`${ART_BASE}/icon/fire-star-16.png`);
    expect(art.skillIcon('fire-star', 14)).toBe(`${ART_BASE}/icon/fire-star-14.png`);
    expect(art.ailmentIcon('chill')).toBe(`${ART_BASE}/icon/ail-chill-14.png`);
    expect(art.mechIcon('moon-new')).toBe(`${ART_BASE}/icon/mech-moon-new-14.png`);
    expect(SKILL_ICON_SIZES).toEqual([16, 14]);
  });

  it('lists one url per asset with no duplicates', () => {
    const urls = allArtUrls();
    // 237 + the hero's standee and 8 faces (plan 6a Task 5: he joins the roster with his art published) = 246
    // + plan 5d's G1 sample (Task 8): 34 parts (9 gear x 2, 6 materials, 6 frames, glow, starlit, forge, Doran)
    //   + 3 silhouettes - 1 retired old icon (icon/iron-sword.png) = 246 + 36 = 282
    // + plan 5d's main-gear batch (Task 10): 127 parts (60 gear x 2, 6 region materials, Doran's smile)
    //   + 15 silhouettes - 14 retired old base icons = 282 + 128 = 410
    // - plan 8c's 三連刃 icon (its skill replaced by 順手牽羊; the file stays until step ⑨) = 409
    // + the companion talking faces, wave 1 (18; user approval 2026-10-23) = 427
    // + Lorne's and both Rin looks' grave faces, wave 2 (6; user approval 2026-10-24; the three redos replace files) = 433
    // + the rune icons (art step 9, G4; user approval 2026-10-24 「可以」): 32 runes and 2 slot states, at 14 and 16 = 501
    // Art step 9, G3 and G4 (user approval 2026-10-24): every one of the 105 skills at 16 and 14 (+210), the 26 plan 4
    // skill icons they re-derive retired (-26), 7 ailment and 14 mechanic chip icons at 14 (+21) = 706
    // + Safira's serious and Noel's pout, faces wave 3 (user approval 2026-10-24 「可以」) = 708
    // + faces wave 4 (affinity plan Task A; user approval 2026-10-24 「可以，照這風格」): nine blush, both Rin looks' averted,
    //   Sylvie's unguarded, Noel's smug, Bobby's excited = 722
    // + roster R0 (使用者 2026-10-26：核可，照這個畫風做下去): 5 foes, 5 material icons, 2 own uniques x 2 = 736
    // + roster R1 (independent review 2026-10-27): 13 foes, 13 material icons, 3 own uniques x 2 = 768
    // + roster R2 (independent review 2026-10-27): 27 foes, 26 material icons, 10 own uniques x 2 = 841
    // + roster FORGET (independent review 2026-10-27): 0 foes, 0 material icons, 0 own uniques x 2, the forget chip = 842
    expect(urls).toHaveLength(842);
    expect(new Set(urls).size).toBe(842);
    for (const id of Object.keys(SKILLS)) {
      expect(urls, id).not.toContain(art.icon(id));
      for (const px of SKILL_ICON_SIZES) expect(urls, id).toContain(art.skillIcon(id, px));
    }
    expect(urls).not.toContain(art.icon('triple-slash'));
    expect(urls).toContain(art.fxAnim('thunder'));
    for (const id of ['blaze-core', 'frost-heart', 'storm-stone', 'mire-gland', 'shade-crystal', 'iron-shard']) expect(urls).toContain(art.icon(id));
    for (const id of ['essence-common', 'essence-magic', 'essence-rare', 'essence-legendary', 'star-tear', 'king-scale']) expect(urls).toContain(art.icon(id));
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
    // Every enemy with art published (roster plan ruling 3: a roster foe joins with its art batch).
    for (const id of Object.keys(ENEMIES).filter((e) => artEnemy(e) && !ENEMIES[e].look)) expect(urls).toContain(art.enemy(id));
    for (const id of Object.keys(ENEMIES).filter((e) => !artEnemy(e))) expect(urls).not.toContain(art.enemy(id));
    // Plan 5d (Tasks 8 and 10): every base and special has its gear art, small and large, and every region piece and set
    // its silhouette; specials never had an icon/ path.
    // A roster unique joins with its owner's art batch (roster plan ruling 3); none has art before then.
    for (const id of Object.keys(SPECIALS).filter((s) => !artSpecial(s))) expect(urls, id).not.toContain(art.gear(id));
    for (const id of [...Object.keys(EQUIPMENT), ...Object.keys(SPECIALS).filter(artSpecial)]) {
      expect(urls, id).toContain(art.gear(id));
      expect(urls, id).toContain(art.gearLarge(id));
      if (id in SPECIALS) expect(urls).not.toContain(art.icon(id));
    }
    const regionLimited = (Object.keys(REGIONS) as RegionId[]).flatMap((r) => regionSpecials(r).map((s) => s.id));
    expect(regionLimited.length + Object.keys(SETS).length).toBe(18);
    for (const id of [...regionLimited, ...Object.keys(SETS)]) expect(urls, id).toContain(art.gearSilhouette(id));
    for (const u of [art.rarityFrame('set'), art.scene('forge'), art.npc('forge', 'normal'), art.npc('forge', 'happy'), art.rarityGlow,
      art.starlitOverlay, ...FRAMED_RARITIES.map((r) => art.rarityFrame(r))]) expect(urls).toContain(u);
  });

  it('no old base icon url remains (all 15 retired by plan 5d)', () => {
    const urls = allArtUrls();
    for (const id of Object.keys(EQUIPMENT)) expect(urls, id).not.toContain(art.icon(id));
  });

  it('every gear, material and skill id has art (art step 9: nothing waits any more)', () => {
    const urls = new Set(allArtUrls());
    for (const id of Object.keys(MATERIALS)) expect(urls.has(art.icon(id)), id).toBe(artMaterial(id));
    for (const id of Object.keys(SKILLS)) expect(urls.has(art.skillIcon(id, 16)) && urls.has(art.skillIcon(id, 14)), id).toBe(true);
  });

  it('builds gear, large, silhouette and frame urls', () => {
    expect(art.gear('iron-sword')).toBe('/assets/games/starlantern/gear/iron-sword.png');
    expect(art.gearLarge('blaze-heart-sword')).toBe('/assets/games/starlantern/gear/blaze-heart-sword-large.png');
    expect(art.gearSilhouette('set-blaze')).toBe('/assets/games/starlantern/gear/set-blaze-silhouette.png');
    expect(art.rarityFrame('set')).toBe('/assets/games/starlantern/ui/rarity-set.png');
    expect(art.rarityFrame('epic')).toBe('/assets/games/starlantern/ui/rarity-epic.png');
    expect(art.starlitOverlay).toBe('/assets/games/starlantern/ui/starlit.png');
  });

  it('gearArtId prefers the special', () => {
    expect(gearArtId({ base: 'iron-sword', special: 'blaze-heart-sword' })).toBe('blaze-heart-sword');
    expect(gearArtId({ base: 'iron-sword' })).toBe('iron-sword');
  });

  it('codexArtId maps a set to its first piece', () => {
    expect(codexArtId('set-blaze')).toBe('set-blaze-weapon');
    expect(codexArtId('blaze-ember-ring')).toBe('blaze-ember-ring');
    for (const s of Object.values(SETS)) expect(codexArtId(s.id)).toBe(s.pieces[0]);
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
    expect(urls).not.toContain(art.portrait('selene', 'foresee'));
    expect(urls).not.toContain(art.portrait('hero', 'resolve'));
    expect(urls).not.toContain(art.portrait('rin-oath', 'surprised'));
    expect(urls).not.toContain(art.portrait('hero', 'blush'));   // wave 4 is the nine companions' blush, not Lorne's
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
    // Plan 5g's handoff: its own contract section names both ids as final; nothing calls them provisional any more.
    const section = contract.slice(contract.indexOf('## 計畫 5g'));
    expect(contract).toContain('## 計畫 5g');
    expect(section).toContain(`\`ui-rarity-epic\` | \`${art.rarityFrame('epic')}\``);
    expect(section).toContain(`\`ui-starlit\` | \`${art.starlitOverlay}\``);
    expect(contract).not.toMatch(/暫定 id/);
    expect(readFileSync('art-factory/starlantern/tools/gear_art.py', 'utf8')).not.toMatch(/[Pp]rovisional art ids/);
  });

  it('the frames, the legend glow and the starlit overlay are listed once published (plan 5d Task 8)', () => {
    const urls = allArtUrls();
    for (const u of [...FRAMED_RARITIES.map((r) => art.rarityFrame(r)), art.rarityGlow, art.starlitOverlay]) expect(urls, u).toContain(u);
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
    for (const id of Object.keys(ENEMIES).filter(artEnemy)) expect(urls).toContain(enemyArt(id));
  });
});
