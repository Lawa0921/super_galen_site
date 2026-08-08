import type { CombatantBase, Element, Move } from '../combat';

export interface ProtectionProfile {
  source: string;
  /**
   * Incoming damage multiplier by element. 1 = neutral, below 1 = protection,
   * above 1 = an exposed damage channel. Runtime resolution clamps rules to
   * [0.5, 1.5] so future content cannot accidentally create immunity or lethal
   * amplification through a typo.
   */
  multipliers: Partial<Record<Element, number>>;
}

export interface ProtectionResolution {
  originalAmount: number;
  amount: number;
  configuredMultiplier: number;
  effectiveMultiplier: number;
  armorPenetration: number;
  mitigated: boolean;
  exposed: boolean;
  bypassed: boolean;
  message: string;
}

const ELEMENT_TEXT: Record<Element, string> = {
  slash: '斬擊',
  pierce: '穿刺',
  blunt: '鈍擊',
  fire: '火焰',
  frost: '寒霜',
  holy: '神聖',
};

const ELEMENT_ORDER: Element[] = ['slash', 'pierce', 'blunt', 'fire', 'frost', 'holy'];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * M48 deliberately opts individual moves into armor penetration instead of
 * treating all piercing damage as automatic armor bypass. This preserves the
 * difference between an ordinary arrow and the ranger's explicitly named
 * 穿甲箭.
 */
export function moveArmorPenetration(move: Pick<Move, 'id'>): number {
  return move.id === 'piercing-arrow' ? 1 : 0;
}

export function resolveProtectionDamage(
  amount: number,
  profile: ProtectionProfile | null | undefined,
  element: Element | undefined,
  armorPenetration = 0,
): ProtectionResolution {
  const originalAmount = Math.max(0, amount);
  if (!profile || !element || originalAmount <= 0) {
    return {
      originalAmount,
      amount: originalAmount,
      configuredMultiplier: 1,
      effectiveMultiplier: 1,
      armorPenetration: 0,
      mitigated: false,
      exposed: false,
      bypassed: false,
      message: '',
    };
  }

  const configuredMultiplier = clamp(profile.multipliers[element] ?? 1, 0.5, 1.5);
  const penetration = clamp(armorPenetration, 0, 1);
  // Penetration only erodes beneficial armor mitigation. It never removes an
  // armor weakness and therefore cannot turn an exposed target into a safer one.
  const effectiveMultiplier = configuredMultiplier < 1
    ? 1 - (1 - configuredMultiplier) * (1 - penetration)
    : configuredMultiplier;
  const resolved = effectiveMultiplier === 1
    ? originalAmount
    : Math.max(1, Math.round(originalAmount * effectiveMultiplier));
  const mitigated = resolved < originalAmount;
  const exposed = resolved > originalAmount;
  const bypassed = configuredMultiplier < 1 && effectiveMultiplier > configuredMultiplier;

  let message = '';
  const elementText = ELEMENT_TEXT[element];
  if (mitigated) {
    const reduced = originalAmount - resolved;
    message = `${profile.source}卸去了 ${reduced} 點${elementText}傷害${bypassed ? '，但穿甲效果削弱了這層防護' : ''}。`;
  } else if (exposed) {
    message = `${profile.source}不利於承受${elementText}衝擊，額外承受 ${resolved - originalAmount} 點傷害。`;
  } else if (bypassed) {
    message = `${profile.source}原可削減${elementText}傷害，但穿甲效果繞過了這層防護。`;
  }

  return {
    originalAmount,
    amount: resolved,
    configuredMultiplier,
    effectiveMultiplier,
    armorPenetration: penetration,
    mitigated,
    exposed,
    bypassed,
    message,
  };
}

type ArmoryRuntimeCarrier = CombatantBase & {
  armoryProfile?: {
    armorProtection?: ProtectionProfile | null;
  };
};

export function protectionProfileForCombatant(unit: CombatantBase): ProtectionProfile | null {
  return (unit as ArmoryRuntimeCarrier).armoryProfile?.armorProtection ?? null;
}

export function resolveCombatArmorProtection(
  amount: number,
  target: CombatantBase,
  move: Move,
): ProtectionResolution {
  return resolveProtectionDamage(
    amount,
    protectionProfileForCombatant(target),
    move.element,
    moveArmorPenetration(move),
  );
}

export function protectionProfileText(profile: ProtectionProfile | null | undefined): string {
  if (!profile) return '無特殊受擊輪廓';
  const entries = ELEMENT_ORDER
    .map((element) => {
      const multiplier = profile.multipliers[element];
      if (multiplier === undefined || multiplier === 1) return null;
      const percent = Math.round(Math.abs(multiplier - 1) * 100);
      const sign = multiplier < 1 ? '-' : '+';
      return `${ELEMENT_TEXT[element]} ${sign}${percent}%`;
    })
    .filter((entry): entry is string => !!entry);
  return entries.length > 0 ? `${profile.source}｜${entries.join('｜')}` : `${profile.source}｜無特殊修正`;
}
