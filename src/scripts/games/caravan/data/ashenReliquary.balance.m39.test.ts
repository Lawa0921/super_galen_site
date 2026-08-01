import { describe, expect, it } from 'vitest';
import { newGame, type SaveData } from '../save';
import { ashenReliquaryState, resolveAshenReliquary } from './ashenReliquary';

function save(): SaveData {
  const data = newGame(3910, { job: 'swordsman', trait: 'brawny', allocation: { str: 3 } });
  data.reputation = 50;
  data.gold = 1000;
  data.inventory = {
    ...data.inventory,
    torch: 10,
    herb: 10,
    bandage: 10,
    'dried-rations': 20,
    'tattered-map': 10,
    'spice-pouch': 10,
    'war-tonic': 10,
    ore: 10,
  };
  data.protagonist.stats = { str: 30, dex: 30, int: 30, cha: 30, con: 30 };
  data.protagonist.skills = { martial: 5, scouting: 5, lore: 5, negotiation: 5, survival: 5 };
  data.protagonist.growth = { potential: { str: 5, dex: 5, int: 5, cha: 5, con: 5 } } as never;
  return data;
}

describe('M39 reliquary balance guardrails', () => {
  it('keeps every route cost and threshold non-negative', () => {
    const data = save();
    const routes = ashenReliquaryState(data).stages.flatMap((stage) => stage.routes);
    expect(routes.every((route) =>
      route.threshold > 0
      && route.goldCost >= 0
      && route.reputationCost >= 0
      && Object.values(route.inventoryCost).every((count) => count >= 0)
    )).toBe(true);
  });

  it('makes every final ending carry both an advantage and a persistent cost', () => {
    const endings = [
      ['seal-reliquary', 'sealed'],
      ['claim-ember', 'claimed'],
      ['shatter-vessel', 'shattered'],
    ] as const;
    for (const [route, ending] of endings) {
      const data = save();
      resolveAshenReliquary(data, 1, 'read-runes');
      resolveAshenReliquary(data, 2, 'decode-lament');
      resolveAshenReliquary(data, 3, route);
      expect(data.flags[`ashen-reliquary:ending:${ending}`]).toBe(true);
      if (ending === 'sealed') expect(data.flags['relic:saint-ember']).toBe(true);
      if (ending === 'claimed') {
        expect(data.flags['relic:ember-heart']).toBe(true);
        expect(data.flags['curse:dragon-ember']).toBe(true);
      }
      if (ending === 'shattered') expect(data.flags['relic:dragonbone-shard']).toBe(true);
    }
  });
});
