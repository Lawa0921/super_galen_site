import { describe, expect, it } from 'vitest';
import { ENEMIES } from './enemies';
import { AFFIXES, SPECIALS, generalLegendaries, regionSpecials } from './gear';
import { MATERIALS } from './materials';
import type { RegionId } from './regions';
import type { AnyStat, CharacterId, GearSlot, WeaponKind } from '../engine/types';
import { pickSpecial } from '../engine/loot/drops';
import { mulberry32 } from '../engine/rng';
import { LEGACY_ENEMY_IDS, ROSTER_ART, ROSTER_LIVE, artEnemy, artMaterial, artSpecial, listedEnemy, liveRosterIds, ownerOf } from './monsters';

describe('roster switches (roster plan Task A1, spec §11.1)', () => {
  it('the live set is inside the art set', () => {
    for (const id of ROSTER_LIVE) expect(ROSTER_ART.has(id), id).toBe(true);
  });

  it('legacy ids are listed and drawn', () => {
    expect([...LEGACY_ENEMY_IDS]).toEqual(['slime', 'bat', 'wolf', 'beetle', 'wisp', 'lizard', 'golem', 'shade', 'lanterneater', 'scarlet-foe']);
    for (const id of LEGACY_ENEMY_IDS) {
      expect(ENEMIES[id], id).toBeDefined();
      expect(listedEnemy(id), id).toBe(true);
      expect(artEnemy(id), id).toBe(true);
    }
  });

  it('nothing new is listed while nothing is live', () => {
    expect(ROSTER_LIVE.size).toBe(0);
    expect(liveRosterIds()).toEqual([]);
    const fresh = Object.keys(ENEMIES).filter((id) => !LEGACY_ENEMY_IDS.includes(id));
    for (const id of fresh) {
      expect(listedEnemy(id), id).toBe(false);
      expect(artEnemy(id), id).toBe(false);
    }
    expect(listedEnemy('no-such-foe')).toBe(false);
  });
});

/** Spec §5.1's archetypes at their Lv10 home: [hp, atk, def, mag, res, spd, exp, gold]. */
const ARCH = {
  swarm: [110, 32, 6, 24, 10, 18, 15, 11],
  std: [200, 48, 13, 24, 13, 13, 28, 21],
  heavy: [310, 58, 25, 14, 14, 6, 42, 31],
  caster: [170, 24, 10, 62, 22, 13, 38, 29],
  support: [165, 22, 12, 44, 22, 12, 28, 21],
  treasure: [90, 18, 60, 18, 60, 30, 90, 150],
  boss: [1200, 36, 20, 30, 20, 12, 300, 0],
} as const;
type Arch = keyof typeof ARCH;

/** Spec §5.3 and §5.4: each ordinary species' archetype and its inscription key (the 銘文 column). */
const NORMALS: Record<string, [Arch, string]> = {
  // the main road (§5.3)
  'paper-moth': ['swarm', 'sleepRes'], 'lamp-wight': ['support', 'heal'], 'root-hound': ['std', 'atk'], 'tin-soldier': ['heavy', 'armor'],
  'dust-mimic': ['std', 'goldFind'], 'market-ghost': ['support', 'matFind'], 'tongueless-bell': ['caster', 'tpCost'],
  'hollow-hunter': ['std', 'critDmg'], 'mist-twin': ['swarm', 'multi'], 'moon-crow': ['std', 'crit'], 'bell-watcher': ['std', 'evasion'],
  'sleepwalker': ['heavy', 'hp'], 'old-city-sentinel': ['heavy', 'def'], 'requiem-choir': ['support', 'tpRegen'], 'lantern-larva': ['std', 'vuln'],
  'epitaph-golem': ['heavy', 'res'], 'ancestor-automaton': ['heavy', 'meleeDR'], 'ash-archivist': ['caster', 'mag'], 'wick-shade': ['swarm', 'fireRes'],
  'keeper-echo': ['caster', 'gauge'], 'ember-maw': ['heavy', 'fireDmg'], 'sorrow-crystal': ['std', 'iceRes'], 'deep-tendril': ['std', 'tp'],
  'music-box': ['support', 'wil'], 'paper-cranes': ['swarm', 'agi'], 'lost-shadow': ['std', 'str'], 'returning-light': ['support', 'expBonus'],
  'hoarder': ['treasure', 'matFind'], 'gilded-hoarder': ['treasure', 'goldFind'],
  // the regions (§5.4)
  'cinder-imp': ['swarm', 'fireDmg'], 'forge-hound': ['std', 'atk'], 'ash-mourner': ['support', 'heal'], 'mirage-dancer': ['std', 'evasion'],
  'sand-scorpion': ['std', 'poisonRes'], 'frost-doll': ['heavy', 'iceRes'], 'glacier-tortoise': ['heavy', 'def'], 'snow-caller': ['caster', 'sleepRes'],
  'ice-komainu': ['heavy', 'block'], 'frozen-pilgrim': ['std', 'res'], 'thunder-kite': ['swarm', 'spd'], 'storm-totem': ['support', 'thunderRes'],
  'charge-jelly': ['caster', 'thunderDmg'], 'star-ember': ['caster', 'tpRegen'], 'stolen-tome': ['caster', 'mag'], 'bog-mother': ['heavy', 'hp'],
  'rot-lily': ['support', 'poisonRes'], 'leech-knight': ['std', 'armor'], 'ashen-treant': ['heavy', 'wil'], 'spore-moth': ['swarm', 'tp'],
  'mirror-thief': ['std', 'crit'], 'veil-stalker': ['std', 'critDmg'], 'hush-acolyte': ['caster', 'tpCost'], 'vault-mimic': ['heavy', 'goldFind'],
  'debt-collector': ['std', 'vuln'], 'rivet-golem': ['heavy', 'armor'], 'siege-crab': ['heavy', 'meleeDR'], 'herald-engine': ['support', 'gauge'],
  'fallen-knight': ['heavy', 'block'], 'banner-bearer': ['support', 'str'],
};
const MAINLINE_NORMALS = Object.keys(NORMALS).slice(0, 29);
const NATIVES: Record<string, RegionId> = {
  'cinder-imp': 'blaze', 'forge-hound': 'blaze', 'ash-mourner': 'blaze', 'mirage-dancer': 'blaze', 'sand-scorpion': 'blaze',
  'frost-doll': 'frost', 'glacier-tortoise': 'frost', 'snow-caller': 'frost', 'ice-komainu': 'frost', 'frozen-pilgrim': 'frost',
  'thunder-kite': 'storm', 'storm-totem': 'storm', 'charge-jelly': 'storm', 'star-ember': 'storm', 'stolen-tome': 'storm',
  'bog-mother': 'mire', 'rot-lily': 'mire', 'leech-knight': 'mire', 'ashen-treant': 'mire', 'spore-moth': 'mire',
  'mirror-thief': 'shade', 'veil-stalker': 'shade', 'hush-acolyte': 'shade', 'vault-mimic': 'shade', 'debt-collector': 'shade',
  'rivet-golem': 'iron', 'siege-crab': 'iron', 'herald-engine': 'iron', 'fallen-knight': 'iron', 'banner-bearer': 'iron',
};
/** Spec §5.5: the wardens, a standard or heavy shape (the elite path multiplies them in a fight: ELITE, ELITE_REWARD). */
const WARDENS: Record<string, Arch> = {
  'false-moon': 'std', 'bell-warden': 'std', 'toppled-automaton': 'heavy', 'requiem-conductor': 'std', 'lantern-brood': 'heavy',
  'mirage-lead': 'std', 'ice-shrine': 'heavy', 'burning-page': 'std', 'grey-elder': 'heavy', 'locked-vault': 'heavy', 'gate-breaker': 'heavy',
};
/** Spec §5.6: the bosses, shaped on the lantern-eater. */
const BOSSES = [
  'fog-warden', 'silent-bell', 'hollow-champion', 'old-city-archon', 'gorged-beast', 'lantern-mother', 'forgotten-festival', 'starless-whale',
  'stopped-clock', 'first-lantern', 'ember-tyrant', 'sandstorm-maw', 'mirage-city', 'rime-sovereign', 'white-silence', 'rift-maw', 'thunder-roc',
  'storm-conductor', 'starfire-colossus', 'mire-hydra', 'grey-blight', 'bog-leviathan', 'faceless-host', 'vault-dragon', 'shadow-parade',
  'fortress-colossus', 'siege-titan', 'last-commander',
];
/** Spec §5.6's two parts: their own HP, the rest of an archetype. */
const PARTS: Record<string, [Arch, number]> = { 'archon-hand': ['std', 260], 'rime-pillar': ['support', 240] };
/**
 * HP set apart from the ±15% shape (spec §5.6's 形狀 column): the many-part bosses' bodies, and the mirage city's -20%
 * (its dancers shield it).
 */
const HP_EXCEPTIONS: Record<string, number> = { 'old-city-archon': 800, 'rime-sovereign': 820, 'mirage-city': 960 };

const rosterIds = () => Object.keys(ENEMIES).filter((id) => !LEGACY_ENEMY_IDS.includes(id));
const STAT_KEYS = ['hp', 'atk', 'def', 'mag', 'res', 'spd'] as const;
const within = (v: number, b: number) => v >= Math.floor(b * 0.85) && v <= Math.ceil(b * 1.15);

describe('one hundred roster foes (roster plan Task A2, spec §5)', () => {
  it('one hundred new ids, none old', () => {
    const ids = rosterIds();
    expect(ids).toHaveLength(100);
    expect(new Set(ids).size).toBe(100);
    expect(ids.slice().sort()).toEqual([...Object.keys(NORMALS), ...Object.keys(WARDENS), ...BOSSES, ...Object.keys(PARTS)].sort());
    for (const id of ids) expect(LEGACY_ENEMY_IDS, id).not.toContain(id);
    const normals = ids.filter((id) => !ENEMIES[id].boss && !ENEMIES[id].rank);
    expect(normals).toHaveLength(59);
    expect(normals.filter((id) => ENEMIES[id].band)).toEqual(MAINLINE_NORMALS);
    expect(normals.filter((id) => ENEMIES[id].home).sort()).toEqual(Object.keys(NATIVES).sort());
    expect(ids.filter((id) => ENEMIES[id].rank === 'warden')).toHaveLength(11);
    expect(ids.filter((id) => ENEMIES[id].boss)).toHaveLength(28);
    expect(ids.filter((id) => ENEMIES[id].rank === 'part')).toHaveLength(2);
    for (const [id, r] of Object.entries(NATIVES)) expect(ENEMIES[id].home, id).toBe(r);
    for (const id of MAINLINE_NORMALS) expect(['B', 'C', 'D', 'E', 'F'], id).toContain(ENEMIES[id].band);
  });

  it('archetypes hold their shape', () => {
    const check = (id: string, arch: Arch, hp?: number) => {
      const e = ENEMIES[id];
      const b = ARCH[arch];
      STAT_KEYS.forEach((k, i) => {
        if (k === 'hp' && hp !== undefined) expect(e.stats.hp, `${id} hp`).toBe(hp);
        else expect(within(e.stats[k], b[i]), `${id} ${k} ${e.stats[k]} against ${b[i]}`).toBe(true);
      });
      expect(e.stats.tp, id).toBe(0);
    };
    for (const [id, [arch]] of Object.entries(NORMALS)) {
      check(id, arch);
      expect([ENEMIES[id].exp, ENEMIES[id].gold], id).toEqual([ARCH[arch][6], ARCH[arch][7]]);
      expect(ENEMIES[id].floor, id).toBe(3);
      expect(ENEMIES[id].boss, id).toBeFalsy();
      expect(ENEMIES[id].rank, id).toBeUndefined();
    }
    for (const [id, arch] of Object.entries(WARDENS)) {
      check(id, arch);
      expect([ENEMIES[id].exp, ENEMIES[id].gold], id).toEqual([ARCH[arch][6], ARCH[arch][7]]);
      expect(ENEMIES[id].floor, id).toBe(3);
      expect(ENEMIES[id].rank, id).toBe('warden');
      expect(ENEMIES[id].boss, id).toBeFalsy();
    }
    for (const id of BOSSES) {
      if (id !== 'lantern-mother') check(id, 'boss', HP_EXCEPTIONS[id]);
      expect(ENEMIES[id].boss, id).toBe(true);
      expect(ENEMIES[id].rank, id).toBeUndefined();
      expect([ENEMIES[id].exp, ENEMIES[id].gold], id).toEqual([300, 0]);
    }
    for (const [id, [arch, hp]] of Object.entries(PARTS)) {
      check(id, arch, hp);
      expect(ENEMIES[id].rank, id).toBe('part');
      expect(ENEMIES[id].boss, id).toBeFalsy();
      expect([ENEMIES[id].exp, ENEMIES[id].gold], id).toEqual([30, 0]);
    }
  });

  it('lantern-mother is the lantern-eater in another shape', () => {
    const [m, l] = [ENEMIES['lantern-mother'], ENEMIES.lanterneater];
    expect(m.name).toBe('燈喰之母');
    for (const k of ['stats', 'skills', 'weak', 'resist', 'exp', 'gold', 'boss', 'floor'] as const) expect(m[k], k).toEqual(l[k]);
  });

  it('only plain effects so far', () => {
    // Spec §1.4's kinds: the mechanics (B1, B2) add their own fields later.
    const DAMAGE_KEYS = new Set(['kind', 'power', 'element', 'scale', 'melee', 'hits', 'crit', 'execute', 'wounded']);
    for (const id of rosterIds()) for (const s of ENEMIES[id].skills) {
      expect(['enemy', 'enemies', 'row', 'column', 'cross', 'self', 'ally', 'allies'], `${id} ${s.name}`).toContain(s.target);
      expect(s.chance > 0 && s.chance <= 1, `${id} ${s.name}`).toBe(true);
      for (const e of s.effects) {
        expect(['damage', 'inflict', 'buff', 'heal'], `${id} ${s.name}`).toContain(e.kind);
        if (e.kind === 'inflict') expect(['poison', 'sleep'], `${id} ${s.name}`).toContain(e.status);
        if (e.kind === 'damage') for (const k of Object.keys(e)) expect(DAMAGE_KEYS.has(k), `${id} ${s.name} ${k}`).toBe(true);
      }
    }
  });

  it('remnants and lore are as ruled', () => {
    // Plan ruling 6: the remnants of people.
    const REMNANTS = ['bell-watcher', 'bell-warden', 'hush-acolyte', 'hollow-hunter', 'hollow-champion', 'keeper-echo', 'mirage-dancer', 'mirage-lead',
      'frozen-pilgrim', 'debt-collector', 'fallen-knight', 'banner-bearer', 'last-commander'];
    expect(rosterIds().filter((id) => ENEMIES[id].remnant).sort()).toEqual([...REMNANTS].sort());
    // Spec §4.2: the story species tied to a companion's past (siege-titan is §5.6's 故事 boss of the iron fortress).
    const LORE: Record<string, CharacterId> = {
      'false-moon': 'selene',
      'bell-watcher': 'rin', 'bell-warden': 'rin', 'hush-acolyte': 'rin',
      'ancestor-automaton': 'bobby', 'toppled-automaton': 'bobby',
      'keeper-echo': 'hero',
      'mirage-dancer': 'safira', 'mirage-lead': 'safira', 'mirage-city': 'safira', 'sand-scorpion': 'safira', 'sandstorm-maw': 'safira',
      'ice-komainu': 'chizuru', 'frozen-pilgrim': 'chizuru', 'ice-shrine': 'chizuru', 'rift-maw': 'chizuru',
      'star-ember': 'noel', 'stolen-tome': 'noel', 'burning-page': 'noel', 'starfire-colossus': 'noel',
      'ashen-treant': 'sylvie', 'grey-elder': 'sylvie', 'grey-blight': 'sylvie',
      'vault-mimic': 'liz', 'locked-vault': 'liz', 'debt-collector': 'liz',
      'fallen-knight': 'scarlet', 'banner-bearer': 'scarlet', 'gate-breaker': 'scarlet', 'last-commander': 'scarlet', 'siege-titan': 'scarlet',
    };
    expect(Object.fromEntries(rosterIds().filter((id) => ENEMIES[id].lore).map((id) => [id, ENEMIES[id].lore]))).toEqual(LORE);
    // No roster foe is a story fight's foe (ruling 6): `story` keeps its meaning.
    for (const id of rosterIds()) expect(ENEMIES[id].story, id).toBeUndefined();
  });

  it('every normal species carries its inscription key', () => {
    for (const [id, [, key]] of Object.entries(NORMALS)) {
      expect(ENEMIES[id].inscribe, id).toBe(key);
      expect(Object.hasOwn(AFFIXES, key), `${id} ${key}`).toBe(true);
    }
    for (const id of rosterIds()) if (!NORMALS[id]) expect(ENEMIES[id].inscribe, id).toBeUndefined();
  });
});

/** Spec §5.5 and §5.6 (plan ruling 12): each boss's and warden's trophy, and the nine companions' keepsakes. */
const TROPHIES: Record<string, string> = {
  'false-moon': 'moon-silver', 'bell-warden': 'tower-dust', 'toppled-automaton': 'automaton-core', 'requiem-conductor': 'dusk-baton',
  'lantern-brood': 'brood-shell', 'mirage-lead': 'copper-anklet', 'ice-shrine': 'shrine-rope', 'burning-page': 'ash-page',
  'grey-elder': 'ashen-acorn', 'locked-vault': 'vault-coin', 'gate-breaker': 'gate-splinter',
  'fog-warden': 'fog-gate-plate', 'silent-bell': 'silent-bronze', 'hollow-champion': 'hundred-hilts', 'old-city-archon': 'archon-gold',
  'gorged-beast': 'gorged-lantern', 'lantern-mother': 'mother-light', 'forgotten-festival': 'festival-paper', 'starless-whale': 'starless-ambergris',
  'stopped-clock': 'clock-spring', 'first-lantern': 'first-flame', 'ember-tyrant': 'tyrant-cinder', 'sandstorm-maw': 'storm-glass',
  'mirage-city': 'mirage-brick', 'rime-sovereign': 'rime-crown-shard', 'white-silence': 'silence-snow', 'rift-maw': 'rift-ice',
  'thunder-roc': 'roc-plume', 'storm-conductor': 'conductor-rod', 'starfire-colossus': 'starfire-core', 'mire-hydra': 'hydra-scale',
  'grey-blight': 'blight-ash', 'bog-leviathan': 'leviathan-tooth', 'faceless-host': 'blank-mirror', 'vault-dragon': 'dragon-gold',
  'shadow-parade': 'parade-lantern', 'fortress-colossus': 'colossus-bolt', 'siege-titan': 'titan-hide', 'last-commander': 'commander-medal',
};
const KEEPSAKES: Record<string, CharacterId> = {
  'tower-dust': 'rin', 'moon-silver': 'selene', 'shrine-rope': 'chizuru', 'copper-anklet': 'safira', 'ashen-acorn': 'sylvie',
  'ash-page': 'noel', 'automaton-core': 'bobby', 'vault-coin': 'liz', 'gate-splinter': 'scarlet',
};
/** Spec §5.3 and §5.4's 稀有 column: the existing rare materials a species also drops. */
const RARE_DROPS: Record<string, [string, number]> = {
  'paper-moth': ['star-tear', 0.005], 'tin-soldier': ['ancient-gear', 0.01], 'dust-mimic': ['old-coin', 0.1], 'market-ghost': ['old-coin', 0.15],
  'hollow-hunter': ['king-scale', 0.005], 'moon-crow': ['star-tear', 0.01], 'old-city-sentinel': ['ancient-gear', 0.02],
  'ancestor-automaton': ['ancient-gear', 0.04], 'keeper-echo': ['star-tear', 0.03], 'sorrow-crystal': ['star-tear', 0.02],
  'returning-light': ['star-tear', 0.03], 'hoarder': ['star-tear', 0.25], 'gilded-hoarder': ['king-scale', 0.2],
  'mirage-dancer': ['king-scale', 0.01], 'frozen-pilgrim': ['old-coin', 0.1], 'star-ember': ['star-tear', 0.01], 'vault-mimic': ['old-coin', 0.2],
  'rivet-golem': ['ancient-gear', 0.02], 'fallen-knight': ['king-scale', 0.01],
};
/** Spec §5.5 and §5.6: each own unique, its owner, slot and fixed affixes. */
const OWN_UNIQUES: Record<string, [string, GearSlot, AnyStat[]]> = {
  'moonless-mirror': ['false-moon', 'offhand', ['res', 'heal', 'int']], 'unrung-clapper': ['bell-warden', 'neck', ['sleepRes', 'tpCost', 'wil']],
  'ancestor-gauntlet': ['toppled-automaton', 'hands', ['armor', 'atk', 'int']], 'requiem-staff': ['requiem-conductor', 'weapon', ['mag', 'heal', 'wil']],
  'brood-lantern': ['lantern-brood', 'neck', ['hp', 'res', 'gauge']], 'last-dance-veil': ['mirage-lead', 'body', ['agi', 'gauge', 'res']],
  'ninety-nine-steps': ['ice-shrine', 'feet', ['def', 'wil', 'iceRes']], 'starbound-tome': ['burning-page', 'offhand', ['mag', 'int', 'tp']],
  'arrowmark-bow': ['grey-elder', 'weapon', ['agi', 'crit', 'critDmg']], 'hungry-purse': ['locked-vault', 'ring', ['goldFind', 'matFind', 'agi']],
  'gatewarden-shield': ['gate-breaker', 'offhand', ['block', 'def', 'hp']],
  'fog-halberd': ['fog-warden', 'weapon', ['atk', 'str', 'eliteDmg']], 'silent-chime': ['silent-bell', 'neck', ['sleepRes', 'tpCost', 'res']],
  'borrowed-blade': ['hollow-champion', 'weapon', ['multi', 'critDmg', 'str']], 'archon-crown': ['old-city-archon', 'head', ['res', 'tpCost', 'int']],
  'glutton-gauntlet': ['gorged-beast', 'hands', ['atk', 'crit', 'def']], 'cradled-light': ['lantern-mother', 'neck', ['heal', 'wil', 'gauge']],
  'festival-mask': ['forgotten-festival', 'head', ['goldFind', 'evasion', 'agi']], 'whale-song-ring': ['starless-whale', 'ring', ['tp', 'tpRegen', 'mag']],
  'still-hand-boots': ['stopped-clock', 'feet', ['spd', 'evasion', 'agi']], 'first-lantern-staff': ['first-lantern', 'weapon', ['mag', 'fireDmg', 'int']],
  'burning-crown-ring': ['ember-tyrant', 'ring', ['fireDmg', 'atk', 'crit']], 'sand-veil-boots': ['sandstorm-maw', 'feet', ['evasion', 'fireRes', 'agi']],
  'troupe-drum': ['mirage-city', 'offhand', ['tp', 'heal', 'agi']], 'everwinter-veil': ['rime-sovereign', 'body', ['iceRes', 'res', 'hp']],
  'snowmute-ring': ['white-silence', 'ring', ['tp', 'iceDmg', 'int']], 'sealing-spear': ['rift-maw', 'weapon', ['atk', 'iceDmg', 'wil']],
  'roc-feather-boots': ['thunder-roc', 'feet', ['spd', 'thunderRes', 'agi']], 'conductor-ring': ['storm-conductor', 'ring', ['thunderDmg', 'crit', 'mag']],
  'starfire-tiara': ['starfire-colossus', 'head', ['int', 'tp', 'tpCost']], 'hydra-fang': ['mire-hydra', 'weapon', ['crit', 'vuln', 'agi']],
  'greenward-cloak': ['grey-blight', 'body', ['hp', 'wil', 'res']], 'bog-ring': ['bog-leviathan', 'ring', ['tp', 'wil', 'tpRegen']],
  'faceless-mask': ['faceless-host', 'head', ['evasion', 'int', 'res']], 'gilded-mail': ['vault-dragon', 'body', ['armor', 'hp', 'def']],
  'parade-boots': ['shadow-parade', 'feet', ['agi', 'evasion', 'spd']], 'colossus-gauntlet': ['fortress-colossus', 'hands', ['armor', 'def', 'str']],
  'wallclimber-boots': ['siege-titan', 'feet', ['def', 'spd', 'str']], 'red-horn': ['last-commander', 'neck', ['gauge', 'hp', 'wil']],
};
/** The weapon kinds by name (data/gear.ts's rule: 槍 spear, 劍 sword, 杖 staff, 弓 bow, 刃 dagger). */
const OWN_WEAPON_KINDS: Record<string, WeaponKind> = {
  'requiem-staff': 'staff', 'arrowmark-bow': 'bow', 'fog-halberd': 'spear', 'borrowed-blade': 'sword', 'first-lantern-staff': 'staff',
  'sealing-spear': 'spear', 'hydra-fang': 'dagger',
};
const BAND_PRICE = { B: 20, C: 30, D: 40, E: 50, F: 60 } as const;

const rosterMats = () => Object.values(MATERIALS).filter((m) => m.owner);
const ownUniques = () => Object.values(SPECIALS).filter((s) => s.owner);

describe('roster materials and own uniques (roster plan Task A3, spec §7)', () => {
  it('ninety-eight new materials', () => {
    const mats = rosterMats();
    expect(mats).toHaveLength(98);
    expect(mats.filter((m) => m.kind === 'monster')).toHaveLength(59);
    expect(mats.filter((m) => m.kind === 'trophy')).toHaveLength(30);
    expect(mats.filter((m) => m.kind === 'keepsake')).toHaveLength(9);
    expect(new Set(mats.map((m) => m.owner)).size).toBe(98);
    for (const m of mats) {
      expect(ENEMIES[m.owner!], `${m.id} owner`).toBeDefined();
      expect(LEGACY_ENEMY_IDS, m.id).not.toContain(m.owner);
      expect(ownerOf(m.id), m.id).toBe(m.owner);
    }
    for (const [id] of Object.entries(NORMALS)) expect(mats.find((m) => m.owner === id)?.kind, id).toBe('monster');
    for (const [owner, mat] of Object.entries(TROPHIES)) {
      expect(MATERIALS[mat]?.owner, mat).toBe(owner);
      expect(MATERIALS[mat].kind, mat).toBe(KEEPSAKES[mat] ? 'keepsake' : 'trophy');
    }
    // A keepsake belongs to a warden whose story is that companion's.
    for (const [mat, who] of Object.entries(KEEPSAKES)) expect(ENEMIES[MATERIALS[mat].owner!].lore, mat).toBe(who);
    for (const id of Object.keys(PARTS)) expect(mats.some((m) => m.owner === id), id).toBe(false);
    expect(MATERIALS['iou-slip'].name).toBe('泛黃的紙條');
    // The game's own 22 are all still there, untouched.
    for (const id of ['moss', 'old-coin', 'star-tear', 'blaze-core', 'essence-legendary']) expect(MATERIALS[id].owner, id).toBeUndefined();
    expect(Object.values(MATERIALS).filter((m) => !m.owner)).toHaveLength(22);
  });

  it('every boss and warden pays one trophy or keepsake', () => {
    for (const [owner, mat] of Object.entries(TROPHIES)) expect(ENEMIES[owner].drops, owner).toEqual([{ mat, chance: 1 }]);
    for (const id of Object.keys(PARTS)) expect(ENEMIES[id].drops, id).toEqual([]);
  });

  it('every normal species pays its signature', () => {
    for (const id of Object.keys(NORMALS)) {
      const sig = rosterMats().find((m) => m.owner === id)!;
      const [first, ...rest] = ENEMIES[id].drops;
      expect(first.mat, id).toBe(sig.id);
      expect(first.chance >= 0.35 && first.chance <= 0.5, `${id} ${first.chance}`).toBe(true);
      expect(rest, id).toEqual(RARE_DROPS[id] ? [{ mat: RARE_DROPS[id][0], chance: RARE_DROPS[id][1] }] : []);
    }
  });

  it('prices follow the band', () => {
    for (const m of rosterMats()) {
      const e = ENEMIES[m.owner!];
      // A native turns up from depth 4, the B band; a trophy or keepsake pays by its owner's rank.
      const want = m.kind !== 'monster' ? (e.boss ? 200 : 120) : e.band ? BAND_PRICE[e.band] : BAND_PRICE.B;
      expect(m.price, m.id).toBe(want);
    }
  });

  it('thirty-nine own uniques', () => {
    const own = ownUniques();
    expect(own).toHaveLength(39);
    expect(Object.fromEntries(own.map((s) => [s.id, [s.owner, s.slot, s.fixed]]))).toEqual(OWN_UNIQUES);
    expect(new Set(own.map((s) => s.owner)).size).toBe(39);
    for (const s of own) {
      const e = ENEMIES[s.owner!];
      expect(s.rarity, s.id).toBe('unique');
      expect(s.region, s.id).toBeNull();
      expect(s.source, s.id).toBe(e.boss ? 'boss' : 'elite');
      expect(e.boss || e.rank === 'warden', s.id).toBe(true);
      expect(s.fixed, s.id).toHaveLength(3);
      for (const k of s.fixed!) expect(AFFIXES[k].slots, `${s.id} ${k}`).toContain(s.slot);
      expect(s.weaponKind, s.id).toBe(OWN_WEAPON_KINDS[s.id]);
      expect(s.lore.length > 0 && !s.lore.includes('……'), s.id).toBe(true);
    }
  });

  it('own uniques never enter a drop pool', () => {
    const regions: RegionId[] = ['mainline', 'blaze', 'frost', 'storm', 'mire', 'shade', 'iron'];
    for (const r of regions) for (const s of regionSpecials(r)) expect(s.owner, s.id).toBeUndefined();
    for (const s of generalLegendaries()) expect(s.owner, s.id).toBeUndefined();
    for (let seed = 1; seed <= 300; seed++) for (const r of regions) for (const src of ['monster', 'elite', 'boss'] as const) {
      expect(pickSpecial(mulberry32(seed), r, src).owner, `${seed} ${r} ${src}`).toBeUndefined();
    }
  });

  it('art waits on the owner (ruling 3)', () => {
    for (const m of Object.values(MATERIALS)) expect(artMaterial(m.id), m.id).toBe(!m.owner);
    for (const s of Object.values(SPECIALS)) expect(artSpecial(s.id), s.id).toBe(!s.owner);
  });
});
