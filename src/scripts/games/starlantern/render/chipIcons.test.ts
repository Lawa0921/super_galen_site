import { describe, expect, it } from 'vitest';
import { T } from '../data/text.zh-TW';
import { SKILLS } from '../data/skills';
import { AILMENT_ICON_IDS, ART_BASE, allArtUrls, art } from './artPaths';
import { AILMENT_FILL } from './ailmentStyle';
import { CHIP_ICON_PX, MECH_ICON_KEYS, ailmentIconUrl, ailmentIconUrls, mechIconUrls } from './chipIcons';

describe('chip icons (art step 9, G4)', () => {
  it('every ailment shown has its 14px icon, and every published icon url is in allArtUrls', () => {
    expect(CHIP_ICON_PX).toBe(14);
    const urls = new Set(allArtUrls());
    for (const id of Object.keys(AILMENT_FILL) as (keyof typeof AILMENT_FILL)[]) {
      expect(ailmentIconUrl(id)).toBe(`${ART_BASE}/icon/ail-${id}-14.png`);
      expect(urls.has(ailmentIconUrl(id)), id).toBe(AILMENT_ICON_IDS.includes(id));
      expect(ailmentIconUrls(id), id).toEqual(AILMENT_ICON_IDS.includes(id) ? [ailmentIconUrl(id)] : []);
    }
    // Roster plan E1c (ruling 27): 遺忘's icon is published with the forget round, so every ailment shown has its picture.
    expect(Object.keys(AILMENT_FILL).filter((id) => !AILMENT_ICON_IDS.includes(id as keyof typeof AILMENT_FILL))).toEqual([]);
    expect(urls.has(`${ART_BASE}/icon/ail-forget-14.png`)).toBe(true);
    expect(ailmentIconUrls('forget')).toEqual([`${ART_BASE}/icon/ail-forget-14.png`]);
    for (const k of MECH_ICON_KEYS) expect(urls.has(art.mechIcon(k)), k).toBe(true);
  });

  it('maps each mechanic word to its icon by what the word says', () => {
    const one = (tone: Parameters<typeof mechIconUrls>[0]['tone'], text: string) => mechIconUrls({ tone, text });
    expect(one('heat', T.mech.heat(3))).toEqual([art.mechIcon('heat')]);
    expect(one('heat', T.mech.cue.overload)).toEqual([]);                                  // a cue is not a counter
    expect(one('coins', T.mech.coins(7))).toEqual([art.mechIcon('coins')]);
    expect(one('coins', T.mech.appraised)).toEqual([]);
    expect(one('embers', T.mech.embers(40))).toEqual([art.mechIcon('embers')]);
    expect(one('embers', T.mech.cover)).toEqual([]);
    expect(one('beat', T.mech.beat(4))).toEqual([art.mechIcon('beat')]);
    expect(one('aim', T.mech.aimLocked(3))).toEqual([art.mechIcon('aim')]);
    expect(one('aim', T.mech.last)).toEqual([]);
    expect(one('mark', T.mech.mark)).toEqual([art.mechIcon('mark')]);
    expect(one('veil', T.mech.veil)).toEqual([]);
    expect(one('expose', T.mech.expose(2))).toEqual([]);
  });

  it('a barrier shows its kind, and the thunder after it when the barrier strikes', () => {
    expect(mechIconUrls({ tone: 'ward', text: T.mech.ward(3, false) })).toEqual([art.mechIcon('ward')]);
    expect(mechIconUrls({ tone: 'ward', text: T.mech.ward(3, true, true) })).toEqual([art.mechIcon('ward'), art.mechIcon('thunder')]);
    expect(mechIconUrls({ tone: 'purify', text: T.mech.purify(T.mech.lastingTag, true) })).toEqual([art.mechIcon('purify'), art.mechIcon('thunder')]);
  });

  it('the moon shows the phase it is in now', () => {
    const p = T.mech.phase;
    expect(mechIconUrls({ tone: 'moon', text: T.mech.moon(p.first, p.full) })).toEqual([art.mechIcon('moon-first')]);
    expect(mechIconUrls({ tone: 'moon', text: T.mech.moon(p.full, p.full) })).toEqual([art.mechIcon('moon-full')]);
    expect(mechIconUrls({ tone: 'moon', text: T.mech.moon(p.waning, p.new) })).toEqual([art.mechIcon('moon-waning')]);
    expect(mechIconUrls({ tone: 'moon', text: T.mech.moon(p.new, p.first) })).toEqual([art.mechIcon('moon-new')]);
  });

  it("a device shows its own skill's 14px icon; a shield its shield", () => {
    const dev = (kind: keyof typeof T.mech.deviceShort) => mechIconUrls({ tone: 'devices', text: T.mech.deviceWord(T.mech.deviceShort[kind], 2, 3) });
    const skillOf = (device: string) => Object.values(SKILLS).find((s) => s.effects.some((e) => e.kind === 'device' && e.device === device))!.id;
    for (const kind of ['turret', 'drone', 'shield', 'mine', 'coil'] as const) expect(dev(kind), kind).toEqual([art.skillIcon(skillOf(kind), 14)]);
    expect(skillOf('drone')).toBe('repair-drone');
    expect(mechIconUrls({ tone: 'devices', text: T.mech.shield(12) })).toEqual([art.mechIcon('shield')]);
  });
});
