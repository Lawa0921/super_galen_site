import { describe, expect, it } from 'vitest';
import { createBattle } from './battle';
import { expectedEnhance } from '../data/forge';
import { depthLevel } from './levels';
import { rarityWeights, rollTier } from './loot/drops';
import { itemLevel, rollItem } from './loot/item';
import { LEGACY_LINEUP, MAX_LEVEL, SLOTS, STANDARD_LINEUP, rowOfCell, statsOf } from './party';
import { mulberry32 } from './rng';
import { KIT_ORDER, attackAll, kitParty, partyAt, setSimTrace, simBattle, winRate } from './sim';
import { heroTalents, heroTree } from './progression';
import { fullParty } from './testing';
import { CHARACTER_IDS } from '../data/characters';
import type { CharacterId, GearSlot } from './types';
import { expectedMemories } from './story/expect';
import { chainLength } from '../data/story/chains';
import { HERO_BUILDS, type HeroBuild } from '../data/hero';
import { EQUIPMENT, WEAPON_KINDS, weaponKindOf } from '../data/equipment';

/** The eight members as they were ordered before Rin: the order kitParty drew their gear in. */
const LEGACY_KIT_ORDER: CharacterId[] = ['noel', 'chizuru', 'liz', 'sylvie', 'scarlet', 'selene', 'safira', 'bobby'];

describe('sim: the attack-only player (全員攻擊)', () => {
  it('orders every living member to attack the first living enemy', () => {
    const s = createBattle({ party: partyAt(1), enemyIds: ['slime', 'bat'], boss: false, inventory: {}, revealed: {} });
    s.enemies[0].alive = false;
    const acts = attackAll(s);
    const alive = s.party.filter((c) => c.alive).map((c) => c.key);
    expect(Object.keys(acts).sort()).toEqual([...alive].sort());
    for (const a of Object.values(acts)) expect(a).toEqual({ kind: 'attack', target: s.enemies[1].key });
  });

  it('simBattle with the attack-only player fights differently from the skill player', () => {
    const a = simBattle(partyAt(1), ['wolf', 'bat'], false, 7919, undefined, undefined, 'attack');
    const b = simBattle(partyAt(1), ['wolf', 'bat'], false, 7919);
    expect([a.rounds, a.hpLoss]).not.toEqual([b.rounds, b.hpLoss]);
  });
});

describe('kitParty draw order', () => {
  it("new characters never shift the old members' kit draws", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const rng = mulberry32(seed);
      const ilvl = itemLevel(4, 'monster');
      const weights = rarityWeights('monster', depthLevel(4), 'plain');
      let uid = 1;
      const expected = {} as Record<CharacterId, Record<string, unknown>>;
      for (const id of LEGACY_KIT_ORDER) {
        expected[id] = {};
        for (const s of SLOTS) {
          const slot: GearSlot = s === 'ring1' || s === 'ring2' ? 'ring' : s;
          const tier = rollTier(rng, weights);
          expected[id][s] = { ...rollItem(rng, { uid: uid++, ilvl, rarity: tier === 'legendaryTier' ? 'rare' : tier, slot }), enhance: expectedEnhance(4) };
        }
      }
      const kit = kitParty(depthLevel(4), 4, seed, undefined, expectedEnhance(4));
      for (const id of LEGACY_KIT_ORDER) expect(kit.roster[id].equip, `${id} seed ${seed}`).toEqual(expected[id]);
    }
  });
});

describe('lineups and hero builds', () => {
  it('the default simulation party is the standard five', () => {
    expect(partyAt(6).recruited).toEqual(STANDARD_LINEUP);
    expect(partyAt(6, { ids: LEGACY_LINEUP }).recruited).toEqual(LEGACY_LINEUP);
    expect(fullParty().recruited).toEqual(STANDARD_LINEUP);
  });
  it('a lineup and a hero build are honoured', () => {
    const p = partyAt(10, { ids: STANDARD_LINEUP, heroBuild: 'mage' });
    expect(p.recruited).toEqual(STANDARD_LINEUP);
    expect(rowOfCell(p.grid.indexOf('hero'))).toBe('back');
    expect(p.roster.hero.level).toBe(10);
    expect(p.roster.hero.tree).toEqual(heroTree(10, 'mage', 0));
    expect(p.roster.hero.talents).toEqual(heroTalents(10, 'mage'));
  });
  it('heroRow puts the hero in the asked row', () => {
    for (const row of ['front', 'middle', 'back'] as const) {
      expect(rowOfCell(partyAt(5, { ids: STANDARD_LINEUP, heroRow: row }).grid.indexOf('hero')), row).toBe(row);
    }
  });
  it("memories open the hero's abyss capstones and nobody else's tree changes", () => {
    const abyss = (memories: number) => Object.keys(partyAt(50, { memories }).roster.hero.tree).filter((k) => k.startsWith('abyss-'));
    expect(abyss(0)).toEqual([]);
    expect(abyss(10).length).toBeGreaterThan(0);
    expect(partyAt(50, { memories: 10 }).roster.noel.tree).toEqual(partyAt(50).roster.noel.tree);
  });
  it("partyAt puts the lineup's memories on the hero", () => {
    const p = partyAt(50, { memories: 6 });
    expect(p.roster.hero.memories).toBe(6);
    expect(p.roster.hero.tree).toEqual(heroTree(50, 'balanced', 6));
    expect(p.roster.rin.memories ?? 0).toBe(0);
    expect(partyAt(50).roster.hero.memories ?? 0).toBe(0);
  });
  it('a forced abyss bonus reaches the fight, and none leaves it as it was', () => {
    const fight = (abyss?: number) => simBattle(partyAt(50, { memories: 10 }), ['lanterneater'], true, 7919, { depth: 12, region: 'mainline' }, undefined, 'skill', abyss);
    expect(fight(0)).toEqual(fight());
    expect(fight(100)).not.toEqual(fight(0));
    const rate = (abyss?: number) => winRate(50, [['lanterneater']], true, 3, { depth: 12, region: 'mainline' }, undefined, undefined, 'skill', 0, { memories: 10, abyss });
    expect(rate(100)).not.toEqual(rate(0));
  });
  it('kitParty arms the hero for his build', () => {
    expect(kitParty(10, 3, 5, undefined, 0, { heroBuild: 'mage' }).roster.hero.equip.weapon?.base).toBe('wooden-staff');
    expect(kitParty(10, 3, 5, undefined, 0, { heroBuild: 'tank' }).roster.hero.equip.weapon?.base).toBe('thorn-spear');
  });
  it('the hero is drawn last, after every companion, so his gear moves nobody', () => {
    expect(KIT_ORDER[KIT_ORDER.length - 1]).toBe('hero');
    expect(KIT_ORDER.slice(0, LEGACY_KIT_ORDER.length)).toEqual(LEGACY_KIT_ORDER);
    expect([...KIT_ORDER].sort()).toEqual([...CHARACTER_IDS].sort());
  });
  it("the hero's fixed weapon moves nobody else's kit", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const a = kitParty(10, 3, seed, undefined, 0, { heroBuild: 'mage' });
      const b = kitParty(10, 3, seed);
      for (const id of KIT_ORDER) if (id !== 'hero') expect(a.roster[id].equip, `${id} seed ${seed}`).toEqual(b.roster[id].equip);
    }
  });
});

describe('the memory expectation and armed casters (plan 6b Task 20a)', () => {
  it('partyAt applies the expectation for its depth', () => {
    const lv = depthLevel(10);
    const e = expectedMemories(10, STANDARD_LINEUP);
    const p = partyAt(lv, { expect: true }, 10);
    for (const id of STANDARD_LINEUP) {
      expect(p.roster[id].memories, id).toBe(e[id].memories);
      expect(p.roster[id].absorbed ?? [], id).toEqual(e[id].absorbed);
    }
    expect(e.rin.memories).toBeGreaterThan(0);
    expect(p.roster.hero.tree).toEqual(heroTree(lv, 'balanced', e.hero.memories));
    // The memories and shards really reach the member's stats.
    expect(statsOf(p.roster.rin)).not.toEqual(statsOf(partyAt(lv, {}, 10).roster.rin));
    // Rin's oath is set once she holds her whole chain.
    const deep = expectedMemories(30, STANDARD_LINEUP);
    expect(partyAt(MAX_LEVEL, { expect: true }, 30).roster.rin.oath ?? false).toBe(deep.rin.oath);
    // The lineup's memories still set the hero's count; the shards stay.
    const ten = partyAt(lv, { expect: true, memories: 10 }, 10);
    expect(ten.roster.hero.memories).toBe(10);
    expect(ten.roster.hero.absorbed ?? []).toEqual(e.hero.absorbed);
    // Each fight's party follows its own depth: kitParty and winRate pass theirs.
    const k = kitParty(lv, 10, 1, undefined, 0, { expect: true });
    for (const id of STANDARD_LINEUP) expect(k.roster[id].memories, `kit ${id}`).toBe(e[id].memories);
    const shallow = partyAt(lv, { expect: true }, 1);
    expect(shallow.roster.rin.memories).toBe(expectedMemories(1, STANDARD_LINEUP).rin.memories);
    expect(shallow.roster.rin.memories).toBeLessThan(e.rin.memories);
    // Without the flag, nobody but the hero carries a count.
    expect(partyAt(lv, {}, 10).roster.rin.memories).toBeUndefined();
  });

  it('partyAt stores the clamped count, never the raw one', () => {
    expect(partyAt(50, { memories: 99 }).roster.hero.memories).toBe(chainLength('hero'));
    expect(partyAt(50, { memories: 2.7 }).roster.hero.memories).toBe(2);
    expect(partyAt(50, { memories: -3 }).roster.hero.memories).toBe(0);
    expect(partyAt(50, { memories: Number.NaN }).roster.hero.memories).toBe(0);
    expect(partyAt(50, { memories: 99, expect: true }, 30).roster.hero.memories).toBe(chainLength('hero'));
  });

  it('armHero arms only a caster', () => {
    let casters = 0, others = 0;
    for (const build of Object.keys(HERO_BUILDS) as HeroBuild[]) {
      const base = HERO_BUILDS[build].weapon;
      const caster = WEAPON_KINDS[weaponKindOf({ base })!].scale === 'mag';
      const hero = partyAt(10, { heroBuild: build, armHero: true }).roster.hero;
      if (caster) {
        casters++;
        expect(hero.equip.weapon, build).toEqual({ uid: 0, base, rarity: 'common', ilvl: EQUIPMENT[base].ilvl, affixes: [], enhance: 0 });
        expect(statsOf(hero).mag, build).toBeGreaterThan(statsOf(partyAt(10, { heroBuild: build }).roster.hero).mag);
      } else {
        others++;
        expect(hero.equip.weapon, build).toBeUndefined();
      }
      expect(partyAt(10, { heroBuild: build }).roster.hero.equip.weapon, `${build} unarmed`).toBeUndefined();
    }
    expect(casters).toBeGreaterThan(0);
    expect(others).toBeGreaterThan(0);
    expect(partyAt(10, { heroBuild: 'mage', armHero: true }).roster.noel.equip).toEqual({});
  });

  it('simBattle hands bossPower to the fight', () => {
    const party = partyAt(30, {}, 8);
    const fight = (bossPower?: number) => simBattle(party, ['lanterneater'], true, 7919, { depth: 8, region: 'mainline' }, undefined, 'skill', undefined, bossPower);
    expect(fight(1)).toEqual(fight());
    expect(fight(2)).not.toEqual(fight(1));
  });
});

describe('the sim reads the mechanics (plan 8c)', () => {
  it('castPower reads the cast as she would cast it now', async () => {
    const { castPower } = await import('./sim');
    const { makeBattle, makeCombatant } = await import('./testing');
    const { SKILLS } = await import('../data/skills');
    const { HEAT } = await import('./mechanics/heat');
    const noel = (heat: number) => makeCombatant({ key: 'noel', side: 'party', defId: 'noel', mech: { kind: 'heat', heat } });
    const s = makeBattle([noel(3)], []);
    expect(castPower(s, noel(0), SKILLS['fire-star'])).toBe(140);
    expect(castPower(s, noel(3), SKILLS['fire-star'])).toBe(Math.round((140 * (100 + 3 * HEAT.pctPer)) / 100));
  });
});

describe('a lineup with runes (plan 8e Task 8)', () => {
  it('a lineup can wear a fixed rune set', () => {
    const spread = { id: 'spread', tier: 'magic' } as const;
    const p = partyAt(35, { runes: { noel: { 'fire-star': [spread] } } });
    expect(p.roster.noel.sockets).toEqual({ 'fire-star': [spread] });
    for (const id of Object.keys(p.roster) as CharacterId[]) if (id !== 'noel') expect(p.roster[id].sockets, id).toBeUndefined();
    // Without runes, the very same party.
    expect(JSON.stringify(partyAt(35, {}))).toBe(JSON.stringify(partyAt(35)));
    // The same seed plays the same fight twice.
    const run = () => {
      const seen: string[] = [];
      setSimTrace({ round: (acts, _b, after) => { seen.push(JSON.stringify([acts, after.log])); }, end: (r) => { seen.push(JSON.stringify(r)); } });
      try { simBattle(partyAt(35, { runes: { noel: { 'fire-star': [spread] } } }), ['slime', 'slime', 'slime'], false, 7919); } finally { setSimTrace(null); }
      return seen;
    };
    const first = run();
    expect(first.length).toBeGreaterThan(1);
    expect(run()).toEqual(first);
    // A test hook never quietly mends a set: a second slot at Lv10, or a skill she does not know, throws.
    expect(() => partyAt(10, { runes: { noel: { 'fire-star': [spread, { id: 'ignite', tier: 'magic' }] } } })).toThrow();
    expect(() => partyAt(35, { runes: { noel: { moonlight: [spread] } } })).toThrow();
  });
});
