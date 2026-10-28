import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMIES } from './enemies';
import { AFFIXES, SPECIALS, generalLegendaries, regionSpecials } from './gear';
import { MATERIALS } from './materials';
import type { AnyStat, CharacterId, EnemyDef, GearSlot, WeaponKind } from '../engine/types';
import { pickSpecial } from '../engine/loot/drops';
import { mulberry32 } from '../engine/rng';
import {
  LEGACY_ENEMY_IDS, MAINLINE_BOSSES, MAINLINE_TABLES, MAINLINE_WARDENS, NATIVE_GROUPS, REGION_BOSSES, REGION_WARDENS, ROSTER_ART, ROSTER_LIVE,
  WARDEN_GROUPS, artEnemy, artMaterial, artSpecial, bandOf, bossFor, listedEnemy, liveRosterIds, ownerOf, wardenFor,
} from './monsters';
import { REGIONS, type RegionId } from './regions';
import { encounterTable, legacyEncounterTable, scaleEnemy } from '../engine/scaling';
import { withRosterLive } from '../engine/testing';
import { MARKER_GLYPH } from '../render/markers';
import { GLIMMER_SALT, WARDEN_SALT } from '../engine/dungeon/run';
import { STARLIT_SALT } from '../engine/loot/drops';
import { FORGE_SALT } from '../engine/forge/cost';
import { RUNE_SALT } from '../engine/loot/runes';
import { ABSORB_SALT } from '../engine/story/fragments';
import { MEMORY_SALT } from '../engine/story/memories';
import { AFFIX_SALT } from '../engine/tiers';

/** The art factory's registry: what is published, from where (read independently of the switches it is checked against). */
const REGISTRY = JSON.parse(readFileSync('art-factory/starlantern/registry.json', 'utf8')) as {
  assets: Record<string, { status?: string; runtime?: string; final?: string }>;
};
const publishedArt = (aid: string): boolean => {
  const e = REGISTRY.assets[aid];
  return e?.status === 'published' && !!e.runtime && existsSync(`public${e.runtime}`);
};
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

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
    }
    // Drawn exactly when the registry has its sprite published (R0 since PR D); never listed while nothing is live.
    expect(fresh.filter(artEnemy).sort()).toEqual(fresh.filter((id) => publishedArt(`enemy-${id}`)).sort());
    for (const id of ['paper-moth', 'root-hound', 'bell-watcher', 'false-moon', 'fog-warden']) expect(artEnemy(id), id).toBe(true);
    expect(artEnemy('lamp-wight')).toBe(true);           // R1: published in E1 (independent review 2026-10-27)
    expect(artEnemy('old-city-sentinel')).toBe(true);    // R2: published in E2 (independent review 2026-10-27, round 2)
    expect(artEnemy('cinder-imp')).toBe(true);           // R3: published in E3 (independent review 2026-10-28, rounds 1-5)
    expect(artEnemy('ash-mourner')).toBe(false);         // R3's ash-mourner waits for its deferred veil (an L3 prerequisite)
    expect(artEnemy('bog-mother')).toBe(false);          // R4: not drawn yet
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
      // Exp is tuned by Task A4 (exp holds against the legacy tables); it stays near its archetype's.
      expect(ENEMIES[id].exp >= ARCH[arch][6] * 0.6 && ENEMIES[id].exp <= ARCH[arch][6] * 1.15, `${id} exp ${ENEMIES[id].exp}`).toBe(true);
      expect(ENEMIES[id].gold, id).toBe(ARCH[arch][7]);
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

  it('only plain effects and the mechanics built so far', () => {
    // Spec §1.4's kinds, and the mechanics plan B has built: M1's wind-up (B2), M2's guard (a foe's `cover` on an ally,
    // B2), M24's hunt (B2), M13's steal after a hit on one member (B3), M4's call of a foe that exists (B4) and M22's
    // fold-back of a fallen ally (B4). The B2 PR adds its own: M6's borrowed blow (B8); M9's forget, M17's TP drain, M25's
    // poison hunt and M15's buff theft (B9); M27's stall and M28's swallow (B10); and every stage's skills (B7) are held
    // to the same rules; B11's beats, kin, song and hoard too.
    const DAMAGE_KEYS = new Set(['kind', 'power', 'element', 'scale', 'melee', 'hits', 'crit', 'execute', 'wounded', 'drainPct', 'tpDrain', 'vsPoisoned', 'hoardPct']);
    const SKILL_KEYS = new Set(['name', 'chance', 'target', 'effects', 'windup', 'when', 'oncePerFight', 'every', 'needs', 'windupRounds', 'windupAllies', 'fragile']);
    for (const id of rosterIds()) for (const s of [...ENEMIES[id].skills, ...(ENEMIES[id].stages ?? []).flatMap((st) => st.skills)]) {
      expect(['enemy', 'enemies', 'row', 'column', 'cross', 'self', 'ally', 'allies', 'deadAlly'], `${id} ${s.name}`).toContain(s.target);
      expect(s.target === 'deadAlly', `${id} ${s.name}`).toBe(s.when === 'deadAlly');
      expect(s.chance > 0 && s.chance <= 1, `${id} ${s.name}`).toBe(true);
      for (const k of Object.keys(s)) expect(SKILL_KEYS.has(k), `${id} ${s.name} ${k}`).toBe(true);
      if (s.windup !== undefined) expect(s.windup.length > 0 && s.windup !== s.name, `${id} ${s.name}`).toBe(true);
      for (const e of s.effects) {
        expect(['damage', 'inflict', 'buff', 'heal', 'cover', 'hunt', 'steal', 'summon', 'revive', 'mirror', 'dispel', 'delay', 'engulf'], `${id} ${s.name}`).toContain(e.kind);
        if (e.kind === 'delay' || e.kind === 'engulf') expect(s.target, `${id} ${s.name}`).toBe('enemy');
        if (e.kind === 'dispel') expect(s.target, `${id} ${s.name}`).toBe('enemy');
        if (e.kind === 'mirror') expect([s.target, s.effects.length, e.cap > 0], `${id} ${s.name}`).toEqual(['enemy', 1, true]);
        if (e.kind === 'summon') expect([s.target, s.effects.length, !!ENEMIES[e.id], e.max === undefined || e.max > 0], `${id} ${s.name}`).toEqual(['self', 1, true, true]);
        if (e.kind === 'revive') expect(s.when, `${id} ${s.name}`).toBe('deadAlly');
        if (e.kind === 'steal') expect([s.target, s.effects[0].kind, e.perDepth], `${id} ${s.name}`).toEqual(['enemy', 'damage', 5]);
        if (e.kind === 'cover') expect([s.target, s.effects.length], `${id} ${s.name}`).toEqual(['ally', 1]);
        if (e.kind === 'hunt') expect(s.target, `${id} ${s.name}`).toBe('enemy');
        if (e.kind === 'inflict') expect(['poison', 'sleep', 'forget'], `${id} ${s.name}`).toContain(e.status);
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
    // A roster material or unique is loaded exactly when the registry has its icon (both gear images) published.
    for (const m of Object.values(MATERIALS)) expect(artMaterial(m.id), m.id).toBe(!m.owner || publishedArt(`icon-${m.id}`));
    for (const s of Object.values(SPECIALS)) {
      expect(artSpecial(s.id), s.id).toBe(!s.owner || (publishedArt(`gear-${s.id}`) && publishedArt(`gear-${s.id}-large`)));
    }
    expect(artMaterial('faded-letter') && artSpecial('fog-halberd')).toBe(true);     // R0's, published in PR D
    expect(artMaterial('wight-wick') && artSpecial('silent-chime')).toBe(true);      // R1's, published in E1
    expect(artMaterial('marble-shard') && artSpecial('archon-crown')).toBe(true);    // R2's, published in E2
    expect(artMaterial('cinder-dust') && artSpecial('burning-crown-ring')).toBe(true);    // R3's, published in E3
    expect(artMaterial('mourning-veil')).toBe(false);                                     // R3's deferred veil, waiting
    expect(artMaterial('bog-peat') || artSpecial('hydra-fang')).toBe(false);              // R4's, waiting
  });
});

const BANDS = ['B', 'C', 'D', 'E', 'F'] as const;
const NATIVE_REGIONS = ['blaze', 'frost', 'storm', 'mire', 'shade', 'iron'] as const;
const ALL_REGIONS: RegionId[] = ['mainline', ...NATIVE_REGIONS];
/** A region's full table (spec §8.1 step 2, nothing filtered): its six native groups and the band's first six. */
const fullTable = (region: RegionId, band: (typeof BANDS)[number]): string[][] =>
  region === 'mainline' ? MAINLINE_TABLES[band] : [...NATIVE_GROUPS[region], ...MAINLINE_TABLES[band].slice(0, 6)];
const speciesOf = (t: string[][]) => new Set(t.flat());

describe('roster tables, bosses and wardens (roster plan Task A4, spec §3.4, §8, §9.1)', () => {
  it('bandOf follows spec §3.1', () => {
    expect([1, 3, 4, 9, 10, 15, 16, 24, 25, 30, 31, 60].map(bandOf)).toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'E', 'E', 'F', 'F']);
  });

  it('every group has one to three', () => {
    for (const b of BANDS) for (const g of MAINLINE_TABLES[b]) expect(g.length >= 1 && g.length <= 3, `${b} ${g}`).toBe(true);
    for (const r of NATIVE_REGIONS) for (const g of NATIVE_GROUPS[r]) expect(g.length >= 1 && g.length <= 3, `${r} ${g}`).toBe(true);
    for (const [id, g] of Object.entries(WARDEN_GROUPS)) {
      expect(g[0], id).toBe(id);
      expect(g.length >= 1 && g.length <= 2, id).toBe(true);
    }
    for (const id of [...BANDS.flatMap((b) => MAINLINE_TABLES[b].flat()), ...NATIVE_REGIONS.flatMap((r) => NATIVE_GROUPS[r].flat())]) {
      expect(ENEMIES[id], id).toBeDefined();
      expect(ENEMIES[id].boss || ENEMIES[id].rank || ENEMIES[id].story, id).toBeFalsy();
    }
  });

  it('twelve groups a table', () => {
    for (const b of BANDS) expect(MAINLINE_TABLES[b], b).toHaveLength(12);
    for (const r of NATIVE_REGIONS) {
      expect(NATIVE_GROUPS[r], r).toHaveLength(6);
      for (const b of BANDS) expect(fullTable(r, b), `${r} ${b}`).toHaveLength(12);
    }
  });

  it('every roster species sits in at least two groups', () => {
    const groups = [...BANDS.flatMap((b) => MAINLINE_TABLES[b]), ...NATIVE_REGIONS.flatMap((r) => NATIVE_GROUPS[r])];
    for (const id of Object.keys(NORMALS)) expect(groups.filter((g) => g.includes(id)).length, id).toBeGreaterThanOrEqual(2);
    // A native stays home.
    for (const [id, r] of Object.entries(NATIVES)) {
      for (const b of BANDS) expect(MAINLINE_TABLES[b].flat(), id).not.toContain(id);
      for (const o of NATIVE_REGIONS) if (o !== r) expect(NATIVE_GROUPS[o].flat(), id).not.toContain(id);
    }
  });

  it('pairs come in pairs', () => {
    const groups = [...BANDS.flatMap((b) => MAINLINE_TABLES[b]), ...NATIVE_REGIONS.flatMap((r) => NATIVE_GROUPS[r])];
    for (const id of ['mist-twin', 'ice-komainu']) {
      const with_ = groups.filter((g) => g.includes(id));
      expect(with_.length, id).toBeGreaterThan(0);
      for (const g of with_) expect(g.filter((x) => x === id), `${id} ${g}`).toHaveLength(2);
    }
  });

  it('freshness', () => {
    // Spec §3.4: depths six or more apart (4-60) meet mostly other species. A band holds one table, so two depths of one band
    // (D spans nine depths, F has no end) share it: the measure is between the band tables, each against every other, as
    // |shared| / the smaller table's species.
    for (let i = 0; i < BANDS.length; i++) for (let j = i + 1; j < BANDS.length; j++) {
      const [a, b] = [speciesOf(MAINLINE_TABLES[BANDS[i]]), speciesOf(MAINLINE_TABLES[BANDS[j]])];
      const shared = [...a].filter((x) => b.has(x)).length;
      expect(shared / Math.min(a.size, b.size), `${BANDS[i]} ${BANDS[j]}`).toBeLessThanOrEqual(0.6);
    }
  });

  it('no species fills a table', () => {
    for (const r of ALL_REGIONS) for (const b of BANDS) {
      const t = fullTable(r, b);
      expect(speciesOf(t).size, `${r} ${b}`).toBeGreaterThanOrEqual(8);
      for (const id of speciesOf(t)) expect(t.filter((g) => g.includes(id)).length / t.length, `${r} ${b} ${id}`).toBeLessThanOrEqual(0.4);
    }
  });

  it('natives lead a region', () => {
    for (const r of NATIVE_REGIONS) for (const b of BANDS) {
      const t = fullTable(r, b);
      const natives = [...speciesOf(t)].filter((id) => ENEMIES[id].home === r);
      expect(natives.length, `${r} ${b}`).toBeGreaterThanOrEqual(4);
      expect(t.filter((g) => g.some((id) => ENEMIES[id].home === r)).length / t.length, `${r} ${b}`).toBeGreaterThanOrEqual(0.4);
    }
  });

  it('no element wall', () => {
    // Spec §5.1, on each main-road table: a physical resist at most 25% of its species, any one element resisted by at most a
    // third, and no weakness at all at most 20%.
    for (const b of BANDS) {
      const ids = [...speciesOf(MAINLINE_TABLES[b])];
      const share = (f: (id: string) => boolean) => ids.filter(f).length / ids.length;
      expect(share((id) => ENEMIES[id].resist.includes('phys')), `${b} phys`).toBeLessThanOrEqual(0.25);
      for (const el of ['phys', 'fire', 'ice', 'thunder'] as const) expect(share((id) => ENEMIES[id].resist.includes(el)), `${b} ${el}`).toBeLessThanOrEqual(1 / 3);
      expect(share((id) => ENEMIES[id].weak.length === 0), `${b} none`).toBeLessThanOrEqual(0.2);
    }
  });

  it('exp holds against the legacy tables', () => {
    // Spec §9.1 point 4: per region and depth 4-30, the full new table's mean group exp (a treasure foe counted as 0) over
    // the legacy table's, both scaled to the depth and region as the game pays them.
    const exp = (g: string[], region: RegionId, depth: number) =>
      g.reduce((n, id) => n + (NORMALS[id]?.[0] === 'treasure' ? 0 : scaleEnemy(ENEMIES[id], depth, REGIONS[region], false).exp), 0);
    const mean = (t: string[][], region: RegionId, depth: number) => t.reduce((n, g) => n + exp(g, region, depth), 0) / t.length;
    // A region's legacy table is the same at every depth past 3, so each depth is measured alone. The main road's follows
    // the terrain cycle and swings by a third from one depth to the next, while a band holds one table: there each band is
    // measured over its depths together (the sums of the means).
    const inRange = (ratio: number, what: string) => expect(ratio >= 0.92 && ratio <= 1.08, `${what} ${ratio.toFixed(3)}`).toBe(true);
    for (const r of NATIVE_REGIONS) for (let d = 4; d <= 30; d++) {
      const band = bandOf(d) as (typeof BANDS)[number];
      inRange(mean(fullTable(r, band), r, d) / mean(legacyEncounterTable(r, d), r, d), `${r} d${d}`);
    }
    for (const b of ['B', 'C', 'D', 'E'] as const) {
      let fresh = 0, legacy = 0;
      for (let d = 4; d <= 30; d++) if (bandOf(d) === b) {
        fresh += mean(MAINLINE_TABLES[b], 'mainline', d);
        legacy += mean(legacyEncounterTable('mainline', d), 'mainline', d);
      }
      inRange(fresh / legacy, `mainline ${b}`);
    }
  });

  it('bosses never repeat', () => {
    const main = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map((d) => MAINLINE_BOSSES[(d / 5 - 1) % 10]);
    expect(new Set(main).size).toBe(10);
    for (const r of NATIVE_REGIONS) expect(new Set(REGION_BOSSES[r]).size, r).toBe(3);
    for (const id of [...MAINLINE_BOSSES, ...NATIVE_REGIONS.flatMap((r) => REGION_BOSSES[r])]) expect(ENEMIES[id].boss, id).toBe(true);
  });

  it('bossFor and wardenFor tables', () => {
    expect([...MAINLINE_BOSSES]).toEqual(['fog-warden', 'silent-bell', 'hollow-champion', 'old-city-archon', 'gorged-beast', 'lanterneater',
      'forgotten-festival', 'starless-whale', 'stopped-clock', 'first-lantern']);
    expect(REGION_BOSSES).toEqual({
      blaze: ['ember-tyrant', 'sandstorm-maw', 'mirage-city'], frost: ['rime-sovereign', 'white-silence', 'rift-maw'],
      storm: ['thunder-roc', 'storm-conductor', 'starfire-colossus'], mire: ['mire-hydra', 'grey-blight', 'bog-leviathan'],
      shade: ['faceless-host', 'vault-dragon', 'shadow-parade'], iron: ['fortress-colossus', 'siege-titan', 'last-commander'],
    });
    expect([...MAINLINE_WARDENS]).toEqual(['false-moon', 'bell-warden', 'toppled-automaton', 'requiem-conductor', 'lantern-brood']);
    expect(REGION_WARDENS).toEqual({ blaze: 'mirage-lead', frost: 'ice-shrine', storm: 'burning-page', mire: 'grey-elder', shade: 'locked-vault', iron: 'gate-breaker' });
    // Everything live (a test's own switch): the lookups cell by cell, the cycles and the many-part groups.
    withRosterLive(rosterIds(), () => {
      expect(bossFor('mainline', 5)).toEqual(['fog-warden']);
      expect(bossFor('mainline', 20)).toEqual(['archon-hand', 'archon-hand', 'old-city-archon']);
      expect(bossFor('mainline', 30)).toEqual(['lanterneater']);
      expect(bossFor('mainline', 50)).toEqual(['first-lantern']);
      expect(bossFor('mainline', 55)).toEqual(['fog-warden']);
      expect(bossFor('mainline', 70)).toEqual(['archon-hand', 'archon-hand', 'old-city-archon']);
      expect(bossFor('frost', 5)).toEqual(['rime-pillar', 'rime-pillar', 'rime-sovereign']);
      expect(bossFor('frost', 15)).toEqual(['rift-maw']);
      expect(bossFor('frost', 20)).toEqual(['rime-pillar', 'rime-pillar', 'rime-sovereign']);
      expect(bossFor('blaze', 10)).toEqual(['sandstorm-maw']);
      expect(bossFor('iron', 45)).toEqual(['last-commander']);
      expect(wardenFor('mainline', 8)).toBe('false-moon');
      expect(wardenFor('mainline', 13)).toBe('bell-warden');
      expect(wardenFor('mainline', 28)).toBe('lantern-brood');
      expect(wardenFor('mainline', 33)).toBe('false-moon');
      expect(wardenFor('shade', 18)).toBe('locked-vault');
      for (const d of [1, 3, 5, 7, 9, 10, 12, 15, 20]) expect(wardenFor('mainline', d), `${d}`).toBeNull();
    });
    // A boss not yet live is the lantern-eater, as today; so is a live boss whose part is not.
    withRosterLive(['old-city-archon'], () => expect(bossFor('mainline', 20)).toEqual(['lanterneater']));
    withRosterLive(['old-city-archon', 'archon-hand'], () => expect(bossFor('mainline', 20)).toEqual(['archon-hand', 'archon-hand', 'old-city-archon']));
    withRosterLive(['bell-warden'], () => {
      expect(wardenFor('mainline', 13)).toBe('bell-warden');
      expect(wardenFor('mainline', 8)).toBeNull();
    });
  });

  it('salts are distinct', () => {
    // Plan §7.5: the eight SHA-256 initial words in use, and the other salts and constants of the game's streams.
    // RESCUE_SALT (run.ts, not exported) and the literal salts of the chest, floor, fill and event streams are written out.
    const used = [GLIMMER_SALT, STARLIT_SALT, FORGE_SALT, RUNE_SALT, ABSORB_SALT, MEMORY_SALT, AFFIX_SALT,
      0x6a09e667, 0x3c6ef372, 0x5bd1e995, 0x27d4eb2f, 0xe11e, 0x2545f491];
    expect(new Set(used).size).toBe(used.length);
    expect(WARDEN_SALT).toBe(0x428a2f98);
    expect(used).not.toContain(WARDEN_SALT);
  });
});

/**
 * Roster plan Task A5 (spec §4.1, §4.2, ruling 20; widened by the PR A review): a name, a skill's name or an own unique's
 * lore is seen at any depth, so none may carry a word the story has not told yet. Copied from the lore ledger's 揭露表
 * (docs/superpowers/story/starlantern-lore-ledger.md §3, :98-114) and from data/story/story.test.ts (a test file is not
 * imported): `RIN_SECRET_TERMS` (:428), `SPOILERS` (:457, :462) and the whole of `REVEALED` (:1009-1046), row for row, so a
 * companion's words before her piece are kept out too. When either changes, this list changes with it.
 */
const SECRET_WORDS: { re: RegExp; from: string }[] = [
  { re: /靜鐘會/, from: 'ledger :100, story.test.ts :462 (act3)' },
  { re: /守燈人/, from: 'ledger :101-102, story.test.ts :457 (act4, mem:hero:9)' },
  { re: /燈鑰/, from: 'ledger :102-103 (mem:hero:10)' },
  { re: /代號|信物|刺客|派來殺|派去殺|去殺|要殺的人/, from: 'ledger :104, story.test.ts :428 RIN_SECRET_TERMS (mem:rin:6)' },
  { re: /艾斯特拉/, from: 'ledger :101 (act4)' },
  { re: /燈喰之母/, from: 'STORY.finaleBossName (finale); lantern-mother itself excepted' },
  { re: /道具店|露米亞/, from: 'ledger :109 (T10)' },
  { re: /滿月/, from: 'ruling 20: false-moon names neither phase (mem:selene:2)' },
  // REVEALED, story.test.ts :1010-1046
  { re: /洛恩/, from: ':1010, :1021, :1040 (selene, noel, scarlet 5)' },
  { re: /我想看見|新月/, from: ':1011 selene 5' },
  { re: /不在了/, from: ':1012 chizuru 4' },
  { re: /託付/, from: ':1013 chizuru 5' },
  { re: /團長|做決定的/, from: ':1014 safira 4' },
  { re: /[你妳]要繼續跳/, from: ':1015 safira 5' },
  { re: /林子|守林/, from: ':1018 sylvie 1' },
  { re: /帶出去/, from: ':1019 sylvie 4' },
  { re: /帶出來|種子|種下|空地|新綠|發芽/, from: ':1020 sylvie 5' },
  { re: /星火|燒掉/, from: ':1023 noel 3' },
  { re: /燒光|為薪|保護/, from: ':1024 noel 4' },
  { re: /商人/, from: ':1025 noel 5' },
  { re: /祖先/, from: ':1028 bobby 1' },
  { re: /一族|錯了/, from: ':1029 bobby 2' },
  { re: /構造圖|都能裝/, from: ':1030 bobby 3' },
  { re: /道歉|修好/, from: ':1031 bobby 4' },
  { re: /閥/, from: ':1032 bobby 5' },
  { re: /櫃檯|估價的本事|瓶罐/, from: ':1035 liz 1' },
  { re: /債|借據|賒/, from: ':1036 liz 2' },
  { re: /帽子|星燈|光柱/, from: ':1037 liz 3' },
  { re: /麵包.{0,4}焦|焦.{0,4}麵包|寶庫的門/, from: ':1038 liz 4' },
  { re: /爸爸|父親|歐里克|臉想起來/, from: ':1039 liz 5' },
  { re: /起誓|立誓|誓言/, from: ':1042 scarlet 1' },
  { re: /國家|王國/, from: ':1043 scarlet 2' },
  { re: /轉身|逃|號角/, from: ':1044 scarlet 3' },
  { re: /王城|公主|殿下/, from: ':1045 scarlet 4' },
  { re: /朋友|活下去|撤退|密道/, from: ':1046 scarlet 5' },
];
/**
 * Words the roster uses by the spec's own naming, cut out of a text before the scan (PR A review, item 2). Each is an
 * everyday word in the name of a thing, not a companion's telling: 星火 (Noel's piece 3) names the storm land's star-fire
 * foes (spec §4.2: 星屑火, 星火巨像; §5.6: 星火核, 星火頭冠); 號角 (Scarlet's piece 3) names the iron land's last
 * commander's horn (spec §5.6: 紅色號角, and its skill 號角, which never says it is a retreat's).
 */
const APPROVED_WORDS: { word: string; from: string }[] = [
  { word: '星火', from: 'spec §4.2, §5.6 (storm land)' },
  { word: '號角', from: 'spec §5.6 (last-commander, red-horn)' },
];

describe('roster names keep every secret (roster plan Task A5)', () => {
  it('no name, skill name or lore gives a secret away', () => {
    const texts: [string, string][] = [
      ...rosterIds().map((id): [string, string] => [id, ENEMIES[id].name]),
      ...rosterIds().flatMap((id) => ENEMIES[id].skills.map((k): [string, string] => [`${id} skill`, k.name])),
      ...rosterMats().map((m): [string, string] => [m.id, m.name]),
      ...ownUniques().map((s): [string, string] => [s.id, s.name]),
      ...ownUniques().map((s): [string, string] => [`${s.id} lore`, s.lore]),
    ];
    expect(texts.length).toBeGreaterThan(100 + 98 + 39 * 2);
    for (const [id, raw] of texts) {
      const text = APPROVED_WORDS.reduce((t, { word }) => t.split(word).join('〇'), raw);
      for (const { re, from } of SECRET_WORDS) {
        if (id === 'lantern-mother' && re.source === '燈喰之母') continue;
        expect(re.test(text), `${id} 「${raw}」 matches ${re} (${from})`).toBe(false);
      }
    }
  });
});

/**
 * The plan's go-live waves (L1b, L2b with L2c, L3b, L4b), cumulative: what ROSTER_LIVE holds after each (PR A review, item 1).
 */
const WAVE_1 = ['paper-moth', 'lamp-wight', 'root-hound', 'tin-soldier', 'dust-mimic', 'market-ghost', 'tongueless-bell', 'hollow-hunter', 'mist-twin',
  'moon-crow', 'bell-watcher', 'sleepwalker', 'hoarder', 'fog-warden', 'silent-bell', 'hollow-champion', 'false-moon', 'bell-warden'];
const WAVE_2 = [...WAVE_1, 'old-city-sentinel', 'requiem-choir', 'lantern-larva', 'epitaph-golem', 'ancestor-automaton', 'ash-archivist', 'wick-shade',
  'keeper-echo', 'ember-maw', 'sorrow-crystal', 'deep-tendril', 'music-box', 'paper-cranes', 'lost-shadow', 'returning-light', 'gilded-hoarder',
  'old-city-archon', 'gorged-beast', 'forgotten-festival', 'starless-whale', 'stopped-clock', 'first-lantern', 'lantern-mother', 'archon-hand',
  'toppled-automaton', 'requiem-conductor', 'lantern-brood'];
const WAVE_3 = [...WAVE_2, ...Object.entries(NATIVES).filter(([, r]) => ['blaze', 'frost', 'storm'].includes(r)).map(([id]) => id),
  ...REGION_BOSSES.blaze, ...REGION_BOSSES.frost, ...REGION_BOSSES.storm, 'mirage-lead', 'ice-shrine', 'burning-page', 'rime-pillar'];
const WAVE_4 = [...WAVE_3, ...Object.entries(NATIVES).filter(([, r]) => ['mire', 'shade', 'iron'].includes(r)).map(([id]) => id),
  ...REGION_BOSSES.mire, ...REGION_BOSSES.shade, ...REGION_BOSSES.iron, 'grey-elder', 'locked-vault', 'gate-breaker'];

describe('every live wave keeps the tables whole (PR A review, item 1; spec §3.4, §9.1 point 4)', () => {
  const treasure = (id: string) => NORMALS[id]?.[0] === 'treasure';
  const groupExp = (g: string[], region: RegionId, depth: number) =>
    g.reduce((n, id) => n + (treasure(id) ? 0 : scaleEnemy(ENEMIES[id], depth, REGIONS[region], false).exp), 0);
  const mean = (t: string[][], region: RegionId, depth: number) => t.reduce((n, g) => n + groupExp(g, region, depth), 0) / t.length;
  const inRange = (ratio: number, what: string) => expect(ratio >= 0.92 && ratio <= 1.08, `${what} ${ratio.toFixed(3)}`).toBe(true);
  const nativesLive = (r: Land) => NATIVE_GROUPS[r].flat().every((id) => ROSTER_LIVE.has(id));

  type Land = (typeof NATIVE_REGIONS)[number];
  for (const [name, wave] of [['L1', WAVE_1], ['L2', WAVE_2], ['L3', WAVE_3], ['L4', WAVE_4]] as const) {
    it(`wave ${name}: species, natives and exp hold on every band and region`, () => {
      expect(new Set(wave).size, name).toBe(wave.length);
      withRosterLive([...wave], () => {
        for (const r of ALL_REGIONS) for (let d = 4; d <= 60; d++) {
          const t = encounterTable(r, d);
          const legacy = legacyEncounterTable(r, d);
          const what = `${name} ${r} d${d}`;
          const replaced = JSON.stringify(t.slice(0, legacy.length)) !== JSON.stringify(legacy);
          // Ruling (PR A review): a region's table is its own only once its natives are live; until then the legacy table
          // stays whole and live roster groups only join it. The main road's band table replaces it once six groups are live.
          if (r !== 'mainline') expect(replaced, what).toBe(nativesLive(r as Land));
          if (replaced) {
            // Spec §3.4 holds on every table the roster stands in for (a legacy table is today's game and keeps its own shape).
            const species = speciesOf(t);
            expect(species.size, what).toBeGreaterThanOrEqual(8);
            for (const id of species) expect(t.filter((g) => g.some((x) => x === id)).length / t.length, `${what} ${id}`).toBeLessThanOrEqual(0.4);
            if (r !== 'mainline') {
              const land = r as Land;
              expect([...species].filter((id) => ENEMIES[id].home === land).length, what).toBeGreaterThanOrEqual(4);
              expect(t.filter((g) => g.some((id) => ENEMIES[id].home === land)).length / t.length, what).toBeGreaterThanOrEqual(0.4);
            }
          }
          if (r !== 'mainline') {
            if (d <= 30) inRange(mean(t, r, d) / mean(legacyEncounterTable(r, d), r, d), `${what} exp`);
          }
        }
        // The main road, each band over its depths together (see exp holds against the legacy tables).
        for (const b of ['B', 'C', 'D', 'E'] as const) {
          let fresh = 0, legacy = 0;
          for (let d = 4; d <= 30; d++) if (bandOf(d) === b) {
            fresh += mean(encounterTable('mainline', d), 'mainline', d);
            legacy += mean(legacyEncounterTable('mainline', d), 'mainline', d);
          }
          inRange(fresh / legacy, `${name} mainline ${b} exp`);
        }
      });
    });
  }

  it('the waves end with the whole roster live', () => {
    expect([...WAVE_4].sort()).toEqual(rosterIds().sort());
  });
});

describe('a warden waits for its room (PR A review, item 3)', () => {
  it('no warden goes live before the map can mark and enter a warden room', () => {
    // floorOf places a live warden's room; plan B5 marks it on the map (the elite's event tile) and `move` enters it.
    const ready = Object.hasOwn(MARKER_GLYPH, 'warden');
    expect(ready).toBe(true);
    for (const id of [...MAINLINE_WARDENS, ...Object.values(REGION_WARDENS)]) expect(ROSTER_LIVE.has(id) && !ready, `${id} is live with no warden room`).toBe(false);
  });
});

describe('roster plan B11: every roster foe fights the way the roster says', () => {
  /** What each mechanic code asks of a definition (spec §6.2; ruling 9's names). */
  const all = (d: EnemyDef) => [...d.skills, ...(d.stages ?? []).flatMap((st) => st.skills)];
  const effects = (d: EnemyDef) => all(d).flatMap((k) => k.effects);
  const CHECK: Record<string, (d: EnemyDef) => boolean> = {
    M1: (d) => all(d).some((k) => !!k.windup),
    M2: (d) => all(d).some((k) => k.target === 'ally' && k.effects.some((e) => e.kind === 'cover')),
    M3: (d) => d.fleeAfter !== undefined,
    M4: (d) => effects(d).some((e) => e.kind === 'summon'),
    M5: (d) => !!d.prism || (!!d.stageEvery && d.stageEvery === 1),
    M6: (d) => effects(d).some((e) => e.kind === 'mirror'),
    M7: (d) => !!d.parts,
    M8: (d) => !!d.stages?.length,
    M9: (d) => effects(d).some((e) => e.kind === 'inflict' && e.status === 'forget'),
    M10: (d) => !!d.onFall || !!d.onAllyFall,
    M11: (d) => effects(d).some((e) => e.kind === 'damage' && !!e.drainPct),
    M13: (d) => effects(d).some((e) => e.kind === 'steal'),
    M14: (d) => d.opener === 'disguise' || d.opener === 'asleep' || d.opener === 'ambush',
    M15: (d) => effects(d).some((e) => e.kind === 'dispel'),
    M16: (d) => !!d.adapt,
    M17: (d) => effects(d).some((e) => e.kind === 'damage' && !!e.tpDrain),
    M18: (d) => !!d.mimic,
    M19: (d) => d.opener === 'decoy',
    M20: (d) => !!d.shareWith,
    M21: (d) => !!d.mend,
    M22: (d) => !!d.rise || all(d).some((k) => k.when === 'deadAlly'),
    M23: (d) => d.opener === 'encased',
    M24: (d) => effects(d).some((e) => e.kind === 'hunt'),
    M25: (d) => effects(d).some((e) => e.kind === 'damage' && !!e.vsPoisoned),
    M26: (d) => !!d.rally || !!d.throng,
    M27: (d) => effects(d).some((e) => e.kind === 'delay'),
    M28: (d) => effects(d).some((e) => e.kind === 'engulf'),
    // The rules a trait in spec §5 names beyond the codes: a beat every N rounds, a skill that waits for its kin, a
    // two-round song, harder to hit with each blow, a slow that deepens, a breath that grows with its hoard.
    every: (d) => all(d).some((k) => !!k.every),
    needs: (d) => all(d).some((k) => !!k.needs),
    song: (d) => all(d).some((k) => (k.windupRounds ?? 1) > 1 && !!k.windupAllies?.length && !!k.fragile),
    dodge: (d) => !!d.dodgeUp,
    stack: (d) => effects(d).some((e) => e.kind === 'buff' && e.stackTo !== undefined),
    hoard: (d) => effects(d).some((e) => e.kind === 'damage' && !!e.hoardPct),
    // D: existing effects only (spec §6.2), at least one skill of its own.
    D: (d) => d.skills.length > 0,
  };
  /** Spec §5.3–§5.6's 特性 column, as codes; a regional boss's 區 elements are its region's. */
  const TRAITS: Record<string, string[]> = {
    'paper-moth': ['D'], 'lamp-wight': ['D'], 'root-hound': ['M1'], 'tin-soldier': ['M2'], 'dust-mimic': ['M14'], 'market-ghost': ['M13'],
    'tongueless-bell': ['M9'], 'hollow-hunter': ['M6'], 'mist-twin': ['M10'], 'moon-crow': ['M5'], 'bell-watcher': ['M24'], 'sleepwalker': ['M14'],
    'old-city-sentinel': ['M1', 'M2'], 'requiem-choir': ['M4'], 'lantern-larva': ['M11'], 'epitaph-golem': ['D'], 'ancestor-automaton': ['M21'],
    'ash-archivist': ['M15'], 'wick-shade': ['M10'], 'keeper-echo': ['M1', 'M6'], 'ember-maw': ['M4'], 'sorrow-crystal': ['M16'],
    'deep-tendril': ['M17'], 'music-box': ['M1', 'song'], 'paper-cranes': ['M22'], 'lost-shadow': ['M18'], 'returning-light': ['D', 'M10'],
    'hoarder': ['M3'], 'gilded-hoarder': ['M3', 'dodge'],
    'cinder-imp': ['M10'], 'forge-hound': ['M1'], 'ash-mourner': ['D'], 'mirage-dancer': ['M19'], 'sand-scorpion': ['M25'],
    'frost-doll': ['M2'], 'glacier-tortoise': ['M1'], 'snow-caller': ['D'], 'ice-komainu': ['M20'], 'frozen-pilgrim': ['M23'],
    'thunder-kite': ['D'], 'storm-totem': ['D'], 'charge-jelly': ['M1'], 'star-ember': ['M17'], 'stolen-tome': ['M5'],
    'bog-mother': ['M4'], 'rot-lily': ['D'], 'leech-knight': ['M11'], 'ashen-treant': ['M21'], 'spore-moth': ['M10'],
    'mirror-thief': ['M6'], 'veil-stalker': ['D'], 'hush-acolyte': ['M9'], 'vault-mimic': ['M14', 'M13'], 'debt-collector': ['M24', 'M13'],
    'rivet-golem': ['M2'], 'siege-crab': ['M1'], 'herald-engine': ['D'], 'fallen-knight': ['M2', 'M10'], 'banner-bearer': ['M26'],
    'false-moon': ['M8'], 'bell-warden': ['M24', 'M9', 'M8'], 'toppled-automaton': ['M21', 'M22'], 'requiem-conductor': ['M4'],
    'lantern-brood': ['M4'], 'mirage-lead': ['M19', 'every'], 'ice-shrine': ['M4', 'M7'], 'burning-page': ['M17', 'M9', 'M10'],
    'grey-elder': ['M21', 'M4', 'every'], 'locked-vault': ['M13'], 'gate-breaker': ['M1', 'M4'],
    'fog-warden': ['M1'], 'silent-bell': ['M9', 'M8'], 'hollow-champion': ['M6', 'M8'], 'old-city-archon': ['M7'], 'gorged-beast': ['M4', 'M11'],
    'lantern-mother': ['D'], 'forgotten-festival': ['M4', 'needs'], 'starless-whale': ['M1', 'M11', 'every'], 'stopped-clock': ['M27'],
    'first-lantern': ['M8', 'M5'], 'ember-tyrant': ['M8'], 'sandstorm-maw': ['every'], 'mirage-city': ['M4', 'M7'], 'rime-sovereign': ['M7'],
    'white-silence': ['stack', 'M9'], 'rift-maw': ['M4', 'M8'], 'thunder-roc': ['M1'], 'storm-conductor': ['M24'], 'starfire-colossus': ['M17'],
    'mire-hydra': ['M8'], 'grey-blight': ['M4', 'M7', 'M10'], 'bog-leviathan': ['M28'], 'faceless-host': ['M6', 'M4'],
    'vault-dragon': ['M13', 'hoard'], 'shadow-parade': ['M4', 'M26'], 'fortress-colossus': ['M4', 'M1'], 'siege-titan': ['M1'],
    'last-commander': ['M2'], 'archon-hand': ['D'], 'rime-pillar': ['D'],
  };

  it('every trait is implemented', () => {
    expect(Object.keys(TRAITS).sort()).toEqual(rosterIds().sort());
    for (const [id, codes] of Object.entries(TRAITS)) for (const code of codes) {
      // grey-blight's pods are spore moths: their own fall poisons (M10 is theirs, called by it).
      const d = id === 'grey-blight' && code === 'M10' ? ENEMIES['spore-moth'] : ENEMIES[id];
      expect(CHECK[code](d), `${id} ${code}`).toBe(true);
    }
    // stolen-tome turns its pages in order, a round each, the intent naming the next one's element (M5 variant).
    expect(ENEMIES['stolen-tome'].stageEvery).toBe(1);
    expect(ENEMIES['stolen-tome'].stages).toHaveLength(2);
  });

  it('every summon names a roster foe that summons nothing deeper than one level', () => {
    const calls = (d: EnemyDef) => all(d).flatMap((k) => k.effects).flatMap((e) => (e.kind === 'summon' ? [e.id] : []));
    for (const id of rosterIds()) for (const callee of calls(ENEMIES[id])) {
      const d = ENEMIES[callee];
      expect(d, `${id} → ${callee}`).toBeDefined();
      expect([!!d.boss, d.rank], `${id} → ${callee}`).toEqual([false, undefined]);
      // What it calls may call once more, never a third time.
      for (const grand of calls(d)) expect(calls(ENEMIES[grand]), `${id} → ${callee} → ${grand}`).toEqual([]);
    }
  });
});

describe('roster art switch (roster plan Task D4)', () => {
  // A roster id enters ROSTER_ART only in its art round's publish commit (art-factory/starlantern/tools/roster_art.py publish):
  // from then on the game loads its sprite, its material's icon and its own unique's two gear images, so all of them must
  // be published in the registry, on disk, and be the very bytes the registry's QA-passed final holds (PR D review, Low 6).
  // The 5d cross-check (render/gearArt.test.ts) leaves the roster's ids to this.
  const shipped = (aid: string) => {
    const e = REGISTRY.assets[aid];
    expect(publishedArt(aid), aid).toBe(true);
    expect(sha256(`public${e.runtime}`), `${aid}: the runtime file is its registry final`).toBe(sha256(e.final!));
  };

  it('every art id is published', () => {
    const fresh = new Set(rosterIds());
    for (const id of ROSTER_ART) {
      expect(fresh.has(id) && !LEGACY_ENEMY_IDS.includes(id), `${id} is a roster id`).toBe(true);
      shipped(`enemy-${id}`);
      for (const m of Object.values(MATERIALS).filter((x) => x.owner === id)) shipped(`icon-${m.id}`);
      for (const s of Object.values(SPECIALS).filter((x) => x.owner === id)) {
        shipped(`gear-${s.id}`);
        shipped(`gear-${s.id}-large`);
      }
    }
  });
});

describe('roster plan B2 review item 7: the traits carry the numbers spec §5 and §0 item 19 fix', () => {
  const all = (d: EnemyDef) => [...d.skills, ...(d.stages ?? []).flatMap((st) => st.skills)];
  const effs = (id: string) => all(ENEMIES[id]).flatMap((k) => k.effects);
  const dmg = (id: string, key: 'drainPct' | 'tpDrain' | 'vsPoisoned' | 'hoardPct') =>
    effs(id).flatMap((e) => (e.kind === 'damage' && e[key] !== undefined ? [e[key]] : []));
  const calls = (id: string) => effs(id).flatMap((e) => (e.kind === 'summon' ? [e.id] : []));

  it('every mechanic parameter is the design value (design changes only through a recorded ruling in an L task)', () => {
    const E = ENEMIES;
    // M3, and the gilded hoarder's dodge (spec §5.3).
    expect([E.hoarder.fleeAfter, E['gilded-hoarder'].fleeAfter, E['gilded-hoarder'].dodgeUp]).toEqual([3, 2, 10]);
    // M7: every shield halves (spec §6.2's 50).
    for (const id of ['old-city-archon', 'rime-sovereign', 'ice-shrine', 'mirage-city', 'grey-blight']) expect(E[id].parts?.cutPct, id).toBe(50);
    expect([E['ice-shrine'].parts?.by, E['mirage-city'].parts?.by, E['grey-blight'].parts?.by]).toEqual([['ice-komainu'], ['mirage-dancer'], ['spore-moth']]);
    // M22: 30% (spec §5.3 paper cranes, §5.5 toppled automaton).
    expect(E['toppled-automaton'].rise).toEqual({ pct: 30 });
    expect(effs('paper-cranes').find((e) => e.kind === 'revive')).toEqual({ kind: 'revive', hpPct: 0.3 });
    // M11 (spec §5.3, §5.4, §5.6).
    expect([dmg('lantern-larva', 'drainPct'), dmg('leech-knight', 'drainPct'), dmg('gorged-beast', 'drainPct')]).toEqual([[50], [50], [40]]);
    // M17: 15 a hit; M25: half again; M16: three rounds; M18: 60%; M21: 12% shorted by thunder, 10% for the treant.
    for (const id of ['deep-tendril', 'star-ember', 'burning-page', 'starfire-colossus']) expect(dmg(id, 'tpDrain'), id).toEqual([15]);
    expect(dmg('sand-scorpion', 'vsPoisoned')).toEqual([50]);
    expect([E['sorrow-crystal'].adapt, E['lost-shadow'].mimic]).toEqual([3, 60]);
    expect([E['ancestor-automaton'].mend, E['ashen-treant'].mend]).toEqual([{ pct: 12, stopBy: 'thunder' }, { pct: 10 }]);
    // M10: the twin's anger, the wick's and the imp's bursts, the returning light's farewell, the knight's steel.
    expect(E['mist-twin'].onFall?.effects).toEqual([{ kind: 'buff', stat: 'atk', pct: 40, turns: 3 }]);
    expect(E['wick-shade'].onFall?.effects[0]).toMatchObject({ kind: 'damage', power: 40, element: 'fire' });
    expect([E['cinder-imp'].onFall?.target, E['cinder-imp'].onFall?.effects[0]]).toEqual(['row', expect.objectContaining({ power: 35, element: 'fire' })]);
    expect(E['returning-light'].onFall?.effects).toEqual([{ kind: 'restore', hpPct: 10 }]);
    expect(E['fallen-knight'].onAllyFall?.effects).toEqual([{ kind: 'buff', stat: 'def', pct: 30, turns: 3 }]);
    expect(E['burning-page'].onFall?.effects).toEqual([{ kind: 'restore', tp: 20 }]);
    // M19, M23, M26, M27, M28 and the slow that deepens.
    expect([E['mirage-dancer'].opener, E['mirage-lead'].decoys, E['frozen-pilgrim'].opener]).toEqual(['decoy', 2, 'encased']);
    expect([E['banner-bearer'].rally, E['shadow-parade'].throng]).toEqual([{ atk: 20 }, { id: 'lost-shadow', per: { atk: 15, mag: 15 } }]);
    expect(effs('stopped-clock').filter((e) => e.kind === 'delay' || e.kind === 'buff')).toEqual([{ kind: 'delay' }, { kind: 'buff', stat: 'spd', pct: -30, turns: 2 }]);
    expect(effs('bog-leviathan').some((e) => e.kind === 'engulf')).toBe(true);
    expect(effs('white-silence').find((e) => e.kind === 'buff')).toEqual({ kind: 'buff', stat: 'spd', pct: -10, turns: 3, stackTo: -30 });
    // M8: the thresholds and beats spec §5 names.
    const below = (id: string) => (E[id].stages ?? []).map((st) => st.below);
    expect([below('silent-bell'), below('bell-warden'), below('ember-tyrant'), below('rift-maw'), below('hollow-champion')]).toEqual([[50], [50], [50], [50], [40]]);
    expect([below('mire-hydra'), below('first-lantern')]).toEqual([[66, 33], [66, 33]]);
    expect([E['false-moon'].stageEvery, E['stolen-tome'].stageEvery]).toEqual([2, 1]);
    // Every N rounds: the lead's beat and the elder's spores 3, the whale's dive 3, the sandstorm 2.
    const every = (id: string) => all(E[id]).flatMap((k) => (k.every ? [k.every] : []));
    expect([every('mirage-lead'), every('grey-elder'), every('starless-whale'), every('sandstorm-maw')]).toEqual([[3], [3], [3], [2]]);
    // The festival: a lantern a turn (the boss cap keeps three), the fire once all three are lit, at 0.6 (§0 item 19).
    const fire = all(E['forgotten-festival']).find((k) => k.needs);
    expect([fire?.needs, fire?.chance]).toEqual([{ id: 'lamp-wight', n: 3 }, 0.6]);
    expect(calls('forgotten-festival')).toEqual(['lamp-wight']);
    // The music box: two turns, 10% to its kin a turn, broken by a hit.
    const song = all(E['music-box']).find((k) => k.windupRounds);
    expect([song?.windupRounds, song?.windupAllies, song?.fragile]).toEqual([2, [{ kind: 'restore', hpPct: 10 }], true]);
    // M13: depth × 5.
    for (const id of ['market-ghost', 'vault-mimic', 'debt-collector', 'locked-vault', 'vault-dragon']) {
      expect(effs(id).filter((e) => e.kind === 'steal'), id).toEqual([{ kind: 'steal', perDepth: 5 }]);
    }
    expect(dmg('vault-dragon', 'hoardPct')).toEqual([100]);
  });
});
