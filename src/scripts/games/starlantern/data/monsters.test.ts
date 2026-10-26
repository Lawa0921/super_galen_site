import { describe, expect, it } from 'vitest';
import { ENEMIES } from './enemies';
import { AFFIXES } from './gear';
import type { RegionId } from './regions';
import type { CharacterId } from '../engine/types';
import { LEGACY_ENEMY_IDS, ROSTER_ART, ROSTER_LIVE, artEnemy, listedEnemy, liveRosterIds } from './monsters';

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

  it('drops wait for their materials (Task A3)', () => {
    for (const id of rosterIds()) expect(ENEMIES[id].drops, id).toEqual([]);
  });
});
