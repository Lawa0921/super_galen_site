import { describe, expect, it } from 'vitest';
import { createProtagonist, type CompanionRecord } from '../save';
import { memberFromRecord } from './jobs';
import { armoryProfile } from './armory';

const WEAPONS = ['salt-crystal-blade', 'ridge-mist-bow', 'ghostflame-staff', 'brine-blessed-mace'] as const;
const ARMORS = ['ridgeleather-vest', 'saltforged-mail', 'ashveil-robe', 'brinewarded-vestment'] as const;

interface Probe {
  key: string;
  defense: number;
  hp: number;
  dex: number;
  offense: number;
  mystic: number;
  burden: number;
  overload: number;
  warnings: number;
}

function record(job: CompanionRecord['job']): CompanionRecord {
  const member = createProtagonist({ job });
  member.id = job;
  member.name = job;
  member.level = 4;
  member.stats = job === 'swordsman'
    ? { str: 17, dex: 13, int: 9, cha: 11, con: 16 }
    : job === 'ranger'
      ? { str: 11, dex: 18, int: 11, cha: 10, con: 13 }
      : job === 'mage'
        ? { str: 8, dex: 13, int: 19, cha: 11, con: 11 }
        : { str: 12, dex: 10, int: 13, cha: 18, con: 15 };
  member.maxHp = job === 'swordsman' ? 32 : job === 'cleric' ? 28 : job === 'ranger' ? 25 : 22;
  member.skills = { martial: 3, scouting: 3, lore: 3, negotiation: 3, survival: 3 };
  return member;
}

function probes(job: CompanionRecord['job']): Probe[] {
  const result: Probe[] = [];
  for (const weapon of WEAPONS) {
    for (const armor of ARMORS) {
      const member = record(job);
      member.equipment = { weapon, armor, trinket: null };
      const profile = armoryProfile(member);
      const combatant = memberFromRecord(member);
      const weaponMove = combatant.moves[0];
      const relevantMystic = job === 'mage' ? profile.mysticCapacity.mana : job === 'cleric' ? profile.mysticCapacity.favor : 0;
      result.push({
        key: `${weapon}/${armor}`,
        defense: combatant.defense,
        hp: combatant.maxHp,
        dex: combatant.stats.dex,
        offense: (weaponMove.hitBonus ?? 0) + (combatant.damageBonus ?? 0),
        mystic: relevantMystic,
        burden: profile.burden,
        overload: profile.overload,
        warnings: profile.warnings.filter((warning) => !warning.startsWith('武器熟練')).length,
      });
    }
  }
  return result;
}

function dominates(a: Probe, b: Probe): boolean {
  const noWorse = a.defense >= b.defense
    && a.hp >= b.hp
    && a.dex >= b.dex
    && a.offense >= b.offense
    && a.mystic >= b.mystic
    && a.burden <= b.burden
    && a.overload <= b.overload
    && a.warnings <= b.warnings;
  const strictlyBetter = a.defense > b.defense
    || a.hp > b.hp
    || a.dex > b.dex
    || a.offense > b.offense
    || a.mystic > b.mystic
    || a.burden < b.burden
    || a.overload < b.overload
    || a.warnings < b.warnings;
  return noWorse && strictlyBetter;
}

function frontier(entries: Probe[]): Probe[] {
  return entries.filter((candidate) => !entries.some((other) => other !== candidate && dominates(other, candidate)));
}

describe('M43 player-perspective multidimensional adversarial review', () => {
  for (const job of ['swordsman', 'ranger', 'mage', 'cleric'] as const) {
    it(`${job} keeps several non-dominated armory identities`, () => {
      const entries = probes(job);
      const efficient = frontier(entries);
      expect(entries).toHaveLength(16);
      expect(efficient.length).toBeGreaterThanOrEqual(3);
      expect(entries.some((entry) => entry.warnings === 0 && entry.overload === 0)).toBe(true);
      expect(entries.some((entry) => entry.defense === Math.max(...entries.map((probe) => probe.defense)))).toBe(true);
      expect(entries.some((entry) => entry.burden === Math.min(...entries.map((probe) => probe.burden)))).toBe(true);
    });
  }

  it('prevents one universal loadout from dominating all four professions', () => {
    const frontiers = new Map<string, number>();
    for (const job of ['swordsman', 'ranger', 'mage', 'cleric'] as const) {
      for (const entry of frontier(probes(job))) frontiers.set(entry.key, (frontiers.get(entry.key) ?? 0) + 1);
    }
    expect(Math.max(...frontiers.values())).toBeLessThan(4);
  });

  it('makes steel, mobility, arcana, and theurgy win different dimensions', () => {
    const swordsman = probes('swordsman');
    const ranger = probes('ranger');
    const mage = probes('mage');
    const cleric = probes('cleric');
    const heavySteel = swordsman.find((entry) => entry.key === 'salt-crystal-blade/saltforged-mail')!;
    const mobileArcher = ranger.find((entry) => entry.key === 'ridge-mist-bow/ridgeleather-vest')!;
    const arcaneFocus = mage.find((entry) => entry.key === 'ghostflame-staff/ashveil-robe')!;
    const sacredFocus = cleric.find((entry) => entry.key === 'brine-blessed-mace/brinewarded-vestment')!;
    expect(heavySteel.defense).toBeGreaterThan(arcaneFocus.defense);
    expect(mobileArcher.dex).toBeGreaterThan(heavySteel.dex);
    expect(arcaneFocus.mystic).toBeGreaterThan(0);
    expect(sacredFocus.mystic).toBeGreaterThan(0);
    expect(new Set([heavySteel.key, mobileArcher.key, arcaneFocus.key, sacredFocus.key]).size).toBe(4);
  });

  it('keeps strained cross-class builds playable but never strictly superior', () => {
    for (const job of ['swordsman', 'ranger', 'mage', 'cleric'] as const) {
      const entries = probes(job);
      const strained = entries.filter((entry) => entry.warnings > 0);
      expect(strained.length).toBeGreaterThan(0);
      expect(strained.every((entry) => entry.defense > 0 && entry.hp > 0 && entry.dex > 0)).toBe(true);
      expect(strained.some((entry) => entries.some((other) => dominates(other, entry)))).toBe(true);
    }
  });
});
