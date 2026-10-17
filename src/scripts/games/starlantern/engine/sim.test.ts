import { describe, expect, it } from 'vitest';
import { createBattle } from './battle';
import { expectedEnhance } from '../data/forge';
import { depthLevel } from './levels';
import { rarityWeights, rollTier } from './loot/drops';
import { itemLevel, rollItem } from './loot/item';
import { LEGACY_LINEUP, SLOTS, STANDARD_LINEUP, rowOfCell } from './party';
import { mulberry32 } from './rng';
import { KIT_ORDER, attackAll, kitParty, partyAt, simBattle, winRate } from './sim';
import { heroTalents, heroTree } from './progression';
import { fullParty } from './testing';
import { CHARACTER_IDS } from '../data/characters';
import type { CharacterId, GearSlot } from './types';

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
