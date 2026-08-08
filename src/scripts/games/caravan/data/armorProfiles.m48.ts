import type { Element, Move } from '../combat';

export type ArmorProfileId = 'light' | 'mail' | 'robe' | 'vestment';

export interface ArmorProtection {
  id: ArmorProfileId;
  label: string;
  physical: Partial<Record<Element, number>>;
  magical: Partial<Record<Element, number>>;
}

export interface ArmorMitigation {
  baseReduction: number;
  reduction: number;
  bypassed: number;
  magical: boolean;
  label: string;
}

const PROFILES: Record<ArmorProfileId, ArmorProtection> = {
  light: {
    id: 'light',
    label: '輕甲',
    physical: { slash: 1 },
    magical: {},
  },
  mail: {
    id: 'mail',
    label: '鎖甲',
    physical: { slash: 2, pierce: 1 },
    magical: {},
  },
  robe: {
    id: 'robe',
    label: '法袍',
    physical: {},
    magical: { fire: 1, frost: 1 },
  },
  vestment: {
    id: 'vestment',
    label: '聖衣',
    physical: {},
    magical: { holy: 2 },
  },
};

const PHYSICAL_ELEMENTS = new Set<Element>(['slash', 'pierce', 'blunt']);

export function armorProtectionForDiscipline(
  discipline: ArmorProfileId | null | undefined,
): ArmorProtection | undefined {
  if (!discipline) return undefined;
  const profile = PROFILES[discipline];
  return {
    ...profile,
    physical: { ...profile.physical },
    magical: { ...profile.magical },
  };
}

export function armorProtectionText(protection: ArmorProtection | undefined): string {
  if (!protection) return '無材質減傷';
  const physical = (['slash', 'pierce', 'blunt'] as Element[])
    .map((element) => [element, protection.physical[element] ?? 0] as const)
    .filter(([, value]) => value > 0)
    .map(([element, value]) => `${element === 'slash' ? '斬' : element === 'pierce' ? '刺' : '鈍'} -${value}`);
  const magical = (['fire', 'frost', 'holy'] as Element[])
    .map((element) => [element, protection.magical[element] ?? 0] as const)
    .filter(([, value]) => value > 0)
    .map(([element, value]) => `${element === 'fire' ? '火' : element === 'frost' ? '霜' : '聖'} -${value}`);
  return [...physical, ...magical].join('｜') || '無材質減傷';
}

/**
 * M48 armor is deliberately flat and readable. Physical armor only answers mundane slash/pierce/blunt;
 * a spell that happens to use the blunt element (for example Gravity Crush) is still magical and therefore
 * cannot be trivialized by mail. Armor-piercing applies only to physical protection.
 */
export function resolveArmorMitigation(
  protection: ArmorProtection | undefined,
  move: Move,
  magical: boolean,
): ArmorMitigation {
  const element = move.element;
  if (!protection || !element) {
    return { baseReduction: 0, reduction: 0, bypassed: 0, magical, label: protection?.label ?? '' };
  }
  const baseReduction = magical
    ? protection.magical[element] ?? 0
    : PHYSICAL_ELEMENTS.has(element)
      ? protection.physical[element] ?? 0
      : 0;
  const penetration = magical ? 0 : Math.max(0, move.armorPiercing ?? 0);
  const reduction = Math.max(0, baseReduction - penetration);
  return {
    baseReduction,
    reduction,
    bypassed: baseReduction - reduction,
    magical,
    label: protection.label,
  };
}

// M48 validation trigger: keep gameplay gates running against the current master implementation.
