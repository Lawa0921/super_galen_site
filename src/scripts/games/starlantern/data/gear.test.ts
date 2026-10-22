import { describe, it, expect } from 'vitest';
import {
  AFFIXES, AFFIX_COUNT, AFFIX_SCALE, GEAR_SLOTS, IMPLICIT_PER_ILVL, POWERS, RARITIES, RARITY_RANK, ROLL_FLOOR, SETS, SLOT_WEIGHT, SPECIALS,
  affixRange, codexName, generalLegendaries, regionSpecials,
} from './gear';
import { REGIONS } from './regions';
import type { RegionId } from './regions';
import { SKILLS } from './skills';
import { T } from './text.zh-TW';
import { PRIMARY_KEYS, SECONDARY_KEYS } from '../engine/stats';
import type { AnyStat, GearSlot } from '../engine/types';

const SLOT_OF: Record<string, GearSlot> = { W: 'weapon', O: 'offhand', H: 'head', B: 'body', G: 'hands', F: 'feet', N: 'neck', R: 'ring' };
const ALL = 'WOHBGFNR';
/** The spec's affix pool: keys -> slot letters. */
const POOL: [AnyStat[], string][] = [
  [['str', 'int', 'agi', 'wil'], ALL],
  [['atk'], 'WGR'], [['mag'], 'WONR'], [['hp'], 'OHBFN'], [['def'], 'OHBGF'], [['res'], 'OHBN'], [['spd'], 'GFN'],
  [['tp'], 'OHNR'], [['crit'], 'WGNR'], [['critDmg'], 'WGR'], [['vuln'], 'WN'], [['eliteDmg'], 'WOR'], [['multi'], 'WG'],
  [['armor'], 'OHBGF'], [['evasion'], 'HGFN'], [['block'], 'O'], [['meleeDR'], 'OB'], [['rangedDR'], 'HB'],
  [['fireRes', 'iceRes', 'thunderRes'], 'OHBFNR'], [['fireDmg', 'iceDmg', 'thunderDmg'], 'WNR'],
  [['poisonRes', 'sleepRes'], 'HFN'], [['tpRegen'], 'NR'], [['tpCost'], 'HN'], [['gauge'], 'BNR'], [['heal'], 'WON'],
  [['goldFind'], 'HNR'], [['matFind'], 'GNR'], [['expBonus'], 'NR'],
];

describe('affix pool', () => {
  it("each slot's affix pool matches the table exactly", () => {
    for (const [letter, slot] of Object.entries(SLOT_OF)) {
      const want = POOL.filter(([, slots]) => slots.includes(letter)).flatMap(([keys]) => keys).sort();
      const got = (Object.keys(AFFIXES) as AnyStat[]).filter((k) => AFFIXES[k].slots.includes(slot)).sort();
      expect(got, slot).toEqual(want);
    }
  });

  it('defines every stat exactly once', () => {
    expect(Object.keys(AFFIXES).sort()).toEqual(
      [...PRIMARY_KEYS, ...SECONDARY_KEYS, 'hp', 'tp', 'atk', 'def', 'mag', 'res', 'spd'].sort(),
    );
  });

  it('affixRange interpolates, extrapolates and scales', () => {
    expect(affixRange('atk', 1)).toEqual([1 * AFFIX_SCALE, 2 * AFFIX_SCALE]);
    const top = affixRange('atk', 50);
    expect(top[0]).toBeCloseTo(12 * AFFIX_SCALE);
    expect(top[1]).toBeCloseTo(20 * AFFIX_SCALE);
    const mid = affixRange('hp', 25.5);
    expect(mid[0]).toBeCloseTo(((5 + 60) / 2) * AFFIX_SCALE);
    const deep = affixRange('atk', 198);
    expect(Number.isFinite(deep[0]) && Number.isFinite(deep[1])).toBe(true);
    expect(deep[0]).toBeGreaterThan(top[0]);
    expect(deep[1]).toBeGreaterThan(top[1]);
  });

  it('affixRange hits lo at item level 1 and hi at 50 for every affix row', () => {
    for (const k of Object.keys(AFFIXES) as AnyStat[]) {
      const { lo, hi } = AFFIXES[k];
      const [a1, b1] = affixRange(k, 1);
      expect(a1, k).toBeCloseTo(lo[0] * AFFIX_SCALE, 10);
      expect(b1, k).toBeCloseTo(lo[1] * AFFIX_SCALE, 10);
      const [a50, b50] = affixRange(k, 50);
      expect(a50, k).toBeCloseTo(hi[0] * AFFIX_SCALE, 10);
      expect(b50, k).toBeCloseTo(hi[1] * AFFIX_SCALE, 10);
    }
  });

  it('affixRange holds an item level below 1 at level 1', () => {
    for (const k of Object.keys(AFFIXES) as AnyStat[]) {
      expect(affixRange(k, 0), k).toEqual(affixRange(k, 1));
      expect(affixRange(k, -20), k).toEqual(affixRange(k, 1));
    }
  });
});

describe('rarity and weight tables', () => {
  it('matches the spec constants', () => {
    expect(GEAR_SLOTS).toEqual(['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'neck', 'ring']);
    expect(RARITIES).toEqual(['common', 'magic', 'rare', 'legendary', 'unique', 'set']);
    expect(RARITY_RANK).toEqual({ common: 0, magic: 1, rare: 2, legendary: 3, unique: 4, set: 5 });
    expect(AFFIX_COUNT).toEqual({ magic: [1, 2], rare: [3, 4], legendary: [3, 3] });
    expect(ROLL_FLOOR).toEqual({ common: 0, magic: 0, rare: 0.25, legendary: 0.5, unique: 0.9, set: 0.75 });
    // The two loot knobs, tuned against engine/balance.test.ts tests 10–11: their values are not pinned here.
    expect(AFFIX_SCALE).toBeGreaterThan(0);
    expect(IMPLICIT_PER_ILVL).toBeGreaterThan(0);
    expect(SLOT_WEIGHT).toEqual({ weapon: 6, offhand: 5, head: 4, body: 8, hands: 4, feet: 4, neck: 3, ring: 3 });
  });
});

describe('specials', () => {
  it('each region has one legendary, one unique and a four-piece set; mainline has none', () => {
    expect(regionSpecials('mainline')).toEqual([]);
    for (const r of Object.keys(REGIONS).filter((x) => x !== 'mainline') as RegionId[]) {
      const sp = regionSpecials(r);
      expect(sp.map((s) => s.rarity).sort(), r).toEqual(['legendary', 'unique']);
      expect(sp.every((s) => s.region === r)).toBe(true);
      const sets = Object.values(SETS).filter((s) => s.region === r);
      expect(sets, r).toHaveLength(1);
      expect(sets[0].pieces).toHaveLength(4);
    }
    expect(Object.keys(SETS)).toHaveLength(6);
  });

  it('generalLegendaries lists the eight character legendaries', () => {
    const g = generalLegendaries();
    expect(g.map((s) => s.id)).toEqual(['lg-noel', 'lg-chizuru', 'lg-liz', 'lg-sylvie', 'lg-scarlet', 'lg-selene', 'lg-safira', 'lg-bobby']);
    expect(g.every((s) => s.rarity === 'legendary' && s.region === null && s.source === 'any' && s.power)).toBe(true);
  });

  it('uses the spec ids, slots and sources for regional pieces', () => {
    expect(SPECIALS['blaze-heart-sword']).toMatchObject({ rarity: 'legendary', slot: 'weapon', power: 'blaze-heart-sword' });
    expect(SPECIALS['blaze-ember-ring']).toMatchObject({ rarity: 'unique', slot: 'ring', fixed: ['fireDmg', 'fireRes', 'atk'] });
    expect(SPECIALS['shade-silent-blade'].source).toBe('elite');
    expect(SPECIALS['iron-unbroken-shield']).toMatchObject({ source: 'boss', slot: 'offhand', fixed: ['block', 'armor', 'meleeDR'] });
    expect(SPECIALS['storm-swift-boots'].fixed).toEqual(['spd', 'agi', 'evasion']);
  });

  it('power texts write a minus as the minus sign, never an ASCII hyphen', () => {
    expect(POWERS['lg-sylvie'].text).toContain('−20%');
    for (const p of Object.values(POWERS)) expect(p.text, p.id).not.toMatch(/-\d/);
  });

  it('every power names a real skill; hpCost 0 is kept', () => {
    for (const p of Object.values(POWERS)) {
      expect(SKILLS[p.skill], p.id).toBeDefined();
      expect(p.text.length).toBeGreaterThan(0);
    }
    expect(POWERS['blaze-heart-sword'].mod.hpCost).toBe(0);
    for (const s of Object.values(SPECIALS)) {
      if (s.power) expect(POWERS[s.power], s.id).toBeDefined();
      expect(Boolean(s.power) !== Boolean(s.fixed), s.id).toBe(true);
    }
  });

  it('set pieces cover four distinct slots and point back at their set', () => {
    const NOUN: Record<GearSlot, string> = { weapon: '之刃', offhand: '之盾', head: '之冠', body: '之鎧', hands: '之手甲', feet: '之靴', neck: '之鍊', ring: '之戒' };
    for (const set of Object.values(SETS)) {
      const parts = set.pieces.map((id) => SPECIALS[id]);
      expect(new Set(parts.map((p) => p.slot)).size).toBe(4);
      for (const p of parts) {
        expect(p.set).toBe(set.id);
        expect(p.rarity).toBe('set');
        expect(p.region).toBe(set.region);
        expect(p.id).toBe(`${set.id}-${p.slot}`);
        expect(p.name.endsWith(NOUN[p.slot])).toBe(true);
        expect(p.fixed!.length).toBe(p.slot === 'weapon' || p.slot === 'body' ? 3 : 2);
      }
    }
    expect(SETS['set-blaze'].pieces).toEqual(['set-blaze-weapon', 'set-blaze-body', 'set-blaze-hands', 'set-blaze-ring']);
    expect(SPECIALS['set-blaze-weapon'].fixed).toEqual(['fireDmg', 'atk', 'str']);
    expect(SPECIALS['set-blaze-ring'].fixed).toEqual(['fireDmg', 'atk']);
    expect(SETS['set-shade'].four).toEqual({ critDmg: 30, vuln: 15 });
    expect(SETS['set-iron'].two).toEqual({ meleeDR: 10 });
  });

  it('signed numbers write a minus as the minus sign, everywhere a stat change is shown', () => {
    expect([T.signed(5), T.signed(-3), T.signed(0), T.signed(-0.4)]).toEqual(['+5', '−3', '0', '−0.4']);
    expect(T.ui2.equip.delta('atk', -4)).toBe('−4');
    expect(T.ui2.equip.delta('crit', -0.44)).toBe('−0.4%');
    expect(T.ui2.equip.delta('atk', 11)).toBe('+11');
    expect(T.gear.affix('str', -1)).toBe('力量 −1');
    expect(T.gear.affix('crit', 5)).toBe('暴擊率 +5%');
  });

  it('stat names cover every stat, the base ones shared with T.stat', () => {
    expect(Object.keys(T.gear.statName).sort()).toEqual(Object.keys(AFFIXES).sort());
    for (const [k, v] of Object.entries(T.stat)) expect(T.gear.statName[k as AnyStat], k).toBe(v);
    expect(T.gear.statName.crit).toBe('暴擊率');
  });

  it('codexName names specials and sets, and falls back to the id', () => {
    expect(codexName('lg-noel')).toBe('群星之戒');
    expect(codexName('set-blaze')).toBe('焰紋套裝');
    expect(codexName('nope')).toBe('nope');
  });
});
