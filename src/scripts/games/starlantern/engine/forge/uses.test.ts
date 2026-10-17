import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../../data/materials';
import { ITEMS } from '../../data/items';
import { EQUIPMENT } from '../../data/equipment';
import { GEAR_SLOTS, SETS } from '../../data/gear';
import { REGIONS } from '../../data/regions';
import { T } from '../../data/text.zh-TW';
import { RARE_MATERIALS } from '../loot/drops';
import { materialUses, type MaterialUse } from './uses';

const ids = (kind: string) => Object.values(MATERIALS).filter((m) => m.kind === kind).map((m) => m.id).sort();

describe('material uses', () => {
  it('every material but junk has a use, and junk has none', () => {
    for (const m of Object.values(MATERIALS)) expect(m.kind === 'junk', m.id).toBe(materialUses(m.id).length === 0);
  });

  it('kinds match the hooks from 5a', () => {
    expect(ids('rare')).toEqual([...RARE_MATERIALS].sort());
    expect(ids('region')).toEqual(Object.values(REGIONS).map((r) => r.material).filter((m): m is string => m !== null).sort());
    expect(MATERIALS['old-coin'].kind).toBe('junk');
  });

  it('moss is used for potions, antidotes and two base recipes', () => {
    const u = materialUses('moss');
    const at = (x: object) => u.findIndex((v) => JSON.stringify(v) === JSON.stringify(x));
    const order = [
      { kind: 'consumable', item: 'potion' }, { kind: 'consumable', item: 'antidote' },
      { kind: 'base', slot: 'hands' }, { kind: 'base', slot: 'neck' },
    ].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('star-tear is used for legendary rerolls and every set', () => {
    const u = materialUses('star-tear');
    expect(u.filter((x) => x.kind === 'set')).toHaveLength(6);
    expect(u).toContainEqual({ kind: 'legendaryReroll' });
  });

  it('the unlock tally shows as a use', () => {
    expect(materialUses('thorn-fang')).toContainEqual({ kind: 'unlock', base: 'thorn-gauntlets' });
  });

  it('lists a use only once', () => {
    for (const m of Object.keys(MATERIALS)) {
      const u = materialUses(m).map((x) => JSON.stringify(x));
      expect(new Set(u).size).toBe(u.length);
    }
  });

  /** A use's words, or null when the use names something that does not exist (the words would fall back to a raw id). */
  const words = (u: MaterialUse): string | null => {
    const known = u.kind === 'consumable' ? !!ITEMS[u.item]
      : u.kind === 'set' ? !!SETS[u.set]
        : u.kind === 'unlock' ? !!EQUIPMENT[u.base]
          : u.kind === 'base' ? GEAR_SLOTS.includes(u.slot)
            : u.kind === 'regionReroll' ? !!REGIONS[u.region] && T.forge.group[u.region] !== undefined
              : true;
    const long = T.forge.use(u), short = T.forge.useShort(u);
    if (!known || !long || !short || /undefined|NaN/.test(long + short)) return null;
    return long;
  };

  it('the words check refuses a use that names an unknown id', () => {
    expect(words({ kind: 'consumable', item: 'no-such-item' })).toBeNull();
    expect(words({ kind: 'set', set: 'no-such-set' })).toBeNull();
    expect(words({ kind: 'unlock', base: 'no-such-base' })).toBeNull();
    expect(words({ kind: 'base', slot: 'tail' as never })).toBeNull();
    expect(words({ kind: 'consumable', item: 'potion' })).toBe(ITEMS.potion.name);
  });

  it('every use has words', () => {
    for (const m of Object.keys(MATERIALS)) for (const u of materialUses(m)) expect(words(u), JSON.stringify(u)).not.toBeNull();
  });
});
