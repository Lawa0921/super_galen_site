import { describe, expect, it } from 'vitest';
import { createBattle } from './battle';
import { expectedEnhance } from '../data/forge';
import { depthLevel } from './levels';
import { rarityWeights, rollTier } from './loot/drops';
import { itemLevel, rollItem } from './loot/item';
import { SLOTS } from './party';
import { mulberry32 } from './rng';
import { attackAll, kitParty, partyAt, simBattle } from './sim';
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
