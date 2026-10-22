import { describe, expect, it } from 'vitest';
import { createMatch, buyWeapon } from './engine';
import { armoryOffer, ARMORY, UTILITY } from './armory';

describe('armory purchase presentation', () => {
  it('distinguishes equipped, affordable and missing funds without changing the economy', () => {
    const match = createMatch('attack');
    expect(armoryOffer(match, 'pistol')).toMatchObject({ enabled: false, state: 'equipped', label: '已裝備' });
    expect(armoryOffer(match, 'rifle')).toMatchObject({ enabled: true, state: 'available', balance: 400 });
    expect(armoryOffer(match, 'sniper')).toMatchObject({ enabled: false, state: 'unaffordable', label: '還差 $1,100' });
    buyWeapon(match, 0, 'rifle');
    expect(armoryOffer(match, 'rifle').state).toBe('equipped');
    expect(armoryOffer(match, 'armor').label).toBe('還差 $250');
    expect(armoryOffer(match, 'pistol')).toMatchObject({ enabled: true, balance: 400 });
  });
  it('matches armor and round/death boundaries and exposes no refund', () => {
    const match = createMatch('attack');
    match.actors[0].money = 650;
    expect(armoryOffer(match, 'armor')).toMatchObject({ enabled: true, balance: 0 });
    buyWeapon(match, 0, 'armor');
    expect(armoryOffer(match, 'armor').state).toBe('equipped');
    match.phase = 'live';
    expect(armoryOffer(match, 'pistol')).toMatchObject({ enabled: false, state: 'closed' });
    match.phase = 'buy'; match.actors[0].hp = 0;
    expect(armoryOffer(match, 'smg').state).toBe('closed');
    expect(ARMORY.map(item => item.id)).toEqual(['pistol','smg','rifle','sniper']);
  });
});

describe('utility offers', () => {
  it('lists the three CS2 grenades with price-based offers', () => {
    const match = createMatch('attack');
    expect(UTILITY.map(item => item.id)).toEqual(['he', 'flash', 'smoke']);
    expect(armoryOffer(match, 'flash')).toMatchObject({ enabled: true, state: 'available', label: '購買後剩 $2,200' });
    match.actors[0].money = 250;
    expect(armoryOffer(match, 'smoke')).toMatchObject({ enabled: false, state: 'unaffordable', label: '還差 $50' });
  });
  it('shows carried count and refuses beyond the per-type limit', () => {
    const match = createMatch('attack');
    buyWeapon(match, 0, 'flash');
    expect(armoryOffer(match, 'flash')).toMatchObject({ enabled: true, state: 'available', carried: 1 });
    buyWeapon(match, 0, 'flash');
    expect(armoryOffer(match, 'flash')).toMatchObject({ enabled: false, state: 'full', label: '已達上限 2', carried: 2 });
    match.phase = 'live';
    expect(armoryOffer(match, 'he').state).toBe('closed');
  });
});
