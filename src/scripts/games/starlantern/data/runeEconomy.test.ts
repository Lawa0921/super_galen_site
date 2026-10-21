import { describe, expect, it } from 'vitest';
import { ESSENCE_IDS } from './forge';
import { RUNE_BUY, RUNE_DROP, RUNE_FUSE, RUNE_LEGENDARY, RUNE_SELL, RUNE_STOCK } from './runeEconomy';
import { PERKS } from './story/fragments';
import { STANDARD_LINEUP } from '../engine/party';
import { newGame } from '../engine/state';
import { shopPrice } from '../engine/town';

describe('the rune economy table (plan 8f Task 1)', () => {
  it("the numbers are the spec's and the plan's", () => {
    expect(RUNE_DROP).toEqual({ monster: 0.03, chest: 0.10, vault: 0.10, elite: 0.25 });
    expect(RUNE_LEGENDARY).toEqual({ elite: 0.02, boss: 0.08 });
    expect(RUNE_STOCK).toEqual(['spread', 'multistrike', 'thrift', 'extend']);
    expect(RUNE_BUY).toEqual({ common: 100 });
    expect(RUNE_SELL).toEqual({ common: 25, magic: 60, rare: 150, epic: 350, legendary: 500 });
    expect(RUNE_FUSE).toEqual({
      common: { to: 'magic', gold: 30, essence: 'essence-common' },
      magic: { to: 'rare', gold: 80, essence: 'essence-magic' },
      rare: { to: 'epic', gold: 200, essence: 'essence-rare' },
    });
  });

  it('no money loop', () => {
    const tiers = Object.keys(RUNE_FUSE) as (keyof typeof RUNE_FUSE)[];
    expect(tiers).toEqual(['common', 'magic', 'rare']);
    for (const t of tiers) {
      const f = RUNE_FUSE[t];
      expect(3 * RUNE_SELL[t] + f.gold).toBeGreaterThan(RUNE_SELL[f.to]);
      expect(ESSENCE_IDS).toContain(f.essence);
    }
    expect(RUNE_BUY.common!).toBeGreaterThan(RUNE_SELL.common);
  });
});

describe("Orik's discount and the money loop (plan 8f final review)", () => {
  it("even at Orik's discount a rune costs more than it sells for", () => {
    const s = newGame(undefined, 0, STANDARD_LINEUP);
    s.story = { ...s.story, returned: ['orik'] };
    const price = shopPrice(s, RUNE_BUY.common!);
    expect(price).toBe(Math.ceil(RUNE_BUY.common! * (100 - PERKS.shopDiscountPct) / 100));
    expect(price).toBeLessThan(RUNE_BUY.common!);
    expect(price).toBeGreaterThan(RUNE_SELL.common);
  });
});
