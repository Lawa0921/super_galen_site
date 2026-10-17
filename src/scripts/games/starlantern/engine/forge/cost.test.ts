import { describe, it, expect } from 'vitest';
import { newGame } from '../state';
import { plainItem } from '../testing';
import { ENHANCE_COST } from '../../data/forge';
import { addCost, canPay, findItem, forgeRng, pay, FORGE_SALT } from './cost';
import { mix } from '../loot/drops';
import { mulberry32 } from '../rng';
import { STARTING_RECRUITS } from '../party';

const cost = ENHANCE_COST[0];
const matId = Object.keys(cost.mats)[0];
const need = cost.mats[matId];

describe('canPay', () => {
  it('checks gold first, then each material', () => {
    const s = { ...newGame(), gold: cost.gold - 1, inventory: {} };
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
    const s = { ...newGame(), gold: cost.gold + 5, inventory: { [matId]: need }, sold: { [matId]: 7 } };
    pay(s, cost);
    expect(s.gold).toBe(5);
    expect(s.inventory[matId]).toBeUndefined();
    expect(s.sold).toEqual({ [matId]: 7 });
  });
});

describe('pay without canPay', () => {
  it('refuses a cost the state cannot meet and leaves the state as it was', () => {
    const poor = { ...newGame(), gold: cost.gold - 1, inventory: { [matId]: need } };
    expect(() => pay(poor, cost)).toThrow();
    expect(poor.gold).toBe(cost.gold - 1);
    expect(poor.inventory).toEqual({ [matId]: need });
    const short = { ...newGame(), gold: cost.gold, inventory: { [matId]: need - 1 } };
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
    const s = newGame();
    const who = STARTING_RECRUITS[0];
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
    const s = newGame();
    s.forgeDraws = 4;
    s.nextUid = 9;
    const r = forgeRng(s);
    expect(s.forgeDraws).toBe(4);
    const a = r();
    expect(s.forgeDraws).toBe(5);
    expect(a).toBe(mulberry32(mix(4 ^ FORGE_SALT, 9))());
    const b = r();
    expect(s.forgeDraws).toBe(6);
    expect(b).toBe(mulberry32(mix(5 ^ FORGE_SALT, 9))());
    const t = newGame();
    t.forgeDraws = 4;
    t.nextUid = 9;
    expect(forgeRng(t)()).toBe(a);
  });

  it('draws differ when only nextUid differs, so two saves at the same forgeDraws do not share a roll', () => {
    const at = (nextUid: number) => { const s = newGame(); s.forgeDraws = 4; s.nextUid = nextUid; return forgeRng(s)(); };
    expect(at(10)).toBe(mulberry32(mix(4 ^ FORGE_SALT, 10))());
    expect(at(10)).not.toBe(at(9));
    expect(new Set([9, 10, 11, 12, 13].map(at)).size).toBe(5);
  });
});
