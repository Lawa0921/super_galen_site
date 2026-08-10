import type { FormationRow } from '../save';
import type { EngagementBand } from './martialEngagement.m49';

export type BattlefieldTerrainId = 'open-ground' | 'broken-stone-bridge' | 'ruined-battlements';
export type BattlefieldSide = 'party' | 'enemy';
export type CoverGrade = 'none' | 'partial' | 'strong';

export interface BattlefieldTerrain {
  id: BattlefieldTerrainId;
  name: string;
  description: string;
  partyRearCover: CoverGrade;
  enemyRearCover: CoverGrade;
}

export interface ProjectileCoverProfile {
  grade: CoverGrade;
  hitModifier: number;
  applies: boolean;
  message: string;
}

export const BATTLEFIELD_TERRAINS: Record<BattlefieldTerrainId, BattlefieldTerrain> = {
  'open-ground': {
    id: 'open-ground',
    name: '開闊地',
    description: '沒有足以改變投射命中的固定掩體。',
    partyRearCover: 'none',
    enemyRearCover: 'none',
  },
  'broken-stone-bridge': {
    id: 'broken-stone-bridge',
    name: '斷裂石橋',
    description: '殘破女牆與橋柱替雙方仍受前線保護的後排提供部分投射掩體；物理遠程命中 -1。前線崩潰、後排被迫上前後便失去這項保護。',
    partyRearCover: 'partial',
    enemyRearCover: 'partial',
  },
  'ruined-battlements': {
    id: 'ruined-battlements',
    name: '傾圮城垛',
    description: '守方殘牆形成更厚實的射線遮蔽；部分掩體命中 -1，強掩體命中 -2。',
    partyRearCover: 'partial',
    enemyRearCover: 'strong',
  },
};

const COVER_HIT_MODIFIER: Record<CoverGrade, number> = {
  none: 0,
  partial: -1,
  strong: -2,
};

export function battlefieldTerrain(id: BattlefieldTerrainId | undefined): BattlefieldTerrain | undefined {
  return id ? BATTLEFIELD_TERRAINS[id] : undefined;
}

export function rearCoverForSide(terrain: BattlefieldTerrain, side: BattlefieldSide): CoverGrade {
  return side === 'party' ? terrain.partyRearCover : terrain.enemyRearCover;
}

/**
 * M55 only models partial projectile cover, not solid line-of-sight blockers.
 * It therefore modifies physical ranged attacks against a protected rear rank and nothing else:
 * melee/reach are already governed by the line model, while genuine spellcraft keeps its own
 * magical geometry until a future explicit LOS system exists.
 */
export function projectileCoverProfile(
  terrain: BattlefieldTerrain | undefined,
  targetSide: BattlefieldSide,
  targetRow: FormationRow | undefined,
  engagement: EngagementBand,
  isMystic: boolean,
  frontlineAlive: boolean,
): ProjectileCoverProfile {
  if (!terrain || !frontlineAlive || targetRow !== 'back' || engagement !== 'ranged' || isMystic) {
    return { grade: 'none', hitModifier: 0, applies: false, message: '' };
  }
  const grade = rearCoverForSide(terrain, targetSide);
  const hitModifier = COVER_HIT_MODIFIER[grade];
  if (hitModifier === 0) return { grade, hitModifier: 0, applies: false, message: '' };
  const label = grade === 'strong' ? '強掩體' : '部分掩體';
  return {
    grade,
    hitModifier,
    applies: true,
    message: `${terrain.name}的${label}遮蔽投射線，物理遠程命中 ${hitModifier}。`,
  };
}
