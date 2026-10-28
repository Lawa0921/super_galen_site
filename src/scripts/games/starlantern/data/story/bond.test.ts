import { describe, it, expect } from 'vitest';
import { MATERIALS } from '../materials';
import { ITEMS } from '../items';
import { CHARACTER_IDS } from '../characters';
import { moodsFor } from '../story.zh-TW';
import { chainLength } from './chains';
import { HOME_OWNERS } from './scenes';
import { isFragmentItem } from './fragments';
import type { MaterialDef } from '../../engine/types';
import {
  BOND_GATE, COMPANIONS, GIFTABLE, GIFT_KINDS, GIFT_MOOD, GIFT_TASTE, RIN_GIFT_MOOD_BEFORE_OATH, ROMANCEABLE, TONE_PREF,
  giftableOf, type Companion, type Tone,
} from './bond';

/** Spec §6.1: every monster, junk, rare and region material there was before the monster roster. */
const EIGHTEEN = [
  'moss', 'bat-wing', 'thorn-fang', 'crystal-shell', 'ice-crystal', 'lizard-scale', 'star-stone', 'dusk-cloth', 'old-coin',
  'ancient-gear', 'star-tear', 'king-scale', 'blaze-core', 'frost-heart', 'storm-stone', 'mire-gland', 'shade-crystal', 'iron-shard',
];

describe('bond data', () => {
  it('the eighteen are still giftable', () => {
    for (const id of EIGHTEEN) expect(GIFTABLE, id).toContain(id);
  });

  it('no trophy is giftable', () => {
    // Roster plan ruling 13: a boss's trophy is never a way to buy a bond.
    const trophies = Object.values(MATERIALS).filter((m) => m.kind === 'trophy').map((m) => m.id);
    expect(trophies.length).toBeGreaterThan(0);
    for (const id of trophies) expect(GIFTABLE, id).not.toContain(id);
  });

  it('GIFTABLE is every monster, junk, rare, region and keepsake material', () => {
    // Roster plan ruling 13: the kind alone decides, with no list of exceptions; a keepsake is giftable, a trophy is not.
    expect(GIFT_KINDS).toEqual(['monster', 'junk', 'rare', 'region', 'keepsake']);
    // Counted apart from the derivation: the eighteen, the roster's 59 signatures and its 9 keepsakes (ruling 12).
    const KEEPSAKES = ['moon-silver', 'tower-dust', 'automaton-core', 'copper-anklet', 'shrine-rope', 'ash-page', 'ashen-acorn', 'vault-coin', 'gate-splinter'];
    expect(GIFTABLE).toHaveLength(18 + 59 + 9);
    for (const id of KEEPSAKES) expect(GIFTABLE, id).toContain(id);
    expect(GIFTABLE.filter((id) => MATERIALS[id].owner && MATERIALS[id].kind === 'monster')).toHaveLength(59);
    for (const id of GIFTABLE) {
      expect(id.startsWith('essence-')).toBe(false);
      expect(ITEMS[id]).toBeUndefined();
      expect(isFragmentItem(id)).toBe(false);
    }
    for (const id of Object.keys(ITEMS)) expect(GIFTABLE).not.toContain(id);
  });

  it('GIFTABLE follows kind, not a list', () => {
    const more: Record<string, MaterialDef> = {
      ...MATERIALS,
      'fake-fang': { id: 'fake-fang', name: '假牙', price: 1, kind: 'monster' },
      'fake-essence': { id: 'fake-essence', name: '假精華', price: 1, kind: 'essence' },
    };
    const got = giftableOf(more);
    expect(got).toContain('fake-fang');
    expect(got).not.toContain('fake-essence');
    expect(giftableOf(MATERIALS)).toEqual(GIFTABLE);
  });

  it('the taste table', () => {
    // Spec §6.2, cell by cell (reviewed against the lore ledger in bond plan Task 1, spec §0 D19).
    expect(GIFT_TASTE).toEqual({
      // Roster plan L1a (ruling 13): Rin's keepsake and Selene's, declined until her pieces are all told, liked after.
      rin: { loved: ['dusk-cloth', 'thorn-fang'], liked: ['shade-crystal', 'star-tear'], declined: ['king-scale', 'tower-dust'], healed: { 'tower-dust': 'liked' } },
      selene: { loved: ['star-tear', 'crystal-shell'], liked: ['moss', 'ice-crystal', 'star-stone'], declined: ['old-coin', 'moon-silver'], healed: { 'old-coin': 'liked', 'moon-silver': 'liked' } },
      chizuru: { loved: ['old-coin', 'moss'], liked: ['star-stone', 'crystal-shell'], declined: ['ice-crystal', 'frost-heart'], healed: {} },
      safira: { loved: ['lizard-scale', 'king-scale'], liked: ['star-stone', 'bat-wing'], declined: ['blaze-core'], healed: { 'blaze-core': 'liked' } },
      sylvie: { loved: ['moss', 'thorn-fang'], liked: ['bat-wing', 'lizard-scale'], declined: ['mire-gland'], healed: { 'mire-gland': 'neutral' } },
      noel: { loved: ['storm-stone', 'crystal-shell'], liked: ['king-scale', 'star-tear'], declined: ['star-stone'], healed: { 'star-stone': 'liked' } },
      // Roster plan L2a (ruling 13): Bobby's keepsake, the fallen automaton's core, declined until her pieces are all told.
      bobby: { loved: ['ancient-gear', 'iron-shard'], liked: ['star-stone', 'crystal-shell', 'storm-stone'], declined: ['mire-gland', 'automaton-core'], healed: { 'automaton-core': 'liked' } },
      liz: { loved: ['old-coin', 'king-scale'], liked: ['star-tear', 'ancient-gear'], declined: ['shade-crystal'], healed: { 'shade-crystal': 'neutral' } },
      scarlet: { loved: ['blaze-core', 'dusk-cloth'], liked: ['king-scale', 'star-stone'], declined: ['iron-shard'], healed: { 'iron-shard': 'liked' } },
    });
    expect(Object.keys(GIFT_TASTE).sort()).toEqual([...COMPANIONS].sort());
    for (const c of COMPANIONS) {
      const t = GIFT_TASTE[c];
      expect(t.loved).toHaveLength(2);
      const cells = [...t.loved, ...t.liked, ...t.declined];
      for (const mat of [...cells, ...Object.keys(t.healed)]) expect(GIFTABLE).toContain(mat);
      expect(new Set(cells).size).toBe(cells.length);
      for (const mat of Object.keys(t.healed)) expect(t.declined).toContain(mat);
    }
  });

  it('tone preferences, romance and gates', () => {
    expect(COMPANIONS).toEqual(CHARACTER_IDS.filter((c) => c !== 'hero'));
    const by = (tone: Tone) => COMPANIONS.filter((c) => TONE_PREF[c] === tone).sort();
    expect(by('ask')).toEqual(['bobby', 'noel', 'safira']);
    expect(by('stay')).toEqual(['rin', 'scarlet', 'sylvie']);
    expect(by('promise')).toEqual(['chizuru', 'liz', 'selene']);
    expect([...ROMANCEABLE].sort()).toEqual([...COMPANIONS].sort());
    expect(ROMANCEABLE).toHaveLength(9);
    expect(ROMANCEABLE as string[]).not.toContain('hero');
    // Bond plan ruling 9.
    // review 5 P1: a 心契 that stands on her homecoming (the shrine, the sapling, the hat) waits for it to be seen
    const home = ['chizuru', 'safira', 'sylvie', 'liz'];
    expect(home).toEqual(HOME_OWNERS);
    const companion = (c: Exclude<Companion, 'rin'>) => ({
      1: { tier: 1, pieces: { [c]: 1 } }, 2: { tier: 2, pieces: { [c]: 3 } }, 3: { tier: 3, pieces: { [c]: 4 } },
      4: { tier: 4, full: c, ...(home.includes(c) ? { seen: [`home:${c}`] } : {}) },
    });
    expect(BOND_GATE).toEqual({
      rin: { 1: { tier: 1, pieces: { rin: 2 }, beforeChoice: true }, 2: { tier: 2, pieces: { rin: 4 }, beforeChoice: true }, 3: { tier: 3, oath: true }, 4: { tier: 4, oath: true } },
      noel: companion('noel'), chizuru: companion('chizuru'), liz: companion('liz'), sylvie: companion('sylvie'),
      scarlet: companion('scarlet'), selene: companion('selene'), safira: companion('safira'), bobby: companion('bobby'),
    });
    for (const c of COMPANIONS) {
      for (const step of [1, 2, 3, 4] as const) {
        expect(BOND_GATE[c][step].tier).toBe(step);
        for (const [who, n] of Object.entries(BOND_GATE[c][step].pieces ?? {})) {
          expect(who).toBe(c);
          expect(n).toBeLessThanOrEqual(chainLength(c));
        }
      }
    }
  });

  it('gift faces belong to her', () => {
    const loved: Partial<Record<Companion, string>> = { rin: 'averted', noel: 'smug', bobby: 'excited', liz: 'scheming', scarlet: 'serious' };
    for (const c of COMPANIONS) {
      expect(GIFT_MOOD[c]).toEqual({ loved: loved[c] ?? 'smile', liked: 'smile', neutral: 'normal', declined: 'sad' });
      for (const mood of Object.values(GIFT_MOOD[c])) expect(moodsFor(c)).toContain(mood);
    }
    expect(RIN_GIFT_MOOD_BEFORE_OATH).toBe('normal');
    expect(moodsFor('rin')).toContain(RIN_GIFT_MOOD_BEFORE_OATH);
  });
});
