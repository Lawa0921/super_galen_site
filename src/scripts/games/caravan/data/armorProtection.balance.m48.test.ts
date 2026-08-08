import { describe, expect, it } from 'vitest';
import { createProtagonist, type CompanionRecord } from '../save';
import { armoryProfile } from './armory';
import { resolveProtectionDamage } from './armorProtection.m48';
import { memberFromRecord } from './jobs';

const ARMORS = [
  'ridgeleather-vest',
  'saltforged-mail',
  'ashveil-robe',
  'brinewarded-vestment',
  'pilgrim-warded-cloak',
] as const;
const ELEMENTS = ['slash', 'pierce', 'blunt', 'fire', 'frost', 'holy'] as const;

type ArmorId = (typeof ARMORS)[number];
type Element = (typeof ELEMENTS)[number];

interface Probe {
  armor: ArmorId;
  defense: number;
  hp: number;
  dex: number;
  mystic: number;
  burden: number;
  overload: number;
  warningCount: number;
  incoming: Record<Element, number>;
}

function record(job: CompanionRecord['job']): CompanionRecord {
  const member = createProtagonist({ job });
  member.id = job;
  member.name = job;
  member.level = 4;
  member.stats = job === 'swordsman'
    ? { str: 17, dex: 13, int: 9, cha: 11, con: 17 }
    : job === 'ranger'
      ? { str: 11, dex: 18, int: 11, cha: 10, con: 13 }
      : job === 'mage'
        ? { str: 8, dex: 13, int: 19, cha: 11, con: 11 }
        : { str: 12, dex: 10, int: 13, cha: 18, con: 15 };
  member.maxHp = job === 'swordsman' ? 32 : job === 'cleric' ? 28 : job === 'ranger' ? 25 : 22;
  member.skills = { martial: 3, scouting: 3, lore: 3, negotiation: 3, survival: 3 };
  return member;
}

function probe(job: CompanionRecord['job'], armor: ArmorId): Probe {
  const member = record(job);
  member.equipment.armor = armor;
  const profile = armoryProfile(member);
  const runtime = memberFromRecord(member);
  const incoming = Object.fromEntries(
    ELEMENTS.map((element) => [element, resolveProtectionDamage(20, profile.armorProtection, element).amount]),
  ) as Record<Element, number>;
  return {
    armor,
    defense: runtime.defense,
    hp: runtime.maxHp,
    dex: runtime.stats.dex,
    mystic: job === 'mage' ? profile.mysticCapacity.mana : job === 'cleric' ? profile.mysticCapacity.favor : 0,
    burden: profile.burden,
    overload: profile.overload,
    warningCount: profile.warnings.filter((warning) => !warning.startsWith('武器熟練')).length,
    incoming,
  };
}

function probes(job: CompanionRecord['job']): Probe[] {
  return ARMORS.map((armor) => probe(job, armor));
}

function dominates(a: Probe, b: Probe): boolean {
  const noWorse = a.defense >= b.defense
    && a.hp >= b.hp
    && a.dex >= b.dex
    && a.mystic >= b.mystic
    && a.burden <= b.burden
    && a.overload <= b.overload
    && a.warningCount <= b.warningCount
    && ELEMENTS.every((element) => a.incoming[element] <= b.incoming[element]);
  const strictlyBetter = a.defense > b.defense
    || a.hp > b.hp
    || a.dex > b.dex
    || a.mystic > b.mystic
    || a.burden < b.burden
    || a.overload < b.overload
    || a.warningCount < b.warningCount
    || ELEMENTS.some((element) => a.incoming[element] < b.incoming[element]);
  return noWorse && strictlyBetter;
}

function frontier(entries: Probe[]): Probe[] {
  return entries.filter((candidate) => !entries.some((other) => other !== candidate && dominates(other, candidate)));
}

function compact(entry: Probe): string {
  return `${entry.armor}{DEF${entry.defense},HP${entry.hp},DEX${entry.dex},MYS${entry.mystic},W${entry.burden},O${entry.overload},!${entry.warningCount},S${entry.incoming.slash},P${entry.incoming.pierce},B${entry.incoming.blunt},F${entry.incoming.fire},I${entry.incoming.frost},H${entry.incoming.holy}}`;
}

function canonicalProtection(armor: ArmorId) {
  const job: CompanionRecord['job'] = armor === 'saltforged-mail'
    ? 'swordsman'
    : armor === 'ashveil-robe'
      ? 'mage'
      : armor === 'brinewarded-vestment'
        ? 'cleric'
        : 'ranger';
  return armoryProfile(Object.assign(record(job), { equipment: { weapon: null, armor, trinket: null } })).armorProtection;
}

function canonicalDamage(armor: ArmorId, element: Element): number {
  return resolveProtectionDamage(20, canonicalProtection(armor), element).amount;
}

describe('M48 player-perspective multidimensional armor review', () => {
  for (const job of ['swordsman', 'ranger', 'mage', 'cleric'] as const) {
    it(`${job} keeps several non-dominated armor choices after damage profiles matter`, () => {
      const entries = probes(job);
      const efficient = frontier(entries);
      console.log(`[M48 ARMOR FRONTIER] ${job}: ${efficient.map(compact).join(' | ')}`);
      expect(entries).toHaveLength(5);
      expect(efficient.length).toBeGreaterThanOrEqual(3);
      expect(entries.every((entry) => entry.defense > 0 && entry.hp > 0 && entry.dex > 0)).toBe(true);
      expect(entries.some((entry) => entry.burden === Math.min(...entries.map((candidate) => candidate.burden)))).toBe(true);
      expect(entries.some((entry) => entry.defense === Math.max(...entries.map((candidate) => candidate.defense)))).toBe(true);
      expect(entries.some((candidate) => entries.every((other) => other === candidate || dominates(candidate, other)))).toBe(false);
    });
  }

  it('makes different armor families win against different battlefield threats', () => {
    const matrix = Object.fromEntries(ARMORS.map((armor) => [
      armor,
      Object.fromEntries(ELEMENTS.map((element) => [element, canonicalDamage(armor, element)])),
    ]));
    console.log('[M48 THREAT MATRIX]', matrix);

    expect(canonicalDamage('saltforged-mail', 'slash')).toBeLessThan(canonicalDamage('ridgeleather-vest', 'slash'));
    expect(canonicalDamage('saltforged-mail', 'blunt')).toBeGreaterThan(canonicalDamage('ridgeleather-vest', 'blunt'));
    expect(canonicalDamage('ashveil-robe', 'fire')).toBe(Math.min(...ARMORS.map((armor) => canonicalDamage(armor, 'fire'))));
    expect(canonicalDamage('brinewarded-vestment', 'holy')).toBe(Math.min(...ARMORS.map((armor) => canonicalDamage(armor, 'holy'))));
    expect(canonicalDamage('pilgrim-warded-cloak', 'fire')).toBeLessThan(canonicalDamage('ridgeleather-vest', 'fire'));

    const winners = new Set<ArmorId>();
    for (const element of ['slash', 'blunt', 'fire', 'holy'] as const) {
      const best = Math.min(...ARMORS.map((armor) => canonicalDamage(armor, element)));
      for (const armor of ARMORS) if (canonicalDamage(armor, element) === best) winners.add(armor);
    }
    expect(winners.size).toBeGreaterThanOrEqual(4);
  });

  it('keeps steel, mobility, arcana and theurgy on separate build axes instead of one best armor', () => {
    const steel = probe('swordsman', 'saltforged-mail');
    const mobile = probe('ranger', 'ridgeleather-vest');
    const arcane = probe('mage', 'ashveil-robe');
    const sacred = probe('cleric', 'brinewarded-vestment');
    const warded = probe('ranger', 'pilgrim-warded-cloak');
    console.log(`[M48 BUILD AXES] steel=${compact(steel)} | mobile=${compact(mobile)} | arcane=${compact(arcane)} | sacred=${compact(sacred)} | warded=${compact(warded)}`);

    expect(steel.incoming.slash).toBeLessThan(mobile.incoming.slash);
    expect(steel.burden).toBeGreaterThan(mobile.burden);
    expect(mobile.dex).toBeGreaterThan(steel.dex);
    expect(arcane.mystic).toBeGreaterThan(0);
    expect(sacred.mystic).toBeGreaterThan(0);
    expect(arcane.incoming.fire).toBeLessThan(steel.incoming.fire);
    expect(sacred.incoming.holy).toBeLessThan(warded.incoming.holy);
  });

  it('gives penetration a tactical answer to mail without turning every piercing attack into armor bypass', () => {
    const mail = canonicalProtection('saltforged-mail')!;
    const ordinaryArrow = resolveProtectionDamage(20, mail, 'pierce', 0);
    const piercingArrow = resolveProtectionDamage(20, mail, 'pierce', 1);
    console.log(`[M48 PENETRATION] ordinary=${ordinaryArrow.amount} piercing-arrow=${piercingArrow.amount}`);
    expect(ordinaryArrow.amount).toBeLessThan(20);
    expect(piercingArrow.amount).toBe(20);
    expect(piercingArrow.amount).toBeGreaterThan(ordinaryArrow.amount);
  });

  it('never grants immunity and never amplifies a single armor channel beyond the safety cap', () => {
    for (const armor of ARMORS) {
      const profile = canonicalProtection(armor)!;
      for (const element of ELEMENTS) {
        const amount = resolveProtectionDamage(20, profile, element).amount;
        expect(amount).toBeGreaterThanOrEqual(10);
        expect(amount).toBeLessThanOrEqual(30);
      }
    }
  });
});
