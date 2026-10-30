import { describe, it, expect } from 'vitest';
import { newGame } from '../state';
import { plainItem } from '../testing';
import { ENHANCE_COST } from '../../data/forge';
import { addCost, canPay, findItem, forgeRng, pay, FORGE_SALT } from './cost';
import { mix } from '../loot/drops';
import { mulberry32 } from '../rng';
import { LEGACY_LINEUP } from '../party';
import { GATHER_PIN_QTY, SPOT_OF, SPOT_REGIONS } from '../../data/gather';
import { REGIONS } from '../../data/regions';
import { REROLL } from '../../data/forge';
import { rerollCost, swapPool } from './cost';
import type { ItemInstance } from '../types';

const cost = ENHANCE_COST[0];
const matId = Object.keys(cost.mats)[0];
const need = cost.mats[matId];

describe('canPay', () => {
  it('checks gold first, then each material', () => {
    const s = { ...newGame(undefined, 0, LEGACY_LINEUP), gold: cost.gold - 1, inventory: {} };
    expect(canPay(s, cost)).toBe('gold');
    s.gold = cost.gold;
    expect(canPay(s, cost)).toBe('mats');
    s.inventory = { [matId]: need - 1 };
    expect(canPay(s, cost)).toBe('mats');
    s.inventory = { [matId]: need };
    expect(canPay(s, cost)).toBeNull();
  });
});

describe('pay', () => {
  it('takes gold and materials and never touches the sold tally', () => {
    const s = { ...newGame(undefined, 0, LEGACY_LINEUP), gold: cost.gold + 5, inventory: { [matId]: need }, sold: { [matId]: 7 } };
    pay(s, cost);
    expect(s.gold).toBe(5);
    expect(s.inventory[matId]).toBeUndefined();
    expect(s.sold).toEqual({ [matId]: 7 });
  });
});

describe('pay without canPay', () => {
  it('refuses a cost the state cannot meet and leaves the state as it was', () => {
    const poor = { ...newGame(undefined, 0, LEGACY_LINEUP), gold: cost.gold - 1, inventory: { [matId]: need } };
    expect(() => pay(poor, cost)).toThrow();
    expect(poor.gold).toBe(cost.gold - 1);
    expect(poor.inventory).toEqual({ [matId]: need });
    const short = { ...newGame(undefined, 0, LEGACY_LINEUP), gold: cost.gold, inventory: { [matId]: need - 1 } };
    expect(() => pay(short, cost)).toThrow();
    expect(short.gold).toBe(cost.gold);
    expect(short.inventory).toEqual({ [matId]: need - 1 });
  });
});

describe('addCost', () => {
  it('sums gold and merges materials, adding shared ones, without touching either input', () => {
    const a = { gold: 10, mats: { moss: 2, 'bat-wing': 1 } };
    const b = { gold: 5, mats: { moss: 1, 'star-tear': 1 } };
    expect(addCost(a, b)).toEqual({ gold: 15, mats: { moss: 3, 'bat-wing': 1, 'star-tear': 1 } });
    expect(a).toEqual({ gold: 10, mats: { moss: 2, 'bat-wing': 1 } });
    expect(b).toEqual({ gold: 5, mats: { moss: 1, 'star-tear': 1 } });
    expect(addCost(a, { gold: 0, mats: {} })).toEqual(a);
  });
});

describe('findItem', () => {
  it('finds bag items and worn items with their wearer and slot', () => {
    const s = newGame(undefined, 0, LEGACY_LINEUP);
    const who = LEGACY_LINEUP[0];
    const bagIt = plainItem('moss-charm', 1);
    const worn = plainItem('moss-charm', 2);
    s.bag = [bagIt];
    s.party.roster[who].equip.ring1 = worn;
    expect(findItem(s, 1)).toEqual({ it: bagIt });
    expect(findItem(s, 2)).toEqual({ it: worn, member: who, slot: 'ring1' });
    expect(findItem(s, 99)).toBeNull();
  });
});

describe('forgeRng', () => {
  it('advances forgeDraws once per draw, not on creation, and is reproducible from the state', () => {
    const s = newGame(undefined, 0, LEGACY_LINEUP);
    s.forgeDraws = 4;
    s.forgeSalt = 9;
    const r = forgeRng(s);
    expect(s.forgeDraws).toBe(4);
    const a = r();
    expect(s.forgeDraws).toBe(5);
    expect(a).toBe(mulberry32(mix(4 ^ FORGE_SALT, 9))());
    const b = r();
    expect(s.forgeDraws).toBe(6);
    expect(b).toBe(mulberry32(mix(5 ^ FORGE_SALT, 9))());
    const t = newGame(undefined, 0, LEGACY_LINEUP);
    t.forgeDraws = 4;
    t.forgeSalt = 9;
    expect(forgeRng(t)()).toBe(a);
  });

  it('draws differ when only the per-game salt differs, so two games at the same forgeDraws do not share a roll', () => {
    const at = (salt: number) => { const s = newGame(undefined, 0, LEGACY_LINEUP); s.forgeDraws = 4; s.forgeSalt = salt; return forgeRng(s)(); };
    expect(at(10)).toBe(mulberry32(mix(4 ^ FORGE_SALT, 10))());
    expect(at(10)).not.toBe(at(9));
    expect(new Set([9, 10, 11, 12, 13].map(at)).size).toBe(5);
  });

  it('ignores nextUid and the rest of the state the player can change cheaply (shop buys mint uids)', () => {
    const at = (nextUid: number, gold: number) => { const s = newGame(undefined, 0, LEGACY_LINEUP); s.forgeDraws = 4; s.forgeSalt = 9; s.nextUid = nextUid; s.gold = gold; return forgeRng(s)(); };
    expect(new Set([at(1, 0), at(2, 0), at(500, 10), at(1e6, 99999)]).size).toBe(1);
  });
});

describe('a spot pins its land (gathering plan Task A4)', () => {
  const gear = (): ItemInstance => ({ ...plainItem('moss-charm', 1), rarity: 'rare', ilvl: 20, affixes: [{ key: 'str', value: 5 }] });
  it('a spot pins its land', () => {
    for (const r of SPOT_REGIONS) {
      const spot = SPOT_OF[r], mat = REGIONS[r].material!;
      const bySpot = rerollCost(gear(), { swap: true, mat: spot });
      const byMat = rerollCost(gear(), { swap: true, mat });
      expect(bySpot.mats[spot], spot).toBe(GATHER_PIN_QTY);
      expect(bySpot.mats[mat], spot).toBeUndefined();
      expect(byMat.mats[mat], mat).toBe(REROLL.regionQty);
      // gold and the essence as the region material's pin
      const { [spot]: _s, ...restSpot } = bySpot.mats;
      const { [mat]: _m, ...restMat } = byMat.mats;
      expect({ gold: bySpot.gold, mats: restSpot }, spot).toEqual({ gold: byMat.gold, mats: restMat });
      // the region's own group
      expect(swapPool(gear(), 0, spot), spot).toEqual(swapPool(gear(), 0, mat));
    }
  });
});
